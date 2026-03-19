/**
 * GET /api/admin/stats
 *
 * Returns summary statistics for the admin dashboard.
 * Requires a valid admin Bearer token.
 */

'use strict';

const { requireAdminAuth } = require('../../lib/admin-auth');
const { createDataProvider } = require('../../lib/providers/DataProvider');
const { getAvailableSlots } = require('../book-slot');

const dataProvider = createDataProvider('google-sheets');

const INTENT_LABELS = {
  safe_start: 'Start Investing Safely',
  education:  'Crypto Education',
  strategy:   'Better Strategy',
};

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
    // Fetch bookings and upcoming slots in parallel
    const [bookings, slots] = await Promise.all([
      dataProvider.getAllBookings().catch(() => []),
      getAvailableSlots({ daysAhead: 7 }).catch(() => []),
    ]);

    const now          = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek  = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7)); // Mon
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Intent breakdown with friendly labels
    const byIntent = {};
    bookings.forEach(b => {
      const key   = b.intent || 'unknown';
      const label = INTENT_LABELS[key] || key;
      byIntent[label] = (byIntent[label] || 0) + 1;
    });

    // Status breakdown
    const byStatus = {};
    bookings.forEach(b => {
      const s = b.status || 'Unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    // Upcoming booked slots (slots within next 7 days that are taken)
    const upcomingBooked = slots.filter(s => !s.available);

    const stats = {
      bookings: {
        total:     bookings.length,
        thisMonth: bookings.filter(b => b.submittedAt && new Date(b.submittedAt) >= startOfMonth).length,
        thisWeek:  bookings.filter(b => b.submittedAt && new Date(b.submittedAt) >= startOfWeek).length,
        today:     bookings.filter(b => b.submittedAt && new Date(b.submittedAt) >= startOfToday).length,
      },
      slots: {
        nextWeekTotal:     slots.length,
        nextWeekAvailable: slots.filter(s => s.available).length,
        nextWeekBooked:    upcomingBooked.length,
        upcomingBooked:    upcomingBooked.map(s => s.dateTime),
      },
      byIntent,
      byStatus,
      // Full list of today's bookings sorted by slot time
      todayBookings: [...bookings]
        .filter(b => b.submittedAt && new Date(b.submittedAt) >= startOfToday)
        .sort((a, b) => new Date(a.slotDateTime || 0) - new Date(b.slotDateTime || 0)),
      // 5 most recent bookings (most recent first)
      recent: [...bookings]
        .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
        .slice(0, 5),
    };

    return res.status(200).json({ ok: true, stats });

  } catch (error) {
    console.error('Admin stats error:', error.message);
    return res.status(500).json({ ok: false, error: 'Failed to load stats' });
  }
}

module.exports = handler;
module.exports.default = handler;
