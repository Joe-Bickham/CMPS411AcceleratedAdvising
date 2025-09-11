// server/server.js
// Tiny offline backend: serves IT catalog + Core/GenEd from JSON files.
// Endpoints:
//   GET /api/catalog/it-bs?year=YYYY-YYYY   -> returns {program, mode:'snapshot', courses, years}
//   GET /api/core                           -> returns {courses}

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// local data
const DATA_DIR = path.join(__dirname, "data");
const IT_FILE = path.join(DATA_DIR, "it-bs-catalog.json");
const CORE_FILE = path.join(DATA_DIR, "core-gened.json");

// helper to read JSON
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// flatten all courses from a years/semesters structure
function flattenYears(years) {
  const out = [];
  Object.values(years || {}).forEach(semesters => {
    Object.values(semesters || {}).forEach(list => {
      (list || []).forEach(c => out.push(c));
    });
  });
  return dedupeByCode(out);
}

function dedupeByCode(list) {
  const seen = new Set();
  const out = [];
  for (const c of list || []) {
    const k = String(c.code || "").toUpperCase().replace(/\s+/g, "");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

// GET IT catalog (optionally ?year=YYYY-YYYY)
app.get("/api/catalog/it-bs", (req, res) => {
  try {
    const raw = readJson(IT_FILE); // { program, years:{}, courses?:[] }
    const { program, years } = raw;
    const courses = raw.courses && raw.courses.length
      ? raw.courses
      : flattenYears(years);

    // you can pass ?year=2024-2025 (we still return all courses, but the client can highlight)
    const yearParam = req.query.year || program?.catalog_year || null;

    res.json({
      program: { ...(program || {}), selected_year: yearParam },
      years: years || {},
      courses: dedupeByCode(courses),
      mode: "snapshot",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load IT catalog" });
  }
});

// GET Core/GenEd
app.get("/api/core", (req, res) => {
  try {
    const core = readJson(CORE_FILE); // { courses:[...] }
    res.json(core);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load core/gened" });
  }
});

// serve nothing else – this server is data-only
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Catalog backend on http://localhost:${PORT}`);
});
