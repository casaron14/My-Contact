# Charity Aron - Blockchain Consultant Portfolio

Professional portfolio website with integrated contact forms and blockchain consultation services.

## 🌐 Live Site

**Portfolio**: https://casaron14.github.io/My-Contact/  
**Vercel Backend**: (Deploy separately if needed)

## 📁 Project Structure

```
My-Contact/
├── api/
│   └── submit.js              # Vercel serverless backend (optional)
├── public/
│   ├── index.html             # Main portfolio page
│   ├── charity-form.html      # Blockchain knowledge form (Google Forms)
│   ├── Script.js              # Portfolio JavaScript
│   ├── Styles.css             # Portfolio styles
│   ├── My Image               # Profile picture
│   └── vcard.vcf              # Contact vCard
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies
├── vercel.json                # Vercel deployment config
└── README.md                  # This file
```

## 🚀 Deployment Options

### Option 1: GitHub Pages (Current - Portfolio Only)

The portfolio is currently deployed on GitHub Pages.

**Status**: ✅ Active  
**What's Deployed**: Portfolio website with Google Forms integration

**To Update**:
```bash
git add .
git commit -m "Update portfolio"
git push origin main
```

### Option 2: Vercel (Full Stack with Backend API)

Deploy the complete application with serverless backend on Vercel.

**Prerequisites**:
- Vercel account
- Google Cloud Service Account (for Sheets API)
- Google reCAPTCHA v3 keys

**Steps**:

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Set Environment Variables** (in Vercel Dashboard):
   - `RECAPTCHA_SECRET` - Your reCAPTCHA secret key
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
   - `GOOGLE_PRIVATE_KEY` - Service account private key (with \n)
   - `GOOGLE_SHEET_ID` - Target Google Sheet ID

4. **Deploy**:
   ```bash
   vercel --prod
   ```

See `VERCEL_DEPLOYMENT_README.md` for detailed Vercel setup instructions.

## 🎨 Features

### Portfolio Website
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Dark/Light theme toggle with system preference detection
- ✅ English/Swahili language toggle
- ✅ Smooth scroll navigation
- ✅ Professional service showcase
- ✅ Social media integration
- ✅ Contact information with vCard download

### Contact Forms
- ✅ **Google Forms** - Primary form (charity-form.html)
  - Direct submission to Google Sheets
  - No backend required
  - Works on GitHub Pages
  
- ✅ **Vercel Backend** - Optional advanced form (api/submit.js)
  - reCAPTCHA v3 protection
  - Rate limiting
  - Input sanitization
  - Custom Google Sheets integration

## 📝 Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/casaron14/My-Contact.git
   cd My-Contact
   ```

2. **Open in browser**:
   - Open `public/index.html` directly in browser
   - Or use a local server:
     ```bash
     # Using Python
     cd public
     python -m http.server 8000
     ```

3. **For Vercel development**:
   ```bash
   npm install
   vercel dev
   ```

## 📱 Social Media Links

- **Email**: charitysaul14@gmail.com
- **WhatsApp**: [Link](https://wa.me/qr/FZZAGZETV5NCP1)
- **Instagram**: [@casxiv](https://www.instagram.com/casxiv/)
- **Twitter/X**: [@casxiv](https://twitter.com/casxiv)

## 📄 License

© 2025 Charity Aron. All rights reserved.

---

**Built with ❤️ for blockchain education and investment consultation**
