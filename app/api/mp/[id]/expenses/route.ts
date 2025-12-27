import { NextRequest, NextResponse } from 'next/server';
import { getMPByDistrict } from '@/lib/db/queries';
import { queryOne, queryAll, convertPlaceholders } from '@/lib/db/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const mpId = params.id;

  try {
    // Decode the ID (could be district_id, district_name, or MP name)
    const decodedId = decodeURIComponent(mpId);
    
    // getMPByDistrict handles district_name, district_id, and name lookups
    const mp = await getMPByDistrict(decodedId);

    if (!mp || !mp.id) {
      return NextResponse.json(
        { error: 'MP not found' },
        { status: 404 }
      );
    }
    
    // Get total expenses across all quarters
    const expensesSql = convertPlaceholders(`
      SELECT 
        COALESCE(SUM(staff_salaries), 0) as total_staff_salaries,
        COALESCE(SUM(travel), 0) as total_travel,
        COALESCE(SUM(hospitality), 0) as total_hospitality,
        COALESCE(SUM(contracts), 0) as total_contracts
      FROM mp_expenses
      WHERE mp_id = $1
    `);
    const expenses = await queryOne<{
      total_staff_salaries: number;
      total_travel: number;
      total_hospitality: number;
      total_contracts: number;
    }>(expensesSql, [mp.id]);

    // Get processed quarters and years
    const quartersSql = convertPlaceholders(`
      SELECT DISTINCT year, quarter_number, quarter
      FROM mp_expenses
      WHERE mp_id = $1
      ORDER BY year, quarter_number
    `);
    const processedQuarters = await queryAll<{
      year: number;
      quarter_number: number;
      quarter: string;
    }>(quartersSql, [mp.id]);

    if (!expenses) {
      return NextResponse.json({
        total_staff_salaries: 0,
        total_travel: 0,
        total_hospitality: 0,
        total_contracts: 0,
        processedQuarters: [],
      });
    }

    return NextResponse.json({
      ...expenses,
      processedQuarters,
    });
  } catch (error) {
    console.error('Error fetching MP expenses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MP expenses' },
      { status: 500 }
    );
  }
}
