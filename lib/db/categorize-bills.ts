import { queryOne, queryAll, queryRun, convertPlaceholders } from './database';
import { categorizeBill } from '../ai/categorize-bill';

/**
 * Get all unique bills that an MP has voted on
 */
export async function getBillsFromVotes(mpId: number): Promise<Array<{ bill_number: string | null; bill_title: string | null }>> {
  const sql = convertPlaceholders(`
    SELECT DISTINCT bill_number, bill_title
    FROM votes
    WHERE mp_id = ? AND bill_number IS NOT NULL
    ORDER BY bill_number
  `);
  
  const bills = await queryAll<{ bill_number: string; bill_title: string | null }>(sql, [mpId]);

  return bills;
}

/**
 * Check if a bill has a category assigned
 */
export async function getBillCategory(billNumber: string): Promise<number | null> {
  const sql = convertPlaceholders(`
    SELECT policy_category_id
    FROM bills_motions
    WHERE bill_number = ?
    LIMIT 1
  `);
  
  const bill = await queryOne<{ policy_category_id: number | null }>(sql, [billNumber]);

  return bill?.policy_category_id || null;
}

/**
 * Get category ID by category name
 */
export async function getCategoryIdByName(categoryName: string): Promise<number | null> {
  const sql = convertPlaceholders(`
    SELECT id
    FROM bill_policy_categories
    WHERE name = ?
    LIMIT 1
  `);
  
  const category = await queryOne<{ id: number }>(sql, [categoryName]);

  return category?.id || null;
}

/**
 * Update bill with category
 */
export async function updateBillCategory(billNumber: string, categoryId: number): Promise<void> {
  const sql = convertPlaceholders(`
    UPDATE bills_motions
    SET policy_category_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE bill_number = ?
  `);
  
  await queryRun(sql, [categoryId, billNumber]);
}

/**
 * Ensure bill exists in bills_motions table (create if it doesn't)
 */
export async function ensureBillExists(billNumber: string, billTitle: string | null): Promise<number> {
  // Check if bill exists
  const checkSql = convertPlaceholders(`
    SELECT id FROM bills_motions WHERE bill_number = ? LIMIT 1
  `);
  const existing = await queryOne<{ id: number }>(checkSql, [billNumber]);

  if (existing) {
    return existing.id;
  }

  // Create bill if it doesn't exist
  const insertSql = convertPlaceholders(`
    INSERT INTO bills_motions (bill_number, title, type, updated_at)
    VALUES (?, ?, 'Bill', CURRENT_TIMESTAMP)
    RETURNING id
  `);
  const result = await queryOne<{ id: number }>(insertSql, [billNumber, billTitle || `Bill ${billNumber}`]);

  return result?.id || 0;
}

/**
 * Ensure a bill has a category - check if exists, categorize if missing, and return category name
 * This is a synchronous check for existing categories, async categorization if needed
 */
export async function ensureBillHasCategory(
  billNumber: string,
  billTitle: string | null
): Promise<string | null> {
  // Ensure bill exists in bills_motions
  await ensureBillExists(billNumber, billTitle);

  // Check if already categorized
  const existingCategoryId = await getBillCategory(billNumber);
  if (existingCategoryId) {
    // Get category name
    const sql = convertPlaceholders(`
      SELECT name FROM bill_policy_categories WHERE id = ?
    `);
    const category = await queryOne<{ name: string }>(sql, [existingCategoryId]);
    return category?.name || null;
  }

  // Categorize using LLM
  console.log(`[Categorize] Categorizing ${billNumber} with title: "${billTitle || billNumber}"`);
  const categoryName = await categorizeBill({
    billNumber,
    title: billTitle || billNumber,
  });
  console.log(`[Categorize] Result for ${billNumber}: ${categoryName || 'null'}`);

  if (categoryName) {
    const categoryId = await getCategoryIdByName(categoryName);
    if (categoryId) {
      await updateBillCategory(billNumber, categoryId);
      return categoryName;
    } else {
      console.warn(`Category "${categoryName}" not found in database for bill ${billNumber}`);
      return null;
    }
  }

  return null;
}

/**
 * Categorize all bills that an MP has voted on
 * Checks existing categories first, then uses LLM for uncategorized bills
 */
export async function categorizeMPBills(mpId: number): Promise<{
  total: number;
  alreadyCategorized: number;
  newlyCategorized: number;
  failed: number;
}> {
  const bills = await getBillsFromVotes(mpId);
  
  let alreadyCategorized = 0;
  let newlyCategorized = 0;
  let failed = 0;

  for (const bill of bills) {
    if (!bill.bill_number) continue;

    try {
      // Ensure bill exists in bills_motions
      await ensureBillExists(bill.bill_number, bill.bill_title);

      // Check if already categorized
      const existingCategoryId = await getBillCategory(bill.bill_number);
      if (existingCategoryId) {
        alreadyCategorized++;
        continue;
      }

      // Categorize using LLM
      const categoryName = await categorizeBill({
        billNumber: bill.bill_number,
        title: bill.bill_title || bill.bill_number,
      });

      if (categoryName) {
        const categoryId = await getCategoryIdByName(categoryName);
        if (categoryId) {
          await updateBillCategory(bill.bill_number, categoryId);
          newlyCategorized++;
          console.log(`✓ Categorized ${bill.bill_number} as "${categoryName}"`);
        } else {
          console.warn(`Category "${categoryName}" not found in database for bill ${bill.bill_number}`);
          failed++;
        }
      } else {
        console.warn(`Could not categorize bill ${bill.bill_number}`);
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error categorizing bill ${bill.bill_number}:`, error);
      failed++;
    }
  }

  return {
    total: bills.length,
    alreadyCategorized,
    newlyCategorized,
    failed,
  };
}

