# 🚀 Quick Deployment Guide

**Get your portfolio live in 5 minutes!**

## Option 1: GitHub Pages (Recommended - Easiest)

Your site is **already configured** for GitHub Pages deployment!

### Step 1: Commit & Push Changes

```bash
cd "c:\Users\DELL\Desktop\Charity\My-Contact-main\My-Contact"
git add .
git commit -m "Prepare portfolio for deployment"
git push origin main
```

### Step 2: Enable GitHub Pages

1. Go to: https://github.com/casaron14/My-Contact
2. Click **Settings** tab
3. Click **Pages** in left sidebar
4. Under "Build and deployment":
   - **Source**: Deploy from a branch
   - **Branch**: main
   - **Folder**: Select **`/ (root)`**
5. Click **Save**

### Step 3: Wait & Access

- Wait 2-5 minutes for deployment
- Your site will be live at: **https://casaron14.github.io/My-Contact/**

**That's it! You're done!** 🎉

---

## Option 2: Vercel (Advanced - With Backend)

Only use this if you need the backend API with reCAPTCHA and Google Sheets.

### Prerequisites

- [ ] Vercel account: https://vercel.com/signup
- [ ] Google reCAPTCHA keys: https://www.google.com/recaptcha/admin
- [ ] Google Cloud Service Account

### Quick Steps

```bash
# 1. Install dependencies
npm install

# 2. Install Vercel CLI
npm install -g vercel

# 3. Login
vercel login

# 4. Deploy
vercel --prod
```

### Configure Environment Variables

In Vercel Dashboard > Your Project > Settings > Environment Variables, add:

```
RECAPTCHA_SECRET=your_secret_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_sheet_id_here
```

---

## 🔥 What's Already Configured

✅ **HTML Files**: index.html and charity-form.html  
✅ **CSS**: Styles.css with dark/light themes  
✅ **JavaScript**: Script.js with theme toggle & language switcher  
✅ **Forms**: Google Forms integration (working out of the box)  
✅ **Responsive Design**: Works on mobile, tablet, desktop  
✅ **SEO**: Meta tags and descriptions  
✅ **Languages**: English & Swahili toggle  

## 🎯 What You Get

### On GitHub Pages
- ✅ Portfolio website
- ✅ Contact form (Google Forms)
- ✅ Dark/Light theme
- ✅ English/Swahili toggle
- ✅ Social media links
- ✅ vCard download

### On Vercel (Additional)
- ✅ All above features
- ✅ Backend API
- ✅ reCAPTCHA protection
- ✅ Rate limiting
- ✅ Custom Google Sheets integration

## 📝 Post-Deployment

After deployment, test:

1. **Homepage**: https://casaron14.github.io/My-Contact/
2. **Form**: https://casaron14.github.io/My-Contact/charity-form.html
3. **Theme Toggle**: Click sun/moon icon
4. **Language Toggle**: Click SW/EN button
5. **Form Submission**: Fill and submit the form
6. **Mobile**: Open on phone

## 🐛 Troubleshooting

**Styles not loading?**
- Clear browser cache
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

**404 Error?**
- Wait 5 minutes for GitHub to deploy
- Check GitHub Pages settings
- Ensure repository is public

**Form not submitting?**
- Check network tab in browser console
- Verify Google Forms URL is correct
- Try different browser

## 📞 Need Help?

- Check `DEPLOYMENT_CHECKLIST.md` for detailed steps
- Review `README.md` for full documentation
- For Vercel: See `VERCEL_DEPLOYMENT_README.md`

---

## ⚡ One-Command Deployment

If everything is ready and committed:

```bash
git push origin main
```

Then enable GitHub Pages in repository settings. Done! 🚀
