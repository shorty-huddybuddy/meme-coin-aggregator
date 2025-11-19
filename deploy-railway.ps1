# Railway Deployment Script

Write-Host "🚀 Deploying Meme Coin Aggregator to Railway..." -ForegroundColor Cyan

# Check if Railway CLI is installed
if (!(Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Railway CLI..." -ForegroundColor Yellow
    npm install -g @railway/cli
}

# Login
Write-Host "`n1. Logging into Railway..." -ForegroundColor Yellow
railway login

# Initialize project
Write-Host "`n2. Initializing project..." -ForegroundColor Yellow
railway init

# Add Redis
Write-Host "`n3. Adding Redis..." -ForegroundColor Yellow
Write-Host "   Select: Redis" -ForegroundColor Gray
railway add

# Set environment variables
Write-Host "`n4. Setting environment variables..." -ForegroundColor Yellow
railway variables set NODE_ENV=production
railway variables set CACHE_TTL=60
railway variables set WS_UPDATE_INTERVAL=10000

# Deploy
Write-Host "`n5. Deploying application..." -ForegroundColor Yellow
railway up

# Generate domain
Write-Host "`n6. Generating public domain..." -ForegroundColor Yellow
railway domain

# Get URL
Write-Host "`n7. Getting deployment URL..." -ForegroundColor Yellow
$url = railway domain
Write-Host "`n✅ Deployment Complete!" -ForegroundColor Green
Write-Host "   Live URL: $url" -ForegroundColor Cyan
Write-Host "`nTesting endpoints..." -ForegroundColor Yellow

Start-Sleep -Seconds 5

try {
    $health = Invoke-RestMethod "$url/health"
    Write-Host "✓ Health check passed" -ForegroundColor Green
    
    $tokens = Invoke-RestMethod "$url/api/tokens?limit=5"
    Write-Host "✓ Tokens endpoint working ($($tokens.data.Count) tokens)" -ForegroundColor Green
    
    Write-Host "`n🎉 All tests passed!" -ForegroundColor Green
    Write-Host "   API: $url/api/health" -ForegroundColor Cyan
    Write-Host "   Demo: $url/demo.html" -ForegroundColor Cyan
} catch {
    Write-Host "⚠ Deployment successful but endpoints not ready yet" -ForegroundColor Yellow
    Write-Host "   Wait 30 seconds and try: $url/health" -ForegroundColor Gray
}
