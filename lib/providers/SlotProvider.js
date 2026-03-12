/**
 * Slot Provider Abstraction
 *
 * Controls how availability is tracked and slots are reserved.
 * Two implementations:
 *   - DatabaseSlotProvider  → stores booked slots in Supabase (default)
 *   - CalendarSlotProvider  → uses Google Calendar (legacy / rollback option)
 *
 * Switch with env var:  SLOT_PROVIDER=database  (or "calendar")
 */

'use strict';

const { google } = require('googleapis');
const config = require('../../config');
const { logger } = require('../middleware');
const { ApiError } = require('../security');

// ============================================================
// Abstract Interface
// ============================================================

class SlotProvider {
  /**
   * Return true if the given slot datetime is still free.
   * @param {string} slotDateTime - ISO datetime string
   * @returns {Promise<boolean>}
   */
  async checkSlotAvailability(slotDateTime) {
    throw new Error('checkSlotAvailability not implemented');
  }

  /**
   * Persist a booked slot so future availability checks exclude it.
   * @param {string} slotDateTime - ISO datetime string
   * @param {string} bookingId    - Application booking reference ID
   * @param {Object} bookingData  - Full booking payload (used by Calendar impl)
   * @returns {Promise<{id: string, eventLink?: string, isDevelopment: boolean}>}
   */
  async bookSlot(slotDateTime, bookingId, bookingData = {}) {
    throw new Error('bookSlot not implemented');
  }

  /**
   * Return all booked slot datetimes within the given window.
   * @param {string} timeMin - ISO datetime string (inclusive)
   * @param {string} timeMax - ISO datetime string (exclusive)
   * @returns {Promise<string[]>} Array of ISO/UTC datetime strings that are taken
   */
  async getBusySlotDatetimes(timeMin, timeMax) {
    throw new Error('getBusySlotDatetimes not implemented');
  }
}

// ============================================================
// Database (Supabase) Implementation
// ============================================================

class DatabaseSlotProvider extends SlotProvider {
  constructor() {
    super();
    this.client = this._createClient();
    // In-memory slot store for dev mode (no Supabase credentials).
    // Lives on the singleton instance for the lifetime of the server process,
    // giving real double-booking protection during local development.
    // key: ISO datetime string  →  value: bookingId
    this._devStore = new Map();
  }

  _createClient() {
    const { url, serviceRoleKey } = config.supabase;

    if (!url || !serviceRoleKey) {
      if (config.isProduction()) {
        throw new Error(
          'Supabase credentials not configured. ' +
          'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.'
        );
      }
      logger.warn('⚠️  Supabase not configured — dev mode (all slots appear available)');
      return null;
    }

    // Lazy-require so the package is only needed when this provider is active
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, serviceRoleKey);
  }

  async checkSlotAvailability(slotDateTime) {
    if (!this.client) {
      return !this._devStore.has(new Date(slotDateTime).toISOString());
    }

    const { data, error } = await this.client
      .from('booked_slots')
      .select('id')
      .eq('slot_datetime', new Date(slotDateTime).toISOString())
      .limit(1);

    if (error) {
      logger.error('❌ DB availability check failed', { error: error.message });
      return true; // fail open — don't silently block the user
    }

    return data.length === 0;
  }

  async bookSlot(slotDateTime, bookingId, bookingData = {}) {
    if (!this.client) {
      const iso = new Date(slotDateTime).toISOString();
      if (this._devStore.has(iso)) {
        throw new ApiError('This time slot has just been taken. Please choose another.', 409);
      }
      this._devStore.set(iso, bookingId);
      logger.info('📅 [DEV MODE] Slot reserved in memory', { slotDateTime: iso, bookingId });
      return { id: `dev-${Date.now()}`, isDevelopment: true };
    }

    // 1. Lock the slot — the UNIQUE constraint on slot_datetime is the hard guard
    //    against concurrent double-bookings.
    const { data, error } = await this.client
      .from('booked_slots')
      .insert([{
        booking_id: bookingId,
        slot_datetime: new Date(slotDateTime).toISOString(),
      }])
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') { // unique_violation — slot taken by a concurrent request
        throw new ApiError('This time slot has just been taken. Please choose another.', 409);
      }
      throw new Error(`Failed to reserve slot in DB: ${error.message}`);
    }

    // 2. Save full booking details to the bookings table for site reference.
    //    Non-blocking — the slot is already locked above; a failure here does not
    //    cancel the booking.
    if (bookingData.fullName || bookingData.email) {
      try {
        await this.client
          .from('bookings')
          .insert([{
            booking_id:   bookingId,
            slot_datetime: new Date(slotDateTime).toISOString(),
            full_name:    bookingData.fullName  || '',
            email:        bookingData.email     || '',
            phone:        bookingData.phone     || '',
            intent:       bookingData.intent    || '',
            status:       bookingData.status    || 'Booking Confirmed',
            source:       bookingData.source    || 'web-form',
            submitted_at: bookingData.submittedAt
              ? new Date(bookingData.submittedAt).toISOString()
              : new Date().toISOString(),
          }]);
        logger.info('✅ Full booking details saved to DB', { bookingId });
      } catch (detailsErr) {
        logger.warn('⚠️  Failed to save booking details to DB (non-blocking)', {
          error: detailsErr.message,
          bookingId,
        });
      }
    }

    return { id: data.id, isDevelopment: false };
  }

  async getBusySlotDatetimes(timeMin, timeMax) {
    if (!this.client) {
      const min = new Date(timeMin).getTime();
      const max = new Date(timeMax).getTime();
      return Array.from(this._devStore.keys()).filter(iso => {
        const t = new Date(iso).getTime();
        return t >= min && t < max;
      });
    }

    const { data, error } = await this.client
      .from('booked_slots')
      .select('slot_datetime')
      .gte('slot_datetime', timeMin)
      .lt('slot_datetime', timeMax);

    if (error) {
      logger.error('❌ DB getBusySlots failed', { error: error.message });
      return [];
    }

    return data.map(row => new Date(row.slot_datetime).toISOString());
  }
}

// ============================================================
// Google Calendar Implementation  (legacy / rollback)
// ============================================================

class CalendarSlotProvider extends SlotProvider {
  _createAuth() {
    const { serviceAccountEmail, privateKey } = config.google;
    if (!serviceAccountEmail || !privateKey) return null;

    return new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
  }

  async checkSlotAvailability(slotDateTime) {
    const auth = this._createAuth();
    if (!auth) return true;

    const calendar = google.calendar({ version: 'v3', auth });
    const startTime = new Date(slotDateTime);
    const endTime = new Date(startTime.getTime() + config.booking.slotDurationMin * 60 * 1000);

    try {
      const response = await calendar.events.list({
        calendarId: config.google.calendarId || 'primary',
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true,
      });
      return !response.data.items || response.data.items.length === 0;
    } catch (err) {
      logger.error('Calendar availability check failed', { error: err.message });
      return true;
    }
  }

  async bookSlot(slotDateTime, bookingId, bookingData = {}) {
    const auth = this._createAuth();
    if (!auth) {
      return { id: `dev-${Date.now()}`, eventLink: '#', isDevelopment: true };
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const startTime = new Date(slotDateTime);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    try {
      const event = await calendar.events.insert({
        calendarId: config.google.calendarId || 'primary',
        resource: {
          summary: `Strategy Session - ${bookingData.fullName || 'Client'}`,
          start: { dateTime: startTime.toISOString(), timeZone: config.app.timezone },
          end: { dateTime: endTime.toISOString(), timeZone: config.app.timezone },
          attendees: bookingData.email ? [{ email: bookingData.email, displayName: bookingData.fullName }] : [],
          reminders: { useDefault: true },
        },
        sendUpdates: 'all',
      });

      return { id: event.data.id, eventLink: event.data.htmlLink, isDevelopment: false };
    } catch (err) {
      logger.error('Calendar bookSlot failed (non-blocking)', { error: err.message });
      return { id: null, eventLink: null, error: err.message };
    }
  }

  async getBusySlotDatetimes(timeMin, timeMax) {
    const auth = this._createAuth();
    if (!auth) return [];

    const calendarId = config.google.calendarId;
    if (!calendarId || calendarId === 'primary') return [];

    const calendar = google.calendar({ version: 'v3', auth });

    try {
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          timeZone: config.app.timezone,
          items: [{ id: calendarId }],
        },
      });

      const busy = response.data.calendars[calendarId]?.busy || [];
      // Return start of each busy interval — getAvailableSlots will match against slot starts
      return busy.map(b => new Date(b.start).toISOString());
    } catch (err) {
      logger.error('Calendar getBusySlots failed', { error: err.message });
      return [];
    }
  }
}

// ============================================================
// Factory
// ============================================================

let _instance = null;

/**
 * Create a new slot provider for the given type.
 * @param {string} [type] - 'database' | 'calendar'
 */
function createSlotProvider(type) {
  const providerType = type || config.slotProvider || 'database';
  switch (providerType) {
    case 'database':
      return new DatabaseSlotProvider();
    case 'calendar':
      return new CalendarSlotProvider();
    default:
      throw new Error(`Unknown SLOT_PROVIDER: "${providerType}". Use "database" or "calendar".`);
  }
}

/**
 * Return the process-level singleton slot provider (lazily initialised).
 */
function getSlotProvider() {
  if (!_instance) {
    _instance = createSlotProvider();
  }
  return _instance;
}

module.exports = {
  SlotProvider,
  DatabaseSlotProvider,
  CalendarSlotProvider,
  createSlotProvider,
  getSlotProvider,
};
