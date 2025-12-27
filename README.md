# PoliTracker - Canadian MP Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A web application that allows users to search for their federal Member of Parliament (MP) using their postal code and view their profile, voting history, and political alignment.

## Open Source

PoliTracker is an open source project. We welcome contributions from the community!

- **License**: [MIT License](./LICENSE)
- **Contributing**: See [Contributing](#contributing) section below

## Features

### Current Features
- 🔍 Search for MP by postal code
- 👤 View MP profile information
- 📊 Display voting history from House of Commons

### Future Features
- 🎯 Political alignment comparison (user's alignment vs MP's voting record)
- 📈 Party loyalty statistics (voting with/against party)
- 📋 Detailed breakdown of motions sponsored/co-sponsored

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL (stores MPs, postal codes, votes, and bills)
- **Data Sources**: 
  - **House of Commons Open Data** (`https://www.ourcommons.ca`) - MP profile data (names, parties, constituencies, parliamentary positions)
  - **OpenParliament API** (`https://api.openparliament.ca`) - Bills, votes, and parliamentary data
  - **OpenNorth Represent API** (`https://represent.opennorth.ca`) - Postal code to electoral district mapping

## Getting Started

### Quick Setup (Recommended)

If you have a database dump available:

1. **Install dependencies:**
```bash
npm install
```

2. **Set up PostgreSQL database:**
```bash
createdb politracker
export DATABASE_URL="postgresql://username@localhost:5432/politracker"
npm run db:setup
```

3. **Run the development server:**
```bash
npm run dev
```

4. **Open [http://localhost:3000](http://localhost:3000)** in your browser.

5. **Set up nightly updates** (see [Database Setup](#database) below)

### Full Setup from Scratch

1. **Install dependencies:**
```bash
npm install
```

2. **Set up the database schema:**
```bash
npm run db:setup
```

3. **Set up PostgreSQL and import data:**
```bash
createdb politracker
export DATABASE_URL="postgresql://username@localhost:5432/politracker"
npm run db:setup
```

**Note:** After setting up the schema, manually import data:
- `npm run db:fetch-mps` - Import MPs
- `npm run db:import-postal-codes` - Import postal codes (optional)
- `npm run db:sync-latest-votes` - Initial vote sync (takes 30-60 minutes)

4. **Run the development server:**
```bash
npm run dev
```

7. **Open [http://localhost:3000](http://localhost:3000)** in your browser.

See [README_DATABASE.md](./README_DATABASE.md) for detailed database setup instructions.

## Database

The app uses PostgreSQL to store all MP data, eliminating API rate limits:
- **MPs**: Stored locally from House of Commons data
- **Postal Codes**: Mapped to electoral districts
- **Votes**: Voting records from OpenParliament API
- **Bills**: Bills and motions data

### Quick Setup

1. **Install PostgreSQL** (if not already installed)
2. **Create database:**
   ```bash
   createdb politracker
   ```

3. **Set environment variable:**
   ```bash
   export DATABASE_URL="postgresql://username@localhost:5432/politracker"
   ```
   Or add to `.env` file

4. **Setup schema:**
   ```bash
   npm run db:setup
   ```

5. **Import data:**
   ```bash
   npm run db:fetch-mps
   npm run db:sync-latest-votes  # Initial sync (30-60 min)
   ```

### Nightly Updates

Keep your database current with automated nightly updates:

```bash
# Manual run
npm run db:nightly-update

# Or schedule with cron (runs at 2 AM daily)
# 0 2 * * * cd /path/to/politracker && npm run db:nightly-update >> logs/nightly-update.log 2>&1
```

The nightly update script only syncs new votes (votes added since the last sync), making it fast and efficient.

See [README_DATABASE.md](./README_DATABASE.md) for detailed setup instructions, including cron scheduling and database dump/restore.

## Project Structure

```
politracker/
├── app/
│   ├── api/              # API routes for data processing
│   ├── page.tsx          # Main search page
│   ├── mp/[id]/          # MP profile pages
│   └── layout.tsx        # Root layout
├── components/              # React components
├── lib/
│   ├── db/               # Database queries and setup
│   └── api/              # API utilities
├── scripts/              # Data import scripts
├── data/                 # Data files and exports (gitignored)
└── types/                # TypeScript type definitions
```

## Contributing

Contributions are welcome! Please see our [Contributing Guide](./CONTRIBUTING.md) for details on how to contribute to PoliTracker.

For security concerns, please see our [Security Policy](./SECURITY.md).

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Acknowledgments

This project relies on the following excellent open data services:

- **[OpenParliament.ca](https://openparliament.ca/)** - Provides comprehensive data on Canadian parliamentary proceedings, including debates, votes, bills, and MP information. This project uses OpenParliament's API to fetch voting records and parliamentary data.

- **[Represent by Open North](https://represent.opennorth.ca/)** - A civic information API that matches postal codes and addresses to elected officials at all levels of government. This project uses Represent to map postal codes to federal electoral districts and find MPs.

Thank you to both organizations for making Canadian political data more accessible!

