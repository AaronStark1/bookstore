#!/usr/bin/env node
/**
 * Writes the reel's data, once, from the app's own sources (brief §4.2, §4.3). Read-only by
 * construction: it reads files, never starts or calls the backend, and never opens backend/.env.
 *
 *   node fixtures.mjs            # fixtures/books.json, fixtures/session.json, out/cache/covers.json
 *   node fixtures.mjs --fonts    # … and records the Google Fonts CSS + its woff2 files (one download)
 *
 * The specimens. The app's built-in module (frontend/src/data/fallbackCatalog.ts) is imported
 * straight into Node with Node's TypeScript type stripping (lib/ts-hooks.mjs resolves the app's
 * extensionless imports), so no Vite dev server is needed: port 5173 belongs to the user and is
 * never touched. Since the brief was written, the backend schema (models/bookModel.js) gained the
 * optional presentation fields `year`, `edition` and `design`, and backend/seed/specimens.json
 * (`npm run seed`) stocks a real database with these same twelve folios. So books.json is exactly
 * what a seeded backend returns: the seed's documents, each with a deterministic _id. Every field
 * is checked against the app's module first: the document fields, the year and edition, and that
 * the cover and spine the app draws from the stored `design` are identical to the specimen's own.
 *
 * Fixtures written (no tokens other than reel-demo-token, no emails other than the app's own
 * archive@bibliotheca-obscura.example and the demo collector@example.com):
 *   fixtures/books.json     GET /api/getBooks, as a seeded backend answers it
 *   fixtures/session.json   the demo session, and the login / makePayment response bodies
 *   out/cache/covers.json   the twelve cover data URIs (pre-decoded before filming)
 *   out/cache/fonts/        the app's Google Fonts stylesheet and woff2 files + manifest.json
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, promises as fs } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
export const FIXTURES = path.join(here, "fixtures");
export const CACHE = path.join(here, "out", "cache");
export const FONT_CACHE = path.join(CACHE, "fonts");
export const PREVIEW_ORIGIN = "http://localhost:5180";

export const DEMO = {
  token: "reel-demo-token",
  user: { username: "Demo Collector", email: "collector@example.com", role: "User" },
  password: "folio1955",
};
const ARCHIVE_MAIL = "archive@bibliotheca-obscura.example";
/** The volume the reel acquires: The Blue Hour, index 2 on the shelf. */
export const ACQUIRED_TITLE = "The Blue Hour";

/** The schema's paths, read from models/bookModel.js (read-only), in declaration order. */
export function schemaKeys() {
  const src = readFileSync(path.join(root, "backend", "models", "bookModel.js"), "utf8");
  const body = src.slice(src.indexOf("new mongoose.Schema({") + "new mongoose.Schema({".length, src.lastIndexOf("});"));
  // top-level keys only: two-space indent inside the schema literal
  return [...body.matchAll(/^ {2}([A-Za-z_]\w*)\s*:/gm)].map((m) => m[1]);
}

/** The app's own modules, imported read-only through Node's type stripping. */
async function appModules() {
  register("./lib/ts-hooks.mjs", import.meta.url);
  const src = (p) => pathToFileURL(path.join(root, "frontend", "src", p)).href;
  const [catalog, procedural, math] = await Promise.all([import(src("data/fallbackCatalog.ts")), import(src("lib/procedural.ts")), import(src("lib/math.ts"))]);
  return { FALLBACK_CATALOG: catalog.FALLBACK_CATALOG, ...procedural, hash32: math.hash32 };
}

const objectId = (title) => createHash("sha1").update(`bibliotheca-obscura-reel:${title}`).digest("hex").slice(0, 24);

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`  ${path.relative(here, file)}`);
}

async function books() {
  const app = await appModules();
  const seed = JSON.parse(readFileSync(path.join(root, "backend", "seed", "specimens.json"), "utf8"));
  const keys = schemaKeys();
  const problems = [];
  if (app.FALLBACK_CATALOG.length !== 12 || seed.length !== 12) problems.push(`expected 12 specimens, got ${app.FALLBACK_CATALOG.length} in the app and ${seed.length} in the seed`);
  const docs = seed.map((s, i) => {
    const sp = app.FALLBACK_CATALOG[i];
    const { _id, ...fields } = sp.doc;
    // 1. every document field equals the app's specimen
    for (const [k, v] of Object.entries(fields)) if (!isDeepStrictEqual(s[k], v)) problems.push(`${s.title}: seed ${k} = ${JSON.stringify(s[k])}, app ${JSON.stringify(v)}`);
    if (s.year !== sp.year || s.edition !== sp.edition) problems.push(`${s.title}: year/edition ${s.year}/${s.edition} vs the app's ${sp.year}/${sp.edition}`);
    // 2. the cover and spine the client draws from the stored design (api/client.ts toShelfBook) are the specimen's own
    const d = s.design;
    const cover = app.svgToDataUri(app.makeCoverSvg({ title: s.title, author: s.author, year: s.year, no: d.no, palette: d.palette, motif: d.motif, seed: app.hash32(s.title) }));
    if (cover !== sp.cover) problems.push(`${s.title}: the cover drawn from the stored design differs from the specimen's`);
    if (!isDeepStrictEqual(app.makeSpineStyle(s.title, { cloth: d.cloth, foil: d.foil }), sp.spine)) problems.push(`${s.title}: the spine drawn from the stored design differs from the specimen's`);
    // 3. shaped exactly like the schema, plus _id, in schema order
    const doc = { _id: objectId(s.title) };
    for (const k of keys) if (k in s) doc[k] = s[k];
    const extra = Object.keys(s).filter((k) => !keys.includes(k));
    if (extra.length) problems.push(`${s.title}: fields outside the schema: ${extra.join(", ")}`);
    return doc;
  });
  for (const d of docs) {
    const set = new Set(Object.keys(d));
    const want = new Set(["_id", ...keys]);
    if (set.size !== want.size || [...want].some((k) => !set.has(k))) problems.push(`${d.title}: keys ${[...set].join(" ")} ≠ schema + _id ${[...want].join(" ")}`);
    if (d.userMail !== ARCHIVE_MAIL || d.brought !== "" || d.status !== "pending" || d.imageUrl !== "" || d.UploadedImages.length) problems.push(`${d.title}: unexpected stock state`);
  }
  if (problems.length) throw new Error(`fixtures do not match the app's own data:\n  ${problems.join("\n  ")}`);
  if (docs[2].title !== ACQUIRED_TITLE) throw new Error(`index 2 is ${docs[2].title}, not ${ACQUIRED_TITLE}`);
  return { docs, covers: app.FALLBACK_CATALOG.map((b) => b.cover), keys };
}

/** No credential or person may be written except the reel's demo values. */
function assertClean(name, data) {
  const text = JSON.stringify(data);
  const emails = [...new Set(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])].filter((e) => e !== ARCHIVE_MAIL && e !== DEMO.user.email);
  const jwts = text.match(/eyJ[\w-]{10,}\.[\w-]{10,}/g) ?? [];
  const tokens = [...text.matchAll(/"token"\s*:\s*"([^"]*)"/g)].map((m) => m[1]).filter((t) => t !== DEMO.token);
  if (emails.length || jwts.length || tokens.length) throw new Error(`${name} would contain ${JSON.stringify({ emails, jwts, tokens })}; refusing to write it`);
}

// ------------------------------------------------------------------------------------------ fonts

/** The stylesheet URL exactly as frontend/index.html links it. */
export function fontStylesheetUrl() {
  const html = readFileSync(path.join(root, "frontend", "index.html"), "utf8");
  const m = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/);
  if (!m) throw new Error("no Google Fonts stylesheet in frontend/index.html");
  return m[1].replace(/&amp;/g, "&");
}
/** Cache key for a font host URL: host + path + decoded query (browsers may re-encode the query). */
export const fontKey = (url) => {
  const u = new URL(url);
  return `${u.host}${u.pathname}?${decodeURIComponent(u.search.slice(1))}`;
};
const fontFile = (url) => {
  const u = new URL(url);
  return `${createHash("sha1").update(url).digest("hex").slice(0, 8)}-${path.basename(u.pathname)}`;
};
const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";

async function recordFonts() {
  await fs.mkdir(FONT_CACHE, { recursive: true });
  const cssUrl = fontStylesheetUrl();
  const res = await fetch(cssUrl, { headers: { "user-agent": CHROME_UA } });
  if (!res.ok) throw new Error(`GET ${cssUrl} → ${res.status}`);
  const css = await res.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  const manifest = { recorded: new Date().toISOString(), stylesheet: cssUrl, entries: {} };
  manifest.entries[fontKey(cssUrl)] = { file: "stylesheet.css", type: "text/css; charset=utf-8", url: cssUrl };
  await fs.writeFile(path.join(FONT_CACHE, "stylesheet.css"), css);
  for (const url of urls) {
    const file = fontFile(url);
    if (!existsSync(path.join(FONT_CACHE, file))) {
      const r = await fetch(url, { headers: { "user-agent": CHROME_UA } });
      if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
      await fs.writeFile(path.join(FONT_CACHE, file), Buffer.from(await r.arrayBuffer()));
    }
    manifest.entries[fontKey(url)] = { file, type: "font/woff2", url };
  }
  await fs.writeFile(path.join(FONT_CACHE, "manifest.json"), JSON.stringify(manifest, null, 2));
  const faces = (css.match(/@font-face/g) ?? []).length;
  console.log(`  out/cache/fonts: stylesheet (${faces} @font-face blocks) + ${urls.length} distinct woff2 files`);
  console.log("  licence: Inter Tight and Newsreader are both released under the SIL Open Font License 1.1 (fonts.google.com)");
  if (urls.length !== 11) console.warn(`  note: the brief expected 11 woff2 files, the stylesheet names ${urls.length}`);
  return { faces, files: urls.length };
}

/** The recorded font cache: key → { file, type }. Throws if it was never recorded. */
export function fontManifest() {
  const file = path.join(FONT_CACHE, "manifest.json");
  if (!existsSync(file)) throw new Error("no font cache: run `npm run fixtures` (node fixtures.mjs --fonts) once");
  return JSON.parse(readFileSync(file, "utf8"));
}

// ------------------------------------------------------------------------------------------- main

async function main() {
  console.log("fixtures:");
  const { docs, covers, keys } = await books();
  assertClean("books.json", docs);
  await writeJson(path.join(FIXTURES, "books.json"), docs);
  const session = {
    note: "The reel's demo collector. Served by mocks in capture.mjs; never sent to a real backend.",
    session: { token: DEMO.token, user: DEMO.user },
    password: DEMO.password,
    login: { message: "Login Success", existingUser: DEMO.user, token: DEMO.token },
    makePayment: { message: "Success", session: { id: "cs_test_reel", url: `${PREVIEW_ORIGIN}/#stripe-checkout` }, sessionID: "cs_test_reel" },
    unauthorised: { status: 401, body: "Authorization Error: No token provided" },
    missingBook: { status: 400, body: "Book details are required" },
  };
  assertClean("session.json", session);
  await writeJson(path.join(FIXTURES, "session.json"), session);
  await writeJson(path.join(CACHE, "covers.json"), covers);
  console.log(`  12 documents, keys = schema (${keys.length}: ${keys.join(" ")}) + _id; every field, cover and spine matches the app's specimen module`);
  if (process.argv.includes("--fonts")) await recordFonts();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
