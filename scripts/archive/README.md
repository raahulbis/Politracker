# Archived Migration Scripts

This directory contains one-time migration scripts that were used to migrate from SQLite to PostgreSQL.

## Scripts

- `migrate-sqlite-to-postgres.ts` - Main migration script (one-time use)
- `migrate-remaining-tables.ts` - Migrated remaining tables with foreign key constraints
- `dump-database.ts` - SQLite database dump script (no longer needed)
- `restore-database.ts` - SQLite database restore script (no longer needed)

## Status

✅ **Migration Complete** - All data has been migrated to PostgreSQL.

These scripts are kept for reference only and are no longer needed for normal operation.

## Current Database

The application now uses **PostgreSQL** exclusively. See `README_DATABASE.md` for current setup instructions.



