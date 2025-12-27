# Initial Vote Sync Instructions

## Running the Initial Sync

The initial sync fetches votes from OpenParliament API for all 370 MPs and stores them in the local database.

### Option 1: Run in Background (Recommended)

```bash
nohup npm run db:sync-latest-votes > sync.log 2>&1 &
```

This will:
- Run the sync in the background
- Save output to `sync.log`
- Take approximately 30-60 minutes to complete all 370 MPs
- Continue even if some API calls timeout or fail

### Option 2: Run in Foreground (See Progress)

```bash
npm run db:sync-latest-votes
```

This shows real-time progress but you'll need to keep the terminal open.

### Monitoring Progress

Watch the log file:
```bash
tail -f sync.log
```

Check progress (shows every 10 MPs processed):
```bash
grep "Progress:" sync.log
```

### What Happens

1. **For each MP**:
   - Checks database for latest vote date
   - Fetches votes from OpenParliament API (limit 500 per MP)
   - Filters to only new votes (after latest date in DB)
   - Inserts new votes into database
   - Includes 300ms delay between MPs to avoid rate limiting

2. **Caching**:
   - Vote details are cached (1 week TTL)
   - Reduces duplicate API calls for the same votes

3. **Error Handling**:
   - Timeout errors are expected and handled gracefully
   - Script continues with next MP on errors
   - Final summary shows errors encountered

### Expected Output

```
Syncing Latest Votes from OpenParliament
========================================

Found 370 MPs to sync

Fetching votes for Aaron Gunn...
  Found 59 new votes (out of 59 total)
  ✓ Inserted 59 new votes for Aaron Gunn

[Progress: 10/370 MPs processed]

...

=== Summary ===
Total MPs processed: 370/370
New votes inserted: 15000+
Skipped (duplicates): 0
Errors encountered: 5-10
```

### After Initial Sync

Once complete, subsequent page loads will:
1. Load all votes from database (fast!)
2. Only fetch new votes from API (typically 0-5 per load)
3. Much faster and fewer API calls

### Re-running Sync

The sync script is smart - it only fetches new votes:
- First run: Fetches all votes (500 limit per MP)
- Second run: Only fetches votes newer than latest in DB
- Can be run daily/weekly to keep database updated

### Stopping the Sync

If running in background:
```bash
# Find the process
ps aux | grep "db:sync-latest-votes"

# Kill it
kill <PID>
```

