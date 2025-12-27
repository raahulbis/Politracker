import { getDatabase, closeDatabase } from '../lib/db/database';

const db = getDatabase();

console.log('Adding sponsor_party column to votes table...\n');

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(votes)").all() as Array<{ name: string }>;
  const hasColumn = tableInfo.some(col => col.name === 'sponsor_party');
  
  if (hasColumn) {
    console.log('✓ Column sponsor_party already exists');
  } else {
    // Add the column
    db.exec(`ALTER TABLE votes ADD COLUMN sponsor_party TEXT;`);
    console.log('✓ Added sponsor_party column to votes table');
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

