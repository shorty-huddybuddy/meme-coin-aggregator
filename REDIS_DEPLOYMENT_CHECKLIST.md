# 🚀 Railway Redis Connection - Quick Deployment Checklist

## ✅ Pre-Deployment Checklist

- [ ] Code changes committed to git
- [ ] Both services exist in Railway (meme-coin-aggregator + Redis)
- [ ] Redis service is showing "Active" status

## 📝 Configuration Steps (Do This Now!)

### In Railway Dashboard:

1. **Click on `meme-coin-aggregator` service** (NOT Redis)

2. **Go to "Variables" tab**

3. **Add ONE of these configurations:**

   **Option A (Recommended):**
   ```
   Click "New Variable"
   Name: REDIS_PRIVATE_URL
   Value: Use dropdown → Select "Redis" → Select "REDIS_PRIVATE_URL"
   Result: ${{Redis.REDIS_PRIVATE_URL}}
   ```

   **Option B (If Option A doesn't work):**
   ```
   Add three variables using the dropdown:
   - REDISHOST → Redis → REDISHOST
   - REDISPORT → Redis → REDISPORT
   - REDISPASSWORD → Redis → REDISPASSWORD
   ```

4. **Click "Deploy" button**

## 🔍 Verification

After deployment completes, check the logs. You should see:

### ✅ Success Indicators:
```
🔍 Checking Redis environment variables:
  REDIS_PRIVATE_URL: ✓ Set

✓ Using REDIS_URL: redis://****@redis.railway.internal:6379

✓ Final Redis config: {
  host: 'redis.railway.internal',
  port: 6379,
  hasPassword: true
}

==============================================================
🔌 REDIS CONNECTION ATTEMPT
==============================================================
Host: redis.railway.internal
Port: 6379
Auth: YES ✓
Password: abcd...wxyz
==============================================================

✓ Redis connected successfully
```

### ❌ If You Still See Errors:

**Error: Variables not set**
```
Redis env vars: {
  REDIS_PRIVATE_URL: ✗ Not set
  ...
}
```
**Fix:** You added variables to Redis service instead of meme-coin-aggregator. Delete and re-add to the correct service.

---

**Error: Template variables**
```
⚠️  REDIS_URL contains unresolved template variables
Raw value: ${{Redis.REDIS_PRIVATE_URL}}
```
**Fix:** You manually typed the template. Delete variable and use Railway's dropdown to select it.

---

**Error: No password**
```
⚠️  REDIS CONFIGURATION ISSUE DETECTED!
Problem: No password provided for remote Redis connection
```
**Fix:** REDISPASSWORD variable not linked. Add it using the dropdown.

## 🧪 Test Redis Connection

Once deployed, test the connection:

```bash
# Use Railway CLI
railway run node check-redis-env.js

# Or check the health endpoint
curl https://your-app.railway.app/health
```

## 📊 Expected Metrics

After successful connection:
- Cache hit rate should improve
- Response times should decrease
- WebSocket updates should be faster
- Multiple instances can share data

## 🎯 Success Criteria

- [ ] Deployment logs show "✓ Redis connected successfully"
- [ ] No "Using in-memory cache" warnings
- [ ] Health endpoint returns healthy status
- [ ] Application can fetch and cache token data

## 📞 Need Help?

If still not working:

1. **Screenshot your Variables tab** (meme-coin-aggregator service)
2. **Copy first 100 lines of deployment logs**
3. **Check Redis service logs** for any errors
4. **Verify both services in same project**

## 🔗 Helpful Resources

- `RAILWAY_QUICK_FIX.md` - Detailed step-by-step guide
- `RAILWAY_REDIS_SETUP.md` - Complete troubleshooting guide
- `check-redis-env.js` - Environment variable checker script

---

## ⚡ Quick Commands

```bash
# Check environment variables locally
npm run check:redis

# Build for deployment
npm run build

# Test locally with Redis
docker-compose up -d redis
npm run dev

# Deploy to Railway (auto-deploys on git push)
git add .
git commit -m "fix: Configure Redis connection for Railway"
git push origin main
```

---

**Remember:** The key is to use Railway's UI dropdown to select variables, not manually typing `${{...}}`!

**Time to fix:** 2-3 minutes  
**Difficulty:** Easy (once you use the dropdown!)  
**Impact:** High (enables caching, better performance, WebSocket state sharing)
