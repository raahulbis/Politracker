# Railway PostgreSQL Database Setup Guide

This guide helps you troubleshoot and configure PostgreSQL connections on Railway.

## Railway Environment Variables

Railway automatically provides several PostgreSQL-related environment variables when you connect a PostgreSQL service:

- `DATABASE_PRIVATE_URL` - **Private/internal connection URL (USE THIS for same-project connections)**
- `DATABASE_URL` - Internal connection URL (fallback)
- `DATABASE_PUBLIC_URL` - Public-facing connection URL (for external connections)
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` - Individual connection parameters

## Connection Configuration

The application is configured to use connection strings in this priority order:
1. `DATABASE_PRIVATE_URL` (Railway private/internal - **recommended**)
2. `DATABASE_URL` (Railway internal - fallback)
3. `DATABASE_PUBLIC_URL` (Railway public)
4. Individual `PGHOST`, `PGPORT`, etc. variables
5. Default localhost (development only)

**Important**: Use `DATABASE_PRIVATE_URL` for connections within the same Railway project (recommended for reliability and to avoid egress costs).

## Common Issues and Solutions

### 1. Database Not Connecting (ECONNREFUSED)

**Symptoms:**
- `ECONNREFUSED` errors in logs
- Application starts but can't query the database
- 500 errors when accessing database endpoints
- Connection timeout errors in logs

**Solutions:**

1. **Check PostgreSQL Service Status**
   - Go to Railway dashboard → Your PostgreSQL service
   - Ensure the service is **running** (not paused/stopped)
   - Check for any service incidents or errors

2. **Verify Services Are in Same Project**
   - Both your application service and PostgreSQL service must be in the **same Railway project**
   - If they're in different projects, they won't be able to connect internally
   - Move one service to match the other, or use `DATABASE_PUBLIC_URL` (not recommended)

3. **Verify Connection URL Variables**
   - Go to your Railway project → Variables tab
   - Ensure `DATABASE_PRIVATE_URL` or `DATABASE_URL` is present and not empty
   - **Preferred**: Use `DATABASE_PRIVATE_URL` (automatically provided when services are in same project)
   - If missing, ensure PostgreSQL service is added to the same project

4. **Verify Database Schema**
   - Your database might be empty - you need to run the setup script
   - On Railway, you can run setup commands via Railway CLI or one-off containers

### 2. SSL Connection Issues

Railway requires SSL for PostgreSQL connections. The application handles this automatically:
- Railway's `DATABASE_URL` includes SSL parameters in the connection string
- The `pg` library automatically uses SSL when specified in the connection string

### 3. Setting Up the Database Schema

After connecting your PostgreSQL service, you need to initialize the schema:

**Option 1: Using Railway CLI (Recommended)**
```bash
# Install Railway CLI if needed
npm i -g @railway/cli

# Login
railway login

# Link your project
railway link

# Run database setup (this runs in a Railway container with access to DATABASE_URL)
railway run npm run db:setup
```

**Option 2: Using Railway Dashboard**
1. Go to your project → Settings → Service
2. Create a one-off container/run command
3. Run: `npm run db:setup`

**Option 3: Import from SQL Dump**
If you have a database dump from local development:
```bash
# Create a dump locally first
npm run db:dump

# Then import on Railway (you'll need to provide the DATABASE_URL)
psql $DATABASE_URL -f data/politracker-dump-YYYY-MM-DD.sql
```

### 4. Testing the Connection

You can test your database connection using the test endpoint:

```
GET /api/test-db
```

This will return:
- Success status
- MP count (if database is populated)
- Query performance metrics

### 5. Environment Variable Priority

The application checks for database connection in this order:
1. `DATABASE_URL` (Railway's internal connection - recommended)
2. `DATABASE_PUBLIC_URL` (Railway's public connection)
3. Individual `PGHOST`, `PGPORT`, etc. variables
4. Default localhost connection (development only)

## Recommended Setup Steps

1. **Add PostgreSQL Service to Railway**
   - In Railway dashboard, add a PostgreSQL service to your project
   - Railway automatically creates `DATABASE_URL` environment variable

2. **Verify Connection String**
   - Check that `DATABASE_URL` is set in your application service
   - The format should be: `postgresql://user:password@host:port/database`

3. **Initialize Database Schema**
   ```bash
   railway run npm run db:setup
   ```

4. **Populate Initial Data**
   ```bash
   # Fetch current MPs
   railway run npm run db:fetch-mps
   
   # Optional: Import postal codes
   railway run npm run db:import-postal-codes
   ```

5. **Test Connection**
   - Visit `/api/test-db` endpoint
   - Check application logs for any errors

## Troubleshooting Commands

Check if database connection is working:
```bash
railway run npm run db:test-connection
```

View environment variables:
```bash
railway variables
```

View application logs:
```bash
railway logs
```

## Additional Notes

- **Connection Pooling**: The application uses connection pooling (max 20 connections) for better performance
- **Timeouts**: Connection timeout is set to 10 seconds for cloud connections
- **SSL**: Railway requires SSL connections - handled automatically by the `pg` library
- **Internal vs Public URLs**: Use `DATABASE_URL` (internal) for same-project connections to avoid egress costs

