# Start Scale & Succeed — 15-second motion reel

Two renders, same picture and score, 1920×1080 at 60 fps, mixed to −14 LUFS:

- `out/startscaleandsucceed-showreel.mp4` has the reel framing: chapter labels, timecode and a REC dot.
- `out/startscaleandsucceed-ad.mp4` is the clean cut for ads.

`out/contact-sheet.jpg` shows the whole piece at 4 frames per second. `out/poster.jpg` is the end card.

## What's in it

| Beats | Time | Section | Technique |
|---|---|---|---|
| 0–2 | 0.0–0.9 s | Ignition | Spark → logo ring → squashed into the starting line; doors blow open on the drop |
| 2–5 | 0.9–2.3 s | START. | Masked kinetic type, a real deck wiped through the letterforms, "Business plans" |
| 4.5–12 | 2.1–5.6 s | Steps | Your house pop-in style: glass card, spring icons 703 ms apart, C–E–G–C pings, sparkle bursts, word pops |
| 11.5–18 | 5.4–8.4 s | SCALE. | Letters grow as a bar chart, growth line with a rider, then a zoom out into a 3D mosaic of 16 slides and a flip wave |
| 18–26 | 8.4–12.2 s | SUCCEED. | Spring type, confetti cannons, 3D carousel of the Hostloop, Soleprint, Hale and Lintel decks |
| 26–28 | 12.2–13.1 s | Breakdown | Word strobe, and the dot pulses with the snare roll |
| 28–32 | 13.1–15.0 s | Logo | Gradient ring draws on, then name, offer, URL types in, and the cursor clicks the CTA |

The travelling dot is the through-line. It opens each transition as an iris, and it ends as the logo ring.

## Edit and re-render

All text, colours, slides and the ring's gradient live in `brand.js`.

```bash
npm install                  # once (GSAP + fonts)
node render.mjs              # showreel cut  → out/
node render.mjs --hud 0      # clean ad cut
node render.mjs --stills 2.2,10.6   # PNG stills for review
node render.mjs --sheet 0.25        # contact sheet
```

Open `index.html` in a browser to play it live with sound (space or the Play button).

## How it works

- `src/scenes.js` builds one paused GSAP timeline, with every cue placed on the 128 BPM beat grid.
- `src/engine.js` draws particles, grain and camera shake as pure functions of time, so any frame can be rendered exactly.
- `src/audio.js` synthesises the score and every sound effect with Web Audio. It renders offline for the MP4 and plays the same buffer in the browser.
- `render.mjs` seeks headless Chromium frame by frame. It pipes lossless PNGs to x264 (BT.709) and loudness-normalises the mix.

## Credits

- GSAP 3.15 is under GreenSock's standard no-charge licence.
- The icon paths are adapted from Lucide (ISC licence).
- Poppins and Anton are under the SIL Open Font Licence.
- The slides are page exports of the four decks in Canva.
- The ring logo is a vector rebuild of the supplied PNG.
