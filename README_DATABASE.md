# Database Setup Guide

This project uses PostgreSQL to store MP data, postal code mappings, votes, and bills. This avoids API rate limits and provides faster searches.

## Prerequisites

1. **Install PostgreSQL**
   - macOS: `brew install postgresql@14 && brew services start postgresql@14`
   - Linux: `sudo apt-get install postgresql postgresql-contrib`
   - Or download from: https://www.postgresql.org/download/

2. **Create Database**
   ```bash
   createdb politracker
   ```

3. **Set Environment Variable**
   ```bash
   export DATABASE_URL="postgresql://username@localhost:5432/politracker"
   ```
   Or add to `.env` file:
   ```
   DATABASE_URL=postgresql://username@localhost:5432/politracker
   ```

## Quick Start: Setup from Scratch

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up the database schema:**
   ```bash
   npm run db:setup
   ```

   This creates all necessary tables in PostgreSQL.

3. **Import Current MPs:**
   ```bash
   npm run db:fetch-mps
   ```

   This fetches the current list of MPs from the House of Commons XML feed and stores them in the database.

4. **Import Postal Code Mappings (Optional):**
   ```bash
   npm run db:import-postal-codes
   ```

   **Note:** This script imports a small example set. For full coverage, you'll need to:
   - Import a complete Canadian postal code database
   - Map each postal code to its electoral district
   - Link districts to MPs
   - Edit `scripts/import-postal-codes.ts` to add more mappings

5. **Initial Vote Sync (One-time):**
   ```bash
   npm run db:sync-latest-votes
   ```

   This will fetch votes for all MPs. **Note:** This can take 30-60 minutes for ~370 MPs.

## Nightly Updates

After initial setup, run the nightly update script to keep the database current. This script syncs only new votes (votes added since the last sync).

### Manual Run

```bash
npm run db:nightly-update
```

### Automated Scheduling

#### Using Cron (Linux/macOS)

Add to your crontab (`crontab -e`):

```bash
# Run nightly update at 2 AM every day
0 2 * * * cd /path/to/politracker && npm run db:nightly-update >> logs/nightly-update.log 2>&1
```

#### Using systemd Timer (Linux)

Create `/etc/systemd/system/politracker-update.service`:
```ini
[Unit]
Description=PoliTracker Nightly Update

[Service]
Type=oneshot
WorkingDirectory=/path/to/politracker
ExecStart=/usr/bin/npm run db:nightly-update
User=your-user
Environment="DATABASE_URL=postgresql://username@localhost:5432/politracker"
```

Create `/etc/systemd/system/politracker-update.timer`:
```ini
[Unit]
Description=Run PoliTracker update daily

[Timer]
OnCalendar=daily
OnCalendar=02:00

[Install]
WantedBy=timers.target
```

Enable with:
```bash
sudo systemctl enable politracker-update.timer
sudo systemctl start politracker-update.timer
```

#### Using Task Scheduler (Windows)

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger to "Daily" at 2:00 AM
4. Action: Start a program
5. Program: `npm`
6. Arguments: `run db:nightly-update`
7. Start in: `C:\path\to\politracker`
8. Add environment variable: `DATABASE_URL=postgresql://username@localhost:5432/politracker`

## Database Schema

### Tables

- **mps**: Member of Parliament information
- **postal_code_mappings**: Maps postal codes to MPs
- **postal_code_cache**: Cached postal code lookups (with TTL)
- **votes**: Individual vote records
- **bills_motions**: Bills and motions information
- **mp_bill_sponsorships**: Links MPs to bills they sponsor/co-sponsor
- **mp_expenses**: MP expense data by quarter
- **vote_details_cache**: Cached vote details (with TTL)
- **votes_cache**: Cached MP votes (with TTL)
- **party_loyalty_cache**: Cached party loyalty stats (with TTL)
- **bill_policy_categories**: Policy categories for bills
- **processed_expense_files**: Tracks processed expense files

## Data Sources

- **MPs**: House of Commons XML feed (`https://www.ourcommons.ca/Members/en/XML`)
- **Postal Codes**: Represent API (Open North) or manual mappings
- **Votes**: OpenParliament API (`https://api.openparliament.ca`)
- **Bills**: OpenParliament API

## Updating Data Manually

### Update MPs (when Parliament changes)

```bash
npm run db:fetch-mps
```

### Sync Latest Votes

```bash
npm run db:sync-latest-votes
```

This syncs votes for all MPs, but only fetches new votes (after the latest date in database).

## Benefits

- ✅ No API rate limits (data stored locally)
- ✅ Faster searches (local database)
- ✅ Scalable (PostgreSQL handles concurrent connections)
- ✅ Full control over data
- ✅ Can add custom fields and indexes
- ✅ Incremental updates (only sync new votes)
- ✅ Production-ready database

## Troubleshooting

### Connection Issues

- Verify PostgreSQL is running: `pg_isready`
- Check connection string format: `postgresql://user@host:port/database`
- Verify database exists: `psql -l | grep politracker`
- Check user permissions

### Nightly Update Fails

- Check logs: `logs/nightly-update.log` (if using cron)
- Ensure DATABASE_URL is set correctly
- Verify network connectivity (for API calls)
- Check that the database schema is up to date: `npm run db:setup`

### Performance Issues

- Check connection pool settings in `lib/db/database.ts`
- Analyze tables: `psql $DATABASE_URL -c "ANALYZE;"`
- Check for missing indexes
- Monitor query performance with `EXPLAIN ANALYZE`

## Backup and Restore

### Creating a Database Backup

```bash
pg_dump $DATABASE_URL > backup-$(date +%Y-%m-%d).sql
```

### Restoring from Backup

```bash
psql $DATABASE_URL < backup-YYYY-MM-DD.sql
```
