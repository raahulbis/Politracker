import axios from 'axios';
import fs from 'fs';
import path from 'path';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'images', 'party-logos');

// Ensure directory exists
if (!fs.existsSync(LOGOS_DIR)) {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

const logos = [
  {
    name: 'liberal.png',
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/89/Liberal_Party_of_Canada_Logo_2014.svg/500px-Liberal_Party_of_Canada_Logo_2014.svg.png',
  },
  {
    name: 'conservative.png',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Logo_of_the_Conservative_Party_of_Canada_%282023%E2%80%93present%29.svg/500px-Logo_of_the_Conservative_Party_of_Canada_%282023%E2%80%93present%29.svg.png',
  },
  {
    name: 'ndp.png',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Orange_NDP_logo_English.svg/500px-Orange_NDP_logo_English.svg.png',
  },
  {
    name: 'bloc-quebecois.png',
    url: 'https://upload.wikimedia.org/wikipedia/en/thumb/3/3b/BlocQuebecois_Logo2015.png/500px-BlocQuebecois_Logo2015.png',
  },
  {
    name: 'green-party.png',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Logo_2025_Green_Party_of_Canada.svg/960px-Logo_2025_Green_Party_of_Canada.svg.png',
  },
];

async function downloadLogos() {
  console.log('Downloading party logos...\n');

  for (const logo of logos) {
    try {
      const response = await axios.get(logo.url, {
        responseType: 'arraybuffer', // Use arraybuffer for binary files (PNG)
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/png,image/*,*/*',
        },
      });

      const filePath = path.join(LOGOS_DIR, logo.name);
      fs.writeFileSync(filePath, Buffer.from(response.data));
      const fileSize = (response.data.length / 1024).toFixed(2);
      console.log(`✓ Downloaded ${logo.name} (${fileSize} KB)`);
    } catch (error: any) {
      console.error(`✗ Failed to download ${logo.name}:`, error.message);
      if (error.response) {
        console.error(`  Status: ${error.response.status}`);
        console.error(`  URL: ${logo.url}`);
      }
    }
  }

  console.log('\nLogo download complete!');
  console.log(`\nLogos saved to: ${LOGOS_DIR}`);
}

downloadLogos();

