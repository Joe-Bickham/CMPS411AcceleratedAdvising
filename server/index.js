import express from "express";
import cors from "cors";
import { PROGRAMS } from "./config.js";
import { resolveLatestCatalogUrl, discoverLatestProgramUrl } from "./resolver.js";
import { scrapeCatalogFromUrl } from "./scraper.js";
import { scrapeProgramWithScrapy, scrapeProgramIndexWithScrapy } from "./scrapy-runner.js";
import { getCache, setCache } from "./cache.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

async function getProgramCatalogUrl(programKey) {
  if (PROGRAMS[programKey]) {
    try {
      return await discoverLatestProgramUrl(programKey);
    } catch (err) {
      console.warn(`[resolver] discoverLatestProgramUrl failed for ${programKey}: ${err?.message || err}`);
    }
  }
  return resolveLatestCatalogUrl(programKey);
}

async function fetchCatalog(programKey, options = {}) {
  const cacheKey = `model:${programKey}`;
  if (!options.force) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }

  let model = null;
  try {
    model = await scrapeProgramWithScrapy(programKey);
  } catch (err) {
    console.warn(`[scrapy:index] ${programKey} failed`, err?.message || err);
  }

  if (!model) {
    const url = await getProgramCatalogUrl(programKey);
    model = await scrapeCatalogFromUrl(url);
  }

  setCache(cacheKey, model, (options.ttl ?? (6 * 60 * 60 * 1000)));
  return model;
}

async function fetchProgramList(force = false) {
  const cacheKey = "programIndex";
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }
  let list = [];
  try {
    list = await scrapeProgramIndexWithScrapy();
  } catch (err) {
    console.warn("[scrapy:index] program list failed", err?.message || err);
  }
  setCache(cacheKey, list, 6 * 60 * 60 * 1000);
  return list;
}

// Resolve + scrape by program key (no URL needed from frontend)
app.get("/api/catalog/:programKey", async (req, res) => {
  try {
    const { programKey } = req.params;
    if (!PROGRAMS[programKey]) return res.status(404).json({ error: "Unknown program key" });

    const model = await fetchCatalog(programKey);
    res.json(model);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// New: discover via Southeastern landing → current catalog → A–Z → program
app.get("/api/catalog/:programKey/latest", async (req, res) => {
  try {
    const { programKey } = req.params;
    if (!PROGRAMS[programKey]) return res.status(404).json({ error: "Unknown program key" });

    const model = await fetchCatalog(programKey, { force: true });
    res.json(model);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get("/api/catalog/programs", async (req, res) => {
  try {
    const list = await fetchProgramList(req.query.refresh === "1");
    res.json({ programs: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Optional: force refresh
app.post("/api/catalog/:programKey/refresh", async (req, res) => {
  try {
    const { programKey } = req.params;
    const model = await fetchCatalog(programKey, { force: true, ttl: 2 * 60 * 60 * 1000 });
    res.json({ refreshed: true, source: model.source_url, courses: model.courses?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Background refresh every 12h
const KEYS = Object.keys(PROGRAMS);
setInterval(async () => {
  for (const k of KEYS) {
    try {
      const model = await fetchCatalog(k, { force: true, ttl: 12 * 60 * 60 * 1000 });
      console.log(`[refresh] ${k} ok (${model.courses?.length || 0} courses)`);
    } catch (e) {
      console.warn(`[refresh] ${k} failed:`, e?.message || e);
    }
  }
}, 12 * 60 * 60 * 1000);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Catalog backend on http://localhost:${PORT}`));
