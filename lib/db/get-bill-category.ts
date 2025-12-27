import { queryOne, queryAll, convertPlaceholders } from './database';

/**
 * Get category name for a bill by bill number
 */
export async function getBillCategoryName(billNumber: string): Promise<string | null> {
  const sql = convertPlaceholders(`
    SELECT bpc.name as category_name
    FROM bills_motions bm
    LEFT JOIN bill_policy_categories bpc ON bm.policy_category_id = bpc.id
    WHERE bm.bill_number = ?
    LIMIT 1
  `);
  
  const bill = await queryOne<{ category_name: string | null }>(sql, [billNumber]);

  return bill?.category_name || null;
}

/**
 * Get category names for multiple bills at once
 */
export async function getBillCategoryNames(billNumbers: string[]): Promise<Map<string, string>> {
  const categoryMap = new Map<string, string>();
  
  if (billNumbers.length === 0) return categoryMap;

  const placeholders = billNumbers.map(() => '?').join(',');
  const sql = convertPlaceholders(`
    SELECT bm.bill_number, bpc.name as category_name
    FROM bills_motions bm
    LEFT JOIN bill_policy_categories bpc ON bm.policy_category_id = bpc.id
    WHERE bm.bill_number IN (${placeholders})
  `);
  
  const bills = await queryAll<{ bill_number: string; category_name: string | null }>(sql, billNumbers);

  for (const bill of bills) {
    if (bill.category_name) {
      categoryMap.set(bill.bill_number, bill.category_name);
    }
  }

  return categoryMap;
}

