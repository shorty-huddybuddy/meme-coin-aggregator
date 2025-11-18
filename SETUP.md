# Installation & Setup

## Quick Start (Local Development)

### 1. Install Redis

**Windows (using Chocolatey):**
```powershell
choco install redis-64
redis-server
```

**Or use Redis Cloud (Free tier):**
- Sign up at https://redis.com/try-free/
- Get connection details
- Update `.env` with cloud credentials

### 2. Install Dependencies
```powershell
npm install
```

### 3. Configure Environment
```powershell
Copy-Item .env.example .env
# Edit .env with your Redis configuration
```

### 4. Run the Service
```powershell
npm run dev
```

The service will be available at:
- REST API: http://localhost:3000
- WebSocket: ws://localhost:3000
- Demo page: http://localhost:3000/demo.html (if static files served)

## Testing the Service

### 1. REST API Testing

**Using PowerShell:**
```powershell
# Health check
Invoke-RestMethod -Uri http://localhost:3000/api/health

# Get tokens
Invoke-RestMethod -Uri "http://localhost:3000/api/tokens?limit=10"

# Search tokens
Invoke-RestMethod -Uri "http://localhost:3000/api/tokens/search?q=BONK"
```

**Using curl:**
```powershell
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/tokens?limit=10&sortBy=volume&sortOrder=desc"
```

**Using Postman:**
1. Import `postman_collection.json`
2. Set `baseUrl` variable to `http://localhost:3000`
3. Run collection or individual requests

### 2. WebSocket Testing

Open `public/demo.html` in multiple browser tabs to see real-time synchronization.

**Using wscat (CLI tool):**
```powershell
npm install -g wscat
wscat -c ws://localhost:3000
```

Then in the connected session:
```javascript
// Subscribe to updates
{"event": "subscribe", "data": {"filters": {"minVolume": 1000}}}
```

### 3. Load Testing

**Rapid API calls (PowerShell):**
```powershell
1..10 | ForEach-Object {
    $start = Get-Date
    Invoke-RestMethod -Uri "http://localhost:3000/api/tokens?limit=5"
    $end = Get-Date
    $duration = ($end - $start).TotalMilliseconds
    Write-Host "Request $_ : ${duration}ms"
}
```

## Deployment Guide

### Option 1: Railway (Recommended)

1. **Install Railway CLI:**
```powershell
npm install -g @railway/cli
```

2. **Login and Initialize:**
```powershell
railway login
railway init
```

3. **Add Redis:**
```powershell
railway add redis
```

4. **Deploy:**
```powershell
railway up
```

5. **Get URL:**
```powershell
railway open
```

### Option 2: Render

1. Create account at https://render.com
2. Connect GitHub repository
3. Create new Web Service
4. Add Redis instance (free tier)
5. Set environment variables:
   - `REDIS_HOST`
   - `REDIS_PORT`
   - `REDIS_PASSWORD`
6. Deploy

### Option 3: Fly.io

1. **Install Fly CLI:**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

2. **Launch and Deploy:**
```powershell
fly launch
fly deploy
```

### Option 4: Docker

```powershell
# Build image
docker build -t meme-coin-aggregator .

# Run with Docker Compose
docker-compose up -d
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Recording Demo Video

### Setup
1. Start the service: `npm run dev`
2. Open `public/demo.html` in browser
3. Open Postman with imported collection
4. Have 2-3 browser tabs ready

### Recording Steps (1-2 minutes)

**Part 1: Introduction (15 seconds)**
- Show the demo page connected
- Explain what the service does

**Part 2: REST API Demo (30 seconds)**
- Run Postman collection requests:
  - Health check
  - Get all tokens
  - Search for specific token
  - Filter by volume
  - Show pagination
- Show response times in Postman

**Part 3: WebSocket Demo (30 seconds)**
- Show multiple browser tabs with demo.html
- Point out real-time updates syncing across tabs
- Show volume spikes and price updates in event log
- Show live token cards updating

**Part 4: Rapid API Calls (15 seconds)**
- Run PowerShell script for 5-10 rapid calls
- Show response times (demonstrating caching)
- Point out faster responses after first call

**Tools for Recording:**
- OBS Studio (free)
- Windows Game Bar (Win + G)
- Loom (browser-based)

## Troubleshooting

### Redis Connection Issues
```powershell
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Or check with PowerShell
Test-NetConnection -ComputerName localhost -Port 6379
```

### Port Already in Use
```powershell
# Find process using port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess

# Kill the process
Stop-Process -Id <PID>
```

### Build Errors
```powershell
# Clean install
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

## Performance Tips

1. **Increase Cache TTL for Production:**
   ```env
   CACHE_TTL=60  # 60 seconds instead of 30
   ```

2. **Adjust WebSocket Update Interval:**
   ```env
   WS_UPDATE_INTERVAL=10000  # 10 seconds for less frequent updates
   ```

3. **Use Redis Clustering** for high availability (production)

4. **Enable Compression** (already included in Express setup)

## Monitoring

### Local Logs
```powershell
npm run dev
# Watch console for:
# - API requests
# - WebSocket connections
# - Cache hits/misses
# - Rate limit warnings
```

### Production Monitoring
- Use Railway/Render built-in logs
- Add application monitoring (e.g., DataDog, New Relic free tier)
- Set up alerts for errors and downtime

## Next Steps After MVP

If time permits, consider adding:
- [ ] Rate limiting middleware for REST API
- [ ] Authentication/API keys
- [ ] Persistent storage for historical data
- [ ] GraphQL endpoint
- [ ] Advanced filtering (regex, multi-protocol)
- [ ] Token analytics and trends
- [ ] Price alerts via WebSocket
- [ ] Admin dashboard
- [ ] Metrics and monitoring dashboard
- [ ] Multi-chain support (beyond Solana)
