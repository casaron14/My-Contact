/**
 * Security Utilities
 * 
 * Input validation, sanitization, rate limiting, and error handling.
 * Prevents XSS, injection attacks, and other common vulnerabilities.
 */

'use strict';

const config = require('../config');

/**
 * Sanitize user input to prevent XSS attacks
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .substring(0, 1000) // Max length
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/&#?\w+;/gi, ''); // Remove HTML entities
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // Simple regex - in production use email validation library
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate phone number with country code
 * @param {string} phone - Phone number
 * @returns {boolean}
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  
  const cleanPhone = phone.replace(/[\s\-()]/g, '');
  // E.164 format: +[1-9]{1}[0-9]{1,14}
  const phonePattern = /^\+[1-9]\d{1,14}$/;
  return phonePattern.test(cleanPhone);
}

/**
 * Validate person name
 * @param {string} name - Person name
 * @returns {boolean}
 */
function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  return name.trim().length >= 2 && name.trim().length <= 100;
}

/**
 * Validate ISO datetime string
 * @param {string} dateTime - ISO datetime string
 * @returns {boolean}
 */
function isValidDateTime(dateTime) {
  if (!dateTime || typeof dateTime !== 'string') return false;
  
  const date = new Date(dateTime);
  return !isNaN(date.getTime());
}

/**
 * Validate user input for booking
 * @param {Object} data - User submitted data
 * @returns {Object} { valid: boolean, error: string|null, data: Object }
 */
function validateBookingInput(data) {
  const errors = [];

  // Full Name validation
  if (!data.fullName) {
    errors.push('Full Name is required');
  } else if (!isValidName(data.fullName)) {
    errors.push('Full Name must be 2-100 characters');
  }

  // Email validation
  if (!data.email) {
    errors.push('Email is required');
  } else if (!isValidEmail(data.email)) {
    errors.push('Invalid email format');
  }

  // Phone validation
  if (!data.phone) {
    errors.push('Phone is required');
  } else if (!isValidPhone(data.phone)) {
    errors.push('Phone must be in E.164 format (e.g., +27123456789)');
  }

  // Intent validation
  if (!data.intent) {
    errors.push('Investment intent is required');
  } else if (typeof data.intent !== 'string' || data.intent.trim().length === 0) {
    errors.push('Intent must be non-empty text');
  }

  // DateTime validation
  if (!data.slotDateTime) {
    errors.push('Slot date/time is required');
  } else if (!isValidDateTime(data.slotDateTime)) {
    errors.push('Invalid datetime format');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: errors[0],
      allErrors: errors,
    };
  }

  // Sanitize and return cleaned data
  return {
    valid: true,
    error: null,
    data: {
      fullName: sanitizeInput(data.fullName),
      email: sanitizeInput(data.email).toLowerCase(),
      phone: data.phone, // Phone should not be sanitized, keep format
      intent: sanitizeInput(data.intent),
      slotDateTime: data.slotDateTime,
    },
  };
}

/**
 * Check if origin is allowed (CORS)
 * @param {string} origin - Origin from request header
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
  if (!origin) return false;

  const normalizedOrigin = origin
    .trim()
    .toLowerCase()
    .replace(/\/$/, ''); // Remove trailing slash

  // If no allowed origins configured, only allow localhost in dev
  if (config.api.allowedOrigins.length === 0) {
    if (config.isDevelopment()) {
      return normalizedOrigin.includes('localhost') || 
             normalizedOrigin.includes('127.0.0.1');
    }
    return false;
  }

  return config.api.allowedOrigins.some(allowed => {
    const normalizedAllowed = allowed.toLowerCase();
    return normalizedOrigin === normalizedAllowed || 
           normalizedOrigin.startsWith(normalizedAllowed);
  });
}

/**
 * Extract client IP from request
 * @param {Object} req - HTTP request object
 * @returns {string} Client IP
 */
function getClientIp(req) {
  // Try common headers for proxied requests
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Rate limiter using in-memory store
 * For production, use Redis or similar
 */
class RateLimiter {
  constructor(maxRequests = 5, windowMs = 3600000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.store = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }

  /**
   * Check if request is allowed
   * @param {string} identifier - IP or user ID
   * @returns {Object} { allowed: boolean, remaining: number, resetAt: number }
   */
  check(identifier) {
    const now = Date.now();
    const record = this.store.get(identifier);

    // New identifier
    if (!record) {
      this.store.set(identifier, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt: now + this.windowMs,
      };
    }

    // Window expired, reset
    if (now >= record.resetAt) {
      this.store.set(identifier, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt: now + this.windowMs,
      };
    }

    // Check limit
    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
      };
    }

    // Increment and allow
    record.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  /**
   * Clean up expired entries
   * @private
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Destroy rate limiter
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Create global rate limiter instance
 */
const rateLimiter = new RateLimiter(
  config.api.rateLimitMax,
  config.api.rateLimitWindowMs
);

/**
 * API Error class
 * Use for consistent error responses
 */
class ApiError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      ok: false,
      error: this.message,
      status: this.statusCode,
      ...(config.isDevelopment() && this.details && { details: this.details }),
    };
  }
}

/**
 * Format error response for production
 * Never expose stack traces or internal details
 */
function formatErrorResponse(error, isDev = false) {
  if (isDev) {
    return {
      ok: false,
      error: error.message,
      stack: error.stack,
    };
  }

  // Production: generic error message
  if (error instanceof ApiError) {
    return error.toJSON();
  }

  return {
    ok: false,
    error: 'An error occurred. Please try again later.',
    status: 500,
  };
}

module.exports = {
  // Validation
  sanitizeInput,
  isValidEmail,
  isValidPhone,
  isValidName,
  isValidDateTime,
  validateBookingInput,

  // Security
  isOriginAllowed,
  getClientIp,

  // Rate limiting
  RateLimiter,
  rateLimiter,

  // Error handling
  ApiError,
  formatErrorResponse,
};
