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
 * Check slot availability (can be extended in the future)
 * Currently returns true - can be enhanced to check calendar availability
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

    // TODO: Implement actual calendar availability check
    // For now, return true (all slots available)
    return true;
  } catch (error) {
    logger.error('Error checking slot availability', { error: error.message });
    // On error, assume slot is available to not block bookings
    return true;
  }
}

/**
 * Get available time slots for booking
 * Can be used as an API endpoint in the future
 * 
 * @param {Object} options - Query options
 * @param {number} options.daysAhead - Number of days to look ahead (default: 7)
 * @returns {Promise<Array>} Array of available slots
 */
async function getAvailableSlots(options = {}) {
  const { daysAhead = 7 } = options;
  
  try {
    logger.info('📅 Fetching available slots', { daysAhead });
    
    // TODO: Implement actual slot fetching from calendar
    // For now, return empty array
    return [];
  } catch (error) {
    logger.error('Error fetching available slots', { error: error.message });
    return [];
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
