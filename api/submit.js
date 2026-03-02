/**
 * Vercel Serverless Function - Unified Booking Submission Handler
 * Simplified flow: User submits complete booking data (form + slot) in ONE API call
 * 
 * Handles:
 * - Complete booking submissions with all required data
 * - Google Sheets integration
 * - Telegram alerts
 * - Confirmation emails
 * - Rate limiting & security
 */

const { google } = require('googleapis');

// ============================================
// CONFIGURATION & SETTINGS
// ============================================

// Read allowed origins from .env, with fallback for development
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(o => o)
  .length > 0
  ? (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(o => o.trim())
      .filter(o => o)
  : ['http://localhost:3000', 'http://127.0.0.1:3000']; // Dev fallback

const RATE_LIMIT_MAX = parseInt(process.env.API_RATE_LIMIT_MAX || '5', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '3600000', 10);

// In-memory rate limiter
const rateLimitStore = new Map();

// ============================================
// MAIN HANDLER
// ============================================

async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(res);
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      ok: false, 
      error: 'Method not allowed' 
    });
  }

  // Set CORS headers
  setCorsHeaders(res);

  try {
    // Validate origin
    const origin = req.headers.origin || req.headers.referer;
    if (!isOriginAllowed(origin)) {
      console.warn('Rejected request from origin:', origin);
      return res.status(403).json({ 
        ok: false, 
        error: 'Forbidden origin' 
      });
    }

    // Validate content type
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Content-Type must be application/json' 
      });
    }

    // Get client IP for rate limiting
    const clientIp = getClientIp(req);
    
    // Check rate limit
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({ 
        ok: false, 
        error: 'Too many requests. Please try again later.' 
      });
    }

    // Parse and validate request body
    const body = req.body;
    if (!body) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Request body is required' 
      });
    }

    // ==================== UNIFIED BOOKING FLOW ====================
    // All submissions are now complete bookings with slot date time
    const validation = validateBookingInput(body);
    if (!validation.valid) {
      return res.status(400).json({ 
        ok: false, 
        error: validation.error 
      });
    }

    const result = await handleUnifiedBooking(body);

    return res.status(200).json({ 
      ok: true,
      ...result
    });

  } catch (error) {
    console.error('❌ Server error:', error.message);
    console.error('Stack:', error.stack);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// ============================================
// UNIFIED BOOKING HANDLER
// ============================================

async function handleUnifiedBooking(body) {
  try {
    // Sanitize inputs to prevent XSS
    const sanitizedData = {
      fullName: sanitize(body.fullName),
      email: sanitize(body.email),
      phone: sanitize(body.phone),
      intent: sanitize(body.intent),
      slotDateTime: body.slotDateTime,
      timestamp: new Date().toISOString()
    };

    console.log('Starting unified booking for:', sanitizedData.email);

    // Check for duplicate bookings (same email within last 24 hours)
    let existingBooking;
    try {
      existingBooking = await findExistingBooking(sanitizedData.email);
      if (existingBooking) {
        console.log(`Duplicate booking detected for email: ${sanitizedData.email}`);
        return {
          message: 'A booking already exists for this email',
          isDuplicate: true,
          existingBooking
        };
      }
    } catch (error) {
      console.warn('Could not check for duplicates:', error.message);
      // Continue anyway
    }

    // Create complete booking entry in Google Sheets
    let bookingId;
    try {
      console.log('Attempting to save booking to Google Sheets...');
      bookingId = await appendBookingToSheet({
        fullName: sanitizedData.fullName,
        email: sanitizedData.email,
        phone: sanitizedData.phone,
        status: 'Booking Confirmed',
        intent: sanitizedData.intent,
        slotDateTime: sanitizedData.slotDateTime,
        submittedAt: sanitizedData.timestamp,
        source: 'unified_booking'
      });
      console.log('✓ Booking saved to Google Sheets. ID:', bookingId);
    } catch (error) {
      console.error('❌ Google Sheets error:', error.message);
      throw new Error(`Failed to save booking: ${error.message}`);
    }

    // Send Telegram alert for booking (non-blocking - don't fail if this errors)
    try {
      console.log('Sending Telegram alert...');
      await sendTelegramAlert({
        type: 'BOOKING_CONFIRMED',
        fullName: sanitizedData.fullName,
        email: sanitizedData.email,
        phone: sanitizedData.phone,
        intent: sanitizedData.intent,
        slotDateTime: sanitizedData.slotDateTime
      });
      console.log('✓ Telegram alert sent');
    } catch (error) {
      console.warn('⚠️ Telegram alert failed (non-critical):', error.message);
    }

    // Send confirmation email (non-blocking - don't fail if this errors)
    try {
      await sendConfirmationEmail(sanitizedData);
      console.log('✓ Confirmation email initiated');
    } catch (error) {
      console.warn('⚠️ Email sending failed (non-critical):', error.message);
    }

    console.log(`✓ Unified booking confirmed. Booking ID: ${bookingId}, Slot: ${sanitizedData.slotDateTime}`);

    return {
      bookingId,
      message: 'Booking confirmed successfully!',
      bookedTime: sanitizedData.slotDateTime,
      clientEmail: sanitizedData.email
    };
  } catch (error) {
    console.error('handleUnifiedBooking error:', error.message);
    throw error;
  }
}

// ============================================
// GOOGLE SHEETS OPERATIONS
// ============================================

async function appendBookingToSheet(bookingData) {
  console.log('appendBookingToSheet called with email:', bookingData.email);
  
  // Verify environment variables
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL not configured');
  }
  if (!process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('GOOGLE_PRIVATE_KEY not configured');
  }
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID not configured');
  }

  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  
  const bookingId = 'B-' + Date.now();
  const slotDate = new Date(bookingData.slotDateTime);
  const slotFormatted = slotDate.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const values = [[
    bookingId,
    bookingData.fullName,
    bookingData.email,
    bookingData.phone,
    bookingData.status,
    bookingData.submittedAt,
    slotFormatted,
    bookingData.slotDateTime,
    bookingData.intent,
    bookingData.source,
    new Date().toISOString()
  ]];

  try {
    console.log('Appending to sheet:', process.env.GOOGLE_SHEET_NAME || 'Bookings');
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${process.env.GOOGLE_SHEET_NAME || 'Bookings'}!A:K`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    console.log(`✓ Booking saved to Sheets. ID: ${bookingId}, Updated cells: ${response.data.updates?.updatedCells}`);
    return bookingId;
  } catch (error) {
    console.error('❌ Google Sheets error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      errors: error.errors
    });
    throw new Error(`Failed to save booking to Google Sheets: ${error.message}`);
  }
}

async function findExistingBooking(email) {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_NAME || 'Bookings';

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:C`
    });

    const rows = result.data.values || [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][2] === email) {
        const submittedAt = rows[i][5];
        if (submittedAt) {
          const submitted = new Date(submittedAt);
          if (submitted > oneDayAgo) {
            return {
              id: rows[i][0],
              name: rows[i][1],
              email: rows[i][2]
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('Error checking for existing booking:', error.message);
    return null;
  }
}

// ============================================
// EMAIL SENDING
// ============================================

async function sendConfirmationEmail(bookingData) {
  // For now, log as placeholder. In production, use SendGrid, Mailgun, or Gmail API
  console.log(`Confirmation email would be sent to: ${bookingData.email}`);
  console.log(`Subject: Your Booking Confirmed - ${bookingData.slotDateTime}`);
  
  // TODO: Implement actual email sending
  // const nodemailer = require('nodemailer');
  // OR use gmail API like in book-slot.js
}

// ============================================
// TELEGRAM ALERTS
// ============================================

async function sendTelegramAlert(alertData) {
  if (!process.env.TG_BOT_TOKEN || !process.env.TG_CHAT_ID) {
    console.warn('Telegram not configured, skipping alert');
    return;
  }

  try {
    const message = buildTelegramMessage(alertData);
    
    await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TG_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    console.log(`Telegram alert sent: ${alertData.type}`);
  } catch (error) {
    console.error('Telegram alert failed:', error.message);
  }
}

function buildTelegramMessage(alertData) {
  const { type, fullName, email, phone, intent, slotDateTime } = alertData;

  if (type === 'BOOKING_CONFIRMED') {
    const slotDate = new Date(slotDateTime).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return `✅ *NEW BOOKING CONFIRMED*\n\n*Name:* ${fullName}\n*Email:* ${email}\n*Phone:* ${phone}\n*Goal:* ${intent}\n*Slot:* ${slotDate}\n\n[Message on WhatsApp](https://wa.me/${phone.replace(/\D/g, '')})`;
  }

  return '📌 New notification from booking system';
}

/**
 * Check rate limit for IP address
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }

  // Reset if window expired
  if (now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }

  // Check if limit exceeded
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  // Increment count
  record.count++;
  rateLimitStore.set(ip, record);
  return { allowed: true };
}

// ============================================
// VALIDATION
// ============================================

// ============================================
// VALIDATION
// ============================================

function validateBookingInput(data) {
  if (!data.fullName || typeof data.fullName !== 'string' || data.fullName.trim().length === 0) {
    return { valid: false, error: 'Full Name is required' };
  }

  if (data.fullName.length > 100) {
    return { valid: false, error: 'Full Name must be less than 100 characters' };
  }

  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (!data.phone || typeof data.phone !== 'string') {
    return { valid: false, error: 'Phone is required' };
  }

  const cleanPhone = data.phone.replace(/[\s\-()]/g, '');
  const phonePattern = /^\+[1-9]\d{1,14}$/;
  if (!phonePattern.test(cleanPhone)) {
    return { valid: false, error: 'Invalid phone format (needs country code)' };
  }

  if (!data.intent || typeof data.intent !== 'string' || data.intent.trim().length === 0) {
    return { valid: false, error: 'Investment intent is required' };
  }

  if (!data.slotDateTime || typeof data.slotDateTime !== 'string') {
    return { valid: false, error: 'Slot date/time is required' };
  }

  const dateObj = new Date(data.slotDateTime);
  if (isNaN(dateObj.getTime())) {
    return { valid: false, error: 'Invalid datetime format' };
  }

  return { valid: true };
}

function validateFormInput(data) {
  if (!data.fullName || typeof data.fullName !== 'string' || data.fullName.trim().length === 0) {
    return { valid: false, error: 'Full Name is required' };
  }

  if (data.fullName.length > 100) {
    return { valid: false, error: 'Full Name must be less than 100 characters' };
  }

  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (!data.phone || typeof data.phone !== 'string') {
    return { valid: false, error: 'Phone is required' };
  }

  const phonePattern = /^\+?[1-9]\d{1,14}$/;
  if (!phonePattern.test(data.phone.replace(/[\s\-()]/g, ''))) {
    return { valid: false, error: 'Invalid phone format (needs country code)' };
  }

  if (!data.intent || typeof data.intent !== 'string' || data.intent.trim().length === 0) {
    return { valid: false, error: 'Investment intent is required' };
  }

  return { valid: true };
}

// ============================================
// SECURITY & UTILITY FUNCTIONS
// ============================================

function getGoogleAuth() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
  
  if (!serviceAccountEmail) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set');
  }
  if (!privateKeyRaw) {
    throw new Error('GOOGLE_PRIVATE_KEY is not set');
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  
  console.log('Creating JWT auth with email:', serviceAccountEmail);
  console.log('Private key length:', privateKey.length);
  
  try {
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    console.log('✓ JWT auth created successfully');
    return auth;
  } catch (error) {
    console.error('❌ Failed to create JWT auth:', error.message);
    throw error;
  }
}

function sanitize(input) {
  if (!input || typeof input !== 'string') return '';

  return input
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .substring(0, 1000);
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  
  const normalizedOrigin = origin.replace(/\/$/, '');
  
  return ALLOWED_ORIGINS.some(allowed => 
    normalizedOrigin === allowed || 
    normalizedOrigin.startsWith(allowed)
  );
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         'unknown';
}

/**
 * Check rate limit for IP address
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }

  if (now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false };
  }

  record.count++;
  rateLimitStore.set(ip, record);
  return { allowed: true };
}

function handleCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  return res.status(200).end();
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Export for Vercel
module.exports = handler;
module.exports.default = handler;
