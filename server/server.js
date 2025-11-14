// server/server.js
// Backend: serves catalog data from web scraper + Core/GenEd from JSON files.
// Endpoints:
//   GET /api/catalog/it-bs?year=YYYY-YYYY   -> returns {program, mode:'dynamic', courses, years}
//   GET /api/core                           -> returns {courses}
//   POST /api/claude/advice                 -> returns AI academic advice
//   POST /api/claude/timeline               -> returns degree timeline
//   POST /api/claude/recommendations        -> returns course recommendations

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { getAcademicAdvice, generateDegreeTimeline, getCourseRecommendations, analyzeCreditFulfillment } from './claude-service.js';
import { resolveLatestCatalogUrl, discoverLatestProgramUrl } from "./resolver.js";
import { scrapeCatalogFromUrl } from "./scraper.js";
import { getCache, setCache } from "./cache.js";
import { PROGRAMS } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend (google-signin-project) from the same server/port
const FRONT_DIR = path.join(__dirname, "../google-signin-project");
app.use(express.static(FRONT_DIR));

// local data
const DATA_DIR = path.join(__dirname, "data");
const CORE_FILE = path.join(DATA_DIR, "core-gened.json");
const CJ_FILE = path.join(DATA_DIR, "cj-bs-catalog.json");

// helper to read JSON
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// helper to read JSON from file or fallback to default
function readJsonWithFallback(filePath, defaultValue = null) {
  try {
    return readJson(filePath);
  } catch (error) {
    console.warn(`Could not read ${filePath}, using default value`);
    return defaultValue;
  }
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
app.get("/api/catalog/it-bs", async (req, res) => {
  try {
    // Try to get from web scraper first
    const programKey = "it-bs";
    const cacheKey = `model:${programKey}`;
    let catalogData = getCache(cacheKey);
    
    if (!catalogData) {
      try {
        // Try to get from web
        const url = await resolveLatestCatalogUrl(programKey);
        catalogData = await scrapeCatalogFromUrl(url);
        setCache(cacheKey, catalogData, 6 * 60 * 60 * 1000); // Cache for 6 hours
        console.log(`Loaded IT catalog from web: ${url}`);
      } catch (webError) {
        console.warn("Failed to load IT catalog from web:", webError.message);
        // Fallback to local file
        const IT_FILE = path.join(DATA_DIR, "it-bs-catalog.json");
        catalogData = readJsonWithFallback(IT_FILE, { program: null, courses: [], years: {} });
        console.log("Loaded IT catalog from local file");
      }
    }
    
    const { program, years } = catalogData;
    const courses = catalogData.courses && catalogData.courses.length
      ? catalogData.courses
      : flattenYears(years);

    // you can pass ?year=2024-2025 (we still return all courses, but the client can highlight)
    const yearParam = req.query.year || program?.catalog_year || null;

    res.json({
      program: { ...(program || {}), selected_year: yearParam },
      years: years || {},
      courses: dedupeByCode(courses),
      mode: catalogData._source === "web" ? "dynamic" : "snapshot",
      source: catalogData._source || "unknown"
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load IT catalog" });
  }
});

// GET Communication catalog
app.get("/api/catalog/comm-bs", async (req, res) => {
  try {
<<<<<<< HEAD
    // Try to get from web scraper first
    const programKey = "comm-bs";
    const cacheKey = `model:${programKey}`;
    let catalogData = getCache(cacheKey);
    
    if (!catalogData) {
      try {
        // Try to get from web
        const url = await resolveLatestCatalogUrl(programKey);
        catalogData = await scrapeCatalogFromUrl(url);
        catalogData._source = "web";
        setCache(cacheKey, catalogData, 6 * 60 * 60 * 1000); // Cache for 6 hours
        console.log(`Loaded Communication catalog from web: ${url}`);
      } catch (webError) {
        console.warn("Failed to load Communication catalog from web:", webError.message);
        // Fallback to local file
        const COMM_FILE = path.join(DATA_DIR, "comm-bs-catalog.json");
        catalogData = readJsonWithFallback(COMM_FILE, { program: null, courses: [], years: {} });
        catalogData._source = "local";
        console.log("Loaded Communication catalog from local file");
      }
    }
    
    const { program, courses } = catalogData;
    
=======
    const COMM_FILE = path.join(DATA_DIR, "comm-bs-catalog.json");
    const raw = readJson(COMM_FILE);
    const { program, courses } = raw;

>>>>>>> new-criminal-justice-page
    res.json({
      program: program || {},
      courses: courses || [],
      mode: catalogData._source === "web" ? "dynamic" : "snapshot",
      source: catalogData._source || "unknown"
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load Communication catalog" });
  }
});

// GET Criminal Justice catalog
app.get("/api/catalog/cj-bs", (req, res) => {
  try {
    const raw = readJson(CJ_FILE);
    const { program, courses, groups } = raw;

    res.json({
      program: program || {},
      courses: courses || [],
      groups: groups || [],
      mode: "snapshot",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load Criminal Justice catalog" });
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

// Claude AI endpoints
app.post("/api/claude/advice", async (req, res) => {
  try {
    const { question, courseData, completedCourses } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const advice = await getAcademicAdvice(question, courseData || {}, completedCourses || []);
    
    res.json({
      success: true,
      advice: advice,
      timestamp: new Date().toISOString(),
      model: 'claude-3-5-sonnet'
    });
  } catch (error) {
    console.error('Claude advice error:', error);
    res.status(500).json({
      error: 'Failed to get AI advice',
      fallback: 'Please try asking about specific courses or prerequisites.'
    });
  }
});

app.post("/api/claude/timeline", async (req, res) => {
  try {
    const { completedCourses, courseData, startingSemester, targetGraduation } = req.body;
    
    const timeline = await generateDegreeTimeline(
      completedCourses || [],
      courseData || {},
      startingSemester || 'Fall',
      targetGraduation
    );
    
    res.json({
      success: true,
      timeline: timeline,
      timestamp: new Date().toISOString(),
      model: 'claude-3-5-sonnet'
    });
  } catch (error) {
    console.error('Claude timeline error:', error);
    res.status(500).json({
      error: 'Failed to generate timeline',
      fallback: 'Please try the basic course suggestion feature.'
    });
  }
});

app.post("/api/claude/recommendations", async (req, res) => {
  try {
    const { completedCourses, courseData, currentSemester } = req.body;
    
    const recommendations = await getCourseRecommendations(
      completedCourses || [],
      courseData || {},
      currentSemester || 'Fall'
    );
    
    res.json({
      success: true,
      recommendations: recommendations,
      timestamp: new Date().toISOString(),
      model: 'claude-3-5-sonnet'
    });
  } catch (error) {
    console.error('Claude recommendations error:', error);
    res.status(500).json({
      error: 'Failed to get recommendations',
      fallback: 'Please try the basic course suggestion feature.'
    });
  }
});

// Degree-specific Claude AI endpoint
app.post("/api/claude/degree-specific", async (req, res) => {
  try {
    const { question, degreeProgram, programKey } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Load appropriate catalog based on program
    let catalogData = {};
<<<<<<< HEAD
    let programSlug = '';
    
    if (programKey === 'it-bs-2024-25' || programKey === 'it-bs') {
      programSlug = 'it-bs';
    } else if (programKey === 'comm-bs-2024-25' || programKey === 'comm-bs') {
      programSlug = 'comm-bs';
    }
    
    if (programSlug) {
      // Try to get from cache first
      const cacheKey = `model:${programSlug}`;
      catalogData = getCache(cacheKey);
      
      if (!catalogData) {
        try {
          // Try to get from web
          const url = await resolveLatestCatalogUrl(programSlug);
          catalogData = await scrapeCatalogFromUrl(url);
          setCache(cacheKey, catalogData, 6 * 60 * 60 * 1000); // Cache for 6 hours
          console.log(`Loaded ${programSlug} catalog from web for Claude AI`);
        } catch (webError) {
          console.warn(`Failed to load ${programSlug} catalog from web:`, webError.message);
          // Fallback to local file
          try {
            const filePath = path.join(DATA_DIR, `${programSlug.replace('-', '-')}-catalog.json`);
            catalogData = readJson(filePath);
            console.log(`Loaded ${programSlug} catalog from local file for Claude AI`);
          } catch (fileError) {
            console.log('Catalog not found, proceeding with limited data');
          }
        }
=======
    try {
      if (programKey === 'it-bs-2024-25') {
        const itData = readJson(path.join(DATA_DIR, "it-bs-catalog.json"));
        catalogData = itData;
      } else if (programKey === 'comm-bs-2024-25') {
        const commData = readJson(path.join(DATA_DIR, "comm-bs-catalog.json"));
        catalogData = commData;
      } else if (programKey === 'cj-bs-2024-25') {
        const cjData = readJson(path.join(DATA_DIR, "cj-bs-catalog.json"));
        catalogData = cjData;
>>>>>>> new-criminal-justice-page
      }
    }
    
    const advice = await getAcademicAdvice(question, catalogData, [], degreeProgram);
    
    res.json({
      success: true,
      advice: advice,
      timestamp: new Date().toISOString(),
      model: 'claude-3-5-sonnet',
      program: degreeProgram,
      dataSource: catalogData._source || 'unknown'
    });
  } catch (error) {
    console.error('Claude degree-specific advice error:', error);
    res.status(500).json({
      error: 'Failed to get AI advice',
      fallback: 'Please try again later.'
    });
  }
});

// Credit Analysis endpoint
app.post("/api/claude/credit-analysis", async (req, res) => {
  try {
    const { actScores, transferCredits, dualEnrollmentCredits, courseData, degreeProgram } = req.body;
    
    const analysis = await analyzeCreditFulfillment(
      actScores,
      transferCredits,
      dualEnrollmentCredits,
      courseData || {},
      degreeProgram || ''
    );
    
    res.json({
      success: true,
      analysis: analysis,
      timestamp: new Date().toISOString(),
      model: 'claude-3-5-sonnet'
    });
  } catch (error) {
    console.error('Claude credit analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze credits',
      fallback: 'Please try again later or contact an advisor.'
    });
  }
});

// Background refresh every 12h
const KEYS = Object.keys(PROGRAMS);
setInterval(async () => {
  for (const k of KEYS) {
    try {
      const url = await resolveLatestCatalogUrl(k);
      const model = await scrapeCatalogFromUrl(url);
      model._source = "web";
      setCache(`model:${k}`, model, 12 * 60 * 60 * 1000);
      console.log(`[refresh] ${k} ok from ${url} (${model.courses?.length || 0} courses)`);
    } catch (e) {
      console.warn(`[refresh] ${k} failed:`, e?.message || e);
    }
  }
}, 12 * 60 * 60 * 1000);

// serve nothing else – this server is data-only
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Catalog backend with Claude AI on http://localhost:${PORT}`);
<<<<<<< HEAD
  console.log(`Using web scraper for dynamic catalog data when available`);
});
=======
});
>>>>>>> new-criminal-justice-page
