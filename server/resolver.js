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
