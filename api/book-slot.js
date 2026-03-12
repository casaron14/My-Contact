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
 * Generate time slots based on booking configuration.
 * Rules:
 *   - Monday – Friday only (weekends excluded)
 *   - Each slot is slotDurationMin (25 min) long
 *   - slotBreakMin (5 min) separates consecutive slots  → stride = 30 min
 *   - Window: slotStartHour (16:00) – slotEndHour (18:00)
 *   - Slots: 16:00, 16:30, 17:00, 17:30 (4 per weekday)
 *
 * @param {number} daysAhead - Number of calendar days to look ahead
 * @returns {Date[]}
 */
function generateTimeSlots(daysAhead) {
  const slots = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const slotStartHour   = config?.booking?.slotStartHour   || 16;
  const slotEndHour     = config?.booking?.slotEndHour     || 18;
  const slotDurationMin = config?.booking?.slotDurationMin || 25;
  const slotBreakMin    = config?.booking?.slotBreakMin    || 5;
  const stride          = slotDurationMin + slotBreakMin; // 30 min between slot starts

  const startMinutes = slotStartHour * 60;
  const endMinutes   = slotEndHour   * 60;
  const now = new Date();

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
    const day = new Date(today);
    day.setDate(day.getDate() + dayOffset);

    // Weekdays only — skip Saturday (6) and Sunday (0)
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;

    // Flat-minute loop: stop before a slot would run past slotEndHour
    for (let min = startMinutes; min + slotDurationMin <= endMinutes; min += stride) {
      const slotTime = new Date(day);
      slotTime.setHours(Math.floor(min / 60), min % 60, 0, 0);
      // Only offer slots that are at least 2 hours away (allows same-day booking)
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
