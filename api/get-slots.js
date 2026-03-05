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

const { applyCors, applyRateLimit, logger } = require('../lib/middleware');
const { getAvailableSlots } = require('./book-slot');
const config = require('../config');

/**
 * Main handler for get-slots endpoint
 */
async function handler(req, res) {
  try {
    // Apply CORS headers
    applyCors(req, res);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      res.status(405).json({
        ok: false,
        error: 'Method not allowed. Use GET.',
      });
      return;
    }

    // Apply rate limiting (lighter rate limit for slot fetching)
    const rateLimitResult = applyRateLimit(req);
    if (!rateLimitResult.allowed) {
      res.status(429).json({
        ok: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: rateLimitResult.retryAfter,
      });
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

    // Fetch available slots from calendar
    const slots = await getAvailableSlots({ daysAhead });

    // Return success response
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
    });

    res.status(500).json({
      ok: false,
      error: 'Failed to fetch available slots. Please try again.',
    });
  }
}

module.exports = handler;
