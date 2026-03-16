/**
 * Google Sheets Service Provider
 * 
 * Abstraction for Google Sheets operations.
 * Implements interface for data persistence.
 * 
 * Usage:
 *   const googleService = new GoogleSheetsProvider();
 *   await googleService.appendRow(bookingData);
 */

'use strict';

const { google } = require('googleapis');
const config = require('../../config');

/**
 * Interface for data persistence providers
 * Implement this to swap providers (e.g., Firebase, Supabase, etc.)
 */
class DataProvider {
  async appendBooking(bookingData) {
    throw new Error('appendBooking not implemented');
  }

  async findBookingByEmail(email) {
    throw new Error('findBookingByEmail not implemented');
  }

  async getAllBookings(filters = {}) {
    throw new Error('getAllBookings not implemented');
  }

  async updateBooking(bookingId, updates) {
    throw new Error('updateBooking not implemented');
  }
}

/**
 * Google Sheets Implementation
 */
class GoogleSheetsProvider extends DataProvider {
  constructor() {
    super();
    this.auth = this.createAuth();
    this.sheets = null;
  }

  /**
   * Create Google authentication
   * @private
   */
  createAuth() {
    if (!config.google.serviceAccountEmail || !config.google.privateKey) {
      if (config.isProduction()) {
        throw new Error('Google credentials not configured');
      }
      return null; // Development mode
    }

    return new google.auth.JWT({
      email: config.google.serviceAccountEmail,
      key: config.google.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  /**
   * Initialize sheets client
   * @private
   */
  async initializeSheets() {
    if (!this.auth && config.isProduction()) {
      throw new Error('Google Sheets not authenticated');
    }
    
    if (!this.sheets && this.auth) {
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    }
    
    return this.sheets;
  }

  /**
   * Append a booking row to Google Sheets
   * @param {Object} bookingData - Booking information
   * @returns {Promise<string>} Booking ID
   */
  async appendBooking(bookingData) {
    if (!this.auth) {
      console.warn('[DEV MODE] Google Sheets append skipped');
      return `dev-${Date.now()}`;
    }

    const sheets = await this.initializeSheets();
    const bookingId = `B-${Date.now()}`;

    const values = [[
      bookingId,
      bookingData.fullName,
      bookingData.email,
      bookingData.phone,
      bookingData.status,
      bookingData.submittedAt,
      this.formatDateForSheet(new Date(bookingData.slotDateTime)),
      bookingData.slotDateTime,
      bookingData.intent,
      bookingData.source,
      new Date().toISOString(),
    ]];

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: config.google.sheetsId,
        range: `${config.google.sheetName}!A:K`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });

      console.log(`✓ Booking saved to Sheets: ${bookingId}`);
      return bookingId;
    } catch (error) {
      console.error('✗ Google Sheets error:', error.message);
      throw new Error(`Failed to save booking: ${error.message}`);
    }
  }

  /**
   * Find existing booking by email within last 24 hours
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Booking data or null
   */
  async findBookingByEmail(email) {
    if (!this.auth) {
      console.warn('[DEV MODE] Duplicate check skipped');
      return null;
    }

    const sheets = await this.initializeSheets();

    try {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: config.google.sheetsId,
        range: `${config.google.sheetName}!A:C`,
      });

      const rows = result.data.values || [];
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (let i = 1; i < rows.length; i++) {
        if (rows[i][2] === email) {
          const submittedAt = rows[i][5];
          if (submittedAt) {
            const submitted = new Date(submittedAt);
            if (submitted > oneDayAgo) {
              return {
                id: rows[i][0],
                name: rows[i][1],
                email: rows[i][2],
              };
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.warn('Error checking for duplicates:', error.message);
      return null; // Don't block on duplicate check failure
    }
  }

  /**
   * Get all bookings with optional filters
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Bookings
   */
  async getAllBookings(filters = {}) {
    if (!this.auth) {
      return [];
    }

    const sheets = await this.initializeSheets();

    try {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: config.google.sheetsId,
        range: `${config.google.sheetName}!A:K`,
      });

      const rows = result.data.values || [];
      const header = rows[0] || [];

      // Skip header and convert rows to objects
      return rows.slice(1).map(row => ({
        id: row[0],
        name: row[1],
        email: row[2],
        phone: row[3],
        status: row[4],
        submittedAt: row[5],
        slotFormatted: row[6],
        slotDateTime: row[7],
        intent: row[8],
        source: row[9],
      }));
    } catch (error) {
      console.error('Error fetching bookings:', error.message);
      return [];
    }
  }

  /**
   * Update booking
   * @param {string} bookingId - Booking ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>}
   */
  async updateBooking(bookingId, updates) {
    if (!this.auth) {
      console.warn('[DEV MODE] Update skipped');
      return true;
    }

    console.log(`Update booking ${bookingId}:`, updates);
    // Implementation depends on sheet structure
    return true;
  }

  /**
   * Append a seminar sign-up lead to the first sheet of the spreadsheet
   * (the "phone response sheet"). Columns: Timestamp | Name | Email | Phone | Location | Source
   * @param {Object} leadData - { name, email, phone, location, status, submittedAt, source }
   * @returns {Promise<string>} Lead ID
   */
  async appendSeminarLead(leadData) {
    if (!this.auth) {
      console.warn('[DEV MODE] Google Sheets seminar lead append skipped');
      return `dev-S-${Date.now()}`;
    }

    const sheets = await this.initializeSheets();
    const leadId = `S-${Date.now()}`;

    // Resolve target sheet name.
    // Priority: 1) SEMINAR_SHEET_NAME env var  2) first sheet of the spreadsheet
    let sheetName = config.google.seminarSheetName || '';
    if (!sheetName) {
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId: config.google.sheetsId,
          fields: 'sheets.properties.title',
        });
        sheetName = meta.data.sheets[0].properties.title;
        console.log(`ℹ️  Seminar: writing to first sheet "${sheetName}"`);
      } catch (metaErr) {
        console.warn('Could not fetch sheet metadata, defaulting to "Form Responses 1":', metaErr.message);
        sheetName = 'Form Responses 1';
      }
    }

    // Row layout: Timestamp | Name | Email | Phone | Location | Source | Lead ID
    const values = [[
      new Date().toISOString(),        // A: Timestamp
      leadData.name        || '',      // B: Full Name
      leadData.email,                  // C: Email Address
      leadData.phone,                  // D: Phone / WhatsApp
      leadData.location    || '',      // E: Location (city & country)
      leadData.source      || 'seminar-signup', // F: Source
      leadId,                          // G: Lead ID (for reference)
    ]];

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId:    config.google.sheetsId,
        range:            `'${sheetName}'!A:G`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody:      { values },
      });

      console.log(`✓ Seminar lead saved to sheet "${sheetName}": ${leadId}`);
      return leadId;
    } catch (error) {
      console.error('✗ Google Sheets seminar lead error:', error.message);
      throw new Error(`Failed to save seminar lead: ${error.message}`);
    }
  }

  /**
   * Format date for Google Sheets display
   * @private
   */
  formatDateForSheet(date) {
    return date.toLocaleString('en-GB', { // en-GB locale uses 24-hour format
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: config.app.timezone,
      hour12: false, // Explicitly set 24-hour format
    });
  }
}

/**
 * Factory function to get data provider
 * @param {string} provider - Provider name (default: 'google-sheets')
 * @returns {DataProvider}
 */
function createDataProvider(provider = 'google-sheets') {
  switch (provider) {
    case 'google-sheets':
      return new GoogleSheetsProvider();
    default:
      throw new Error(`Unknown data provider: ${provider}`);
  }
}

module.exports = {
  DataProvider,
  GoogleSheetsProvider,
  createDataProvider,
};
