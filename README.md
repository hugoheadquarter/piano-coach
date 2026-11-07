# Piano Coach — Day 1

Play-along piano practice in the browser. Sheet music + metronome + a hand on an on-screen
keyboard showing which finger plays each key. It listens to your real piano through the
microphone and checks each note's pitch and timing.

**Modes:** Step (waits for the right key) · Play along (in time, scored) · Watch (hear it, see the hand).

- `js/detector.js` — note detector: strike (onset) detection + YIN pitch, knows the metronome tick times.
- `js/notation.js` — VexFlow sheet, playhead, note colors. `js/piano.js` — keyboard + hand (SVG).
- `js/songs.js` — lessons (`NOTE/DURATION/FINGER`, `|` between bars). `js/main.js` — modes and scoring.
- Inputs: microphone, MIDI keyboard (Chrome/Edge), computer keys, on-screen keys.

Tests: decode the samples to raw float (`ffmpeg -i samples/C4.mp3 -ac 1 -ar 48000 -f f32le raw/C4.f32`, for each)
then `node tests/detector.test.mjs raw`.

Credits: piano samples — Salamander Grand Piano by Alexander Holm (CC-BY 3.0).
Notation — VexFlow (MIT).
