/**
 * Shared Utilities for API Handlers
 * 
 * Prevents duplication of:
 * - Validation logic
 * - Sanitization
 * - CORS handling
 * - Client IP detection
 * - Rate limiting utilities
 */

'use strict';

const config = require('../config');

/**
 * Sanitize user input to prevent XSS
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .substring(0, 1000);
}

/**
 * Get client IP from request
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

/**
 * Normalize origin URL
 */
function normalizeOrigin(origin) {
  if (!origin) return '';
  return origin.toLowerCase().replace(/\/$/, ''); // Remove trailing slash
}

/**
 * Check if origin is allowed based on .env config
 */
function isOriginAllowed(origin) {
  if (!origin) return false;

  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = (config.api?.allowedOrigins || []);

  if (allowedOrigins.length === 0) {
    // In development, allow localhost
    if (config.isDevelopment?.()) {
      return (
        normalizedOrigin.includes('localhost') ||
        normalizedOrigin.includes('127.0.0.1')
      );
    }
    return false;
  }

  return allowedOrigins.some(allowed => {
    const normalizedAllowed = normalizeOrigin(allowed);
    return (
      normalizedOrigin === normalizedAllowed ||
      normalizedOrigin.startsWith(normalizedAllowed + ':')
    );
  });
}

/**
 * Set CORS headers for response
 */
function setCorsHeaders(res, origin) {
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/**
 * In-memory rate limiter (for single instance)
 * For production scalability, use Redis
 */
class RateLimiter {
  constructor(maxRequests = 5, windowMs = 3600000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.store = new Map();
    this.cleanup();
  }

  cleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.store.entries()) {
        if (now > record.resetAt) {
          this.store.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  check(identifier) {
    const now = Date.now();
    const record = this.store.get(identifier);

    if (!record) {
      this.store.set(identifier, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (now > record.resetAt) {
      record.count = 1;
      record.resetAt = now + this.windowMs;
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
      };
    }

    record.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }
}

module.exports = {
  sanitizeInput,
  getClientIp,
  isOriginAllowed,
  normalizeOrigin,
  setCorsHeaders,
  RateLimiter,
};
