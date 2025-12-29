import { getDatabase } from '../lib/db/database';

/**
 * Script to get all unique parliamentary positions from the database
 */
function getUniqueParliamentaryPositions() {
  console.log('Fetching all unique parliamentary positions...\n');
  
  const db = getDatabase();
  
  // Get all MPs with parliamentary positions
  const mps = db.prepare(`
    SELECT parliamentary_positions
    FROM mps
    WHERE parliamentary_positions IS NOT NULL 
      AND parliamentary_positions != ''
      AND parliamentary_positions != '[]'
  `).all() as Array<{ parliamentary_positions: string }>;
  
  const positionSet = new Set<string>();
  
  mps.forEach((mp) => {
    try {
      const positions = JSON.parse(mp.parliamentary_positions);
      if (Array.isArray(positions)) {
        positions.forEach((pos: { title?: string }) => {
          if (pos.title && pos.title.trim()) {
            positionSet.add(pos.title.trim());
          }
        });
      }
    } catch (e) {
      // Skip invalid JSON
      console.error('Error parsing parliamentary_positions:', e);
    }
  });
  
  // Sort positions alphabetically
  const uniquePositions = Array.from(positionSet).sort();
  
  console.log(`Found ${uniquePositions.length} unique parliamentary positions:\n`);
  uniquePositions.forEach((position, index) => {
    console.log(`${index + 1}. ${position}`);
  });
  
  return uniquePositions;
}

// Run the script
getUniqueParliamentaryPositions();



