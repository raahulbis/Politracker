import { getDatabase, closeDatabase } from '../lib/db/database';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Dump the database to a SQL file
 * This creates a backup that can be restored later
 */
function dumpDatabase() {
  console.log('Creating database dump...\n');
  const db = getDatabase();
  
  const dbPath = path.join(process.cwd(), 'data', 'politracker.db');
  const dumpPath = path.join(process.cwd(), 'data', `politracker-dump-${new Date().toISOString().split('T')[0]}.sql`);
  
  // Use SQLite's .dump command via better-sqlite3
  // We'll use a workaround: backup the database file and create a SQL dump
  // For a proper SQL dump, we'd need to iterate through tables
  
  console.log('Exporting database schema and data...');
  
  // Get all table names
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  
  let sqlDump = '-- PoliTracker Database Dump\n';
  sqlDump += `-- Generated: ${new Date().toISOString()}\n\n`;
  sqlDump += 'BEGIN TRANSACTION;\n\n';
  
  // For each table, export schema and data
  for (const table of tables) {
    const tableName = table.name;
    console.log(`  Exporting table: ${tableName}`);
    
    // Get table schema
    const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(tableName) as { sql: string } | undefined;
    if (schema) {
      sqlDump += `\n-- Table: ${tableName}\n`;
      sqlDump += `${schema.sql};\n\n`;
    }
    
    // Get all data from table
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all() as any[];
    
    if (rows.length > 0) {
      // Get column names
      const firstRow = rows[0];
      const columns = Object.keys(firstRow);
      
      sqlDump += `-- Data for ${tableName}\n`;
      
      // Insert statements
      for (const row of rows) {
        const values = columns.map(col => {
          const value = row[col];
          if (value === null) return 'NULL';
          if (typeof value === 'string') {
            // Escape single quotes
            return `'${value.replace(/'/g, "''")}'`;
          }
          return String(value);
        });
        
        sqlDump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
      }
      sqlDump += '\n';
    }
  }
  
  sqlDump += 'COMMIT;\n';
  
  // Write to file
  fs.writeFileSync(dumpPath, sqlDump, 'utf-8');
  
  console.log(`\n✓ Database dump created: ${dumpPath}`);
  console.log(`  Tables exported: ${tables.length}`);
  
  // Get file size
  const stats = fs.statSync(dumpPath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`  File size: ${fileSizeMB} MB`);
  
  closeDatabase();
}

dumpDatabase();

