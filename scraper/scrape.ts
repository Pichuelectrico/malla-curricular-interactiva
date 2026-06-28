/**
 * USFQ Curriculum Scraper
 *
 * Fetches curricula from:
 *   https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ/DetalleMallaCurricular/DetalleMalla?codigoCarrera={CODE}&out=1
 *
 * Prerequisites are retrieved by calling the dedicated endpoint that backs the
 * "pre" icon on each course row:
 *   /MallaCurricular-USFQ/DetalleMallaCurricular/PreRequisitos?materia=…&area=…&curso=…&codigoMalla=…
 *
 * Outputs JSON files to ./output/Malla-{CODE}.json matching the project schema.
 *
 * Usage:
 *   bun run setup              # first-time setup (install deps + browser)
 *   bun run scrape:dry         # list URLs only
 *   bun run scrape:career CMP  # single career
 *   bun run scrape             # all careers
 */

import "./setup-env.js";
import { ensureBrowsersInstalled } from "./setup-env.js";
import { chromium, type Page } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const BASE_URL = "https://wsexternal.usfq.edu.ec/MallaCurricular-USFQ";
const MALLA_URL = `${BASE_URL}/DetalleMallaCurricular/DetalleMalla`;
const PREREQ_URL = `${BASE_URL}/DetalleMallaCurricular/PreRequisitos`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Course {
  id: string;
  code: string;
  title: string;
  description: string;
  credits: number;
  semester: number;
  block: string;
  area: string;
  type: "obligatoria" | "electiva" | "optativa";
  prerequisites: string[];
  alternatives: string[];
}

interface CurriculumData {
  source_file: string;
  "Last-Modified": string;
  courses: Course[];
}

interface CareerEntry {
  code: string;
  codigoCarrera: string;
  name: string;
}

// Prereq data extracted from the onclick attr
interface PrereqParams {
  materia: string;
  area: string;
  curso: string;
  codigoMalla: string;
}

// Raw course data scraped from the main table
interface RawCourse {
  code: string;
  title: string;
  credits: string;
  onclick: string;
  semester: number;
  block: string;
}

// ─── Known careers ────────────────────────────────────────────────────────────
// codigoCarrera for USFQ API = "1" + code (e.g. BTC → 1BTC)
const KNOWN_CAREERS: CareerEntry[] = [
  { code: "ADM", name: "Administración de Empresas" },
  { code: "ANT", name: "Antropología" },
  { code: "ARQ", name: "Arquitectura" },
  { code: "ARV", name: "Artes Visuales" },
  { code: "BTC", name: "Ingeniería en Biotecnología" },
  { code: "CIN", name: "Cine" },
  { code: "CMC", name: "Composición para Medios Contemporáneos" },
  { code: "CMP", name: "Ingeniería en Ciencias de la Computación" },
  { code: "EMC", name: "Ejecución de Música Contemporánea" },
  { code: "COM", name: "Comunicación" },
  { code: "JUR", name: "Derecho" },
  { code: "DIC", name: "Diseño Gráfico: Diseño Comunicacional" },
  { code: "ECO", name: "Economía" },
  { code: "EDU", name: "Educación" },
  { code: "FIN", name: "Finanzas" },
  { code: "FIS", name: "Física" },
  { code: "GST", name: "Gastronomía" },
  { code: "HSP", name: "Hospitalidad y Hotelería" },
  { code: "AGE", name: "Ingeniería en Agroempresa" },
  { code: "ALI", name: "Ingeniería en Alimentos" },
  { code: "ICV", name: "Ingeniería Civil" },
  { code: "IEL", name: "Ingeniería en Electrónica y Automatización" },
  { code: "IIN", name: "Ingeniería Industrial" },
  { code: "IME", name: "Ingeniería Mecánica" },
  { code: "INQ", name: "Ingeniería Química" },
  { code: "LIT", name: "Literatura" },
  { code: "MAC", name: "Ingeniería en Matemáticas Aplicadas y Computación" },
  { code: "MAK", name: "Marketing" },
  { code: "MAT", name: "Matemática" },
  { code: "MED", name: "Medicina" },
  { code: "VET", name: "Medicina Veterinaria" },
  { code: "NIT", name: "Negocios Internacionales" },
  { code: "NUT", name: "Nutrición y Dietética" },
  { code: "ODT", name: "Odontología" },
  { code: "PER", name: "Periodismo" },
  { code: "POL", name: "Ciencias Políticas" },
  { code: "PSI", name: "Psicología" },
  { code: "PSC", name: "Psicología Clínica" },
  { code: "PUB", name: "Publicidad" },
].map(({ code, name }) => ({ code, name, codigoCarrera: `1${code}` }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse `openModalPreRequisitos('materia', 'area', 'curso', 'codigoMalla')` */
function parseOnclick(onclick: string): PrereqParams | null {
  const m = onclick.match(
    /openModalPreRequisitos\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/
  );
  if (!m) return null;
  return { materia: m[1], area: m[2], curso: m[3], codigoMalla: m[4] };
}

/** Spanish title: split on two+ spaces (bilingual separator) and take the first part */
function extractSpanishTitle(raw: string): string {
  const parts = raw.split(/\s{2,}/);
  return parts[0].trim();
}

/** Parse credits from Spanish decimal notation "3,00" → 3 */
function parseCredits(raw: string): number {
  const n = parseFloat(raw.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Infer course area (department prefix) from code "CMP 1001" → "CMP" */
function areaFromCode(code: string): string {
  return code.split(/\s+/)[0] ?? code;
}

/** Infer course type from code */
function inferType(code: string): Course["type"] {
  const upper = code.toUpperCase();
  if (upper.startsWith("ELECTIVA") || upper.startsWith("ELEC")) return "electiva";
  if (upper.startsWith("OPT") || upper.startsWith("HUM") || upper.startsWith("ARTE") ||
      upper.startsWith("CCSS") || upper.startsWith("ECL") || upper.startsWith("NUT")) return "optativa";
  return "obligatoria";
}

// ─── Prerequisites fetching ───────────────────────────────────────────────────

/**
 * Fetch the prerequisites for a course via the dedicated AJAX endpoint.
 * Returns { prerequisites, alternatives } in the app's format:
 *   - prerequisites: array of course codes or "A || B" strings
 *   - alternatives: always [] (OR logic encoded in the string instead)
 */
async function fetchPrerequisites(
  page: Page,
  params: PrereqParams
): Promise<{ prerequisites: string[]; alternatives: string[] }> {
  const url = new URL(PREREQ_URL);
  url.searchParams.set("materia", params.materia);
  url.searchParams.set("area", params.area);
  url.searchParams.set("curso", params.curso);
  url.searchParams.set("codigoMalla", params.codigoMalla);

  let html: string;
  try {
    const resp = await page.request.get(url.toString(), { timeout: 15_000 });
    html = await resp.text();
  } catch {
    return { prerequisites: [], alternatives: [] };
  }

  // No prerequisites marker
  if (html.includes("NO EXISTEN PRERREQUISITOS")) {
    return { prerequisites: [], alternatives: [] };
  }

  // Parse the prerequisites table from HTML using a regex approach
  // Table structure per row: [empty, OR_or_empty, dept, number, name, grade, empty]
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { prerequisites: [], alternatives: [] };

  const tbody = tbodyMatch[1];
  const rowMatches = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];

  const groups: string[][] = [];

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      m[1].replace(/&[a-z]+;/g, (e) =>
        e === "&amp;" ? "&" : e === "&nbsp;" ? " " : e === "&#243;" ? "ó" : e
      ).trim()
    );

    if (cells.length < 4) continue;

    const isOr = cells[1]?.toUpperCase().trim() === "OR";
    const dept = cells[2]?.trim();
    const num = cells[3]?.trim();

    if (!dept || !num) continue;

    const courseCode = `${dept}${num}`; // e.g. "CMP1101"

    if (isOr && groups.length > 0) {
      // Extend the last group with an OR alternative
      groups[groups.length - 1].push(courseCode);
    } else {
      // Start a new prerequisite group
      groups.push([courseCode]);
    }
  }

  // Convert groups to prerequisite strings:
  // Single-item group → just the code; multi-item group → joined with " || "
  const prerequisites = groups.map((g) => g.join(" || "));

  return { prerequisites, alternatives: [] };
}

async function fetchHtml(page: Page, url: string, retries = 3): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await page.request.get(url, { timeout: 120_000 });
      if (!resp.ok()) {
        throw new Error(`HTTP ${resp.status()} ${resp.statusText()}`);
      }
      const html = await resp.text();
      if (!html.includes("<") || html.length < 500) {
        throw new Error("Response too short or not HTML");
      }
      return html;
    } catch (err) {
      lastError = err as Error;
      console.warn(`  Attempt ${attempt}/${retries} failed: ${lastError.message}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

// ─── Main malla scraper ───────────────────────────────────────────────────────

/**
 * Scrape the malla page and return raw course rows with semester assignments.
 * Uses document-order traversal tracking H4 (year) and TH with "SEMESTRE"/"VERANO"
 * as semester boundary markers.
 */
async function scrapeRawCourses(page: Page, url: string): Promise<RawCourse[]> {
  const html = await fetchHtml(page, url);
  await page.setContent(html, { waitUntil: "domcontentloaded" });

  return page.evaluate(() => {
    interface RawRow {
      code: string;
      title: string;
      credits: string;
      onclick: string;
      semester: number;
      block: string;
    }

    const rows: RawRow[] = [];
    let semesterCounter = 0;
    let regularSemesterCounter = 0;
    let veranoCounter = 0;
    let currentBlock = "";

    const allEls = Array.from(
      document.body.querySelectorAll("h1,h2,h3,h4,h5,h6,th,tr")
    ) as HTMLElement[];

    for (const el of allEls) {
      const tag = el.tagName;
      const text = el.textContent?.trim() ?? "";

      // H4 = new year (reset nothing, just context)
      if (["H1","H2","H3","H4","H5","H6"].includes(tag) && /AÑO/i.test(text)) {
        // year change — semester counter continues across years
        continue;
      }

      // TH containing "SEMESTRE"/"VERANO" = new semester slot in document order
      if (tag === "TH") {
        if (/VERANO|SUMMER/i.test(text)) {
          semesterCounter++;
          veranoCounter++;
          currentBlock = veranoCounter > 1 ? `Verano ${veranoCounter}` : "Verano";
        } else if (/SEMESTRE|SEMESTER/i.test(text)) {
          semesterCounter++;
          regularSemesterCounter++;
          currentBlock = `Semestre ${regularSemesterCounter}`;
        }
        continue;
      }

      // TR in a TBODY = course row
      if (tag === "TR" && el.parentElement?.tagName === "TBODY") {
        const cells = Array.from(el.querySelectorAll("td")).map(
          (td) => td.textContent?.trim() ?? ""
        );
        if (cells.length < 2) continue;

        const code = cells[0];
        const rawTitle = cells[1];
        const rawCredits = cells[2] ?? "";

        // Skip TOTAL rows and empty rows
        if (!code || rawTitle === "TOTAL" || code === "" || /^INGENIERÍA|^ADMINISTRACIÓN|^ECONOMÍA/i.test(rawTitle)) {
          continue;
        }

        const img = el.querySelector(
          "img[onclick*='openModalPreRequisitos']"
        ) as HTMLImageElement | null;
        const onclick = img?.getAttribute("onclick") ?? "";

        // Skip rows without a pre-icon (e.g., credit summary rows)
        if (!onclick) continue;

        rows.push({
          code,
          title: rawTitle,
          credits: rawCredits,
          onclick,
          semester: semesterCounter || 1,
          block: currentBlock || "Semestre 1",
        });
      }
    }

    return rows;
  });
}

// ─── Full career scraper ──────────────────────────────────────────────────────

async function scrapeMalla(
  page: Page,
  codigoCarrera: string,
  careerCode: string
): Promise<Course[]> {
  const url = `${MALLA_URL}?codigoCarrera=${codigoCarrera}&out=1`;
  console.log(`  → Scraping malla: ${url}`);

  const rawRows = await scrapeRawCourses(page, url);
  console.log(`  → Found ${rawRows.length} course rows`);

  const courses: Course[] = [];

  for (const row of rawRows) {
    const params = parseOnclick(row.onclick);
    if (!params) continue;

    const { prerequisites, alternatives } = params
      ? await fetchPrerequisites(page, params)
      : { prerequisites: [], alternatives: [] };

    const credits = parseCredits(row.credits);
    const title = extractSpanishTitle(row.title);
    const area = areaFromCode(row.code);

    courses.push({
      id: row.code.replace(/\s+/g, ""),  // e.g. "CMP1001"
      code: row.code,                     // e.g. "CMP 1001"
      title,
      description: "",
      credits,
      semester: row.semester,
      block: row.block,
      area,
      type: inferType(row.code),
      prerequisites,
      alternatives,
    });
  }

  return courses;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const careerIdx = args.indexOf("--career");
  const specificCareer = careerIdx !== -1 ? args[careerIdx + 1]?.toUpperCase() : null;

  const targets = specificCareer
    ? KNOWN_CAREERS.filter((c) => c.code === specificCareer)
    : KNOWN_CAREERS;

  if (targets.length === 0) {
    console.error(`No career found with code "${specificCareer}".`);
    console.error(`Known codes: ${KNOWN_CAREERS.map((c) => c.code).join(", ")}`);
    process.exit(1);
  }

  if (isDryRun) {
    console.log("=== DRY RUN — URLs only, no files written ===\n");
    for (const c of targets) {
      console.log(`${c.code.padEnd(10)} ${MALLA_URL}?codigoCarrera=${c.codigoCarrera}&out=1`);
    }
    return;
  }

  ensureBrowsersInstalled();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true }).catch((err) => {
    console.error("Could not launch Chromium:", (err as Error).message);
    console.error("Run: bun run install-browsers");
    process.exit(1);
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const summary: { code: string; status: "ok" | "error" | "empty"; courses: number }[] = [];

  for (const career of targets) {
    console.log(`\n[${career.code}] ${career.name}`);
    try {
      const courses = await scrapeMalla(page, career.codigoCarrera, career.code);

      if (courses.length === 0) {
        console.warn(`  ⚠ No courses found — career code may be incorrect.`);
        summary.push({ code: career.code, status: "empty", courses: 0 });
        continue;
      }

      const output: CurriculumData = {
        source_file: `Malla-academica-${career.code}`,
        "Last-Modified": new Date().toISOString(),
        courses,
      };

      const outPath = join(OUTPUT_DIR, `Malla-${career.code}.json`);
      writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
      console.log(`  ✓ Wrote ${courses.length} courses → ${outPath}`);
      summary.push({ code: career.code, status: "ok", courses: courses.length });
    } catch (err) {
      console.error(`  ✗ Error: ${(err as Error).message}`);
      summary.push({ code: career.code, status: "error", courses: 0 });
    }
  }

  await browser.close();

  console.log("\n=== Summary ===");
  for (const r of summary) {
    const icon = r.status === "ok" ? "✓" : r.status === "empty" ? "⚠" : "✗";
    console.log(`${icon} ${r.code.padEnd(10)} ${r.courses} courses`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
