# Quick Start Guide

## ⚡ Get Started in 3 Minutes

### Step 1: Install Redis (Choose One)

**Option A: Docker (Easiest - Recommended)**
```powershell
docker run -d -p 6379:6379 --name redis redis:alpine
```

**Option B: Redis Cloud (No Installation)**
1. Go to https://app.redislabs.com/#/sign-up
2. Create free database (30MB)
3. Copy host, port, password
4. Update `.env`:
   ```env
   REDIS_HOST=your-host.cloud.redislabs.com
   REDIS_PORT=12345
   REDIS_PASSWORD=your-password
   ```

**Option C: Windows Local**
```powershell
# Using Chocolatey
choco install redis-64
redis-server
```

### Step 2: Install & Run

```powershell
# Install dependencies
npm install

# Start the service (creates .env automatically if missing)
npm run dev
```

You should see:
```
✓ Redis connected
✓ Server running on http://localhost:3000
✓ WebSocket available on ws://localhost:3000
```

### Step 3: Test It Works

**PowerShell:**
```powershell
# Health check
Invoke-RestMethod http://localhost:3000/api/health

# Get tokens
Invoke-RestMethod "http://localhost:3000/api/tokens?limit=10"
```

**Browser:**
```
http://localhost:3000/demo.html
```

You'll see real-time token updates! 🚀

## 🚀 Deploy to Railway (5 Minutes)

```powershell
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway add redis
railway up

# Get your live URL
railway domain
```

Done! Your API is live! ✨

## ❓ Troubleshooting

**Redis won't connect?**
```powershell
# Test Redis
redis-cli ping  # Should return: PONG
```

**Port 3000 in use?**
```powershell
# Change port
$env:PORT=3001
npm run dev
```

**Need to reset?**
```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

## 📝 What's Next?

- [x] Local setup ✅
- [ ] Deploy to Railway
- [ ] Record demo video
- [ ] Share GitHub repo

See `SETUP.md` for detailed deployment guides!
