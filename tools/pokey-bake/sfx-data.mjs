// Star Wars (1983) POKEY sound-effect data for the WAV bake tool (story 8-7).
//
// The Atari Star Wars cabinet drives its SFX from a quad-POKEY sound board (plus
// a TMS5220 for speech — see the session's Wave-5 speech decision). Like Tempest,
// the effects are live POKEY synthesis, not PCM samples, so we reconstruct each
// from its POKEY register envelopes and bake one `.wav` per sound.
//
// We reuse Tempest's proven ALSOUN envelope format (the story's stated reuse
// target): each effect is two 6-byte sequences — one steers AUDF1 (pitch), one
// steers AUDC1 (distortion + volume) — walked by the sound IRQ at ~250 Hz
// (one beat ≈ 4 ms). `bake-sfx.mjs` expands them to register events and renders.
//
//     [ value, beats, delta, count, restart, stop ]
//       value   - first byte written to the register
//       beats   - sound-IRQ ticks to hold before the next change
//       delta   - signed amount added each step (0xFF = -1)
//       count   - number of writes; count=1 means "write once, no change"
//       restart - replay offset for looping sounds (0 = no loop)
//       stop    - terminator (0)
//
// AUDC byte: bits 7-5 distortion (A=pure tone, 8=white noise), bit 4 volume-only,
//            bits 3-0 volume (0-15). AUDF: lower divider = higher pitch.
//
// SOURCE NOTE: the authentic register tables live in the cabinet's sound
// disassembly under `reference/disasm/sound/` (gitignored; not present in this
// checkout). These envelopes are therefore AUTHENTIC-FEEL — hand-tuned to the
// game's iconic cues (the laser cannon "pew", explosions, the wave-clear sweep)
// and named/single-sourced here for easy correction once the real ROM tables are
// recovered. See the Dev deviation + finding in the 8-7 session.

export const SFX = [
  {
    // Player laser cannon — the iconic descending "pew". Pure tone, pitch
    // falls (divider rises) fast as the volume decays.
    name: 'player_fire',
    alsoun: {
      audf: [0x02, 0x02, 0x04, 0x14, 0x00, 0x00],
      audc: [0xa8, 0x02, 0xff, 0x0c, 0x00, 0x00],
    },
    gain: 0.85,
  },
  {
    // Enemy fireball (TIE fighter / surface turret). A higher, shorter cousin
    // of the player cannon so the two read as distinct in a firefight.
    name: 'enemy_fire',
    alsoun: {
      audf: [0x06, 0x02, 0x03, 0x10, 0x00, 0x00],
      audc: [0xa6, 0x02, 0xff, 0x0a, 0x00, 0x00],
    },
    gain: 0.8,
  },
  {
    // Enemy destroyed (TIE or turret) — a quick white-noise burst that fades.
    name: 'enemy_explosion',
    alsoun: {
      audf: [0x10, 0x03, 0x02, 0x14, 0x00, 0x00],
      audc: [0x88, 0x03, 0xff, 0x14, 0x00, 0x00],
    },
    gain: 0.85,
  },
  {
    // The ship loses a shield — a bigger, lower, longer noise burst than an
    // enemy death, so the player's own hit lands harder.
    name: 'player_explosion',
    alsoun: {
      audf: [0x20, 0x04, 0x02, 0x20, 0x00, 0x00],
      audc: [0x8f, 0x04, 0xff, 0x20, 0x00, 0x00],
    },
    gain: 0.9,
  },
  {
    // Phase cleared — a rising warp sweep (divider falls → pitch rises) at a
    // steady volume as the run dives to the next stage.
    name: 'wave_clear',
    alsoun: {
      audf: [0xc0, 0x02, 0xff, 0x60, 0x00, 0x00],
      audc: [0xa8, 0x02, 0x00, 0x60, 0x00, 0x00],
    },
    gain: 0.8,
  },
  {
    // Run start / ship spawn — a short upward blip.
    name: 'spawn',
    alsoun: {
      audf: [0x40, 0x02, 0xfe, 0x18, 0x00, 0x00],
      audc: [0xa6, 0x02, 0x00, 0x18, 0x00, 0x00],
    },
    gain: 0.7,
  },
  {
    // Surface scrape — a low, gravelly noise thud as the ship grazes the floor.
    name: 'terrain_crash',
    alsoun: {
      audf: [0x30, 0x04, 0x01, 0x10, 0x00, 0x00],
      audc: [0x8a, 0x04, 0xff, 0x10, 0x00, 0x00],
    },
    gain: 0.85,
  },
];

export default SFX;
