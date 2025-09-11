import axios from "axios";
import * as cheerio from "cheerio";

// Heuristic scraper (similar to before), robust-ish to layout changes.
// You can specialize this once you know Southeastern’s exact DOM.

export async function scrapeCatalogFromUrl(url) {
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  ["script","style","noscript","nav","header","footer"].forEach(sel => $(sel).remove());

  const title = clean($("h1").first().text()) || clean($("title").first().text()) || "Program";
  const bodyText = clean($("body").text());
  const year = detectYear(bodyText) || "unknown";

  // collect ordered text blocks
  const blocks = [];
  $("body *").each((_, el) => {
    const t = clean($(el).text());
    if (t && t.length > 2) blocks.push(t);
  });
  const lines = blocks.join("\n").split(/\n+/g).map(clean).filter(Boolean);

  const coursePattern = /\b([A-Z]{3,5})\s?-?\s?(\d{3,4}[A-Z]?)\b/;
  const courses = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(coursePattern);
    if (!m) continue;
    const code = `${m[1]} ${m[2]}`;
    const tail = line.slice(m.index + m[0].length).trim();
    const titleGuess = tidyTitle(tail) || tidyTitle(lines[i+1] || "");
    const credits = detectCredits(line) ?? detectCredits(lines[i+1]) ?? null;

    // look ahead for prereqs
    const prereqs = [];
    for (let j = i; j < Math.min(i+6, lines.length); j++) {
      const L = lines[j];
      const mm = L.match(/\bPrereq(?:uisite)?s?:?\s*(.+)$/i);
      if (mm) {
        const raw = mm[1]
          .replace(/\.$/,"")
          .replace(/\band\b/gi, ",")
          .replace(/\bor\b/gi, ",")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);
        raw.forEach(r => {
          const cm = r.match(coursePattern);
          if (cm) prereqs.push(`${cm[1]} ${cm[2]}`);
        });
        break;
      }
    }

    if (!courses.some(c => norm(c.code) === norm(code))) {
      courses.push({ code, title: titleGuess || "(title unavailable)", credits, prereqs, offered: [] });
    }
  }

  return {
    program: {
      key: programKey(title, year),
      name: title,
      catalog_year: year,
      total_hours: null,
      min_grade_major: null,
      rules: []
    },
    courses,
    groups: [],
    source_url: url
  };
}

// helpers
function clean(s){ return String(s||"").replace(/\u00A0/g," ").replace(/\s+/g," ").trim(); }
function norm(s){ return String(s||"").replace(/\s+/g,"").toUpperCase(); }
function detectYear(text){
  const m = text.match(/\b(20\d{2})\s?[–-]\s?(20\d{2})\b/);
  return m ? `${m[1]}-${m[2]}` : null;
}
function tidyTitle(s){
  if(!s) return "";
  let t = s.replace(/^[\-\—:\.]+/, "").trim();
  if(/^Prereq/i.test(t)) return "";
  if(t.length > 140) t = t.slice(0,140);
  return t;
}
function detectCredits(s){
  if(!s) return null;
  const m1 = s.match(/\((\d{1,2})\s*(?:hrs?|hours?|credits?)\)/i);
  if (m1) return Number(m1[1]);
  const m2 = s.match(/\b(\d{1,2})\s*(?:credit|credits|hrs?|hours?)\b/i);
  if (m2) return Number(m2[1]);
  return null;
}
function programKey(name, year){
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^\-+|\-+$/g,"");
  return `${base}-${(year||"").replace(/[^0-9\-]/g,"")}`.slice(0, 60);
}
async function fetchHTML(url){
  const res = await axios.get(url, { headers: { "User-Agent":"CatalogScraper/1.0" }, timeout: 20000 });
  return res.data;
}
