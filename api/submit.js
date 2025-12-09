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
  console.log('🔵 Handler called - Method:', req.method);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS preflight handled');
    return handleCors(res);
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
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
    const normalizedOrigin = origin?.replace(/\/$/, '');
    const normalizedAllowed = ALLOWED_ORIGIN.replace(/\/$/, '');
    
    console.log('🔍 Origin check:', { origin, normalizedOrigin, normalizedAllowed });
    
    if (!origin || !normalizedOrigin.startsWith(normalizedAllowed)) {
      console.log('❌ Origin forbidden:', origin);
      return res.status(403).json({ 
        ok: false, 
        error: 'Forbidden origin' 
      });
    }
    
    console.log('✅ Origin allowed');

    // Validate content type
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      console.log('❌ Invalid content-type:', contentType);
      return res.status(400).json({ 
        ok: false, 
        error: 'Content-Type must be application/json' 
      });
    }
    
    console.log('✅ Content-Type valid');

    // Get client IP for rate limiting
    const clientIp = getClientIp(req);
    console.log('🔍 Client IP:', clientIp);
    
    // Check rate limit
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      console.log('❌ Rate limit exceeded for IP:', clientIp);
      return res.status(429).json({ 
        ok: false, 
        error: 'Too many requests. Please try again later.' 
      });
    }
    
    console.log('✅ Rate limit OK');

    // Parse and validate request body
    const body = req.body;
    if (!body) {
      console.log('❌ No request body');
      return res.status(400).json({ 
        ok: false, 
        error: 'Request body is required' 
      });
    }
    
    console.log('✅ Request body present:', Object.keys(body));

    // Validate input fields
    const validation = validateInput(body);
    if (!validation.valid) {
      console.log('❌ Validation failed:', validation.error);
      return res.status(400).json({ 
        ok: false, 
        error: validation.error 
      });
    }
    
    console.log('✅ Validation passed');

    // Sanitize inputs
    const sanitizedData = {
      fullName: sanitize(body.fullName),
      phone: sanitize(body.phone),
      knowledge: sanitize(body.knowledge),
      confirmation: sanitize(body.confirmation),
      recaptchaToken: body.recaptchaToken
    };
    
    console.log('✅ Data sanitized');

    // Verify reCAPTCHA token
    console.log('🔍 Verifying reCAPTCHA...');
    const recaptchaResult = await verifyRecaptcha(sanitizedData.recaptchaToken, clientIp);
    console.log('🔍 reCAPTCHA result:', { success: recaptchaResult.success, score: recaptchaResult.score });
    
    if (!recaptchaResult.success) {
      console.log('❌ reCAPTCHA verification failed');
      return res.status(403).json({ 
        ok: false, 
        error: 'reCAPTCHA verification failed' 
      });
    }

    if (recaptchaResult.score < MIN_RECAPTCHA_SCORE) {
      console.log('❌ reCAPTCHA score too low:', recaptchaResult.score);
      return res.status(403).json({ 
        ok: false, 
        error: 'reCAPTCHA score too low' 
      });
    }
    
    console.log('✅ reCAPTCHA passed');

    // Append to Google Sheets
    console.log('🔍 Appending to Google Sheets...');
    await appendToSheet({
      fullName: sanitizedData.fullName,
      phone: sanitizedData.phone,
      knowledge: sanitizedData.knowledge,
      confirmation: sanitizedData.confirmation
    });
    
    console.log('✅ Successfully saved to Google Sheets');

    // Return success
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('❌ Server error:', error.message);
    console.error('❌ Stack trace:', error.stack);
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

  console.log('🔍 Environment variables check:', {
    hasEmail: !!serviceAccountEmail,
    hasPrivateKey: !!privateKey,
    privateKeyLength: privateKey?.length,
    hasSheetId: !!sheetId,
    sheetId: sheetId
  });

  if (!serviceAccountEmail || !privateKey || !sheetId) {
    const missing = [];
    if (!serviceAccountEmail) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    if (!privateKey) missing.push('GOOGLE_PRIVATE_KEY');
    if (!sheetId) missing.push('GOOGLE_SHEET_ID');
    console.log('❌ Missing environment variables:', missing);
    throw new Error(`Google Sheets credentials not configured: ${missing.join(', ')}`);
  }

  try {
    // Handle escaped newlines in private key
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    console.log('✅ Private key formatted');

    // Create JWT client
    console.log('🔍 Creating JWT auth...');
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: formattedPrivateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('✅ JWT client created');

    // Create Sheets API client
    const sheets = google.sheets({ version: 'v4', auth });
    console.log('✅ Sheets API client created');

    // Prepare row data
    const timestamp = new Date().toISOString();
    const values = [
      [timestamp, data.fullName, data.phone, data.knowledge, data.confirmation]
    ];
    
    console.log('🔍 Data to append:', values);

    // Append to sheet
    console.log('🔍 Attempting to append to sheet...');
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:E', // Columns: Timestamp, Name, Phone, Knowledge, Confirmation
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: values
      }
    });
    
    console.log('✅ Sheet append successful:', result.data);

    return { success: true };
  } catch (error) {
    console.error('❌ Google Sheets error:', error.message);
    console.error('❌ Error details:', error);
    throw new Error(`Failed to save to Google Sheets: ${error.message}`);
  }
}

// Export for Vercel
module.exports = handler;
module.exports.default = handler;
