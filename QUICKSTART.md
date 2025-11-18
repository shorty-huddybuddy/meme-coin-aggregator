# Quick Start Guide

## ⚡ Get Started in 5 Minutes

### Step 1: Install Redis (if not already installed)

**Option A: Use Redis Cloud (Recommended for quick start)**
1. Go to https://redis.com/try-free/
2. Create a free account
3. Create a database
4. Copy the connection details
5. Update your `.env` file:
   ```env
   REDIS_HOST=your-redis-host.cloud.redislabs.com
   REDIS_PORT=12345
   REDIS_PASSWORD=your-password
   ```

**Option B: Local Redis (Windows)**
```powershell
# Using Chocolatey
choco install redis-64
redis-server

# Or download from: https://github.com/microsoftarchive/redis/releases
```

**Option C: Docker Redis (Easiest)**
```powershell
docker run -d -p 6379:6379 redis:alpine
```

### Step 2: Configure Environment

Your `.env` file is already created! If using local Redis, no changes needed.
If using Redis Cloud, update the Redis credentials in `.env`.

### Step 3: Start the Service

```powershell
npm run dev
```

You should see:
```
✓ Redis connected
✓ WebSocket scheduler started
✓ Server running on http://localhost:3000
✓ WebSocket available on ws://localhost:3000
```

### Step 4: Test the API

**Open a new PowerShell window:**

```powershell
# Health check
Invoke-RestMethod http://localhost:3000/api/health

# Get tokens
Invoke-RestMethod "http://localhost:3000/api/tokens?limit=10"
```

### Step 5: Open the Demo Page

Open your browser and go to:
```
http://localhost:3000/demo.html
```

You'll see real-time token updates! 🚀

## 🧪 Run Tests

```powershell
npm test
```

## 📮 Import Postman Collection

1. Open Postman
2. Click "Import"
3. Select `postman_collection.json` from the project root
4. Set the `baseUrl` variable to `http://localhost:3000`
5. Try the requests!

## 🎥 Record Your Demo

1. Start the service: `npm run dev`
2. Open http://localhost:3000/demo.html in 2-3 browser tabs
3. Open Postman with the imported collection
4. Start recording (OBS Studio, Loom, or Windows Game Bar)
5. Show:
   - Multiple tabs updating in real-time
   - Run Postman requests
   - Show response times
   - Point out WebSocket events

## 🚀 Deploy to Railway (Free)

```powershell
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize
railway init

# Add Redis
railway add redis

# Deploy
railway up

# Get your public URL
railway domain
```

Your app will be live in minutes! ✨

## ❓ Troubleshooting

**Redis won't connect?**
```powershell
# Test Redis connection
redis-cli ping
# Should return: PONG
```

**Port 3000 already in use?**
```powershell
# Change port in .env
PORT=3001
```

**Dependencies not installing?**
```powershell
# Clear cache and reinstall
Remove-Item -Recurse -Force node_modules
npm install
```

## 📝 What's Included

✅ Multi-source data aggregation (DexScreener + Jupiter)
✅ Redis caching with 30s TTL
✅ WebSocket real-time updates
✅ Rate limiting with exponential backoff
✅ Token deduplication and merging
✅ REST API with filtering, sorting, pagination
✅ 10+ unit and integration tests
✅ Postman collection
✅ Interactive WebSocket demo page
✅ Complete documentation
✅ Docker support
✅ CI/CD pipeline ready

## 🎯 Next: Complete Your Deliverables

- [x] Working service with REST API ✅
- [x] WebSocket server ✅
- [x] Unit/integration tests ✅
- [x] Postman collection ✅
- [ ] Deploy to free hosting (Railway/Render/Fly)
- [ ] Record 1-2 min demo video
- [ ] Share GitHub repo link

You're 90% done! Just deploy and record the demo! 🎉
