/**
 * Local Development Server
 *
 * Runs the API handlers and serves the public/ folder ΓÇö no Vercel account
 * or CLI linking required.
 *
 * Usage:
 *   node dev-server.js          (or: npm run dev:local)
 *
 * What runs in dev mode:
 *   Γ£à GET  /api/get-slots  ΓÇö returns real slot schedule (MonΓÇôFri, 4ΓÇô6 PM, 25 min)
 *   Γ£à POST /api/submit     ΓÇö processes bookings (Sheets/Supabase/Telegram are STUBBED)
 *   Γ£à Static files from public/
 *
 *   In dev mode every external service call gracefully falls back to a stub:
 *   ΓÇó Google Sheets  ΓåÆ returns a "dev-<timestamp>" booking ID  (no real write)
 *   ΓÇó Supabase       ΓåÆ skips DB insert; all slots appear available
 *   ΓÇó Telegram       ΓåÆ notification silently skipped
 *   ΓÇó Form submit    ΓåÆ frontend on localhost uses a mock response client-side
 *                      (you can still test the API directly with curl/Postman)
 */

'use strict';

// Load .env before anything else
require('dotenv').config();

const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const PORT       = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ΓöÇΓöÇΓöÇ MIME types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.vcf':  'text/vcard',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain',
};

// ΓöÇΓöÇΓöÇ Decorate native ServerResponse to look like Express / Vercel ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function decorateResponse(nativeRes) {
  nativeRes._statusCode = 200;

  nativeRes.status = function (code) {
    this._statusCode = code;
    this.statusCode  = code;
    return this;
  };

  nativeRes.json = function (data) {
    this.statusCode = this._statusCode;
    if (!this.headersSent) {
      this.setHeader('Content-Type', 'application/json');
    }
    this.end(JSON.stringify(data));
    return this;
  };

  return nativeRes;
}

// ΓöÇΓöÇΓöÇ Body parser ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST' && req.method !== 'PUT') {
      req.body = null;
      return resolve();
    }

    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString();
      if (raw.length > 200_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        req.body = raw ? JSON.parse(raw) : null;
      } catch {
        req.body = null; // let API handler reject malformed JSON
      }
      resolve();
    });
  });
}

// ΓöÇΓöÇΓöÇ Query string parser ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)));
}

// ΓöÇΓöÇΓöÇ Static file server ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function serveStatic(reqPath, res) {
  // Strip query string
  const clean = reqPath.split('?')[0];

  // Prevent path-traversal attacks
  const abs = path.resolve(PUBLIC_DIR, '.' + clean);
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.statusCode = 400;
    return res.end('Bad Request');
  }

  let target = abs;

  // Directory ΓåÆ index.html
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html');
      return res.end('<h2>404 ΓÇô Not Found</h2>');
    }
    const ext  = path.extname(target).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.end(data);
  });
}

// ΓöÇΓöÇΓöÇ API routes ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Handlers are required fresh on each request in dev mode so code changes
// are picked up without restarting the server.
function clearModuleCache(filePath) {
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];
}

async function handleApi(cleanPath, req, res) {
  if (cleanPath === '/api/get-slots') {
    clearModuleCache('./api/get-slots');
    const handler = require('./api/get-slots');
    await handler(req, res);
    return;
  }

  if (cleanPath === '/api/submit') {
    clearModuleCache('./api/submit');
    const handler = require('./api/submit');
    await handler(req, res);
    return;
  }

  if (cleanPath === '/api/seminar') {
    clearModuleCache('./api/seminar');
    const handler = require('./api/seminar');
    await handler(req, res);
    return;
  }

  // ── Admin API routes ──────────────────────────────────────────
  if (cleanPath === '/api/admin/auth') {
    clearModuleCache('./api/admin/auth');
    const handler = require('./api/admin/auth');
    await handler(req, res);
    return;
  }

  if (cleanPath === '/api/admin/stats') {
    clearModuleCache('./api/admin/stats');
    const handler = require('./api/admin/stats');
    await handler(req, res);
    return;
  }

  if (cleanPath === '/api/admin/bookings') {
    clearModuleCache('./api/admin/bookings');
    const handler = require('./api/admin/bookings');
    await handler(req, res);
    return;
  }

  res.status(404).json({ ok: false, error: `Unknown API endpoint: ${cleanPath}` });
}

// ΓöÇΓöÇΓöÇ Main server ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const server = http.createServer(async (nativeReq, nativeRes) => {
  const res      = decorateResponse(nativeRes);
  const url      = nativeReq.url || '/';
  const cleanUrl = url.split('?')[0];

  nativeReq.query = parseQuery(url);

  const label = `${nativeReq.method.padEnd(5)} ${url}`;

  if (cleanUrl.startsWith('/api/')) {
    try {
      await parseBody(nativeReq);
      console.log(`ΓåÆ ${label}`);
      await handleApi(cleanUrl, nativeReq, res);
      console.log(`ΓåÉ ${res._statusCode} ${cleanUrl}`);
    } catch (err) {
      console.error(`Γ£ù API error on ${cleanUrl}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Internal server error' });
      }
    }
    return;
  }

  // Static files
  serveStatic(url, res);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nΓ¥î  Port ${PORT} is already in use. Set a different PORT in .env.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('\nΓòöΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòù');
  console.log('Γòæ        Local Dev Server ΓÇö Charity Aron           Γòæ');
  console.log('ΓòÜΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓò¥');
  console.log(`\n  ≡ƒîÉ  Home:       http://localhost:${PORT}/`);
  console.log(`  ≡ƒôà  Book page:  http://localhost:${PORT}/form/book.html`);
  console.log(`  ≡ƒöî  Slots API:  http://localhost:${PORT}/api/get-slots`);
  console.log(`  ≡ƒô¥  Submit API: http://localhost:${PORT}/api/submit  (POST)\n`);
  console.log(`  NODE_ENV : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Timezone : ${process.env.BOOKING_TIMEZONE || 'Africa/Nairobi'}`);
  console.log(`  Slots    : MonΓÇôFri  16:00ΓÇô18:00  25-min  (4 per day)`);
  console.log(`  Provider : ${process.env.SLOT_PROVIDER || 'database'} (stub ΓÇö no real DB writes)\n`);
  console.log('  External services (Google/Supabase/Telegram) are STUBBED in dev mode.');
  console.log('  Press Ctrl+C to stop.\n');
});
