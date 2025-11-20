# Railway Redis Connection Architecture

## 🏗️ How Railway Services Connect

```
┌─────────────────────────────────────────────────────────────┐
│                     RAILWAY PROJECT                          │
│                                                              │
│  ┌──────────────────────┐         ┌──────────────────────┐ │
│  │  Redis Service       │         │  meme-coin-aggregator│ │
│  │  ─────────────       │         │  ─────────────────── │ │
│  │                      │         │                      │ │
│  │  Auto-Generated      │         │  Your Variables:     │ │
│  │  Variables:          │         │                      │ │
│  │  ✓ REDISHOST        │────────▶│  REDIS_PRIVATE_URL   │ │
│  │  ✓ REDISPORT        │  Links  │  = ${{Redis.XXX}}    │ │
│  │  ✓ REDISPASSWORD    │────────▶│                      │ │
│  │  ✓ REDIS_PRIVATE_URL│────────▶│  OR                  │ │
│  │                      │         │                      │ │
│  │  Port: 6379          │         │  REDISHOST           │ │
│  │  Network: Internal   │         │  = ${{Redis.REDISHOST}}│
│  │                      │         │  REDISPORT           │ │
│  │                      │         │  = ${{Redis.REDISPORT}}│
│  │                      │         │  REDISPASSWORD       │ │
│  │                      │         │  = ${{Redis.PASSWORD}}│
│  └──────────────────────┘         └──────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Current vs. Fixed Setup

### ❌ Current (Not Working)

```
meme-coin-aggregator environment:
┌─────────────────────────────────┐
│ NO REDIS VARIABLES SET          │
│                                 │
│ App reads from process.env:     │
│ - REDIS_PRIVATE_URL: undefined  │
│ - REDISHOST: undefined          │
│ - REDISPORT: undefined          │
│ - REDISPASSWORD: undefined      │
│                                 │
│ Falls back to defaults:         │
│ - host: "redis" ← Wrong!        │
│ - port: 6379                    │
│ - password: undefined ← Wrong!  │
└─────────────────────────────────┘
         │
         ▼
  Tries to connect to "redis:6379"
         │
         ▼
  ❌ Connection fails
         │
         ▼
  Falls back to in-memory cache
```

### ✅ Fixed (Working)

```
meme-coin-aggregator environment:
┌─────────────────────────────────┐
│ Variables linked from Redis:    │
│                                 │
│ REDIS_PRIVATE_URL:              │
│ = ${{Redis.REDIS_PRIVATE_URL}}  │
│   (Railway resolves this at     │
│    runtime to actual value)     │
│                                 │
│ At runtime becomes:             │
│ redis://user:pass123@           │
│   redis.railway.internal:6379   │
└─────────────────────────────────┘
         │
         ▼
  App parses connection URL
         │
         ▼
  Connects to redis.railway.internal:6379
  with authentication
         │
         ▼
  ✅ Redis connected successfully
```

## 🎯 The Variable Linking Process

### Step-by-Step Variable Resolution:

```
1. YOU SET IN RAILWAY UI:
   ┌────────────────────────────────────┐
   │ Variable: REDIS_PRIVATE_URL        │
   │ Value: ${{Redis.REDIS_PRIVATE_URL}}│ ← Template
   └────────────────────────────────────┘

2. RAILWAY RESOLVES AT BUILD TIME:
   ┌────────────────────────────────────┐
   │ REDIS_PRIVATE_URL=                 │
   │ redis://default:abc123@            │
   │ redis.railway.internal:6379        │ ← Actual value
   └────────────────────────────────────┘

3. YOUR APP READS:
   ┌────────────────────────────────────┐
   │ process.env.REDIS_PRIVATE_URL      │
   │ = "redis://default:abc123@..."     │ ← Resolved!
   └────────────────────────────────────┘

4. CODE PARSES IT:
   ┌────────────────────────────────────┐
   │ config.redis = {                   │
   │   host: "redis.railway.internal",  │
   │   port: 6379,                      │
   │   password: "abc123"               │
   │ }                                  │
   └────────────────────────────────────┘

5. IOREDIS CONNECTS:
   ┌────────────────────────────────────┐
   │ new Redis({                        │
   │   host: "redis.railway.internal",  │
   │   port: 6379,                      │
   │   password: "abc123"               │
   │ })                                 │
   │                                    │
   │ ✓ Connected successfully           │
   └────────────────────────────────────┘
```

## 🚫 Common Mistakes Visualized

### ❌ Mistake 1: Adding Variables to Redis Service

```
WRONG:
┌──────────────────────┐         ┌──────────────────────┐
│  Redis Service       │         │  meme-coin-aggregator│
│  ─────────────       │         │  ─────────────────── │
│                      │         │                      │
│  YOU ADD HERE:       │         │  (No variables)      │
│  REDIS_PRIVATE_URL ✗ │         │                      │
│                      │         │  ← App can't see it! │
└──────────────────────┘         └──────────────────────┘


CORRECT:
┌──────────────────────┐         ┌──────────────────────┐
│  Redis Service       │         │  meme-coin-aggregator│
│  ─────────────       │         │  ─────────────────── │
│                      │         │                      │
│  (Auto-generated)    │────────▶│  YOU ADD HERE:       │
│  REDISHOST          │         │  REDIS_PRIVATE_URL ✓ │
│  REDISPORT          │         │  = ${{Redis.XXX}}    │
│  REDISPASSWORD      │         │                      │
└──────────────────────┘         └──────────────────────┘
```

### ❌ Mistake 2: Manually Typing Template

```
WRONG:
┌─────────────────────────────────────┐
│ Variable: REDIS_PRIVATE_URL         │
│ Value: ${{Redis.REDIS_PRIVATE_URL}} │ ← You typed this
│                                     │
│ Result: Literal string stored       │
│ Runtime: "${{Redis.REDIS_PRIVATE_URL}}" ✗
└─────────────────────────────────────┘


CORRECT:
┌─────────────────────────────────────┐
│ Variable: REDIS_PRIVATE_URL         │
│ Value: [Use Dropdown ▼]             │ ← Click dropdown
│   └─▶ Service: Redis                │
│       └─▶ Variable: REDIS_PRIVATE_URL│
│                                     │
│ Result: Railway creates reference   │
│ Runtime: "redis://user:pass@host:port" ✓
└─────────────────────────────────────┘
```

## 📋 Quick Reference

### Variable Options:

**Option A: Single URL Variable (Recommended)**
```
REDIS_PRIVATE_URL = ${{Redis.REDIS_PRIVATE_URL}}
```

**Option B: Individual Variables**
```
REDISHOST     = ${{Redis.REDISHOST}}
REDISPORT     = ${{Redis.REDISPORT}}
REDISPASSWORD = ${{Redis.REDISPASSWORD}}
```

### Why REDIS_PRIVATE_URL is Better:

```
PRIVATE_URL:
  ✓ Uses internal Railway network
  ✓ Faster (no internet routing)
  ✓ Free (no egress charges)
  ✓ More secure

PUBLIC_URL:
  ✗ Routes through internet
  ✗ Slower
  ✗ May incur costs
  ✗ Less secure
```

## 🎓 Understanding Railway Variable References

```
Template Syntax: ${{ServiceName.VariableName}}
                  │      │         │
                  │      │         └── Variable from that service
                  │      └──────────── Service name
                  └─────────────────── Railway template marker

Examples:
${{Redis.REDISHOST}}           → redis.railway.internal
${{Redis.REDISPORT}}           → 6379
${{Redis.REDISPASSWORD}}       → abc123xyz...
${{Redis.REDIS_PRIVATE_URL}}   → redis://default:abc123@redis.railway.internal:6379

Your App Service Variables:
${{Postgres.DATABASE_URL}}     → postgres://...
${{MyAPI.API_KEY}}             → sk-...
```

---

## ✅ Final Checklist

- [ ] Understand which service to add variables to (your app, not Redis)
- [ ] Know to use Railway's dropdown, not manual typing
- [ ] Understand `${{Service.Variable}}` is a reference, not a literal string
- [ ] Know to check logs after deployment for success/failure
- [ ] Can identify error messages and their solutions

---

**Key Takeaway:** 
Railway variable references (`${{...}}`) are like symlinks - they point to values in other services. Railway resolves them at runtime, so your app sees the actual values!
