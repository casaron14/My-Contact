/* ==================== SLOT-FIRST BOOKING FLOW ==================== */
/* User selects SLOT FIRST, then fills FORM, then submits */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        SLOT_START_HOUR: 16,      // 4 PM
        SLOT_END_HOUR: 21,        // 8 PM (21:00)
        SLOT_DURATION_MIN: 30,
        DAYS_AVAILABLE: 3,
        API_ENDPOINT: '/api/submit',
        DEBUG: true
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
     * Generate available time slots (4 PM - 8 PM, 30-min increments, next 3 days starting tomorrow)
     */
    function generateAvailableSlots() {
        try {
            const slots = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (let dayOffset = 1; dayOffset <= CONFIG.DAYS_AVAILABLE; dayOffset++) {
                const day = new Date(today);
                day.setDate(day.getDate() + dayOffset);

                for (let hour = CONFIG.SLOT_START_HOUR; hour < CONFIG.SLOT_END_HOUR; hour++) {
                    for (let min = 0; min < 60; min += CONFIG.SLOT_DURATION_MIN) {
                        const slotTime = new Date(day);
                        slotTime.setHours(hour, min, 0, 0);

                        if (slotTime > new Date()) {
                            slots.push(slotTime);
                        }
                    }
                }
            }

            log(`Generated ${slots.length} available slots`);
            return slots;
        } catch (error) {
            logError(`Slot generation failed: ${error.message}`);
            return [];
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
     * Render available slots
     */
    function renderSlots() {
        try {
            if (!DOM.slotsContainer) {
                logError('slotsContainer not found');
                return;
            }

            const slots = generateAvailableSlots();
            if (slots.length === 0) {
                DOM.slotsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">No available slots at the moment.</p>';
                return;
            }

            const slotsByDay = {};

            slots.forEach(slot => {
                const dayKey = slot.toDateString();
                if (!slotsByDay[dayKey]) {
                    slotsByDay[dayKey] = [];
                }
                slotsByDay[dayKey].push(slot);
            });

            DOM.slotsContainer.innerHTML = '';

            Object.entries(slotsByDay).forEach(([dayKey, daySlots]) => {
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'slots-day-title';
                const sample = new Date(dayKey);
                sectionTitle.textContent = formatSlotDisplay(sample).dayLabel;
                DOM.slotsContainer.appendChild(sectionTitle);

                const slotsGrid = document.createElement('div');
                slotsGrid.className = 'slots-grid';

                daySlots.forEach(slot => {
                    const button = document.createElement('button');
                    button.className = 'slot-button';
                    button.type = 'button';
                    const { timeStr } = formatSlotDisplay(slot);
                    button.textContent = timeStr;
                    button.dataset.slotTime = slot.toISOString();
                    button.onclick = (e) => selectSlot(e, slot, button);
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

            let result;

            if (isDevelopment()) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                result = {
                    ok: true,
                    success: true,
                    message: 'Booking confirmed! (Dev Mode)',
                    bookingId: 'dev-' + Date.now()
                };
                log('Dev mode: Mock response generated');
            } else {
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

                result = await response.json();
                
                // Log the full response for debugging
                log('API response data: ' + JSON.stringify(result));

                if (!response.ok) {
                    // Use the detailed error message from API if available
                    const errorMsg = result.message || result.error || `Request failed (${response.status})`;
                    throw new Error(errorMsg);
                }
            }

            if (!result.ok && !result.success) {
                throw new Error(result.error || 'Booking submission failed');
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
Duration: 30 minutes

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
DESCRIPTION:Name: ${formData.fullName}\\nEmail: ${formData.email}\\nPhone: ${formData.phone}\\nGoal: ${formData.intent}\\n\\nAccess: Video call link will be sent via email\\nDuration: 30 minutes
LOCATION:Video Call - Link sent via email
ORGANIZER:mailto:charity@example.com
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
            const devMode = isDevelopment() ? '<p class="dev-note">💡 Development mode - mock booking</p>' : '';
            
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

                    ${devMode}
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
     * Check if development mode
     */
    function isDevelopment() {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1';
    }

    /**
     * Initialize
     */
    function init() {
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

            // Render available slots
            renderSlots();

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

            // Show dev mode indicator if applicable
            if (isDevelopment()) {
                console.log('%c🔧 DEVELOPMENT MODE 🔧', 'background: #FFA500; color: white; padding: 5px 10px; font-weight: bold; border-radius: 3px;');
                console.log('%cUsing MOCK API responses', 'color: #FFA500; font-weight: bold;');
                
                const devBadge = document.createElement('div');
                devBadge.innerHTML = '🔧 TEST MODE (Mock API)';
                devBadge.style.cssText = `
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: #FFA500;
                    color: white;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: bold;
                    z-index: 10000;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                `;
                document.body.appendChild(devBadge);
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
