// server/server.js
// Tiny offline backend: serves IT catalog + Core/GenEd from JSON files.
// Endpoints:
//   GET /api/catalog/it-bs?year=YYYY-YYYY   -> returns {program, mode:'snapshot', courses, years}
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

// GET Communication catalog
app.get("/api/catalog/comm-bs", (req, res) => {
  try {
    const COMM_FILE = path.join(DATA_DIR, "comm-bs-catalog.json");
    const raw = readJson(COMM_FILE);
    const { program, courses } = raw;
    
    res.json({
      program: program || {},
      courses: courses || [],
      mode: "snapshot",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load Communication catalog" });
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
    try {
      if (programKey === 'it-bs-2024-25') {
        const itData = readJson(path.join(DATA_DIR, "it-bs-catalog.json"));
        catalogData = itData;
      } else if (programKey === 'comm-bs-2024-25') {
        const commData = readJson(path.join(DATA_DIR, "comm-bs-catalog.json"));
        catalogData = commData;
      }
    } catch (catalogError) {
      console.log('Catalog not found, proceeding with limited data');
    }
    
    const advice = await getAcademicAdvice(question, catalogData, [], degreeProgram);
    
    res.json({
      success: true,
      advice: advice,
      timestamp: new Date().toISOString(),
      model: 'claude-sonnet-4',
      program: degreeProgram
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

// serve nothing else – this server is data-only
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Catalog backend with Claude AI on http://localhost:${PORT}`);
});
