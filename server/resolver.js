import axios from "axios";
import * as cheerio from "cheerio";
import { BASE, PROGRAMS } from "./config.js";
import { getCache, setCache } from "./cache.js";

const CATALOG_HOST = "https://catalog.southeastern.edu";
const PROGRAM_INDEX_TTL = 12 * 60 * 60 * 1000;

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

  const targetNames = buildProgramNameVariants(program);

  // 1) Collect catoid candidates from landing pages
  const landingCandidates = [landingUrl, CATALOG_HOST + "/", "https://www.southeastern.edu/catalog/index.html"];
  const catoids = new Set();
  for (const u of landingCandidates) {
    try {
      const html = await fetchHTML(u);
      const $ = cheerio.load(html);
      $('a[href*="catoid="]').each((_, a) => {
        const href = String($(a).attr("href") || "");
        const match = href.match(/catoid=(\d+)/);
        if (match) catoids.add(Number(match[1]));
      });
    } catch {
      // ignore landing fetch failures
    }
  }
  if (catoids.size === 0) [10, 9, 8, 7, 6, 5].forEach((n) => catoids.add(n));
  const cids = Array.from(catoids).sort((a, b) => b - a);

  // 2) For each catoid, look up the Programs of Study index and find the matching program
  for (const cid of cids) {
    try {
      const indexData = await fetchProgramsOfStudy(cid);
      if (!indexData.programs?.length) continue;

      const match = selectProgramFromIndex(indexData.programs, targetNames);
      if (match?.url) {
        return setCache(cacheKey, match.url, 12 * 60 * 60 * 1000);
      }
    } catch {
      // try next catoid
    }
  }

  // If not found, fall back to the prior resolver method
  return resolveLatestCatalogUrl(programKey);
}

function buildProgramNameVariants(program) {
  const values = [
    program.name,
    ...(program.aliases || []),
    ...(program.hints || []),
  ]
    .map((v) => canonicalProgramName(v))
    .filter(Boolean);
  return Array.from(new Set(values));
}

function canonicalProgramName(name) {
  if (!name) return "";
  return normalizeText(name)
    .replace(/\b(bachelor\s+of\s+science|b\.?s\.?)\b/g, "bs")
    .replace(/\b(bachelor\s+of\s+arts|b\.?a\.?)\b/g, "ba")
    .replace(/\b(master\s+of\s+science|m\.?s\.?)\b/g, "ms")
    .replace(/\b(master\s+of\s+arts|m\.?a\.?)\b/g, "ma")
    .replace(/\bdegree\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectProgramFromIndex(programs, targetNames) {
  if (!programs?.length || !targetNames?.length) return null;

  const exact = programs.find((p) => targetNames.includes(p.canonical));
  if (exact) return exact;

  return programs.find((p) =>
    targetNames.some((target) => target.length >= 4 && p.canonical.includes(target))
  );
}

async function fetchProgramsOfStudy(catoid) {
  const cacheKey = `programIndex:${catoid}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const navIds = await discoverProgramNavIds(catoid);
  for (const navId of navIds) {
    const indexUrl = `${CATALOG_HOST}/content.php?catoid=${catoid}&navoid=${navId}`;
    try {
      const html = await fetchHTML(indexUrl);
      const programs = extractProgramsFromIndex(html);
      if (programs.length) {
        return setCache(
          cacheKey,
          { catoid, navoid: navId, url: indexUrl, programs },
          PROGRAM_INDEX_TTL
        );
      }
    } catch {
      // try next nav id
    }
  }

  return { catoid, navoid: null, url: null, programs: [] };
}

async function discoverProgramNavIds(catoid) {
  const navIds = new Set([155]);
  const candidates = [
    `${CATALOG_HOST}/content.php?catoid=${catoid}`,
    `${CATALOG_HOST}/index.php?catoid=${catoid}`,
  ];

  for (const url of candidates) {
    try {
      const html = await fetchHTML(url);
      const $ = cheerio.load(html);
      $('a[href*="navoid="]').each((_, a) => {
        const text = normalizeText($(a).text());
        const href = String($(a).attr("href") || "");
        const match = href.match(/navoid=(\d+)/);
        if (!match) return;
        const id = Number(match[1]);
        if (!id) return;
        if (/programs?\s+of\s+study/i.test(text) || /\(a-z\)/i.test(text) || /programs/i.test(text)) {
          navIds.add(id);
        }
      });
    } catch {
      // ignore fetch failures, fallback to default
    }
  }

  return Array.from(navIds);
}

function extractProgramsFromIndex(html) {
  const $ = cheerio.load(html);
  const programs = [];
  $('a[href*="preview_program.php"]').each((_, a) => {
    const title = String($(a).text() || "").trim();
    const canonical = canonicalProgramName(title);
    if (!canonical) return;
    const href = String($(a).attr("href") || "");
    const url = absoluteCatalogUrl(href);
    if (url) programs.push({ name: title, canonical, url });
  });
  return programs;
}

function absoluteCatalogUrl(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `${CATALOG_HOST}/${href.replace(/^\//, "")}`;
}
