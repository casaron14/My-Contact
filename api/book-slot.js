import { google } from 'googleapis';
import { Buffer } from 'buffer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fullName, email, phone, intent, slotDateTime } = req.body;

    // Validate required fields
    if (!fullName || !email || !slotDateTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if we're in development mode (mock API)
    const isDevelopment = process.env.NODE_ENV !== 'production' && 
                         (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 
                          !process.env.GOOGLE_PRIVATE_KEY);

    if (isDevelopment) {
      // Return mock response for local testing
      return res.status(200).json({
        success: true,
        message: 'Booking confirmed! (Development Mode)',
        eventId: 'dev-' + Date.now(),
        eventLink: '#',
        isDevelopment: true
      });
    }

    // Parse credentials from environment
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!serviceAccountEmail || !privateKey) {
      console.error('Missing Google credentials');
      return res.status(500).json({ error: 'Google credentials not configured' });
    }

    // Authenticate with Google
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: 'heroic-bliss-274216',
        private_key_id: 'a3f7e9b2c1d4f8e9a3b2c1d4f8e9a3b2',
        private_key: privateKey,
        client_email: serviceAccountEmail,
        client_id: '123456789',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs'
      },
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.send'
      ]
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const gmail = google.gmail({ version: 'v1', auth });

    // Parse slot date/time
    const startTime = new Date(slotDateTime);
    const endTime = new Date(startTime.getTime() + 30 * 60000); // 30 minutes

    // ==================== CREATE CALENDAR EVENT ====================
    const eventBody = {
      summary: `Strategy Session - ${fullName}`,
      description: `Client Booking Details:
Name: ${fullName}
Email: ${email}
Phone: ${phone || 'Not provided'}
Primary Goal: ${intent || 'Not specified'}

This is a 30-minute cryptocurrency investment strategy consultation.`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC'
      },
      attendees: [
        {
          email: email,
          displayName: fullName
        }
      ],
      reminders: {
        useDefault: true
      }
    };

    const event = await calendar.events.insert({
      calendarId: 'primary',
      resource: eventBody,
      sendUpdates: 'all'
    });

    // ==================== GENERATE ICS FILE ====================
    const icsContent = generateICS({
      fullName,
      email,
      startTime,
      endTime,
      phone,
      intent
    });

    // ==================== SEND EMAIL WITH CALENDAR INVITE ====================
    const emailBody = generateEmailBody(fullName, startTime, email);
    
    const message = {
      raw: Buffer.from(
        `From: Charity Aron <${serviceAccountEmail}>\r\n` +
        `To: ${email}\r\n` +
        `Subject: Booking Confirmation - Your Strategy Session\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: multipart/mixed; boundary="boundary123"\r\n` +
        `\r\n` +
        `--boundary123\r\n` +
        `Content-Type: text/html; charset="UTF-8"\r\n` +
        `Content-Transfer-Encoding: 7bit\r\n` +
        `\r\n` +
        emailBody +
        `\r\n--boundary123\r\n` +
        `Content-Type: text/calendar; charset="UTF-8"; method=REQUEST\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="booking.ics"\r\n` +
        `\r\n` +
        Buffer.from(icsContent).toString('base64') +
        `\r\n--boundary123--`
      ).toString('base64')
    };

    await gmail.users.messages.send({
      userId: 'me',
      resource: message
    });

    return res.status(200).json({
      success: true,
      message: 'Booking confirmed! Confirmation email sent.',
      eventId: event.data.id,
      eventLink: event.data.htmlLink,
      bookedTime: startTime.toISOString(),
      clientEmail: email
    });

  } catch (error) {
    console.error('Booking error:', error.message);
    return res.status(500).json({
      error: 'Failed to create booking',
      details: error.message
    });
  }
}

// ==================== HELPER: GENERATE ICS FILE ====================
function generateICS({ fullName, email, startTime, endTime, phone, intent }) {
  const startICS = formatICSDate(startTime);
  const endICS = formatICSDate(endTime);
  const createdAt = formatICSDate(new Date());
  const uid = `booking-${Date.now()}@charity-aron.com`;

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Charity Aron//Booking System//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${createdAt}
DTSTART:${startICS}
DTEND:${endICS}
SUMMARY:Strategy Session with Charity Aron
DESCRIPTION:Your cryptocurrency investment strategy consultation session. Goal: ${intent || 'Not specified'}
LOCATION:Online Meeting
ORGANIZER:MAILTO:charity@charityaron.com
ATTENDEE:mailto:${email}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
}

// ==================== HELPER: FORMAT ICS DATE ====================
function formatICSDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// ==================== HELPER: GENERATE HTML EMAIL ====================
function generateEmailBody(fullName, startTime, clientEmail) {
  const dateStr = startTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const googleCalendarUrl = encodeGoogleCalendarLink(startTime, fullName);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fc; }
    .card { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 25px; border-bottom: 3px solid #1a365d; padding-bottom: 15px; }
    h1 { color: #1a365d; margin: 0 0 5px 0; font-size: 28px; }
    .subtitle { color: #4a5568; font-size: 14px; }
    .booking-details { background: #f7fafc; border-left: 4px solid #1d5d99; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .detail-row:last-child { border-bottom: none; }
    .label { font-weight: 600; color: #4a5568; }
    .value { color: #1a202c; }
    .cta-section { text-align: center; margin: 30px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; transition: transform 0.2s; }
    .btn:hover { transform: translateY(-2px); }
    .footer { text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; color: #4a5568; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>✓ Booking Confirmed!</h1>
        <p class="subtitle">Your strategy session is scheduled</p>
      </div>

      <p>Hi ${fullName},</p>
      
      <p>Your cryptocurrency investment strategy consultation has been successfully booked! We're excited to discuss your financial goals with you.</p>

      <div class="booking-details">
        <div class="detail-row">
          <span class="label">📅 Date & Time:</span>
          <span class="value">${dateStr} at ${timeStr}</span>
        </div>
        <div class="detail-row">
          <span class="label">⏱️ Duration:</span>
          <span class="value">30 minutes</span>
        </div>
        <div class="detail-row">
          <span class="label">📍 Format:</span>
          <span class="value">Online Meeting</span>
        </div>
        <div class="detail-row">
          <span class="label">📧 Confirmation:</span>
          <span class="value">${clientEmail}</span>
        </div>
      </div>

      <div class="cta-section">
        <p><strong>Add to Your Calendar:</strong></p>
        <a href="${googleCalendarUrl}" class="btn">+ Add to Google Calendar</a>
        <p style="font-size: 13px; color: #718096; margin-top: 12px;">
          Or open the calendar invite attached to this email in your email client
        </p>
      </div>

      <p><strong>What to expect:</strong></p>
      <ul style="color: #4a5568;">
        <li>Personalized analysis of your investment goals</li>
        <li>Clear strategy tailored to your experience level</li>
        <li>Actionable next steps for your crypto journey</li>
        <li>Professional guidance to help you invest responsibly</li>
      </ul>

      <p style="color: #4a5568;">If you need to reschedule or have any questions, feel free to reach out!</p>

      <div class="footer">
        <p>&copy; 2026 Charity Aron. Professional cryptocurrency consultation services.</p>
        <p>Cryptocurrency investments carry risk. Please invest responsibly.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// ==================== HELPER: GENERATE GOOGLE CALENDAR LINK ====================
function encodeGoogleCalendarLink(startTime, fullName) {
  const text = `Strategy Session with Charity Aron`;
  const details = `Cryptocurrency investment consultation with ${fullName}`;
  
  const startISO = startTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const endTime = new Date(startTime.getTime() + 30 * 60000);
  const endISO = endTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const calendarUrl = new URL('https://calendar.google.com/calendar/render');
  calendarUrl.searchParams.set('action', 'TEMPLATE');
  calendarUrl.searchParams.set('text', text);
  calendarUrl.searchParams.set('details', details);
  calendarUrl.searchParams.set('dates', `${startISO}/${endISO}`);
  calendarUrl.searchParams.set('location', 'Online');
  calendarUrl.searchParams.set('trp', 'true');

  return calendarUrl.toString();
}
