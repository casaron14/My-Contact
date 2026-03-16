/**
 * Seminar Sign-Up API Handler
 *
 * Collects prospective attendee details (name, email, phone, location)
 * for upcoming seminars. Saves to the Google Sheet and sends a Telegram alert.
 *
 * POST /api/seminar
 * Body: { name?, email, phone, location }
 */

'use strict';

const { createDataProvider }       = require('../lib/providers/DataProvider');
const { createNotificationProvider } = require('../lib/providers/NotificationProvider');
const { sanitizeInput, isValidEmail, isValidName, isValidPhone } = require('../lib/security');
const { createSecurityMiddleware, handleApiError, logger } = require('../lib/middleware');
const config                         = require('../config');

// Initialise services (module-level for Vercel function reuse)
const dataProvider       = createDataProvider('google-sheets');
const notificationProvider = createNotificationProvider('auto');
const securityMiddleware = createSecurityMiddleware();

// In-memory duplicate submission guard: normalised email → submission timestamp
// Prevents the same email from submitting more than once within 10 minutes
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const recentSubmissions = new Map();

/**
 * Main handler
 */
async function handler(req, res) {
    try {
        // Apply security middleware (CORS, rate limiting, headers)
        const securityCheck = await securityMiddleware(req, res);
        if (securityCheck !== null) return;

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ ok: false, error: 'Method not allowed' });
        }

        const body = req.body;
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ ok: false, error: 'Request body is required' });
        }

        // ==================== SANITISE ====================

        const name     = sanitizeInput(body.name || '');
        const email    = sanitizeInput(body.email || '').toLowerCase();
        const phone    = sanitizeInput(body.phone || '');
        const location = sanitizeInput(body.location || '');

        // ==================== VALIDATE ====================

        if (!isValidName(name)) {
            return res.status(400).json({ ok: false, error: 'Please enter your full name (2–100 characters).' });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ ok: false, error: 'A valid email address is required.' });
        }

        if (!isValidPhone(phone)) {
            return res.status(400).json({ ok: false, error: 'Phone must include your country code (e.g. +255712345678).' });
        }

        if (!location || location.trim().length < 2) {
            return res.status(400).json({ ok: false, error: 'Please provide your city and country.' });
        }

        // ==================== DUPLICATE CHECK ====================

        // Prune expired entries first
        const now = Date.now();
        for (const [key, ts] of recentSubmissions) {
            if (now - ts > DEDUP_WINDOW_MS) recentSubmissions.delete(key);
        }

        if (recentSubmissions.has(email)) {
            logger.warn('⚠️  Duplicate seminar submission blocked', { email });
            return res.status(409).json({
                ok: false,
                error: "You've already registered with this email. Check your inbox for our confirmation.",
            });
        }

        // Record this submission immediately to block rapid re-submits
        recentSubmissions.set(email, now);

        logger.info('📋 Seminar sign-up received', { email });

        // ==================== SAVE TO SHEET ====================

        const leadData = {
            name:        name || 'Seminar Lead',
            email,
            phone,
            location,
            status:      'Seminar Interest',
            submittedAt: new Date().toISOString(),
            source:      'seminar-signup',
        };

        // ==================== ROUTE TO APPS SCRIPT (sheet + Telegram + email in one call) ====================
        // code.gs _handleSeminarSignup() does everything: writes to sheet, sends Telegram alert,
        // and sends the client confirmation email via MailApp — all in the Google environment.

        if (config.appsScriptWebhookUrl) {
            try {
                const gsResp = await fetch(config.appsScriptWebhookUrl, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ type: 'seminar', ...leadData }),
                });
                const gsJson = await gsResp.json().catch(() => ({}));
                const leadId = gsJson.leadId || ('S-' + Date.now());
                logger.info('✅ Apps Script handled seminar (sheet + email)', { leadId, email });

                return res.status(201).json({
                    ok:      true,
                    leadId,
                    message: "Thank you! We'll be in touch about upcoming seminars near you.",
                });
            } catch (gsErr) {
                // Remove from dedup map so the user can retry after a real network failure
                recentSubmissions.delete(email);
                logger.warn('⚠️  Apps Script call failed, falling back to direct sheet write', { error: gsErr.message });
            }
        }

        // ==================== FALLBACK: save to sheet directly if Apps Script URL not set ====================

        const leadId = await dataProvider.appendSeminarLead(leadData);
        logger.info('✅ Seminar lead saved directly to sheet', { leadId, email });

        try {
            await notificationProvider.sendSeminarAlert(leadData);
        } catch (notifErr) {
            logger.warn('⚠️  Seminar Telegram alert failed', { error: notifErr.message });
        }

        if (!config.appsScriptWebhookUrl) {
            logger.info('[DEV] APPS_SCRIPT_WEBHOOK_URL not set — set it to enable confirmation emails');
        }

        // ==================== RESPONSE (fallback path) ====================

        return res.status(201).json({
            ok:      true,
            leadId,
            message: "Thank you! We'll be in touch about upcoming seminars near you.",
        });

    } catch (err) {
        return handleApiError(err, req, res);
    }
}

module.exports = handler;
