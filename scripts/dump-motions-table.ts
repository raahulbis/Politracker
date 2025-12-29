#!/usr/bin/env tsx

/**
 * Dump motions table from PostgreSQL database to SQL file
 * Creates a dump that can be imported into another PostgreSQL database
 * 
 * Usage:
 *   tsx scripts/dump-motions-table.ts
 *   tsx scripts/dump-motions-table.ts "postgresql://user:pass@host:port/db"
 *   npm run db:dump-motions
 *   npm run db:dump-motions -- "postgresql://user:pass@host:port/db"
 * 
 * The script will try to get the connection string from:
 * 1. Command line argument (if provided)
 * 2. Railway CLI (railway variables)
 * 3. Environment variables (DATABASE_PRIVATE_URL, DATABASE_URL, DATABASE_PUBLIC_URL)
 * 4. Local PostgreSQL (localhost:5432/politracker)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Get connection string from:
// 1. Command line argument
// 2. Local PostgreSQL environment variables (PGHOST, etc.)
// 3. Local PostgreSQL default (localhost)
// 4. Environment variables (DATABASE_URL, etc.) - only if explicitly set
// 5. Railway CLI (only if --railway flag is used)

let DATABASE_URL: string | undefined;
let useRailway = false;

// Check command line arguments
const args = process.argv.slice(2);
if (args.length > 0) {
  if (args[0] === '--railway' || args[0] === '-r') {
    useRailway = true;
  } else if (args[0].startsWith('postgresql://')) {
    DATABASE_URL = args[0];
    console.log('📝 Using connection string from command line argument');
  }
}

if (!DATABASE_URL) {
  // Priority 1: Local PostgreSQL via PGHOST environment variables
  const defaultUser = process.env.USER || process.env.USERNAME || 'postgres';
  if (process.env.PGHOST && !useRailway) {
    DATABASE_URL = `postgresql://${process.env.PGUSER || defaultUser}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'politracker'}`;
    console.log('✅ Using local PostgreSQL connection from PGHOST environment variables');
  } 
  // Priority 2: Default local PostgreSQL (localhost)
  else if (!useRailway) {
    DATABASE_URL = `postgresql://${defaultUser}@localhost:5432/politracker`;
    console.log('✅ Using default local PostgreSQL connection');
    console.log(`   (localhost:5432/politracker as user: ${defaultUser})`);
  }
  
  // Priority 3: Environment variables (if explicitly set and not Railway internal)
  if (!DATABASE_URL && !useRailway) {
    const envUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
    if (envUrl && !envUrl.includes('railway.internal')) {
      DATABASE_URL = envUrl;
      console.log('✅ Using connection string from environment variable');
    }
  }
  
  // Priority 4: Railway CLI (only if --railway flag is used)
  if (useRailway || (!DATABASE_URL && process.env.DATABASE_PRIVATE_URL)) {
    try {
      console.log('🔍 Trying to get connection string from Railway CLI...');
      const railwayOutput = execSync('railway variables --json', { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const variables = JSON.parse(railwayOutput);
      DATABASE_URL = variables.DATABASE_PUBLIC_URL || 
                     variables.DATABASE_URL || 
                     variables.DATABASE_PRIVATE_URL;
      if (DATABASE_URL) {
        console.log('✅ Found connection string from Railway CLI');
      }
    } catch (error) {
      // Railway CLI not available or not linked
      if (useRailway) {
        console.error('❌ Railway CLI not available or project not linked');
        console.error('   Run: railway login && railway link');
        process.exit(1);
      }
    }
  }
}

if (!DATABASE_URL) {
  console.error('❌ Database connection string not found');
  console.error('\n   Options for LOCAL PostgreSQL:');
  console.error('   1. Pass connection string as argument:');
  console.error('      npm run db:dump-motions -- "postgresql://user:pass@localhost:5432/politracker"');
  console.error('   2. Set PGHOST environment variable:');
  console.error('      PGHOST=localhost PGDATABASE=politracker npm run db:dump-motions');
  console.error('   3. Default: Uses localhost:5432/politracker (current user)');
  console.error('\n   For Railway PostgreSQL:');
  console.error('      npm run db:dump-motions -- --railway');
  process.exit(1);
}

// Parse DATABASE_URL to extract components for pg_dump
// Format: postgresql://user:password@host:port/database
let user: string | undefined;
let password: string | undefined;
let host: string;
let port: string;
let database: string;

try {
  const url = new URL(DATABASE_URL);
  user = url.username || undefined;
  password = url.password || undefined;
  host = url.hostname;
  port = url.port || '5432';
  database = url.pathname.slice(1); // Remove leading '/'
  
  if (!host || !database) {
    throw new Error('Missing host or database');
  }
} catch (error) {
  console.error('❌ Invalid DATABASE_URL format');
  console.error('   Expected format: postgresql://user:password@host:port/database');
  process.exit(1);
}

// Create output directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Generate filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const dumpPath = path.join(dataDir, `motions-table-dump-${timestamp}.sql`);

console.log('Creating motions table dump...\n');
console.log(`Database: ${database}`);
console.log(`Host: ${host}:${port}`);
console.log(`Table: motions`);
console.log(`Output: ${dumpPath}\n`);

try {
  // Build pg_dump command for a single table
  // --table: Dump only the specified table
  // --clean: Include DROP statements before CREATE statements
  // --if-exists: Use IF EXISTS for DROP statements
  // --no-owner: Don't set ownership of objects
  // --no-acl: Don't dump access privileges (GRANT/REVOKE)
  // -F p: Plain text format (SQL file)
  // --inserts: Use INSERT statements instead of COPY (better for cross-database compatibility)
  const pgDumpArgs = [
    '--host', host,
    '--port', port,
    '--dbname', database,
    '--username', user || 'postgres',
    '--table', 'motions',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
    '--inserts',
    '-F', 'p',
    '-f', dumpPath
  ];

  // Set PGPASSWORD environment variable if password is provided
  const env = { ...process.env };
  if (password) {
    env.PGPASSWORD = password;
  }

  console.log('Running pg_dump...');
  execSync(`pg_dump ${pgDumpArgs.join(' ')}`, {
    stdio: 'inherit',
    env
  });

  // Check file was created and get size
  if (fs.existsSync(dumpPath)) {
    const stats = fs.statSync(dumpPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    
    console.log('\n✅ Motions table dump created successfully!');
    console.log(`   File: ${dumpPath}`);
    console.log(`   Size: ${fileSizeMB} MB (${fileSizeKB} KB)`);
    console.log('\n📦 To import this dump into Railway PostgreSQL:');
    console.log('   1. Upload the file to Railway or your local machine');
    console.log('   2. Use Railway CLI:');
    console.log(`      railway connect postgres < ${dumpPath}`);
    console.log('   Or use psql directly:');
    console.log(`      psql $DATABASE_URL -f ${dumpPath}`);
  } else {
    console.error('❌ Dump file was not created');
    process.exit(1);
  }
} catch (error: any) {
  console.error('\n❌ Error creating motions table dump:', error.message);
  if (error.message.includes('command not found') || error.message.includes('pg_dump')) {
    console.error('\n   Please make sure PostgreSQL client tools are installed:');
    console.error('   macOS: brew install postgresql');
    console.error('   Linux: sudo apt-get install postgresql-client');
    console.error('   Windows: Download from https://www.postgresql.org/download/');
  }
  process.exit(1);
}

