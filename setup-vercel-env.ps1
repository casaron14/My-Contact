# PowerShell script to set up Vercel environment variables
# Run this with: .\setup-vercel-env.ps1

Write-Host "🚀 Setting up Vercel Environment Variables..." -ForegroundColor Cyan

# Read .env file and set variables in Vercel
$envVars = @{
    "ALLOWED_ORIGINS" = "https://charityaron.vercel.app"
    "NODE_ENV" = "production"
    "GOOGLE_SERVICE_ACCOUNT_EMAIL" = "my-contact-form@heroic-bliss-274216.iam.gserviceaccount.com"
    "GOOGLE_SHEET_ID" = "1VKl-mLXsE2n1fr4vubQkcbbCntpef-7xvr_Ii9kOco0"
    "GOOGLE_SHEET_NAME" = "Bookings"
    "GOOGLE_PROJECT_ID" = "heroic-bliss-274216"
    "TG_BOT_TOKEN" = "8429698564:AAGBYfrV8tah-dVODZkMeFJMslJlI6hguZA"
    "TG_CHAT_ID" = "casxivbot"
    "BOOKING_TIMEZONE" = "Africa/Nairobi"
    "BOOKING_SLOT_START_HOUR" = "16"
    "BOOKING_SLOT_END_HOUR" = "21"
    "BOOKING_SLOT_DURATION_MIN" = "30"
    "BOOKING_DAYS_AVAILABLE" = "3"
    "API_RATE_LIMIT_MAX" = "5"
    "API_RATE_LIMIT_WINDOW_MS" = "3600000"
}

# GOOGLE_PRIVATE_KEY needs special handling (multiline)
$privateKey = Get-Content .env | Select-String "GOOGLE_PRIVATE_KEY=" | ForEach-Object { $_.Line -replace "GOOGLE_PRIVATE_KEY=", "" }

Write-Host "`n📋 Environment Variables to Set:" -ForegroundColor Yellow
foreach ($key in $envVars.Keys) {
    Write-Host "   ✓ $key" -ForegroundColor Green
}
Write-Host "   ✓ GOOGLE_PRIVATE_KEY (from .env)" -ForegroundColor Green

Write-Host "`n⚠️  MANUAL SETUP REQUIRED" -ForegroundColor Red
Write-Host "Because Vercel CLI has limitations with multiline values," -ForegroundColor Yellow
Write-Host "please set these variables manually in the Vercel Dashboard:" -ForegroundColor Yellow
Write-Host "`n1. Go to: https://vercel.com/dashboard" -ForegroundColor Cyan
Write-Host "2. Select your project: charityaron or My-Contact" -ForegroundColor Cyan
Write-Host "3. Go to: Settings > Environment Variables" -ForegroundColor Cyan
Write-Host "4. Add each variable listed above" -ForegroundColor Cyan
Write-Host "5. For GOOGLE_PRIVATE_KEY, copy the entire value from .env" -ForegroundColor Cyan
Write-Host "   (including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----)" -ForegroundColor Cyan
Write-Host "6. Select 'Production', 'Preview', and 'Development' for each" -ForegroundColor Cyan
Write-Host "7. Click 'Save' after adding all variables" -ForegroundColor Cyan
Write-Host "8. Redeploy your application" -ForegroundColor Cyan

Write-Host "`n📝 Quick Copy Values:" -ForegroundColor Magenta
Write-Host "================================" -ForegroundColor Gray
foreach ($key in $envVars.Keys) {
    Write-Host "$key=$($envVars[$key])" -ForegroundColor White
}
Write-Host "GOOGLE_PRIVATE_KEY=$privateKey" -ForegroundColor White
Write-Host "================================" -ForegroundColor Gray

Write-Host "`n✅ After setting variables in Vercel Dashboard, run:" -ForegroundColor Green
Write-Host "   vercel --prod" -ForegroundColor Cyan
Write-Host "`n   Or wait for auto-deployment from GitHub" -ForegroundColor Yellow
