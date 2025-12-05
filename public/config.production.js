/**
 * Production Site Configuration
 * This version is safe to commit - no backend secrets, only public data
 */

const CONFIG = {
  // Contact Information (Public - safe to expose)
  contact: {
    email: "charitysaul14@gmail.com",
    whatsapp: "https://wa.me/qr/FZZAGZETV5NCP1",
    instagram: "https://www.instagram.com/casxiv/",
    twitter: "https://twitter.com/casxiv"
  },

  // Google Forms Configuration (Public - anyone can see this in browser anyway)
  forms: {
    charityForm: {
      action: "https://docs.google.com/forms/d/e/1FAIpQLSfwMZAIWQG9G84jPonwOJktc086_VAGqoo7Zq9CjXSwhYqjBg/formResponse",
      fields: {
        fullName: "entry.2015299396",
        phone: "entry.346262782",
        knowledge: "entry.877121624",
        confirmation: "entry.727959045"
      }
    }
  },

  // Site Information
  site: {
    name: "Charity Aron",
    title: "Blockchain Consultant",
    url: "https://casaron14.github.io/My-Contact/"
  },

  // reCAPTCHA Site Key (Public - this is MEANT to be visible in frontend)
  // Note: This is the SITE KEY, not the secret. It's safe to commit.
  recaptcha: {
    siteKey: "6Lek6SEsAAAAAHcLoL211uAF3CCDLBJ_lh5KCn4M" // TODO: Replace with your actual reCAPTCHA v3 SITE KEY
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
