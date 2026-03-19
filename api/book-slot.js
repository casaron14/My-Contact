/**
 * Booking Slot Management API
 *
 * Thin orchestration layer — all slot persistence is handled by SlotProvider.
 * Switch between "database" and "calendar" backends via SLOT_PROVIDER env var.
 *
 * Environment Variables:
 *   SLOT_PROVIDER                - 'database' (default) | 'calendar'
 *   SUPABASE_URL                 - required when SLOT_PROVIDER=database
 *   SUPABASE_SERVICE_ROLE_KEY    - required when SLOT_PROVIDER=database
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL - required when SLOT_PROVIDER=calendar
 *   GOOGLE_PRIVATE_KEY           - required when SLOT_PROVIDER=calendar
 */

'use strict';

const config = require('../config');
const { logger } = require('../lib/middleware');
const { ApiError } = require('../lib/security');
const { getSlotProvider } = require('../lib/providers/SlotProvider');

/**
 * Returns the UTC offset in milliseconds for a given timezone at a specific moment.
 * Positive = east of UTC  (e.g. Africa/Nairobi UTC+3 → +10_800_000 ms)
 *
 * This avoids hardcoding the numeric offset and handles hypothetical DST changes.
 */
function getTzOffsetMs(timezone, date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = fmt.formatToParts(date).reduce((a, { type, value }) => ((a[type] = value), a), {});
  let h = parseInt(p.hour, 10);
  if (h === 24) h = 0; // midnight edge case
  const localAsUtcMs = Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second);
  return localAsUtcMs - date.getTime();
}

/**
 * Generate time slots based on booking configuration.
 * Rules:
 *   - Monday – Friday only (weekends excluded)
 *   - Each slot is slotDurationMin (25 min) long
 *   - slotBreakMin (5 min) separates consecutive slots  → stride = 30 min
 *   - Window: slotStartHour (16:00) – slotEndHour (18:00) in BOOKING_TIMEZONE
 *   - Slots: 16:00, 16:30, 17:00, 17:30 EAT (4 per weekday)
 *
 * All times are generated in the configured booking timezone (Africa/Nairobi)
 * and stored as UTC, so they display correctly in any browser timezone.
 *
 * @param {number} daysAhead - Number of calendar days to look ahead
 * @returns {Date[]}
 */
function generateTimeSlots(daysAhead) {
  const slots = [];
  const timezone = config?.app?.timezone || 'Africa/Nairobi';

  const slotStartHour   = config?.booking?.slotStartHour   || 16;
  const slotEndHour     = config?.booking?.slotEndHour     || 18;
  const slotDurationMin = config?.booking?.slotDurationMin || 25;
  const slotBreakMin    = config?.booking?.slotBreakMin    || 5;
  const stride          = slotDurationMin + slotBreakMin; // 30 min between slot starts

  const startMinutes = slotStartHour * 60;
  const endMinutes   = slotEndHour   * 60;
  const now          = new Date();
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
    // Derive the calendar date for this offset in the booking timezone.
    // Adding integer 24-hour periods to 'now' and then using toLocaleDateString
    // works correctly for Africa/Nairobi which has no DST.
    const probeDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dateStr   = probeDate.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD

    // Skip weekends in the booking timezone
    const weekday = probeDate.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
    if (weekday === 'Sat' || weekday === 'Sun') continue;

    // Flat-minute loop: stop before a slot would run past slotEndHour
    for (let min = startMinutes; min + slotDurationMin <= endMinutes; min += stride) {
      const h = Math.floor(min / 60);
      const m = min % 60;

      // Build the correct UTC instant for h:m in the booking timezone.
      //
      // Step 1: Construct a "proxy UTC" Date by treating the local clock time
      //         as if it were UTC (e.g. 16:00 local → 16:00Z).
      const hStr  = String(h).padStart(2, '0');
      const mStr  = String(m).padStart(2, '0');
      const proxyUtc = new Date(`${dateStr}T${hStr}:${mStr}:00Z`);

      // Step 2: Find the timezone's actual UTC offset at that proxy moment.
      //         Then subtract it to get the real UTC instant.
      //         Example for Africa/Nairobi (UTC+3):
      //           proxyUtc = 16:00Z, offset = +3h  →  slotTime = 13:00Z (= 16:00 EAT) ✓
      const offsetMs = getTzOffsetMs(timezone, proxyUtc);
      const slotTime = new Date(proxyUtc.getTime() - offsetMs);

      // Only offer slots that are at least 2 hours away (same-day booking allowed)
      if (slotTime.getTime() - now.getTime() >= TWO_HOURS_MS) {
        slots.push(slotTime);
      }
    }
  }

  return slots;
}

/**
 * Check whether a specific time slot is still available.
 * Delegates to the configured SlotProvider (database or calendar).
 *
 * @param {string} slotDateTime - ISO datetime string
 * @returns {Promise<boolean>}
 */
async function checkSlotAvailability(slotDateTime) {
  return getSlotProvider().checkSlotAvailability(slotDateTime);
}

/**
 * Reserve a booked slot in the backing store (database or calendar).
 * Non-blocking: errors are caught and logged so the booking still succeeds.
 *
 * @param {Object} bookingData
 * @param {string} bookingData.slotDateTime - ISO datetime of the chosen slot
 * @param {string} bookingId - Application-level booking reference ID
 * @returns {Promise<{slotId: string|null, eventLink: string|null, isDevelopment: boolean}>}
 */
async function recordBookedSlot(bookingData, bookingId) {
  try {
    logger.info('📅 Recording booked slot', { provider: config.slotProvider, bookingId });
    const result = await getSlotProvider().bookSlot(
      bookingData.slotDateTime,
      bookingId,
      bookingData
    );

    if (!result.isDevelopment) {
      logger.info('✅ Slot reserved', { slotId: result.id, bookingId });
    }

    return {
      slotId: result.id || null,
      eventLink: result.eventLink || null,
      isDevelopment: result.isDevelopment || false,
    };
  } catch (error) {
    // Re-throw conflict errors (409) so the API layer can return the right status
    if (error.statusCode === 409) throw error;

    // All other slot-store failures are non-blocking — the booking in Sheets is the source of truth
    logger.warn('⚠️  Slot reservation failed (non-blocking)', {
      error: error.message,
      bookingId,
    });
    return { slotId: null, eventLink: null, isDevelopment: false, error: error.message };
  }
}

/**
 * Return available time slots by querying the configured SlotProvider.
 *
 * @param {Object} options
 * @param {number} [options.daysAhead]
 * @returns {Promise<Array<{dateTime: string, available: boolean, isDevelopment: boolean}>>}
 */
async function getAvailableSlots(options = {}) {
  const daysAhead = options.daysAhead || config.booking.daysAvailable || 3;

  try {
    logger.info('📅 Fetching available slots', { provider: config.slotProvider, daysAhead });

    const potentialSlots = generateTimeSlots(daysAhead);
    if (potentialSlots.length === 0) {
      logger.warn('⚠️ No potential booking slots generated. Check booking config.');
      return [];
    }

    const timeMin = potentialSlots[0].toISOString();
    const timeMax = new Date(
      potentialSlots[potentialSlots.length - 1].getTime() +
      config.booking.slotDurationMin * 60 * 1000
    ).toISOString();

    const busyDatetimes = await getSlotProvider().getBusySlotDatetimes(timeMin, timeMax);
    const busySet = new Set(busyDatetimes.map(d => new Date(d).toISOString()));

    const result = potentialSlots.map(slot => ({
      dateTime: slot.toISOString(),
      available: !busySet.has(slot.toISOString()),
      isDevelopment: false,
    }));

    const availableCount = result.filter(s => s.available).length;
    logger.info(`✅ Found ${availableCount}/${potentialSlots.length} available slots.`);

    return result;

  } catch (error) {
    logger.error('❌ Fatal error in getAvailableSlots', { error: error.message });
    throw new ApiError(`Failed to get available slots: ${error.message}`, 500);
  }
}

module.exports = {
  checkSlotAvailability,
  recordBookedSlot,
  getAvailableSlots,
  generateTimeSlots,
};
