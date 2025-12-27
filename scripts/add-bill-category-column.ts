import { getDatabase, closeDatabase, queryOne } from '../lib/db/database';
import { convertPlaceholders } from '../lib/db/database';

async function addBillCategoryColumn() {
  const pool = getDatabase();

  console.log('Adding policy_category_id column to bills_motions table...\n');

  try {
    // Check if column already exists (PostgreSQL)
    const checkColumnSql = convertPlaceholders(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'bills_motions' AND column_name = 'policy_category_id'
    `);
    const columnExists = await queryOne<{ column_name: string }>(checkColumnSql, []);
    
    if (columnExists) {
      console.log('✓ Column policy_category_id already exists');
    } else {
      // Add the column
      await pool.query(`
        ALTER TABLE bills_motions 
        ADD COLUMN policy_category_id INTEGER 
        REFERENCES bill_policy_categories(id) ON DELETE SET NULL
      `);
      
      // Create index
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_bills_motions_category 
        ON bills_motions(policy_category_id)
      `);
      
      console.log('✓ Added policy_category_id column to bills_motions table');
      console.log('✓ Created index on policy_category_id');
    }
    
    console.log('\n✅ Migration complete!');
  } catch (error: any) {
    if (error.message?.includes('duplicate column') || error.message?.includes('already exists')) {
      console.log('✓ Column already exists');
    } else {
      console.error('❌ Error adding column:', error);
      process.exit(1);
    }
  } finally {
    await closeDatabase();
  }
}

addBillCategoryColumn();

