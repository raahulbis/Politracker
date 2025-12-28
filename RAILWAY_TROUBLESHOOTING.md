# Railway PostgreSQL Connection Troubleshooting

## Current Issue: ECONNREFUSED

You're seeing connection refused errors even though the connection string is being read correctly. The logs show:
```
[DB] Connecting to PostgreSQL (internal) at politracker.railway.internal:5432/railway
[DB] PostgreSQL connection pool created
Error: connect ECONNREFUSED ...
```

This indicates the connection string is correct, but the PostgreSQL service is not accepting connections.

## Step-by-Step Fix

### 1. Verify PostgreSQL Service Status ⚠️ MOST IMPORTANT

**In Railway Dashboard:**
1. Go to your Railway project
2. Find your **PostgreSQL service** in the service list
3. Check the status indicator:
   - ✅ **Green/Running** = Good
   - ⏸️ **Paused** = Start it!
   - ❌ **Stopped/Error** = Fix the service

**If the service is paused or stopped:**
- Click on the PostgreSQL service
- Click "Start" or "Deploy" button
- Wait for it to fully start (may take 1-2 minutes)

### 2. Verify Services Are in Same Project

**Check Service List:**
- Your application service (Next.js)
- Your PostgreSQL service

Both should appear in the **same project** sidebar. If they're in different projects:
- They cannot communicate via internal networking
- Move one service to match the other, OR
- Use `DATABASE_PUBLIC_URL` (not recommended, has costs)

### 3. Check Environment Variables

**In Railway Dashboard → Variables Tab:**

Look for these variables (one or more should exist):
- `DATABASE_PRIVATE_URL` ✅ (Best - internal connection)
- `DATABASE_URL` ✅ (Good - internal connection)
- `DATABASE_PUBLIC_URL` ⚠️ (Works but has egress costs)

**If none exist:**
- Your PostgreSQL service might not be properly linked
- Go to PostgreSQL service → Settings → Connect
- Ensure it's connected to your project

### 4. Verify PostgreSQL Service is Actually Running

Even if Railway says it's "Running", the database might not be ready:

**Check PostgreSQL Logs:**
1. Go to PostgreSQL service in Railway dashboard
2. Click on "Logs" tab
3. Look for:
   - ✅ "database system is ready to accept connections"
   - ❌ Any error messages
   - ❌ "FATAL" messages

**If you see errors in PostgreSQL logs:**
- The service might be starting up (wait 1-2 minutes)
- There might be a configuration issue
- Contact Railway support if errors persist

### 5. Test Connection Manually (Optional)

You can test the connection using Railway CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link your project
railway link

# Test connection (replace with your actual connection string)
railway run psql $DATABASE_URL -c "SELECT 1"
```

If this works, the issue is in your application code. If it doesn't, the issue is with Railway/PostgreSQL service.

## Common Solutions

### Solution 1: Restart PostgreSQL Service
1. Railway Dashboard → PostgreSQL Service
2. Click "..." menu → Restart
3. Wait for it to fully start
4. Try your application again

### Solution 2: Re-link PostgreSQL Service
1. Railway Dashboard → PostgreSQL Service
2. Go to Settings
3. Disconnect and reconnect the service
4. Check that `DATABASE_URL` appears in Variables

### Solution 3: Create New PostgreSQL Service
If the current one is corrupted:
1. Create a new PostgreSQL service in Railway
2. Railway will automatically create `DATABASE_URL`
3. Run database setup: `railway run npm run db:setup`
4. Import your data if needed

### Solution 4: Use DATABASE_PUBLIC_URL (Temporary)
If internal networking isn't working:
1. In Variables tab, use `DATABASE_PUBLIC_URL` instead
2. Add a new variable or modify your code temporarily
3. Note: This has egress costs and is less secure

## Verification Checklist

Before deploying, verify:
- [ ] PostgreSQL service shows "Running" status
- [ ] Both services are in the same Railway project
- [ ] `DATABASE_URL` or `DATABASE_PRIVATE_URL` exists in Variables
- [ ] PostgreSQL logs show "ready to accept connections"
- [ ] No errors in PostgreSQL service logs

## Still Not Working?

If you've checked all of the above:

1. **Check Railway Status Page:**
   - https://status.railway.app/
   - Look for any ongoing incidents

2. **View Detailed Logs:**
   ```bash
   railway logs --service <your-app-service>
   ```
   Look for the health check messages we added.

3. **Contact Railway Support:**
   - Include the error messages
   - Include PostgreSQL service status
   - Include whether services are in same project

## Expected Behavior After Fix

Once fixed, you should see in your logs:
```
[DB] Connecting to PostgreSQL (internal) at politracker.railway.internal:5432/railway
[DB] PostgreSQL connection pool created
[DB] ✅ Database health check passed
[DB]    Connected to internal database at politracker.railway.internal:5432/railway
```

Then your API endpoints should work without ECONNREFUSED errors.


