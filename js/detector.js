// Note detector for one acoustic piano heard through a microphone.
// Finds key strikes (onsets) from bursts of high-frequency energy, then reads the
// pitch of the sound that follows with YIN. Pure JS, no DOM: runs in the browser
// and in Node tests.

export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
export function freqToMidiFloat(f) { return 69 + 12 * Math.log2(f / 440); }

// YIN pitch estimate. Returns {freq, conf, cmnd, tauLo} or null.
export function yin(x, sr, minF = 70, maxF = 1400, thresh = 0.15) {
  const tauMin = Math.max(2, Math.floor(sr / maxF));
  const tauMax = Math.min(Math.ceil(sr / minF), Math.floor(x.length / 2));
  const N = x.length - tauMax - 1;
  const d = new Float32Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let j = 0; j < N; j++) { const v = x[j] - x[j + tau]; s += v * v; }
    d[tau] = s;
  }
  const c = new Float32Array(tauMax + 2);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    run += d[tau];
    c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (c[t] < thresh) {
      while (t + 1 <= tauMax && c[t + 1] < c[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = tauMin;
    for (let t = tauMin; t <= tauMax; t++) if (c[t] < c[best]) best = t;
    if (c[best] > 0.35) return null;
    tau = best;
  }
  let better = tau;
  if (tau > 1 && tau < tauMax + 1) {
    const a = c[tau - 1], b = c[tau], e = c[tau + 1];
    const den = a - 2 * b + e;
    if (den !== 0) better = tau + (a - e) / (2 * den);
  }
  return { freq: sr / better, conf: 1 - c[tau], cmnd: c };
}

// Lowest normalized difference near the period of `freq` (0 = perfect match).
export function cmndAt(cmnd, sr, freq) {
  const lo = Math.max(1, Math.floor(sr / (freq * 1.03)));
  const hi = Math.min(cmnd.length - 1, Math.ceil(sr / (freq * 0.97)));
  let m = 1;
  for (let t = lo; t <= hi; t++) if (cmnd[t] < m) m = cmnd[t];
  return m;
}

export class NoteDetector {
  constructor(sampleRate, opts = {}) {
    this.sr = sampleRate;
    this.hop = 256;
    this.size = 1 << 16;
    this.mask = this.size - 1;
    this.buf = new Float32Array(this.size);
    this.written = 0;
    this.processed = 1; // first hop starts at 1 so x[n-1] exists
    this.frameOffset = null;
    this.H = 256; // hop history length
    this.hf = new Float32Array(this.H);
    this.rms = new Float32Array(this.H);
    this.hopIndex = 0;
    this.floorHF = 0;
    this.floorRms = 0;
    this.lastOnsetHop = -1e9;
    this.lastPeakRms = 0;
    this.pending = [];
    this.lastMidi = null;
    this.track = null;
    this.minF = opts.minF || 70;
    this.maxF = opts.maxF || 1400;
    this.W = Math.round(this.sr * 0.046);
    this.delay = Math.round(this.sr * 0.016);
    this.onNote = opts.onNote || (() => {});
    this.level = 0; // recent rms, for a meter
  }

  timeOf(abs) { return (abs + (this.frameOffset || 0)) / this.sr; }

  copy(start, len) {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = this.buf[(start + i) & this.mask];
    return out;
  }

  push(chunk, startFrame) {
    if (startFrame != null) {
      const off = startFrame - this.written;
      if (this.frameOffset === null || Math.abs(off - this.frameOffset) > this.hop) this.frameOffset = off;
    }
    for (let i = 0; i < chunk.length; i++) this.buf[(this.written + i) & this.mask] = chunk[i];
    this.written += chunk.length;
    while (this.processed + this.hop <= this.written) {
      this._hop(this.processed);
      this.processed += this.hop;
    }
    this._resolvePending();
  }

  _h(k) { return this.hf[((k % this.H) + this.H) % this.H]; }
  _r(k) { return this.rms[((k % this.H) + this.H) % this.H]; }

  _hop(a) {
    let e = 0, eh = 0;
    let prev = this.buf[(a - 1) & this.mask];
    for (let n = a; n < a + this.hop; n++) {
      const v = this.buf[n & this.mask];
      e += v * v;
      const dv = v - prev;
      eh += dv * dv;
      prev = v;
    }
    const rms = Math.sqrt(e / this.hop), hf = Math.sqrt(eh / this.hop);
    const k = this.hopIndex++;
    this.hf[k % this.H] = hf;
    this.rms[k % this.H] = rms;
    this.level = this.level * 0.8 + rms * 0.2;

    // Noise floor: follows quiet moments fast, creeps up slowly.
    if (k === 0) { this.floorHF = hf; this.floorRms = rms; }
    this.floorHF = hf < this.floorHF ? this.floorHF * 0.7 + hf * 0.3 : this.floorHF * 1.0015;
    this.floorRms = rms < this.floorRms ? this.floorRms * 0.7 + rms * 0.3 : this.floorRms * 1.0015;
    this.floorHF = Math.max(this.floorHF, 1e-6);
    this.floorRms = Math.max(this.floorRms, 1e-6);
    if (k < 8) return;

    const ref = (this._h(k - 3) + this._h(k - 4) + this._h(k - 5) + this._h(k - 6)) / 4;
    const sinceOnset = (k - this.lastOnsetHop) * this.hop / this.sr;
    const preRms = (this._r(k - 3) + this._r(k - 4) + this._r(k - 5) + this._r(k - 6)) / 4;
    // Strike = a jump in high-frequency energy (re-strikes over a ringing note)
    // or in overall loudness (a note out of quiet, even with a hissy mic).
    const hfJump = hf > 2.2 * ref + 1e-6 && hf > 3 * this.floorHF && hf > 2e-4;
    const loudJump = rms > 2.5 * preRms + 1e-6 && rms > 5 * this.floorRms && rms > 1e-3;
    if ((hfJump || loudJump) && sinceOnset > 0.07) {
      // Strikes right at one of our own metronome clicks are "soft": judged after the click
      // has died away, only if the level really rises, and a real strike soon after replaces them.
      const soft = this._nearClick(this.timeOf(a));
      this.pending = this.pending.filter((p) => !p.soft);
      this.pending.push({ abs: a, k, preRms, tries: 0, soft });
      if (!soft) this.lastOnsetHop = k;
      this.track = null;
      return;
    }

    // Pitch tracking for soft legato notes that don't make a clear strike.
    if (k % 6 === 0 && this.pending.length === 0 && sinceOnset > 0.15 && rms > 8 * this.floorRms && rms > 0.25 * this.lastPeakRms) {
      const start = a + this.hop - this.W;
      if (start < 0) return;
      const r = yin(this.copy(start, this.W), this.sr, this.minF, this.maxF, 0.12);
      if (!r || r.conf < 0.88) { this.track = null; return; }
      const midi = Math.round(freqToMidiFloat(r.freq));
      const last = this.lastMidi;
      const related = last != null && [0, 12, 19, 24].includes(Math.abs(midi - last));
      if (related) { this.track = null; return; }
      if (this.track && this.track.midi === midi) {
        if (++this.track.count >= 3) {
          this._emit(this.track.abs, r, 'track', rms, this.copy(start, this.W));
          this.lastOnsetHop = k;
          this.track = null;
        }
      } else {
        this.track = { midi, count: 1, abs: start + (this.W >> 1) };
      }
    }
  }

  // Times (same clock as events) when our metronome click reaches the mic.
  setClicks(times) { this.clicks = times.slice().sort((a, b) => a - b); }

  _nearClick(t) {
    const c = this.clicks;
    if (!c || !c.length) return false;
    let lo = 0, hi = c.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < t - 0.05) lo = m + 1; else hi = m; }
    for (let i = lo; i < c.length && c[i] <= t + 0.05; i++) if (t - c[i] > -0.04 && t - c[i] < 0.05) return true;
    return false;
  }

  _resolvePending() {
    const keep = [];
    for (const p of this.pending) {
      const start = p.abs + this.delay + (p.soft ? Math.round(this.sr * 0.03) : 0) + p.tries * Math.round(this.sr * 0.02);
      if (this.written < start + this.W) { keep.push(p); continue; }
      const x = this.copy(start, this.W);
      let e = 0;
      for (let i = 0; i < x.length; i++) e += x[i] * x[i];
      const post = Math.sqrt(e / x.length);
      if (post < 2 * this.floorRms) continue;
      const r = yin(x, this.sr, this.minF, this.maxF);
      if (r && r.conf > 0.7) {
        // A click or bump over a ringing note isn't a new note: same pitch needs a real rise in level.
        // Without a real rise in level, only a clearly new, unrelated pitch counts (legato playing);
        // the same note, or an octave/harmonic of what's ringing, is a bump or a tick, not a key.
        const m = Math.round(freqToMidiFloat(r.freq));
        const rose = post >= 1.15 * p.preRms + 3 * this.floorRms;
        const q = this.lastMidi;
        const ringing = q != null && ([0, 12, 19, 24, 28, 31].includes(Math.abs(m - q)) || [16].includes(q - m));
        if (!rose && (ringing || r.conf < 0.8)) continue;
        let abs = p.abs;
        if (p.soft) {
          this.lastOnsetHop = p.k;
          // The click and the note overlap: date the note by where its level rises and stays up.
          const last = this.hopIndex - 1;
          for (let j = p.k - 1; j <= Math.min(p.k + 10, last - 3); j++) {
            if (this._r(j) > 0.5 * post && this._r(j + 1) > 0.5 * post && this._r(j + 2) > 0.5 * post && this._r(j + 3) > 0.5 * post) {
              abs = p.abs + (j - p.k) * this.hop;
              break;
            }
          }
        }
        this._emit(abs, r, 'onset', post, x);
        continue;
      }
      if (p.tries < 2) { p.tries++; keep.push(p); }
    }
    this.pending = keep;
  }

  _emit(abs, r, src, level, window) {
    const mf = freqToMidiFloat(r.freq);
    const midi = Math.round(mf);
    this.lastMidi = midi;
    this.lastPeakRms = level;
    this.onNote({
      time: this.timeOf(abs), midi, freq: r.freq, cents: Math.round((mf - midi) * 100),
      conf: r.conf, cmnd: r.cmnd, src, level,
    });
  }

  // Would this event also fit the note `midi`? Used to forgive octave mistakes of the detector.
  fits(ev, midi) { return cmndAt(ev.cmnd, this.sr, midiToFreq(midi)) < 0.25; }
}
