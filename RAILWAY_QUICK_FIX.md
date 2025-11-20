# 🚂 Railway Redis Setup - Step by Step Guide

## Current Problem
Your logs show:
```
Redis env vars: {
  REDIS_URL: false,
  REDISHOST: false,
  REDISPORT: false,
  REDISPASSWORD: false
}
```

**This means the environment variables are NOT being passed to your app!**

---

## 🎯 Quick Fix (Follow These Exact Steps)

### Step 1: Open Your Railway Dashboard
1. Go to https://railway.app/dashboard
2. Click on your project: **meme-coin-aggregator**

### Step 2: Navigate to Service Variables
1. You should see TWO services:
   - **meme-coin-aggregator** (your main app) ← Click this one
   - **Redis** (the database)

2. Click on **meme-coin-aggregator** service
3. Click on the **"Variables"** tab at the top

### Step 3: Add Redis Connection Variable

**OPTION A: Single Variable Method (Recommended)**

Click "New Variable" and add:

```
Variable name: REDIS_PRIVATE_URL
Variable value: Click the dropdown → Select "Redis" → Select "REDIS_PRIVATE_URL"
```

The final value should show: `${{Redis.REDIS_PRIVATE_URL}}`

**OPTION B: Individual Variables Method**

If Option A doesn't work, add these THREE variables:

1. Click "New Variable"
   ```
   Name: REDISHOST
   Value: Click dropdown → Select "Redis" → Select "REDISHOST"
   ```

2. Click "New Variable"
   ```
   Name: REDISPORT
   Value: Click dropdown → Select "Redis" → Select "REDISPORT"
   ```

3. Click "New Variable"
   ```
   Name: REDISPASSWORD
   Value: Click dropdown → Select "Redis" → Select "REDISPASSWORD"
   ```

### Step 4: Deploy
1. Click the **"Deploy"** button in the top-right corner
2. Wait for the build to complete (2-3 minutes)

### Step 5: Check Logs
After deployment, click on the **"Deployments"** tab and view the latest logs.

You should now see:
```
🔍 Checking Redis environment variables:
  REDIS_PRIVATE_URL: ✓ Set
  REDISHOST: ✓ Set
  REDISPORT: ✓ Set
  REDISPASSWORD: ✓ Set
✓ Using REDIS_URL: redis://****@redis.railway.internal:6379
🔌 Attempting Redis connection to redis.railway.internal:6379
✓ Redis connected successfully
```

---

## 🚨 Common Mistakes to Avoid

### ❌ DON'T Do This:
- **Don't manually type** `${{Redis.REDISHOST}}` in the value field
- **Don't add variables to the Redis service** (add them to meme-coin-aggregator)
- **Don't use hardcoded values** like `localhost` or `6379`

### ✅ DO This:
- **Use Railway's dropdown** to select the Redis service and variable
- **Add variables to your app service** (meme-coin-aggregator), not Redis
- **Let Railway auto-populate** the values from the Redis service

---

## 🔍 How to Verify Variable References

In the Variables tab, your variables should look like this:

```
REDIS_PRIVATE_URL    ${{Redis.REDIS_PRIVATE_URL}}    [Edit] [Delete]
```

OR (if using individual variables):

```
REDISHOST           ${{Redis.REDISHOST}}              [Edit] [Delete]
REDISPORT           ${{Redis.REDISPORT}}              [Edit] [Delete]
REDISPASSWORD       ${{Redis.REDISPASSWORD}}          [Edit] [Delete]
```

The `${{Redis.XXX}}` format means Railway will automatically inject the actual values at runtime.

---

## 🧪 Testing After Deployment

### Method 1: Check Build Logs
1. Go to Deployments tab
2. Click on the latest deployment
3. Look for the Redis connection section in logs
4. Should show "✓ Redis connected successfully"

### Method 2: Run Environment Check
1. In Railway, go to your service
2. Click on "Settings"
3. Scroll to "Deploy"
4. Add a custom start command temporarily:
   ```
   node check-redis-env.js && node dist/index.js
   ```
5. Redeploy
6. Check logs for detailed environment variable status

### Method 3: Use Railway CLI
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Connect to your project
railway link

# Check environment in Railway
railway run node check-redis-env.js

# Or connect and check manually
railway shell
echo $REDIS_PRIVATE_URL
echo $REDISHOST
```

---

## 📊 What Your Logs Should Look Like

### ✅ SUCCESS:
```
🔍 Checking Redis environment variables:
  REDIS_PRIVATE_URL: ✓ Set
  REDISHOST: ✓ Set
  REDISPORT: ✓ Set
  REDISPASSWORD: ✓ Set

✓ Using REDIS_URL: redis://****@redis.railway.internal:6379

✓ Final Redis config: {
  host: 'redis.railway.internal',
  port: 6379,
  hasPassword: true,
  passwordLength: 32
}

🔌 Attempting Redis connection to redis.railway.internal:6379
   Auth: yes, Password: abcd...xyz

✓ Redis connected successfully
```

### ❌ FAILURE (Current State):
```
🔍 Checking Redis environment variables:
  REDIS_PRIVATE_URL: ✗ Not set
  REDIS_URL: ✗ Not set
  REDIS_PUBLIC_URL: ✗ Not set
  REDISHOST: ✗ Not set
  REDISPORT: ✗ Not set
  REDISPASSWORD: ✗ Not set

✓ Using individual env vars:
  Host: redis
  Port: 6379
  Password: None

Redis env vars: {
  REDIS_URL: false,
  REDISHOST: false,
  REDISPORT: false,
  REDISPASSWORD: false
}

⚠️  No REDIS_PASSWORD provided for remote Redis
⚡ Using in-memory cache instead
```

---

## 🆘 Still Not Working?

### Check These:

1. **Both services in same project?**
   - Redis and meme-coin-aggregator must be in the same Railway project

2. **Redis service is running?**
   - Click on Redis service, should show "Active" status

3. **Using Railway's dropdown?**
   - Don't manually type variable references
   - Use the UI dropdown to link services

4. **Variables in correct service?**
   - Add variables to **meme-coin-aggregator**, not Redis

5. **Recent deployment?**
   - Variables only take effect after redeploying

### Screenshot Your Setup
If still having issues, share:
1. Screenshot of Variables tab (in meme-coin-aggregator service)
2. Screenshot of deployment logs (first 50 lines)
3. Screenshot of Redis service status

---

## 📝 Summary

**What you need to do:**
1. Go to Railway → meme-coin-aggregator service → Variables tab
2. Add `REDIS_PRIVATE_URL` using Railway's dropdown (select Redis service)
3. Click Deploy
4. Check logs for "✓ Redis connected successfully"

**Time needed:** 2-3 minutes  
**Difficulty:** Easy (if you use the dropdown!)

**The key is:** Use Railway's variable reference feature (the dropdown), don't type the `${{...}}` manually!
