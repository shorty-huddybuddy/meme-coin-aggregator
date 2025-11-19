# Deployment Verification Script

param(
    [Parameter(Mandatory=$true)]
    [string]$Url
)

Write-Host "🔍 Verifying deployment at: $Url" -ForegroundColor Cyan

$tests = @(
    @{Name="Health Check"; Endpoint="/health"},
    @{Name="Get Tokens"; Endpoint="/api/tokens?limit=5"},
    @{Name="Search Tokens"; Endpoint="/api/tokens/search?q=SOL"},
    @{Name="Demo Page"; Endpoint="/demo.html"}
)

$passed = 0
$failed = 0

foreach ($test in $tests) {
    Write-Host "`nTesting: $($test.Name)..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "$Url$($test.Endpoint)" -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ PASSED" -ForegroundColor Green
            $passed++
        } else {
            Write-Host "✗ FAILED (Status: $($response.StatusCode))" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "✗ FAILED ($($_.Exception.Message))" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`n" -NoNewline
Write-Host "Results: " -NoNewline -ForegroundColor Cyan
Write-Host "$passed passed, " -NoNewline -ForegroundColor Green
Write-Host "$failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -eq 0) {
    Write-Host "`n🎉 All tests passed! Deployment successful!" -ForegroundColor Green
    Write-Host "   Open demo: $Url/demo.html" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠ Some tests failed. Check logs with: railway logs" -ForegroundColor Yellow
}
