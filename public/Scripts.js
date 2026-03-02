/**
 * Professional Portfolio JavaScript
 * Handles dynamic content and user interactions
 */

'use strict';

(function() {
    /**
     * Initialize application when DOM is fully loaded
     */
    document.addEventListener('DOMContentLoaded', initializeApp);

    function initializeApp() {
        setCurrentYear();
        loadSocialLinks();
        initializeTheme();
        initializeLanguage();
        initializeSmoothScrolling();
        initializeAnimations();
        trackPageViews();
    }

    /**
     * Load social links from config
     */
    function loadSocialLinks() {
        if (typeof CONFIG === 'undefined') {
            console.warn('CONFIG not loaded. Using placeholder links.');
            return;
        }

        // Update email link
        const emailLink = document.getElementById('email-link');
        if (emailLink && CONFIG.contact.email) {
            emailLink.href = `mailto:${CONFIG.contact.email}`;
        }

        // Update WhatsApp link
        const whatsappLink = document.getElementById('whatsapp-link');
        if (whatsappLink && CONFIG.contact.whatsapp) {
            whatsappLink.href = CONFIG.contact.whatsapp;
        }

        // Update Instagram link
        const instagramLink = document.getElementById('instagram-link');
        if (instagramLink && CONFIG.contact.instagram) {
            instagramLink.href = CONFIG.contact.instagram;
        }

        // Update Twitter link
        const twitterLink = document.getElementById('twitter-link');
        if (twitterLink && CONFIG.contact.twitter) {
            twitterLink.href = CONFIG.contact.twitter;
        }
    }

    /**
     * Set current year in footer
     */
    function setCurrentYear() {
        const yearElement = document.getElementById('current-year');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    /**
     * Initialize theme system
     */
    function initializeTheme() {
        const themeToggle = document.getElementById('theme-toggle');
        const html = document.documentElement;
        
        // Check for saved theme preference or default to system preference
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Set initial theme
        if (savedTheme) {
            html.setAttribute('data-theme', savedTheme);
        } else if (systemPrefersDark) {
            html.setAttribute('data-theme', 'dark');
        }
        
        // Theme toggle button click handler
        if (themeToggle) {
            themeToggle.addEventListener('click', function() {
                const currentTheme = html.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                html.setAttribute('data-theme', newTheme);
                localStorage.setItem('theme', newTheme);
            });
        }
        
        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            // Only apply system preference if user hasn't manually set a theme
            if (!localStorage.getItem('theme')) {
                html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    }

    /**
     * Initialize language system
     */
    function initializeLanguage() {
        const langToggle = document.getElementById('lang-toggle');
        const langText = document.querySelector('.lang-text');
        const html = document.documentElement;
        
        // Check for saved language preference or default to English
        const savedLang = localStorage.getItem('language') || 'en';
        
        // Set initial language
        setLanguage(savedLang);
        
        // Toggle language on button click
        if (langToggle) {
            langToggle.addEventListener('click', function() {
                const currentLang = html.getAttribute('lang') || 'en';
                const newLang = currentLang === 'en' ? 'sw' : 'en';
                
                setLanguage(newLang);
                localStorage.setItem('language', newLang);
            });
        }
        
        /**
         * Set language for all elements with data-en and data-sw attributes
         */
        function setLanguage(lang) {
            // Update HTML lang attribute for accessibility
            html.setAttribute('lang', lang);
            
            // Update button text
            if (langText) {
                langText.textContent = lang === 'en' ? 'SW' : 'EN';
            }
            
            // Get all elements with bilingual data attributes
            const elements = document.querySelectorAll('[data-en][data-sw]');
            
            elements.forEach(function(element) {
                const text = lang === 'en' ? element.getAttribute('data-en') : element.getAttribute('data-sw');
                if (text) {
                    element.textContent = text;
                }
            });
        }
    }

    /**
     * Initialize smooth scrolling for navigation links
     */
    function initializeSmoothScrolling() {
        const navLinks = document.querySelectorAll('.nav-link');
        
        navLinks.forEach(link => {
            link.addEventListener('click', function(event) {
                const href = this.getAttribute('href');
                
                // Only handle internal anchor links
                if (href.startsWith('#')) {
                    event.preventDefault();
                    const targetId = href.substring(1);
                    const targetElement = document.getElementById(targetId);
                    
                    if (targetElement) {
                        const headerOffset = 80;
                        const elementPosition = targetElement.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                        window.scrollTo({
                            top: offsetPosition,
                            behavior: 'smooth'
                        });
                    }
                }
            });
        });
    }

    /**
     * Initialize intersection observer for scroll animations
     */
    function initializeAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -100px 0px'
        };

        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        // Observe sections for animation
        const sections = document.querySelectorAll('section');
        sections.forEach(section => {
            section.style.opacity = '0';
            section.style.transform = 'translateY(20px)';
            section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(section);
        });
    }

    /**
     * Track contact link clicks (analytics placeholder)
     */
    function trackPageViews() {
        const contactLinks = document.querySelectorAll('.contact-link');
        
        contactLinks.forEach(link => {
            link.addEventListener('click', function() {
                const linkType = this.classList[1]; // Gets the specific class like 'email', 'whatsapp', etc.
                console.log(`Contact link clicked: ${linkType}`);
                // Placeholder for analytics tracking
                // Example: gtag('event', 'contact_click', { 'link_type': linkType });
            });
        });
    }

    /**
     * Add active state to navigation based on scroll position
     */
    function updateActiveNavigation() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-link');
        
        window.addEventListener('scroll', function() {
            let current = '';
            
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                
                if (window.pageYOffset >= sectionTop - 100) {
                    current = section.getAttribute('id');
                }
            });
            
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${current}`) {
                    link.classList.add('active');
                }
            });
        });
    }

    // Initialize navigation highlighting
    updateActiveNavigation();
})();
