// Sound: real grand piano samples (Salamander, CC-BY 3.0) and the metronome tick.
import { makeClick } from './click.js';

const SAMPLE_NAMES = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' };

export class Audio {
  constructor() {
    this.ctx = null;
    this.samples = new Map();
    this.metroVolume = 0.8;
  }

  // Must be called from a click/tap (browsers only allow sound after a gesture).
  async init() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.clickBufs = [false, true].map((acc) => {
      const data = makeClick(this.ctx.sampleRate, acc);
      const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      b.getChannelData(0).set(data);
      return b;
    });
    this._loading = this._loadSamples();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async _loadSamples() {
    const jobs = [];
    for (let oct = 2; oct <= 6; oct++) for (const k in SAMPLE_NAMES) {
      const midi = (oct + 1) * 12 + +k;
      jobs.push(fetch(`samples/${SAMPLE_NAMES[k]}${oct}.mp3`).then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)))
        .then((buf) => this.samples.set(midi, buf)).catch(() => {}));
    }
    await Promise.all(jobs);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // Seconds between "scheduled" and "heard from the speakers".
  get outLatency() {
    const c = this.ctx;
    if (!c) return 0.02;
    return (c.outputLatency || 0.01) + (c.baseLatency || 0.005);
  }

  bus() {
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  playNote(midi, when = this.now, dur = 0.6, vel = 0.8, out = this.master) {
    let best = null;
    for (const m of this.samples.keys()) if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
    const t = Math.max(when, this.now);
    const g = this.ctx.createGain();
    g.connect(out);
    if (best !== null && Math.abs(best - midi) <= 3) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.samples.get(best);
      src.playbackRate.value = Math.pow(2, (midi - best) / 12);
      g.gain.setValueAtTime(vel, t);
      g.gain.setValueAtTime(vel, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.35);
      src.connect(g);
      src.start(t);
      src.stop(t + dur + 0.4);
      return;
    }
    // Samples still loading: a simple soft tone so the button still answers.
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    [1, 2, 3].forEach((h) => {
      const o = this.ctx.createOscillator();
      const hg = this.ctx.createGain();
      o.frequency.value = f * h;
      hg.gain.setValueAtTime(0.25 / h, t);
      hg.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.3);
      o.connect(hg).connect(g);
      o.start(t);
      o.stop(t + dur + 0.35);
    });
    g.gain.value = vel;
  }

  click(when, accent, out = this.master) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.clickBufs[accent ? 1 : 0];
    const g = this.ctx.createGain();
    g.gain.value = this.metroVolume;
    src.connect(g).connect(out);
    src.start(Math.max(when, this.now));
  }
}
