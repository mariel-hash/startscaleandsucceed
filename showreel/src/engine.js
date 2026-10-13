/* Showreel engine.
 *
 * One paused GSAP master timeline drives every DOM/SVG property. Everything
 * else (particles, grain, camera shake) is a pure function of time drawn after
 * each seek. That makes the piece frame-exact: the renderer can jump to any
 * time and get the same picture, and the browser player stays locked to the
 * audio clock.
 */
(function (root) {
  'use strict';

  var W = 1920, H = 1080;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // smooth 1D value noise, deterministic
  function makeNoise(seed) {
    var rnd = mulberry32(seed), tab = [];
    for (var i = 0; i < 256; i++) tab.push(rnd() * 2 - 1);
    return function (x) {
      var i0 = Math.floor(x), f = x - i0, u = f * f * (3 - 2 * f);
      var a = tab[i0 & 255], b = tab[(i0 + 1) & 255];
      return a + (b - a) * u;
    };
  }

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var easeOut = function (k, p) { return 1 - Math.pow(1 - clamp(k, 0, 1), p || 3); };

  var SR = {
    W: W, H: H, FPS: 60, DURATION: 15,
    tl: null,
    cues: [],
    bursts: [],
    shakes: [],
    ready: false,
    rnd: mulberry32(7),
    noiseX: makeNoise(11),
    noiseY: makeNoise(23),
    noiseR: makeNoise(37),
    mulberry32: mulberry32,
    clamp: clamp
  };

  /* ---------------- audio cue registration ---------------- */
  SR.sfx = function (type, t) {
    var args = Array.prototype.slice.call(arguments, 1);
    SR.cues.push({ type: type, args: args });
  };

  /* ---------------- camera shake ---------------- */
  SR.shake = function (t, amp, decay, freq) {
    SR.shakes.push({ t: t, amp: amp || 18, decay: decay || 7, freq: freq || 22 });
  };

  function shakeAt(t) {
    var x = 0, y = 0, r = 0;
    for (var i = 0; i < SR.shakes.length; i++) {
      var s = SR.shakes[i], dt = t - s.t;
      if (dt < 0 || dt > 1.5) continue;
      var a = s.amp * Math.exp(-s.decay * dt);
      x += SR.noiseX(dt * s.freq + i * 13.1) * a;
      y += SR.noiseY(dt * s.freq + i * 7.7) * a;
      r += SR.noiseR(dt * s.freq * 0.7 + i * 3.3) * a * 0.04;
    }
    return { x: x, y: y, r: r };
  }

  /* ---------------- particles ----------------
   * kinds:
   *  sparkle  – 8 dots radiating from a point (the house pop-in sparkle)
   *  confetti – ribbons with drag + gravity + flutter
   *  ring     – expanding shockwave stroke
   *  rays     – speed lines bursting outward
   *  dust     – slow drifting motes for depth
   */
  SR.burst = function (o) {
    o.seed = o.seed || Math.floor(SR.rnd() * 1e9);
    var rnd = mulberry32(o.seed);
    o.parts = [];
    var n = o.count || (o.kind === 'sparkle' ? 8 : o.kind === 'confetti' ? 120 : o.kind === 'rays' ? 18 : o.kind === 'dust' ? 60 : 1);
    for (var i = 0; i < n; i++) {
      var p = { r1: rnd(), r2: rnd(), r3: rnd(), r4: rnd(), r5: rnd(), r6: rnd() };
      if (o.kind === 'confetti') {
        var spread = o.spread == null ? Math.PI * 0.7 : o.spread;
        var ang = (o.angle == null ? -Math.PI / 2 : o.angle) + (p.r1 - 0.5) * spread;
        var sp = (o.speed || 1500) * (0.45 + 0.75 * p.r2);
        p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
        p.w = 10 + p.r3 * 14; p.h = 6 + p.r4 * 8;
        p.color = o.colors[Math.floor(p.r5 * o.colors.length)];
        p.spin = (p.r6 - 0.5) * 22; p.flip = 6 + p.r3 * 10;
        p.ox = (p.r4 - 0.5) * (o.w || 0); p.oy = (p.r5 - 0.5) * (o.h || 0);
      }
      o.parts.push(p);
    }
    SR.bursts.push(o);
    return o;
  };

  function drawBursts(ctx, t) {
    for (var b = 0; b < SR.bursts.length; b++) {
      var o = SR.bursts[b];
      var dt = t - o.t;
      if (dt < 0) continue;
      if (o.until != null && t > o.until) continue;
      var life = o.life || (o.kind === 'confetti' ? 3.2 : o.kind === 'sparkle' ? 0.7 : o.kind === 'ring' ? 0.8 : o.kind === 'rays' ? 0.6 : 99);
      if (dt > life) continue;
      var k = dt / life;
      var x0 = typeof o.x === 'function' ? o.x(t) : o.x, y0 = typeof o.y === 'function' ? o.y(t) : o.y;
      ctx.save();
      if (o.kind === 'sparkle') {
        var dist = (o.radius || 90) * easeOut(k, 3);
        for (var i = 0; i < o.parts.length; i++) {
          var a = (i / o.parts.length) * Math.PI * 2 + (o.rot || 0);
          var r = (o.size || 6) * (1 - k * 0.8);
          ctx.globalAlpha = (1 - k) * (o.alpha == null ? 1 : o.alpha);
          ctx.fillStyle = o.color || '#fff';
          ctx.beginPath();
          ctx.arc(x0 + Math.cos(a) * dist, y0 + Math.sin(a) * dist, Math.max(r, 0.1), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.kind === 'ring') {
        var rr = (o.r0 || 20) + ((o.r1 || 300) - (o.r0 || 20)) * easeOut(k, 3);
        ctx.globalAlpha = (1 - k) * (o.alpha == null ? 1 : o.alpha);
        ctx.strokeStyle = o.color || '#fff';
        ctx.lineWidth = (o.width || 6) * (1 - k * 0.7);
        ctx.beginPath(); ctx.arc(x0, y0, rr, 0, Math.PI * 2); ctx.stroke();
      } else if (o.kind === 'rays') {
        ctx.strokeStyle = o.color || '#fff';
        ctx.lineCap = 'round';
        for (var j = 0; j < o.parts.length; j++) {
          var p = o.parts[j];
          var ang = (j / o.parts.length) * Math.PI * 2 + p.r1 * 0.3;
          var inner = (o.r0 || 120) + (o.r1 || 520) * easeOut(k, 2) * (0.7 + p.r2 * 0.5);
          var len = (o.len || 140) * (1 - k) * (0.6 + p.r3 * 0.6);
          ctx.globalAlpha = (1 - k) * (o.alpha == null ? 1 : o.alpha);
          ctx.lineWidth = (o.width || 5) * (0.6 + p.r4 * 0.6);
          ctx.beginPath();
          ctx.moveTo(x0 + Math.cos(ang) * inner, y0 + Math.sin(ang) * inner);
          ctx.lineTo(x0 + Math.cos(ang) * (inner + len), y0 + Math.sin(ang) * (inner + len));
          ctx.stroke();
        }
      } else if (o.kind === 'confetti') {
        var kd = o.drag || 1.6, g = o.gravity || 1400;
        var e = 1 - Math.exp(-kd * dt);
        for (var c = 0; c < o.parts.length; c++) {
          var q = o.parts[c];
          var px = x0 + q.ox + q.vx * e / kd + Math.sin(dt * (2 + q.r1 * 3) + q.r2 * 6) * 26 * Math.min(dt * 2, 1);
          var py = y0 + q.oy + (q.vy - g / kd) * e / kd + (g / kd) * dt;
          var fade = dt > life - 0.6 ? (life - dt) / 0.6 : 1;
          ctx.globalAlpha = clamp(fade, 0, 1);
          ctx.fillStyle = q.color;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(q.r3 * 6 + q.spin * dt);
          ctx.scale(1, Math.cos(q.r4 * 6 + q.flip * dt));
          ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
          ctx.restore();
        }
      } else if (o.kind === 'dust') {
        for (var d = 0; d < o.parts.length; d++) {
          var m = o.parts[d];
          var dx = (m.r1 * (o.w || W)) + Math.sin(dt * (0.3 + m.r2 * 0.4) + m.r3 * 6) * 40 + dt * (o.drift || 20) * (m.r4 - 0.3);
          var dy = (m.r2 * (o.h || H)) - dt * (10 + m.r5 * 30);
          var tw = 0.5 + 0.5 * Math.sin(dt * (1 + m.r6 * 2) + m.r1 * 9);
          var fin = clamp(dt / 0.6, 0, 1) * (o.until != null ? clamp((o.until - t) / 0.4, 0, 1) : 1);
          ctx.globalAlpha = (o.alpha || 0.5) * tw * fin;
          ctx.fillStyle = o.color || '#fff';
          ctx.beginPath();
          ctx.arc((o.x || 0) + dx, (o.y || 0) + dy, (o.size || 2.4) * (0.5 + m.r3), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /* ---------------- film grain ---------------- */
  var grainTiles = [];
  function makeGrain() {
    var rnd = mulberry32(99);
    for (var i = 0; i < 6; i++) {
      var c = document.createElement('canvas');
      c.width = 480; c.height = 270;
      var g = c.getContext('2d');
      var img = g.createImageData(c.width, c.height);
      for (var p = 0; p < img.data.length; p += 4) {
        var v = Math.floor(128 + (rnd() + rnd() + rnd() - 1.5) * 120);
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      grainTiles.push(c);
    }
  }

  /* ---------------- motion blur filters ----------------
   * SR.mblur('name') creates an SVG Gaussian blur whose stdDeviation can be
   * tweened: tl.to(SR.mblurNode('name'), {attr:{stdDeviation:'40 0'}})
   */
  var mblurNodes = {};
  SR.mblur = function (name) {
    if (mblurNodes[name]) return 'url(#mb-' + name + ')';
    var svg = document.getElementById('sr-filters');
    var ns = 'http://www.w3.org/2000/svg';
    var f = document.createElementNS(ns, 'filter');
    f.setAttribute('id', 'mb-' + name);
    f.setAttribute('x', '-50%'); f.setAttribute('y', '-50%');
    f.setAttribute('width', '200%'); f.setAttribute('height', '200%');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    var b = document.createElementNS(ns, 'feGaussianBlur');
    b.setAttribute('stdDeviation', '0 0');
    f.appendChild(b); svg.appendChild(f);
    mblurNodes[name] = b;
    return 'url(#mb-' + name + ')';
  };
  SR.mblurNode = function (name) { SR.mblur(name); return mblurNodes[name]; };

  /* ---------------- frame drawing ---------------- */
  var fxCtx, grainCtx, shakeEl, grainCanvas;
  SR.lastTime = 0;

  SR.draw = function (t) {
    // camera shake
    var s = shakeAt(t);
    shakeEl.style.transform = 'translate3d(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px,0) rotate(' + s.r.toFixed(3) + 'deg)';
    // particles
    fxCtx.setTransform(1, 0, 0, 1, 0, 0);
    fxCtx.clearRect(0, 0, W, H);
    fxCtx.setTransform(1, 0, 0, 1, s.x, s.y);
    // scene-owned procedural drawing (logo ring etc.), inside the shaken frame
    if (SR.onDraw) SR.onDraw(t, fxCtx);
    drawBursts(fxCtx, t);
    // grain at 24 fps for a filmic cadence
    var tile = grainTiles[Math.floor(t * 24) % grainTiles.length];
    grainCtx.drawImage(tile, 0, 0);
  };

  SR.seek = function (t) {
    t = clamp(t, 0, SR.DURATION);
    SR.tl.time(t, true);
    SR.draw(t);
    SR.lastTime = t;
  };

  /* ---------------- boot ---------------- */
  SR.boot = function (build, opts) {
    opts = opts || {};
    shakeEl = document.getElementById('shake');
    var fx = document.getElementById('fx');
    fx.width = W; fx.height = H;
    fxCtx = fx.getContext('2d');
    grainCanvas = document.getElementById('grain');
    grainCanvas.width = 480; grainCanvas.height = 270;
    grainCtx = grainCanvas.getContext('2d');
    makeGrain();

    gsap.ticker.lagSmoothing(0);
    SR.tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });

    // every face and image must be decoded before the first measure/split
    var fonts = (opts.fonts || []).map(function (f) { return document.fonts.load(f); });
    var imgs = (opts.images || []).map(function (src) {
      var im = new Image();
      im.src = src;
      return im.decode().catch(function () { console.error('image failed: ' + src); });
    });
    return Promise.all(fonts.concat(imgs)).then(function () {
      return document.fonts.ready;
    }).then(function () {
      build(SR.tl);
      SR.tl.set({}, {}, SR.DURATION); // pin the duration
      SR.seek(0);
      SR.ready = true;
      return SR;
    });
  };

  /* ---------------- audio ---------------- */
  SR.renderAudio = function () {
    var sr = 48000;
    var ctx = new OfflineAudioContext(2, Math.ceil(sr * SR.DURATION), sr);
    SRAudio.render(ctx, SR.cues, SR.scoreOpts || {});
    return ctx.startRendering();
  };

  SR.renderAudioWavBase64 = function () {
    return SR.renderAudio().then(function (buf) {
      var w = SRAudio.encodeWav(buf);
      var u8 = new Uint8Array(w.buffer), s = '', CH = 0x8000;
      for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return btoa(s);
    });
  };

  /* ---------------- browser playback ---------------- */
  SR.player = function () {
    var ui = document.getElementById('player');
    if (!ui) return;
    var btn = ui.querySelector('button');
    var label = ui.querySelector('.label');
    var audioBuf = null, actx = null, src = null, startAt = 0, raf = 0, playing = false;

    function frame() {
      var t = actx.currentTime - startAt;
      if (t >= SR.DURATION) { SR.seek(SR.DURATION); stop(); return; }
      SR.seek(t);
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      playing = false;
      cancelAnimationFrame(raf);
      ui.classList.remove('hidden');
      label.textContent = 'Replay';
    }
    function start() {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      actx.resume();
      src = actx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(actx.destination);
      startAt = actx.currentTime + 0.05;
      src.start(startAt);
      playing = true;
      ui.classList.add('hidden');
      raf = requestAnimationFrame(frame);
    }
    label.textContent = 'Preparing sound…';
    btn.disabled = true;
    SR.renderAudio().then(function (buf) {
      audioBuf = buf;
      btn.disabled = false;
      label.textContent = 'Play with sound';
    });
    btn.addEventListener('click', function () { if (!playing && audioBuf) start(); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !playing && audioBuf) { e.preventDefault(); start(); }
    });
  };

  // fit the 1920×1080 stage to any window in the browser player
  SR.fit = function () {
    var stage = document.getElementById('stage');
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  };

  root.SR = SR;
})(window);
