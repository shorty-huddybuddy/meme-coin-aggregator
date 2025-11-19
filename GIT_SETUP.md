# Git Quick Start

## Initialize Git Repository

```powershell
# Navigate to project
cd c:\Users\Dinesh\eternal-lab

# Initialize git
git init

# Add all files
git add .

# Initial commit
git commit -m "feat: meme coin aggregator MVP

- Multi-source aggregation (DexScreener + Jupiter)
- Redis caching with 30s TTL
- WebSocket real-time updates
- REST API with filtering, sorting, pagination
- Rate limiting with exponential backoff
- 27 passing tests
- Postman collection and demo page
- Complete documentation"

# Create GitHub repository (choose one):

# Option 1: GitHub CLI (if installed)
gh repo create meme-coin-aggregator --public --source=. --remote=origin
git push -u origin main

# Option 2: Manual (create repo on github.com first)
git remote add origin https://github.com/YOUR_USERNAME/meme-coin-aggregator.git
git branch -M main
git push -u origin main
```

## Recommended Commit Structure

The repository is organized with these key commits:

### Main Branches
- `main` - Production-ready code
- `develop` (optional) - Development branch

### Commit Guidelines

**Already done in initial commit:**
- ✅ Project setup (package.json, tsconfig, configs)
- ✅ Core services (aggregation, cache, API integrations)
- ✅ REST API routes with validation
- ✅ WebSocket server implementation
- ✅ Tests (27 passing)
- ✅ Documentation (README, guides)
- ✅ Postman collection
- ✅ Demo page

### After Deployment

```powershell
# Update with deployment info
git add .
git commit -m "Add deployment configuration and live URL"
git push
```

## Verify Before Pushing

```powershell
# Check .gitignore works
git status  # Should NOT show .env or node_modules/

# Verify build works
npm run build

# Run tests
npm test
```

## Verify Repository

Before pushing, verify:
- [ ] `.env` is in `.gitignore` (don't commit secrets!)
- [ ] `node_modules/` is in `.gitignore`
- [ ] All tests pass: `npm test`
- [ ] Build works: `npm run build`
- [ ] README includes all necessary info

## .gitignore Check

Your `.gitignore` should include:
```
node_modules/
dist/
.env
*.log
coverage/
.DS_Store
.vscode/
*.pid
.cache/
```

## Share Repository

After pushing to GitHub:
1. Make repository public (Settings → Danger Zone → Change visibility)
2. Add description: "Real-time meme coin data aggregator with multi-source DEX integration, Redis caching, and WebSocket updates"
3. Add topics: `dex`, `solana`, `real-time`, `websocket`, `typescript`, `redis`, `api`
4. Copy repository URL for submission

## Quick Commands Reference

```powershell
# Status check
git status

# View changes
git diff

# Add specific file
git add <filename>

# Commit with message
git commit -m "Your message"

# Push to GitHub
git push

# View commit history
git log --oneline

# Create new branch
git checkout -b feature/new-feature

# Merge branch
git checkout main
git merge feature/new-feature
```

## GitHub Repository Checklist

Before submission:
- [ ] Repository is public
- [ ] README.md is comprehensive
- [ ] All code is committed and pushed
- [ ] .env is NOT committed (check .gitignore)
- [ ] Tests are passing (add badge in README)
- [ ] License file added (MIT recommended)
- [ ] Topics/tags added
- [ ] Description added
- [ ] Live URL added to README (after deployment)
- [ ] Demo video link added to README

## Adding Badges to README

Add these to the top of README.md after deployment:

```markdown
![Build Status](https://github.com/YOUR_USERNAME/meme-coin-aggregator/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![Node](https://img.shields.io/badge/Node-20.x-green.svg)
![Tests](https://img.shields.io/badge/tests-27%20passing-brightgreen.svg)
```

## Troubleshooting Git Issues

**Large files?**
```powershell
# See file sizes
git ls-files | ForEach-Object { Get-Item $_ | Select-Object FullName, Length }

# Remove from git if too large
git rm --cached <filename>
echo "<filename>" >> .gitignore
```

**Wrong commit message?**
```powershell
# Amend last commit message
git commit --amend -m "New message"
```

**Need to reset?**
```powershell
# Soft reset (keep changes)
git reset --soft HEAD~1

# Hard reset (discard changes) - CAREFUL!
git reset --hard HEAD~1
```

---

**Ready to push? Run the commands above to initialize and push to GitHub!** 🚀
