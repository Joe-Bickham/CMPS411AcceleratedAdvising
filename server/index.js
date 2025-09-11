import express from "express";
import cors from "cors";
import { PROGRAMS } from "./config.js";
import { resolveLatestCatalogUrl } from "./resolver.js";
import { scrapeCatalogFromUrl } from "./scraper.js";
import { getCache, setCache } from "./cache.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Resolve + scrape by program key (no URL needed from frontend)
app.get("/api/catalog/:programKey", async (req, res) => {
  try {
    const { programKey } = req.params;
    if (!PROGRAMS[programKey]) return res.status(404).json({ error: "Unknown program key" });

    // cache the final model for 6 hours
    const cacheKey = `model:${programKey}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const url = await resolveLatestCatalogUrl(programKey);
    const model = await scrapeCatalogFromUrl(url);
    setCache(cacheKey, model, 6 * 60 * 60 * 1000);
    res.json(model);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Optional: force refresh
app.post("/api/catalog/:programKey/refresh", async (req, res) => {
  try {
    const { programKey } = req.params;
    const url = await resolveLatestCatalogUrl(programKey);
    const model = await scrapeCatalogFromUrl(url);
    // shorter cache on manual refresh
    setCache(`model:${programKey}`, model, 2 * 60 * 60 * 1000);
    res.json({ refreshed: true, from: url, courses: model.courses?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// Background refresh every 12h
const KEYS = Object.keys(PROGRAMS);
setInterval(async () => {
  for (const k of KEYS) {
    try {
      const url = await resolveLatestCatalogUrl(k);
      const model = await scrapeCatalogFromUrl(url);
      setCache(`model:${k}`, model, 12 * 60 * 60 * 1000);
      console.log(`[refresh] ${k} ok from ${url} (${model.courses?.length || 0} courses)`);
    } catch (e) {
      console.warn(`[refresh] ${k} failed:`, e?.message || e);
    }
  }
}, 12 * 60 * 60 * 1000);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Catalog backend on http://localhost:${PORT}`));
