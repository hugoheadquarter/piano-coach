// Builds fake "piano heard through a laptop mic" recordings from the Salamander samples,
// for testing the note detector offline. Node only.
import fs from 'node:fs';
import path from 'node:path';
import { makeClick } from '../js/click.js';

export const SR = 48000;
const NAMES = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' };
const cache = {};

function loadRaw(dir, name) {
  if (!cache[name]) {
    const b = fs.readFileSync(path.join(dir, name + '.f32'));
    cache[name] = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  }
  return cache[name];
}

function nearestSample(midi) {
  let best = null;
  for (let m = 36; m <= 96; m++) {
    if (NAMES[m % 12] === undefined) continue;
    if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  }
  return best;
}

// notes: [{midi, t, dur, vel}], clicks: [{t, accent}]
export function render(rawDir, notes, { length, clicks = [], clickGain = 0.25, noise = 0.002, highpass = 120, seed = 1 } = {}) {
  const out = new Float32Array(Math.ceil(length * SR));
  for (const n of notes) {
    const sm = nearestSample(n.midi);
    const src = loadRaw(rawDir, NAMES[sm % 12] + (Math.floor(sm / 12) - 1));
    const rate = Math.pow(2, (n.midi - sm) / 12);
    const start = Math.round(n.t * SR);
    const relEnd = Math.round((n.t + n.dur) * SR);
    const damp = Math.round(0.12 * SR);
    for (let i = 0; start + i < out.length; i++) {
      const sp = i * rate;
      const i0 = Math.floor(sp);
      if (i0 + 1 >= src.length) break;
      let v = src[i0] + (src[i0 + 1] - src[i0]) * (sp - i0);
      const abs = start + i;
      if (abs > relEnd) {
        const k = (abs - relEnd) / damp;
        if (k >= 1) break;
        v *= Math.pow(1 - k, 3);
      }
      out[abs] += v * n.vel;
    }
  }
  // Metronome tick coming out of the laptop speakers (the app's exact tick).
  const ticks = { true: makeClick(SR, true), false: makeClick(SR, false) };
  for (const c of clicks) {
    const tk = ticks[!!c.accent], start = Math.round(c.t * SR);
    for (let i = 0; i < tk.length && start + i < out.length; i++) out[start + i] += clickGain * 2 * tk[i];
  }
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const a = Math.exp(-2 * Math.PI * highpass / SR);
  let px = 0, py = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i] + noise * rnd();
    const y = a * (py + x - px); // one-pole high-pass: small laptop mics lose the bass
    px = x; py = y;
    out[i] = y;
  }
  return out;
}
