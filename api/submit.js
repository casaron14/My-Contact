/**
 * Vercel Serverless Function - Contact Form Submission
 * Handles form submissions with reCAPTCHA verification, rate limiting, and Google Sheets integration
 */

const { google } = require('googleapis');

// In-memory rate limiter storage (resets on cold start)
const rateLimitStore = new Map();

// Configuration
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://charityaron.vercel.app';
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds
const MIN_RECAPTCHA_SCORE = 0.5;

/**
 * Main handler for the serverless function
 */
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
    // Check origin
    const origin = req.headers.origin || req.headers.referer;
    const normalizedOrigin = origin?.replace(/\/$/, ''); // Remove trailing slash
    const normalizedAllowed = ALLOWED_ORIGIN.replace(/\/$/, '');
    
    if (!origin || !normalizedOrigin.startsWith(normalizedAllowed)) {
      return res.status(403).json({ 
        ok: false, 
        error: 'Forbidden origin' 
      });
    }

    // Validate content type
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
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

    // Validate input fields
    const validation = validateInput(body);
    if (!validation.valid) {
      return res.status(400).json({ 
        ok: false, 
        error: validation.error 
      });
    }

    // Sanitize inputs
    const sanitizedData = {
      fullName: sanitize(body.fullName),
      phone: sanitize(body.phone),
      knowledge: sanitize(body.knowledge),
      confirmation: sanitize(body.confirmation),
      recaptchaToken: body.recaptchaToken
    };

    // Verify reCAPTCHA token
    const recaptchaResult = await verifyRecaptcha(sanitizedData.recaptchaToken, clientIp);
    if (!recaptchaResult.success) {
      return res.status(403).json({ 
        ok: false, 
        error: 'reCAPTCHA verification failed' 
      });
    }

    if (recaptchaResult.score < MIN_RECAPTCHA_SCORE) {
      return res.status(403).json({ 
        ok: false, 
        error: 'reCAPTCHA score too low' 
      });
    }

    // Append to Google Sheets
    await appendToSheet({
      fullName: sanitizedData.fullName,
      phone: sanitizedData.phone,
      knowledge: sanitizedData.knowledge,
      confirmation: sanitizedData.confirmation
    });

    // Return success
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Server error:', error.message);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
};

/**
 * Handle CORS preflight requests
 */
function handleCors(res) {
  const allowedOrigin = ALLOWED_ORIGIN.replace(/\/$/, '');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  return res.status(200).end();
}

/**
 * Set CORS headers on response
 */
function setCorsHeaders(res) {
  const allowedOrigin = ALLOWED_ORIGIN.replace(/\/$/, '');
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Get client IP address from request
 */
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

/**
 * Validate input fields
 */
function validateInput(data) {
  if (!data) {
    return { valid: false, error: 'Request body is required' };
  }

  // Validate fullName
  if (!data.fullName || typeof data.fullName !== 'string' || data.fullName.trim().length === 0) {
    return { valid: false, error: 'Full Name is required' };
  }

  if (data.fullName.length > 100) {
    return { valid: false, error: 'Full Name must be less than 100 characters' };
  }

  // Validate phone
  if (!data.phone || typeof data.phone !== 'string') {
    return { valid: false, error: 'Phone is required' };
  }

  const digitsOnly = data.phone.replace(/[\s\-()]/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15 || !/^\d+$/.test(digitsOnly)) {
    return { valid: false, error: 'Phone must contain 7-15 digits' };
  }

  // Validate knowledge
  if (!data.knowledge || typeof data.knowledge !== 'string' || data.knowledge.trim().length === 0) {
    return { valid: false, error: 'Knowledge level is required' };
  }

  // Validate confirmation
  if (!data.confirmation || typeof data.confirmation !== 'string' || data.confirmation.trim().length === 0) {
    return { valid: false, error: 'Crypto investment confirmation is required' };
  }

  // Validate reCAPTCHA token
  if (!data.recaptchaToken || typeof data.recaptchaToken !== 'string') {
    return { valid: false, error: 'reCAPTCHA token is required' };
  }

  return { valid: true };
}

/**
 * Sanitize string input to prevent XSS
 */
function sanitize(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 1000); // Limit length
}

/**
 * Verify reCAPTCHA token with Google
 */
async function verifyRecaptcha(token, remoteIp) {
  const secretKey = process.env.RECAPTCHA_SECRET;
  
  if (!secretKey) {
    throw new Error('RECAPTCHA_SECRET not configured');
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: remoteIp
      })
    });

    const data = await response.json();

    return {
      success: data.success === true,
      score: data.score || 0,
      action: data.action,
      challengeTs: data.challenge_ts,
      hostname: data.hostname
    };
  } catch (error) {
    console.error('reCAPTCHA verification error:', error.message);
    return { success: false, score: 0 };
  }
}

/**
 * Append data to Google Sheets
 */
async function appendToSheet(data) {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!serviceAccountEmail || !privateKey || !sheetId) {
    throw new Error('Google Sheets credentials not configured');
  }

  try {
    // Handle escaped newlines in private key
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

    // Create JWT client
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: formattedPrivateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Create Sheets API client
    const sheets = google.sheets({ version: 'v4', auth });

    // Prepare row data
    const timestamp = new Date().toISOString();
    const values = [
      [timestamp, data.fullName, data.phone, data.knowledge, data.confirmation]
    ];

    // Append to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:E', // Columns: Timestamp, Name, Phone, Knowledge, Confirmation
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: values
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Google Sheets error:', error.message);
    throw new Error('Failed to save to Google Sheets');
  }
}

// Export for Vercel
module.exports = handler;
module.exports.default = handler;
