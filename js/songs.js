// Day-one lessons. Everything sits in one five-finger position, so the hand never moves.
// Token: NOTE/DURATION/FINGER, measures split by "|". Durations: w h hd q qd 8.
// Right hand C position: C=1 D=2 E=3 F=4 G=5. Left hand C position: C=5 D=4 E=3 F=2 G=1.

export const SONGS = [
  {
    id: 'climb',
    title: 'Five-Finger Climb',
    hand: 'R', clef: 'treble', bpm: 60,
    tip: 'Right thumb on middle C. One finger per key: C D E F G = fingers 1 2 3 4 5.',
    music: 'C4/q/1 D4/q/2 E4/q/3 F4/q/4 | G4/q/5 F4/q/4 E4/q/3 D4/q/2 | C4/q/1 E4/q/3 D4/q/2 F4/q/4 | E4/q/3 D4/q/2 C4/h/1',
  },
  {
    id: 'buns',
    title: 'Hot Cross Buns',
    hand: 'R', clef: 'treble', bpm: 66,
    tip: 'Only three notes: E D C, fingers 3 2 1. The eighth notes are two per beat.',
    music: 'E4/q/3 D4/q/2 C4/h/1 | E4/q/3 D4/q/2 C4/h/1 | C4/8/1 C4/8/1 C4/8/1 C4/8/1 D4/8/2 D4/8/2 D4/8/2 D4/8/2 | E4/q/3 D4/q/2 C4/h/1',
  },
  {
    id: 'mary',
    title: 'Mary Had a Little Lamb',
    hand: 'R', clef: 'treble', bpm: 72,
    tip: 'Fingers 3 2 1 2 3 3 3. Half notes get two beats — keep holding the key.',
    music: 'E4/q/3 D4/q/2 C4/q/1 D4/q/2 | E4/q/3 E4/q/3 E4/h/3 | D4/q/2 D4/q/2 D4/h/2 | E4/q/3 G4/q/5 G4/h/5 | E4/q/3 D4/q/2 C4/q/1 D4/q/2 | E4/q/3 E4/q/3 E4/q/3 E4/q/3 | D4/q/2 D4/q/2 E4/q/3 D4/q/2 | C4/w/1',
  },
  {
    id: 'ode',
    title: 'Ode to Joy',
    hand: 'R', clef: 'treble', bpm: 72,
    tip: 'Beethoven. The dotted note is long, the next one short: "E — . D".',
    music: 'E4/q/3 E4/q/3 F4/q/4 G4/q/5 | G4/q/5 F4/q/4 E4/q/3 D4/q/2 | C4/q/1 C4/q/1 D4/q/2 E4/q/3 | E4/qd/3 D4/8/2 D4/h/2 | E4/q/3 E4/q/3 F4/q/4 G4/q/5 | G4/q/5 F4/q/4 E4/q/3 D4/q/2 | C4/q/1 C4/q/1 D4/q/2 E4/q/3 | D4/qd/2 C4/8/1 C4/h/1',
  },
  {
    id: 'jingle',
    title: 'Jingle Bells (chorus)',
    hand: 'R', clef: 'treble', bpm: 80,
    tip: 'Still the same five keys. Watch the jump from E up to G (finger 3 to 5).',
    music: 'E4/q/3 E4/q/3 E4/h/3 | E4/q/3 E4/q/3 E4/h/3 | E4/q/3 G4/q/5 C4/qd/1 D4/8/2 | E4/w/3 | F4/q/4 F4/q/4 F4/q/4 F4/q/4 | F4/q/4 E4/q/3 E4/q/3 E4/8/3 E4/8/3 | E4/q/3 D4/q/2 D4/q/2 E4/q/3 | D4/h/2 G4/h/5',
  },
  {
    id: 'left',
    title: 'Left Hand Climb',
    hand: 'L', clef: 'bass', bpm: 60,
    tip: 'Left pinky on the C below middle C. Pinky is 5, thumb is 1: C D E F G = 5 4 3 2 1.',
    music: 'C3/q/5 D3/q/4 E3/q/3 F3/q/2 | G3/q/1 F3/q/2 E3/q/3 D3/q/4 | C3/q/5 E3/q/3 G3/h/1 | G3/q/1 E3/q/3 C3/h/5',
  },
];

const DUR = { w: 4, h: 2, hd: 3, q: 1, qd: 1.5, 8: 0.5 };
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function nameToMidi(n) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  return (parseInt(m[3]) + 1) * 12 + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// -> { measures: [[note]], notes: [note], beats } ; note = {name, midi, dur, code, finger, beat, measure, index}
export function parseSong(song) {
  const measures = [];
  const notes = [];
  let beat = 0;
  song.music.split('|').forEach((m, mi) => {
    const list = [];
    for (const tok of m.trim().split(/\s+/)) {
      const [name, code, finger] = tok.split('/');
      const n = { name, midi: nameToMidi(name), code, dur: DUR[code], finger: +finger, beat, measure: mi, index: notes.length };
      list.push(n);
      notes.push(n);
      beat += n.dur;
    }
    measures.push(list);
  });
  return { measures, notes, beats: beat };
}

// Which key each finger rests on, for drawing the hand.
export function fingerMap(song, notes) {
  const map = {};
  for (const n of notes) map[n.finger] = n.midi;
  // Fill unused fingers with neighbouring white keys.
  const white = (m) => [0, 2, 4, 5, 7, 9, 11].includes(((m % 12) + 12) % 12);
  const dir = song.hand === 'R' ? 1 : -1; // finger number goes up = pitch goes up (R) or down (L)
  for (let f = 2; f <= 5; f++) if (map[f] == null && map[f - 1] != null) { let m = map[f - 1] + dir; while (!white(m)) m += dir; map[f] = m; }
  for (let f = 4; f >= 1; f--) if (map[f] == null && map[f + 1] != null) { let m = map[f + 1] - dir; while (!white(m)) m -= dir; map[f] = m; }
  return map;
}
