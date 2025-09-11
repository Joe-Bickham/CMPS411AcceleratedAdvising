// server/tools/scrape-it-bs.js
// Finds the live "Information Technology, BS" program page in the Modern Campus catalog
// and updates server/data/it-bs-catalog.json if we gather enough courses.

import fs from "fs/promises";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const ROOT = path.resolve(process.cwd());
const DATA_FILE = path.join(ROOT, "server", "data", "it-bs-catalog.json");

// Modern Campus “Programs of Study (A–Z)” index for 2024–2025 appears to be catoid=5.
// 2025–2026 moved to catoid=6. We’ll try a list of candidates so it keeps working over time.
const CATOIDS = [6, 5]; // try newest first, then prior
const PROGRAM_TEXT = "Information Technology, BS"; // exact anchor text on the catalog

function norm(s) { return String(s || "").trim(); }

// Find the program URL for “Information Technology, BS” for a given catoid
async function findProgramUrl(catoid) {
  const indexUrl = `https://catalog.southeastern.edu/content.php?catoid=${catoid}&navoid=155`;
  const { data: html } = await axios.get(indexUrl, { timeout: 20000 });
  const $ = cheerio.load(html);

  // Links on this page typically go to preview_program.php?catoid=5&poid=XXXX
  let href = null;
  $('a[href*="preview_program.php"]').each((_, a) => {
    const text = norm($(a).text());
    if (text.toLowerCase() === PROGRAM_TEXT.toLowerCase()) {
      href = $(a).attr("href");
      return false;
    }
  });

  if (!href) throw new Error(`Program link not found on index for catoid=${catoid}`);
  // Make absolute if needed
  const url = href.startsWith("http")
    ? href
    : `https://catalog.southeastern.edu/${href.replace(/^\//, "")}`;
  return url;
}

// Parse a program page and extract course-like entries.
// We’ll look for table rows or list items containing something like "CMPS 1610" + title.
function parseProgramPage(html) {
  const $ = cheerio.load(html);
  const courses = [];
  const seen = new Set();

  const pushCourse = (code, title) => {
    const c = norm(code).replace(/\s+/, " ");
    const t = norm(title);
    if (!c || !t) return;
    const key = `${c}::${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    courses.push({ code: c, title: t, credits: null, prereqs: [] });
  };

  const codeTitleFromText = (txt) => {
    // Match e.g. "CMPS 1610 — Algorithm Design & Implementation I"
    // Accept hyphen variants and en dash.
    const m = txt.match(/\b([A-Z]{3,}\s*\d{3,4})\s*[–-]\s*(.+)$/);
    return m ? { code: m[1], title: m[2] } : null;
  };

  // 1) Tables (common in curriculum layouts)
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td, th").toArray().map(td => norm($(td).text()));
    if (cells.length >= 2) {
      // If first cell looks like a code and second looks like title
      const m1 = cells[0].match(/^[A-Z]{3,}\s*\d{3,4}$/);
      if (m1 && cells[1].length > 0) {
        pushCourse(m1[0], cells[1]);
        return;
      }
      // Or the whole row text uses "CODE — Title"
      const joined = cells.join(" ").replace(/\s+/g, " ");
      const m2 = codeTitleFromText(joined);
      if (m2) pushCourse(m2.code, m2.title);
    }
  });

  // 2) Lists / paragraphs
  $("li, p").each((_, el) => {
    const txt = norm($(el).text()).replace(/\s+/g, " ");
    // Try CODE alone then title in same element
    const m1 = txt.match(/\b([A-Z]{3,}\s*\d{3,4})\b/);
    if (m1) {
      // If a dash exists later, try split; else take remainder
      const dashIdx = txt.indexOf(" - ");
      const enIdx = txt.indexOf(" – ");
      const idx = dashIdx >= 0 ? dashIdx : enIdx;
      if (idx > -1) {
        const code = m1[1];
        const title = txt.slice(idx + 3).trim();
        if (title) pushCourse(code, title);
      } else {
        const m2 = codeTitleFromText(txt);
        if (m2) pushCourse(m2.code, m2.title);
      }
    }
  });

  return courses;
}

async function scrape() {
  let programUrl = null;
  let catoidUsed = null;

  // Step 1: discover the current program URL by trying catoids
  for (const catoid of CATOIDS) {
    try {
      programUrl = await findProgramUrl(catoid);
      catoidUsed = catoid;
      break;
    } catch {
      // try next catoid
    }
  }
  if (!programUrl) {
    throw new Error(`Could not find program URL for any catoid in [${CATOIDS.join(", ")}].`);
  }

  // Step 2: fetch & parse that page
  const { data: html } = await axios.get(programUrl, { timeout: 20000 });
  const courses = parseProgramPage(html);

  if (courses.length < 10) {
    throw new Error(`Parsed only ${courses.length} courses from program page: ${programUrl}`);
  }

  const json = {
    program: {
      key: "it-bs-rolling",
      name: "Information Technology, BS",
      catalog_year: `catalog catoid=${catoidUsed}`
    },
    courses,
    groups: [],
    source_url: programUrl
  };

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(json, null, 2), "utf-8");
  console.log(`✅ Updated ${DATA_FILE} with ${courses.length} courses from:\n${programUrl}`);
}

scrape().catch(err => {
  console.error("Scrape failed:", err.message);
  process.exit(1);
});
