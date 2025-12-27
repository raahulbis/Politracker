import { getDatabase, closeDatabase } from '../lib/db/database';
import * as fs from 'fs';
import * as path from 'path';

interface ExpenseRow {
  name: string;
  constituency: string;
  caucus: string;
  salaries: number;
  travel: number;
  hospitality: number;
  contracts: number;
}

/**
 * Parse name from "Lastname, Firstname" format to match database
 */
function parseName(csvName: string): { firstName: string; lastName: string; fullName: string } {
  // Remove quotes and trim
  let cleanName = csvName.replace(/"/g, '').trim();
  
  // Remove common honorifics
  cleanName = cleanName.replace(/^(Hon\.|Right Hon\.|Hon)\s+/i, '').trim();
  
  // Handle "Lastname, Firstname" format
  const parts = cleanName.split(',').map(p => p.trim());
  
  if (parts.length >= 2) {
    const lastName = parts[0];
    const firstName = parts.slice(1).join(' '); // Handle multiple first names
    const fullName = `${firstName} ${lastName}`.trim();
    return { firstName, lastName, fullName };
  }
  
  // Fallback: assume it's already in "Firstname Lastname" format
  const nameParts = cleanName.split(/\s+/);
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    return { firstName, lastName, fullName: cleanName };
  }
  
  return { firstName: cleanName, lastName: '', fullName: cleanName };
}

/**
 * Extract year and quarter from filename like "MembersExpenditures.2026Q1.csv"
 */
function parseQuarter(filename: string): { year: number; quarter: number; quarterStr: string } | null {
  const match = filename.match(/\.(\d{4})Q(\d)\.csv$/);
  if (!match) {
    return null;
  }
  
  const year = parseInt(match[1], 10);
  const quarter = parseInt(match[2], 10);
  const quarterStr = `${year}Q${quarter}`;
  
  return { year, quarter, quarterStr };
}

/**
 * Find MP in database by name (handles various formats)
 */
function findMP(db: any, csvName: string, constituency: string): { id: number; name: string } | null {
  const { firstName, lastName, fullName } = parseName(csvName);
  
  // Strategy 1: Try exact full name match
  let mp = db.prepare('SELECT id, name FROM mps WHERE name = ? LIMIT 1').get(fullName) as { id: number; name: string } | undefined;
  
  // Strategy 2: Try case-insensitive full name match
  if (!mp) {
    mp = db.prepare('SELECT id, name FROM mps WHERE LOWER(name) = LOWER(?) LIMIT 1').get(fullName) as { id: number; name: string } | undefined;
  }
  
  // Strategy 3: Try matching by first and last name (without honorifics)
  if (!mp && firstName && lastName) {
    mp = db.prepare(`
      SELECT id, name FROM mps 
      WHERE LOWER(TRIM(REPLACE(REPLACE(first_name, 'Hon.', ''), 'Right Hon.', ''))) = LOWER(?)
        AND LOWER(last_name) = LOWER(?)
      LIMIT 1
    `).get(firstName.trim(), lastName) as { id: number; name: string } | undefined;
  }
  
  // Strategy 4: Try matching by last name and district
  if (!mp && lastName && constituency) {
    mp = db.prepare(`
      SELECT id, name FROM mps 
      WHERE LOWER(last_name) = LOWER(?) AND LOWER(district_name) = LOWER(?)
      LIMIT 1
    `).get(lastName, constituency) as { id: number; name: string } | undefined;
  }
  
  // Strategy 5: Try partial name match (handle accents and special characters)
  if (!mp && lastName) {
    const allMPs = db.prepare('SELECT id, name, first_name, last_name, district_name FROM mps').all() as Array<{
      id: number;
      name: string;
      first_name: string | null;
      last_name: string | null;
      district_name: string;
    }>;
    
    for (const dbMP of allMPs) {
      const dbLastName = (dbMP.last_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const csvLastName = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      if (dbLastName === csvLastName) {
        // Check if first name matches (loosely)
        const dbFirstName = (dbMP.first_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const csvFirstName = firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        if (dbFirstName.includes(csvFirstName) || csvFirstName.includes(dbFirstName) || 
            (constituency && dbMP.district_name.toLowerCase() === constituency.toLowerCase())) {
          mp = { id: dbMP.id, name: dbMP.name };
          break;
        }
      }
    }
  }
  
  // Strategy 6: Try matching by district only (if name is "Vacant")
  if (!mp && csvName.toLowerCase().includes('vacant') && constituency) {
    mp = db.prepare('SELECT id, name FROM mps WHERE LOWER(district_name) = LOWER(?) LIMIT 1')
      .get(constituency) as { id: number; name: string } | undefined;
  }
  
  return mp || null;
}

/**
 * Parse CSV file and import expenses
 */
async function importExpensesFile(filePath: string, filename: string): Promise<number> {
  const db = getDatabase();
  
  // Check if file already processed
  const processed = db.prepare('SELECT * FROM processed_expense_files WHERE filename = ?')
    .get(filename) as { filename: string; processed_at: string; rows_processed: number } | undefined;
  
  if (processed) {
    console.log(`  ⏭️  Skipping ${filename} (already processed on ${processed.processed_at})`);
    return 0;
  }
  
  const quarterInfo = parseQuarter(filename);
  if (!quarterInfo) {
    console.error(`  ❌ Invalid filename format: ${filename}`);
    return 0;
  }
  
  console.log(`  📄 Processing ${filename} (${quarterInfo.quarterStr})...`);
  
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error(`  ❌ Empty or invalid CSV file: ${filename}`);
    return 0;
  }
  
  // Parse header
  const header = lines[0].split(',').map(h => h.trim());
  const nameIdx = header.indexOf('Name');
  const constituencyIdx = header.indexOf('Constituency');
  const caucusIdx = header.indexOf('Caucus');
  const salariesIdx = header.indexOf('Salaries');
  const travelIdx = header.indexOf('Travel');
  const hospitalityIdx = header.indexOf('Hospitality');
  const contractsIdx = header.indexOf('Contracts');
  
  if (nameIdx === -1 || salariesIdx === -1) {
    console.error(`  ❌ Missing required columns in ${filename}`);
    return 0;
  }
  
  const insertExpense = db.prepare(`
    INSERT OR REPLACE INTO mp_expenses (
      mp_id, quarter, year, quarter_number,
      staff_salaries, travel, hospitality, contracts,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  // Process each row (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line (handle quoted fields)
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim()); // Add last field
    
    if (fields.length < Math.max(nameIdx, salariesIdx, travelIdx, hospitalityIdx, contractsIdx) + 1) {
      skippedCount++;
      continue;
    }
    
    const csvName = fields[nameIdx] || '';
    const constituency = fields[constituencyIdx] || '';
    const caucus = fields[caucusIdx] || '';
    const salaries = parseFloat(fields[salariesIdx] || '0') || 0;
    const travel = parseFloat(fields[travelIdx] || '0') || 0;
    const hospitality = parseFloat(fields[hospitalityIdx] || '0') || 0;
    const contracts = parseFloat(fields[contractsIdx] || '0') || 0;
    
    if (!csvName) {
      skippedCount++;
      continue;
    }
    
    // Find MP
    const mp = findMP(db, csvName, constituency);
    
    if (!mp) {
      console.log(`    ⚠️  Could not find MP: "${csvName}" (${constituency})`);
      skippedCount++;
      continue;
    }
    
    try {
      insertExpense.run(
        mp.id,
        quarterInfo.quarterStr,
        quarterInfo.year,
        quarterInfo.quarter,
        salaries,
        travel,
        hospitality,
        contracts
      );
      processedCount++;
    } catch (error: any) {
      console.error(`    ❌ Error inserting expense for ${mp.name}:`, error.message);
      errorCount++;
    }
  }
  
  // Mark file as processed
  db.prepare(`
    INSERT OR REPLACE INTO processed_expense_files (filename, rows_processed, processed_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(filename, processedCount);
  
  console.log(`  ✅ Processed ${processedCount} expenses (${skippedCount} skipped, ${errorCount} errors)`);
  
  return processedCount;
}

/**
 * Main function to import all expense files
 */
async function importAllExpenses() {
  console.log('Importing MP Expenses\n===================\n');
  const db = getDatabase();
  
  const expensesDir = path.join(process.cwd(), 'data', 'expenses');
  
  if (!fs.existsSync(expensesDir)) {
    console.error(`❌ Expenses directory not found: ${expensesDir}`);
    closeDatabase();
    return;
  }
  
  const files = fs.readdirSync(expensesDir)
    .filter(file => file.startsWith('MembersExpenditures.') && file.endsWith('.csv'))
    .sort();
  
  if (files.length === 0) {
    console.log('No expense files found.');
    closeDatabase();
    return;
  }
  
  console.log(`Found ${files.length} expense file(s)\n`);
  
  let totalProcessed = 0;
  
  for (const file of files) {
    const filePath = path.join(expensesDir, file);
    const processed = await importExpensesFile(filePath, file);
    totalProcessed += processed;
    console.log('');
  }
  
  console.log('=== Summary ===');
  console.log(`Total expenses processed: ${totalProcessed}`);
  console.log(`\n✅ Expense import complete!`);
  
  closeDatabase();
}

importAllExpenses().catch((error) => {
  console.error('Fatal error:', error);
  closeDatabase();
  process.exit(1);
});

