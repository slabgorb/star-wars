// tools/music-bake/pm-player.test.mjs — RED for sw6-1.
//
// The player is a port of SNDPM.MAC, "(RUSTY'S POKEY MUSIC) DRIVER, 6809 VERSION".
// Nothing under tools/music-bake/ exists yet, so this file is RED today (valid RED).
//
// ── THE CONTRACT DEV MUST BUILD ──────────────────────────────────────────────
//   decodeVoice(bytes) -> {
//     notes: [{ note, duration, volume }, …]
//              in play order, with .LOOP already expanded and rests included.
//              `note` is the EFFECTIVE index into NOTTAB — the key offset from
//              .NKEY/.CKEY is already applied, because that is the note that
//              actually sounds. A REST (0) stays 0 however the key is shifted.
//              `volume` is the voice volume in effect for that note.
//     tempo:        number   the .NRATE in effect at the start
//     freqEnvelope: number   the .FENV id in effect at the start
//     ampEnvelope:  number   the .AENV id in effect at the start
//   }
//   NOTTAB: number[]   note -> 16-bit AUDF divisor. NOTTAB[0] = 0 (REST).
//
//   decodeVoice THROWS on any opcode or envelope it does not implement. It must
//   never silently no-op — that is how a tune loses a voice and nobody notices,
//   and it is the exact failure mode that kept this game silent for a whole epic.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'

import { decodeVoice, NOTTAB } from './pm-player.mjs'

// SNDPM.MAC's dispatch table (PKDT, SNDPM.MAC:934). The opcode byte is 0x80 | index,
// where index is the entry's position in PKDT:
//
//   0 PKARAT  1 PKCRAT  2 PKAAMP  3 PKCAMP  4 PKAKEY  5 PKCKEY  6 PKFRQE  7 PKAMPE
//   8 PKCHK   9 PKRCHK  A PKCON   B PKPKC   C PKSYN   D PKCPH   E PKSL    F PKEL
//  10 PKGOSB 11 PKRET
const OP = {
  NRATE: 0x80, // absolute rate (tempo)   — operand is DECIMAL in the source
  CRATE: 0x81, // change rate
  NVOL: 0x82, //  absolute volume
  CVOL: 0x83, //  change volume           — operand is SIGNED
  NKEY: 0x84, //  absolute key (transpose)
  CKEY: 0x85, //  change key
  FENV: 0x86, //  frequency envelope select
  AENV: 0x87, //  amplitude envelope select
  CHK: 0x88, //   sync check
  RCHK: 0x89, //  reset sync check
  VC: 0x8a, //    voice control (AUDC)
  PKC: 0x8b, //   pokey control
  SYN: 0x8c, //   sync
  CALL: 0x8d, //  call phrase (PKCPH)
  LOOP: 0x8e, //  start loop (PKSL)
  ENDL: 0x8f, //  end loop   (PKEL)
  GOSUB: 0x90, // PKGOSB
  RETURN: 0x91, // PKRET
}
const ENDT = [0x00, 0x00] // .ENDT — the 0,0 terminator

// Frequency envelopes (SWMUS.MAC:6-13) and amplitude envelopes (SWMUS.MAC:16-21).
const FENV = { NUL: 0, OFS: 1, HRN: 2, TRB: 3, BAS: 4, GLK: 5, WW: 6 }
const AENV = { NUL: 0, SDR: 1, HRD: 2, QKR: 3, TIE: 4 }

// Measured across all 24 in-scope voice streams (space = TH5+THB, towers = SW4+REB,
// trench = RR, imperialMarch = DAR): these are the opcodes the music ACTUALLY reaches…
const REACHED = {
  NRATE: [OP.NRATE, 120],
  NVOL: [OP.NVOL, 9],
  CVOL: [OP.CVOL, -1],
  NKEY: [OP.NKEY, 0],
  CKEY: [OP.CKEY, 0],
  FENV: [OP.FENV, FENV.OFS], // only NUL and OFS are ever selected
  AENV: [OP.AENV, AENV.QKR], // only SDR, HRD, QKR, TIE are ever selected
}
// …and these are the ones it never reaches. AC-2 lets them go unimplemented — but
// they must THROW, not quietly do nothing.
// sw7-8 shrank this set: the death knell (SF2) reaches CRATE/VC/SYN, so those
// three are now IMPLEMENTED (see pm-player's handlers + tune-data.test.mjs's
// knell oracle). CALL/GOSUB/RETURN still throw — gen-music-data flattens them
// at generation time, so a stream carrying one is a generator bug.
const NEVER_REACHED = [OP.CHK, OP.RCHK, OP.PKC, OP.CALL, OP.GOSUB, OP.RETURN]

const F5 = 0x42 // 5*12 + 5 + 1
const G5 = 0x44
const D5 = 0x3f
const REST = 0x00

describe('sw6-1 AC-2 — the player implements every opcode the four tunes reach', () => {
  it('decodes a bare note stream, terminated by .ENDT', () => {
    const v = decodeVoice([F5, 0x16, D5, 0x20, ...ENDT])
    expect(v.notes.map((n) => [n.note, n.duration])).toEqual([
      [F5, 0x16],
      [D5, 0x20],
    ])
  })

  it('stops at .ENDT and does not run off the end of the stream', () => {
    // Bytes after the terminator are not music. A player that reads past it will
    // decode whatever sits next in the ROM as notes.
    const v = decodeVoice([F5, 0x16, ...ENDT, D5, 0x20, G5, 0x40])
    expect(v.notes).toHaveLength(1)
    expect(v.notes[0].note).toBe(F5)
  })

  it('does NOT mistake a rest for a terminator — note 0 with a duration is a REST', () => {
    // `.BYTE 00, 020` is R1E, a rest held 0x20 ticks. ONLY 0,0 ends the tune.
    // A player that breaks on `note === 0` truncates the trench theme at its first
    // rest — and every assertion about the notes before it would still pass.
    // (lang-review JS #4: 0 is falsy.)
    const v = decodeVoice([F5, 0x16, REST, 0x20, D5, 0x14, ...ENDT])
    expect(v.notes.map((n) => [n.note, n.duration])).toEqual([
      [F5, 0x16],
      [REST, 0x20],
      [D5, 0x14],
    ])
  })

  it('plays a .LOOP body exactly N times (PKSL stores N; PKEL decs and exits at zero)', () => {
    // SNDPM.MAC:1056-1069. `.LOOP 2` = the body twice in total, not once-plus-two.
    const v = decodeVoice([OP.LOOP, 2, F5, 0x16, D5, 0x20, OP.ENDL, 0, ...ENDT])
    expect(v.notes.map((n) => n.note)).toEqual([F5, D5, F5, D5])
  })

  it('plays a .LOOP 3 body three times, then resumes the stream after .ENDL', () => {
    const v = decodeVoice([OP.LOOP, 3, F5, 0x10, OP.ENDL, 0, D5, 0x40, ...ENDT])
    expect(v.notes.map((n) => n.note)).toEqual([F5, F5, F5, D5])
  })

  it('wraps .LOOP 0 to 256 passes, because PKEL decrements an 8-BIT register', () => {
    // `DEC VLC / LBEQ done` on a byte: 0 - 1 = 255, which is not zero, so the body
    // runs 256 times. No shipped tune uses `.LOOP 0` — but the friendlier reading
    // ("a count of zero means skip the body") is a silent divergence from the ROM,
    // and this file claims to BE the ROM.
    const v = decodeVoice([OP.LOOP, 0, F5, 0x16, OP.ENDL, 0, ...ENDT])
    expect(v.notes).toHaveLength(256)
  })

  it('takes the tempo from .NRATE', () => {
    const v = decodeVoice([OP.NRATE, 152, F5, 0x16, ...ENDT])
    expect(v.tempo).toBe(152)
  })

  it('reports the settings in effect at the FIRST note, not the last', () => {
    // The voice evolves: SW4V1 opens on .AENV 1 and ends on .AENV 3. Reporting the
    // final value while the doc promises the opening one is a lie a single-op test
    // stream can never catch, because in a one-note stream they are the same value.
    const v = decodeVoice([OP.AENV, AENV.SDR, F5, 0x16, OP.AENV, AENV.QKR, D5, 0x16, ...ENDT])
    expect(v.ampEnvelope).toBe(AENV.SDR)
  })

  it('takes the initial envelopes from .FENV / .AENV', () => {
    const v = decodeVoice([OP.FENV, FENV.OFS, OP.AENV, AENV.QKR, F5, 0x16, ...ENDT])
    expect(v.freqEnvelope).toBe(FENV.OFS)
    expect(v.ampEnvelope).toBe(AENV.QKR)
  })

  it('reads the .CVOL operand as SIGNED — -1 is a fade, 255 is nonsense', () => {
    // DARV4 (SWMUS.MAC:3602) ends on a run of `;.CVOL -1` -> `.BYTE 83, -1`: the
    // Imperial March's dying fall. Read unsigned, each step ADDS 255 instead of
    // subtracting one, and the fade becomes a blare.
    const v = decodeVoice([OP.NVOL, 9, OP.CVOL, -1, F5, 0x16, ...ENDT])
    expect(v.notes[0].volume).toBe(8)
  })

  it('applies .CVOL cumulatively, so a run of them is a fade', () => {
    const v = decodeVoice([OP.NVOL, 9, OP.CVOL, -1, F5, 0x10, OP.CVOL, -1, D5, 0x10, ...ENDT])
    expect(v.notes.map((n) => n.volume)).toEqual([8, 7])
  })

  it('transposes the sounding note with .CKEY', () => {
    // `.CKEY` shifts the key by a signed semitone offset (SF2V1-4 use 0, -1, -3, -6
    // to build "PARALLEL DESCENDING SEMI-TONE SCALES"). F5 + 2 semitones = G5.
    const v = decodeVoice([OP.CKEY, 2, F5, 0x16, ...ENDT])
    expect(v.notes[0].note).toBe(G5)
  })

  it('leaves a REST a rest, however the key is shifted', () => {
    // The 0-is-falsy trap once more, and the nastier half of it: transposing a
    // rest by +2 would turn silence into a C#0 drone that plays under the tune.
    const v = decodeVoice([OP.CKEY, 2, REST, 0x20, ...ENDT])
    expect(v.notes[0].note).toBe(REST)
  })
})

describe('sw6-1 AC-2 — an opcode the player does NOT implement must THROW, never no-op', () => {
  // This is the load-bearing rule of the whole epic. @arcade/shared's audio engine
  // degrades silently at every failure path, which is why four 404ing .wav files
  // read as "working code" for an entire epic. The player must not repeat that: an
  // unhandled opcode that quietly does nothing costs a voice, and a tune missing
  // one of its four voices still sounds like music. (lang-review JS #1.)
  const nameOf = (op) => Object.keys(OP).find((k) => OP[k] === op)

  for (const op of NEVER_REACHED) {
    it(`throws on .${nameOf(op)} (0x${op.toString(16)}) rather than skipping it`, () => {
      expect(() => decodeVoice([op, 0x00, F5, 0x16, ...ENDT])).toThrow()
    })
  }

  it('names the offending opcode in the error, so a future tune fails loudly', () => {
    expect(() => decodeVoice([OP.GOSUB, 0x00, 0x00, ...ENDT])).toThrow(/90|GOSUB/i)
  })

  it('does NOT throw on any opcode the four tunes actually reach', () => {
    // The mirror image: the throw-set must not be so eager that it rejects the
    // music we have to play. Each opcode is fed an operand the real tunes use.
    for (const [name, [op, operand]] of Object.entries(REACHED)) {
      expect(() => decodeVoice([op, operand, F5, 0x16, ...ENDT]), `.${name} must be implemented`).not.toThrow()
    }
    expect(() => decodeVoice([OP.LOOP, 2, F5, 0x16, OP.ENDL, 0, ...ENDT]), '.LOOP/.ENDL must be implemented').not.toThrow()
  })
})

describe('sw6-1 AC-2 — a note that falls OFF NOTTAB must throw, not become a rest', () => {
  // The nastiest shape of the silent no-op, because the fallback is not "nothing" —
  // it is NOTTAB[0], the REST divisor, which force-mutes the channel. A note that
  // walked off the table would not crash, would not warn, and would not even sound
  // wrong: it would sound like a rest, inside a tune, and the bake would still report
  // a healthy peak. Silence mistaken for correctness is the bug this epic exists to end.
  //
  // And it is reachable by TRANSPOSITION, not just by corrupt data: `.CKEY` is signed
  // and COMPOUNDS inside a `.LOOP` — the shipped towers/SW4 voices step −12 then −24
  // over two passes before `.NKEY 0` resets them.
  it('throws when .CKEY walks a note below the table, rather than falling silent', () => {
    // -30 per pass, compounding: 66 -> 36 -> 6 -> -24, and -24 is not a note.
    const walkOff = [OP.LOOP, 4, F5, 0x16, OP.CKEY, -30, OP.ENDL, 0, ...ENDT]
    expect(() => decodeVoice(walkOff)).toThrow(/NOTTAB/i)
  })

  it('throws when .CKEY walks a note above the table', () => {
    expect(() => decodeVoice([OP.CKEY, 40, F5, 0x16, ...ENDT])).toThrow(/NOTTAB/i)
  })

  it('names the note AND the key offset, so the tune that did it is findable', () => {
    // A bare "index out of range" would send the next reader to the wrong file.
    try {
      decodeVoice([OP.CKEY, -70, F5, 0x16, ...ENDT])
      throw new Error('expected decodeVoice to throw')
    } catch (e) {
      expect(e.message).toMatch(/-70/) // the key
      expect(e.message).toMatch(new RegExp(String(F5))) // the note as written
      expect(e.message).toMatch(/-4\b/) // what it actually sounded as
    }
  })

  it('does NOT throw for a transposition that stays on the table', () => {
    // The mirror image: the guard must not be so eager that it rejects real music.
    // The shipped corpus's lowest effective note is 25 and its highest is 73.
    expect(() => decodeVoice([OP.CKEY, -12, F5, 0x16, ...ENDT])).not.toThrow()
    expect(() => decodeVoice([OP.NKEY, 0, F5, 0x16, ...ENDT])).not.toThrow()
  })

  it('still leaves a REST alone, however far the key has wandered', () => {
    // A rest is never transposed, so it can never fall off the table — even at a key
    // offset that would have thrown for a real note.
    const v = decodeVoice([OP.CKEY, -70, REST, 0x20, ...ENDT])
    expect(v.notes[0].note).toBe(REST)
  })
})

describe('sw6-1 AC-2 — envelopes: the ones the tunes select work, the rest throw', () => {
  // Measured across all 24 in-scope voices: frequency envelopes NUL and OFS only;
  // amplitude envelopes SDR, HRD, QKR and TIE.
  const FREQ_USED = [FENV.NUL, FENV.OFS]
  const FREQ_UNUSED = [FENV.HRN, FENV.TRB, FENV.BAS, FENV.GLK, FENV.WW]
  const AMP_USED = [AENV.SDR, AENV.HRD, AENV.QKR, AENV.TIE]

  for (const id of FREQ_USED) {
    const name = Object.keys(FENV).find((k) => FENV[k] === id)
    it(`implements frequency envelope ${name} (${id})`, () => {
      expect(() => decodeVoice([OP.FENV, id, F5, 0x16, ...ENDT])).not.toThrow()
    })
  }

  for (const id of FREQ_UNUSED) {
    const name = Object.keys(FENV).find((k) => FENV[k] === id)
    it(`throws on the unimplemented frequency envelope ${name} (${id})`, () => {
      // An instrument that silently falls back to "no envelope" is a voice that has
      // quietly lost its character. Fail instead of shrugging.
      expect(() => decodeVoice([OP.FENV, id, F5, 0x16, ...ENDT])).toThrow()
    })
  }

  for (const id of AMP_USED) {
    const name = Object.keys(AENV).find((k) => AENV[k] === id)
    it(`implements amplitude envelope ${name} (${id})`, () => {
      expect(() => decodeVoice([OP.AENV, id, F5, 0x16, ...ENDT])).not.toThrow()
    })
  }
  // NOTE: amplitude envelope NUL (0) is deliberately NOT in the throw-set. No
  // in-scope tune selects it, but NUL means "no envelope" — it is the identity,
  // not an unimplemented instrument, and demanding a throw would make a voice that
  // legitimately disables its envelope crash. Logged as a deviation in the session.
})

describe('sw6-1 AC-2/AC-4 — NOTTAB, the note -> AUDF table (SNDPM.MAC:1085)', () => {
  it('puts a REST at index 0 — the source literally says `.WORD 0 ;REST`', () => {
    expect(NOTTAB[0]).toBe(0)
  })

  it('anchors on C octave 0 = 0xB493, which the source states in BOTH bases', () => {
    // `.WORD 0B493  ; 46227   --OCTAVE 0 ;C  16.3516 HZ`
    expect(NOTTAB[1]).toBe(0xb493)
    expect(NOTTAB[1]).toBe(46227) // the source's own decimal comment agrees
  })

  it('REFUTES a decimal reading of the table at an all-digit entry', () => {
    // The letter-bearing entries (0B493) cannot be misread — they are not decimal
    // numerals at all. The trap is the ALL-DIGIT entries, which parse either way
    // and quietly differ. NOTTAB[76] is D#6:
    //     `.WORD 00258  ; 600.469 --  ;D# 1244.51 HZ`   (SNDPM.MAC:1161)
    // Hex 0x258 = 600, which is what the source's own decimal comment says. A
    // decimal parse yields 258 — a divisor the source never names, and a pitch
    // more than an octave sharp.
    expect(NOTTAB[76]).toBe(0x258)
    expect(NOTTAB[76]).toBe(600)
    expect(NOTTAB[76]).not.toBe(258)
  })

  it('descends monotonically — a bigger divisor is a lower pitch', () => {
    // A single mis-transcribed digit almost always breaks this.
    const notes = NOTTAB.slice(1)
    for (const d of notes) expect(d).toBeGreaterThan(0)
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeLessThan(notes[i - 1])
  })

  it('halves the divisor every twelve semitones — that is what an octave IS', () => {
    for (const base of [1, 13, 25]) {
      const ratio = NOTTAB[base] / NOTTAB[base + 12]
      expect(ratio).toBeGreaterThan(1.98)
      expect(ratio).toBeLessThan(2.02)
    }
  })

  it('covers every note the four tunes actually play (0x19 .. 0x49)', () => {
    // Measured range across all 24 in-scope voices: C2 (25) through C6 (73).
    expect(NOTTAB.length).toBeGreaterThan(0x49)
  })
})
