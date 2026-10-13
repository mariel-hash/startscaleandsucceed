/* Sound design + score for the showreel.
 *
 * Everything is synthesised with Web Audio — no samples — so the exact same
 * code renders in a realtime AudioContext (browser playback) and in an
 * OfflineAudioContext (the MP4 render). All randomness is seeded.
 *
 * 128 BPM, 4/4, C major. 15 s = 32 beats = 8 bars exactly, so every cut in
 * the picture lands on the grid.
 */
(function (root) {
  'use strict';

  var BPM = 128;
  var BEAT = 60 / BPM;
  var BAR = BEAT * 4;
  var STEP = BEAT / 4;

  var SEMI = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function hz(name) {
    var m = /^([A-G][#b]?)(-?\d)$/.exec(name);
    var midi = 12 * (+m[2] + 1) + SEMI[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeImpulse(ctx, seconds, decay, rnd) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        var k = i / len;
        // early reflections are denser on the left/right alternately for width
        d[i] = (rnd() * 2 - 1) * Math.pow(1 - k, decay) * (i < 400 ? 0.4 : 1);
      }
    }
    return buf;
  }

  /* ------------------------------------------------------------------ */
  function Studio(ctx) {
    this.ctx = ctx;
    var rnd = mulberry32(20261013);
    this.rnd = rnd;

    var nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
    this.noiseBuf = nb;

    // master: gentle glue compression, then a fast safety limiter
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    var glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 3;
    glue.attack.value = 0.01; glue.release.value = 0.18;
    var limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20;
    limit.attack.value = 0.001; limit.release.value = 0.06;
    this.master.connect(glue); glue.connect(limit); limit.connect(ctx.destination);

    // buses
    this.drums = this.bus(0.6);
    this.sfx = this.bus(1.55);
    this.music = ctx.createGain(); this.music.gain.value = 0.4;
    this.duck = ctx.createGain(); // sidechain pump, automated from the kick
    this.music.connect(this.duck); this.duck.connect(this.master);

    // shared reverb
    this.verb = ctx.createConvolver();
    this.verb.buffer = makeImpulse(ctx, 2.8, 3.2, rnd);
    this.verbSend = ctx.createGain(); this.verbSend.gain.value = 1;
    var verbRet = ctx.createGain(); verbRet.gain.value = 0.42;
    this.verbSend.connect(this.verb); this.verb.connect(verbRet); verbRet.connect(this.master);

    // master low-pass used for the "underwater" intro / breakdown sweep
    this.kicks = [];
  }

  Studio.prototype.bus = function (gain) {
    var g = this.ctx.createGain(); g.gain.value = gain; g.connect(this.master); return g;
  };

  Studio.prototype.noise = function (t, dur) {
    var s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    // start at a seeded offset so repeated hits don't sound identical
    s.start(t, this.rnd() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  };

  Studio.prototype.env = function (param, t, peak, attack, decay, floor) {
    floor = floor || 0.0001;
    param.setValueAtTime(floor, t);
    param.exponentialRampToValueAtTime(Math.max(peak, floor * 2), t + attack);
    param.exponentialRampToValueAtTime(floor, t + attack + decay);
  };

  Studio.prototype.out = function (node, bus, pan, send) {
    var ctx = this.ctx;
    var last = node;
    if (pan) {
      var p = ctx.createStereoPanner(); p.pan.value = pan; last.connect(p); last = p;
    }
    last.connect(bus || this.sfx);
    if (send) {
      var s = ctx.createGain(); s.gain.value = send; last.connect(s); s.connect(this.verbSend);
    }
    return last;
  };

  /* ---------------- drums ---------------- */
  Studio.prototype.kick = function (t, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(43, t + 0.4);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.003);
    g.gain.setValueAtTime(vel, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    o.connect(g); this.out(g, this.drums);
    o.start(t); o.stop(t + 0.5);
    // beater click
    var n = this.noise(t, 0.02);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
    var ng = ctx.createGain(); this.env(ng.gain, t, 0.22 * vel, 0.001, 0.012);
    n.connect(hp); hp.connect(ng); this.out(ng, this.drums);
    this.kicks.push(t);
  };

  Studio.prototype.clap = function (t, vel, send) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1350; bp.Q.value = 0.9;
    var g = ctx.createGain(); g.gain.value = 0;
    var offs = [0, 0.009, 0.019, 0.03];
    for (var i = 0; i < offs.length; i++) {
      var tt = t + offs[i];
      var last = i === offs.length - 1;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.42 * vel, tt + 0.002);
      g.gain.exponentialRampToValueAtTime(last ? 0.0001 : 0.05, tt + (last ? 0.2 : 0.009));
    }
    var n = this.noise(t, 0.3);
    n.connect(bp); bp.connect(g);
    this.out(g, this.drums, 0, send == null ? 0.18 : send);
    // body
    var o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
    var og = ctx.createGain(); this.env(og.gain, t, 0.16 * vel, 0.002, 0.07);
    o.connect(og); this.out(og, this.drums);
    o.start(t); o.stop(t + 0.12);
  };

  Studio.prototype.hat = function (t, vel, open, pan) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var n = this.noise(t, open ? 0.3 : 0.06);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = open ? 7200 : 8600;
    var pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 10500; pk.gain.value = 6; pk.Q.value = 1;
    var g = ctx.createGain(); this.env(g.gain, t, (open ? 0.11 : 0.085) * vel, 0.001, open ? 0.2 : 0.035);
    n.connect(hp); hp.connect(pk); pk.connect(g);
    this.out(g, this.drums, pan || 0, open ? 0.08 : 0);
  };

  Studio.prototype.crash = function (t, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var n = this.noise(t, 2.0);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    var g = ctx.createGain(); this.env(g.gain, t, 0.12 * vel, 0.002, 1.6);
    n.connect(hp); hp.connect(g); this.out(g, this.drums, 0, 0.25);
  };

  Studio.prototype.roll = function (t0, t1, vel) {
    // snare roll that accelerates and swells into t1
    var t = t0, i = 0;
    while (t < t1 - 0.005) {
      var k = (t - t0) / (t1 - t0);
      this.clap(t, (0.25 + 0.75 * k * k) * (vel || 1), 0.05);
      var step = k < 0.5 ? STEP : STEP / 2;
      t += step; i++;
    }
  };

  /* ---------------- tonal ---------------- */
  Studio.prototype.bass = function (t, f, dur, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    var s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = f;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(260, t + dur * 0.9);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.006);
    g.gain.setValueAtTime(0.3 * vel, t + dur - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    var sg = ctx.createGain(); sg.gain.value = 0.9;
    o.connect(lp); lp.connect(g); s.connect(sg); sg.connect(g);
    this.out(g, this.music);
    o.start(t); s.start(t); o.stop(t + dur + 0.08); s.stop(t + dur + 0.08);
  };

  Studio.prototype.pluck = function (t, f, dur, vel, bright, pan) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel; bright = bright == null ? 1 : bright;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 + dur * 1.4);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
    lp.frequency.setValueAtTime(900 + 5200 * bright, t);
    lp.frequency.exponentialRampToValueAtTime(500 + 700 * bright, t + 0.16);
    var dets = [-8, 7];
    for (var i = 0; i < dets.length; i++) {
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dets[i];
      o.connect(lp); o.start(t); o.stop(t + 0.2 + dur * 1.5);
    }
    var sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = f * 2;
    var sqg = ctx.createGain(); sqg.gain.value = 0.18;
    sq.connect(sqg); sqg.connect(lp); sq.start(t); sq.stop(t + 0.2 + dur * 1.5);
    lp.connect(g);
    this.out(g, this.music, pan || 0, 0.22);
  };

  Studio.prototype.pad = function (t, freqs, dur, vel, cutoff) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(cutoff || 1600, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.22);
    g.gain.setValueAtTime(0.05 * vel, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7);
    lp.connect(g);
    for (var i = 0; i < freqs.length; i++) {
      for (var d = -1; d <= 1; d += 2) {
        var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freqs[i]; o.detune.value = d * 11;
        var p = ctx.createStereoPanner(); p.pan.value = d * 0.55;
        o.connect(p); p.connect(lp); o.start(t); o.stop(t + dur + 0.8);
      }
    }
    this.out(g, this.music, 0, 0.35);
  };

  Studio.prototype.sub = function (t, f, dur, vel) {
    var ctx = this.ctx;
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * (vel || 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this.out(g, this.music);
    o.start(t); o.stop(t + dur + 0.05);
  };

  /* ---------------- sfx ---------------- */
  Studio.prototype.impact = function (t, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    var g = ctx.createGain(); this.env(g.gain, t, 0.85 * vel, 0.004, 1.1);
    o.connect(g); this.out(g, this.sfx, 0, 0.15);
    o.start(t); o.stop(t + 1.2);
    var n = this.noise(t, 0.9);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    var ng = ctx.createGain(); this.env(ng.gain, t, 0.3 * vel, 0.002, 0.6);
    n.connect(lp); lp.connect(ng); this.out(ng, this.sfx, 0, 0.5);
  };

  Studio.prototype.riser = function (t0, t1, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var dur = t1 - t0;
    var n = this.noise(t0, dur);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(350, t0); bp.frequency.exponentialRampToValueAtTime(8000, t1);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.26 * vel, t1 - 0.01);
    g.gain.linearRampToValueAtTime(0.0001, t1 + 0.02);
    n.connect(bp); bp.connect(g); this.out(g, this.sfx, 0, 0.3);
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(1500, t1);
    var olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 2600;
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.045 * vel, t1 - 0.01);
    og.gain.linearRampToValueAtTime(0.0001, t1 + 0.02);
    o.connect(olp); olp.connect(og); this.out(og, this.sfx, 0, 0.2);
    o.start(t0); o.stop(t1 + 0.05);
  };

  Studio.prototype.whoosh = function (t, dur, vel, dir) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel; dir = dir || 1;
    var n = this.noise(t, dur);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(700, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.8 * dir, t); p.pan.linearRampToValueAtTime(0.8 * dir, t + dur);
    n.connect(bp); bp.connect(g); g.connect(p); p.connect(this.sfx);
    var s = ctx.createGain(); s.gain.value = 0.15; p.connect(s); s.connect(this.verbSend);
  };

  Studio.prototype.swish = function (t, vel, dir) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel; dir = dir || 1;
    var n = this.noise(t, 0.22);
    var hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.Q.value = 0.8;
    hp.frequency.setValueAtTime(1800, t); hp.frequency.exponentialRampToValueAtTime(6500, t + 0.16);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * vel, t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    var p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.6 * dir, t); p.pan.linearRampToValueAtTime(0.6 * dir, t + 0.2);
    n.connect(hp); hp.connect(g); g.connect(p); p.connect(this.sfx);
  };

  Studio.prototype.pop = function (t, vel, pitch) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel; pitch = pitch || 1;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(950 * pitch, t); o.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.075);
    var g = ctx.createGain(); this.env(g.gain, t, 0.45 * vel, 0.002, 0.09);
    o.connect(g); this.out(g, this.sfx, 0, 0.05);
    o.start(t); o.stop(t + 0.12);
  };

  // --- the smooth-motion-graphics house sounds ---
  Studio.prototype.ping = function (t, f, vel, pan) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.02, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    var g = ctx.createGain(); this.env(g.gain, t, 0.2 * vel, 0.004, 0.7);
    var h = ctx.createOscillator(); h.type = 'sine';
    h.frequency.setValueAtTime(f * 2.04, t); h.frequency.exponentialRampToValueAtTime(f * 2, t + 0.09);
    var hg = ctx.createGain(); this.env(hg.gain, t, 0.07 * vel, 0.004, 0.45);
    o.connect(g); h.connect(hg);
    this.out(g, this.sfx, pan || 0, 0.3); this.out(hg, this.sfx, pan || 0, 0.3);
    o.start(t); h.start(t); o.stop(t + 0.8); h.stop(t + 0.6);
  };

  Studio.prototype.sparkle = function (t, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(2400, t); o.frequency.exponentialRampToValueAtTime(4800, t + 0.15);
    var g = ctx.createGain(); this.env(g.gain, t, 0.06 * vel, 0.005, 0.15);
    o.connect(g); this.out(g, this.sfx, 0, 0.35);
    o.start(t); o.stop(t + 0.2);
  };

  Studio.prototype.tick = function (t, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var fs = [1200, 1800];
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.09;
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fs[i];
      var g = ctx.createGain(); this.env(g.gain, tt, 0.13 * vel, 0.003, 0.09);
      o.connect(g); this.out(g, this.sfx, 0, 0.12);
      o.start(tt); o.stop(tt + 0.12);
    }
  };

  Studio.prototype.boop = function (t, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.11);
    var g = ctx.createGain(); this.env(g.gain, t, 0.2 * vel, 0.004, 0.13);
    o.connect(g); this.out(g, this.sfx, 0, 0.05);
    o.start(t); o.stop(t + 0.16);
    var c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = 1500;
    var cg = ctx.createGain(); this.env(cg.gain, t, 0.04 * vel, 0.001, 0.006);
    c.connect(cg); this.out(cg, this.sfx);
    c.start(t); c.stop(t + 0.02);
  };

  Studio.prototype.click = function (t, vel, pitch) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel; pitch = pitch || 1;
    var n = this.noise(t, 0.02);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400 * pitch; bp.Q.value = 2;
    var g = ctx.createGain(); this.env(g.gain, t, 0.3 * vel, 0.0008, 0.012);
    n.connect(bp); bp.connect(g); this.out(g, this.sfx);
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2100 * pitch;
    var og = ctx.createGain(); this.env(og.gain, t, 0.05 * vel, 0.001, 0.02);
    o.connect(og); this.out(og, this.sfx);
    o.start(t); o.stop(t + 0.04);
  };

  Studio.prototype.typing = function (t0, count, spacing, vel) {
    for (var i = 0; i < count; i++) {
      var jitter = (this.rnd() - 0.5) * spacing * 0.35;
      this.click(t0 + i * spacing + jitter, (vel || 0.6) * (0.7 + this.rnd() * 0.3), 0.8 + this.rnd() * 0.5);
    }
  };

  Studio.prototype.shutter = function (t, vel) {
    var ctx = this.ctx; vel = vel == null ? 1 : vel;
    var parts = [[0, 4200, 0.3], [0.045, 2300, 0.22]];
    for (var i = 0; i < parts.length; i++) {
      var tt = t + parts[i][0];
      var n = this.noise(tt, 0.05);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = parts[i][1]; bp.Q.value = 1.4;
      var g = ctx.createGain(); this.env(g.gain, tt, parts[i][2] * vel, 0.001, 0.03);
      n.connect(bp); bp.connect(g); this.out(g, this.sfx, 0, 0.06);
    }
  };

  Studio.prototype.chime = function (t, freqs, spread, vel) {
    // a quick ascending arpeggio of pings with a sparkle on top
    for (var i = 0; i < freqs.length; i++) {
      this.ping(t + i * spread, freqs[i], (vel || 1) * (0.75 + 0.25 * i / freqs.length), (i % 2 ? 0.25 : -0.25));
    }
    this.sparkle(t + freqs.length * spread, vel);
  };

  /* ------------------------------------------------------------------ */
  // The score. Chord per bar: I IV V vi IV I V I (resolves on the logo).
  var CHORDS = [
    { root: 'C', notes: ['C4', 'E4', 'G4', 'C5'], bass: 'C2' },
    { root: 'F', notes: ['F4', 'A4', 'C5', 'F5'], bass: 'F2' },
    { root: 'G', notes: ['G4', 'B4', 'D5', 'G5'], bass: 'G2' },
    { root: 'Am', notes: ['A4', 'C5', 'E5', 'A5'], bass: 'A2' },
    { root: 'F', notes: ['F4', 'A4', 'C5', 'F5'], bass: 'F2' },
    { root: 'C', notes: ['C4', 'E4', 'G4', 'C5'], bass: 'C2' },
    { root: 'G', notes: ['G4', 'B4', 'D5', 'G5'], bass: 'G2' },
    { root: 'C', notes: ['C4', 'E4', 'G4', 'D5'], bass: 'C2' }
  ];

  function score(st, opts) {
    opts = opts || {};
    var drop = opts.dropBeat != null ? opts.dropBeat : 2;      // first big hit
    var breakdown = opts.breakdownBeat != null ? opts.breakdownBeat : 26; // drums out, riser
    var logo = opts.logoBeat != null ? opts.logoBeat : 28;      // final hit
    var end = 32;
    var calm0 = opts.calmFrom != null ? opts.calmFrom : 5, calm1 = opts.calmTo != null ? opts.calmTo : 11.5;
    function calm(beat) { return beat >= calm0 && beat < calm1; }
    var b, t, i;

    // ---- intro (beats 0..drop): filtered pad + riser into the hit
    st.pad(0, [hz('C4'), hz('G4'), hz('E5')], drop * BEAT, 0.8, 700);
    st.riser(0.05, drop * BEAT, 0.9);
    for (b = 0; b < drop; b++) st.hat(b * BEAT + BEAT / 2, 0.5, false, 0.2);

    // ---- groove (drop..breakdown)
    for (b = drop; b < breakdown; b++) {
      t = b * BEAT;
      st.kick(t, b === drop ? 1.1 : calm(b) ? 0.8 : 0.95);
      if (b % 2 === 1 && !calm(b)) st.clap(t, 0.85);
      var hv = calm(b) ? 0.55 : 1;
      for (i = 0; i < 4; i++) {
        var s = t + i * STEP;
        if (i === 2) st.hat(s, 0.8 * hv, true, 0.15);
        else st.hat(s, (i === 0 ? 0.35 : 0.55) * hv, false, i % 2 ? -0.2 : 0.2);
      }
      // off-beat house bass
      var bar = Math.floor(b / 4);
      st.bass(t + BEAT / 2, hz(CHORDS[bar].bass), BEAT * 0.42, 1);
    }

    // arp: 16ths across the groove, filter opening as the piece builds
    var pattern = [0, 1, 2, 3, 2, 1, 2, 3];
    for (b = drop; b < breakdown; b++) {
      var barIdx = Math.floor(b / 4);
      var ch = CHORDS[barIdx].notes;
      for (i = 0; i < 4; i++) {
        var step = (b * 4 + i);
        var note = ch[pattern[step % pattern.length]];
        var bright = (0.25 + 0.75 * ((b - drop) / (breakdown - drop))) * (calm(b) ? 0.55 : 1);
        var vel = (i === 0 ? 1 : 0.7) * (0.75 + 0.25 * bright) * (calm(b) ? 0.5 : 1);
        st.pluck(b * BEAT + i * STEP, hz(note), STEP * 0.9, vel, bright, i % 2 ? 0.3 : -0.3);
      }
    }

    // pads underneath every bar of the groove
    for (var bi = Math.floor(drop / 4); bi < Math.floor(breakdown / 4); bi++) {
      var start = Math.max(bi * BAR, drop * BEAT);
      var nts = CHORDS[bi].notes.slice(0, 3).map(function (n) { return hz(n) / 2; });
      st.pad(start, nts, (bi + 1) * BAR - start - 0.05, 0.9, 1400 + bi * 250);
    }

    // section accents
    (opts.crashes || [12, 18]).forEach(function (cb) { st.crash(cb * BEAT, 0.8); });

    // first hit: crash + impact
    st.crash(drop * BEAT, 1);
    st.impact(drop * BEAT, 0.9);
    st.sub(drop * BEAT, hz('C1') * 2, 1.2, 0.9);

    // ---- breakdown (breakdown..logo): drums out, roll + riser, held V chord
    var tb = breakdown * BEAT, tl = logo * BEAT;
    st.pad(tb, [hz('G3'), hz('B3'), hz('D4'), hz('G4')], tl - tb, 1.1, 2400);
    st.roll(tb, tl, 0.8);
    st.riser(tb, tl, 1);
    st.bass(tb, hz('G2'), (tl - tb) * 0.9, 0.8);

    // ---- logo (logo..end): resolve to C add9, big and wide
    st.kick(tl, 1.2);
    st.crash(tl, 1.2);
    st.impact(tl, 1);
    st.sub(tl, hz('C2'), 2.2, 1);
    var fin = CHORDS[7].notes;
    for (i = 0; i < fin.length; i++) st.pluck(tl + i * 0.018, hz(fin[i]), 1.4, 1.1, 0.9, (i - 1.5) * 0.3);
    st.pad(tl, [hz('C3'), hz('G3'), hz('E4'), hz('D5')], (end * BEAT) - tl - 0.5, 1.3, 2600);
    // gentle groove under the end card so it doesn't go dead
    for (b = logo + 1; b < end; b++) {
      st.hat(b * BEAT + BEAT / 2, 0.45, true, 0.1);
      if (b % 2 === 1) st.clap(b * BEAT, 0.35, 0.3);
    }

    // sidechain pump from every kick
    var d = st.duck.gain;
    d.setValueAtTime(1, 0);
    var ks = st.kicks.slice().sort(function (a, c) { return a - c; });
    for (i = 0; i < ks.length; i++) {
      d.setValueAtTime(1, Math.max(0, ks[i] - 0.004));
      d.linearRampToValueAtTime(0.42, ks[i] + 0.004);
      d.linearRampToValueAtTime(1, ks[i] + BEAT * 0.55);
    }

    // fade the tail
    st.master.gain.setValueAtTime(0.8, (end - 1.2) * BEAT);
    st.master.gain.linearRampToValueAtTime(0.0001, end * BEAT);
  }

  /* ------------------------------------------------------------------ */
  function play(st, cue) {
    var fn = st[cue.type];
    if (!fn) throw new Error('Unknown sound: ' + cue.type);
    fn.apply(st, cue.args);
  }

  function render(ctx, cues, opts) {
    var st = new Studio(ctx);
    if (!(opts && opts.noScore)) score(st, opts);
    for (var i = 0; i < cues.length; i++) play(st, cues[i]);
    return st;
  }

  function encodeWav(buffer) {
    var ch = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
    var data = [];
    var peak = 0;
    for (var c = 0; c < ch; c++) {
      data.push(buffer.getChannelData(c));
      for (var i = 0; i < len; i++) { var v = Math.abs(data[c][i]); if (v > peak) peak = v; }
    }
    var norm = peak > 0 ? Math.min(1 / peak, 4) * 0.891 : 1; // normalise to -1 dBFS
    var bytes = 44 + len * ch * 2;
    var ab = new ArrayBuffer(bytes);
    var dv = new DataView(ab);
    function str(o, s) { for (var k = 0; k < s.length; k++) dv.setUint8(o + k, s.charCodeAt(k)); }
    str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, len * ch * 2, true);
    var o = 44;
    for (var j = 0; j < len; j++) {
      for (var c2 = 0; c2 < ch; c2++) {
        var x = Math.max(-1, Math.min(1, data[c2][j] * norm));
        dv.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2;
      }
    }
    return { buffer: ab, peak: peak, norm: norm };
  }

  root.SRAudio = {
    BPM: BPM, BEAT: BEAT, BAR: BAR, STEP: STEP,
    hz: hz, Studio: Studio, render: render, encodeWav: encodeWav
  };
})(typeof window !== 'undefined' ? window : globalThis);
