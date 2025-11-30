// Base config for Southeastern URLs + program slugs you want to support.
export const BASE = {
  origin: "https://www.southeastern.edu",          // change if domain differs
  // Seeds to probe for the newest year. Add more as you learn the site.
  seeds: [
    "/acad_catalog/2024_2025/undergraduate/curricula_and_courses/programs/it.html",
    "/acad_catalog/2023_2024/undergraduate/curricula_and_courses/programs/it.html",
    "/acad_catalog/2022_2023/undergraduate/curricula_and_courses/programs/it.html",
    // fallback program portal (sometimes has links to the year's curriculum)
    "/academics/programs/information-technology/index.html"
  ]
};

// Map short keys your frontend can call → resolver hints.
export const PROGRAMS = {
  "it-bs": {
    name: "Information Technology, BS",
    // Hints: path segments or keywords that help resolver pick correct page
    hints: ["information technology", "it", "bs"],
    // optional hardcoded candidates beyond BASE.seeds
    candidates: []
  },
  "comm-bs": {
    name: "Communication, BS",
    hints: ["communication", "comm", "bs"],
    candidates: []
  },
  "cj-bs": {
    name: "Criminal Justice, BS",
    hints: ["criminal justice", "cj", "bs"],
    candidates: []
  }
};
