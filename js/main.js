import { SONGS, parseSong, fingerMap } from './songs.js';
import { Audio } from './audio.js';
import { Mic, startMidi, KEYMAP } from './inputs.js';
import { Sheet } from './notation.js';
import { Piano } from './piano.js';

const $ = (id) => document.getElementById(id);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const letter = (m) => NAMES[((m % 12) + 12) % 12];
const store = {
  get(k, d) { try { const v = localStorage.getItem('pc.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pc.' + k, JSON.stringify(v)); } catch {} },
};

const audio = new Audio();
const sheet = new Sheet($('sheet'));
const piano = new Piano($('piano'), { onKey: (m) => virtualKey(m) });
let mic = null;

const S = {
  songIndex: 0, song: null, parsed: null, mode: store.get('mode', 'step'), bpm: 60,
  metro: store.get('metro', true), run: null, idx: 0, slips: 0, stepSlip: [], marks: [],
  midiOn: false, calib: null,
  opts: { letters: store.get('letters', true), fingers: store.get('fingers', true), guide: store.get('guide', true) },
};
audio.metroVolume = store.get('vol', 0.8);

// ---------- setup ----------
SONGS.forEach((s, i) => {
  const o = document.createElement('option');
  o.value = i;
  o.textContent = `${i + 1}. ${s.title}`;
  $('song').appendChild(o);
});
$('song').onchange = () => loadSong(+$('song').value);
document.querySelectorAll('#mode button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$('slower').onclick = () => setBpm(S.bpm - 4);
$('faster').onclick = () => setBpm(S.bpm + 4);
$('metro').onclick = () => { S.metro = !S.metro; store.set('metro', S.metro); $('metro').classList.toggle('on', S.metro); };
$('metro').classList.toggle('on', S.metro);
$('start').onclick = () => startStop();
$('show').onclick = () => showMe();
$('mic').onclick = () => toggleMic();
$('gear').onclick = () => openSettings();
$('closeSettings').onclick = () => $('settings').classList.add('hidden');
$('again').onclick = () => { closeResults(); resetMode(); if (S.mode !== 'step') startStop(); };
$('slowerAgain').onclick = () => { closeResults(); setBpm(S.bpm - 8); if (S.mode !== 'step') startStop(); };
$('nextSong').onclick = () => { closeResults(); loadSong((S.songIndex + 1) % SONGS.length); };
for (const [id, key] of [['optLetters', 'letters'], ['optFingers', 'fingers'], ['optGuide', 'guide']]) {
  $(id).checked = S.opts[key];
  $(id).onchange = () => { S.opts[key] = $(id).checked; store.set(key, S.opts[key]); if (key !== 'guide') repaint(); };
}
$('optVol').value = audio.metroVolume;
$('optVol').oninput = () => { audio.metroVolume = +$('optVol').value; store.set('vol', audio.metroVolume); };
$('calibrate').onclick = () => calibrate();

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) && e.key !== ' ') return;
  if (e.key === ' ') { e.preventDefault(); if (document.activeElement?.blur) document.activeElement.blur(); startStop(); return; }
  if (e.key === 'Enter') { e.preventDefault(); showMe(); return; }
  if (e.key === 'Escape') { closeResults(); $('settings').classList.add('hidden'); return; }
  const m = KEYMAP[e.key.toLowerCase()];
  if (m) { e.preventDefault(); virtualKey(m); }
});
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(repaint, 150); });

// ---------- song / mode ----------
function loadSong(i) {
  stopRun();
  S.songIndex = i;
  S.song = SONGS[i];
  S.parsed = parseSong(S.song);
  store.set('song', i);
  $('song').value = i;
  S.bpm = store.get('bpm.' + S.song.id, S.song.bpm);
  $('bpm').textContent = S.bpm;
  $('title').textContent = S.song.title;
  $('tip').textContent = S.song.tip;
  piano.setHand(S.song.hand, fingerMap(S.song, S.parsed.notes));
  resetMode();
}

function setMode(m) {
  S.mode = m;
  store.set('mode', m);
  resetMode();
}

function setBpm(b) {
  S.bpm = Math.max(30, Math.min(160, b));
  $('bpm').textContent = S.bpm;
  store.set('bpm.' + S.song.id, S.bpm);
  if (S.run) stopRun();
}

function repaint() {
  sheet.render(S.song, S.parsed, S.opts);
  S.marks.forEach((c, i) => c && sheet.setState(i, c));
  if (S.mode === 'step') sheet.setCurrent(S.idx < S.parsed.notes.length ? S.idx : null);
}

function mark(i, cls) { S.marks[i] = cls; sheet.setState(i, cls); }

function resetMode() {
  stopRun();
  document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
  S.marks = [];
  S.idx = 0;
  S.slips = 0;
  S.stepSlip = [];
  repaint();
  piano.allUp();
  piano.setTarget(null);
  $('show').style.display = S.mode === 'watch' ? 'none' : '';
  if (S.mode === 'step') {
    $('start').textContent = 'Restart';
    stepTarget();
  } else if (S.mode === 'play') {
    $('start').textContent = 'Start';
    const n = S.parsed.notes[0];
    piano.setTarget(n.midi, n.finger);
    sheet.setCurrent(0);
    say(`Press <b>Start</b>: 4 clicks count you in, then play on the clicks. First note: <b>${letter(n.midi)}</b>, finger <b>${n.finger}</b>.`);
  } else {
    $('start').textContent = 'Play';
    say('Press <b>Play</b> to hear the song and watch which finger plays each note.');
  }
  updateScore();
}

function say(html) { $('say').innerHTML = html; }

// ---------- input ----------
function matches(n, midi) {
  if (n.midi === midi) return true;
  return n.src === 'mic' && Math.abs(n.midi - midi) === 12 && mic && mic.fits(n, midi);
}

function handleInput(n) {
  if (S.midiOn && n.src === 'mic') return;
  $('heard').textContent = noteName(n.midi);
  $('heard').classList.remove('blink');
  void $('heard').offsetWidth;
  $('heard').classList.add('blink');
  if (S.calib) { S.calib.hits.push(n.time); piano.flash(n.midi, 'down'); return; }
  if (S.mode === 'step') stepInput(n);
  else if (S.mode === 'play' && S.run) playInput(n);
  else piano.flash(n.midi, 'down');
}

async function virtualKey(m) {
  await audio.init();
  audio.playNote(m, audio.now, 0.5, 0.8);
  if (mic) mic.mute(audio.now + 1.0);
  handleInput({ time: audio.now, midi: m, src: 'key' });
}

// ---------- Step mode: the app waits for the right key ----------
function stepTarget() {
  const n = S.parsed.notes[S.idx];
  if (!n) { piano.setTarget(null); sheet.setCurrent(null); return; }
  sheet.setCurrent(S.idx);
  piano.setTarget(n.midi, n.finger);
  const same = S.idx > 0 && S.parsed.notes[S.idx - 1].midi === n.midi ? ' again' : '';
  say(`Play <b>${letter(n.midi)}</b>${same} with finger <b>${n.finger}</b>` + (mic?.on || S.midiOn ? '' : ' <span class="muted">— turn on the mic so I can hear your piano</span>'));
}

function stepInput(n) {
  const nt = S.parsed.notes[S.idx];
  if (!nt) { piano.flash(n.midi, 'down'); return; }
  if (matches(n, nt.midi)) {
    mark(S.idx, S.stepSlip[S.idx] ? 'ok' : 'good');
    piano.flash(nt.midi, 'good', 300);
    S.idx++;
    updateScore();
    if (S.idx >= S.parsed.notes.length) finishStep();
    else stepTarget();
  } else {
    piano.flash(n.midi, 'bad', 400);
    if (!S.stepSlip[S.idx]) S.slips++;
    S.stepSlip[S.idx] = true;
    sheet.pop(S.idx, 'Try again', 'bad');
    say(`That was <b>${letter(n.midi)}</b>. Find <b>${letter(nt.midi)}</b> — finger <b>${nt.finger}</b> (it's lit up below).`);
    updateScore();
  }
}

function finishStep() {
  piano.setTarget(null);
  sheet.setCurrent(null);
  const n = S.parsed.notes.length, clean = n - S.slips;
  const stars = S.slips === 0 ? 3 : S.slips <= 3 ? 2 : 1;
  say('Done! Press <b>Restart</b> to go again, or switch to <b>Play along</b>.');
  showResults({
    stars, title: S.slips === 0 ? 'Every note right!' : 'You got through it!',
    grid: [['Notes', n], ['Right first try', clean], ['Slips', S.slips]],
    note: S.slips === 0 ? 'Now try <b>Play along</b> to add the timing.' : 'Run it again until there are no slips, then try <b>Play along</b>.',
    nextLabel: 'Play along',
  });
}

// ---------- Play along: in time with the metronome, scored ----------
const micOffset = () => store.get('offset', null) ?? audio.outLatency + 0.02;
const offsetFor = (src) => (src === 'mic' ? micOffset() : audio.outLatency);
const win = (n, spb) => Math.min(0.32, Math.max(0.15, 0.5 * spb * Math.min(1, n.dur)));

async function startStop() {
  if (S.mode === 'step') { resetMode(); return; }
  if (S.run) { stopRun(); resetMode(); return; }
  await audio.init();
  if (S.mode === 'play') startPlay();
  else startWatch();
}

function scheduleClicks(t0, spb, countIn, beats, bus, always) {
  const times = [];
  for (let b = -countIn; b < Math.ceil(beats); b++) {
    const t = t0 + b * spb;
    if (b < 0 || always) audio.click(t, ((b % 4) + 4) % 4 === 0, bus);
    times.push(t);
  }
  return times;
}

function startPlay() {
  const spb = 60 / S.bpm, notes = S.parsed.notes;
  const t0 = audio.now + 0.3 + 4 * spb;
  const bus = audio.bus();
  const clicks = scheduleClicks(t0, spb, 4, S.parsed.beats, bus, S.metro);
  if (mic) mic.setClicks((S.metro ? clicks : clicks.filter((t) => t < t0)).map((t) => t + micOffset()));
  S.marks = [];
  sheet.clearStates();
  S.run = { kind: 'play', t0, spb, bus, judged: notes.map(() => null), guide: 0, guideUp: [], end: t0 + S.parsed.beats * spb };
  $('start').textContent = 'Stop';
  say(mic?.on || S.midiOn ? 'Count in… play on the clicks.' : 'Count in… <span class="muted">(mic is off — use the computer keys or turn the mic on)</span>');
  updateScore();
  loop();
}

function playInput(n) {
  const R = S.run, notes = S.parsed.notes;
  const t = n.time - offsetFor(n.src);
  let best = -1, bestWrong = -1;
  notes.forEach((nt, i) => {
    const T = R.t0 + nt.beat * R.spb, d = Math.abs(t - T);
    if (d > win(nt, R.spb)) return;
    const j = R.judged[i];
    if (matches(n, nt.midi) && (!j || j.kind === 'wrong')) { if (best < 0 || d < Math.abs(t - (R.t0 + notes[best].beat * R.spb))) best = i; }
    else if (!j) { if (bestWrong < 0 || d < Math.abs(t - (R.t0 + notes[bestWrong].beat * R.spb))) bestWrong = i; }
  });
  if (best >= 0) {
    const nt = notes[best], dt = t - (R.t0 + nt.beat * R.spb), a = Math.abs(dt);
    const fixed = R.judged[best]?.kind === 'wrong';
    const kind = fixed ? (dt < 0 ? 'early' : 'late') : a <= 0.09 ? 'perfect' : a <= 0.18 ? 'good' : dt < 0 ? 'early' : 'late';
    R.judged[best] = { kind, dt };
    const cls = kind === 'perfect' || kind === 'good' ? 'good' : 'ok';
    mark(best, cls);
    sheet.pop(best, { perfect: 'Perfect', good: 'Good', early: 'Early', late: 'Late' }[kind], cls);
    piano.flash(nt.midi, cls, 260);
  } else if (bestWrong >= 0) {
    R.judged[bestWrong] = { kind: 'wrong', played: n.midi };
    mark(bestWrong, 'bad');
    sheet.pop(bestWrong, letter(n.midi) + '?', 'bad');
    piano.flash(n.midi, 'bad', 350);
  } else {
    piano.flash(n.midi, 'bad', 250);
  }
  updateScore();
}

function loop() {
  const R = S.run;
  if (!R) return;
  const now = audio.now, notes = S.parsed.notes, out = audio.outLatency;
  const heard = now - out; // what the player is hearing right now
  const beat = (heard - R.t0) / R.spb;
  sheet.setCursorBeat(Math.max(beat, -0.001));
  $('count').textContent = beat < 0 ? String(Math.ceil(-beat)) : '';
  $('count').classList.toggle('show', beat < 0);
  if (beat >= 0 && !R.started) {
    R.started = true;
    if (R.kind === 'play') say('Play! Keep each note on its click. The blue line shows where you are.');
  }

  if (R.kind === 'play') {
    // Light up the next note to play.
    let g = notes.findIndex((nt, i) => !R.judged[i] && R.t0 + nt.beat * R.spb > heard - 0.08);
    if (g !== R.lit) {
      R.lit = g;
      if (g >= 0) { piano.setTarget(notes[g].midi, notes[g].finger); sheet.setCurrent(g); } else { piano.setTarget(null); sheet.setCurrent(null); }
    }
    // Missed notes.
    const off = micOffset();
    notes.forEach((nt, i) => {
      if (!R.judged[i] && now > R.t0 + nt.beat * R.spb + win(nt, R.spb) + off + 0.15) {
        R.judged[i] = { kind: 'miss' };
        mark(i, 'bad');
        sheet.pop(i, 'Miss', 'bad');
        updateScore();
      }
    });
    if (S.opts.guide) guideHand(R, heard, notes, false);
    if (R.judged.every(Boolean) && now > R.end + off + 0.3) { finishPlay(); return; }
  } else {
    guideHand(R, heard, notes, true);
    if (heard > R.end + 0.4) { finishWatch(); return; }
  }
  R.raf = requestAnimationFrame(loop);
}

// The on-screen hand presses each note at its moment (Watch, and the Play along guide).
function guideHand(R, heard, notes, full) {
  while (R.guide < notes.length && heard >= R.t0 + notes[R.guide].beat * R.spb) {
    const nt = notes[R.guide];
    const upAt = R.t0 + (nt.beat + nt.dur * 0.85) * R.spb;
    if (full) { piano.down(nt.midi, 'demo', nt.finger); mark(R.guide, 'play'); sheet.setCurrent(R.guide); }
    else piano.fingers[nt.finger]?.g.classList.add('press');
    R.guideUp.push({ at: upAt, nt, full });
    R.guide++;
  }
  R.guideUp = R.guideUp.filter((u) => {
    if (heard < u.at) return true;
    if (u.full) piano.up(u.nt.midi); else piano.fingers[u.nt.finger]?.g.classList.remove('press');
    return false;
  });
}

function finishPlay() {
  const R = S.run;
  stopRun();
  const c = { perfect: 0, good: 0, early: 0, late: 0, wrong: 0, miss: 0 };
  R.judged.forEach((j) => c[j.kind]++);
  const n = R.judged.length;
  const pts = c.perfect + 0.85 * c.good + 0.5 * (c.early + c.late);
  const pct = Math.round((100 * pts) / n);
  const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
  const dts = R.judged.filter((j) => j.dt != null).map((j) => j.dt);
  const avg = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
  let note;
  if (c.miss + c.wrong > n / 3) note = 'Lots of missed notes. Try <b>Slower</b>, or practice it in <b>Step</b> mode first.';
  else if (dts.length >= 5 && avg > 0.07) note = `You tend to come in a little <b>late</b> (about ${Math.round(avg * 1000)} ms). If it felt right on the click, run <b>Calibrate</b> in settings ⚙︎.`;
  else if (dts.length >= 5 && avg < -0.07) note = `You tend to <b>rush</b> — about ${Math.round(-avg * 1000)} ms early. Wait for the click.`;
  else if (stars === 3) note = 'Clean and in time. Try it a little faster, or move to the next song.';
  else note = 'Good. Play it again and aim for all green.';
  const bestKey = 'best.' + S.song.id;
  const best = Math.max(store.get(bestKey, 0), pct);
  store.set(bestKey, best);
  say(`Score <b>${pct}%</b>. Press <b>Start</b> to go again.`);
  showResults({
    stars, title: `${pct}%`,
    grid: [['Perfect', c.perfect], ['Good', c.good], ['Early / late', c.early + c.late], ['Wrong', c.wrong], ['Missed', c.miss], ['Best', best + '%']],
    note,
  });
}

// ---------- Watch: hear it and see the hand ----------
async function startWatch() {
  if (audio.samples.size < 10) { say('Loading the piano sound…'); await audio._loading; }
  const spb = 60 / S.bpm, notes = S.parsed.notes;
  const count = S.metro ? 4 : 1;
  const t0 = audio.now + 0.3 + count * spb;
  const bus = audio.bus();
  if (S.metro) scheduleClicks(t0, spb, 4, S.parsed.beats, bus, true);
  notes.forEach((nt) => audio.playNote(nt.midi, t0 + nt.beat * spb, nt.dur * spb * 0.92, 0.7, bus));
  const end = t0 + S.parsed.beats * spb;
  if (mic) mic.mute(end + 1.5);
  S.marks = [];
  sheet.clearStates();
  piano.setTarget(null);
  S.run = { kind: 'watch', t0, spb, bus, guide: 0, guideUp: [], end };
  $('start').textContent = 'Stop';
  say('Watch the hand: the lit finger presses each key.');
  loop();
}

function finishWatch() {
  stopRun();
  S.marks = [];
  sheet.clearStates();
  say('Your turn! Try it in <b>Step</b> mode first, then <b>Play along</b>.');
}

function stopRun() {
  const R = S.run;
  if (!R) return;
  cancelAnimationFrame(R.raf);
  try { R.bus.disconnect(); } catch {}
  S.run = null;
  if (mic) { mic.setClicks([]); if (R.kind === 'watch') mic.muteUntil = audio.now + 0.4; }
  piano.allUp();
  Object.values(piano.fingers).forEach((f) => f.g.classList.remove('press'));
  sheet.setCursorBeat(null);
  $('count').classList.remove('show');
  $('start').textContent = S.mode === 'watch' ? 'Play' : 'Start';
}

// ---------- Show me: play the next note and press the finger ----------
async function showMe() {
  if (S.run || S.mode === 'watch') return;
  await audio.init();
  const nt = S.parsed.notes[S.mode === 'step' ? S.idx : 0];
  if (!nt) return;
  audio.playNote(nt.midi, audio.now, 0.7, 0.8);
  if (mic) mic.mute(audio.now + 1.3);
  piano.down(nt.midi, 'demo', nt.finger);
  setTimeout(() => piano.up(nt.midi), 600);
  say(`This one: <b>${letter(nt.midi)}</b> with finger <b>${nt.finger}</b>. Now you.`);
}

// ---------- mic ----------
async function toggleMic() {
  await audio.init();
  if (S.midiOn) { say('Your piano is connected by cable, so the mic isn\'t needed. Just play.'); return; }
  if (mic?.on) {
    mic.stop();
    $('mic').classList.remove('on');
    $('micLabel').textContent = 'Turn on mic';
    if (S.mode === 'step') stepTarget();
    return;
  }
  try {
    $('micLabel').textContent = 'Starting…';
    mic = new Mic(audio, handleInput);
    await mic.start();
    $('mic').classList.add('on');
    $('micLabel').textContent = 'Listening';
    meter();
    if (S.mode === 'step') stepTarget();
    if (!store.get('micHint', false)) {
      store.set('micHint', true);
      say('Mic is on. Play any key — its name should show under <b>Heard</b> at the top. Then play the blue key.');
    }
  } catch (e) {
    mic = null;
    $('micLabel').textContent = 'Mic blocked';
    say('I couldn\'t open the microphone. Allow mic access for this page in your browser (the icon in the address bar), then try again.');
  }
}

function meter() {
  if (!mic?.on) { $('meter').style.width = '0'; return; }
  const db = 20 * Math.log10(mic.level + 1e-6);
  $('meter').style.width = Math.max(0, Math.min(100, ((db + 60) / 50) * 100)) + '%';
  requestAnimationFrame(meter);
}

// ---------- calibration: how late does the mic hear things? ----------
async function calibrate() {
  $('settings').classList.add('hidden');
  if (S.run) stopRun();
  await audio.init();
  if (!mic?.on) await toggleMic();
  if (!mic?.on) return;
  const spb = 0.75, t0 = audio.now + 0.4 + 4 * spb;
  const bus = audio.bus();
  const clicks = scheduleClicks(t0, spb, 4, 8, bus, true).filter((t) => t >= t0 - 1e-6);
  mic.setClicks([]);
  S.calib = { hits: [] };
  say('<b>Calibrating:</b> after 4 count-in clicks, play any key <b>exactly on each of the next 8 clicks</b>.');
  setTimeout(() => {
    const hits = S.calib.hits;
    S.calib = null;
    try { bus.disconnect(); } catch {}
    const diffs = [];
    for (const c of clicks) {
      let best = null;
      for (const h of hits) if (Math.abs(h - c) < 0.4 && (best === null || Math.abs(h - c) < Math.abs(best - c))) best = h;
      if (best !== null) diffs.push(best - c);
    }
    if (diffs.length < 5) { say(`I only caught ${diffs.length} of 8 notes. Play a bit louder and try <b>Calibrate</b> again.`); return; }
    diffs.sort((a, b) => a - b);
    const off = diffs[diffs.length >> 1];
    store.set('offset', off);
    calInfoText();
    say(`Calibrated: your mic hears the piano about <b>${Math.round(off * 1000)} ms</b> after the click. Timing scores now account for that.`);
  }, (t0 - audio.now + 8 * spb + 0.8) * 1000);
}

function calInfoText() {
  const o = store.get('offset', null);
  $('calInfo').textContent = o == null ? 'Not calibrated yet (using a guess). Do this once per device/speaker setup.' : `Mic delay: ${Math.round(o * 1000)} ms.`;
}

function openSettings() {
  calInfoText();
  $('settings').classList.remove('hidden');
  connectMidi();
}

// ---------- digital piano over USB (MIDI): exact keys, no mic needed ----------
function connectMidi() {
  if (S.midiAsked || !navigator.requestMIDIAccess) return;
  S.midiAsked = true;
  startMidi(audio, (n) => handleInput(n), (names) => {
    const was = S.midiOn;
    S.midiOn = names.length > 0;
    S.midiNames = names;
    inputUI();
    if (S.midiOn && !was) say('Your piano is connected by cable — I can see every key exactly. No mic needed.');
    if (!S.midiOn && was) say('Piano cable disconnected. Plug it back in, or turn on the mic.');
    if (S.mode === 'step' && !S.run && S.idx < S.parsed.notes.length) setTimeout(stepTarget, 2500);
  });
}

function inputUI() {
  if (S.midiOn) {
    if (mic?.on) mic.stop(); // otherwise every note would count twice (cable + speakers)
    $('mic').classList.remove('on');
    $('mic').classList.add('midi');
    $('micLabel').textContent = 'Piano connected';
    $('inputs').textContent = 'your piano over USB (' + S.midiNames.join(', ') + ')';
  } else {
    $('mic').classList.remove('midi');
    $('micLabel').textContent = mic?.on ? 'Listening' : 'Turn on mic';
    $('inputs').textContent = 'microphone (acoustic piano)';
  }
}

// Connect on the first tap/key (Chrome asks once); right away if already allowed.
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { audio.init(); connectMidi(); }, { once: true }));
navigator.permissions?.query({ name: 'midi' }).then((st) => { if (st.state === 'granted') connectMidi(); }).catch(() => {});

// ---------- results / score ----------
function updateScore() {
  const R = S.run;
  if (S.mode === 'step') {
    const n = S.parsed.notes.length;
    $('score').innerHTML = `<b>${Math.min(S.idx, n)}</b> / ${n} notes` + (S.slips ? ` · ${S.slips} slip${S.slips > 1 ? 's' : ''}` : '');
  } else if (S.mode === 'play' && R) {
    const c = { good: 0, ok: 0, bad: 0 };
    R.judged.forEach((j) => { if (!j) return; if (j.kind === 'perfect' || j.kind === 'good') c.good++; else if (j.kind === 'early' || j.kind === 'late') c.ok++; else c.bad++; });
    $('score').innerHTML = `<span class="g">${c.good} on time</span> · <span class="o">${c.ok} off</span> · <span class="b">${c.bad} missed/wrong</span>`;
  } else {
    const best = store.get('best.' + S.song.id, null);
    $('score').innerHTML = best != null && S.mode === 'play' ? `Best: <b>${best}%</b>` : '';
  }
}

function showResults({ stars, title, grid, note, nextLabel }) {
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('');
  $('resTitle').textContent = title;
  $('resGrid').innerHTML = grid.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('');
  $('resNote').innerHTML = note;
  $('slowerAgain').style.display = S.mode === 'play' ? '' : 'none';
  $('nextSong').textContent = nextLabel || 'Next song';
  $('nextSong').onclick = nextLabel === 'Play along'
    ? () => { closeResults(); setMode('play'); }
    : () => { closeResults(); loadSong((S.songIndex + 1) % SONGS.length); };
  $('results').classList.remove('hidden');
}

function closeResults() { $('results').classList.add('hidden'); }

loadSong(Math.min(store.get('song', 0), SONGS.length - 1));

// Hook for automated tests: feed audio in place of the microphone.
window.__pc = {
  S, audio, get mic() { return mic; }, loadSong, setMode, setBpm, startStop,
  async useTestSource(node) { await audio.init(); mic = new Mic(audio, handleInput); await mic.start(node); },
};
