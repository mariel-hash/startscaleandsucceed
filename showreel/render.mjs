#!/usr/bin/env node
// Frame-exact renderer: seeks the composition in headless Chromium, captures
// lossless frames, renders the score offline, and muxes an H.264/AAC MP4.
//
//   node render.mjs                         full 1080p60 render → out/
//   node render.mjs --stills 0.5,2,7.25     PNG stills only (for review)
//   node render.mjs --sheet 0.25            contact sheet every 0.25 s
//   node render.mjs --from 4 --to 6         partial render
//   node render.mjs --fps 30 --workers 2
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require_ = (await import('node:module')).createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require_('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const FPS = +(args.fps || 60);
const [W, H] = (args.size || '1920x1080').split('x').map(Number);
const PAGE = args.page || 'index.html';
const OUT_DIR = path.resolve(here, args.outdir || 'out');
const NAME = args.name || (args.hud != null && String(args.hud) === '0' ? 'startscaleandsucceed-ad' : 'startscaleandsucceed-showreel');
const WORKERS = +(args.workers || 3);
const CRF = String(args.crf || 18);
const HUD = args.hud == null ? true : String(args.hud) !== '0';
fs.mkdirSync(OUT_DIR, { recursive: true });

const url = pathToFileURL(path.join(here, PAGE)).href + '?render=1' + (HUD ? '' : '&hud=0');

function run(cmd, argv, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['pipe', 'pipe', 'pipe'], ...opts });
    let err = '', out = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => (code === 0 ? res({ out, err }) : rej(new Error(`${cmd} exited ${code}\n${err.slice(-3000)}`))));
  });
}

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[page error]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.SR && window.SR.ready === true, null, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  return { page, cdp };
}

async function capture({ page, cdp }, t) {
  await page.evaluate(tt => window.SR.seek(tt), t);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
  return Buffer.from(r.data, 'base64');
}

const browser = await chromium.launch({
  args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars', '--allow-file-access-from-files']
});

try {
  const duration = await (async () => {
    const p = await openPage(browser);
    const d = await p.page.evaluate(() => window.SR.DURATION);
    await p.page.close();
    return d;
  })();

  if (args.stills) {
    const p = await openPage(browser);
    const dir = path.join(OUT_DIR, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of String(args.stills).split(',')) {
      const t = +s;
      const png = await capture(p, t);
      const f = path.join(dir, `t${t.toFixed(3).padStart(6, '0')}.png`);
      fs.writeFileSync(f, png);
      console.log('still', f);
    }
  } else if (args.sheet) {
    const step = +args.sheet === 1 && args.sheet === true ? 0.5 : +args.sheet;
    const from = +(args.from || 0), to = +(args.to || duration);
    const p = await openPage(browser);
    const dir = path.join(OUT_DIR, 'sheet');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    let i = 0;
    for (let t = from; t < to - 1e-6; t += step) {
      fs.writeFileSync(path.join(dir, `f${String(i++).padStart(4, '0')}.png`), await capture(p, t));
    }
    const cols = +(args.cols || 6);
    const sheet = path.join(OUT_DIR, `sheet-${from}-${to}.jpg`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 'f%04d.png'),
      '-vf', `scale=480:-1,drawtext=text='%{eif\\:n*${step}+${from}\\:d\\:2}s':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${Math.ceil(i / cols)}:padding=4:color=black`,
      '-frames:v', '1', '-q:v', '3', sheet]);
    console.log('sheet', sheet);
  } else {
    const from = +(args.from || 0), to = +(args.to || duration);
    const first = Math.round(from * FPS), last = Math.round(to * FPS); // [first, last)
    const total = last - first;
    const t0 = Date.now();

    // ---- audio
    let wav = null;
    if (!args['no-audio']) {
      const p = await openPage(browser);
      const b64 = await p.page.evaluate(() => window.SR.renderAudioWavBase64());
      wav = path.join(OUT_DIR, `${NAME}.wav`);
      fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
      await p.page.close();
      console.log(`audio rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }

    // ---- video, split across workers
    const n = Math.max(1, Math.min(WORKERS, total));
    const per = Math.ceil(total / n);
    let done = 0;
    const segs = [];
    await Promise.all(Array.from({ length: n }, async (_, w) => {
      const a = first + w * per, b = Math.min(last, a + per);
      if (a >= b) return;
      const seg = path.join(OUT_DIR, `.seg${w}.mp4`);
      segs[w] = seg;
      const p = await openPage(browser);
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
        '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-profile:v', 'high', '-g', String(FPS),
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        seg], { stdio: ['pipe', 'inherit', 'inherit'] });
      const closed = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
      for (let f = a; f < b; f++) {
        const png = await capture(p, f / FPS);
        if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
        done++;
        if (done % 60 === 0) {
          const el = (Date.now() - t0) / 1000;
          process.stdout.write(`  ${done}/${total} frames  ${(done / el).toFixed(1)} fps\n`);
        }
      }
      ff.stdin.end();
      await closed;
      await p.page.close();
    }));

    // ---- concat + mux
    const list = path.join(OUT_DIR, '.segs.txt');
    fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${s}'`).join('\n'));
    const suffix = from === 0 && to === duration ? '' : `-${from}-${to}`;
    const mp4 = path.join(OUT_DIR, `${NAME}${suffix}${FPS === 60 ? '' : '-' + FPS + 'fps'}.mp4`);
    const vArgs = ['-f', 'concat', '-safe', '0', '-i', list];
    if (wav) {
      // two-pass EBU R128 loudness normalisation to -14 LUFS / -1 dBTP (social spec)
      const { err } = await run('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json', '-f', 'null', '-']);
      const m = JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
      const ln = `loudnorm=I=-14:TP=-1.0:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
      const aStart = from;
      await run('ffmpeg', ['-y', '-loglevel', 'error', ...vArgs, '-ss', String(aStart), '-t', String(to - from), '-i', wav,
        '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', ln + ',aresample=48000', '-c:a', 'aac', '-b:a', '256k',
        '-movflags', '+faststart', '-shortest', mp4]);
    } else {
      await run('ffmpeg', ['-y', '-loglevel', 'error', ...vArgs, '-c:v', 'copy', '-movflags', '+faststart', mp4]);
    }
    for (const s of segs.filter(Boolean)) fs.rmSync(s, { force: true });
    fs.rmSync(list, { force: true });
    const el = (Date.now() - t0) / 1000;
    const size = (fs.statSync(mp4).size / 1e6).toFixed(1);
    console.log(`\n${mp4}\n${total} frames in ${el.toFixed(1)}s (${(total / el).toFixed(1)} fps), ${size} MB`);
  }
} finally {
  await browser.close();
}
