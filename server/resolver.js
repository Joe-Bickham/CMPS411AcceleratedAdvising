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
export async function discoverLatestProgramUrl(programKey, landingUrl = "https://www.southeastern.edu/catalog/") {
  const cacheKey = `discover:${programKey}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const program = PROGRAMS[programKey];
  if (!program) throw new Error(`Unknown program key: ${programKey}`);
  const progName = (program.name || "").trim();
  if (!progName) throw new Error(`Program ${programKey} missing 'name' in config.js`);

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
      // Find an anchor whose text matches the exact program name
      let progHref = null;
      $('a[href*="preview_program.php"]').each((_, a) => {
        const text = String($(a).text() || '').trim();
        if (text.toLowerCase() === progName.toLowerCase()) {
          progHref = $(a).attr('href');
          return false;
        }
      });
      if (progHref) {
        const abs = progHref.startsWith('http') ? progHref : `https://catalog.southeastern.edu/${progHref.replace(/^\//,'')}`;
        return setCache(cacheKey, abs, 12 * 60 * 60 * 1000);
      }
    } catch {}
  }

  // If not found, fall back to the prior resolver method
  return resolveLatestCatalogUrl(programKey);
}
