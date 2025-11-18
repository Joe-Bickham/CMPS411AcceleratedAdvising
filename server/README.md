# Accelerated Advising - Web Scraper Integration

This document explains how the web scraper is integrated with the Claude AI advising system.

## System Architecture

The system consists of several key components:

1. **Web Scraper** (`resolver.js` and `scraper.js`): Fetches and parses degree program data from the university website.
2. **Cache System** (`cache.js`): Stores scraped data temporarily to reduce load on the university website.
3. **Claude AI Service** (`claude-service.js`): Provides AI-powered academic advising using the Anthropic Claude API.
4. **Server** (`server.js`): Handles API requests, serves the frontend, and coordinates between components.
5. **Frontend** (HTML/JS files in `google-signin-project/`): User interface for interacting with the advising system.

## Data Flow

1. When a user accesses the advising system, the server attempts to fetch the latest program data:
   - First, it checks the cache for recently scraped data
   - If no cached data exists, it uses `resolver.js` to find the latest catalog URL
   - Then it uses `scraper.js` to extract course and program information
   - If web scraping fails, it falls back to local JSON files

2. The Claude AI service receives the program data (either from web scraping or local files) and uses it to provide academic advice.

3. The frontend displays the source of the data (web or local) to the user.

## Key Features

- **Dynamic Data**: The system always tries to use the most up-to-date information from the university website.
- **Graceful Fallback**: If web scraping fails, the system uses local JSON files as a backup.
- **Caching**: Scraped data is cached to reduce load on the university website and improve performance.
- **Background Refresh**: The system periodically refreshes the cached data to ensure it stays current.

## Configuration

Program configurations are stored in `config.js`:
- `BASE`: Contains the university website URL and seed paths for finding catalog pages
- `PROGRAMS`: Maps program keys to their full names and search hints

## Scrapy-based Catalog Discovery

- A dedicated Scrapy project lives under `scrapy_catalog/`. It crawls the official Programs of Study index (`preview_program.php` pages) and extracts program metadata, course lists, and prerequisite hints.
- The Node server automatically runs the Scrapy spider whenever a catalog endpoint is hit, caching the parsed JSON for 6 hours. If Scrapy fails, it falls back to the previous Axios/Cheerio parser and finally to the JSON snapshots in `server/data/`.
- You can run the spider manually:
  - `scrapy crawl programs -a include_courses=0 -O server/data/programs-index.json` (updates the dropdown/source list)
  - `scrapy crawl programs -a program_hint="Information Technology, BS" -a program_key=it-bs -O tmp.json`
- Install Scrapy globally (`pip install scrapy`) so the Node server can spawn it.
- A new API endpoint, `GET /api/catalog/programs`, returns the scraped list of live programs. The frontend degree selection page consumes this endpoint to populate the dropdown with real-time catalog entries.

## Usage

To start the server:

```bash
cd server
npm install
node server.js
```

The server will run on port 4000 by default. You can access the advising system at:
- http://localhost:4000/

## Troubleshooting

If the system is not using web-scraped data:

1. Check if the university website is accessible
2. Verify that the URLs in `config.js` are correct
3. Look for error messages in the server logs
4. Clear the cache by restarting the server

## Future Improvements

- Add more degree programs to the configuration
- Improve scraping reliability with more robust parsing
- Implement a way to manually trigger cache refresh from the UI
- Add analytics to track which data source is being used
