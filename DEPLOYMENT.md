# Deployment Checklist

## Pre-Deployment

- [ ] All tests passing: `npm test`
- [ ] Build successful: `npm run build`
- [ ] Environment variables documented
- [ ] README.md complete with API documentation
- [ ] Postman collection tested

## Choose Deployment Platform

### Option 1: Railway ⭐ (Recommended - Best for WebSocket)

**Why Railway?**
- ✅ Free tier includes Redis
- ✅ Excellent WebSocket support
- ✅ Automatic SSL/HTTPS
- ✅ GitHub integration
- ✅ Environment variables auto-configured
- ✅ Easy rollbacks

**Steps:**

1. **Install CLI**
   ```powershell
   npm install -g @railway/cli
   ```

2. **Login**
   ```powershell
   railway login
   ```

3. **Initialize Project**
   ```powershell
   railway init
   # Create new project → Yes
   # Name → meme-coin-aggregator
   ```

4. **Add Redis**
   ```powershell
   railway add
   # Select: Redis
   # Railway automatically configures REDIS_URL
   ```

5. **Deploy**
   ```powershell
   railway up
   ```

6. **Get Public URL**
   ```powershell
   railway domain
   # Generates: https://your-app.up.railway.app
   ```

7. **Test**
   ```powershell
   $url = (railway domain).Trim()
   Invoke-RestMethod "$url/api/health"
   Invoke-RestMethod "$url/api/tokens?limit=5"
   Start-Process "$url/demo.html"
   ```

**Environment Variables (Auto-Set by Railway):**
- `REDIS_URL` - Connection string
- `PORT` - Server port
- `NODE_ENV` - Set to "production" automatically

**No manual configuration needed!** ✨

**Troubleshooting:**
```powershell
# View deployment logs
railway logs --follow

# Check variables
railway variables

# Force redeploy
railway up --detach

# SSH into container
railway shell
```

**Railway Dashboard:** https://railway.app/dashboard

---

### Option 2: Render (Good Alternative)

**Why Render?**
- ✅ Free tier available
- ✅ Automatic deploys from GitHub
- ✅ Good documentation
- ⚠️ Redis requires paid plan ($7/mo) or external Redis

**Steps:**

1. **Push to GitHub**
   ```powershell
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub

3. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect GitHub repository
   - Settings:
     - Name: meme-coin-aggregator
     - Environment: Node
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
     - Instance Type: Free

4. **Add Redis** (Choose one)
   
   **Option A: Use Redis Cloud (Free)**
   - Sign up at https://redis.com/try-free/
   - Create database
   - Add environment variables in Render:
     ```
     REDIS_HOST=<your-redis-host>
     REDIS_PORT=<your-redis-port>
     REDIS_PASSWORD=<your-redis-password>
     ```

   **Option B: Render Redis ($7/mo)**
   - Create Redis instance in Render
   - Link to your web service

5. **Deploy**
   - Render auto-deploys on git push

**Render Dashboard:** https://dashboard.render.com

---

### Option 3: Fly.io (Developer Friendly)

**Why Fly.io?**
- ✅ Free tier includes Redis (256MB)
- ✅ Good performance
- ✅ Multiple regions
- ⚠️ CLI required

**Steps:**

1. **Install Fly CLI**
   ```powershell
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **Login**
   ```powershell
   fly auth login
   ```

3. **Launch App**
   ```powershell
   fly launch
   # Follow prompts:
   # - App name: meme-coin-aggregator
   # - Region: Choose closest
   # - PostgreSQL: No
   # - Redis: Yes (select Upstash Redis)
   ```

4. **Deploy**
   ```powershell
   fly deploy
   ```

5. **Open App**
   ```powershell
   fly open
   ```

**Fly.io Dashboard:** https://fly.io/dashboard

---

### Option 4: Vercel (Serverless - Limited WebSocket Support)

**Note:** Vercel has limited WebSocket support. Only use if you can separate WebSocket to another service.

---

## Post-Deployment Checklist

- [ ] Health endpoint working: `GET /api/health`
- [ ] Tokens endpoint working: `GET /api/tokens?limit=10`
- [ ] Search working: `GET /api/tokens/search?q=BONK`
- [ ] WebSocket connects successfully
- [ ] Multiple browser tabs show synchronized updates
- [ ] Response times < 500ms
- [ ] No errors in application logs
- [ ] Update README with live URL
- [ ] Test Postman collection against live URL
- [ ] Verify Redis connection in logs

## Environment Variables for Production

```env
# Server
PORT=3000
NODE_ENV=production

# Redis (update with your credentials)
REDIS_HOST=<your-redis-host>
REDIS_PORT=<your-redis-port>
REDIS_PASSWORD=<your-redis-password>
REDIS_DB=0

# Cache
CACHE_TTL=30

# Rate Limiting
DEXSCREENER_RATE_LIMIT=300
RATE_LIMIT_WINDOW=60000

# WebSocket
WS_UPDATE_INTERVAL=5000

# Scheduler
CRON_SCHEDULE=*/30 * * * * *
```

## Update README with Live URL

After deployment, add to README.md:

```markdown
## 🌐 Live Demo

- **API Base URL:** https://your-app.railway.app
- **WebSocket:** wss://your-app.railway.app
- **Health Check:** https://your-app.railway.app/api/health
- **Demo Page:** https://your-app.railway.app/demo.html

## API Examples (Live)

bash
# Get all tokens
curl "https://your-app.railway.app/api/tokens?limit=10"

# Search tokens
curl "https://your-app.railway.app/api/tokens/search?q=BONK"
```

## Demo Video Recording Checklist

- [ ] Service deployed and running
- [ ] Demo page accessible
- [ ] Postman collection updated with live URL
- [ ] Script/outline prepared
- [ ] Recording software ready (OBS/Loom/Windows Game Bar)

**What to Show (1-2 minutes):**
1. **Introduction (10s):** Brief overview of the project
2. **Live API Demo (30s):**
   - Open Postman
   - Show health check
   - Get tokens with filtering
   - Search for specific token
   - Show response times
3. **WebSocket Demo (30s):**
   - Open 2-3 browser tabs with demo.html
   - Show real-time synchronization
   - Point out volume spikes and price updates
4. **Performance Test (20s):**
   - Run 5-10 rapid API calls
   - Show caching improving response times
   - Show rate limiting in action

## Upload to YouTube

1. **Record video** (keep under 2 minutes)
2. **Upload to YouTube**
   - Title: "Meme Coin Aggregator - Real-time Data Service Demo"
   - Description: Include GitHub repo link and live URL
   - Visibility: Unlisted or Public
3. **Get link** and add to README

## Final README Updates

Add these sections to README.md:

markdown
## 🎥 Demo Video

[Watch 2-minute demo on YouTube](https://youtu.be/your-video-id)

## 🌐 Live Deployment

- **Production URL:** https://your-app.railway.app
- **API Documentation:** https://your-app.railway.app/api/health
- **Interactive Demo:** https://your-app.railway.app/demo.html

## 🧪 Try It Now

powershell
# Health check
Invoke-RestMethod https://your-app.railway.app/api/health

# Get trending tokens
Invoke-RestMethod "https://your-app.railway.app/api/tokens?limit=10&sortBy=volume"

# Search
Invoke-RestMethod "https://your-app.railway.app/api/tokens/search?q=BONK"


## Deliverables Summary

✅ **1. GitHub Repository**
- Clean commit history
- Complete source code
- All dependencies listed
- Tests included

✅ **2. Live Deployment**
- Public URL accessible
- All endpoints working
- WebSocket functional
- Redis connected

✅ **3. Documentation**
- README with architecture decisions
- API documentation
- Setup instructions
- Postman collection

✅ **4. Demo Video**
- 1-2 minute walkthrough
- Shows functionality
- Demonstrates real-time updates
- Performance testing

✅ **5. Tests**
- ≥10 unit/integration tests
- All tests passing
- Edge cases covered

---

**You're ready to deploy! Choose a platform and follow the steps above.** 🚀
