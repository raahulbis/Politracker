import axios from 'axios';
import { getDatabase, closeDatabase } from '../lib/db/database';
import * as https from 'https';

const COMMONS_BASE = 'https://www.ourcommons.ca';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false // For development
});

/**
 * Fetch email and phone from MP profile page using regex parsing
 * (Simpler approach without cheerio dependency)
 */
async function fetchMPContact(personId: string): Promise<{ email?: string; phone?: string }> {
  try {
    const profileUrl = `${COMMONS_BASE}/Members/en/${personId}`;
    const response = await axios.get(profileUrl, {
      httpsAgent,
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const html = response.data;
    const contact: { email?: string; phone?: string } = {};

    // Extract email from mailto: links
    const emailMatch = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      contact.email = emailMatch[1].trim();
    }

    // Extract phone from tel: links or phone number patterns
    // Canadian phone format: (XXX) XXX-XXXX or XXX-XXX-XXXX or XXX.XXX.XXXX
    const telMatch = html.match(/tel:([+\d\s\-\(\)]+)/i);
    if (telMatch) {
      // Clean up the phone number
      let phone = telMatch[1].replace(/[^\d]/g, '');
      if (phone.length === 10) {
        // Format as XXX-XXX-XXXX
        contact.phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
      } else if (phone.length === 11 && phone.startsWith('1')) {
        // Remove leading 1 for North American numbers
        phone = phone.slice(1);
        contact.phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
      } else {
        contact.phone = telMatch[1].trim();
      }
    } else {
      // Try to find phone number in text (XXX-XXX-XXXX or (XXX) XXX-XXXX)
      const phonePattern = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
      const phoneMatch = html.match(phonePattern);
      if (phoneMatch) {
        let phone = phoneMatch[1].replace(/[^\d]/g, '');
        if (phone.length === 10) {
          contact.phone = `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
        } else {
          contact.phone = phoneMatch[1].trim();
        }
      }
    }

    return contact;
  } catch (error: any) {
    console.error(`Error fetching contact for ${personId}:`, error.message);
    return {};
  }
}

/**
 * Update MP contact information
 */
async function updateMPContacts() {
  console.log('Updating MP Contact Information\n==================================\n');
  const db = getDatabase();

  const mps = db.prepare('SELECT id, name, district_id FROM mps WHERE district_id IS NOT NULL').all() as Array<{
    id: number;
    name: string;
    district_id: string;
  }>;

  console.log(`Found ${mps.length} MPs to update\n`);

  const updateStmt = db.prepare('UPDATE mps SET email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < mps.length; i++) {
    const mp = mps[i];
    console.log(`[${i + 1}/${mps.length}] Fetching contact for ${mp.name}...`);

    try {
      const contact = await fetchMPContact(mp.district_id);
      
      if (contact.email || contact.phone) {
        updateStmt.run(contact.email || null, contact.phone || null, mp.id);
        console.log(`  ✓ Email: ${contact.email || 'N/A'}, Phone: ${contact.phone || 'N/A'}`);
        updated++;
      } else {
        console.log(`  ✗ No contact info found`);
        skipped++;
      }

      // Delay to avoid rate limiting
      if (i < mps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    } catch (error: any) {
      console.error(`  ✗ Error: ${error.message}`);
      skipped++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped/Errors: ${skipped}`);
  console.log(`Total: ${mps.length}`);

  closeDatabase();
}

updateMPContacts().catch(console.error);

