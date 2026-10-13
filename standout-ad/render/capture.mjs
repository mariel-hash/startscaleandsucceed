// Frame-exact capture for index.html (which exposes window.renderAt(t)).
//
//   node render/capture.mjs stills <outDir> 0.5 1.9 3.8 ...   -> PNG per timestamp
//   node render/capture.mjs cues <out.json>                   -> audio cue sheet
//   node render/capture.mjs video <out.mkv> [fps] [shutter] [workers] [baseSamples]
//
// Video mode renders several samples per frame across a `shutter` fraction of the
// frame interval (more inside fast transitions) and averages them with ffmpeg's
// tmix filter for true motion blur.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PW = process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const W = 1920, H = 1080;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".woff2": "font/woff2", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".css": "text/css" };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function openPage(port) {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text", "--hide-scrollbars"] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on("pageerror", e => console.error("pageerror:", e.message));
  page.on("console", m => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?render`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, cdp };
}

async function grab(page, cdp, t) {
  await page.evaluate(tt => window.renderAt(tt), t);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true,
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  return Buffer.from(data, "base64");
}

const [mode, out, ...rest] = process.argv.slice(2);
const srv = await serve();
const port = srv.address().port;

if (mode === "stills") {
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, cdp } = await openPage(port);
  for (const s of rest) {
    const t = parseFloat(s);
    const t0 = Date.now();
    fs.writeFileSync(path.join(out, `t${t.toFixed(3).padStart(6, "0")}.png`), await grab(page, cdp, t));
    console.log(`t=${t.toFixed(3)} ${Date.now() - t0}ms`);
  }
  await browser.close();
} else if (mode === "cues") {
  const { browser, page } = await openPage(port);
  const data = await page.evaluate(() => ({ meta: window.META, cues: window.CUES }));
  fs.writeFileSync(out, JSON.stringify(data, null, 1));
  console.log(`${data.cues.length} cues -> ${out}`);
  await browser.close();
} else if (mode === "video") {
  // Adaptive motion blur: K samples per frame, more inside fast transitions.
  const fps = +(rest[0] || 60), shutter = +(rest[1] || 0.5), workers = +(rest[2] || 4), kBase = +(rest[3] || 4);
  const DUR = 15, N = Math.round(DUR * fps);
  const WINDOWS = [   // [start s, end s, samples] -- whip pan / push / wipe move up to ~25k px/s
    [1.40, 1.92, 12], [3.70, 4.12, 16], [5.30, 5.96, 32], [7.20, 7.86, 24],
    [8.95, 9.62, 12], [10.90, 11.56, 16], [12.95, 13.46, 10], [14.36, 14.50, 8]];
  const kAt = f => { const t = f / fps; for (const [a, b, k] of WINDOWS) if (t >= a && t < b) return k; return kBase; };
  const segs = [];
  for (let f = 0; f < N;) {                     // contiguous runs of equal K, max 45 frames each
    const k = kAt(f); let g = f;
    while (g < N && kAt(g) === k && g - f < 45) g++;
    segs.push({ f0: f, f1: g, k, cost: (g - f) * k, i: segs.length }); f = g;
  }
  const total = segs.reduce((a, s) => a + s.cost, 0);
  console.log(`${segs.length} segments, ${total} renders for ${N} frames`);
  const tmp = out + ".parts"; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const queue = [...segs].sort((a, b) => b.cost - a.cost);
  const t0 = Date.now(); let done = 0;
  async function work() {
    const { browser, page, cdp } = await openPage(port);
    for (let sg; (sg = queue.shift());) {
      const K = sg.k, part = path.join(tmp, `seg${String(sg.i).padStart(3, "0")}.mkv`);
      const vf = K > 1 ? `tmix=frames=${K},select='eq(mod(n\\,${K})\\,${K - 1})',setpts=N/(${fps}*TB)` : `setpts=N/(${fps}*TB)`;
      const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps * K), "-c:v", "png", "-i", "-",
        "-vf", vf, "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-qp", "0", "-pix_fmt", "yuv444p", part],
        { stdio: ["pipe", "inherit", "inherit"] });
      for (let f = sg.f0; f < sg.f1; f++) {
        for (let k = 0; k < K; k++) {
          const off = K > 1 ? (k / (K - 1) - 0.5) * shutter : 0;  // samples centred on the frame time
          const t = Math.max(0, Math.min(DUR, (f + off) / fps));
          const buf = await grab(page, cdp, t);
          if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
        }
      }
      ff.stdin.end();
      await new Promise(r => ff.on("close", r));
      done += sg.cost;
      const el = (Date.now() - t0) / 1000;
      console.log(`seg ${sg.i} (K=${K}, ${sg.f1 - sg.f0}f) done  ${(done / total * 100).toFixed(0)}%  ${el.toFixed(0)}s  ~${(el / done * (total - done)).toFixed(0)}s left`);
    }
    await browser.close();
  }
  await Promise.all([...Array(workers)].map(work));
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, segs.map(sg => `file '${path.resolve(tmp, `seg${String(sg.i).padStart(3, "0")}.mkv`)}'`).join("\n"));
  await new Promise((res, rej) => spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out],
    { stdio: "inherit" }).on("close", c => c ? rej(new Error("concat failed")) : res()));
  console.log(`video -> ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
srv.close();
