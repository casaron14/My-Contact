/**
 * GET /api/admin/bookings
 *
 * Returns all bookings, most recent first.
 * Supports optional query params:
 *   ?q=<search>   – filter by name/email/phone
 *   ?intent=<key> – filter by intent
 *   ?status=<val> – filter by status
 * Requires a valid admin Bearer token.
 */

'use strict';

const { requireAdminAuth } = require('../../lib/admin-auth');
const { createDataProvider } = require('../../lib/providers/DataProvider');

const dataProvider = createDataProvider('google-sheets');

// Allowed origins — never use wildcard on authenticated endpoints.
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
  _setCors(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const all = await dataProvider.getAllBookings().catch(() => []);

    // Sort most recent first
    const bookings = [...all].sort(
      (a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0)
    );

    // Optional filters from query string
    const q      = (req.query?.q      || '').toLowerCase().trim();
    const intent = (req.query?.intent || '').toLowerCase().trim();
    const status = (req.query?.status || '').toLowerCase().trim();

    const filtered = bookings.filter(b => {
      if (q && ![b.name, b.email, b.phone, b.id]
            .join(' ').toLowerCase().includes(q)) return false;
      if (intent && (b.intent || '').toLowerCase() !== intent) return false;
      if (status && (b.status || '').toLowerCase() !== status) return false;
      return true;
    });

    return res.status(200).json({
      ok: true,
      total: filtered.length,
      bookings: filtered,
    });

  } catch (error) {
    console.error('Admin bookings error:', error.message);
    return res.status(500).json({ ok: false, error: 'Failed to load bookings' });
  }
}

module.exports = handler;
module.exports.default = handler;
