// pm-player.mjs — a port of SNDPM.MAC, "(RUSTY'S POKEY MUSIC) DRIVER, 6809 VERSION".
//
// This is the cabinet's music player, not an approximation of it. It walks a voice's
// byte stream (lifted verbatim into music-data.mjs), keeps the driver's per-voice
// state, and produces the exact POKEY register writes the 6809 would have made.
//
// ── THE DRIVER, AS THE ROM WRITES IT ─────────────────────────────────────────
//
// Every instruction is a 2-byte pair — the fetch is `LDB ,X++` (6809 post-increment
// BY TWO, SNDPM.MAC:699), so opcode/note and operand/duration always travel together.
// The high bit of the first byte separates them: `TSTB / LBMI PKFUN` (SNDPM.MAC:701).
// Pitches top out at 0x49, so they never collide with the 0x80.. opcode space.
//
// Each tick, for one voice (SNDPM.MAC:686-695):
//
//     VSEQ += 1                      (saturating at 255 — ticks since the note began)
//     ODUR += -RATE                  (ORATE is stored pre-negated)
//     if ODUR >= 0: same note, just re-apply the envelopes
//     else:         fetch the next note
//
// A note sets `ODUR += (dur >> 1) * 128` (SNDPM.MAC:749-757 — shift out the tie flag,
// then scale), ACCUMULATING onto whatever overrun was left, so timing never drifts.
// Bit 0 of the duration byte is the TIE flag: a non-tied note resets VSEQ, restarting
// the envelope; a tied note lets it run on.
//
// End of tune is a DURATION byte of 0 (SNDPM.MAC:737-741) — not a note byte of 0,
// which is a REST. `.ENDL` is `8F,00`, whose second byte is also zero, but its first
// byte has the high bit set, so it is an opcode and never mistaken for a terminator.
//
// Output (SNDPM.MAC:817-905):
//
//     freq = NOTTAB[note] + sign_extend(FREQ_ENV[VSEQ >> 1]) * 8
//     vol  = AMP_ENV[min(VSEQ, 31)] + VVOL     clamped to 0..15
//     AUDC = vol | VAC                          (VAC defaults to 0xA0 — pure tone)
//     a REST (NOTTAB[0] == 0) force-mutes the amplitude: `LDA #0F0` masks the volume off
//
// ── THE ONE THING THAT IS NOT THE ROM: THE CLOCK ─────────────────────────────
//
// NOTTAB's divisors are computed for the cabinet's 1.512 MHz POKEY ("RPM NOTE TABLE
// (FOR 1.512 MHZ CLOCK)"). The vendored web-pokey models an Atari, whose POKEY runs
// at sampleRate * divider (1,776,000 Hz at 48 kHz). Feed a 1.512 MHz divisor to a
// 1.776 MHz chip and every note comes out ~17% sharp — very nearly three semitones.
//
// So the divisor is rescaled to preserve the cabinet's PITCH:
//
//     f_rom = 1512000 / (2 * N_rom)                     the note the cabinet played
//     f_emu = CLOCK   / (2 * (N_emu + 7))               web-pokey, 16-bit linked mode
//                                                       (reload_linked: audf + 6, +1 to underflow)
//     =>  N_emu = round(N_rom * CLOCK / 1512000) - 7
//
// Pass { clockCorrect: false } to skip this and hear the naive, sharp version.
import { NOTTAB, FREQ_ENVELOPES, AMP_ENVELOPES, POKEY_CLOCK_HZ, TICK_SECONDS } from './music-data.mjs'

export { NOTTAB, TICK_SECONDS, POKEY_CLOCK_HZ }

// SNDPM.MAC's dispatch table (PKDT, SNDPM.MAC:934): opcode = 0x80 | index into PKDT.
export const OP = {
  NRATE: 0x80,
  CRATE: 0x81,
  NVOL: 0x82,
  CVOL: 0x83,
  NKEY: 0x84,
  CKEY: 0x85,
  FENV: 0x86,
  AENV: 0x87,
  CHK: 0x88,
  RCHK: 0x89,
  VC: 0x8a,
  PKC: 0x8b,
  SYN: 0x8c,
  CALL: 0x8d,
  LOOP: 0x8e,
  ENDL: 0x8f,
  GOSUB: 0x90,
  RETURN: 0x91,
}
const OP_NAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]))

// Opcodes no in-scope tune ever reaches. They are NOT implemented — and they must
// THROW, never quietly do nothing. A silently-skipped opcode costs a voice its
// character (or its whole line), and a tune missing one of four voices still sounds
// like music, so nothing downstream would ever notice. This game was silent for a
// full epic precisely because a failure path shrugged instead of shouting.
const UNIMPLEMENTED = new Set([OP.CRATE, OP.CHK, OP.RCHK, OP.VC, OP.PKC, OP.SYN, OP.CALL, OP.GOSUB, OP.RETURN])

// FETAB (SNDPM.MAC:1189) ships exactly two entries: NUL and OFS (GLOCK). The other
// five instrument names (HRN/TRB/BAS/GLK/WW) are declared in SWMUS.MAC but HRN is
// commented out of the table and 2..6 simply do not exist — selecting one would index
// off the end of the ROM's own table.
const FREQ_ENV_COUNT = FREQ_ENVELOPES.length // 2
const AMP_ENV_COUNT = AMP_ENVELOPES.length //  5

// POKVI (SNDPM.MAC:535-556) — the state a voice is initialised to.
const DEFAULT_VOLUME = 7 //    "SET UP TO MEDIAN VOLUME"
const DEFAULT_RATE = 64 //     "SET UP TO MED. RATE" (stored pre-negated as -64.)
const DEFAULT_VAC = 0xa0 //    "DEFAULT TO PURE TONES"

const signed8 = (b) => (b > 127 ? b - 256 : b < -128 ? b + 256 : b)

const MAX_STEPS = 1_000_000 // a runaway `.LOOP` must fail, not hang

class Voice {
  constructor(bytes) {
    this.bytes = bytes
    this.pc = 0
    this.odur = 0
    this.vseq = 0
    this.vol = DEFAULT_VOLUME
    this.rate = DEFAULT_RATE
    this.key = 0
    this.vac = DEFAULT_VAC
    this.freqEnv = 0
    this.ampEnv = 0
    this.loopCount = 0
    this.loopPc = 0
    this.onote = 0
    this.done = false
  }

  // POKNL — walk functions until a note lands (or the tune ends).
  fetchNote(onNote) {
    for (;;) {
      if (this.pc + 1 >= this.bytes.length) {
        this.done = true
        return
      }
      const op = this.bytes[this.pc]
      const arg = this.bytes[this.pc + 1]
      this.pc += 2

      if ((op & 0x80) === 0) {
        // a note (or a rest). A DURATION of 0 ends the tune (SNDPM.MAC:737).
        if (arg === 0) {
          this.done = true
          return
        }
        // `BEQ 9$ ;?SOUNDFUL NOTE?(NOT A REST)` — a rest is NOT transposed. Shifting
        // a rest by the key would turn silence into a drone under the tune.
        const note = op === 0 ? 0 : op + this.key
        this.onote = NOTTAB[note] ?? 0
        this.odur += (arg >> 1) * 128 // shift out the tie flag, then scale
        if ((arg & 1) === 0) this.vseq = 0 // not tied → restart the envelope
        if (onNote) onNote({ note, duration: arg, volume: this.vol })
        return
      }

      if (UNIMPLEMENTED.has(op)) {
        throw new Error(
          `pm-player: opcode .${OP_NAME[op]} (0x${op.toString(16)}) is not implemented. ` +
            `No in-scope tune reaches it; refusing to silently skip it.`,
        )
      }

      switch (op) {
        case OP.NRATE:
          this.rate = arg
          break
        case OP.NVOL:
          this.vol = arg
          break
        case OP.CVOL:
          this.vol += signed8(arg) // SIGNED: `.CVOL -1` is the Imperial March's fade
          break
        case OP.NKEY:
          this.key = signed8(arg)
          break
        case OP.CKEY:
          this.key += signed8(arg)
          break
        case OP.FENV:
          if (arg < 0 || arg >= FREQ_ENV_COUNT) {
            throw new Error(
              `pm-player: frequency envelope ${arg} is not implemented (the ROM's FETAB has ` +
                `only ${FREQ_ENV_COUNT}: NUL, OFS). Refusing to fall back to "no envelope" — ` +
                `that would silently strip a voice of its character.`,
            )
          }
          this.freqEnv = arg
          break
        case OP.AENV:
          if (arg < 0 || arg >= AMP_ENV_COUNT) {
            throw new Error(`pm-player: amplitude envelope ${arg} is not implemented (AETAB has ${AMP_ENV_COUNT}).`)
          }
          this.ampEnv = arg
          break
        case OP.LOOP: // PKSL: store the count, remember where the body starts
          this.loopCount = arg
          this.loopPc = this.pc
          break
        case OP.ENDL: // PKEL: `DEC VLC / LBEQ done` — the body runs N times in total
          this.loopCount -= 1
          if (this.loopCount > 0) this.pc = this.loopPc
          break
        default:
          throw new Error(`pm-player: unknown opcode 0x${op.toString(16)}`)
      }
    }
  }

  // POKSN — the POKEY values this voice is holding right now.
  output() {
    const fenv = signed8(FREQ_ENVELOPES[this.freqEnv][Math.min(this.vseq >> 1, FREQ_ENVELOPES[this.freqEnv].length - 1)])
    const divisor = this.onote + fenv * 8

    const aenv = signed8(AMP_ENVELOPES[this.ampEnv][Math.min(this.vseq, 31)])
    let vol = aenv + this.vol
    if (vol < 0) vol = 0
    if (vol >= 0x10) vol = 0x0f

    // A rest (ONOTE == 0) force-mutes: `PKNOFF: LDA #0F0` masks the volume nibble off.
    const audc = this.onote === 0 ? this.vac & 0xf0 : (vol | this.vac) & 0xff
    return { divisor, audc }
  }

  tick() {
    this.vseq = Math.min(this.vseq + 1, 255)
    this.odur -= this.rate
    if (this.odur < 0) this.fetchNote()
  }
}

/**
 * Decode a voice's byte stream into the notes it plays, in order, with `.LOOP`
 * expanded and rests preserved. `note` is the EFFECTIVE index into NOTTAB — the
 * `.NKEY`/`.CKEY` offset is already applied, because that is the note that sounds.
 */
export function decodeVoice(bytes) {
  const v = new Voice(bytes)
  const notes = []

  let steps = 0
  while (!v.done) {
    if (++steps > MAX_STEPS) {
      throw new Error('pm-player: voice did not terminate — a runaway .LOOP, or a stream with no .ENDT')
    }
    v.fetchNote((n) => notes.push(n))
  }

  return {
    notes,
    tempo: v.rate,
    freqEnvelope: v.freqEnv,
    ampEnvelope: v.ampEnv,
    volume: v.vol,
  }
}

/**
 * Run the driver over a voice, tick by tick, exactly as the 6809 would. Returns the
 * POKEY register values it holds at each tick, plus how many ticks the voice lasts.
 */
export function renderVoice(bytes) {
  const v = new Voice(bytes)
  const frames = []

  let steps = 0
  while (!v.done) {
    if (++steps > MAX_STEPS) throw new Error('pm-player: voice did not terminate')
    v.tick()
    if (v.done) break
    frames.push(v.output())
  }
  return frames
}

/**
 * The AUDF value to hand the emulated POKEY so it sounds the note the CABINET
 * sounded. See the clock note at the top of this file.
 */
export function toEmulatorDivisor(romDivisor, emuClockHz, clockCorrect = true) {
  if (romDivisor <= 0) return 0
  if (!clockCorrect) return Math.max(0, Math.min(0xffff, Math.round(romDivisor)))
  const n = Math.round((romDivisor * emuClockHz) / POKEY_CLOCK_HZ) - 7
  return Math.max(0, Math.min(0xffff, n))
}
