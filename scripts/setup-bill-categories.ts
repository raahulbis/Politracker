import { queryExec, queryRun, closeDatabase, convertPlaceholders } from '../lib/db/database';

async function setupBillCategories() {
  console.log('Setting up bill policy categories table...\n');

  // Create bill policy categories table
  await queryExec(`
    CREATE TABLE IF NOT EXISTS bill_policy_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_bill_categories_name ON bill_policy_categories(name);
    CREATE INDEX IF NOT EXISTS idx_bill_categories_slug ON bill_policy_categories(slug);
  `);

  // Function to create slug from category name
  function createSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Insert categories
  const categories = [
    'Economy & Finance',
    'Health',
    'Housing',
    'Environment & Climate',
    'Justice & Public Safety',
    'Immigration & Citizenship',
    'Indigenous Affairs',
    'Defence & Foreign Affairs',
    'Infrastructure & Transport',
    'Labour & Employment',
    'Education & Youth',
    'Digital, Privacy & AI',
    'Culture, Media & Sport',
    'Government & Democratic Reform',
  ];

  const insertCategorySql = convertPlaceholders(`
    INSERT INTO bill_policy_categories (name, slug)
    VALUES (?, ?)
    ON CONFLICT (name) DO NOTHING
  `);

  let inserted = 0;
  let skipped = 0;

  for (const category of categories) {
    const slug = createSlug(category);
    try {
      const result = await queryRun(insertCategorySql, [category, slug]);
      if (result.changes > 0) {
        inserted++;
        console.log(`✓ Inserted: ${category}`);
      } else {
        skipped++;
        console.log(`⊘ Skipped (already exists): ${category}`);
      }
    } catch (error) {
      console.error(`✗ Error inserting ${category}:`, error);
    }
  }

  console.log(`\n✅ Setup complete!`);
  console.log(`   Inserted: ${inserted} categories`);
  console.log(`   Skipped: ${skipped} categories (already existed)`);
  console.log(`   Total: ${categories.length} categories`);

  await closeDatabase();
}

setupBillCategories().catch((error) => {
  console.error('Error setting up bill categories:', error);
  process.exit(1);
});
