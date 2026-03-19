/**
 * Admin Authentication Helpers
 *
 * Lightweight signed-token auth for the admin dashboard.
 * Uses Node's built-in crypto (HMAC-SHA256) — no extra dependencies.
 *
 * Token format:  base64url(JSON payload) + "." + HMAC-SHA256 signature
 */

'use strict';

const crypto = require('crypto');

// In production the secret MUST be set — a missing/weak secret lets anyone forge tokens.
const _rawSecret = process.env.ADMIN_SECRET;
if (!_rawSecret && process.env.NODE_ENV === 'production') {
  // Crash loudly rather than fall back to a known string.
  throw new Error('FATAL: ADMIN_SECRET environment variable is not set in production.');
}
const SECRET    = _rawSecret || 'dev-admin-secret-change-in-production';
const TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 hours

// ─── Token creation ───────────────────────────────────────────────────────────

function createToken(adminId) {
  const payload = {
    adminId,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// ─── Token verification ───────────────────────────────────────────────────────

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;

  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);

  try {
    const expected = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    // Constant-time comparison – both must be same length
    const eBuf = Buffer.from(expected);
    const sBuf = Buffer.from(sig.padEnd(expected.length, '\0').slice(0, expected.length));
    if (sig.length !== expected.length || !crypto.timingSafeEqual(eBuf, sBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

// ─── Request middleware ───────────────────────────────────────────────────────

/**
 * Extract and verify the Bearer token from the request.
 * Writes 401 and returns null on failure.
 */
function requireAdminAuth(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ ok: false, error: 'Unauthorized – no token' });
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ ok: false, error: 'Unauthorized – invalid or expired session' });
    return null;
  }

  return payload;
}

// ─── Password comparison ──────────────────────────────────────────────────────

/**
 * Constant-time string comparison via SHA-256 hashes.
 * Safe against timing attacks regardless of string length.
 */
function safeCompare(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { createToken, verifyToken, requireAdminAuth, safeCompare };
