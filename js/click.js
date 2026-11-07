// Metronome tick: a short burst of filtered noise. Noise has no pitch, so the note
// detector can't mistake the tick for a piano key (a beep would read as a high note).
export function makeClick(sr, accent) {
  const n = Math.round(sr * 0.025);
  const out = new Float32Array(n);
  let s = accent ? 12345 : 54321;
  let lp = 0, hp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    const w = (s / 2147483647) * 2 - 1;
    lp += 0.55 * (w - lp); // gentle low-pass
    hp = 0.9 * (hp + lp - prev); // high-pass: thin, woody tick
    prev = lp;
    const t = i / sr;
    out[i] = hp * Math.exp(-t * (accent ? 160 : 220)) * (accent ? 1.6 : 1.1);
  }
  return out;
}
