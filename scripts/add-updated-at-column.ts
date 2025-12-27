import { getDatabase, closeDatabase, queryOne } from '../lib/db/database';
import { convertPlaceholders } from '../lib/db/database';

async function addUpdatedAtColumn() {
  const pool = getDatabase();

  console.log('Adding updated_at column to votes table...\n');

  try {
    // Check if column already exists (PostgreSQL)
    const checkColumnSql = convertPlaceholders(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'votes' AND column_name = 'updated_at'
    `);
    const columnExists = await queryOne<{ column_name: string }>(checkColumnSql, []);
    
    if (columnExists) {
      console.log('✓ Column updated_at already exists');
    } else {
      // Add the column with default value (PostgreSQL uses TIMESTAMP instead of DATETIME)
      await pool.query(`ALTER TABLE votes ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
      console.log('✓ Added updated_at column to votes table');
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

addUpdatedAtColumn();

