import axios from "axios";
import * as cheerio from "cheerio";
import { BASE, PROGRAMS } from "./config.js";
import { getCache, setCache } from "./cache.js";

// Try a few URLs, pick the page that (a) contains the program hints,
// and (b) has the highest catalog year mentioned in text.
export async function resolveLatestCatalogUrl(programKey) {
  const cacheKey = `resolve:${programKey}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const program = PROGRAMS[programKey];
  if (!program) throw new Error(`Unknown program key: ${programKey}`);

  const candidates = [
    ...BASE.seeds.map((p) => BASE.origin + p),
    ...(program.candidates || [])
  ];

  let best = null; // { url, yearScore }
  for (const url of candidates) {
    try {
      const html = await fetchHTML(url);
      const $ = cheerio.load(html);
      const text = normalizeText($("body").text());
      // Heuristic: page must include at least one hint
      const hasHint = (program.hints || []).some(h => text.includes(h));
      if (!hasHint) continue;

      const yr = detectBestYear(text);
      const score = yr ? Number(yr.replace(/[^0-9]/g,"").slice(0,4)) : 0; // 2024-2025 -> 2024
      // prefer higher year; if equal, prefer URL with longer path (more specific)
      if (!best || score > best.yearScore || (score === best.yearScore && url.length > best.url.length)) {
        best = { url, yearScore: score };
      }
    } catch (e) {
      // ignore failed candidates
    }
  }

  if (!best) {
    throw new Error(`Could not resolve a catalog page for ${programKey}. Add more seeds in config.js.`);
  }

  // cache for 12 hours
  return setCache(cacheKey, best.url, 12 * 60 * 60 * 1000);
}

function normalizeText(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function detectBestYear(text) {
  const m = text.match(/\b(20\d{2})\s?[–-]\s?(20\d{2})\b/); // 2024–2025
  return m ? `${m[1]}-${m[2]}` : null;
}

async function fetchHTML(url) {
  const res = await axios.get(url, {
    headers: { "User-Agent": "CatalogResolver/1.0" },
    timeout: 15000
  });
  return res.data;
}

// New: Discover latest catalog via Southeastern landing, then find A–Z and program link
// Now accepts either a programKey (from PROGRAMS config) or a raw program name string
export async function discoverLatestProgramUrl(programKeyOrName, landingUrl = "https://www.southeastern.edu/catalog/") {
  const cacheKey = `discover:${programKeyOrName}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  // Check if this is a known program key or a raw name
  let progName = '';
  const program = PROGRAMS[programKeyOrName];
  
  if (program) {
    // It's a known program key
    progName = (program.name || "").trim();
    if (!progName) throw new Error(`Program ${programKeyOrName} missing 'name' in config.js`);
  } else {
    // It's a raw program name - use it directly
    progName = String(programKeyOrName || "").trim();
    if (!progName) throw new Error(`Program name cannot be empty`);
  }

  console.log(`[discover] Searching for program: "${progName}"`);

  // 1) Collect catoid candidates from landing pages
  const landingCandidates = [landingUrl, "https://catalog.southeastern.edu/"];
  const catoids = new Set();
  for (const u of landingCandidates) {
    try {
      const html = await fetchHTML(u);
      const $ = cheerio.load(html);
      $('a[href*="catoid="]').each((_, a) => {
        const href = String($(a).attr('href') || '');
        const m = href.match(/catoid=(\d+)/);
        if (m) catoids.add(Number(m[1]));
      });
    } catch {}
  }
  // Fallback to a reasonable range if nothing found
  if (catoids.size === 0) [8,7,6,5].forEach(n => catoids.add(n));
  const cids = Array.from(catoids).sort((a,b)=>b-a);

  // 2) For each catoid, try to find the Programs of Study A–Z index and the program link
  for (const cid of cids) {
    const indexUrl = `https://catalog.southeastern.edu/content.php?catoid=${cid}&navoid=155`;
    try {
      const html = await fetchHTML(indexUrl);
      const $ = cheerio.load(html);
      // Find an anchor whose text matches the program name (case-insensitive, flexible matching)
      let progHref = null;
      const normalizedSearch = progName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      
      $('a[href*="preview_program.php"]').each((_, a) => {
        const text = String($(a).text() || '').trim();
        const normalizedText = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        
        // Try exact match first
        if (normalizedText === normalizedSearch) {
          progHref = $(a).attr('href');
          console.log(`[discover] Found exact match: "${text}"`);
          return false;
        }
        
        // Try partial match (contains all words)
        const searchWords = normalizedSearch.split(' ');
        const textWords = normalizedText.split(' ');
        const allWordsMatch = searchWords.every(word => textWords.includes(word));
        
        if (allWordsMatch && !progHref) {
          progHref = $(a).attr('href');
          console.log(`[discover] Found partial match: "${text}"`);
        }
      });
      
      if (progHref) {
        const abs = progHref.startsWith('http') ? progHref : `https://catalog.southeastern.edu/${progHref.replace(/^\//,'')}`;
        console.log(`[discover] Success! URL: ${abs}`);
        return setCache(cacheKey, abs, 12 * 60 * 60 * 1000);
      }
    } catch (err) {
      console.warn(`[discover] Failed to check catoid ${cid}:`, err.message);
    }
  }

  console.warn(`[discover] Could not find program: "${progName}"`);
  
  // If it's a known program key, try the fallback resolver
  if (program) {
    return resolveLatestCatalogUrl(programKeyOrName);
  }
  
  // Otherwise, throw error
  throw new Error(`Could not discover program: ${progName}`);
}
