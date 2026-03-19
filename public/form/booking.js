/* ==================== SLOT-FIRST BOOKING FLOW ==================== */
/* User selects SLOT FIRST, then fills FORM, then submits */

(function() {
    'use strict';

    // When the page is opened through VS Code Live Server (or any other static
    // file server that is NOT the API server), API calls would 404 because
    // they would go to the wrong port. Detect this and point to the real
    // local dev-server instead. In production the page and API are on the
    // same origin, so API_BASE stays empty (relative URLs).
    const _isLocalStaticServer = (
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port !== '3000' &&
        window.location.port !== '' &&        // '' means port 80/443 i.e. production
        window.location.protocol !== 'https:'
    );
    const API_BASE = _isLocalStaticServer ? 'http://localhost:3000' : '';

    // Configuration
    const CONFIG = {
        SLOT_START_HOUR: 16,       // 4 PM
        SLOT_END_HOUR: 18,         // 6 PM
        SLOT_DURATION_MIN: 25,     // 25-minute sessions
        SLOT_BREAK_MIN: 5,         // 5-minute break between sessions
        DAYS_AVAILABLE: 7,         // look-ahead window (guarantees weekday slots are always shown)
        API_ENDPOINT: API_BASE + '/api/submit',
        SLOTS_API_ENDPOINT: API_BASE + '/api/get-slots',
        DEBUG: false               // set true only when actively debugging
    };

    // DOM elements
    let DOM = {};

    // State
    let selectedSlot = null;
    let isSubmitting = false;

    /**
     * Initialize DOM references safely
     */
    function initializeDOMElements() {
        const requiredElements = [
            'currentYear', 'slotsSection', 'slotsContainer', 'formSection', 
            'bookingForm', 'backButton', 'fullNameInput', 'emailInput', 
            'phoneInput', 'intentInput', 'submitBtn', 'confirmationSection', 
            'selectedSlotText'
        ];

        const elementMap = {
            currentYear: 'current-year',
            slotsSection: 'slotsSection',
            slotsContainer: 'slotsContainer',
            formSection: 'formSection',
            bookingForm: 'bookingForm',
            backButton: 'backButton',
            fullNameInput: 'fullName',
            emailInput: 'email',
            phoneInput: 'phone',
            intentInput: 'intent',
            submitBtn: 'submitBtn',
            confirmationSection: 'confirmationSection',
            selectedSlotText: 'selectedSlotText'
        };

        let allFound = true;
        requiredElements.forEach(name => {
            const id = elementMap[name];
            const elem = document.getElementById(id);
            if (!elem) {
                logError(`Missing DOM element: #${id}`);
                allFound = false;
            }
            DOM[name] = elem;
        });

        if (!allFound && CONFIG.DEBUG) {
            logError('WARNING: Some DOM elements not found. Check HTML structure.');
        }

        return allFound ? DOM : null;
    }

    /**
     * Logging utilities
     */
    function log(msg) {
        if (CONFIG.DEBUG) {
            console.log(`[BOOKING] ${msg}`);
        }
    }

    function logError(msg) {
        console.error(`[BOOKING ERROR] ${msg}`);
    }

    /**
     * Generate all slots locally (fallback / dev mode).
     * Returns {dateTime: Date, available: boolean}[] — mirrors the API shape.
     * All slots are marked available here since we have no booking data locally.
     */
    function generateAvailableSlotsLocally() {
        try {
            const slots = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const stride = CONFIG.SLOT_DURATION_MIN + CONFIG.SLOT_BREAK_MIN; // 30 min
            const startMinutes = CONFIG.SLOT_START_HOUR * 60;
            const endMinutes   = CONFIG.SLOT_END_HOUR   * 60;
            const now = new Date();
            const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

            // Start from today (dayOffset=0) to allow same-day bookings
            for (let dayOffset = 0; dayOffset <= CONFIG.DAYS_AVAILABLE; dayOffset++) {
                const day = new Date(today);
                day.setDate(day.getDate() + dayOffset);

                // Weekdays only — skip Saturday (6) and Sunday (0)
                const dow = day.getDay();
                if (dow === 0 || dow === 6) continue;

                for (let min = startMinutes; min + CONFIG.SLOT_DURATION_MIN <= endMinutes; min += stride) {
                    const slotTime = new Date(day);
                    slotTime.setHours(Math.floor(min / 60), min % 60, 0, 0);
                    // Only show slots that are at least 2 hours away (matches server logic)
                    if (slotTime.getTime() - now.getTime() >= TWO_HOURS_MS) {
                        slots.push({ dateTime: slotTime, available: true });
                    }
                }
            }

            log(`Generated ${slots.length} slots locally`);
            return slots;
        } catch (error) {
            logError(`Local slot generation failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetch ALL slots from the API — both available and booked.
     * Returns {dateTime: Date, available: boolean}[] so the UI can render
     * booked slots as visually distinct disabled buttons.
     */
    async function fetchSlots() {
        try {
            log('Fetching slots from API...');

            const response = await fetch(CONFIG.SLOTS_API_ENDPOINT, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.ok || !data.slots) {
                throw new Error('Invalid API response format');
            }

            const now = new Date();
            const slots = data.slots
                .filter(slot => new Date(slot.dateTime) > now)
                .map(slot => ({
                    dateTime: new Date(slot.dateTime),
                    available: slot.available,
                }));

            const booked    = slots.filter(s => !s.available).length;
            const available = slots.filter(s =>  s.available).length;
            log(`Fetched ${slots.length} slots (${available} available, ${booked} booked)`);

            return slots;
        } catch (error) {
            logError(`Failed to fetch slots: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format slot for display
     */
    function formatSlotDisplay(date) {
        const dayLabel = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric',
            year: 'numeric'
        });

        const timeStr = date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: true 
        });
        
        return { dayLabel, timeStr };
    }

    /**
     * Render slots (async — fetches from API).
     * Available slots → clickable buttons.
     * Booked slots    → disabled buttons with a "Booked" label so users can
     *                   see that the slot exists but is already taken.
     */
    async function renderSlots() {
        try {
            if (!DOM.slotsContainer) {
                logError('slotsContainer not found');
                return;
            }

            DOM.slotsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #666;">🔄 Loading available slots...</p>';

            let slots; // {dateTime: Date, available: boolean}[]
            try {
                slots = await fetchSlots();
            } catch (error) {
                DOM.slotsContainer.innerHTML = `
                    <div style="grid-column: 1/-1; padding: 20px; background: #fee; border: 2px solid #c33; border-radius: 8px; color: #c33;">
                        <h3 style="margin: 0 0 10px 0; color: #c33;">❌ Unable to Load Slots</h3>
                        <p style="margin: 0 0 10px 0;"><strong>Error:</strong> ${error.message}</p>
                        <p style="margin: 0; font-size: 14px;">Please check the server configuration or try again later.</p>
                        <p style="margin: 10px 0 0 0; font-size: 12px; opacity: 0.8;">Check browser console for details.</p>
                    </div>
                `;
                return;
            }

            if (slots.length === 0) {
                DOM.slotsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">No upcoming slots available. Please check back later.</p>';
                return;
            }

            // Group slots by calendar day
            const slotsByDay = {};
            slots.forEach(slot => {
                const dayKey = slot.dateTime.toDateString();
                if (!slotsByDay[dayKey]) slotsByDay[dayKey] = [];
                slotsByDay[dayKey].push(slot);
            });

            DOM.slotsContainer.innerHTML = '';

            Object.entries(slotsByDay).forEach(([dayKey, daySlots]) => {
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'slots-day-title';
                sectionTitle.textContent = formatSlotDisplay(new Date(dayKey)).dayLabel;
                DOM.slotsContainer.appendChild(sectionTitle);

                const slotsGrid = document.createElement('div');
                slotsGrid.className = 'slots-grid';

                daySlots.forEach(slot => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    const { timeStr } = formatSlotDisplay(slot.dateTime);

                    if (slot.available) {
                        button.className = 'slot-button';
                        button.innerHTML = `<span class="slot-time">${timeStr}</span>`;
                        button.dataset.slotTime = slot.dateTime.toISOString();
                        button.onclick = (e) => selectSlot(e, slot.dateTime, button);
                    } else {
                        button.className = 'slot-button slot-booked';
                        button.disabled = true;
                        button.setAttribute('aria-label', `${timeStr} — already booked`);
                        button.innerHTML = `
                            <span class="slot-time">${timeStr}</span>
                            <span class="slot-status-label">Booked</span>
                        `;
                    }

                    slotsGrid.appendChild(button);
                });

                DOM.slotsContainer.appendChild(slotsGrid);
            });

            log('Slots rendered successfully');
        } catch (error) {
            logError(`renderSlots error: ${error.message}`);
        }
    }

    /**
     * STEP 1: User selects a slot
     */
    function selectSlot(event, slotDateTime, button) {
        try {
            event.preventDefault();

            selectedSlot = slotDateTime;
            log(`Slot selected: ${slotDateTime.toISOString()}`);

            // Update button states
            document.querySelectorAll('.slot-button').forEach(btn => {
                btn.classList.remove('slot-selected');
                btn.disabled = false;
            });
            button.classList.add('slot-selected');
            button.disabled = true;

            // Display selected slot info
            const { dayLabel, timeStr } = formatSlotDisplay(slotDateTime);
            if (DOM.selectedSlotText) {
                DOM.selectedSlotText.textContent = `${dayLabel}, ${timeStr}`;
            }

            // Hide slots, show form
            if (DOM.slotsSection) DOM.slotsSection.style.display = 'none';
            if (DOM.formSection) DOM.formSection.style.display = 'block';

            if (DOM.formSection) {
                DOM.formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            // Focus on first form field
            if (DOM.fullNameInput) {
                setTimeout(() => DOM.fullNameInput.focus(), 300);
            }
        } catch (error) {
            logError(`selectSlot error: ${error.message}`);
        }
    }

    /**
     * Go back from form to slots
     */
    function goBackToSlots() {
        try {
            if (DOM.bookingForm) {
                DOM.bookingForm.reset();
            }
            clearValidationErrors();

            // Reset slot selection
            document.querySelectorAll('.slot-button').forEach(btn => {
                btn.classList.remove('slot-selected');
                btn.disabled = false;
            });

            selectedSlot = null;
            log('Returned to slot selection');

            // Show slots, hide form
            if (DOM.formSection) DOM.formSection.style.display = 'none';
            if (DOM.slotsSection) DOM.slotsSection.style.display = 'block';
            
            if (DOM.slotsSection) {
                DOM.slotsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (error) {
            logError(`goBackToSlots error: ${error.message}`);
        }
    }

    /**
     * Get form data
     */
    function getFormData() {
        return {
            fullName: (DOM.fullNameInput?.value || '').trim(),
            email: (DOM.emailInput?.value || '').trim(),
            phone: (DOM.phoneInput?.value || '').trim(),
            intent: DOM.intentInput?.value || ''
        };
    }

    /**
     * Validate form inputs
     */
    function validateFormData(data) {
        const errors = {};

        if (!data.fullName || data.fullName.length === 0) {
            errors.fullName = 'Full name is required';
        } else if (data.fullName.length > 100) {
            errors.fullName = 'Name must be less than 100 characters';
        }

        if (!data.email || data.email.length === 0) {
            errors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
            errors.email = 'Invalid email format';
        }

        if (!data.phone || data.phone.length === 0) {
            errors.phone = 'Phone number is required';
        } else {
            const cleanPhone = data.phone.replace(/[\s\-()]/g, '');
            if (!/^\+[1-9]\d{1,14}$/.test(cleanPhone)) {
                errors.phone = 'Invalid phone format (needs country code, e.g. +27...)';
            }
        }

        if (!data.intent || data.intent.length === 0) {
            errors.intent = 'Please select your primary goal';
        }

        return errors;
    }

    /**
     * Display validation errors
     */
    function displayValidationErrors(errors) {
        clearValidationErrors();

        Object.entries(errors).forEach(([field, message]) => {
            const errorEl = document.getElementById(`${field}-error`);
            if (errorEl) {
                errorEl.textContent = message;
            }
        });
    }

    /**
     * Clear validation errors
     */
    function clearValidationErrors() {
        document.querySelectorAll('.validation-message').forEach(el => {
            el.textContent = '';
        });
    }

    /**
     * STEP 2: User fills form and submits
     */
    async function handleFormSubmit(event) {
        let originalText; // Declare outside try to ensure availability in finally block
        
        try {
            event.preventDefault();

            if (!selectedSlot || isSubmitting) {
                alert('Please select a time slot first');
                return;
            }

            const formData = getFormData();
            const validationErrors = validateFormData(formData);

            if (Object.keys(validationErrors).length > 0) {
                displayValidationErrors(validationErrors);
                log('Form validation failed');
                return;
            }

            clearValidationErrors();

            isSubmitting = true;
            originalText = DOM.submitBtn ? DOM.submitBtn.textContent : 'Processing...';
            if (DOM.submitBtn) {
                DOM.submitBtn.textContent = 'Processing Booking...';
                DOM.submitBtn.disabled = true;
            }

            log('Submitting form...');

            const response = await fetch(CONFIG.API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: formData.fullName,
                    email: formData.email,
                    phone: formData.phone,
                    intent: formData.intent,
                    slotDateTime: selectedSlot.toISOString()
                })
            });

            log(`API response: ${response.status} ${response.statusText}`);

            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                logError(`Non-JSON response received: ${text.substring(0, 200)}`);

                if (response.status === 403) {
                    throw new Error('Access forbidden. Please check you are using the correct URL.');
                } else if (response.status === 429) {
                    throw new Error('Too many requests. Please wait a few minutes and try again.');
                } else if (response.status >= 500) {
                    throw new Error('Server error. Please try again in a few moments.');
                } else {
                    throw new Error(`Unexpected server response (${response.status}). Please try again.`);
                }
            }

            const result = await response.json();
            log('API response: ' + JSON.stringify(result));

            if (!response.ok) {
                // Slot was taken between the user selecting it and submitting the form.
                // Go back to the slot picker with a refreshed view so the user can
                // immediately pick a different available slot.
                if (response.status === 409 && result.slotTaken) {
                    alert('That time slot was just taken. Please choose a different slot.');
                    goBackToSlots();
                    renderSlots(); // async refresh — booked slot will now show as disabled
                    return;
                }
                throw new Error(result.message || result.error || `Request failed (${response.status})`);
            }

            log('Booking successful!');
            showConfirmation(selectedSlot, formData, result);

        } catch (error) {
            logError(`Booking submission error: ${error.message}`);
            alert(`Booking failed: ${error.message}. Please try again.`);
        } finally {
            isSubmitting = false;
            if (DOM.submitBtn) {
                DOM.submitBtn.textContent = originalText || 'Confirm Booking';
                DOM.submitBtn.disabled = false;
            }
        }
    }

    /**
     * Generate Google Calendar link
     */
    function generateGoogleCalendarLink(slotDateTime, formData) {
        const startTime = new Date(slotDateTime);
        const endTime = new Date(startTime.getTime() + CONFIG.SLOT_DURATION_MIN * 60000);
        
        const title = `Crypto Investment Strategy Consultation - ${formData.fullName}`;
        const description = `
Consultation Booking Details:

Name: ${formData.fullName}
Email: ${formData.email}
Phone: ${formData.phone}
Goal: ${formData.intent === 'safe_start' ? 'Want to start investing safely' : formData.intent === 'education' ? 'Want structured crypto education' : 'Need better investment strategy'}

Access: Video call link will be sent via email
Duration: 25 minutes

Confirmation email sent to: ${formData.email}
`.trim();

        const params = {
            action: 'TEMPLATE',
            text: title,
            details: description,
            location: 'Video Call - Link sent via email',
            dates: formatDateForCalendar(startTime) + '/' + formatDateForCalendar(endTime)
        };

        const queryString = Object.entries(params)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');

        return `https://calendar.google.com/calendar/render?${queryString}`;
    }

    /**
     * Format date for Google Calendar (YYYYMMDDTHHMMSSZ format)
     */
    function formatDateForCalendar(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    }

    /**
     * Generate iCal format for system calendar
     */
    function generateICalFile(slotDateTime, formData) {
        const startTime = new Date(slotDateTime);
        const endTime = new Date(startTime.getTime() + CONFIG.SLOT_DURATION_MIN * 60000);

        const formatICalDate = (date) => {
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
        };

        const icalContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Charity Aron//Booking Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Consultation Booking
X-WR-TIMEZONE:UTC
BEGIN:VEVENT
UID:${Math.random().toString(36).substr(2, 9)}@charity-aron.local
DTSTAMP:${formatICalDate(new Date())}
DTSTART:${formatICalDate(startTime)}
DTEND:${formatICalDate(endTime)}
SUMMARY:Crypto Investment Strategy Consultation
DESCRIPTION:Name: ${formData.fullName}\nEmail: ${formData.email}\nPhone: ${formData.phone}\nGoal: ${formData.intent}\n\nAccess: Video call link will be sent via email\nDuration: 25 minutes
LOCATION:Video Call - Link sent via email
ORGANIZER:mailto:casaron14@gmail.com
ATTENDEE:mailto:${formData.email}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

        return icalContent;
    }

    /**
     * Download iCal file
     */
    function downloadICalFile(slotDateTime, formData) {
        try {
            const icalContent = generateICalFile(slotDateTime, formData);
            const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Consultation-${new Date(slotDateTime).toISOString().split('T')[0]}.ics`;
            link.click();
            log('iCal file downloaded');
        } catch (error) {
            logError(`iCal download error: ${error.message}`);
        }
    }

    /**
     * Show confirmation with calendar options
     */
    function showConfirmation(slotDateTime, formData, apiResult) {
        try {
            if (DOM.formSection) DOM.formSection.style.display = 'none';

            const { dayLabel, timeStr } = formatSlotDisplay(slotDateTime);
            
            // Use server's calendar link if available, otherwise generate client-side
            const useServerCalendar = apiResult && apiResult.eventLink && apiResult.eventLink !== '#';
            const googleCalendarLink = useServerCalendar 
                ? apiResult.eventLink 
                : generateGoogleCalendarLink(slotDateTime, formData);
            
            // Show calendar invite notification if server created event
            const calendarNotice = useServerCalendar 
                ? '<p class="calendar-notice">✉️ A calendar invite has been sent to your email!</p>' 
                : '';
            
            const confirmHTML = `
                <div class="confirmation-content">
                    <div class="checkmark">✓</div>
                    <h2>Booking Confirmed!</h2>
                    <p class="confirmation-message">Your consultation has been successfully booked.</p>
                    ${calendarNotice}
                    <div class="booking-details">
                        <div class="detail-item">
                            <span class="detail-label">Date & Time:</span>
                            <span class="detail-value">${dayLabel}, ${timeStr}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Name:</span>
                            <span class="detail-value">${formData.fullName}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Confirmation Email:</span>
                            <span class="detail-value">${formData.email}</span>
                        </div>
                    </div>
                    
                    <div class="calendar-section">
                        <h3 class="calendar-title">📅 Add to Your Calendar</h3>
                        <p class="calendar-subtitle">Save this consultation to your calendar</p>
                        <div class="calendar-buttons">
                            <a href="${googleCalendarLink}" target="_blank" class="btn btn-calendar google-calendar">
                                📆 ${useServerCalendar ? 'View Event in Google Calendar' : 'Add to Google Calendar'}
                            </a>
                            <button onclick="window.BookingDebug.downloadCalendar()" class="btn btn-calendar system-calendar">
                                📥 Download to Calendar
                            </button>
                        </div>
                    </div>

                    <p class="confirmation-note">We'll send you a confirmation email shortly. Please check your inbox.</p>
                </div>
            `;

            if (DOM.confirmationSection) {
                DOM.confirmationSection.innerHTML = confirmHTML;
                DOM.confirmationSection.style.display = 'block';
                DOM.confirmationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

                // Store references for debug access
                window.BookingDebug.currentSlot = slotDateTime;
                window.BookingDebug.currentFormData = formData;
                window.BookingDebug.downloadCalendar = () => downloadICalFile(slotDateTime, formData);
            }
        } catch (error) {
            logError(`showConfirmation error: ${error.message}`);
        }
    }

    /**
     * Initialize
     */
    async function init() {
        try {
            log('Initializing booking system...');

            // Initialize DOM elements
            if (!initializeDOMElements()) {
                logError('Failed to initialize DOM elements');
                return;
            }

            // Set footer year
            if (DOM.currentYear) {
                DOM.currentYear.textContent = new Date().getFullYear();
            }

            // Render available slots (async - fetches from calendar API)
            await renderSlots();

            // Attach event listeners
            if (DOM.backButton) {
                DOM.backButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    goBackToSlots();
                });
            }

            if (DOM.bookingForm) {
                DOM.bookingForm.addEventListener('submit', handleFormSubmit);
            }

            // Page fade-in animation
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.3s ease-in-out';
            requestAnimationFrame(() => {
                document.body.style.opacity = '1';
            });

            log('Booking system initialized successfully');
        } catch (error) {
            logError(`Initialization error: ${error.message}`);
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for debugging
    window.BookingDebug = {
        getCurrentSlot: () => selectedSlot,
        getFormData: getFormData,
        validateForm: validateFormData,
        goBackToSlots: goBackToSlots,
        log: log
    };

})();
