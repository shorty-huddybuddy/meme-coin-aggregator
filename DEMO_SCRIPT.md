# Demo Video Script (90-120 seconds)

## 🎬 Screen Recording Setup

### Tools
- **OBS Studio** (free) or **Windows Game Bar** (Win+G)
- **Postman** for API testing
- **Browser** (Chrome/Edge) with multiple tabs

### Recording Settings
- **Resolution**: 1920x1080 (1080p)
- **Frame Rate**: 30 fps
- **Audio**: Optional (you can narrate or add text overlays)

---

## 📝 Script Timeline

### Section 1: Introduction (0:00 - 0:15) - 15 seconds

**Screen**: Show browser at https://meme-coin-aggregator-production.up.railway.app

**What to Show**:
1. Open the live frontend
2. Show the "ETERNAL - Solana Token Analytics" header
3. Show the stats bar (Total Tokens, Live indicator)
4. Scroll through the token table briefly

**Optional Narration/Text Overlay**:
> "ETERNAL - Real-time Solana token aggregation platform combining DexScreener, Jupiter, and GeckoTerminal data with WebSocket streaming and Redis caching."

---

### Section 2: API Functionality (0:15 - 0:40) - 25 seconds

**Screen**: Switch to Postman with collection imported

**What to Show**:

1. **Health Check** (5 sec)
   - Request: `GET /api/health`
   - Response: `{ "success": true, "data": { "status": "ok" } }`

2. **Get Tokens with Filters** (10 sec)
   - Request: `GET /api/tokens?limit=10&sortBy=volume&minVolume=1000`
   - Show response with token data
   - Point out: `pagination`, `totalCount`, `nextCursor`

3. **Search Tokens** (5 sec)
   - Request: `GET /api/tokens/search?q=BONK&limit=5`
   - Show search results

4. **Cache Status** (5 sec)
   - Request: `GET /api/cache/status`
   - Headers: Add `x-api-key: test-api-key`
   - Show: `usingInMemory: false`, `keyCount`, `sampleKeys`

**Optional Text Overlay**:
> "11 REST endpoints with filtering, sorting, pagination, and search capabilities"

---

### Section 3: WebSocket Real-Time Updates (0:40 - 1:05) - 25 seconds

**Screen**: Split screen with 2-3 browser tabs side-by-side

**What to Show**:

1. **Open Multiple Tabs** (5 sec)
   - Open 2-3 tabs of https://meme-coin-aggregator-production.up.railway.app
   - Arrange windows side-by-side

2. **Watch Live Updates** (15 sec)
   - Wait for WebSocket updates (every 3 seconds)
   - Point out: Green flash animations when prices update
   - Show: Same tokens updating simultaneously across all tabs
   - Highlight: 24hr change % and 7-day change % updating

3. **Browser Console** (5 sec)
   - Open DevTools console in one tab
   - Show WebSocket messages:
     ```
     🟢 WebSocket connected
     📊 Received 450 tokens
     💰 Price updates: 23 tokens
     ```

**Optional Text Overlay**:
> "WebSocket streaming with delta updates - green flash indicates real-time price changes synchronized across all clients"

---

### Section 4: Performance & Architecture (1:05 - 1:30) - 25 seconds

**Screen**: Switch back to Postman Runner

**What to Show**:

1. **Rapid API Calls - Cache Performance** (15 sec)
   - Open Postman **Collection Runner**
   - Select: `GET /api/tokens?limit=20`
   - Set iterations: **10**
   - Click **Run**
   - Show results table:
     - First call: ~400-500ms (fresh data)
     - Calls 2-10: <100ms (cached)
   - Point out: Response times dramatically faster with Redis cache

2. **Architecture Highlights** (10 sec)
   - Open `ARCHITECTURE.md` in VS Code
   - Scroll to show:
     - System overview diagram (ASCII art)
     - "Design Decisions" section
     - "Scalability Considerations" section
   - Show file size: 10,000+ words

**Optional Text Overlay**:
> "Redis caching: First call 500ms → Cached calls <100ms. 80% cache hit rate with 30s TTL."

---

### Section 5: Closing (1:30 - 1:35) - 5 seconds

**Screen**: Return to frontend or GitHub README

**What to Show**:
- GitHub repository: https://github.com/shorty-huddybuddy/meme-coin-aggregator
- Quick scroll through README showing:
  - Live demo link
  - Documentation links
  - 21 tests badge/section

**Optional Text Overlay**:
> "Production-ready with 21 tests, comprehensive docs, and Railway deployment"

---

## 🎯 Quick Checklist Before Recording

### Preparation
- [ ] Clear browser history/cookies for clean demo
- [ ] Import Postman collection from `postman_collection.json`
- [ ] Set Postman environment variable: `base_url` = `https://meme-coin-aggregator-production.up.railway.app`
- [ ] Add header in Postman: `x-api-key: test-api-key` (for protected endpoints)
- [ ] Test all endpoints work before recording
- [ ] Close unnecessary apps/windows
- [ ] Disable notifications (Focus Assist on Windows)
- [ ] Zoom browser to 100% (Ctrl+0)

### During Recording
- [ ] Move mouse slowly and deliberately
- [ ] Pause 2-3 seconds on each important screen
- [ ] Keep cursor visible when highlighting data
- [ ] Don't rush - 90-120 seconds is plenty of time

### After Recording
- [ ] Trim any dead space at start/end
- [ ] Add title card (optional): "ETERNAL - Solana Token Analytics"
- [ ] Add text overlays if not narrating (optional)
- [ ] Export as MP4 (1080p, H.264)

---

## 🎥 Alternative: Narration Script

If you want to add voiceover narration:

```
[0:00-0:15]
"ETERNAL is a real-time Solana token analytics platform. It aggregates data from DexScreener, Jupiter, and GeckoTerminal with WebSocket streaming and Redis caching."

[0:15-0:40]
"The REST API provides 11 endpoints with filtering, sorting, and pagination. Here's a health check, fetching tokens with volume filters, searching for specific tokens, and checking cache status showing Redis is active."

[0:40-1:05]
"WebSocket streaming keeps data synchronized across all clients in real-time. Watch as price updates appear simultaneously in multiple browser tabs - the green flash indicates live updates happening every 3 seconds."

[1:05-1:30]
"Performance is optimized with Redis caching. The first API call takes 500 milliseconds to fetch fresh data, but subsequent calls are served from cache in under 100 milliseconds. The architecture documentation details all design decisions and scalability considerations."

[1:30-1:35]
"The project includes 21 comprehensive tests and is deployed to Railway with auto-scaling. All code and documentation are available on GitHub."
```

---

## 📱 One-Take Recording Flow

**Just hit record and follow this:**

1. ✅ **Open browser** → Show frontend with live data (15s)
2. ✅ **Switch to Postman** → Run 4 requests (Health, Tokens, Search, Cache) (25s)
3. ✅ **Open 3 browser tabs** → Show WebSocket sync with green flashes (25s)
4. ✅ **Postman Runner** → 10 rapid calls showing cache speedup (15s)
5. ✅ **Show ARCHITECTURE.md** → Scroll through sections (10s)
6. ✅ **GitHub README** → Show repo and docs (5s)

**Total: 95 seconds** ✅

---

## 🎬 Recording Commands (Step-by-Step)

### Windows Game Bar (Easiest)
```
1. Press Win+G to open Game Bar
2. Click the Record button (●)
3. Press Win+Alt+R to start/stop recording
4. Videos saved to: C:\Users\<YourName>\Videos\Captures
```

### OBS Studio (Professional)
```
1. Download from obsproject.com
2. Add Source → Display Capture (for full screen) or Window Capture
3. Settings → Output → Recording Quality: High Quality, Medium File Size
4. Click "Start Recording"
5. Click "Stop Recording" when done
6. File saved to: Videos folder (check Settings → Output → Recording Path)
```

---

## 💡 Pro Tips

1. **Practice first** - Do a dry run without recording
2. **Keep it simple** - Don't try to show everything, focus on impact
3. **Show, don't tell** - Visual data speaks louder than explanations
4. **Highlight key metrics** - Response times, token counts, cache hits
5. **End strong** - GitHub repo and docs show completeness

---

## 📤 Upload to YouTube

1. Go to https://studio.youtube.com
2. Click **Create** → **Upload videos**
3. Select your MP4 file
4. **Title**: "ETERNAL - Real-time Solana Token Analytics Platform Demo"
5. **Description**:
   ```
   Live Demo: https://meme-coin-aggregator-production.up.railway.app
   GitHub: https://github.com/shorty-huddybuddy/meme-coin-aggregator
   
   Features:
   - Multi-source data aggregation (DexScreener, Jupiter, GeckoTerminal)
   - WebSocket real-time streaming
   - Redis caching (<100ms response times)
   - 11 REST API endpoints
   - 21 comprehensive tests
   - Professional dark DEX UI
   ```
6. **Visibility**: Unlisted (or Public if you prefer)
7. Click **Upload**
8. Copy the YouTube link

---

## ✅ Final Step: Update README

Once uploaded, add the YouTube link to README.md:

```markdown
📺 **Demo Video**: [Watch on YouTube](https://youtu.be/YOUR_VIDEO_ID_HERE)
```

---

**You've got this! 🚀 The demo will look impressive with the live data and WebSocket updates.**
