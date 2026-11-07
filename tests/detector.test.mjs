// Offline check of the note detector: real piano samples + metronome clicks + noise + bass loss.
// node tests/detector.test.mjs /tmp/pc-test/raw
import { NoteDetector } from '../js/detector.js';
import { SONGS, parseSong } from '../js/songs.js';
import { render, SR } from './synth.mjs';

const raw = process.argv[2] || '/tmp/pc-test/raw';
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function run(song, { bpm, clickGain, highpass, noise, legato, sloppy, latencyIn = 0 }) {
  const { notes, beats } = parseSong(song);
  const spb = 60 / bpm, t0 = 1.0;
  const perf = notes.map((n) => ({
    midi: n.midi,
    t: t0 + n.beat * spb + (sloppy ? (rnd() - 0.5) * 0.12 : 0),
    dur: n.dur * spb * (legato ? 1.0 : 0.85),
    vel: 0.35 + rnd() * 0.65,
  }));
  // You can't re-strike a key without lifting it first: the damper stops the old sound.
  for (let i = 0; i + 1 < perf.length; i++) if (perf[i + 1].midi === perf[i].midi) perf[i].dur = Math.min(perf[i].dur, perf[i + 1].t - perf[i].t - 0.07);
  const clicks = [];
  for (let b = 0; b < beats; b++) clicks.push({ t: t0 + b * spb, accent: b % 4 === 0 });
  const sig = render(raw, perf, { length: t0 + beats * spb + 1.5, clicks, clickGain, noise, highpass, seed: 3 });
  const evs = [];
  const det = new NoteDetector(SR, { onNote: (e) => evs.push(e) });
  if (clickGain) det.setClicks(clicks.map((c) => c.t));
  for (let i = 0; i < sig.length; i += 512) det.push(sig.subarray(i, i + 512), i);
  // Match
  const used = new Set();
  let hit = 0, wrongPitch = 0, octave = 0, errs = [];
  for (const p of perf) {
    let best = -1;
    evs.forEach((e, i) => { if (!used.has(i) && Math.abs(e.time - p.t) < 0.07 && (best < 0 || Math.abs(e.time - p.t) < Math.abs(evs[best].time - p.t))) best = i; });
    if (best < 0) continue;
    used.add(best);
    const e = evs[best];
    if (e.midi === p.midi) { hit++; errs.push((e.time - p.t) * 1000); }
    else if (Math.abs(e.midi - p.midi) === 12 && det.fits(e, p.midi)) { octave++; errs.push((e.time - p.t) * 1000); }
    else wrongPitch++;
  }
  const extra = evs.length - used.size;
  errs.sort((a, b) => a - b);
  const med = errs[errs.length >> 1] || 0, worst = Math.max(...errs.map((x) => Math.abs(x - med)));
  return { n: perf.length, hit, octave, wrongPitch, missed: perf.length - hit - octave - wrongPitch, extra, med: med.toFixed(1), spread: worst.toFixed(1), extras: evs.filter((_, i) => !used.has(i)).map((e) => `${e.midi}@${e.time.toFixed(2)}${e.src[0]}`).slice(0, 4).join(' ') };
}

const configs = [
  { label: 'clean', bpm: 72, clickGain: 0, highpass: 40, noise: 0.0005 },
  { label: 'clicks loud', bpm: 72, clickGain: 0.4, highpass: 120, noise: 0.002 },
  { label: 'laptop mic', bpm: 90, clickGain: 0.25, highpass: 250, noise: 0.004 },
  { label: 'legato+sloppy', bpm: 100, clickGain: 0.25, highpass: 150, noise: 0.002, legato: true, sloppy: true },
];
let tot = { n: 0, ok: 0, bad: 0, extra: 0 };
for (const c of configs) for (const s of SONGS) {
  const r = run(s, c);
  tot.n += r.n; tot.ok += r.hit + r.octave; tot.bad += r.wrongPitch + r.missed; tot.extra += r.extra;
  console.log(`${c.label.padEnd(14)} ${s.id.padEnd(7)} ok ${r.hit}+${r.octave}oct/${r.n} wrong ${r.wrongPitch} miss ${r.missed} extra ${r.extra} timing med ${r.med}ms ±${r.spread} ${r.extras}`);
}
console.log('TOTAL', tot);
