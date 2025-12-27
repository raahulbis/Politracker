# PoliTracker Setup Guide

Quick reference for setting up PoliTracker.

## 🚀 Quick Start (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Set up PostgreSQL
createdb politracker
export DATABASE_URL="postgresql://username@localhost:5432/politracker"

# 3. Setup database schema
npm run db:setup

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📦 Full Setup (30-60 minutes)

If starting from scratch:

```bash
# 1. Install dependencies
npm install

# 2. Create database schema
npm run db:setup

# 3. Fetch current MPs
npm run db:fetch-mps

# 4. Initial vote sync (takes 30-60 minutes)
npm run db:sync-latest-votes

# 5. Start development server
npm run dev
```

## 🔄 Daily Updates

After initial setup, keep your database current:

### Manual Update
```bash
npm run db:nightly-update
```

### Automated (Cron)
Add to crontab (`crontab -e`):
```bash
0 2 * * * cd /path/to/politracker && npm run db:nightly-update >> logs/nightly-update.log 2>&1
```

This runs at 2 AM daily and only syncs new votes (fast!).

## 💾 Database Management

### Create a Backup
```bash
pg_dump $DATABASE_URL > backup-$(date +%Y-%m-%d).sql
```

### Restore from Backup
```bash
psql $DATABASE_URL < backup-YYYY-MM-DD.sql
```

## 📚 More Information

- **Database Details**: See [README_DATABASE.md](./README_DATABASE.md)
- **Contributing**: See [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Security**: See [SECURITY.md](./SECURITY.md)

