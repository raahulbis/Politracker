import { getDatabase, closeDatabase } from '../lib/db/database';

const db = getDatabase();

console.log('Adding policy_category_id column to bills_motions table...\n');

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(bills_motions)").all() as Array<{ name: string }>;
  const hasColumn = tableInfo.some(col => col.name === 'policy_category_id');
  
  if (hasColumn) {
    console.log('✓ Column policy_category_id already exists');
  } else {
    // Add the column
    db.exec(`
      ALTER TABLE bills_motions 
      ADD COLUMN policy_category_id INTEGER 
      REFERENCES bill_policy_categories(id) ON DELETE SET NULL
    `);
    
    // Create index
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bills_motions_category 
      ON bills_motions(policy_category_id)
    `);
    
    console.log('✓ Added policy_category_id column to bills_motions table');
    console.log('✓ Created index on policy_category_id');
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

