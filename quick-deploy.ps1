# One-command Railway deployment

Write-Host "🚀 Quick Deploy to Railway" -ForegroundColor Cyan

# Install Railway CLI if needed
if (!(Get-Command railway -ErrorAction SilentlyContinue)) {
    npm install -g @railway/cli
}

# Deploy
railway login
railway init
railway add
railway variables set NODE_ENV=production
railway up
railway domain

Write-Host "`n✅ Done! Your app is live!" -ForegroundColor Green
Write-Host "Run this to verify: " -NoNewline
Write-Host ".\verify-deployment.ps1 -Url (railway domain)" -ForegroundColor Cyan
