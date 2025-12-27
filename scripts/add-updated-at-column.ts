import { getDatabase, closeDatabase } from '../lib/db/database';

const db = getDatabase();

console.log('Adding updated_at column to votes table...\n');

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(votes)").all() as Array<{ name: string }>;
  const hasColumn = tableInfo.some(col => col.name === 'updated_at');
  
  if (hasColumn) {
    console.log('✓ Column updated_at already exists');
  } else {
    // Add the column with default value
    db.exec(`ALTER TABLE votes ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
    console.log('✓ Added updated_at column to votes table');
  }
  
  console.log('\n✅ Migration complete!');
} catch (error: any) {
  if (error.message?.includes('duplicate column')) {
    console.log('✓ Column already exists');
  } else {
    console.error('❌ Error adding column:', error);
    process.exit(1);
  }
} finally {
  closeDatabase();
}

