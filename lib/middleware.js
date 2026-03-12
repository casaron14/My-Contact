/**
 * Security Middleware
 * 
 * Apply security best practices to all API routes:
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - Rate limiting
 * - CORS handling
 * - Input validation
 * - Error handling
 */

'use strict';

const config = require('../config');
const { isOriginAllowed, getClientIp, rateLimiter, readRateLimiter, ApiError, formatErrorResponse } = require('./security');

/**
 * Apply security headers
 * https://owasp.org/www-project-secure-headers/
 */
function setSecurityHeaders(res) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy - strict for security
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " + // unsafe-inline for inline scripts, remove if not needed
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self' https://api.telegram.org https://www.googleapis.com; " +
    "media-src 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy (formerly Feature-Policy)
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), ' +
    'camera=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), ' +
    'execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), ' +
    'magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(), ' +
    'picture-in-picture=(), publickey-credentials-get=(), sync-xhr=(), usb=(), ' +
    'wake-lock=(), xr-spatial-tracking=()'
  );

  // HSTS - enforce HTTPS (only in production)
  if (config.isProduction()) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/**
 * Handle CORS preflight and set headers
 */
function handleCors(req, res) {
  let origin = req.headers.origin || req.headers.referer;
  
  // Extract origin from referer if needed (referer includes full URL with path)
  if (origin && !req.headers.origin && req.headers.referer) {
    try {
      const url = new URL(origin);
      origin = `${url.protocol}//${url.host}`;
    } catch (e) {
      // Invalid URL, keep as-is
    }
  }
  
  if (isOriginAllowed(origin)) {
    // When origin header is absent (API tools in dev), use wildcard
    const allowOrigin = origin || '*';
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    // Credentials cannot be used with wildcard origin
    if (origin) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
}

/**
 * Middleware factory for security checks
 * Returns a handler function for API routes
 */
function createSecurityMiddleware({ readOnly = false } = {}) {
  return async (req, res) => {
    // Set security headers
    setSecurityHeaders(res);

    // Handle CORS
    handleCors(req, res);

    // Reject disallowed origins
    let origin = req.headers.origin || req.headers.referer;
    
    // Extract origin from referer if needed (referer includes full URL with path)
    if (origin && !req.headers.origin && req.headers.referer) {
      try {
        const url = new URL(origin);
        origin = `${url.protocol}//${url.host}`;
      } catch (e) {
        // Invalid URL, keep as-is
        console.warn(`⚠️  Could not parse origin from referer: ${origin}`);
      }
    }
    
    if (!isOriginAllowed(origin) && req.method !== 'OPTIONS') {
      if (config.isDevelopment()) {
        console.error(`❌ CORS: Rejected request from origin: ${origin}`);
        console.error(`   Allowed origins: ${JSON.stringify(config.api.allowedOrigins)}`);
      }
      return res.status(403).json({
        ok: false,
        error: 'Forbidden origin',
      });
    }

    // Validate content type for POST
    if (req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        return res.status(400).json({
          ok: false,
          error: 'Content-Type must be application/json',
        });
      }
    }

    // Rate limiting — read-only endpoints get a much higher limit
    const limiter = readOnly ? readRateLimiter : rateLimiter;
    const clientIp = getClientIp(req);
    const rateLimitResult = limiter.check(clientIp);

    res.setHeader('X-RateLimit-Limit', readOnly ? 120 : config.api.rateLimitMax);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetAt / 1000));

    if (!rateLimitResult.allowed) {
      console.warn(`⏱️  Rate limit exceeded for IP: ${clientIp}`);
      return res.status(429).json({
        ok: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
      });
    }

    // Request ID for logging
    res.setHeader('X-Request-ID', generateRequestId());

    // Add utilities to request
    req.clientIp = clientIp;
    req.requestId = res.getHeader('X-Request-ID');

    return null; // Middleware successful, continue to route handler
  };
}

/**
 * Error handling middleware for API routes
 */
function handleApiError(error, req, res) {
  const isDev = config.isDevelopment();
  const statusCode = error.statusCode || 500;

  // Log error (never log secrets)
  const logMessage = `[${req.requestId || 'unknown'}] ${req.method} ${req.url} - ${error.message}`;
  
  if (isDev) {
    console.error('❌', logMessage);
    if (error.stack) console.error(error.stack);
  } else {
    // Production: log safely
    const safeError = {
      message: error.message,
      statusCode,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    };
    console.error('❌', JSON.stringify(safeError));
  }

  // Send response
  const response = formatErrorResponse(error, isDev);
  res.status(statusCode).json(response);
}

/**
 * Validation wrapper for route handlers
 * Ensures validation error before business logic
 */
function withValidation(validator) {
  return async (req, data) => {
    const result = validator(data);
    if (!result.valid) {
      throw new ApiError(result.error, 400, result.allErrors);
    }
    return result.data || data;
  };
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safe logging utility - never logs secrets
 */
const logger = {
  info: (message, data = {}) => {
    if (config.logLevel === 'info' || config.logLevel === 'debug') {
      console.log(`ℹ️  ${message}`, JSON.stringify(stripSensitiveData(data)));
    }
  },

  warn: (message, data = {}) => {
    console.warn(`⚠️  ${message}`, JSON.stringify(stripSensitiveData(data)));
  },

  error: (message, error, data = {}) => {
    const errorObj = stripSensitiveData({
      message: error.message,
      ...data,
    });
    console.error(`❌ ${message}`, JSON.stringify(errorObj));
  },
};

/**
 * Strip sensitive data from objects before logging
 */
function stripSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'api_key', 'apiKey', 
    'privateKey', 'private_key', 'authorization', 'cookie', 'creditCard'];
  
  const cleaned = JSON.parse(JSON.stringify(obj));

  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const key in o) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        o[key] = '[REDACTED]';
      } else if (typeof o[key] === 'object') {
        walk(o[key]);
      }
    }
  };

  walk(cleaned);
  return cleaned;
}

module.exports = {
  createSecurityMiddleware,
  handleApiError,
  setSecurityHeaders,
  handleCors,
  withValidation,
  generateRequestId,
  logger,
  stripSensitiveData,
  ApiError,
};
