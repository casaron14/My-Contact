/**
 * Booking Slot Management API
 * 
 * Handles all booking slot operations including:
 * - Google Calendar event creation
 * - Calendar authentication
 * - Event scheduling and management
 * 
 * Environment Variables:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 */

'use strict';

const { google } = require('googleapis');
const config = require('../config');
const { logger } = require('../lib/middleware');
const { ApiError } = require('../lib/security');

/**
 * Create Google Calendar authentication
 * @returns {google.auth.JWT|null} JWT auth client or null in dev mode
 */
function createCalendarAuth() {
  if (!config.google.serviceAccountEmail || !config.google.privateKey) {
    if (config.isProduction()) {
      logger.warn('⚠️  Google Calendar not configured - calendar events will be skipped');
    }
    return null; // Dev mode or missing credentials
  }

  return new google.auth.JWT({
    email: config.google.serviceAccountEmail,
    key: config.google.privateKey,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/gmail.send',
    ],
  });
}

/**
 * Build event description from booking data
 * @param {Object} bookingData - Booking information
 * @returns {string} Formatted event description
 */
function buildEventDescription(bookingData) {
  return `Cryptocurrency Investment Strategy Session

📋 Client Information:
- Name: ${bookingData.fullName}
- Email: ${bookingData.email}
- Phone: ${bookingData.phone || 'Not provided'}
- Primary Goal: ${bookingData.intent || 'Not specified'}

📅 Session Details:
- Duration: 30 minutes
- Type: Cryptocurrency Investment Strategy Consultation
- Focus Areas: Investment planning, blockchain technology, Web3 solutions

✅ Pre-Session:
- Please have your investment goals ready
- Prepare any questions about cryptocurrency
- Have relevant financial documents available if applicable`;
}

/**
 * Create Google Calendar event
 * Non-blocking: Does not fail the booking if calendar creation fails
 * 
 * @param {Object} bookingData - Booking information
 * @param {string} bookingData.fullName - Client's full name
 * @param {string} bookingData.email - Client's email
 * @param {string} bookingData.phone - Client's phone (optional)
 * @param {string} bookingData.intent - Client's booking intent (optional)
 * @param {string} bookingData.slotDateTime - ISO datetime string for the booking slot
 * @returns {Promise<Object>} Calendar event details
 */
async function createCalendarEvent(bookingData) {
  try {
    const auth = createCalendarAuth();
    
    if (!auth) {
      logger.info('📅 [DEV MODE] Calendar event creation skipped');
      return {
        eventId: `dev-${Date.now()}`,
        eventLink: '#',
        isDevelopment: true,
      };
    }

    const calendar = google.calendar({ version: 'v3', auth });

    const startTime = new Date(bookingData.slotDateTime);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes

    const eventBody = {
      summary: `Strategy Session - ${bookingData.fullName}`,
      description: buildEventDescription(bookingData),
      start: {
        dateTime: startTime.toISOString(),
        timeZone: config.app.timezone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: config.app.timezone,
      },
      attendees: [
        {
          email: bookingData.email,
          displayName: bookingData.fullName,
        },
      ],
      reminders: {
        useDefault: true,
      },
    };

    const event = await calendar.events.insert({
      calendarId: 'primary',
      resource: eventBody,
      sendUpdates: 'all', // Send calendar invites to attendees
    });

    logger.info('✅ Calendar event created', { eventId: event.data.id });

    return {
      eventId: event.data.id,
      eventLink: event.data.htmlLink,
      isDevelopment: false,
    };
  } catch (error) {
    // Non-blocking: Log error but don't fail the booking
    logger.error('❌ Calendar event creation failed (non-blocking)', { error: error.message });
    return {
      eventId: null,
      eventLink: null,
      error: error.message,
    };
  }
}

/**
 * Check slot availability against Google Calendar
 * 
 * @param {string} slotDateTime - ISO datetime string
 * @returns {Promise<boolean>} Whether the slot is available
 */
async function checkSlotAvailability(slotDateTime) {
  try {
    const auth = createCalendarAuth();
    
    if (!auth) {
      // In dev mode, all slots are available
      return true;
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const startTime = new Date(slotDateTime);
    const endTime = new Date(startTime.getTime() + config.booking.slotDurationMin * 60 * 1000);

    // Check for conflicting events
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    // If there are any events in this time slot, it's not available
    const isAvailable = !response.data.items || response.data.items.length === 0;
    
    return isAvailable;
  } catch (error) {
    logger.error('Error checking slot availability', { error: error.message });
    // On error, assume slot is available to not block bookings
    return true;
  }
}

/**
 * Generate time slots based on configuration
 * 
 * @param {number} daysAhead - Number of days to look ahead
 * @returns {Array<Date>} Array of potential time slots
 */
function generateTimeSlots(daysAhead) {
  const slots = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let dayOffset = 1; dayOffset <= daysAhead; dayOffset++) {
    const day = new Date(today);
    day.setDate(day.getDate() + dayOffset);

    for (let hour = config.booking.slotStartHour; hour < config.booking.slotEndHour; hour++) {
      for (let min = 0; min < 60; min += config.booking.slotDurationMin) {
        const slotTime = new Date(day);
        slotTime.setHours(hour, min, 0, 0);

        if (slotTime > new Date()) {
          slots.push(slotTime);
        }
      }
    }
  }

  return slots;
}

/**
 * Get available time slots for booking by checking calendar
 * 
 * @param {Object} options - Query options
 * @param {number} options.daysAhead - Number of days to look ahead (default: from config)
 * @returns {Promise<Array>} Array of available slots with their availability status
 */
async function getAvailableSlots(options = {}) {
  const { daysAhead = config.booking.daysAvailable } = options;
  
  try {
    logger.info('📅 Fetching available slots', { daysAhead });
    
    const auth = createCalendarAuth();
    
    if (!auth) {
      // In dev mode, return all potential slots
      logger.info('📅 [DEV MODE] Returning all slots without calendar check');
      const allSlots = generateTimeSlots(daysAhead);
      return allSlots.map(slot => ({
        dateTime: slot.toISOString(),
        available: true,
        isDevelopment: true,
      }));
    }

    // Generate all potential slots
    const potentialSlots = generateTimeSlots(daysAhead);
    
    // Get all calendar events for the date range
    const calendar = google.calendar({ version: 'v3', auth });
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + daysAhead);
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const bookedEvents = response.data.items || [];
    logger.info(`📅 Found ${bookedEvents.length} existing calendar events`);

    // Check each slot against existing events
    const availableSlots = potentialSlots.map(slot => {
      const slotStart = slot.getTime();
      const slotEnd = slotStart + (config.booking.slotDurationMin * 60 * 1000);
      
      // Check if this slot conflicts with any existing event
      const hasConflict = bookedEvents.some(event => {
        const eventStart = new Date(event.start.dateTime || event.start.date).getTime();
        const eventEnd = new Date(event.end.dateTime || event.end.date).getTime();
        
        // Check for overlap: slot starts before event ends AND slot ends after event starts
        return slotStart < eventEnd && slotEnd > eventStart;
      });

      return {
        dateTime: slot.toISOString(),
        available: !hasConflict,
        isDevelopment: false,
      };
    });

    const availableCount = availableSlots.filter(s => s.available).length;
    logger.info(`📅 Found ${availableCount}/${potentialSlots.length} available slots`);

    return availableSlots;
  } catch (error) {
    logger.error('Error fetching available slots', { error: error.message });
    // On error, return all slots as available to not break the booking system
    const allSlots = generateTimeSlots(daysAhead);
    return allSlots.map(slot => ({
      dateTime: slot.toISOString(),
      available: true,
      error: error.message,
    }));
  }
}

// Export functions
module.exports = {
  createCalendarEvent,
  checkSlotAvailability,
  getAvailableSlots,
  createCalendarAuth,
  buildEventDescription,
};
