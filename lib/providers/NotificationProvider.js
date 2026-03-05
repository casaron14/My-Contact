/**
 * Notification Service Providers
 * 
 * Abstract interface for sending notifications.
 * Implementations: Telegram, Slack, Email, etc.
 * 
 * Usage:
 *   const notificationService = createNotificationProvider('telegram');
 *   await notificationService.sendBookingConfirmation(bookingData);
 */

'use strict';

const config = require('../../config');

/**
 * Interface for notification providers
 */
class NotificationProvider {
  async sendBookingConfirmation(bookingData) {
    throw new Error('sendBookingConfirmation not implemented');
  }

  async sendAlert(message, metadata = {}) {
    throw new Error('sendAlert not implemented');
  }

  async sendEmail(to, subject, body) {
    throw new Error('sendEmail not implemented');
  }
}

/**
 * Telegram Notification Service
 */
class TelegramProvider extends NotificationProvider {
  constructor() {
    super();
    this.botToken = config.telegram.botToken;
    this.chatId = config.telegram.chatId;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send booking confirmation alert
   */
  async sendBookingConfirmation(bookingData) {
    if (!config.telegram.enabled) {
      console.warn('[DEV MODE] Telegram alert skipped');
      return { success: true, isDev: true };
    }

    try {
      const message = this.buildBookingMessage(bookingData);
      return await this.sendMessage(message);
    } catch (error) {
      console.error('✗ Telegram booking alert failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send generic alert
   */
  async sendAlert(message, metadata = {}) {
    if (!config.telegram.enabled) {
      console.warn('[DEV MODE] Telegram alert skipped');
      return { success: true, isDev: true };
    }

    try {
      let formattedMessage = message;
      if (Object.keys(metadata).length > 0) {
        formattedMessage += '\n\n' + Object.entries(metadata)
          .map(([key, val]) => `*${key}:* ${val}`)
          .join('\n');
      }
      return await this.sendMessage(formattedMessage);
    } catch (error) {
      console.error('✗ Telegram alert failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send message via Telegram
   * @private
   */
  async sendMessage(message) {
    try {
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.statusText}`);
      }

      console.log('✓ Telegram message sent');
      return { success: true };
    } catch (error) {
      console.error('Telegram send error:', error.message);
      throw error;
    }
  }

  /**
   * Build formatted booking message
   * @private
   */
  buildBookingMessage(bookingData) {
    const slotDate = new Date(bookingData.slotDateTime).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: config.app.timezone,
    });

    const waLink = `https://wa.me/${bookingData.phone.replace(/\D/g, '')}`;

    return `✅ *NEW BOOKING CONFIRMED*\n\n` +
      `*Name:* ${this.escape(bookingData.fullName)}\n` +
      `*Email:* ${bookingData.email}\n` +
      `*Phone:* ${bookingData.phone}\n` +
      `*Goal:* ${this.escape(bookingData.intent)}\n` +
      `*Slot:* ${slotDate}\n\n` +
      `[📱 Message on WhatsApp](${waLink})`;
  }

  /**
   * Escape special characters for Markdown
   * @private
   */
  escape(text) {
    if (!text) return '';
    return String(text)
      .replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }

  /**
   * Send email (not implemented for Telegram)
   * Stub for interface compliance
   */
  async sendEmail(to, subject, body) {
    console.warn('Email sending not supported by Telegram provider');
    return { success: false, error: 'Not supported' };
  }
}

/**
 * Console/Development Notification Provider
 * For local development and testing
 */
class ConsoleProvider extends NotificationProvider {
  async sendBookingConfirmation(bookingData) {
    console.log('📢 [NOTIFICATION] Booking Confirmation:');
    console.log(JSON.stringify(bookingData, null, 2));
    return { success: true, isDev: true };
  }

  async sendAlert(message, metadata = {}) {
    console.log('📢 [ALERT]', message);
    if (Object.keys(metadata).length > 0) {
      console.log('Metadata:', JSON.stringify(metadata, null, 2));
    }
    return { success: true, isDev: true };
  }

  async sendEmail(to, subject, body) {
    console.log('📧 [EMAIL]');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(body);
    return { success: true, isDev: true };
  }
}

/**
 * Null Provider - Silent notifications
 * Useful for testing
 */
class NullProvider extends NotificationProvider {
  async sendBookingConfirmation() {
    return { success: true, discarded: true };
  }

  async sendAlert() {
    return { success: true, discarded: true };
  }

  async sendEmail() {
    return { success: true, discarded: true };
  }
}

/**
 * Factory function to create notification provider
 * @param {string} provider - Provider type
 * @returns {NotificationProvider}
 */
function createNotificationProvider(provider) {
  // Auto-select based on environment
  if (provider === 'auto') {
    if (config.isDevelopment()) {
      provider = 'console';
    } else if (config.telegram.enabled) {
      provider = 'telegram';
    } else {
      provider = 'null';
    }
  }

  switch (provider) {
    case 'telegram':
      return new TelegramProvider();
    case 'console':
      return new ConsoleProvider();
    case 'null':
      return new NullProvider();
    default:
      throw new Error(`Unknown notification provider: ${provider}`);
  }
}

module.exports = {
  NotificationProvider,
  TelegramProvider,
  ConsoleProvider,
  NullProvider,
  createNotificationProvider,
};
