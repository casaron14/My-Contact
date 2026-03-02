# URGENT: Telegram Chat ID Fix

## ⚠️ Current Issue
Your `.env` has:
```
TG_CHAT_ID=casxivbot
```

This is a **Telegram username**, but the API requires a **numeric chat ID**.

## ✅ How to Fix (5 minutes)

1. **Get your numeric chat ID:**
   - Go to Telegram and start a chat with your bot
   - Send any message to the bot
   - Visit this URL (replace BOT_TOKEN with your actual token):
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   - Look for `"chat":{"id": <THIS_NUMBER_HERE>`

2. **Update `.env`:**
   ```
   TG_CHAT_ID=123456789
   ```
   (Replace with YOUR numeric ID)

3. **For group chats:** Use negative ID (e.g., `-987654321`)

## 📝 Why This Matters
- Current setup: Telegram alerts FAIL silently (non-critical, won't break bookings)
- Fixed: You'll get Telegram notifications when new bookings arrive
- The booking process works fine even WITHOUT Telegram

## 🚀 Temporary Workaround
If you don't have time to fix Telegram now, leave it as-is.  Your bookings will save to Google Sheets but won't send Telegram alerts. This won't affect your job deadline.

---
**Status**: Booking system works! Telegram is just a bonus notification feature.
