import { getDatabase, closeDatabase } from '../lib/db/database';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Restore database from a SQL dump file
 * Usage: tsx scripts/restore-database.ts <dump-file-path>
 */
function restoreDatabase() {
  const dumpFilePath = process.argv[2];
  
  if (!dumpFilePath) {
    console.error('Error: Please provide a dump file path');
    console.error('Usage: tsx scripts/restore-database.ts <dump-file-path>');
    process.exit(1);
  }
  
  const fullPath = path.isAbsolute(dumpFilePath) 
    ? dumpFilePath 
    : path.join(process.cwd(), dumpFilePath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`Error: Dump file not found: ${fullPath}`);
    process.exit(1);
  }
  
  console.log(`Restoring database from: ${fullPath}\n`);
  
  const db = getDatabase();
  
  // Read the SQL dump file
  const sqlDump = fs.readFileSync(fullPath, 'utf-8');
  
  // Split by semicolons (basic SQL parsing)
  // Note: This is a simple parser - for production, consider using a proper SQL parser
  const statements = sqlDump
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && s !== 'BEGIN TRANSACTION' && s !== 'COMMIT');
  
  console.log(`Found ${statements.length} SQL statements to execute\n`);
  
  let executed = 0;
  let errors = 0;
  
  // Execute each statement
  db.exec('BEGIN TRANSACTION');
  
  try {
    for (const statement of statements) {
      try {
        if (statement.toLowerCase().startsWith('insert into') || 
            statement.toLowerCase().startsWith('create table')) {
          db.exec(statement);
          executed++;
          
          if (executed % 100 === 0) {
            console.log(`  Processed ${executed} statements...`);
          }
        }
      } catch (error: any) {
        errors++;
        // Skip errors for tables that already exist or duplicate inserts
        if (!error.message?.includes('already exists') && 
            !error.message?.includes('UNIQUE constraint')) {
          console.warn(`  Warning: ${error.message}`);
        }
      }
    }
    
    db.exec('COMMIT');
    
    console.log(`\n✓ Database restore complete!`);
    console.log(`  Statements executed: ${executed}`);
    if (errors > 0) {
      console.log(`  Warnings/errors: ${errors} (some may be expected)`);
    }
  } catch (error: any) {
    db.exec('ROLLBACK');
    console.error(`\n✗ Error during restore: ${error.message}`);
    process.exit(1);
  }
  
  closeDatabase();
}

restoreDatabase();

