/* Choreography.
 *
 * Every scene is built from BRAND data and placed on one master timeline at
 * musical positions: at(n) = beat n of the 128 BPM score (0.46875 s/beat).
 *
 *   0  ─ 2   ignition    spark → ring → starting line → doors blow open
 *   2  ─ 5   START.      kinetic slam, portfolio fill, "business plans"
 *   4.5─ 12  steps       house pop-in style: glass card, icons, pings, word pops
 *   11.5─18  SCALE.      letters grow as a bar chart → zoom out into a 3D mosaic
 *   18 ─ 26  SUCCEED.    confetti, 3D carousel of real decks
 *   26 ─ 28  breakdown   the dot pulses with the snare roll
 *   28 ─ 32  logo        the ring draws on; name, offer, URL, CTA click
 *
 * The travelling dot is the through-line: it opens every transition and
 * finally resolves into the logo ring.
 */
(function () {
  'use strict';

  gsap.registerPlugin(SplitText, CustomEase, DrawSVGPlugin, MotionPathPlugin, ScrambleTextPlugin);
  // the house pop-in curve — cubic-bezier(0.34, 1.56, 0.64, 1)
  CustomEase.create('spring', 'M0,0 C0.34,1.56 0.64,1 1,1');

  var BR = window.BRAND, C = BR.colors, COPY = BR.copy;
  var B = SRAudio.BEAT;
  function at(n) { return n * B; }
  var W = SR.W, H = SR.H, CX = W / 2, CY = H / 2, TAU = Math.PI * 2;
  var NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.51, G6: 1567.98, C7: 2093.0 };
  function S() { SR.sfx.apply(null, arguments); }

  var params = new URLSearchParams(location.search);
  if (params.has('render')) document.body.classList.add('render');
  if (params.get('hud') === '0') document.body.classList.add('nohud');

  // brand → CSS variables
  var rs = document.documentElement.style;
  Object.keys(C).forEach(function (k) { rs.setProperty('--' + k, C[k]); });
  rs.setProperty('--display', BR.fonts.display);
  rs.setProperty('--sans', BR.fonts.sans);
  rs.setProperty('--pop', BR.fonts.pop);
  rs.setProperty('--ring', 'conic-gradient(' + BR.ring.map(function (s) { return s[1] + ' ' + (s[0] * 100) + '%'; }).join(',') + ')');

  var ICON = {
    idea: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    plan: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    deck: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/><path d="M7 12l3-3 2.5 2L17 7"/>',
    investors: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24">' + ICON[name] + '</svg>'; }

  /* ---------------- helpers ---------------- */
  function scene(id) {
    var s = document.createElement('section');
    s.className = 'scene'; s.id = id;
    document.getElementById('camera').appendChild(s);
    return s;
  }
  function show(tl, el, t0, t1) {
    tl.set(el, { autoAlpha: 1 }, t0);
    if (t1 != null) tl.set(el, { autoAlpha: 0 }, t1);
  }
  // layout box in stage pixels, independent of how the player scales the stage
  function rectOf(el) {
    var st = document.getElementById('stage').getBoundingClientRect();
    var k = st.width / W, r = el.getBoundingClientRect();
    var x = (r.left - st.left) / k, y = (r.top - st.top) / k, w = r.width / k, h = r.height / k;
    return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2 };
  }
  function flash(tl, t, peak) {
    tl.fromTo('#flash', { autoAlpha: peak }, { autoAlpha: 0, duration: 0.4, ease: 'power2.out', immediateRender: false }, t);
  }
  // Catmull-Rom → cubic Bézier path through points
  function smoothPath(p) {
    var d = 'M' + p[0][0] + ',' + p[0][1];
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ',' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
        ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ',' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
        ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }

  /* ---------------- the logo ring (canvas, conic gradient) ---------------- */
  var rings = [];
  function ring(o) {
    var s = { x: CX, y: CY, rx: 0, ry: 0, width: 6, start: -0.75 * Math.PI, sweep: TAU, rot: 0, alpha: 1, glow: 0.5, fill: 0, tip: 0 };
    for (var k in o) s[k] = o[k];
    rings.push(s);
    return s;
  }
  function drawRing(ctx, s) {
    if (s.alpha <= 0.002 || s.rx <= 0.1) return;
    var ry = Math.max(0.1, s.ry);
    ctx.save();
    var g = ctx.createConicGradient(-Math.PI / 2 + s.rot, s.x, s.y);
    for (var i = 0; i < BR.ring.length; i++) g.addColorStop(BR.ring[i][0], BR.ring[i][1]);
    if (s.glow > 0) { ctx.shadowColor = 'rgba(125,190,240,' + Math.min(1, s.glow) + ')'; ctx.shadowBlur = 40; }
    if (s.fill > 0) {
      ctx.globalAlpha = Math.min(1, s.alpha) * Math.min(1, s.fill);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, ry, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, s.alpha);
    if (s.sweep > 0.001 && s.width > 0.1) {
      ctx.strokeStyle = g; ctx.lineWidth = s.width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, ry, 0, s.start, s.start + Math.min(s.sweep, TAU)); ctx.stroke();
    }
    if (s.tip > 0.01 && s.sweep > 0.001) { // bright head riding the drawing stroke
      var a = s.start + s.sweep;
      ctx.shadowColor = 'rgba(255,255,255,.95)'; ctx.shadowBlur = 30;
      ctx.globalAlpha = Math.min(1, s.tip); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * s.rx, s.y + Math.sin(a) * ry, s.width * 0.75, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- HUD (showreel framing) ---------------- */
  var CHAPTERS = [
    [0, '01 — Kinetic type'],
    [at(4.5), '02 — Icon system'],
    [at(11.5), '03 — Data viz · 3D mosaic'],
    [at(18), '04 — 3D carousel'],
    [at(26), '05 — Logo sting']
  ];
  var GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#*+';
  var hud = {
    root: document.getElementById('hud'),
    tc: document.querySelector('#hud .tc'),
    chapter: document.querySelector('#hud .chapter'),
    rec: document.querySelector('#hud .rec'),
    segs: []
  };
  CHAPTERS.forEach(function () {
    var s = document.createElement('span'); s.className = 'seg';
    document.querySelector('#hud .br').appendChild(s); hud.segs.push(s);
  });
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function drawHud(t) {
    var idx = 0;
    for (var i = 0; i < CHAPTERS.length; i++) if (t >= CHAPTERS[i][0] - 1e-6) idx = i;
    var label = CHAPTERS[idx][1], since = t - CHAPTERS[idx][0], txt = label;
    if (idx > 0 && since < 0.32) { // deterministic text scramble on chapter change
      var n = Math.floor(label.length * since / 0.32), f = Math.round(t * 60);
      txt = label.slice(0, n) + label.slice(n).replace(/[^ —·]/g, function (c, j) { return GLYPHS[(f * 7 + j * 13) % GLYPHS.length]; });
    }
    hud.chapter.textContent = txt;
    for (var k = 0; k < hud.segs.length; k++) hud.segs[k].style.opacity = k <= idx ? 1 : 0.28;
    var fr = Math.floor(t * 24 + 1e-6);
    hud.tc.textContent = '00:00:' + pad(Math.floor(fr / 24)) + ':' + pad(fr % 24);
    hud.rec.style.opacity = Math.floor(t * 2) % 2 ? 0.25 : 1;
    var light = (t >= at(2.15) && t < at(11.75)) || (t >= at(17.9) && t < at(25.7));
    hud.root.style.color = light ? 'rgba(10,26,47,.78)' : 'rgba(255,255,255,.82)';
  }

  /* ================================================================== */
  /* 1 · IGNITION                                                        */
  /* ================================================================== */
  function s1(tl) {
    var sc = scene('s1');
    sc.style.zIndex = 5; // doors sit over START until they blow open
    sc.innerHTML = '<div class="door top"></div><div class="door bot"></div>';
    show(tl, sc, 0, at(2) + 0.8);
    var top = sc.children[0], bot = sc.children[1];

    var r = ring({ rx: 0, ry: 0, width: 5, fill: 1, glow: 1 });
    tl.fromTo(r, { rx: 0, ry: 0 }, { rx: 18, ry: 18, duration: 0.5, ease: 'back.out(3)' }, 0.04);
    tl.fromTo(r, { rot: 0 }, { rot: TAU * 1.5, duration: at(2), ease: 'none' }, 0);
    S('ping', 0.04, NOTE.C6, 1); S('sparkle', 0.04, 1);
    SR.burst({ kind: 'sparkle', t: 0.04, x: CX, y: CY, color: C.sky3, radius: 120, size: 6 });
    SR.burst({ kind: 'ring', t: 0.06, x: CX, y: CY, r0: 18, r1: 320, color: C.sky1, width: 3, life: 1.0, alpha: 0.6 });

    // the spark opens into a ring — first glimpse of the logo
    tl.to(r, { rx: 96, ry: 96, fill: 0, width: 7, duration: 0.5, ease: 'expo.out' }, at(0.5));
    S('swish', at(0.5), 0.55, 1);
    SR.burst({ kind: 'sparkle', t: at(0.5) + 0.04, x: CX, y: CY, color: C.sky2, radius: 200, size: 4, rot: 0.39 });

    // …then squashes flat into the starting line
    tl.to(r, { ry: 1.2, rx: 1150, width: 5, duration: 0.42, ease: 'expo.in' }, at(1.08));
    S('whoosh', at(1.08), 0.46, 0.85, 1);

    // the drop: doors blow open, the line flashes off
    tl.to(top, { yPercent: -101, duration: 0.8, ease: 'expo.out' }, at(2));
    tl.to(bot, { yPercent: 101, duration: 0.8, ease: 'expo.out' }, at(2));
    tl.to(r, { width: 80, alpha: 0, duration: 0.34, ease: 'power2.out' }, at(2));
    flash(tl, at(2), 0.12);
  }

  /* ================================================================== */
  /* 2 · START.                                                          */
  /* ================================================================== */
  function s2(tl) {
    var sc = scene('s2');
    sc.innerHTML =
      '<div class="blob" style="left:-260px;top:-300px;width:1100px;height:1100px"></div>' +
      '<div class="blob" style="left:1080px;top:340px;width:1250px;height:1250px"></div>' +
      '<div class="marquee"><span style="display:inline-block">START START START START START</span></div>' +
      '<div class="word-wrap"><div class="mega s2-word">START<i class="dot"></i></div></div>' +
      '<div class="word-wrap"><div class="mega s2-knock">START<i class="dot"></i></div></div>' +
      '<div class="s2-sub"><span class="rule"></span><span class="t">' + COPY.start + '</span><span class="rule"></span></div>';
    var T0 = at(2);
    show(tl, sc, T0 - 0.02, at(5) + 0.03);

    var word = sc.querySelector('.s2-word'), knock = sc.querySelector('.s2-knock');
    var dot = word.querySelector('.dot'), wraps = sc.querySelectorAll('.word-wrap');
    knock.style.backgroundImage = 'url(' + BR.work.hero[1].src + ')';
    var dotR = rectOf(dot);

    var split = SplitText.create(word, { type: 'chars', mask: 'chars' });
    tl.fromTo(split.chars, { yPercent: 125 }, { yPercent: 0, duration: 0.7, ease: 'expo.out', stagger: 0.04 }, T0);
    tl.fromTo(wraps, { scale: 1.2 }, { scale: 1, duration: 1.7, ease: 'power3.out' }, T0);
    SR.shake(T0, 16, 6.5);
    SR.burst({ kind: 'rays', t: T0, x: CX, y: CY - 36, color: C.sky1, r0: 330, r1: 720, len: 200, width: 8, life: 0.6, count: 24, alpha: 0.95 });
    tl.fromTo(sc.querySelector('.marquee span'), { x: 0 }, { x: -900, duration: at(3.2), ease: 'none' }, T0);
    var blobs = sc.querySelectorAll('.blob');
    tl.fromTo(blobs[0], { x: 0, y: 0 }, { x: 160, y: 60, duration: at(3.2), ease: 'sine.inOut' }, T0);
    tl.fromTo(blobs[1], { x: 0, y: 0 }, { x: -200, y: -80, duration: at(3.2), ease: 'sine.inOut' }, T0);

    // the dot lands
    tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.55, ease: 'back.out(4)' }, at(3));
    S('pop', at(3), 1, 1.15);
    SR.burst({ kind: 'sparkle', t: at(3), x: dotR.cx, y: dotR.cy, color: C.sky1, radius: 84, size: 5 });

    // a real deck wipes through the letterforms
    tl.fromTo(knock, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.62, ease: 'power3.inOut' }, at(3.35));
    tl.fromTo(knock, { backgroundPosition: '0% 50%' }, { backgroundPosition: '55% 50%', duration: at(2), ease: 'none' }, at(3));
    S('shutter', at(3.35), 0.7);

    // "business plans"
    var rules = sc.querySelectorAll('.s2-sub .rule');
    tl.fromTo(rules[0], { scaleX: 0, transformOrigin: '100% 50%' }, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, at(3.5));
    tl.fromTo(rules[1], { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, at(3.5));
    var sub = SplitText.create(sc.querySelector('.s2-sub .t'), { type: 'chars', mask: 'chars' });
    tl.fromTo(sub.chars, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'expo.out', stagger: 0.016 }, at(3.5));

    // the next scene irises open out of the dot
    tl.set(dot, { autoAlpha: 0 }, at(4.5));
    return { dot: dotR };
  }

  /* ================================================================== */
  /* 3 · STEPS — the house pop-in style                                  */
  /* ================================================================== */
  function s3(tl, prev) {
    var sc = scene('s3');
    var steps = COPY.steps;
    sc.innerHTML =
      '<div class="blob" style="left:-320px;top:-360px;width:1200px;height:1200px"></div>' +
      '<div class="blob" style="left:1050px;top:420px;width:1300px;height:1300px"></div>' +
      '<div class="card"></div>' +
      '<div class="s3-head"><span class="kicker">' + COPY.stepsKicker + '</span><div class="h">' + COPY.stepsHeading + '</div></div>' +
      '<div class="row">' + steps.map(function (s, i) {
        return '<div class="svc"><div class="svc-float"><div class="svc-pop"><div class="svc-circle">' + icon(s.icon) +
          '</div><div class="svc-badge">' + (i + 1) + '</div></div></div><div class="svc-label">' + s.label + '</div></div>';
      }).join('') + '</div>';
    var T0 = at(4.5);
    show(tl, sc, T0, at(12) + 0.03);

    var card = sc.querySelector('.card'), head = sc.querySelector('.s3-head');
    var svcs = [].slice.call(sc.querySelectorAll('.svc'));
    var floats = svcs.map(function (s) { return s.querySelector('.svc-float'); });
    var pops = svcs.map(function (s) { return s.querySelector('.svc-pop'); });
    var badges = svcs.map(function (s) { return s.querySelector('.svc-badge'); });
    var labels = svcs.map(function (s) { return s.querySelector('.svc-label'); });
    var circ = svcs.map(function (s) { return rectOf(s.querySelector('.svc-circle')); });

    // connectors between the steps
    var links = [];
    for (var i = 0; i < circ.length - 1; i++) {
      var l = document.createElement('div'); l.className = 'link';
      var x0 = circ[i].x + circ[i].w + 22, x1 = circ[i + 1].x - 26;
      l.style.left = x0 + 'px'; l.style.width = (x1 - x0) + 'px'; l.style.top = (circ[i].cy - 2) + 'px';
      sc.appendChild(l); links.push(l);
    }

    // word pops, anchored to their icon
    var wordPops = [];
    steps.forEach(function (s, i) {
      if (!s.pop) return;
      var p = document.createElement('div');
      p.className = 'word-pop ' + (s.pop.tilt || '');
      p.innerHTML = s.pop.html;
      sc.appendChild(p);
      var pr = rectOf(p), lab = rectOf(labels[i]);
      var top = s.pop.position === 'above' ? circ[i].y - 30 - pr.h : lab.y + lab.h + 22;
      p.style.left = (circ[i].cx - pr.w / 2) + 'px';
      p.style.top = top + 'px';
      wordPops.push({ el: p, i: i });
    });

    // iris out of START's dot
    var d = prev.dot;
    tl.fromTo(sc, { clipPath: 'circle(' + (d.w / 2) + 'px at ' + d.cx + 'px ' + d.cy + 'px)' },
      { clipPath: 'circle(2400px at ' + d.cx + 'px ' + d.cy + 'px)', duration: at(0.5), ease: 'expo.in' }, T0);
    S('whoosh', T0 - 0.05, at(0.5) + 0.12, 1, -1);
    var blobs = sc.querySelectorAll('.blob');
    tl.fromTo(blobs[0], { x: 0, y: 0 }, { x: 220, y: 120, duration: at(7.5), ease: 'sine.inOut' }, T0);
    tl.fromTo(blobs[1], { x: 0, y: 0 }, { x: -240, y: -100, duration: at(7.5), ease: 'sine.inOut' }, T0);

    // glass card settles; heading fades down from the top
    tl.fromTo(card, { y: 50, scale: 0.95, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 1.1, ease: 'power3.out' }, at(4.75));
    tl.fromTo(head, { y: -44, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.2, ease: 'power2.out' }, at(4.75));

    // icons pop 703 ms apart (1.5 beats), C–E–G–C pings, sparkle bursts, desynced float
    var times = [at(5), at(6.5), at(8), at(9.5)];
    var pings = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    var floatDelay = [0.5, 0.7, 1.0, 1.3];
    pops.forEach(function (p, i) {
      var t = times[i];
      tl.fromTo(p, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.8, ease: 'spring' }, t);
      S('ping', t, pings[i], 1); S('sparkle', t, 1);
      SR.burst({ kind: 'sparkle', t: t, x: circ[i].cx, y: circ[i].cy, color: '#ffffff', radius: 150, size: 7 });
      tl.fromTo(badges[i], { scale: 0 }, { scale: 1, duration: 0.6, ease: 'spring' }, t + 0.16);
      tl.fromTo(labels[i], { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 1.0, ease: 'power2.out' }, t + 0.18);
      tl.fromTo(floats[i], { y: 0 }, { y: -20, duration: 1.75, ease: 'sine.inOut', yoyo: true, repeat: 3 }, t + floatDelay[i]);
      if (i > 0) tl.fromTo(links[i - 1], { scaleX: 0, autoAlpha: 0 }, { scaleX: 1, autoAlpha: 1, duration: 0.42, ease: 'power3.out' }, t - 0.34);
    });
    wordPops.forEach(function (w) {
      var t = times[w.i] + 0.6; // words land 600 ms after their icon
      tl.fromTo(w.el, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2.6)' }, t);
      S('boop', t, 1);
    });

    // exit: everything converges into the dot at the centre
    var TX = at(10.75);
    tl.to(head, { y: -70, autoAlpha: 0, duration: 0.36, ease: 'power2.in' }, TX);
    tl.to(labels.concat(links), { autoAlpha: 0, duration: 0.18 }, TX);
    tl.to(wordPops.map(function (w) { return w.el; }), { scale: 0, duration: 0.24, ease: 'back.in(2)' }, TX);
    tl.to(card, { scale: 0.6, autoAlpha: 0, duration: 0.42, ease: 'expo.in' }, TX + 0.04);
    svcs.forEach(function (el, i) {
      tl.to(el, { x: CX - circ[i].cx, y: CY - circ[i].cy, scale: 0.14, duration: 0.42, ease: 'back.in(1.5)' }, TX + 0.03 * i);
    });
    S('swish', TX + 0.12, 0.8, 1);
  }

  /* ================================================================== */
  /* 4 · SCALE. → 3D mosaic of real slides                               */
  /* ================================================================== */
  function s4(tl) {
    var sc = scene('s4');
    var slides = BR.work.hero.map(function (h) { return h.src; }).concat(BR.work.more);
    var brandTiles = [
      { ring: true }, { icon: 'plan', text: 'Plan' }, { text: 'Start' }, { icon: 'deck', text: 'Pitch' },
      { icon: 'trend', text: 'Grow' }, { text: 'Scale' }, { icon: 'idea', text: 'Ideas' }, { text: 'Succeed' }
    ];
    var brandIdx = [0, 4, 6, 8, 16, 18, 20, 24];
    var html = '<div class="mosaic">', si = 0, bi = 0;
    for (var row = 0; row < 5; row++) {
      for (var col = 0; col < 5; col++) {
        var idx = row * 5 + col, pos = 'left:' + (col * 384) + 'px;top:' + (row * 216) + 'px';
        if (idx === 12) {
          html += '<div class="tile hero" data-r="2" data-c="2" style="' + pos + '"><div class="face front"><div class="content">' +
            '<div class="grid"></div><div class="bars">' + [0, 1, 2, 3, 4].map(function () { return '<div class="bar"></div>'; }).join('') + '</div>' +
            '<div class="baseline"></div><div class="mega s4-word on-dark">SCALE<i class="dot"></i></div>' +
            '<svg class="chart" viewBox="0 0 1920 1080"><defs><linearGradient id="lg" x1="0" x2="1" y1="0" y2="0">' +
            '<stop offset="0" stop-color="' + C.sky1 + '"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>' +
            '<path class="line" fill="none" stroke="url(#lg)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle class="halo" r="34" fill="' + C.sky1 + '" opacity=".35"/><circle class="rider" r="15" fill="#fff"/></svg>' +
            '<div class="s4-sub">' + COPY.scale + '</div></div></div><div class="face back"></div></div>';
        } else if (brandIdx.indexOf(idx) >= 0) {
          var b = brandTiles[bi++];
          var inner = b.ring ? '<div class="ringmark"></div>' : (b.icon ? icon(b.icon) : '') + '<span>' + b.text + '</span>';
          html += '<div class="tile" data-r="' + row + '" data-c="' + col + '" style="' + pos + '"><div class="face front brandtile">' + inner + '</div><div class="face back"></div></div>';
        } else {
          html += '<div class="tile" data-r="' + row + '" data-c="' + col + '" style="' + pos + '"><div class="face front"><div class="ph" style="background-image:url(' + slides[si++ % slides.length] + ')"></div></div><div class="face back"></div></div>';
        }
      }
    }
    sc.innerHTML = html + '</div>';
    var T0 = at(11.5);
    show(tl, sc, T0, at(18) + 0.05);

    var mosaic = sc.querySelector('.mosaic');
    var tiles = [].slice.call(sc.querySelectorAll('.tile'));
    var heroFace = sc.querySelector('.tile.hero .face.front'), content = sc.querySelector('.content');
    var bars = sc.querySelectorAll('.bar'), baseline = sc.querySelector('.baseline');
    var word = sc.querySelector('.s4-word'), dot = word.querySelector('.dot');
    var line = sc.querySelector('.chart .line'), rider = sc.querySelector('.chart .rider'), halo = sc.querySelector('.chart .halo');

    // chart through the bar tops, rising above the word
    var pts = [[250, 452], [416, 418], [688, 392], [960, 336], [1232, 242], [1504, 140], [1680, 88]];
    line.setAttribute('d', smoothPath(pts));
    var barTops = [452, 424, 368, 272, 168]; // a little under the line
    [].forEach.call(bars, function (b, i) { b.style.height = (712 - barTops[i]) + 'px'; });

    tl.set(mosaic, { scale: 5 }, 0);

    // iris out of the converged dot
    tl.fromTo(sc, { clipPath: 'circle(0px at 960px 540px)' }, { clipPath: 'circle(1200px at 960px 540px)', duration: at(0.5), ease: 'expo.in' }, T0);
    S('whoosh', T0, at(0.5) + 0.1, 0.8, 1);

    // letters grow up out of the baseline like bars on a chart
    var split = SplitText.create(word, { type: 'chars', mask: 'chars' });
    tl.fromTo(baseline, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'expo.out' }, at(11.85));
    tl.fromTo(split.chars, { yPercent: 105 }, { yPercent: 0, duration: 0.75, ease: 'expo.out', stagger: 0.06 }, at(12));
    tl.fromTo(bars, { scaleY: 0 }, { scaleY: 1, duration: 0.9, ease: 'expo.out', stagger: 0.07 }, at(12.1));
    S('swish', at(12), 0.6, -1);
    tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(4)' }, at(12.75));
    S('pop', at(12.75), 0.9, 1.25);

    // growth line draws with a rider on its tip
    tl.fromTo(line, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.9, ease: 'power2.inOut' }, at(13));
    tl.fromTo([rider, halo], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, at(13));
    tl.to([rider, halo], { motionPath: { path: line, align: line, alignOrigin: [0.5, 0.5] }, duration: 0.9, ease: 'power2.inOut' }, at(13));
    tl.fromTo(halo, { attr: { r: 34 } }, { attr: { r: 60 }, autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, at(13) + 0.9);
    S('riser', at(13), at(13) + 0.9, 0.35);
    S('ping', at(13) + 0.9, NOTE.G6, 0.8); S('sparkle', at(13) + 0.9, 1);
    SR.burst({ kind: 'sparkle', t: at(13) + 0.9, x: 960 + (1680 - 960) * 0.2, y: 540 + (88 - 540) * 0.2, color: '#ffffff', radius: 40, size: 3 });

    // "investor pitch decks"
    var sub = SplitText.create(sc.querySelector('.s4-sub'), { type: 'chars', mask: 'chars' });
    tl.fromTo(sub.chars, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'expo.out', stagger: 0.012 }, at(13.5));

    // zoom out: SCALE becomes one tile of the body of work
    var TZ = at(14.75), DZ = 0.86;
    tl.to(mosaic, { scale: 1, duration: DZ, ease: 'expo.inOut' }, TZ);
    tl.to(heroFace, { top: 7, left: 7, right: 7, bottom: 7, borderRadius: 14, duration: DZ, ease: 'expo.inOut' }, TZ);
    tl.to(content, { x: -7, y: -7, duration: DZ, ease: 'expo.inOut' }, TZ);
    S('whoosh', TZ - 0.05, DZ + 0.1, 1, -1);
    // slides breathe inside their frames
    tl.fromTo(sc.querySelectorAll('.ph'), { scale: 1.12 }, { scale: 1, duration: at(4), ease: 'power1.out' }, TZ);

    // slow 3D drift
    tl.fromTo(mosaic, { rotationX: 0, rotationZ: 0 }, { rotationX: 14, rotationZ: -5, duration: at(3.4), ease: 'sine.inOut' }, at(16.1));
    tl.to(mosaic, { scale: 0.92, duration: at(3.4), ease: 'sine.inOut' }, at(16.1));

    // flip wave → the white of SUCCEED
    tiles.forEach(function (tile) {
      var r = +tile.dataset.r, c = +tile.dataset.c;
      tl.to(tile, { rotationY: 180, duration: 0.4, ease: 'power3.inOut' }, at(16.5) + c * 0.06 + r * 0.02);
    });
    S('swish', at(16.5), 0.8, 1); S('swish', at(16.5) + 0.2, 0.6, 1);
  }

  /* ================================================================== */
  /* 5 · SUCCEED. + 3D carousel of real decks                            */
  /* ================================================================== */
  var carousel = null;
  function s5(tl) {
    var sc = scene('s5');
    var cards = BR.work.hero.concat([{ src: BR.work.more[4] }, { src: BR.work.more[5] }]);
    var N = cards.length, STEP = 360 / N, R = 560;
    sc.innerHTML =
      '<div class="blob" style="left:-300px;top:-420px;width:1200px;height:1200px"></div>' +
      '<div class="blob" style="left:1100px;top:300px;width:1300px;height:1300px"></div>' +
      '<div class="mega s5-word">SUCCEED<i class="dot"></i></div>' +
      '<div class="stage3d"><div class="ring3d"><div class="spin">' + cards.map(function (c, i) {
        return '<div class="card3d" style="background-image:url(' + c.src + ');transform:rotateY(' + (i * STEP) + 'deg) translateZ(' + R + 'px)"><div class="shade"></div></div>';
      }).join('') + '</div></div></div>' +
      '<div class="label"><span class="kicker">' + COPY.workKicker + '</span><div class="caps">' + BR.work.hero.map(function (h) {
        return '<div class="cap"><span class="name">' + h.name + '</span><span class="kind">  ·  ' + h.kind + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="enddot" style="position:absolute;left:942px;top:522px;width:36px;height:36px;border-radius:50%;background:' + C.sky3 + ';visibility:hidden"></div>';
    var T0 = at(18);
    show(tl, sc, T0 - 0.01, at(26) + 0.02);

    var word = sc.querySelector('.s5-word'), dot = word.querySelector('.dot');
    var ring3d = sc.querySelector('.ring3d'), spin = sc.querySelector('.spin'), cardEls = [].slice.call(sc.querySelectorAll('.card3d'));
    var caps = [].slice.call(sc.querySelectorAll('.label .cap')), label = sc.querySelector('.label');
    carousel = { ring: spin, shades: cardEls.map(function (c) { return c.querySelector('.shade'); }), step: STEP };

    // SUCCEED springs in from the centre out
    var split = SplitText.create(word, { type: 'chars' });
    tl.fromTo(split.chars, { scale: 0, yPercent: 40, autoAlpha: 0 }, { scale: 1, yPercent: 0, autoAlpha: 1, duration: 0.7, ease: 'spring', stagger: { each: 0.035, from: 'center' } }, T0);
    S('impact', T0, 0.55);
    SR.shake(T0, 10, 7);
    tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(4)' }, at(19));
    S('pop', at(19), 1, 1.2);

    // confetti cannons from both corners
    var colors = [C.sky1, C.sky2, C.sky3, C.ink, '#ffffff', '#4A9EE6'];
    SR.burst({ kind: 'confetti', t: at(18.25), x: 80, y: 1130, angle: -Math.PI * 0.34, spread: 0.6, speed: 2500, count: 110, colors: colors, life: 3.0, gravity: 1500 });
    SR.burst({ kind: 'confetti', t: at(18.25), x: 1840, y: 1130, angle: -Math.PI * 0.66, spread: 0.6, speed: 2500, count: 110, colors: colors, life: 3.0, gravity: 1500 });
    S('pop', at(18.25), 1, 0.7); S('pop', at(18.25) + 0.03, 0.9, 0.8);
    S('chime', at(18.25), [NOTE.C6, NOTE.E6, NOTE.G6], 0.05, 0.7);

    // word lifts into a title; the carousel spins in from depth
    tl.to(word, { y: -310, scale: 0.42, duration: 0.85, ease: 'expo.inOut' }, at(19.5));
    tl.fromTo(ring3d, { z: -2600, rotationX: -7 }, { z: 0, rotationX: -7, duration: 1.15, ease: 'expo.out' }, at(19.75));
    tl.fromTo(spin, { rotationY: 200 }, { rotationY: 0, duration: 1.15, ease: 'expo.out' }, at(19.75));
    tl.fromTo(cardEls, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, stagger: 0.04 }, at(19.75));
    S('whoosh', at(19.6), 0.6, 1, 1);

    // label
    tl.set(caps.slice(1), { yPercent: 110 }, 0);
    tl.fromTo(label, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' }, at(20.5));

    // step through the work, one deck every two beats
    [1, 2, 3].forEach(function (k, j) {
      var t = at(21.5 + j);
      tl.to(spin, { rotationY: -k * STEP, duration: 0.5, ease: 'expo.inOut' }, t);
      S('swish', t, 0.75, -1);
      tl.to(caps[k - 1], { yPercent: -110, duration: 0.45, ease: 'expo.inOut' }, t + 0.03);
      tl.fromTo(caps[k], { yPercent: 110 }, { yPercent: 0, duration: 0.45, ease: 'expo.inOut', immediateRender: false }, t + 0.03);
    });

    // iris closes down to the dot
    tl.set(sc.querySelector('.enddot'), { autoAlpha: 1 }, at(25.55));
    tl.fromTo(sc, { clipPath: 'circle(1200px at 960px 540px)' }, { clipPath: 'circle(18px at 960px 540px)', duration: at(1), ease: 'power3.in' }, at(25));
    S('whoosh', at(25), at(1), 0.9, -1);
  }

  /* ================================================================== */
  /* 6 · BREAKDOWN                                                       */
  /* ================================================================== */
  function s6(tl) {
    var sc = scene('s6');
    var words = COPY.words || ['START', 'SCALE', 'SUCCEED'];
    sc.innerHTML = words.map(function (w, i) { return '<div class="flashword mega' + (i % 2 ? '' : ' fill') + '">' + w + '</div>'; }).join('') + '<div class="core"></div>';
    show(tl, sc, at(26) - 0.01, at(28) + 0.05);
    var core = sc.querySelector('.core'), fw = sc.querySelectorAll('.flashword');
    [].forEach.call(fw, function (w, i) {
      var t = at(26 + i * 0.5);
      tl.set(w, { autoAlpha: 1 }, t);
      tl.fromTo(w, { scale: 1.14 }, { scale: 1, duration: 0.32, ease: 'expo.out' }, t);
      tl.set(w, { autoAlpha: 0 }, t + at(0.5) - 0.012);
    });
    // the core pulses with the snare roll
    var t = at(26), t1 = at(27.5), STEP16 = B / 4;
    while (t < t1 - 0.001) {
      var k = (t - at(26)) / (t1 - at(26));
      var base = 1 + 1.4 * k;
      tl.fromTo(core, { scale: base * 1.28 }, { scale: base, duration: 0.09, ease: 'power2.out', immediateRender: false }, t);
      t += k < 0.5 ? STEP16 : STEP16 / 2;
    }
    // anticipation: suck in before the logo hit
    tl.to(core, { scale: 0, duration: at(0.5), ease: 'back.in(3)' }, at(27.5));
  }

  /* ================================================================== */
  /* 7 · LOGO                                                            */
  /* ================================================================== */
  function s7(tl) {
    var sc = scene('s7');
    sc.innerHTML =
      '<div class="halo"></div>' +
      '<div class="name">START SCALE <span class="amp">&amp;</span> SUCCEED</div>' +
      '<div class="offer">' + COPY.offer + '</div>' +
      '<div class="cta-row"><div class="url"><span class="txt">' + BR.url + '</span><span class="caret"></span></div>' +
      '<div class="cta">' + COPY.cta + icon('arrow') + '</div></div>' +
      '<svg class="cursor" viewBox="0 0 24 24"><path d="M4 2 L4 19.5 L8.6 15.2 L11.6 21.6 L14.6 20.2 L11.6 13.9 L17.8 13.9 Z" fill="#fff" stroke="' + C.ink + '" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    var T = at(28), RY = 392;
    show(tl, sc, T - 0.012, null);

    var halo = sc.querySelector('.halo'), nameEl = sc.querySelector('.name'), offer = sc.querySelector('.offer');
    var url = sc.querySelector('.url .txt'), caret = sc.querySelector('.url .caret');
    var cta = sc.querySelector('.cta'), cursor = sc.querySelector('.cursor');
    var ctaR = rectOf(cta);

    // the ring draws on, its gradient sweeping round as it settles
    var logo = ring({ x: CX, y: RY, rx: 150, ry: 150, width: 13, sweep: 0, rot: -Math.PI * 1.5, glow: 1.2, tip: 1, alpha: 0 });
    tl.set(logo, { alpha: 1 }, T);
    tl.fromTo(logo, { sweep: 0 }, { sweep: TAU, duration: 0.95, ease: 'expo.out' }, T);
    tl.fromTo(logo, { rx: 150, ry: 150 }, { rx: 200, ry: 200, duration: 1.1, ease: 'expo.out' }, T);
    tl.fromTo(logo, { rot: -Math.PI * 1.5 }, { rot: 0, duration: 1.75, ease: 'power3.out' }, T);
    tl.fromTo(logo, { glow: 1.2 }, { glow: 0.45, duration: 1.4, ease: 'power2.out' }, T);
    tl.fromTo(logo, { tip: 1 }, { tip: 0, duration: 0.4, ease: 'power2.in' }, T + 0.5);
    SR.burst({ kind: 'ring', t: T, x: CX, y: RY, r0: 200, r1: 820, color: C.sky1, width: 5, life: 1.1, alpha: 0.7 });
    SR.burst({ kind: 'rays', t: T, x: CX, y: RY, r0: 240, r1: 560, len: 160, width: 6, color: C.sky3, count: 28, life: 0.65 });
    SR.burst({ kind: 'sparkle', t: T + 0.04, x: CX, y: RY, color: '#ffffff', radius: 320, size: 7, count: 12 });
    SR.shake(T, 12, 6);
    flash(tl, T, 0.32);
    S('chime', T + 0.03, [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7], 0.055, 0.9);
    tl.fromTo(halo, { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.3, ease: 'expo.out' }, T);

    // name, offer
    var split = SplitText.create(nameEl, { type: 'chars', mask: 'chars' });
    tl.fromTo(split.chars, { yPercent: 115 }, { yPercent: 0, duration: 0.7, ease: 'expo.out', stagger: 0.018 }, T + 0.16);
    tl.fromTo(offer, { autoAlpha: 0, y: 18, letterSpacing: '0.6em' }, { autoAlpha: 1, y: 0, letterSpacing: '0.36em', duration: 0.9, ease: 'expo.out' }, T + 0.5);

    // URL types on
    var us = SplitText.create(url, { type: 'chars' });
    var t0 = at(29.25), dt = 0.026;
    tl.set(us.chars, { autoAlpha: 0 }, 0);
    us.chars.forEach(function (c, i) { tl.set(c, { autoAlpha: 1 }, t0 + i * dt); });
    tl.fromTo(caret, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t0 - 0.05);
    S('typing', t0, us.chars.length, dt, 0.55);
    tl.to(caret, { autoAlpha: 0, duration: 0.01, repeat: 5, yoyo: true, repeatDelay: 0.22 }, t0 + us.chars.length * dt + 0.15);

    // CTA, then the cursor clicks it
    tl.fromTo(cta, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.7, ease: 'spring' }, at(30));
    S('pop', at(30), 0.9, 1.1);
    var tx = ctaR.cx + 36, ty = ctaR.cy + 6;
    tl.fromTo(cursor, { x: 1700, y: 1140, autoAlpha: 1 }, { x: tx, y: ty, duration: 0.62, ease: 'power3.inOut' }, at(30.35));
    var TC = at(31);
    tl.to(cursor, { scale: 0.82, duration: 0.07, ease: 'power2.out', transformOrigin: '10% 10%' }, TC);
    tl.to(cursor, { scale: 1, duration: 0.22, ease: 'back.out(3)' }, TC + 0.07);
    tl.to(cta, { scale: 0.93, duration: 0.07, ease: 'power2.out' }, TC);
    tl.to(cta, { scale: 1, duration: 0.4, ease: 'back.out(3)' }, TC + 0.07);
    S('click', TC, 1, 1); S('sparkle', TC + 0.02, 1);
    SR.burst({ kind: 'ring', t: TC, x: tx + 6, y: ty + 6, r0: 6, r1: 90, color: '#ffffff', width: 4, life: 0.5, alpha: 0.9 });
    SR.burst({ kind: 'sparkle', t: TC, x: tx + 6, y: ty + 6, color: C.sky3, radius: 70, size: 4 });
  }

  /* ================================================================== */
  SR.onDraw = function (t, ctx) {
    for (var i = 0; i < rings.length; i++) drawRing(ctx, rings[i]);
    if (carousel) { // shade cards by how far they face away
      var ry = gsap.getProperty(carousel.ring, 'rotationY') || 0;
      for (var k = 0; k < carousel.shades.length; k++) {
        var a = (k * carousel.step + ry) * Math.PI / 180;
        carousel.shades[k].style.opacity = (0.5 - 0.5 * Math.cos(a)) * 0.65;
      }
    }
    drawHud(t);
  };

  var images = BR.work.hero.map(function (h) { return h.src; }).concat(BR.work.more);
  SR.boot(function (tl) {
    s1(tl);
    var a = s2(tl);
    s3(tl, a);
    s4(tl);
    s5(tl);
    s6(tl);
    s7(tl);
    tl.to('#hud', { autoAlpha: 0, duration: 0.35 }, at(27.6));
  }, {
    fonts: ['400 40px Poppins', '500 40px Poppins', '600 40px Poppins', '700 40px Poppins', '800 40px Poppins', '40px Anton'],
    images: images
  }).then(function () {
    if (!document.body.classList.contains('render')) {
      SR.fit();
      window.addEventListener('resize', SR.fit);
      SR.player();
    }
  });
})();
