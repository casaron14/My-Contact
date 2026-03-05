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
   * Format date for Google Sheets display
   * @private
   */
  formatDateForSheet(date) {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: config.app.timezone,
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
