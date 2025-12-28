# Fix Railway npm Error: Missing picomatch@2.3.1

## Problem
Railway is failing with:
```
npm error Missing: picomatch@2.3.1 from lock file
```

This happens when `package-lock.json` is missing, corrupted, or out of sync.

## Solution

### Step 1: Generate package-lock.json locally

Run these commands in your local project directory:

```bash
# Make sure you're in the project root
cd /Users/raahulbiswas/Documents/Dev/politracker

# Remove old lock file if it exists (optional)
rm -f package-lock.json

# Generate a fresh lock file
npm install

# Verify the lock file was created
ls -la package-lock.json
```

### Step 2: Commit and push the lock file

```bash
# Stage the new lock file
git add package-lock.json

# Commit it
git commit -m "Add package-lock.json to fix Railway build"

# Push to trigger Railway deployment
git push
```

### Step 3: Verify Railway build succeeds

After pushing, check Railway's build logs. The error should be resolved.

## Why This Fixes It

- Railway uses `npm ci` which requires `package-lock.json` to exist
- Without the lock file, npm can't ensure consistent dependency versions
- The lock file pins exact versions of all dependencies (including nested ones like picomatch)
- Generating it locally ensures it matches your local `package.json`

## Alternative: If npm install fails locally

If you get errors running `npm install` locally:

1. **Try cleaning npm cache:**
   ```bash
   npm cache clean --force
   npm install
   ```

2. **Use a specific npm version:**
   ```bash
   npm install -g npm@latest
   npm install
   ```

3. **Remove node_modules and reinstall:**
   ```bash
   rm -rf node_modules
   npm install
   ```

## Railway-Specific Fix (if lock file still causes issues)

If Railway still has issues after adding the lock file, you can tell Railway to use `npm install` instead of `npm ci`:

1. **Railway Dashboard** → Your Service → **Variables**
2. Add: `NPM_CONFIG_CLEAN=false`
3. Add: `NPM_CONFIG_FORCE=false`
4. Or set build command to: `npm install && npm run build`

But the recommended approach is to use `package-lock.json` with `npm ci` (which Railway does by default).

