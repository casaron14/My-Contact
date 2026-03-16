/**
 * Centralized Configuration Module
 * 
 * Validates all required environment variables at startup.
 * Fails fast if critical config is missing.
 * Prevents scattered use of process.env throughout the application.
 * 
 * Usage:
 *   const config = require('./config');
 *   const googleEmailError = config.google.serviceAccountEmail;
 */

'use strict';

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ============================================
// CONFIGURATION VALIDATION
// ============================================

/**
 * Get environment variable with optional fallback
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Optional default if not set
 * @param {boolean} required - If true, throws error when missing
 * @returns {string|*}
 */
function getEnv(key, defaultValue = undefined, required = false) {
  const value = process.env[key];

  if (!value) {
    if (required) {
      throw new Error(
        `FATAL: Required environment variable "${key}" is not configured.\n` +
        `Please set it in your .env file or deployment platform.`
      );
    }
    return defaultValue;
  }

  return value;
}

/**
 * Validate that a value is a valid boolean
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Validate that a value is a positive integer
 */
function parseInteger(value, defaultValue = 0) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================
// ENVIRONMENT DETECTION
// ============================================

const environment = (getEnv('ENVIRONMENT') || getEnv('NODE_ENV') || 'development').toLowerCase();
const isProduction = environment === 'production';
const isPreview = environment === 'preview';
const isDevelopment = !isProduction && !isPreview;

// ============================================
// CONFIGURATION OBJECT
// ============================================

const config = {
  // ========== APP ENVIRONMENT ==========
  environment,
  isProduction,
  isPreview,
  isDevelopment,
  nodeEnv: getEnv('NODE_ENV', 'development'),

  // ========== LOGGING & DEBUG ==========
  debug: parseBoolean(getEnv('DEBUG', isDevelopment)),
  logLevel: getEnv('LOG_LEVEL', isProduction ? 'error' : 'debug'),

  // ========== SERVER & DEPLOYMENT ==========
  port: parseInteger(getEnv('PORT'), 3000),
  vercelUrl: getEnv('VERCEL_URL'),

  // ========== GOOGLE SERVICES ==========
  google: {
    serviceAccountEmail: getEnv(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      undefined,
      isProduction // Required in production
    ),
    privateKey: getEnv('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n') || undefined,
    projectId: getEnv('GOOGLE_PROJECT_ID', undefined, isProduction),
    calendarId: getEnv('GOOGLE_CALENDAR_ID', 'primary'), // Calendar ID to use for bookings
    sheetsId: getEnv('GOOGLE_SHEET_ID', undefined, isProduction),
    sheetName: getEnv('GOOGLE_SHEET_NAME', 'Bookings'),
    // Sheet name for seminar sign-ups. Leave blank (default) to always use
    // the FIRST sheet of the spreadsheet regardless of its name.
    seminarSheetName: getEnv('SEMINAR_SHEET_NAME', ''),
  },

  // ========== SLOT PROVIDER ==========
  // Controls where booked slots are stored for availability checking.
  // 'database' = Supabase (recommended)  |  'calendar' = Google Calendar (legacy)
  slotProvider: getEnv('SLOT_PROVIDER', 'database'),

  // ========== SUPABASE (used when SLOT_PROVIDER=database) ==========
  supabase: {
    url: getEnv('SUPABASE_URL'),
    serviceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },

  // ========== TELEGRAM NOTIFICATIONS ==========
  telegram: {
    botToken: getEnv('TG_BOT_TOKEN', undefined, isProduction),
    chatId: getEnv('TG_CHAT_ID', undefined, isProduction),
    // Dev mode bypasses actual sends
    enabled: !isDevelopment && !!getEnv('TG_BOT_TOKEN'),
  },

  // ========== APPS SCRIPT INTEGRATION ==========
  // Deploy your code.gs as a Web App and paste the URL here.
  // Used by /api/seminar to trigger client confirmation emails via MailApp.
  appsScriptWebhookUrl: getEnv('APPS_SCRIPT_WEBHOOK_URL', ''),

  // ========== APPLICATION SETTINGS ==========
  app: {
    reminderEmail: getEnv('REMINDER_EMAIL', 'noreply@charityaron.com'),
    timezone: getEnv('BOOKING_TIMEZONE', 'Africa/Nairobi'),
  },

  // ========== BOOKING CONFIGURATION ==========
  // Sessions: Mon–Fri, 4:00 PM – 6:00 PM, 25-min slots with 5-min breaks
  booking: {
    slotStartHour: parseInteger(getEnv('BOOKING_SLOT_START_HOUR'), 16),   // 4 PM
    slotEndHour: parseInteger(getEnv('BOOKING_SLOT_END_HOUR'), 18),       // 6 PM
    slotDurationMin: parseInteger(getEnv('BOOKING_SLOT_DURATION_MIN'), 25), // 25-min session
    slotBreakMin: parseInteger(getEnv('BOOKING_SLOT_BREAK_MIN'), 5),        // 5-min break
    daysAvailable: parseInteger(getEnv('BOOKING_DAYS_AVAILABLE'), 7),       // look 7 days ahead to always find weekday slots
  },

  // ========== API SECURITY ==========
  api: {
    rateLimitMax: parseInteger(getEnv('API_RATE_LIMIT_MAX'), 5),
    rateLimitWindowMs: parseInteger(getEnv('API_RATE_LIMIT_WINDOW_MS'), 3600000),
    allowedOrigins: (getEnv('ALLOWED_ORIGINS', '') || '')
      .split(',')
      .map(o => o.trim())
      .filter(o => o),
  },

  // ========== SECURITY & MONITORING ==========
  security: {
    enableSecurityHeaders: !isDevelopment,
    enableCsrfProtection: !isDevelopment,
    corsOrigin: 'https://charityaron.vercel.app', // Change for your domain
  },
};

// ============================================
// VALIDATION & INITIALIZATION
// ============================================

/**
 * Validate critical configuration
 */
function validateConfig() {
  const errors = [];

  // In production, check for required Google credentials
  if (isProduction) {
    if (!config.google.serviceAccountEmail) {
      errors.push('GOOGLE_SERVICE_ACCOUNT_EMAIL is required in production');
    }
    if (!config.google.privateKey) {
      errors.push('GOOGLE_PRIVATE_KEY is required in production');
    }
    if (!config.google.sheetsId) {
      errors.push('GOOGLE_SHEET_ID is required in production');
    }
    if (!config.telegram.botToken) {
      errors.push('TG_BOT_TOKEN is required in production');
    }
    if (!config.telegram.chatId) {
      errors.push('TG_CHAT_ID is required in production');
    }

    // Validate slot provider credentials
    if (config.slotProvider === 'database') {
      if (!config.supabase.url) errors.push('SUPABASE_URL is required in production when SLOT_PROVIDER=database');
      if (!config.supabase.serviceRoleKey) errors.push('SUPABASE_SERVICE_ROLE_KEY is required in production when SLOT_PROVIDER=database');
    } else if (config.slotProvider === 'calendar') {
      if (!config.google.calendarId || config.google.calendarId === 'primary') {
        errors.push('GOOGLE_CALENDAR_ID must be set to a specific calendar ID when SLOT_PROVIDER=calendar');
      }
    }
  }

  // Validate allowed origins
  if (config.api.allowedOrigins.length === 0 && isProduction) {
    errors.push('ALLOWED_ORIGINS must be configured in production');
  }

  if (errors.length > 0) {
    console.error('❌ CONFIGURATION ERROR:');
    errors.forEach(err => console.error(`   - ${err}`));
    console.error('\nRefer to .env.example for required settings.');
    
    // In production, crash the app
    if (isProduction) {
      process.exit(1);
    }
  } else if (!isDevelopment) {
    console.log('✅ Configuration validated successfully');
  }
}

// ============================================
// SAFE LOGGING (NEVER LOG SECRETS)
// ============================================

/**
 * Get a sanitized version of config for logging
 * Never logs actual secrets
 */
function getLoggableConfig() {
  return {
    environment,
    nodeEnv: config.nodeEnv,
    debug: config.debug,
    logLevel: config.logLevel,
    port: config.port,
    vercelUrl: config.vercelUrl,
    google: {
      projectId: config.google.projectId,
      sheetsId: config.google.sheetsId ? '[SET]' : '[NOT SET]',
      serviceAccountEmail: config.google.serviceAccountEmail ? '[SET]' : '[NOT SET]',
    },
    telegram: {
      enabled: config.telegram.enabled,
      botToken: config.telegram.botToken ? '[SET]' : '[NOT SET]',
    },
    api: {
      rateLimitMax: config.api.rateLimitMax,
      rateLimitWindowMs: config.api.rateLimitWindowMs,
      allowedOriginCount: config.api.allowedOrigins.length,
    },
  };
}

// ============================================
// EXPORTS
// ============================================

// Validate on module load
validateConfig();

module.exports = {
  // Main config object
  ...config,

  // Validation helpers
  validateConfig,
  getLoggableConfig,

  // Environment check helpers
  isProduction: () => isProduction,
  isDevelopment: () => isDevelopment,
  isPreview: () => isPreview,

  // Safe getter for secrets (development only)
  get: (key) => {
    if (isDevelopment) {
      return process.env[key];
    }
    return undefined; // Never expose secrets in production
  },
};

// Log config on startup (if not in production)
if (isDevelopment) {
  const loggable = getLoggableConfig();
  console.log('📋 Configuration Loaded:');
  console.log(JSON.stringify(loggable, null, 2));
}
