/* ==================== SEMINAR SIGN-UP FORM — CLIENT LOGIC ==================== */
(function () {
    'use strict';

    // Detect dev static server (same pattern as booking.js)
    const _isLocalStaticServer = (
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port !== '3000' &&
        window.location.port !== '' &&
        window.location.protocol !== 'https:'
    );
    const API_BASE = _isLocalStaticServer ? 'http://localhost:3000' : '';
    const API_URL  = API_BASE + '/api/seminar';

    // ==================== DOM REFS ====================
    const form         = document.getElementById('seminarForm');
    const successState = document.getElementById('successState');
    const errorState   = document.getElementById('errorState');
    const errorMsg     = document.getElementById('errorMessage');
    const submitBtn    = document.getElementById('submitBtn');
    const btnText      = document.getElementById('btnText');
    const btnSpinner   = document.getElementById('btnSpinner');
    const retryBtn     = document.getElementById('retryBtn');

    if (!form) return; // Guard: page must have the form element

    // ==================== VALIDATION HELPERS ====================

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    }

    // E.164: optional spaces/dashes removed, must start with +, 7-15 digits total
    function isValidPhone(phone) {
        var clean = (phone || '').replace(/[\s\-()]/g, '');
        return /^\+[1-9]\d{6,14}$/.test(clean);
    }

    function clearFieldError(inputId) {
        var input = document.getElementById(inputId);
        var errorEl = document.getElementById(inputId + '-error');
        if (input)   input.classList.remove('input-invalid');
        if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
    }

    function showFieldError(inputId, message) {
        var input   = document.getElementById(inputId);
        var errorEl = document.getElementById(inputId + '-error');
        if (input)   input.classList.add('input-invalid');
        if (errorEl) { errorEl.textContent = message; errorEl.style.display = 'block'; }
    }

    function validateForm(data) {
        var valid = true;

        clearFieldError('name');
        clearFieldError('email');
        clearFieldError('phone');
        clearFieldError('location');

        if (!data.name || data.name.trim().length < 2 || data.name.trim().length > 100) {
            showFieldError('name', 'Please enter your full name (2–100 characters).');
            valid = false;
        }

        if (!isValidEmail(data.email)) {
            showFieldError('email', 'Please enter a valid email address.');
            valid = false;
        }

        if (!isValidPhone(data.phone)) {
            showFieldError('phone', 'Please include your country code (e.g. +255712345678).');
            valid = false;
        }

        if (!data.location || data.location.trim().length < 2) {
            showFieldError('location', 'Please enter your city and country (e.g. Nairobi, Kenya).');
            valid = false;
        }

        return valid;
    }

    // ==================== UI STATE ====================

    function setLoading(loading) {
        submitBtn.disabled = loading;
        btnText.textContent  = loading ? 'Submitting…' : 'Register My Interest';
        btnSpinner.classList.toggle('hidden', !loading);
    }

    function showView(view) {
        // view: 'form' | 'success' | 'error'
        form.style.display           = (view === 'form')    ? 'flex'  : 'none';
        successState.classList.toggle('hidden', view !== 'success');
        errorState.classList.toggle('hidden',   view !== 'error');
    }

    // ==================== FORM SUBMIT ====================

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        var data = {
            name:     document.getElementById('name').value.trim(),
            email:    document.getElementById('email').value.trim().toLowerCase(),
            phone:    document.getElementById('phone').value.trim(),
            location: document.getElementById('location').value.trim(),
        };

        if (!validateForm(data)) return;

        // Client-side duplicate guard: block re-submission for this browser session
        var sessionKey = 'seminar_submitted_' + data.email;
        if (sessionStorage.getItem(sessionKey)) {
            showView('success'); // Treat as success — they already registered
            return;
        }

        setLoading(true);

        try {
            var response = await fetch(API_URL, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(data),
            });

            var result = await response.json();

            if (response.ok && result.ok) {
                sessionStorage.setItem(sessionKey, '1');
                showView('success');
            } else {
                errorMsg.textContent = result.error || 'Something went wrong. Please try again.';
                showView('error');
            }
        } catch (err) {
            errorMsg.textContent = 'Network error — please check your connection and try again.';
            showView('error');
        } finally {
            setLoading(false);
        }
    });

    // ==================== RETRY ====================

    retryBtn.addEventListener('click', function () {
        showView('form');
        setLoading(false);
    });

})();
