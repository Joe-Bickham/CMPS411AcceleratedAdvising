import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { PROGRAMS } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRAPY_PROJECT_DIR = path.join(__dirname, "..", "scrapy_catalog");

async function runScrapyCommand(args) {
  try {
    return await spawnOnce("scrapy", args);
  } catch (err) {
    if (err.code === "ENOENT") {
      const pythonCmd = process.platform.startsWith("win") ? "python" : "python3";
      return spawnOnce(pythonCmd, ["-m", "scrapy", ...args]);
    }
    throw err;
  }
}

function spawnOnce(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: SCRAPY_PROJECT_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const message = stderr.trim() || `Scrapy exited with code ${code}`;
        const err = new Error(message);
        err.code = code;
        reject(err);
      }
    });
  });
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (error) {
    return [];
  } finally {
    try {
      await fs.unlink(filePath);
    } catch {}
  }
}

export async function scrapeProgramWithScrapy(programKey, programConfig = PROGRAMS[programKey]) {
  if (!programConfig) {
    throw new Error(`scrapy: unknown program key ${programKey}`);
  }

  const hint = programConfig.scrapyHint || programConfig.name || programKey;
  const catoids = Array.isArray(programConfig.scrapyCatoids) ? programConfig.scrapyCatoids.join(",") : "";
  const tmpFile = path.join(os.tmpdir(), `scrapy-program-${programKey}-${randomUUID()}.json`);
  const args = ["crawl", "programs"];
  if (catoids) {
    args.push("-a", `catoids=${catoids}`);
  }
  args.push(
    "-a",
    "include_courses=1",
    "-a",
    `program_key=${programKey}`,
    "-a",
    `program_hint=${hint}`,
    "-O",
    tmpFile,
    "--loglevel",
    "ERROR"
  );

  await runScrapyCommand(args);
  const data = await readJsonArray(tmpFile);
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) {
    throw new Error(`scrapy: no catalog data returned for ${programKey}`);
  }
  return first;
}

export async function scrapeProgramIndexWithScrapy(options = {}) {
  const tmpFile = path.join(os.tmpdir(), `scrapy-program-index-${randomUUID()}.json`);
  const args = ["crawl", "programs"];
  if (options.catoids && options.catoids.length) {
    const catoidStr = Array.isArray(options.catoids) ? options.catoids.join(",") : String(options.catoids);
    args.push("-a", `catoids=${catoidStr}`);
  }
  if (options.maxPrograms) {
    args.push("-a", `max_programs=${options.maxPrograms}`);
  }
  args.push("-a", "include_courses=0", "-O", tmpFile, "--loglevel", "ERROR");
  await runScrapyCommand(args);
  return readJsonArray(tmpFile);
}
