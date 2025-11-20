# Railway Redis Connection Setup

## The Problem
Your app shows:
```
Redis env vars: {
  REDIS_URL: false,
  REDISHOST: false,
  REDISPORT: false,
  REDISPASSWORD: false
}
```

This means the environment variables aren't being passed to your application.

## Solution: Configure Railway Environment Variables

### Step 1: Link Redis Service Variables

In your **meme-coin-aggregator** service (not the Redis service), add these environment variables:

#### Option A: Use Redis Private URL (Recommended)
```
REDIS_PRIVATE_URL=${{Redis.REDIS_PRIVATE_URL}}
```

#### Option B: Use Individual Variables (Alternative)
If Option A doesn't work, use these:
```
REDISHOST=${{Redis.REDISHOST}}
REDISPORT=${{Redis.REDISPORT}}
REDISPASSWORD=${{Redis.REDISPASSWORD}}
```

### Step 2: How to Add Variables in Railway

1. **Go to your Railway dashboard**
2. **Click on your `meme-coin-aggregator` service** (the main app, not Redis)
3. **Click on the "Variables" tab**
4. **Click "New Variable"**
5. **For each variable:**
   - Type the variable name (e.g., `REDISHOST`)
   - Click on the value field and select **"Redis"** from the dropdown
   - Select the corresponding Redis variable (e.g., `REDISHOST`)
   - The value will show as `${{Redis.REDISHOST}}`
6. **Click "Add"** and repeat for all variables

### Step 3: Important Railway Settings

Make sure these are set in your service variables:

```bash
NODE_ENV=production
PORT=8080

# Choose ONE of these approaches:

# APPROACH 1: Use REDIS_PRIVATE_URL (Recommended)
REDIS_PRIVATE_URL=${{Redis.REDIS_PRIVATE_URL}}

# APPROACH 2: Use individual variables (if approach 1 doesn't work)
REDISHOST=${{Redis.REDISHOST}}
REDISPORT=${{Redis.REDISPORT}}
REDISPASSWORD=${{Redis.REDISPASSWORD}}
```

### Step 4: Verify Redis Service

In your **Redis service**:
1. Make sure the Redis service is running (should show as "Active")
2. Check that it has these variables auto-generated:
   - `REDISHOST`
   - `REDISPORT`
   - `REDISPASSWORD`
   - `REDIS_PRIVATE_URL`
   - `REDIS_PUBLIC_URL`

### Step 5: Redeploy

After adding the variables:
1. Click **"Deploy"** button in your meme-coin-aggregator service
2. Watch the build logs
3. You should see:
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

## Common Issues

### Issue 1: Variables show `${{Redis.REDISPASSWORD}}`
**Cause:** You manually typed the template instead of using Railway's variable reference feature.

**Fix:** 
1. Delete the variable
2. Add it again using Railway's dropdown to select the Redis service variable
3. Railway will properly link them

### Issue 2: "Redis not available" despite correct variables
**Cause:** Services aren't on the same private network.

**Fix:**
1. Make sure both services are in the same project
2. Use `REDIS_PRIVATE_URL` instead of `REDIS_PUBLIC_URL`
3. Redeploy both services

### Issue 3: Redis connects but authentication fails
**Cause:** Password mismatch or empty password.

**Fix:**
1. Check Redis service logs to see if it's using authentication
2. Verify `REDISPASSWORD` is being passed correctly
3. Try connecting to Redis service directly via Railway CLI:
   ```bash
   railway connect Redis
   redis-cli -h localhost -p 6379 -a YOUR_PASSWORD
   ```

## Testing the Connection

After deployment, check the logs. You should see:

✅ **Success:**
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

❌ **Failure (current state):**
```
Redis env vars: {
  REDIS_URL: false,
  REDISHOST: false,
  REDISPORT: false,
  REDISPASSWORD: false
}
⚠️  No REDIS_PASSWORD provided for remote Redis
⚡ Using in-memory cache instead
```

## Alternative: Use Railway CLI

You can also set variables using Railway CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Set variables
railway variables set REDISHOST=${{Redis.REDISHOST}}
railway variables set REDISPORT=${{Redis.REDISPORT}}
railway variables set REDISPASSWORD=${{Redis.REDISPASSWORD}}

# Or use the private URL (easier)
railway variables set REDIS_PRIVATE_URL=${{Redis.REDIS_PRIVATE_URL}}
```

## Quick Checklist

- [ ] Redis service is running in Railway
- [ ] Both services are in the same Railway project
- [ ] Variables are added to meme-coin-aggregator service (not Redis)
- [ ] Variables use `${{Redis.VARIABLE_NAME}}` syntax (via Railway UI dropdown)
- [ ] Service has been redeployed after adding variables
- [ ] Logs show Redis environment variables as "✓ Set"
- [ ] No template variables (`${{...}}`) appear in actual runtime logs

## Need More Help?

If you're still having issues:

1. **Share your deployment logs** - Look for the Redis connection section
2. **Screenshot your Variables tab** - In the meme-coin-aggregator service
3. **Check Redis service logs** - Make sure Redis itself is running
4. **Verify network** - Both services should be in the same Railway project/environment
