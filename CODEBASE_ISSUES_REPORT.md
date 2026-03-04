# Codebase Issues Report

**Date:** March 4, 2026  
**Project:** My-Contact (Charity Aron Booking System)  
**Status:** 🚨 Critical Issues Found

---

## Executive Summary

This report identifies **7 critical issues** that are causing the application to break. These issues span configuration, module system inconsistencies, CORS conflicts, and dependency problems.

---

## 🚨 Critical Issues

### 1. Incomplete Vercel Configuration

**File:** [`vercel.json`](vercel.json)

**Problem:**
The configuration file only contains `{"version": 2}` with no API route definitions.

**Impact:**
- Vercel doesn't know how to route API requests
- `/api/submit` and `/api/book-slot` endpoints will return 404 errors
- Frontend cannot communicate with backend

**Current State:**
```json
{
  "version": 2
}
```

**Required Fix:**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "api/**/*.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    }
  ]
}
```

---

### 2. Module System Mismatch

**File:** [`api/book-slot.js`](api/book-slot.js)

**Problem:**
This file uses ES6 modules (`import`/`export`) while all other API files use CommonJS (`require`/`module.exports`).

**Lines 1-4:**
```javascript
import { google } from 'googleapis';
import { Buffer } from 'buffer';

export default async function handler(req, res) {
```

**Impact:**
- Will throw `SyntaxError: Cannot use import statement outside a module`
- Node.js requires `"type": "module"` in package.json (not present)
- Inconsistent with rest of codebase

**Required Fix:**
Convert to CommonJS:
```javascript
const { google } = require('googleapis');
const { Buffer } = require('buffer');

async function handler(req, res) {
  // ... existing code
}

module.exports = handler;
module.exports.default = handler;
```

---

### 3. Multiple API Version Confusion

**Files:**
- [`api/submit.js`](api/submit.js) - 659 lines (older version)
- [`api/submit-v2.js`](api/submit-v2.js) - 159 lines (newer version)
- [`api/book-slot.js`](api/book-slot.js) - 320 lines
- [`api/book-slot-v2.js`](api/book-slot-v2.js) - 200 lines

**Problem:**
- Frontend calls `/api/submit` ([booking.js:13](public/form/booking.js#L13))
- Unclear which version Vercel serves
- Duplicate logic and conflicting implementations
- Old versions have their own CORS/security logic that conflicts with centralized config

**Impact:**
- Unpredictable behavior
- Potential double-processing of requests
- Maintenance nightmare

**Recommendation:**
- Keep `-v2` versions (use centralized config)
- Remove or archive old versions
- Update frontend to explicitly use `/api/submit-v2` if needed

---

### 4. CORS Configuration Conflicts

**Problem:**
Multiple conflicting CORS setups across different files:

**Location 1:** [`config.js:129-133`](config.js#L129-L133)
```javascript
api: {
  rateLimitMax: parseInteger(getEnv('API_RATE_LIMIT_MAX'), 5),
  rateLimitWindowMs: parseInteger(getEnv('API_RATE_LIMIT_WINDOW_MS'), 3600000),
  allowedOrigins: (getEnv('ALLOWED_ORIGINS', '') || '')
    .split(',')
    .map(o => o.trim())
    .filter(o => o),
},
```

**Location 2:** [`config.js:139`](config.js#L139)
```javascript
security: {
  enableSecurityHeaders: !isDevelopment,
  enableCsrfProtection: !isDevelopment,
  corsOrigin: 'https://charityaron.vercel.app', // Hardcoded!
},
```

**Location 3:** [`api/submit.js:18-25`](api/submit.js#L18-L25)
```javascript
let ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(o => o);

if (ALLOWED_ORIGINS.length === 0) {
  ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
}
```

**Location 4:** [`lib/middleware.js:70-80`](lib/middleware.js#L70-L80)
```javascript
function handleCors(req, res) {
  const origin = req.headers.origin || req.headers.referer;
  
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    // ...
  }
}
```

**Impact:**
- Frontend requests from `https://charityaron.vercel.app` might be blocked
- Inconsistent CORS behavior across endpoints
- Difficult to debug CORS issues

**Environment Variable (`.env`):**
```env
ALLOWED_ORIGINS=https://charityaron.vercel.app
```

**Recommendation:**
- Use ONLY centralized `config.js` CORS settings
- Remove hardcoded values
- Ensure `https://` protocol is included in all origins

---

### 5. Failed Dependency Installation

**Terminal Output:**
```powershell
Terminal: powershell
Last Command: node install dotenv
Cwd: C:\Users\DELL\Desktop\Charity\My-Contact-main
Exit Code: 1
```

**Problem:**
- Wrong command! Should be `npm install dotenv`
- `node install` is not a valid command

**Impact:**
- `dotenv` package may not be installed
- Local development environment variables won't load
- Application may fail to start locally

**Required Fix:**
```bash
npm install dotenv
```

---

### 6. Environment Variables Not Loaded in Development

**File:** [`config.js`](config.js)

**Problem:**
The config module doesn't explicitly load the `.env` file using `dotenv`:

```javascript
'use strict';

// ============================================
// CONFIGURATION VALIDATION
// ============================================

function getEnv(key, defaultValue = undefined, required = false) {
  const value = process.env[key];
  // ...
}
```

**Impact:**
- On Vercel: OK (env vars set in dashboard)
- Local development: FAILS (`.env` not loaded)
- Developers can't run the app locally

**Required Fix:**
Add at the top of `config.js`:
```javascript
'use strict';

// Load environment variables in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
```

---

### 7. Potential Data Provider Issues

**File:** [`lib/providers/DataProvider.js:148`](lib/providers/DataProvider.js#L148)

**Problem:**
Duplicate check logic accesses array indices that may not exist:

```javascript
for (let i = 1; i < rows.length; i++) {
  if (rows[i][2] === email) {
    const submittedAt = rows[i][5];  // May be undefined!
    if (submittedAt) {
      const submitted = new Date(submittedAt);
      // ...
    }
  }
}
```

**Impact:**
- If Google Sheets structure differs from expected, will cause errors
- No validation that row has enough columns
- Could crash the duplicate check

**Recommendation:**
Add validation:
```javascript
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (row && row.length >= 6 && row[2] === email) {
    const submittedAt = row[5];
    // ...
  }
}
```

---

## ⚠️ Additional Concerns

### Google Sheets ID Mismatch
**`.env` file:**
```env
GOOGLE_SHEET_NAME=LEADS_SHEET
```

**`config.js` default:**
```javascript
sheetName: getEnv('GOOGLE_SHEET_NAME', 'Bookings'),
```

Ensure your Google Sheet has a tab named `LEADS_SHEET` or update the env var to match.

---

### Rate Limiting Store

**File:** [`lib/security.js:208-217`](lib/security.js#L208-L217)

**Issue:**
Using in-memory `Map()` for rate limiting:
```javascript
class RateLimiter {
  constructor(maxRequests = 5, windowMs = 3600000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.store = new Map();
```

**Impact:**
- Works on single server
- On Vercel (serverless), each function instance has separate memory
- Rate limiting won't work across multiple requests to different instances

**Recommendation:**
For production, use Redis or Vercel KV for shared rate limit state.

---

## 📋 Action Items (Priority Order)

### High Priority (Breaking Issues)

1. **Fix `vercel.json`** - Add proper API routing
2. **Convert `api/book-slot.js`** to CommonJS
3. **Install dependencies** - Run `npm install` (NOT `node install`)
4. **Add dotenv loader** to `config.js` for local development
5. **Remove duplicate API files** - Archive `api/submit.js` and `api/book-slot.js`, use `-v2` versions

### Medium Priority (Improving Reliability)

6. **Unify CORS configuration** - Remove hardcoded origins, use only `config.js`
7. **Add validation** to DataProvider duplicate check
8. **Verify Google Sheets tab name** matches `GOOGLE_SHEET_NAME` env var

### Low Priority (Future Improvements)

9. **Implement distributed rate limiting** using Redis/Vercel KV
10. **Add comprehensive error logging** with request IDs
11. **Create API documentation** for endpoint contracts

---

## 🔧 Quick Fix Commands

```bash
# 1. Install dependencies correctly
npm install

# 2. Verify dotenv is installed
npm list dotenv

# 3. Test local environment variable loading
node -e "require('dotenv').config(); console.log('VERCEL_URL:', process.env.VERCEL_URL)"

# 4. Deploy to Vercel after fixes
npm run deploy
```

---

## 📝 Testing Checklist

After fixes, test:

- [ ] `/api/submit-v2` returns 200 for valid booking
- [ ] `/api/book-slot-v2` creates calendar event
- [ ] CORS headers allow `https://charityaron.vercel.app`
- [ ] Rate limiting works (5 requests max per hour per IP)
- [ ] Google Sheets gets booking entry
- [ ] Telegram alert is sent
- [ ] Duplicate email check works
- [ ] Local dev server runs without errors

---

## 🔗 Related Files

- **Configuration:** `config.js`, `.env`, `vercel.json`
- **API Handlers:** `api/submit-v2.js`, `api/book-slot-v2.js`
- **Middleware:** `lib/middleware.js`, `lib/security.js`
- **Providers:** `lib/providers/DataProvider.js`, `lib/providers/NotificationProvider.js`
- **Frontend:** `public/form/booking.js`

---

## 📧 Contact

For questions about this report, contact the development team.

**Report Generated:** March 4, 2026  
**Status:** Awaiting fixes
