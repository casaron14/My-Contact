/**
 * POST /api/admin/auth
 *
 * Validates admin credentials and returns a signed session token.
 * Credentials are set via environment variables:
 *   ADMIN_USERNAME  (default: "admin")
 *   ADMIN_PASSWORD  (required — no default in production)
 */

'use strict';

const { createToken, safeCompare } = require('../../lib/admin-auth');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Allowed origins for CORS — never use wildcard on authenticated endpoints.
const _allowedOrigins = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
];

function _setCors(req, res, methods) {
  const origin = req.headers.origin;
  if (origin) {
    const norm = origin.toLowerCase().replace(/\/$/, '');
    const ok = norm.startsWith('http://localhost:')
      || norm.startsWith('http://127.0.0.1:')
      || _allowedOrigins.some(a => norm === a.toLowerCase().replace(/\/$/, ''));
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  _setCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password are required' });
  }

  // Constant-time comparisons — prevents timing-based enumeration
  const userMatch = safeCompare(username.toLowerCase().trim(), ADMIN_USERNAME.toLowerCase().trim());
  const passMatch = safeCompare(password, ADMIN_PASSWORD);

  if (!userMatch || !passMatch) {
    // Fixed 400 ms delay to slow brute-force without revealing which field was wrong
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  const token = createToken('admin');
  console.log(`✅ Admin login: ${username} at ${new Date().toISOString()}`);

  return res.status(200).json({ ok: true, token });
}

module.exports = handler;
module.exports.default = handler;
