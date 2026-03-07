/**
 * Step-by-Step Calendar API Diagnostic
 * Tests each component of the slot fetching flow
 */

require('dotenv').config();
const { google } = require('googleapis');

console.log('🔍 STEP-BY-STEP CALENDAR API DIAGNOSTIC\n');
console.log('='.repeat(60));

// STEP 1: Check Environment Variables
console.log('\n📋 STEP 1: Environment Variables');
console.log('-'.repeat(60));

const envVars = {
    'GOOGLE_SERVICE_ACCOUNT_EMAIL': process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    'GOOGLE_PRIVATE_KEY': process.env.GOOGLE_PRIVATE_KEY ? 'SET (length: ' + process.env.GOOGLE_PRIVATE_KEY.length + ')' : '❌ MISSING',
    'GOOGLE_CALENDAR_ID': process.env.GOOGLE_CALENDAR_ID || 'primary',
    'GOOGLE_PROJECT_ID': process.env.GOOGLE_PROJECT_ID,
};

Object.entries(envVars).forEach(([key, value]) => {
    console.log(`  ${key}: ${value ? '✅' : '❌ MISSING'}`);
    if (value && value !== 'primary') console.log(`    Value: ${typeof value === 'string' && value.includes('BEGIN') ? 'Private Key (hidden)' : value}`);
});

if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('\n❌ FATAL: Missing required Google credentials');
    process.exit(1);
}

// STEP 2: Test Config Loading
console.log('\n📦 STEP 2: Load Config Module');
console.log('-'.repeat(60));

try {
    const config = require('./config');
    console.log('  ✅ Config loaded successfully');
    console.log(`  Environment: ${config.environment}`);
    console.log(`  isProduction: ${config.isProduction()}`);
    console.log(`  isDevelopment: ${config.isDevelopment()}`);
    console.log(`  Google Service Email: ${config.google.serviceAccountEmail ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`  Google Private Key: ${config.google.privateKey ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`  Google Calendar ID: ${config.google.calendarId || 'NOT SET (will use primary)'}`);
} catch (error) {
    console.error('  ❌ Failed to load config:', error.message);
    process.exit(1);
}

// STEP 3: Test Google Auth Creation
console.log('\n🔐 STEP 3: Create Google Calendar Auth');
console.log('-'.repeat(60));

let auth;
try {
    const config = require('./config');
    
    auth = new google.auth.JWT({
        email: config.google.serviceAccountEmail,
        key: config.google.privateKey,
        scopes: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.readonly',
        ],
    });
    
    console.log('  ✅ JWT Auth object created');
} catch (error) {
    console.error('  ❌ Failed to create auth:', error.message);
    console.error('     Stack:', error.stack);
    process.exit(1);
}

// STEP 4: Test Calendar API Connection
console.log('\n📅 STEP 4: Test Calendar API Connection');
console.log('-'.repeat(60));

async function testCalendarConnection() {
    try {
        const calendar = google.calendar({ version: 'v3', auth });
        console.log('  ✅ Calendar client created');
        
        // Try to list calendars
        console.log('\n  📋 Fetching calendar list...');
        const calendarList = await calendar.calendarList.list();
        
        if (!calendarList.data.items || calendarList.data.items.length === 0) {
            console.error('  ❌ No calendars found!');
            console.error('     The service account needs to be invited to a calendar.');
            console.error(`     Share your calendar with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
            return false;
        }
        
        console.log(`  ✅ Found ${calendarList.data.items.length} calendar(s):`);
        calendarList.data.items.forEach((cal, i) => {
            console.log(`     ${i + 1}. "${cal.summary}" (ID: ${cal.id})`);
            console.log(`        Access: ${cal.accessRole}`);
        });
        
        return calendarList.data.items;
    } catch (error) {
        console.error('  ❌ Calendar API Error:');
        console.error('     Message:', error.message);
        console.error('     Code:', error.code);
        console.error('     Status:', error.status);
        if (error.errors) {
            console.error('     Errors:', JSON.stringify(error.errors, null, 2));
        }
        return false;
    }
}

// STEP 5: Test Fetching Events
async function testFetchEvents(calendars) {
    console.log('\n📆 STEP 5: Test Fetching Calendar Events');
    console.log('-'.repeat(60));
    
    try {
        const config = require('./config');
        const calendar = google.calendar({ version: 'v3', auth });
        
        const calendarId = config.google.calendarId || (calendars && calendars[0] ? calendars[0].id : 'primary');
        console.log(`  Using calendar ID: "${calendarId}"`);
        
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + 3);
        
        console.log(`  Time range: ${now.toISOString()} to ${future.toISOString()}`);
        console.log('  Fetching events...');
        
        const response = await calendar.events.list({
            calendarId: calendarId,
            timeMin: now.toISOString(),
            timeMax: future.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        console.log(`  ✅ Successfully fetched events!`);
        console.log(`     Events found: ${response.data.items?.length || 0}`);
        
        if (response.data.items && response.data.items.length > 0) {
            console.log('\n     Sample events:');
            response.data.items.slice(0, 3).forEach(event => {
                const start = event.start.dateTime || event.start.date;
                console.log(`     - ${event.summary || '(No title)'} at ${start}`);
            });
        }
        
        return true;
    } catch (error) {
        console.error('  ❌ Failed to fetch events:');
        console.error('     Message:', error.message);
        console.error('     Code:', error.code);
        console.error('     Status:', error.status);
        
        if (error.code === 404) {
            console.error('     📌 Calendar not found or not accessible');
            console.error(`        Make sure calendar "${config.google.calendarId}" exists`);
            console.error(`        and is shared with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
        } else if (error.code === 403) {
            console.error('     📌 Permission denied');
            console.error(`        The service account needs calendar access`);
            console.error(`        Share calendar with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
        }
        
        return false;
    }
}

// STEP 6: Test getAvailableSlots function
async function testGetAvailableSlots() {
    console.log('\n🎯 STEP 6: Test getAvailableSlots Function');
    console.log('-'.repeat(60));
    
    try {
        const { getAvailableSlots } = require('./api/book-slot');
        
        console.log('  Calling getAvailableSlots()...');
        const slots = await getAvailableSlots({ daysAhead: 3 });
        
        console.log(`  ✅ Function executed successfully!`);
        console.log(`     Total slots: ${slots.length}`);
        console.log(`     Available: ${slots.filter(s => s.available).length}`);
        console.log(`     Booked: ${slots.filter(s => !s.available).length}`);
        
        if (slots.length > 0) {
            console.log('\n     Sample slots:');
            slots.slice(0, 3).forEach(slot => {
                const time = new Date(slot.dateTime);
                console.log(`     - ${time.toLocaleString()}: ${slot.available ? '✅ Available' : '❌ Booked'}`);
            });
        }
        
        return true;
    } catch (error) {
        console.error('  ❌ getAvailableSlots failed:');
        console.error('     Message:', error.message);
        console.error('     Stack:', error.stack);
        return false;
    }
}

// Run all tests
(async () => {
    try {
        const calendars = await testCalendarConnection();
        
        if (!calendars) {
            console.log('\n❌ DIAGNOSIS: Calendar connection failed');
            console.log('   FIX: Share your Google Calendar with the service account');
            process.exit(1);
        }
        
        const eventsOk = await testFetchEvents(calendars);
        
        if (!eventsOk) {
            console.log('\n❌ DIAGNOSIS: Cannot fetch calendar events');
            console.log('   FIX: Check calendar ID and permissions');
            process.exit(1);
        }
        
        const slotsOk = await testGetAvailableSlots();
        
        if (!slotsOk) {
            console.log('\n❌ DIAGNOSIS: getAvailableSlots function failed');
            console.log('   Check the error message above for details');
            process.exit(1);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ ALL TESTS PASSED! Calendar API is working correctly');
        console.log('='.repeat(60));
        console.log('\n💡 If Vercel still shows errors:');
        console.log('   1. Make sure environment variables are set in Vercel Dashboard');
        console.log('   2. Trigger a new deployment');
        console.log('   3. Check Vercel function logs for errors');
        
    } catch (error) {
        console.error('\n❌ UNEXPECTED ERROR:', error);
        process.exit(1);
    }
})();
