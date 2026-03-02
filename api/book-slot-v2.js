/**
 * Calendar Booking Integration API
 * 
 * Secure Calendar Event Creation
 * 
 * Integrates with:
 * - Google Calendar (via service account)
 * - Google Sheets (booking record)
 * - Notifications (Telegram alerts)
 * 
 * Environment Variables:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 * - GOOGLE_PROJECT_ID
 * - TG_BOT_TOKEN
 * - TG_CHAT_ID
 */

'use strict';

const { google } = require('googleapis');
const config = require('../../config');
const { validateBookingInput, ApiError } = require('../../lib/security');
const { createSecurityMiddleware, handleApiError, logger } = require('../../lib/middleware');
const { createNotificationProvider } = require('../../lib/providers/NotificationProvider');

const securityMiddleware = createSecurityMiddleware();
const notificationProvider = createNotificationProvider('auto');

/**
 * Create Google Calendar authentication
 */
function createCalendarAuth() {
  if (!config.google.serviceAccountEmail || !config.google.privateKey) {
    if (config.isProduction()) {
      throw new ApiError('Google Calendar not configured', 500);
    }
    return null; // Dev mode
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
 * Create calendar event
 */
async function createCalendarEvent(auth, bookingData) {
  if (!auth) {
    logger.info('[DEV MODE] Calendar event creation skipped');
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

  try {
    const event = await calendar.events.insert({
      calendarId: 'primary',
      resource: eventBody,
      sendUpdates: 'all', // Send calendar invites to attendees
    });

    logger.info('✓ Calendar event created', { eventId: event.data.id });

    return {
      eventId: event.data.id,
      eventLink: event.data.htmlLink,
      isDevelopment: false,
    };
  } catch (error) {
    logger.error('Calendar event creation failed', error);
    throw new ApiError(`Failed to create calendar event: ${error.message}`, 500);
  }
}

/**
 * Build event description from booking data
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
 * Main API handler
 */
async function handler(req, res) {
  try {
    // Apply security middleware
    const securityCheck = await securityMiddleware(req, res);
    if (securityCheck !== null) {
      return;
    }

    // Only allow POST
    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      return res.status(405).json({
        ok: false,
        error: 'Method not allowed',
      });
    }

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    logger.info('📅 Calendar booking request received');

    // Validate input
    const validation = validateBookingInput(req.body);
    if (!validation.valid) {
      throw new ApiError(validation.error, 400);
    }

    const bookingData = validation.data;

    // Create calendar event
    const auth = createCalendarAuth();
    const calendarResult = await createCalendarEvent(auth, bookingData);

    // Send notification
    try {
      await notificationProvider.sendAlert(
        `📅 Calendar booking event created`,
        {
          eventId: calendarResult.eventId,
          clientName: bookingData.fullName,
          slot: bookingData.slotDateTime,
        }
      );
    } catch (notifError) {
      logger.warn('Notification failed (non-blocking)', { error: notifError.message });
    }

    logger.info('✓ Booking completed', { eventId: calendarResult.eventId });

    return res.status(201).json({
      ok: true,
      message: 'Booking confirmed! (Calendar event created)',
      eventId: calendarResult.eventId,
      eventLink: calendarResult.eventLink,
      isDevelopment: calendarResult.isDevelopment,
    });

  } catch (error) {
    handleApiError(error, req, res);
  }
}

module.exports = handler;
module.exports.default = handler;
