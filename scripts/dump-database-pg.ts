#!/usr/bin/env tsx

/**
 * Dump PostgreSQL database to SQL file
 * Creates a dump that can be imported into another PostgreSQL database
 * 
 * Usage:
 *   tsx scripts/dump-database-pg.ts
 *   Or: npm run db:dump
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  console.error('   Please set it in your .env file or export it:');
  console.error('   DATABASE_URL=postgresql://user@localhost:5432/politracker');
  process.exit(1);
}

// Parse DATABASE_URL to extract components for pg_dump
// Format: postgresql://user:password@host:port/database
// Or: postgresql://user@host:port/database (no password)
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
  console.error('   Or: postgresql://user@host:port/database');
  process.exit(1);
}

// Create output directory if it doesn't exist
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Generate filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
const dumpPath = path.join(dataDir, `politracker-dump-${timestamp}.sql`);

console.log('Creating PostgreSQL database dump...\n');
console.log(`Database: ${database}`);
console.log(`Host: ${host}:${port}`);
console.log(`Output: ${dumpPath}\n`);

try {
  // Build pg_dump command
  // --clean: Include DROP statements before CREATE statements
  // --if-exists: Use IF EXISTS for DROP statements
  // --no-owner: Don't set ownership of objects
  // --no-acl: Don't dump access privileges (GRANT/REVOKE)
  // -F p: Plain text format (SQL file)
  const pgDumpArgs = [
    '--host', host,
    '--port', port,
    '--dbname', database,
    '--username', user || 'postgres',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-acl',
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
    
    console.log('\n✅ Database dump created successfully!');
    console.log(`   File: ${dumpPath}`);
    console.log(`   Size: ${fileSizeMB} MB (${fileSizeKB} KB)`);
    console.log('\n📦 To import this dump into another PostgreSQL database:');
    console.log(`   psql -h <host> -U <user> -d <database> -f ${dumpPath}`);
    console.log('   Or:');
    console.log(`   psql <database_url> -f ${dumpPath}`);
  } else {
    console.error('❌ Dump file was not created');
    process.exit(1);
  }
} catch (error: any) {
  console.error('\n❌ Error creating database dump:', error.message);
  if (error.message.includes('command not found') || error.message.includes('pg_dump')) {
    console.error('\n   Please make sure PostgreSQL client tools are installed:');
    console.error('   macOS: brew install postgresql');
    console.error('   Linux: sudo apt-get install postgresql-client');
  }
  process.exit(1);
}

