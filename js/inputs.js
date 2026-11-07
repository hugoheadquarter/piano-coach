// Where notes come from: the microphone (acoustic piano), MIDI (digital piano), or the
// computer keyboard / on-screen keys. All of them call onNote({time, midi, src, ev}).
import { NoteDetector } from './detector.js';

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; this.start = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      if (this.n === 0) this.start = currentFrame;
      this.buf.set(ch, this.n);
      this.n += ch.length;
      if (this.n >= 512) { this.port.postMessage({ samples: this.buf.slice(0, this.n), frame: this.start }); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('pc-tap', Tap);`;

export class Mic {
  constructor(audio, onNote) {
    this.audio = audio;
    this.onNote = onNote;
    this.on = false;
    this.muteUntil = 0;
  }

  // testSource: an AudioNode to listen to instead of the microphone (automated tests).
  async start(testSource) {
    const ctx = this.audio.ctx;
    if (!testSource) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    }
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    this.src = testSource || ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'pc-tap');
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.src.connect(this.node).connect(this.sink).connect(ctx.destination);
    this.det = new NoteDetector(ctx.sampleRate, {
      onNote: (ev) => {
        if (ev.time < this.muteUntil) return; // the app's own piano sound
        this.onNote({ time: ev.time, midi: ev.midi, src: 'mic', ev });
      },
    });
    this.node.port.onmessage = (e) => this.det.push(e.data.samples, e.data.frame);
    this.on = true;
  }

  stop() {
    if (!this.on) return;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.src.disconnect();
    this.node.disconnect();
    this.on = false;
  }

  // Ignore what the mic hears while the app itself plays piano notes.
  mute(until) { this.muteUntil = Math.max(this.muteUntil, until); }
  get level() { return this.on ? this.det.level : 0; }
  fits(n, midi) { return n.ev ? this.det.fits(n.ev, midi) : false; }
  setClicks(times) { if (this.on) this.det.setClicks(times); }
}

export async function startMidi(audio, onNote, onDevices) {
  if (!navigator.requestMIDIAccess) return false;
  try {
    const access = await navigator.requestMIDIAccess();
    const hook = () => {
      const names = [];
      access.inputs.forEach((inp) => {
        names.push(inp.name);
        inp.onmidimessage = (m) => {
          const [st, note, vel] = m.data;
          if ((st & 0xf0) === 0x90 && vel > 0) {
            const age = (performance.now() - m.timeStamp) / 1000;
            onNote({ time: audio.now - Math.max(0, Math.min(age, 0.1)), midi: note, src: 'midi' });
          }
        };
      });
      onDevices(names);
    };
    access.onstatechange = hook;
    hook();
    return true;
  } catch { return false; }
}

// Computer keyboard: A S D F G H J K = C4..C5, Z X C V B N M = C3..B3, W E T Y U = black keys.
export const KEYMAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
  z: 48, x: 50, c: 52, v: 53, b: 55, n: 57, m: 59,
};
