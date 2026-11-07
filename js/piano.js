// On-screen keyboard with a hand resting in five-finger position (seen from above).
const NS = 'http://www.w3.org/2000/svg';
const WK = 44, KH = 200, BW = 27, BH = 124, HAND_H = 150;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const isBlack = (m) => [1, 3, 6, 8, 10].includes(m % 12);

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// Smooth closed curve through points (Catmull-Rom as cubic Béziers).
function smooth(pts, closed = true) {
  const n = pts.length;
  const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + (closed ? 'Z' : '');
}

// A finger seen from above: tapered, round tip, nail, two joint creases.
function fingerPath(base, tip, wb, wt) {
  const dx = tip[0] - base[0], dy = tip[1] - base[1];
  const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const c = [tip[0] - ux * wt / 2, tip[1] - uy * wt / 2];
  const bl = [base[0] + nx * wb / 2, base[1] + ny * wb / 2], br = [base[0] - nx * wb / 2, base[1] - ny * wb / 2];
  const tl = [c[0] + nx * wt / 2, c[1] + ny * wt / 2], tr = [c[0] - nx * wt / 2, c[1] - ny * wt / 2];
  const r = wt / 2;
  return {
    d: `M${bl[0]},${bl[1]} L${tl[0]},${tl[1]} A${r},${r} 0 0 0 ${tr[0]},${tr[1]} L${br[0]},${br[1]} Z`,
    c, ux, uy, nx, ny, len,
  };
}

export class Piano {
  constructor(svg, { low = 48, high = 84, onKey } = {}) {
    this.svg = svg;
    this.low = low;
    this.high = high;
    this.onKey = onKey;
    this.keys = {};
    this.fingers = {};
    this._build();
  }

  keyX(m) {
    let wi = 0;
    for (let k = this.low; k < m; k++) if (!isBlack(k)) wi++;
    return isBlack(m) ? wi * WK - BW / 2 : wi * WK;
  }

  keyCenter(m) { return this.keyX(m) + (isBlack(m) ? BW / 2 : WK / 2); }

  _build() {
    const svg = this.svg;
    svg.innerHTML = '';
    let whites = 0;
    for (let m = this.low; m <= this.high; m++) if (!isBlack(m)) whites++;
    this.W = whites * WK;
    svg.setAttribute('viewBox', `0 0 ${this.W} ${KH + HAND_H}`);
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
      <linearGradient id="wkey" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset=".85" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e5dc"/></linearGradient>
      <linearGradient id="bkey" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1b1f"/><stop offset=".9" stop-color="#3a3a42"/><stop offset="1" stop-color="#16161a"/></linearGradient>
      <linearGradient id="skinF" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c98e6a"/><stop offset=".3" stop-color="#f3cdb0"/><stop offset=".62" stop-color="#efc3a2"/><stop offset="1" stop-color="#c0835f"/></linearGradient>
      <radialGradient id="skinP" cx=".5" cy=".25" r=".85"><stop offset="0" stop-color="#f4cfb2"/><stop offset=".7" stop-color="#e3ae8b"/><stop offset="1" stop-color="#cf9572"/></radialGradient>
      <radialGradient id="nail" cx=".45" cy=".35" r=".7"><stop offset="0" stop-color="#fff3ec"/><stop offset="1" stop-color="#ecc3b3"/></radialGradient>
      <filter id="handShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#000" flood-opacity=".33"/></filter>`;
    el('rect', { x: 0, y: KH, width: this.W, height: HAND_H, fill: 'transparent' }, svg);
    const keysG = el('g', { class: 'keys' }, svg);
    const blacks = [];
    for (let m = this.low; m <= this.high; m++) {
      if (isBlack(m)) { blacks.push(m); continue; }
      const x = this.keyX(m);
      const g = el('g', { class: 'key white', 'data-m': m }, keysG);
      el('rect', { x: x + 0.5, y: 0, width: WK - 1, height: KH, rx: 5, class: 'face' }, g);
      const label = NAMES[m % 12] + (m === 60 ? '4' : '');
      el('text', { x: x + WK / 2, y: KH * 0.71, class: 'klabel' + (m === 60 ? ' mid' : '') }, g).textContent = label;
      this.keys[m] = g;
    }
    for (const m of blacks) {
      const x = this.keyX(m);
      const g = el('g', { class: 'key black', 'data-m': m }, keysG);
      el('rect', { x, y: 0, width: BW, height: BH, rx: 3, class: 'face' }, g);
      this.keys[m] = g;
    }
    el('rect', { x: 0, y: 0, width: this.W, height: 5, fill: '#7a1f2b' }, svg); // felt strip
    this.handG = el('g', { class: 'hand', filter: 'url(#handShadow)' }, svg);
    this.ripples = el('g', {}, svg);
    svg.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('.key');
      if (k && this.onKey) { e.preventDefault(); this.onKey(+k.dataset.m); }
    });
  }

  // fmap: finger (1-5) -> midi key it rests on. hand: 'R' | 'L'.
  setHand(hand, fmap) {
    this.hand = hand;
    this.fmap = fmap;
    const g = this.handG;
    g.innerHTML = '';
    this.fingers = {};
    const s = hand === 'R' ? 1 : -1;
    const tipY = (m) => (isBlack(m) ? BH - 16 : KH * 0.8);
    const W = { 1: 40, 2: 31, 3: 32, 4: 30, 5: 26 };
    const LEN = { 2: 84, 3: 92, 4: 86, 5: 68 };
    const tips = {}, kn = {};
    for (let f = 1; f <= 5; f++) tips[f] = [this.keyCenter(fmap[f]), tipY(fmap[f])];
    const cx = (tips[2][0] + tips[5][0]) / 2;
    for (let f = 2; f <= 5; f++) kn[f] = [tips[f][0] + (cx - tips[f][0]) * 0.1, KH * 0.8 + LEN[f]];
    tips[1][1] += 12;
    // The thumb comes in at an angle from low on the palm, not straight up like the fingers.
    const thumbBase = [kn[2][0] - s * 10, kn[2][1] + 62];

    const tdx = tips[1][0] - thumbBase[0], tdy = tips[1][1] - thumbBase[1], tl = Math.hypot(tdx, tdy);
    // point t of the way up the thumb, pushed sideways (side -1 = toward the index finger)
    function web(t, side) {
      const nx = (-tdy / tl) * s, ny = (tdx / tl) * s;
      return [thumbBase[0] + tdx * t - side * nx * (W[1] / 2 - 3), thumbBase[1] + tdy * t - side * ny * (W[1] / 2 - 3)];
    }
    // Palm outline: across the knuckles, down the pinky side, wrist, up past the thumb.
    const bottom = KH + HAND_H + 10;
    const palm = [
      [kn[2][0] - s * (W[2] / 2 + 3), kn[2][1] - 2],
      [kn[3][0], kn[3][1] - 7],
      [kn[4][0], kn[4][1] - 4],
      [kn[5][0] + s * (W[5] / 2 + 2), kn[5][1] + 6],
      [kn[5][0] + s * (W[5] / 2 + 6), kn[5][1] + 52],
      [cx + s * 44, bottom],
      [cx - s * 34, bottom],
      [thumbBase[0] - s * 26, thumbBase[1] + 10],
      // web of skin between thumb and index, partway up the thumb
      web(0.46, -1),
    ];

    const order = [5, 4, 3, 2, 1];
    for (const f of order) {
      const fg = el('g', { class: 'finger', 'data-f': f }, g);
      const base = f === 1 ? thumbBase : [kn[f][0], kn[f][1] + 22];
      const wt = W[f] * (f === 1 ? 0.86 : 0.84);
      const fp = fingerPath(base, tips[f], W[f], wt);
      el('path', { d: fp.d, fill: 'url(#skinF)', stroke: '#a96f50', 'stroke-width': 1.1, class: 'skin' }, fg);
      // nail
      const nc = [fp.c[0] + fp.ux * wt * 0.08, fp.c[1] + fp.uy * wt * 0.08];
      const ang = (Math.atan2(fp.uy, fp.ux) * 180) / Math.PI + 90;
      el('ellipse', { cx: nc[0], cy: nc[1], rx: wt * 0.3, ry: wt * 0.4, fill: 'url(#nail)', stroke: '#c99c88', 'stroke-width': 0.8, transform: `rotate(${ang} ${nc[0]} ${nc[1]})` }, fg);
      // joint creases
      for (const t of [0.42, 0.72]) {
        const p = [tips[f][0] - fp.ux * fp.len * t, tips[f][1] - fp.uy * fp.len * t];
        const hw = (wt + (W[f] - wt) * t) * 0.32;
        el('path', { d: `M${p[0] + fp.nx * hw},${p[1] + fp.ny * hw} Q${p[0] - fp.ux * 3},${p[1] - fp.uy * 3} ${p[0] - fp.nx * hw},${p[1] - fp.ny * hw}`, stroke: '#b27a5a', 'stroke-width': 1, fill: 'none', opacity: 0.55 }, fg);
      }
      const lp = [tips[f][0] - fp.ux * (wt + 22), tips[f][1] - fp.uy * (wt + 22)];
      const badge = el('g', { class: 'badge' }, fg);
      el('circle', { cx: lp[0], cy: lp[1], r: 10 }, badge);
      el('text', { x: lp[0], y: lp[1] + 4.5 }, badge).textContent = f;
      this.fingers[f] = { g: fg, tip: tips[f], midi: fmap[f] };
    }
    // Palm on top so the finger bases tuck under it.
    el('path', { d: smooth(palm), fill: 'url(#skinP)', stroke: '#a96f50', 'stroke-width': 1.1 }, g);
    for (let f = 2; f <= 5; f++) {
      el('ellipse', { cx: kn[f][0], cy: kn[f][1] + 4, rx: W[f] * 0.33, ry: 6, fill: '#f8dcc6', opacity: 0.55 }, g);
    }
    el('path', { d: `M${palm[8][0] + s * 6},${palm[8][1] + 6} Q${cx},${kn[3][1] + 60} ${palm[4][0] - s * 8},${palm[4][1] + 10}`, stroke: '#b98263', 'stroke-width': 1, fill: 'none', opacity: 0.35 }, g);
    // Badges above the palm so numbers stay readable.
    for (const f of order) g.appendChild(this.fingers[f].g.querySelector('.badge'));
    for (const f of order) this.fingers[f].badge = g.querySelectorAll('.badge')[order.indexOf(f)];
    this.setTarget(null);
  }

  setTarget(midi, finger) {
    Object.values(this.keys).forEach((k) => k.classList.remove('target'));
    Object.values(this.fingers).forEach((f) => { f.g.classList.remove('next'); f.badge.classList.remove('next'); });
    if (midi == null) return;
    if (this.keys[midi]) this.keys[midi].classList.add('target');
    const f = this.fingers[finger];
    if (f) { f.g.classList.add('next'); f.badge.classList.add('next'); }
  }

  // Key goes down (and the matching finger, if the hand covers that key).
  down(midi, cls = 'down', finger) {
    const k = this.keys[midi];
    if (k) { k.classList.remove('down', 'good', 'ok', 'bad', 'demo'); k.classList.add(cls); }
    const f = finger ? this.fingers[finger] : Object.values(this.fingers).find((x) => x.midi === midi);
    if (f) {
      f.g.classList.add('press');
      const r = el('circle', { cx: f.tip[0], cy: f.tip[1] + 8, r: 6, class: 'ripple ' + cls }, this.ripples);
      setTimeout(() => r.remove(), 600);
    }
  }

  up(midi) {
    const k = this.keys[midi];
    if (k) k.classList.remove('down', 'good', 'ok', 'bad', 'demo');
    Object.values(this.fingers).forEach((f) => { if (f.midi === midi) f.g.classList.remove('press'); });
  }

  flash(midi, cls, ms = 260) {
    this.down(midi, cls);
    clearTimeout(this['_t' + midi]);
    this['_t' + midi] = setTimeout(() => this.up(midi), ms);
  }

  allUp() { for (const m in this.keys) this.up(+m); }
}
