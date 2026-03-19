/**
 * Secure Booking Submission API Handler
 * 
 * Vercel Serverless Function for booking submissions
 * 
 * Features:
 * - Centralized configuration management
 * - Provider abstraction (DataProvider, NotificationProvider)
 * - Input validation and sanitization
 * - Security headers and rate limiting
 * - Proper error handling (no stack traces in production)
 * - Safe logging (no secrets)
 * 
 * Environment Variables (See .env.example):
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 * - GOOGLE_SHEET_ID
 * - TG_BOT_TOKEN
 * - TG_CHAT_ID
 * - ALLOWED_ORIGINS
 * - API_RATE_LIMIT_MAX
 * - API_RATE_LIMIT_WINDOW_MS
 */

'use strict';

const config = require('../config');
const { createDataProvider } = require('../lib/providers/DataProvider');
const { createNotificationProvider } = require('../lib/providers/NotificationProvider');
const { recordBookedSlot, checkSlotAvailability } = require('./book-slot');
const {
  validateBookingInput,
  sanitizeInput,
  ApiError,
} = require('../lib/security');
const {
  createSecurityMiddleware,
  handleApiError,
  logger,
} = require('../lib/middleware');

// Initialize services
const dataProvider = createDataProvider('google-sheets');
const notificationProvider = createNotificationProvider('auto');
const securityMiddleware = createSecurityMiddleware();

/**
 * Main API handler
 */
async function handler(req, res) {
  try {
    // Apply security middleware
    const securityCheck = await securityMiddleware(req, res);
    if (securityCheck !== null) {
      return; // Security middleware handled the response
    }

    // Only allow POST and OPTIONS
    if (req.method !== 'POST' && req.method !== 'OPTIONS') {
      return res.status(405).json({
        ok: false,
        error: 'Method not allowed',
      });
    }

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // ==================== BOOKING SUBMISSION ====================

    // Validate request body exists
    const body = req.body;
    if (!body || typeof body !== 'object') {
      throw new ApiError('Request body is required', 400);
    }

    logger.info('📝 Booking submission received', { email: body.email });

    // Validate input
    const validation = validateBookingInput(body);
    if (!validation.valid) {
      logger.warn('❌ Booking validation failed', { error: validation.error });
      throw new ApiError(validation.error, 400, validation.allErrors);
    }

    const sanitizedData = validation.data;

    // ==================== SLOT AVAILABILITY CHECK ====================
    // Fast DB read — fails before any writes if the slot is already taken.
    const isSlotAvailable = await checkSlotAvailability(sanitizedData.slotDateTime);
    if (!isSlotAvailable) {
      return res.status(409).json({
        ok: false,
        slotTaken: true,
        error: 'This time slot is no longer available. Please choose another.',
      });
    }

    // Enforce 2-hour advance booking rule (server-side guard)
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    if (new Date(sanitizedData.slotDateTime).getTime() - Date.now() < TWO_HOURS_MS) {
      return res.status(400).json({
        ok: false,
        error: 'Slots must be booked at least 2 hours in advance.',
      });
    }

    // ==================== DUPLICATE CHECK ====================

    const existingBooking = await dataProvider.findBookingByEmail(sanitizedData.email);
    if (existingBooking) {
      logger.info('⚠️  Duplicate booking detected', {
        email: sanitizedData.email,
        existingId: existingBooking.id,
      });

      return res.status(409).json({
        ok: true,
        isDuplicate: true,
        message: 'A booking already exists for this email within the last 24 hours',
        bookingId: existingBooking.id,
      });
    }

    // ==================== CREATE BOOKING ====================

    const bookingData = {
      fullName: sanitizedData.fullName,
      email: sanitizedData.email,
      phone: sanitizedData.phone,
      intent: sanitizedData.intent,
      slotDateTime: sanitizedData.slotDateTime,
      status: 'Booking Confirmed',
      submittedAt: new Date().toISOString(),
      source: 'web-form',
    };

    // Save to data provider (Google Sheets)
    const bookingId = await dataProvider.appendBooking(bookingData);

    logger.info('✅ Booking created', { bookingId, email: sanitizedData.email });

    // ==================== RESERVE SLOT IN DATABASE ====================

    // Mark the slot as taken in the database so it no longer appears available.
    // Non-blocking: a failure here does NOT cancel the Sheets booking.
    let slotResult = { slotId: null, eventLink: null };
    try {
      slotResult = await recordBookedSlot(bookingData, bookingId);

      if (slotResult.slotId) {
        logger.info('✅ Slot reserved in DB', { slotId: slotResult.slotId, bookingId });
      } else {
        logger.warn('⚠️  Slot not reserved', {
          reason: slotResult.error || 'Unknown',
          bookingId,
        });
      }
    } catch (slotError) {
      // Re-throw 409 (slot taken) — this is a meaningful user-facing error
      if (slotError.statusCode === 409) throw slotError;

      // All other slot errors are non-blocking
      logger.warn('⚠️  Slot reservation failed (non-blocking)', {
        error: slotError.message,
        bookingId,
      });
    }

    // ==================== SEND NOTIFICATIONS ====================

    // Send booking confirmation notification
    try {
      await notificationProvider.sendBookingConfirmation({
        fullName: bookingData.fullName,
        email: bookingData.email,
        phone: bookingData.phone,
        intent: bookingData.intent,
        slotDateTime: bookingData.slotDateTime,
      });
      logger.info('✓ Notification sent', { bookingId });
    } catch (notifError) {
      // Don't fail the booking if notification fails
      logger.warn('⚠️  Notification failed', { error: notifError.message });
    }

    // ==================== SUCCESS RESPONSE ====================

    return res.status(201).json({
      ok: true,
      bookingId,
      message: 'Booking confirmed successfully!',
      bookedTime: sanitizedData.slotDateTime,
      clientEmail: sanitizedData.email,
      slotId: slotResult.slotId,
      eventLink: slotResult.eventLink,
    });

  } catch (error) {
    // Error handling
    handleApiError(error, req, res);
  }
}

// Export for Vercel
module.exports = handler;
module.exports.default = handler;
