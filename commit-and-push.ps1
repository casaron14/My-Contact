# Commit and push the fixes
Write-Host "📋 Checking git status..." -ForegroundColor Cyan
git status

Write-Host "`n📦 Staging changes..." -ForegroundColor Cyan
git add api/get-slots.js api/book-slot.js

Write-Host "`n💾 Committing changes..." -ForegroundColor Cyan
git commit -m "Fix: Replace applyCors with createSecurityMiddleware

- api/get-slots.js: Use proper security middleware pattern
- api/book-slot.js: Add detailed calendar API error logging  
- Fixes 500 error 'applyCors is not a function'
"

Write-Host "`n🚀 Pushing to GitHub..." -ForegroundColor Cyan
git push origin master:main

Write-Host "`n✅ Done! Vercel will auto-deploy in ~2 minutes" -ForegroundColor Green
Write-Host "Check deployment at: https://vercel.com/dashboard" -ForegroundColor Yellow
