# Database Name Verification

## Current Connection String

Your logs show you're connecting to:
```
politracker.railway.internal:5432/railway
```

This means you're trying to connect to a database named `railway`.

## Verify Database Name

Railway PostgreSQL services typically create a default database. The database name in the connection string should match an existing database.

### Check What Databases Exist

1. **In Railway Dashboard:**
   - Go to your PostgreSQL service
   - Click on the service
   - Look for a "Data" or "Databases" tab
   - Or use the Query/Console feature

2. **Using Railway CLI:**
   ```bash
   railway run psql $DATABASE_URL -c "\l"
   ```
   This will list all databases.

3. **Check the Connection String:**
   - Railway Dashboard → Variables
   - Look at `DATABASE_URL` or `DATABASE_PRIVATE_URL`
   - The format is: `postgresql://user:pass@host:port/database_name`
   - The part after the last `/` is the database name

## Common Database Names on Railway

Railway typically uses:
- `railway` - Default database name (what you're using now)
- `postgres` - Another common default
- A custom name if you specified one

## If Database Doesn't Exist

If the database `railway` doesn't exist, you have two options:

### Option 1: Create the Database (Recommended)

```bash
# Connect to PostgreSQL service
railway run psql $DATABASE_URL -c "CREATE DATABASE railway;"
```

### Option 2: Use Existing Database

If you see a different database name (like `postgres`), you may need to:
1. Update the connection string in Railway Variables, OR
2. Create your schema in that database instead

## Verify Your Schema Exists

Once you confirm the database name, verify your tables exist:

```bash
# List tables in the database
railway run psql $DATABASE_URL -c "\dt"
```

If you see no tables, you need to run the setup:
```bash
railway run npm run db:setup
```

## What to Check Now

1. ✅ PostgreSQL service is running (confirmed)
2. ❓ What databases exist in your PostgreSQL service?
3. ❓ Does the database `railway` exist?
4. ❓ Are your tables created in that database?

Once you confirm the database name, we can ensure the connection string matches!



