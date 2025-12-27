import { NextResponse } from 'next/server';
import { queryAll, queryOne, convertPlaceholders } from '@/lib/db/database';
import { getCurrentSessionStartDate } from '@/lib/db/sessions';

export async function GET() {
  try {
    // 1. Total Number of MPs per party
    const mpsPerParty = await queryAll<{
      party_name: string;
      count: number;
    }>(`
      SELECT 
        party_name,
        COUNT(*) as count
      FROM mps
      WHERE party_name IS NOT NULL AND party_name != ''
      GROUP BY party_name
      ORDER BY count DESC
    `);

    // 2. Total Expenses by party (includes staff_salaries, travel, hospitality, and contracts)
    // Start from mp_expenses to ensure we capture ALL expense records from ALL MPs
    const expensesByParty = await queryAll<{
      party_name: string;
      total_expenses: number;
    }>(`
      SELECT 
        m.party_name,
        COALESCE(SUM(e.staff_salaries + e.travel + e.hospitality + e.contracts), 0) as total_expenses
      FROM mp_expenses e
      INNER JOIN mps m ON e.mp_id = m.id
      WHERE m.party_name IS NOT NULL AND m.party_name != ''
      GROUP BY m.party_name
      ORDER BY total_expenses DESC
    `);

    // 3. Biggest Spender (individual MP) - includes staff_salaries, travel, hospitality, and contracts
    // Start from mp_expenses to ensure we capture ALL expense records from ALL MPs
    const biggestSpender = await queryOne<{
      id: number;
      name: string;
      party_name: string | null;
      district_name: string;
      total_expenses: number;
    }>(`
      SELECT 
        m.id,
        m.name,
        m.party_name,
        m.district_name,
        COALESCE(SUM(e.staff_salaries + e.travel + e.hospitality + e.contracts), 0) as total_expenses
      FROM mp_expenses e
      INNER JOIN mps m ON e.mp_id = m.id
      GROUP BY m.id, m.name, m.party_name, m.district_name
      ORDER BY total_expenses DESC
      LIMIT 1
    `);

    // 4. Get processed quarters and years (for fiscal year display)
    const processedQuarters = await queryAll<{
      year: number;
      quarter_number: number;
      quarter: string;
    }>(`
      SELECT DISTINCT year, quarter_number, quarter
      FROM mp_expenses
      ORDER BY year, quarter_number
    `);

    // 5. Total Salaries by party
    const salariesByParty = await queryAll<{
      party_name: string;
      total_salary: number;
    }>(`
      SELECT 
        party_name,
        COALESCE(SUM(salary), 0) as total_salary
      FROM mps
      WHERE party_name IS NOT NULL AND party_name != '' AND salary IS NOT NULL
      GROUP BY party_name
      ORDER BY total_salary DESC
    `);

    // 6. Highest Paid MP
    const highestPaid = await queryOne<{
      id: number;
      name: string;
      party_name: string | null;
      district_name: string;
      salary: number;
    }>(`
      SELECT 
        id,
        name,
        party_name,
        district_name,
        salary
      FROM mps
      WHERE salary IS NOT NULL
      ORDER BY salary DESC
      LIMIT 1
    `);

    // 7. Bill Statistics for current session
    // Get current session start date to filter bills
    const currentSessionStartDate = await getCurrentSessionStartDate();
    if (!currentSessionStartDate) {
      return NextResponse.json(
        { error: 'No current session found' },
        { status: 500 }
      );
    }

    // Filter bills by introduced_date >= session start date to get only current session bills
    // Cast introduced_date to DATE for proper date comparison (it's stored as TEXT)
    // Use DISTINCT to count only unique bills (by bill_number)
    // Break down "in progress" into "at_house" and "at_senate" based on status_code
    const billStatsSql = convertPlaceholders(`
      SELECT 
        COUNT(DISTINCT bill_number) as total_bills,
        COUNT(DISTINCT bill_number) FILTER (WHERE 
          status_code = 'RoyalAssentGiven' OR 
          law = true
        ) as passed_bills,
        COUNT(DISTINCT bill_number) FILTER (WHERE law = true) as law_bills,
        COUNT(DISTINCT bill_number) FILTER (WHERE status_code = 'OutsideOrderPrecedence') as outside_order_precedence,
        COUNT(DISTINCT bill_number) FILTER (WHERE 
          (status_code IS NULL OR (status_code != 'RoyalAssentGiven' AND status_code != 'OutsideOrderPrecedence')) AND 
          (law IS NULL OR law != true) AND
          (status_code LIKE 'House%' OR status_code LIKE '%House%')
        ) as at_house,
        COUNT(DISTINCT bill_number) FILTER (WHERE 
          (status_code IS NULL OR (status_code != 'RoyalAssentGiven' AND status_code != 'OutsideOrderPrecedence')) AND 
          (law IS NULL OR law != true) AND
          (status_code LIKE 'Senate%' OR status_code LIKE '%Senate%')
        ) as at_senate,
        COUNT(DISTINCT bill_number) FILTER (WHERE 
          (status_code IS NULL OR (status_code != 'RoyalAssentGiven' AND status_code != 'OutsideOrderPrecedence')) AND 
          (law IS NULL OR law != true) AND
          (status_code NOT LIKE 'House%' AND status_code NOT LIKE '%House%' AND 
           status_code NOT LIKE 'Senate%' AND status_code NOT LIKE '%Senate%')
        ) as still_in_reading
      FROM bills_motions
      WHERE introduced_date IS NOT NULL
        AND CAST(introduced_date AS DATE) >= CAST($1 AS DATE)
        AND type = 'Bill'
        AND bill_number IS NOT NULL
    `);
    const billStats = await queryOne<{
      total_bills: number;
      passed_bills: number;
      law_bills: number;
      outside_order_precedence: number;
      at_house: number;
      at_senate: number;
      still_in_reading: number;
    }>(billStatsSql, [currentSessionStartDate]);

    // 8. Recent Bills (all bills from current session with categories)
    // No LIMIT - fetch all bills for filtering/pagination on the client
    // Use subquery to get only the latest row per bill_number (by id), then order by date
    const recentBillsSql = convertPlaceholders(`
      SELECT 
        bm.bill_number,
        bm.title,
        bm.introduced_date,
        bm.status_code,
        bm.status,
        bm.law,
        bm.session,
        bm.sponsor_politician,
        COALESCE(
          bm.sponsor_party,
          (SELECT party_name FROM mps WHERE name = bm.sponsor_politician LIMIT 1)
        ) as sponsor_party,
        bpc.name as category_name
      FROM bills_motions bm
      LEFT JOIN bill_policy_categories bpc ON bm.policy_category_id = bpc.id
      INNER JOIN (
        SELECT bill_number, MAX(id) as max_id
        FROM bills_motions
        WHERE introduced_date IS NOT NULL
          AND CAST(introduced_date AS DATE) >= CAST($1 AS DATE)
          AND type = 'Bill'
          AND bill_number IS NOT NULL
        GROUP BY bill_number
      ) latest ON bm.bill_number = latest.bill_number AND bm.id = latest.max_id
      WHERE bm.introduced_date IS NOT NULL
        AND CAST(bm.introduced_date AS DATE) >= CAST($1 AS DATE)
        AND bm.type = 'Bill'
        AND bm.bill_number IS NOT NULL
      ORDER BY CAST(bm.introduced_date AS DATE) DESC, bm.bill_number DESC
    `);
    let recentBills = await queryAll<{
      bill_number: string;
      title: string;
      introduced_date: string;
      status_code: string | null;
      status: string | null;
      law: boolean | null;
      session: string | null;
      sponsor_politician: string | null;
      sponsor_party: string | null;
      category_name: string | null;
    }>(recentBillsSql, [currentSessionStartDate]);

    // Add category information to bills (same logic as MP stats route)
    if (recentBills.length > 0) {
      const { getBillCategoryNames } = await import('@/lib/db/get-bill-category');
      const { ensureBillHasCategory } = await import('@/lib/db/categorize-bills');
      
      const billNumbers = recentBills
        .map(b => b.bill_number)
        .filter((num): num is string => Boolean(num));
      
      if (billNumbers.length > 0) {
        // Get existing categories
        let categoryMap = await getBillCategoryNames(billNumbers);
        
        // Find bills that need categorization
        const billsNeedingCategories = recentBills
          .filter(b => b.bill_number && !categoryMap.has(b.bill_number));
        
        if (billsNeedingCategories.length > 0) {
          // Categorize bills that don't have categories yet
          const categoryPromises = billsNeedingCategories.map(async (bill) => {
            try {
              const category = await ensureBillHasCategory(bill.bill_number!, bill.title);
              if (category) {
                return { billNumber: bill.bill_number!, category };
              }
              return null;
            } catch (error) {
              console.error(`Error ensuring category for bill ${bill.bill_number}:`, error);
              return null;
            }
          });
          
          const results = await Promise.all(categoryPromises);
          results.forEach(result => {
            if (result) {
              categoryMap.set(result.billNumber, result.category);
            }
          });
          
          // Refresh category map from database to get newly categorized bills
          const updatedCategoryMap = await getBillCategoryNames(billNumbers);
          updatedCategoryMap.forEach((cat, billNum) => categoryMap.set(billNum, cat));
        }
        
        // Add category to each bill
        recentBills = recentBills.map(bill => ({
          ...bill,
          category_name: bill.bill_number ? categoryMap.get(bill.bill_number) || bill.category_name || null : bill.category_name,
        }));
      }
    }

    return NextResponse.json({
      mpsPerParty,
      expensesByParty,
      biggestSpender: biggestSpender || null,
      processedQuarters,
      salariesByParty,
      highestPaid: highestPaid || null,
      billStats: billStats || { total_bills: 0, passed_bills: 0, law_bills: 0, outside_order_precedence: 0, at_house: 0, at_senate: 0, still_in_reading: 0 },
      recentBills,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
