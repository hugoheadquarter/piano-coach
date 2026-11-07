// Sheet music drawn with VexFlow, plus a moving playhead and per-note colors.
const VF = window.Vex.Flow;

const VF_DUR = { w: 'w', h: 'h', hd: 'hd', q: 'q', qd: 'qd', 8: '8' };

export class Sheet {
  constructor(host) {
    this.host = host;
    this.inner = document.createElement('div');
    this.inner.className = 'sheet-inner';
    host.appendChild(this.inner);
    this.cursor = document.createElement('div');
    this.cursor.className = 'cursor';
    this.halo = document.createElement('div');
    this.halo.className = 'halo';
  }

  render(song, parsed, opts) {
    this.song = song;
    this.parsed = parsed;
    this.inner.innerHTML = '';
    // Big enough to read from the piano bench: scale up to fill the paper.
    const hostW = Math.max(320, this.host.clientWidth - 8), hostH = Math.max(150, this.host.clientHeight - 6);
    const rowH = 150;
    let sc = 1, width = hostW, perRow = 4, rows = 1;
    for (let k = 0; k < 3; k++) {
      perRow = width > 880 ? 4 : width > 600 ? 3 : 2;
      rows = Math.ceil(parsed.measures.length / perRow);
      sc = Math.max(0.68, Math.min(1.5, hostH / (rows * rowH + 10), hostW / 560));
      width = Math.min(hostW / sc, 1300);
    }
    this.scale = sc;
    const div = document.createElement('div');
    this.inner.appendChild(div);
    const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
    renderer.resize(Math.round(width * sc), Math.round((rows * rowH + 10) * sc));
    const ctx = renderer.getContext();
    ctx.scale(sc, sc);
    const clef = song.clef;
    const firstExtra = 62, timeExtra = 28;
    const usable = width - 20;

    this.notes = [];
    this.rows = [];
    parsed.measures.forEach((measure, mi) => {
      const row = Math.floor(mi / perRow), col = mi % perRow;
      const base = (usable - firstExtra - (row === 0 ? timeExtra : 0)) / perRow;
      const x = 10 + (col === 0 ? 0 : firstExtra + (row === 0 ? timeExtra : 0) + base * col);
      const w = base + (col === 0 ? firstExtra + (row === 0 ? timeExtra : 0) : 0);
      const y = row * rowH + 22;
      const stave = new VF.Stave(x, y, w);
      if (col === 0) stave.addClef(clef);
      if (mi === 0) stave.addTimeSignature('4/4');
      if (mi === parsed.measures.length - 1) stave.setEndBarType(VF.Barline.type.END);
      stave.setContext(ctx).draw();

      const vfNotes = measure.map((n) => {
        const key = n.name[0].toLowerCase() + '/' + n.name.slice(-1);
        const sn = new VF.StaveNote({ clef, keys: [key], duration: VF_DUR[n.code], auto_stem: true });
        if (n.code.endsWith('d')) VF.Dot.buildAndAttach([sn], { all: true });
        if (opts.fingers) {
          sn.addModifier(new VF.Annotation(String(n.finger)).setFont('Arial', 13, 'bold')
            .setVerticalJustification(VF.Annotation.VerticalJustify.TOP), 0);
        }
        if (opts.letters) {
          sn.addModifier(new VF.Annotation(n.name[0]).setFont('Arial', 12)
            .setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
        }
        sn.setAttribute('id', 'pc' + n.index);
        return sn;
      });
      const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
      voice.addTickables(vfNotes);
      const beams = VF.Beam.generateBeams(vfNotes);
      new VF.Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 14);
      voice.draw(ctx, stave);
      beams.forEach((b) => b.setContext(ctx).draw());

      vfNotes.forEach((sn, i) => {
        const n = measure[i];
        const x0 = sn.getNoteHeadBeginX(), x1 = sn.getNoteHeadEndX();
        this.notes[n.index] = {
          x: ((x0 + x1) / 2) * sc, y: sn.getYs()[0] * sc, row,
          el: div.querySelector('#vf-pc' + n.index),
        };
      });
      if (col === 0) this.rows[row] = { top: (y + 30) * sc, bottom: (y + 72) * sc, start: stave.getNoteStartX() * sc, end: (x + w) * sc };
      else this.rows[row].end = (x + w) * sc;
    });
    this.inner.appendChild(this.cursor);
    this.inner.appendChild(this.halo);
    this.svg = div.querySelector('svg');
    this.setCursorBeat(null);
    this.setCurrent(null);
  }

  setState(i, cls) {
    const n = this.notes[i];
    if (!n || !n.el) return;
    n.el.classList.remove('st-good', 'st-ok', 'st-bad', 'st-play');
    if (cls) n.el.classList.add('st-' + cls);
  }

  clearStates() { this.notes.forEach((_, i) => this.setState(i, null)); }

  // Blue ring around the note you should play next.
  setCurrent(i) {
    const n = i == null ? null : this.notes[i];
    if (!n) { this.halo.style.display = 'none'; return; }
    this.halo.style.display = 'block';
    this.halo.style.left = n.x + 'px';
    this.halo.style.top = n.y + 'px';
    this._scrollTo(n.row);
  }

  // Vertical line that sweeps through the music in time with the beat.
  setCursorBeat(beat) {
    if (beat == null || !this.notes.length) { this.cursor.style.display = 'none'; return; }
    const notes = this.parsed.notes;
    let i = 0;
    while (i + 1 < notes.length && notes[i + 1].beat <= beat) i++;
    const a = this.notes[i], n = notes[i];
    let x;
    if (beat < notes[0].beat) x = this.rows[0].start - 10;
    else {
      const nb = notes[i + 1];
      const b = nb && this.notes[i + 1].row === a.row ? this.notes[i + 1].x : this.rows[a.row].end - 6;
      const span = (nb ? nb.beat : n.beat + n.dur) - n.beat;
      x = a.x + (b - a.x) * Math.min(1, Math.max(0, (beat - n.beat) / span));
    }
    const r = this.rows[a.row];
    this.cursor.style.display = 'block';
    this.cursor.style.left = x + 'px';
    this.cursor.style.top = r.top - 12 + 'px';
    this.cursor.style.height = r.bottom - r.top + 24 + 'px';
    this._scrollTo(a.row);
  }

  // Floating word ("Perfect", "Late", ...) above a note.
  pop(i, text, cls) {
    const n = this.notes[i];
    if (!n) return;
    const p = document.createElement('div');
    p.className = 'pop pop-' + cls;
    p.textContent = text;
    p.style.left = n.x + 'px';
    p.style.top = this.rows[n.row].top - 14 + 'px';
    this.inner.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }

  _scrollTo(row) {
    if (row === this._row) return;
    this._row = row;
    const r = this.rows[row];
    const top = r.top - 30, bottom = r.bottom + 40;
    if (top < this.host.scrollTop || bottom > this.host.scrollTop + this.host.clientHeight) {
      this.host.scrollTo({ top: top, behavior: 'smooth' });
    }
  }
}
