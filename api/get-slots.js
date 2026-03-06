/**
 * Get Available Slots API Endpoint
 * 
 * Returns available booking slots by checking the Google Calendar
 * for existing events and filtering out booked time slots.
 * 
 * GET /api/get-slots
 * 
 * Query Parameters:
 * - daysAhead: Number of days to look ahead (default: from config)
 * 
 * Response:
 * {
 *   "ok": true,
 *   "slots": [
 *     {
 *       "dateTime": "2026-03-06T16:00:00.000Z",
 *       "available": true,
 *       "isDevelopment": false
 *     },
 *     ...
 *   ],
 *   "config": {
 *     "slotStartHour": 16,
 *     "slotEndHour": 21,
 *     "slotDurationMin": 30,
 *     "daysAvailable": 3
 *   }
 * }
 */

'use strict';

const { createSecurityMiddleware, handleApiError, logger } = require('../lib/middleware');
const { getAvailableSlots } = require('./book-slot');
const config = require('../config');

// Initialize security middleware
const securityMiddleware = createSecurityMiddleware();

/**
 * Main handler for get-slots endpoint
 */
async function handler(req, res) {
  try {
    // Apply security middleware (CORS + rate limiting)
    const securityCheck = await securityMiddleware(req, res);
    if (securityCheck !== null) {
      return; // Security middleware handled the response
    }

    // Only allow GET and OPTIONS requests
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      res.status(405).json({
        ok: false,
        error: 'Method not allowed. Use GET.',
      });
      return;
    }

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    logger.info('📅 Fetching available slots', {
      method: req.method,
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    });

    // Get query parameters
    const daysAhead = req.query?.daysAhead 
      ? parseInt(req.query.daysAhead, 10) 
      : config.booking.daysAvailable;

    // Validate daysAhead parameter
    if (isNaN(daysAhead) || daysAhead < 1 || daysAhead > 30) {
      res.status(400).json({
        ok: false,
        error: 'Invalid daysAhead parameter. Must be between 1 and 30.',
      });
      return;
    }

    // Fetch available slots from calendar (calendar API is mandatory)
    const slots = await getAvailableSlots({ daysAhead });

    // Return success response with slots data
    res.status(200).json({
      ok: true,
      slots,
      config: {
        slotStartHour: config.booking.slotStartHour,
        slotEndHour: config.booking.slotEndHour,
        slotDurationMin: config.booking.slotDurationMin,
        daysAvailable: config.booking.daysAvailable,
        timezone: config.app.timezone,
      },
      meta: {
        totalSlots: slots.length,
        availableSlots: slots.filter(s => s.available).length,
        bookedSlots: slots.filter(s => !s.available).length,
      },
    });

    logger.info('✅ Slots fetched successfully', {
      totalSlots: slots.length,
      availableSlots: slots.filter(s => s.available).length,
    });

  } catch (error) {
    logger.error('❌ Error in get-slots endpoint', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });

    // In development, show more details
    if (process.env.NODE_ENV === 'development') {
      console.error('\n🔴 DETAILED ERROR IN GET-SLOTS:');
      console.error('Message:', error.message);
      console.error('Code:', error.code);
      console.error('Stack:', error.stack);
      console.error('Full error:', error);
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to fetch available slots. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { debugError: error.message }),
    });
  }
}

module.exports = handler;
