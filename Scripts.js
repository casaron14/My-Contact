document.addEventListener('DOMContentLoaded', function() {
    // Display current date and time
    const dateTimeElement = document.getElementById('datetime');
    const now = new Date();
    dateTimeElement.textContent = `Current Date and Time: ${now.toLocaleString()}`;

    // Handle form submission
    const form = document.getElementById('contact-form');
    const formMessage = document.getElementById('form-message');

    form.addEventListener('submit', function(event) {
        event.preventDefault();

        const name = form.name.value;
        const email = form.email.value;
        const message = form.message.value;

        if (name && email && message) {
            formMessage.textContent = 'Thank you for your message. I will get back to you soon.';
            formMessage.style.color = 'green';
            form.reset();
        } else {
            formMessage.textContent = 'Please fill out all fields.';
            formMessage.style.color = 'red';
        }
    });
});
