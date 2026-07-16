// Authentic Atari Star Wars (1983) POKEY sound-effect data for the WAV bake tool
// (story 8-7, Wave 5 audio).
//
// SOURCE — extracted verbatim from the cabinet's sound-board disassembly
// (6502... actually 6809 sound CPU, ROMs 136021-107 / 136021-208). The records
// below are transcribed from `FX_Tables.asm`; the field semantics and the
// command→sound mapping are decoded from `FX_Functions.asm` and `SW_Sound.asm`
// (the `off_7F61` "Sound/speech function pointer table"). Every byte here is real
// ROM data, not hand-tuned — see each effect's `rom` block for its provenance.
//
// ── FX RECORD FORMAT (Star Wars, 4-byte — NOT Tempest's 6-byte ALSOUN) ────────
// The SW sound board drives FX from TWO POKEYs (8 channels). Each effect is a
// dispatch entry: a channel-bitmap byte, then a pair of 16-bit pointers per
// active channel → (frequency list, volume/distortion list). Each list is a
// chain of 4-byte records, walked by the 4.096 ms sound IRQ:
//
//     fcb count, duration, value, delta            ; [byte0,byte1,byte2,byte3]
//       count    - number of values this record emits (ChTmr). 0 = end-of-list
//       duration - IRQ ticks to hold each value     (NoChTmr)
//       value    - first byte written to the POKEY register (AUDF or AUDC)
//       delta    - signed step added to value each tick after the first
//
// So one record emits `value, value+delta, … value+(count-1)·delta`, each held
// `duration` ticks (≈4.096 ms). Records chain until a `count=0` record, which
// writes 0 to the register (AUDC=0 ⇒ silence — the volume list is what ends the
// effect; per the ROM comment "Volume tables … control when FX end point is").
// `bake-sfx.mjs`'s `expandSwfx` walks these (see that file). Reference engine:
// `FX_Functions.asm` → `Sound_FX_1` / `Init_Sound_FX`.
//
// AUDC byte: bits 7-5 distortion select, bit 4 volume-only, bits 3-0 volume.
//   $Ax = pure tone · $8x = white noise · $Cx = poly4 buzz · $2x = gravelly.
// AUDF byte: frequency divider — lower = higher pitch.
//
// ── COMMAND → SOUND MAPPING (from off_7F61) ──────────────────────────────────
// Only `player_fire` is label-confirmed in the disassembly (`snd_Fire_Guns`,
// command $3A, commented "Fire lasers"). The other six are mapped to the
// best-matching ROM effect by envelope-shape analysis; each is still authentic
// cabinet data. `rom.command` + `rom.dispatch` pin the exact source so a
// mis-assignment is a one-line correction. `rom.confidence` flags this.

export const SFX = [
  {
    // ★ Player laser cannon — the iconic descending "pew". CONFIRMED: command
    // $3A is `snd_Fire_Guns`, commented "Fire lasers" in SW_Sound.asm. Two
    // channels: a long pure-tone freq sweep + a fast volume decay, doubled.
    name: 'player_fire',
    rom: {
      command: 0x3a,
      dispatch: 'byte_7354',
      label: 'snd_Fire_Guns ("Fire lasers")',
      confidence: 'confirmed',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'stru_6B46', vol: 'stru_6B4E' },
          freq: [[0x32, 1, 0x37, 4], [1, 2, 0xff, 0]],
          vol: [
            [1, 0xc, 0xa9, 0], [1, 0xa, 0xa8, 0], [1, 8, 0xa7, 0],
            [1, 6, 0xa6, 0], [1, 4, 0xa5, 0], [5, 2, 0xa4, 0xff],
            [1, 2, 0xa1, 0], [0, 0, 0, 0],
          ],
        },
        {
          src: { freq: 'stru_6B6B', vol: 'stru_6B73' },
          freq: [[1, 8, 5, 0], [0x2c, 1, 0x37, 4]],
          vol: [
            [1, 8, 0x47, 0], [1, 0x16, 0xa7, 0], [1, 6, 0xa6, 0],
            [1, 4, 0xa5, 0], [5, 2, 0xa4, 0xff], [1, 2, 0xa1, 0],
            [0, 0, 0, 0],
          ],
        },
      ],
    },
    gain: 0.85,
  },
  {
    // Enemy fireball (TIE / surface turret) — a short rising-pitch noisy zap, a
    // crisp counterpart to the player's descending cannon.
    name: 'enemy_fire',
    rom: {
      command: 0x2c,
      dispatch: 'byte_72FF',
      label: 'FX_loc_73D7',
      confidence: 'inferred — short rising noisy zap',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'stru_6A14', vol: 'stru_6A18' },
          freq: [[8, 2, 0x56, 0xf8]],
          vol: [[3, 2, 0x81, 1], [2, 2, 0x86, 4], [3, 2, 0x8c, 1], [0, 0, 0, 0]],
        },
      ],
    },
    gain: 0.8,
  },
  {
    // Enemy destroyed (TIE / turret) — a two-channel tone + white-noise burst.
    name: 'enemy_explosion',
    rom: {
      command: 0x2a,
      dispatch: 'byte_72ED',
      label: 'FX_loc_73C5',
      confidence: 'inferred — 2-channel tone + white-noise burst',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'stru_6903', vol: 'stru_691F' },
          freq: [[3, 0xa, 0xc, 1], [2, 8, 0xf, 1], [1, 6, 0x11, 0], [1, 6, 0x12, 0], [3, 4, 0x11, 0xff]],
          vol: [
            [1, 0x1a, 0x81, 0], [1, 0x10, 0x82, 0], [1, 6, 0x83, 0], [1, 4, 0x84, 0],
            [1, 6, 0x85, 0], [2, 4, 0x86, 1], [8, 2, 0x88, 1], [1, 2, 0x8f, 0],
            [1, 4, 0x8e, 0], [1, 6, 0x8d, 0], [2, 4, 0x8c, 0xff], [2, 6, 0x8a, 0xff],
            [7, 8, 0x88, 0xff], [1, 0x1c, 0x81, 0], [0, 0, 0, 0],
          ],
        },
        {
          src: { freq: 'stru_697D', vol: 'stru_698D' },
          freq: [[1, 0x34, 0x23, 0], [9, 2, 0x23, 0xff]],
          vol: [
            [1, 0x34, 0xc0, 0], [0xf, 2, 0xc1, 1], [1, 2, 0xcf, 0], [2, 4, 0xce, 0xff],
            [1, 2, 0xcc, 0], [1, 4, 0xcb, 0], [1, 2, 0xca, 0], [1, 4, 0xc9, 0],
            [1, 2, 0xc8, 0], [1, 4, 0xc7, 0], [5, 2, 0xc6, 0xff], [1, 2, 0xc2, 0],
            [1, 4, 0xc1, 0], [0, 0, 0, 0],
          ],
        },
      ],
    },
    gain: 0.85,
  },
  {
    // The ship loses a shield — a heavier two-channel noise burst than an enemy
    // death, so the player's own hit lands harder.
    name: 'player_explosion',
    rom: {
      command: 0x2e,
      dispatch: 'byte_7346',
      label: 'FX_loc_73FB',
      confidence: 'inferred — heavier 2-channel noise burst',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'stru_6917', vol: 'stru_6958' },
          freq: [[6, 2, 0xe, 0xff], [0x3b, 2, 0xa, 1]],
          vol: [
            [2, 2, 0x81, 1], [2, 2, 0x84, 3], [1, 2, 0x8b, 0], [2, 4, 0x8f, 0xff],
            [1, 6, 0x8d, 0], [2, 4, 0x8c, 0xff], [2, 6, 0x8a, 0xff], [7, 8, 0x88, 0xff],
            [1, 0x1c, 0x81, 0], [0, 0, 0, 0],
          ],
        },
        {
          src: { freq: 'stru_6985', vol: 'stru_69C2' },
          freq: [[6, 2, 0x1a, 0xff], [0x17, 2, 0x16, 1]],
          vol: [
            [2, 2, 0xc1, 1], [2, 2, 0xc4, 3], [1, 2, 0xcb, 0], [3, 4, 0xcf, 0xff],
            [1, 2, 0xcc, 0], [1, 4, 0xcb, 0], [1, 2, 0xca, 0], [1, 4, 0xc9, 0],
            [1, 2, 0xc8, 0], [1, 4, 0xc7, 0], [4, 2, 0xc6, 0], [2, 4, 0xc2, 0xff],
            [0, 0, 0, 0],
          ],
        },
      ],
    },
    gain: 0.9,
  },
  {
    // Phase cleared / warp to next stage — a four-voice pure-tone sweep (each
    // channel a steep pitch glissando, shared decaying volume). The cabinet's
    // most "transition"-like effect.
    name: 'wave_clear',
    rom: {
      command: 0x2d,
      dispatch: 'byte_735D',
      label: 'FX_loc_7419',
      confidence: 'inferred — 4-voice warp sweep (alt: $27 8-note fanfare byte_730E)',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'stru_6B8C', vol: 'stru_6C00' },
          freq: [[5, 1, 0x23, 1], [0xd, 1, 0x2a, 2], [9, 1, 0x45, 3], [8, 1, 0x61, 4], [4, 1, 0x83, 5], [5, 1, 0x99, 6], [4, 1, 0xb8, 7], [4, 1, 0xd5, 9]],
          vol: [[3, 6, 0xaf, 0xff], [3, 6, 0xab, 0xfe], [2, 8, 0xa4, 0xfd], [0, 0, 0, 0]],
        },
        {
          src: { freq: 'stru_6BAC', vol: 'stru_6C00' },
          freq: [[0x11, 1, 0x2d, 2], [0xa, 1, 0x4f, 3], [8, 1, 0x6e, 4], [5, 1, 0x90, 5], [7, 1, 0xaa, 6], [3, 1, 0xd7, 7], [2, 1, 0xed, 8]],
          vol: [[3, 6, 0xaf, 0xff], [3, 6, 0xab, 0xfe], [2, 8, 0xa4, 0xfd], [0, 0, 0, 0]],
        },
        {
          src: { freq: 'stru_6BC8', vol: 'stru_6C00' },
          freq: [[4, 1, 0x33, 1], [9, 1, 0x38, 2], [0xc, 1, 0x4b, 3], [7, 1, 0x6e, 4], [8, 1, 0x8a, 5], [5, 1, 0xb1, 6], [7, 1, 0xcf, 7]],
          vol: [[3, 6, 0xaf, 0xff], [3, 6, 0xab, 0xfe], [2, 8, 0xa4, 0xfd], [0, 0, 0, 0]],
        },
        {
          src: { freq: 'stru_6BE4', vol: 'stru_6C00' },
          freq: [[3, 1, 0x3c, 1], [0xa, 1, 0x40, 2], [0xd, 1, 0x55, 3], [9, 1, 0x7d, 4], [8, 1, 0xa2, 5], [6, 1, 0xcb, 6], [3, 1, 0xf1, 7]],
          vol: [[3, 6, 0xaf, 0xff], [3, 6, 0xab, 0xfe], [2, 8, 0xa4, 0xfd], [0, 0, 0, 0]],
        },
      ],
    },
    gain: 0.5,
  },
  {
    // Run start / ship spawn — a short buzzy (poly4) rising blip, doubled across
    // two channels in the ROM.
    name: 'spawn',
    rom: {
      command: 0x33,
      dispatch: 'byte_72F6',
      label: 'FX_loc_73D1',
      confidence: 'inferred — short buzzy rising blip',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'stru_69F3', vol: 'stru_69F7' },
          freq: [[1, 0x38, 3, 0]],
          vol: [[1, 0xa, 0x41, 0], [1, 8, 0x42, 0], [1, 6, 0x43, 0], [1, 4, 0x44, 0], [8, 2, 0x45, 1], [2, 1, 0x4d, 1], [1, 0xa, 0x4f, 0], [0, 0, 0, 0]],
        },
        {
          src: { freq: 'stru_69F3', vol: 'stru_69F7' },
          freq: [[1, 0x38, 3, 0]],
          vol: [[1, 0xa, 0x41, 0], [1, 8, 0x42, 0], [1, 6, 0x43, 0], [1, 4, 0x44, 0], [8, 2, 0x45, 1], [2, 1, 0x4d, 1], [1, 0xa, 0x4f, 0], [0, 0, 0, 0]],
        },
      ],
    },
    gain: 0.7,
  },
  {
    // Surface scrape / structure collision — a gravelly ($2x distortion)
    // descending-then-rising scrape.
    name: 'terrain_crash',
    rom: {
      command: 0x39,
      dispatch: 'byte_7304',
      label: 'FX_loc_73DD',
      confidence: 'inferred — gravelly descending scrape',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'stru_6A25', vol: 'stru_6A31' },
          freq: [[2, 2, 0x23, 0xff], [1, 0xa, 0x22, 0], [0x2f, 2, 2, 1]],
          vol: [
            [1, 4, 0x2f, 0], [1, 0xa, 0x20, 0], [3, 2, 0x2f, 0xff], [3, 4, 0x2c, 0xff],
            [3, 6, 0x29, 0xff], [2, 8, 0x26, 0xff], [1, 4, 0x24, 0], [2, 2, 4, 0x20],
            [2, 0xa, 0x23, 0xff], [1, 0xc, 0x21, 0], [0, 0, 0, 0],
          ],
        },
      ],
    },
    gain: 0.85,
  },
  {
    // sw7-8 (U-021) — the Death Star's own boom: ALL EIGHT channels rumble a
    // near-unison cluster (AUDF 70..78 with 74 SKIPPED — the ROM's gap; adjacent
    // divisors beat against each other) held 2 x 144 ticks, under one shared
    // volume chain: a $4F blast, a dip to silence, then a long 15-step decay.
    //
    // Transcribed from the ORIGINAL sound-board source, not the disassembly:
    // SNDAUD.MAC:1004 `AUDDF:: ;DEATH STAR FINAL EXPLOSION` -> DF tables
    // :315-347. Dotted literals are decimal (`144.`, `70.`); bare are hex. The
    // eight volume labels DF1C..DF8C fall through to ONE chain (:323-347), so
    // every channel carries the same envelope. The ROM's freq lists carry no
    // end record (the volume chain ends the effect ~30 ticks before the freq
    // list runs dry) — the explicit [0,0,0,0] below is our format's terminator,
    // unreachable in playback.
    name: 'death_star_boom',
    rom: {
      // 0x27 by counting SNDPBX's PBX table — see fireball_hit's calibration note.
      command: 0x27,
      dispatch: 'SNDPBX.MAC:116 (AUD DF)',
      label: 'AUDDF "DEATH STAR FINAL EXPLOSION" (SNDAUD.MAC:1004)',
      confidence: 'confirmed — original-source label',
    },
    swfx: {
      // The full DF8C decay runs 288 driver ticks = 2.36 s — past the default
      // 1.6 s sustained-envelope cap, which would silently cut the tail. This
      // chain is FINITE ROM data, so it declares its own ceiling.
      maxSeconds: 2.5,
      channels: [
        { src: { freq: 'DF1F', vol: 'DF1C -> DF8C chain' }, freq: [[2, 144, 70, 0], [0, 0, 0, 0]], vol: null },
        { src: { freq: 'DF2F', vol: 'DF2C -> DF8C chain' }, freq: [[2, 144, 71, 0], [0, 0, 0, 0]], vol: null },
        { src: { freq: 'DF3F', vol: 'DF3C -> DF8C chain' }, freq: [[2, 144, 72, 0], [0, 0, 0, 0]], vol: null },
        { src: { freq: 'DF4F', vol: 'DF4C -> DF8C chain' }, freq: [[2, 144, 73, 0], [0, 0, 0, 0]], vol: null },
        { src: { freq: 'DF5F', vol: 'DF5C -> DF8C chain' }, freq: [[2, 144, 75, 0], [0, 0, 0, 0]], vol: null },
        { src: { freq: 'DF6F', vol: 'DF6C -> DF8C chain' }, freq: [[2, 144, 76, 0], [0, 0, 0, 0]], vol: null },
        { src: { freq: 'DF7F', vol: 'DF7C -> DF8C chain' }, freq: [[2, 144, 77, 0], [0, 0, 0, 0]], vol: null },
        { src: { freq: 'DF8F', vol: 'DF8C' }, freq: [[2, 144, 78, 0], [0, 0, 0, 0]], vol: null },
      ].map((ch) => ({
        ...ch,
        // the shared DF8C chain, verbatim (dotted = decimal, bare = hex):
        vol: [
          [1, 10, 0x4f, 0], [1, 8, 0x40, 0], [1, 4, 0x4f, 0], [1, 6, 0x4e, 0],
          [1, 8, 0x4d, 0], [1, 10, 0x4c, 0], [1, 12, 0x4b, 0], [1, 14, 0x4a, 0],
          [1, 16, 0x49, 0], [1, 18, 0x48, 0], [1, 20, 0x47, 0], [1, 22, 0x46, 0],
          [1, 24, 0x45, 0], [1, 26, 0x44, 0], [1, 28, 0x43, 0], [1, 30, 0x42, 0],
          [1, 32, 0x41, 0], [0, 0, 0, 0],
        ],
      })),
    },
    gain: 0.9,
  },
  {
    // sw7-8 (U-022) — shooting an alien shot out of the air: a single-channel
    // high zap (AUDF 8) under a short RISING crackle (vol 1 -> 15 through two
    // delta ramps), nothing like the descending TIE explosion it replaces.
    //
    // SNDAUD.MAC:1028 `AUDSS:: ;PLAYER SHOT DOWN AN ALIEN SHOT` -> SS tables
    // :364-369 (`;SHOOTING ENEMY SHOTS`). `14.` is dotted DECIMAL; the AUDC
    // bytes ($41/$42/$4A/$4F) are hex. Same appended freq terminator note as
    // death_star_boom above.
    name: 'fireball_hit',
    rom: {
      // 0x34 by counting SNDPBX's PBX table (entry 0 = RESET, commented entries
      // skipped) — calibrated against six known ordinals (SPK STR=$16, TRU=$18,
      // YAU=$1A, PM DAR=$1D, 4TH=$20, RRP=$22, TH5=$24 all land).
      command: 0x34,
      dispatch: 'SNDPBX.MAC:131 (AUD SS)',
      label: 'AUDSS "PLAYER SHOT DOWN AN ALIEN SHOT" (SNDAUD.MAC:1028)',
      confidence: 'confirmed — original-source label',
    },
    swfx: {
      channels: [
        {
          src: { freq: 'SS8F', vol: 'SS8C' },
          freq: [[1, 14, 8, 0], [0, 0, 0, 0]],
          vol: [[1, 2, 0x41, 0], [7, 1, 0x42, 1], [3, 1, 0x4a, 2], [1, 2, 0x4f, 0], [0, 0, 0, 0]],
        },
      ],
    },
    gain: 0.8,
  },
];

export default SFX;
