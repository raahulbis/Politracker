import { getDatabase, closeDatabase } from '../lib/db/database';
import { calculateMPSalary } from '../lib/utils/mp-salary';

/**
 * Migration script to calculate and update salaries for all existing MPs
 * This should be run after adding the salary column to the database
 */
function calculateAllMPSalaries() {
  console.log('Calculating MP salaries...\n');
  
  const db = getDatabase();
  
  try {
    // First, add the salary column if it doesn't exist
    try {
      db.exec('ALTER TABLE mps ADD COLUMN salary REAL DEFAULT 209800');
      console.log('✓ Added salary column to mps table');
    } catch (e: any) {
      if (e.message && e.message.includes('duplicate column')) {
        console.log('✓ Salary column already exists');
      } else {
        throw e;
      }
    }
    
    // Get all MPs with their parliamentary positions
    const mps = db.prepare(`
      SELECT id, name, parliamentary_positions, salary
      FROM mps
    `).all() as Array<{
      id: number;
      name: string;
      parliamentary_positions: string | null;
      salary: number | null;
    }>;
    
    console.log(`Found ${mps.length} MPs to process\n`);
    
    const updateSalary = db.prepare(`
      UPDATE mps
      SET salary = ?
      WHERE id = ?
    `);
    
    let updated = 0;
    let unchanged = 0;
    
    const transaction = db.transaction((mps: typeof mps) => {
      for (const mp of mps) {
        let positions: any[] | undefined;
        
        if (mp.parliamentary_positions) {
          try {
            positions = JSON.parse(mp.parliamentary_positions);
          } catch (e) {
            // Invalid JSON, use empty array
            positions = undefined;
          }
        }
        
        const calculatedSalary = calculateMPSalary(positions);
        
        // Only update if salary is different
        if (mp.salary !== calculatedSalary) {
          updateSalary.run(calculatedSalary, mp.id);
          updated++;
          console.log(`  ✓ ${mp.name}: $${calculatedSalary.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        } else {
          unchanged++;
        }
      }
    });
    
    transaction(mps);
    
    console.log(`\n✓ Updated ${updated} MP salaries`);
    console.log(`  ${unchanged} MPs already had correct salaries`);
    console.log(`\nTotal MPs processed: ${mps.length}`);
    
  } catch (error) {
    console.error('Error calculating MP salaries:', error);
    throw error;
  } finally {
    closeDatabase();
  }
}

// Run the script
calculateAllMPSalaries();

