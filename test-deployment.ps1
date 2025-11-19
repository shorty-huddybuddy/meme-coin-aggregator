# Test deployment script

$baseUrl = "http://localhost:3000"  # Change to your deployed URL

Write-Host "Testing Meme Coin Aggregator Deployment..." -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n1. Testing health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod "$baseUrl/health"
    Write-Host "✓ Health check passed: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "✗ Health check failed" -ForegroundColor Red
    exit 1
}

# Test 2: Get Tokens
Write-Host "`n2. Testing tokens endpoint..." -ForegroundColor Yellow
try {
    $tokens = Invoke-RestMethod "$baseUrl/api/tokens?limit=5"
    Write-Host "✓ Tokens endpoint working: $($tokens.data.Count) tokens received" -ForegroundColor Green
} catch {
    Write-Host "✗ Tokens endpoint failed" -ForegroundColor Red
    exit 1
}

# Test 3: Search
Write-Host "`n3. Testing search endpoint..." -ForegroundColor Yellow
try {
    $search = Invoke-RestMethod "$baseUrl/api/tokens/search?q=SOL"
    Write-Host "✓ Search working: $($search.data.Count) results" -ForegroundColor Green
} catch {
    Write-Host "✗ Search failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n✓ All tests passed!" -ForegroundColor Green
Write-Host "Open demo page: $baseUrl/demo.html" -ForegroundColor Cyan
