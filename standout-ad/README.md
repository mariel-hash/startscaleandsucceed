# Standout — 15s motion ad

A 15-second, 1080p60 motion-graphics spot for [Standout](https://joinstandout.com), built from the
Standout website exports (logo, Will's portrait, product mockups) and the site's own copy and palette.

- **`standout-ad.mp4`**: the finished film (H.264 1080p60 + AAC stereo, about -13 LUFS).
- **`index.html`**: the same animation, live in the browser with sound. Open it, press **Play**
  (space bar toggles, ← → step one frame, slider scrubs).

## Storyboard (128 BPM, one scene per bar)

| Bar | Time | Scene | Motion / sound |
|---|---|---|---|
| 1 | 0.00 | "Recruiters decide *in 7 seconds.*" | Masked type reveal, clock ticks, the period pops into a cobalt dot |
| 2 | 1.88 | "Most profiles *blend in.*" | Dot arcs (squash & stretch) onto a grid of identical profiles; scan beam, snare build, riser |
| 3 | 3.75 | "*Stand out.*" | Drop: shockwave, the card springs out in 3D, photo reveals inside the dot, headline retyped, recruiter notifications |
| 4 | 5.63 | "See what *recruiters see.*" | Whip-pan, LinkedIn Score gauge counts to 92, free tools fan out |
| 5 | 7.50 | "Two ready-to-post updates. *Every weekday.*" | Vertical push, 6:59 → 7:00 lock screen, Standout Daily notification, M–F ticks |
| 6 | 9.38 | "Built by an executive *who's been there.*" | Friday tick match-cuts into Will's circle, portrait rises |
| 7 | 11.25 | "Show up before *opportunity knocks.*" | Cobalt wipe, music stops, two knocks shake the line |
| 8 | 13.13 | End card | Logo builds letter by letter, devices fly in, CTA click |

Brand: CTA blue `#0046DA`, accent `#0054AC`, sky gradient `#D6E8FF → #FFFFFF`, Libre Caslon Text + Inter.

## Rebuild

```bash
./render/build.sh        # cue sheet -> soundtrack -> motion-blurred frames -> standout-ad.mp4
```

Needs Node with Playwright/Chromium, Python 3 with numpy + scipy, and ffmpeg.

- `render/capture.mjs` drives the page frame by frame (`window.renderAt(t)` is a pure function of time).
  It renders 4 to 32 sub-frame samples per frame (more inside fast transitions) and averages them for
  real motion blur.
- `render/soundtrack.py` synthesizes all music and sound effects from scratch (no samples), placed from
  the cue sheet the page exports.
- `render/prep_assets.py` turns the original Drive exports into the layers in `assets/` (for example, it
  separates Will from his baked-in circle so the circle can animate).

Fonts are under the SIL Open Font License (see `fonts/`).
