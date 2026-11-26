/**
 * The app the reel films: a production build of frontend/ in out/app-dist, served by `vite preview`
 * on port 5180 (brief §4.1). Never the dev server on 5173, which belongs to the user.
 *
 *  - build():        `vite build` run from inside frontend/ (Vite takes its root from the working
 *                    directory), straight to ../tools/showreel/out/app-dist. `tsc -b` is skipped.
 *  - startPreview(): `vite preview` on 5180 with --strictPort, owned by the calling process and
 *                    stopped by stopPreview() (and on exit). If 5180 already serves this build, it is
 *                    reused and left alone.
 *
 * The preview server proxies /api and /uploads to :3000 (vite.config.ts). Every capture intercepts
 * those paths in the browser, so nothing ever reaches the proxy; its log is kept and checked.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync, createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SHOWREEL = path.resolve(here, "..");
export const ROOT = path.resolve(SHOWREEL, "..", "..");
export const FRONTEND = path.join(ROOT, "frontend");
export const DIST = path.join(SHOWREEL, "out", "app-dist");
export const PREVIEW_PORT = 5180;
export const ORIGIN = `http://localhost:${PREVIEW_PORT}`;
export const PREVIEW_LOG = path.join(SHOWREEL, "out", "preview.log");
const VITE = path.join(FRONTEND, "node_modules", ".bin", "vite");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${out.slice(-1500)}`))));
  });
}

/** Production build into out/app-dist (never frontend/dist). */
export async function build() {
  const out = await run(VITE, ["build", "--outDir", path.relative(FRONTEND, DIST), "--emptyOutDir"], { cwd: FRONTEND, env: { ...process.env, NODE_ENV: "production" } });
  if (!existsSync(path.join(DIST, "index.html"))) throw new Error(`vite build wrote no index.html to ${DIST}`);
  return out;
}

/** True when the preview origin answers with this app's HTML. */
export async function previewUp() {
  try {
    const res = await fetch(ORIGIN + "/", { signal: AbortSignal.timeout(1500) });
    const html = await res.text();
    return res.ok && html.includes("Bibliotheca Obscura");
  } catch {
    return false;
  }
}

let child = null;

/** Starts `vite preview` on 5180 (or reuses a running one). Resolves when it answers. */
export async function startPreview() {
  if (!existsSync(path.join(DIST, "index.html"))) await build();
  if (await previewUp()) return { reused: true, pid: null };
  const log = createWriteStream(PREVIEW_LOG, { flags: "a" });
  log.write(`\n--- vite preview started ${new Date().toISOString()} ---\n`);
  child = spawn(VITE, ["preview", "--outDir", path.relative(FRONTEND, DIST), "--port", String(PREVIEW_PORT), "--strictPort", "--host", "localhost"], {
    cwd: FRONTEND,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const pid = child.pid;
  const started = Date.now();
  while (!(await previewUp())) {
    if (child.exitCode !== null) throw new Error(`vite preview exited (${child.exitCode}); see ${PREVIEW_LOG}`);
    if (Date.now() - started > 20000) throw new Error("vite preview did not answer on 5180 within 20 s");
    await sleep(100);
  }
  const stop = () => {
    try {
      child?.kill("SIGTERM");
    } catch {}
  };
  process.once("exit", stop);
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });
  return { reused: false, pid };
}

export async function stopPreview() {
  if (!child) return;
  const c = child;
  child = null;
  c.kill("SIGTERM");
  for (let i = 0; i < 50 && c.exitCode === null && c.signalCode === null; i++) await sleep(50);
}

/** Lines of the preview log that mention a proxy error (a request that tried to reach :3000). */
export function proxyErrors() {
  if (!existsSync(PREVIEW_LOG)) return [];
  return readFileSync(PREVIEW_LOG, "utf8")
    .split("\n")
    .filter((l) => /proxy error|ECONNREFUSED|http proxy/i.test(l));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? "build";
  if (cmd === "build") {
    const t = Date.now();
    const out = await build();
    console.log(out.split("\n").filter((l) => /built in|dist|error/i.test(l)).slice(-12).join("\n"));
    console.log(`built into ${path.relative(ROOT, DIST)} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  } else if (cmd === "serve") {
    console.log(await startPreview());
    console.log(`serving ${ORIGIN}; Ctrl-C to stop`);
    await new Promise(() => {});
  }
}
