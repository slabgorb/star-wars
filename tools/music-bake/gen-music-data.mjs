#!/usr/bin/env node
// gen-music-data.mjs — lift the Star Wars POKEY music out of the ORIGINAL 1983
// Atari source and write music-data.mjs. Run it; do not hand-edit its output.
//
//   node tools/music-bake/gen-music-data.mjs [--source <dir>]
//
// SOURCE — the 1983 Atari "Warp Speed" source tree (a local checkout, NOT repo
// content; default ~/Projects/star-wars-1983-source-text):
//
//   SWMUS.MAC  "STAR WARS TUNES"                    — TUNTAB + every voice's note stream
//   SNDPM.MAC  "(RUSTY'S POKEY MUSIC) DRIVER"       — NOTTAB + the envelope tables
//
// We do NOT reverse-engineer the disassembly. SWMUS.MAC is the ASSEMBLED listing:
// each `.BYTE` carries its original macro call as a comment directly above it, so
// the file documents its own encoding and we can lift the bytes verbatim.
//
// ⚠ RADIX — both files are `.RADIX 16`, so bare integer literals are HEX. A
// TRAILING DOT forces DECIMAL (`.BYTE 80, 152.` is opcode 0x80, operand 152). The
// trap cuts both ways: the tune INDICES in SNDPM's `.TUNE` macro are DECIMAL,
// because it expands to `LDB #<2*'TNUM'.>` (SNDPM.MAC:325). Read them as hex and
// PMTH5's four voices scatter across the DESCENT tune plus a test tone.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
const srcFlag = argv.indexOf('--source')
const SOURCE_DIR =
  srcFlag !== -1 ? argv[srcFlag + 1] : join(process.env.HOME, 'Projects', 'star-wars-1983-source-text')

const read = (name) => readFileSync(join(SOURCE_DIR, name), 'latin1').replace(/\r\n?/g, '\n')
const sha256 = (name) => createHash('sha256').update(readFileSync(join(SOURCE_DIR, name))).digest('hex')

// ── radix-aware literal parsing (.RADIX 16; trailing '.' = decimal) ───────────
function parseLiteral(tok) {
  const t = tok.trim()
  const m = /^(-?)([0-9A-Fa-f]+)(\.?)$/.exec(t)
  if (!m) throw new Error(`gen-music-data: cannot parse literal ${JSON.stringify(tok)}`)
  const [, sign, digits, dot] = m
  if (dot) {
    if (!/^\d+$/.test(digits)) throw new Error(`gen-music-data: bad decimal literal ${tok}`)
    return (sign ? -1 : 1) * parseInt(digits, 10)
  }
  return (sign ? -1 : 1) * parseInt(digits, 16)
}

// Strip a trailing `;comment` (the listing puts the original macro call there).
const codeOf = (line) => line.split(';')[0]

// ── SWMUS.MAC: the tunes ─────────────────────────────────────────────────────
const swmus = read('SWMUS.MAC').split('\n')

// Every top-level label -> its line. Labels look like `RR1:` / `TH5V1:` at col 0.
const labelLine = new Map()
swmus.forEach((l, i) => {
  const m = /^([A-Z][A-Z0-9$]*):/.exec(l)
  if (m && !labelLine.has(m[1])) labelLine.set(m[1], i)
})

// TUNTAB — the tune directory. `.WORD SWNUL,SF2V1,…` with SWNUL at index 0, so a
// `.TUNE n` index reads TUNTAB[n] directly (NWTUNE does `LDX #TUNTAB; ABX` with
// B = 2*n, a word offset).
function parseTuntab() {
  const start = labelLine.get('TUNTAB')
  if (start == null) throw new Error('gen-music-data: TUNTAB not found in SWMUS.MAC')
  const names = []
  for (let i = start; i < swmus.length; i++) {
    const code = codeOf(swmus[i])
    const m = /\.WORD\s+(.+)$/.exec(code)
    if (!m) {
      if (i > start && names.length) break
      continue
    }
    for (const n of m[1].split(',')) names.push(n.trim())
  }
  return names
}

// Walk one voice's byte stream, from its label to the end-of-tune terminator.
//
// Each instruction is a 2-byte pair: the driver fetches with `LDB ,X++` (6809
// post-increment BY TWO — SNDPM.MAC:699), so opcode/note and operand/duration are
// always read together. End of tune is a DURATION byte of 0 on a note
// (SNDPM.MAC:737 `LDA -1(X) / BNE 30$` → else re-init the voice). `.ENDL` is
// `8F,00`, whose second byte is also 0 — but its first byte has the high bit set,
// so it is an opcode, not a terminator.
function parseVoice(label) {
  const start = labelLine.get(label)
  if (start == null) throw new Error(`gen-music-data: voice ${label} not found in SWMUS.MAC`)

  const bytes = []
  for (let i = start; i < swmus.length; i++) {
    const code = codeOf(swmus[i])

    // `.GOSUB LABEL` / `.RETURN` survive as unexpanded macro calls (they carry a
    // 16-bit label ADDRESS, which we cannot resolve to a byte stream). None of the
    // six in-scope tunes reaches them — the only .GOSUB in SWMUS.MAC belongs to
    // CNTV4, the cantina. If one ever appears in scope, fail loudly.
    if (/^\s*\.(GOSUB|RETURN)\b/.test(code)) {
      throw new Error(
        `gen-music-data: voice ${label} uses ${code.trim()} — .GOSUB/.RETURN carry a label ` +
          `address and are not supported. Resolve the label or drop the tune from scope.`,
      )
    }

    const m = /^\s*\.BYTE\s+(.+)$/.exec(code)
    if (!m) continue

    const vals = m[1].split(',').map(parseLiteral)
    for (let k = 0; k + 1 < vals.length + 1; k += 2) {
      if (k + 1 >= vals.length) break
      const op = vals[k]
      const arg = vals[k + 1]
      bytes.push(op, arg)
      // terminator: a NOTE (high bit clear) whose duration byte is 0
      if ((op & 0x80) === 0 && arg === 0) return bytes
    }
  }
  throw new Error(`gen-music-data: voice ${label} ran off the end of SWMUS.MAC without a terminator`)
}

// ── SNDPM.MAC: the driver's tables ───────────────────────────────────────────
const sndpm = read('SNDPM.MAC').split('\n')

// NOTTAB — note -> 16-bit AUDF divisor for the cabinet's 1.512 MHz POKEY clock.
// NOTTAB[0] is `.WORD 0 ;REST`, and a note byte indexes it directly.
function parseNottab() {
  const start = sndpm.findIndex((l) => /^NOTTAB:/.test(l))
  if (start === -1) throw new Error('gen-music-data: NOTTAB not found in SNDPM.MAC')
  const words = []
  for (let i = start; i < sndpm.length; i++) {
    if (i > start && /^\s*\.SBTTL/.test(sndpm[i])) break
    const m = /\.WORD\s+([0-9A-Fa-f]+)\s*$/.exec(codeOf(sndpm[i]))
    if (m) words.push(parseLiteral(m[1]))
  }
  return words
}

// The envelope byte tables. Each is a run of `.BYTE` lines under its label; the
// FIRST such line is usually an earlier draft, commented out — codeOf() drops it.
//
// NULENV is the exception: it is declared as `.WORD 0,0,0,…` (SNDPM.MAC:1235), a
// long run of zeros rather than a byte table. Zero offset, zero volume adjust — the
// identity envelope. We still assert it really is all-zero rather than assume it.
function parseEnvelope(label, length) {
  const start = sndpm.findIndex((l) => new RegExp(`^${label}:`).test(l))
  if (start === -1) throw new Error(`gen-music-data: envelope ${label} not found in SNDPM.MAC`)

  if (label === 'NULENV') {
    const words = []
    for (let i = start; i < sndpm.length; i++) {
      const code = codeOf(sndpm[i])
      if (i > start && /^[A-Z][A-Z0-9$]*:/.test(code)) break
      const m = /\.WORD\s+(.+)$/.exec(code)
      if (!m) continue
      for (const v of m[1].split(',')) words.push(parseLiteral(v))
    }
    if (!words.length) throw new Error('gen-music-data: NULENV yielded no words')
    if (words.some((w) => w !== 0)) throw new Error('gen-music-data: NULENV is not all zeros')
    return new Array(length).fill(0)
  }
  const bytes = []
  for (let i = start; i < sndpm.length && bytes.length < length; i++) {
    const code = codeOf(sndpm[i])
    if (i > start && /^[A-Z][A-Z0-9$]*:/.test(code)) break
    const m = /\.BYTE\s+(.+)$/.exec(code)
    if (!m) continue
    for (const v of m[1].split(',')) {
      if (bytes.length >= length) break
      bytes.push(parseLiteral(v))
    }
  }
  if (!bytes.length) throw new Error(`gen-music-data: envelope ${label} yielded no bytes`)
  // The ROM reads past a short table into the zeros that follow it (NULENV).
  while (bytes.length < length) bytes.push(0)
  return bytes
}

// ── the four tracks ──────────────────────────────────────────────────────────
//
// The phase -> tune mapping comes from the ROM's CALLERS, not from the entry
// points' labels. There are exactly 11 `JSR PM*` sites in the 1983 tree, all in
// WSMAIN.MAC:
//
//   space   PMTH5 :1430 ";THEME MUSIC"                 then PMTHB :1435 ";THEME B FOLLOWS MAIN THEME"
//   towers  PM4TH :1636 ";BATTLE MUSIC IN FOURTHS"     then PMREB :1673 ";FINISH GROUND WITH REBEL"
//   trench  PMRRP :1865 ";THEN DO REBEL REPEAT THEME"
//   vader   PMDAR :1426 ";THEN DO DARTH THEME"
//
// ⚠ PMBEN is NOT the towers theme, despite SNDPM.MAC:337 labelling it ";BENS THEME
// (START OF TOWER)". Its only caller is WSMAIN.MAC:2161 — ";BEN'S THEME WHEN LOSE
// GAME WITH NO HIGH SCORE". It is the game-over cue. Do not put it here.
//
// Each PM* entry issues four `.TUNE voice,index` calls; the indices are DECIMAL.
const TRACK_SPEC = {
  space: [
    { tune: 'TH5', tuneIndices: [27, 28, 29, 30] },
    { tune: 'THB', tuneIndices: [35, 36, 37, 38] },
  ],
  towers: [
    { tune: 'SW4', tuneIndices: [31, 32, 33, 34] },
    { tune: 'REB', tuneIndices: [19, 20, 21, 22] },
  ],
  trench: [{ tune: 'RR', tuneIndices: [23, 24, 25, 26] }],
  imperialMarch: [{ tune: 'DAR', tuneIndices: [43, 44, 45, 46] }],
}

const tuntab = parseTuntab()

const TRACKS = {}
for (const [track, segs] of Object.entries(TRACK_SPEC)) {
  TRACKS[track] = {
    segments: segs.map(({ tune, tuneIndices }) => {
      const voiceLabels = tuneIndices.map((n) => {
        const label = tuntab[n]
        if (!label) throw new Error(`gen-music-data: TUNTAB has no entry ${n} (for ${tune})`)
        return label
      })
      return { tune, tuneIndices, voiceLabels, voices: voiceLabels.map(parseVoice) }
    }),
  }
}

const NOTTAB = parseNottab()

// Frequency envelopes (FETAB, SNDPM.MAC:1189) — the shipped ROM has only two:
// NULENV and GLOCK ("ACTUALLY OFFSET BY 1"; its 64 bytes are all 0xFF = -1). HRN is
// commented out, and entries 2..6 do not exist — indexing them would run off the
// table. Read at [vseq >> 1], so 128 entries deep.
const FREQ_ENVELOPES = [parseEnvelope('NULENV', 128), parseEnvelope('GLOCK', 128)]

// Amplitude envelopes (AETAB, SNDPM.MAC:1197), 32 bytes each, read at
// min(vseq, 31) — "LIMIT AT 31 (QUARTER SECOND)".
const AMP_ENVELOPES = [
  parseEnvelope('NULENV', 32),
  parseEnvelope('SDRUM', 32),
  parseEnvelope('EHARD', 32),
  parseEnvelope('QKRIZE', 32),
  parseEnvelope('TIES', 32),
]

// ── emit ─────────────────────────────────────────────────────────────────────
const fmt = (arr, perLine) => {
  const out = []
  for (let i = 0; i < arr.length; i += perLine) out.push('    ' + arr.slice(i, i + perLine).join(', ') + ',')
  return out.join('\n')
}

const segLines = (track) =>
  TRACKS[track].segments
    .map(
      (s) => `    {
      tune: ${JSON.stringify(s.tune)},
      tuneIndices: [${s.tuneIndices.join(', ')}],
      voiceLabels: [${s.voiceLabels.map((v) => JSON.stringify(v)).join(', ')}],
      voices: [
${s.voices.map((v) => `        [${v.join(', ')}],`).join('\n')}
      ],
    },`,
    )
    .join('\n')

const body = `// music-data.mjs — Star Wars (1983) POKEY music, lifted from the original Atari source.
//
// GENERATED by tools/music-bake/gen-music-data.mjs — do not hand-edit.
// Re-generate with:  node tools/music-bake/gen-music-data.mjs
//
// The tunes come from SWMUS.MAC ("STAR WARS TUNES") and the driver tables from
// SNDPM.MAC ("(RUSTY'S POKEY MUSIC) DRIVER, 6809 VERSION") — the 1983 Atari "Warp
// Speed" source, NOT the disassembly. Both files are .RADIX 16; a trailing dot on a
// literal forces decimal. See the generator's header for the radix traps.
//
// Voice byte streams are raw, exactly as the assembler emitted them: pairs of
// (note|opcode, duration|operand). Decoding them is pm-player.mjs's job.

export const MUSIC_SOURCE = {
  file: 'SWMUS.MAC',
  sha256: ${JSON.stringify(sha256('SWMUS.MAC'))},
  generator: 'gen-music-data.mjs',
  driver: { file: 'SNDPM.MAC', sha256: ${JSON.stringify(sha256('SNDPM.MAC'))} },
}

// The cabinet's POKEY clock. NOTTAB's divisors are computed FOR THIS CLOCK
// ("RPM NOTE TABLE (FOR 1.512 MHZ CLOCK)", SNDPM.MAC:1083).
export const POKEY_CLOCK_HZ = 1512000

// The music driver runs inside the sound board's 4.096 ms interrupt, but PKDR
// updates voices 1/3/5/7 on one tick and 2/4/6/8 on the next (SNDPM.MAC:634), so any
// ONE voice advances every OTHER tick.
export const TICK_SECONDS = 0.008192

// note -> 16-bit AUDF divisor. NOTTAB[0] is \`.WORD 0 ;REST\`, and a note byte
// indexes this directly (SNDPM.MAC:1085).
export const NOTTAB = [
${fmt(NOTTAB, 12)}
]

// FETAB (SNDPM.MAC:1189). Only 0 (NUL) and 1 (OFS/GLOCK) exist in the shipped ROM.
export const FREQ_ENVELOPES = [
${FREQ_ENVELOPES.map((e) => `  [\n${fmt(e, 16)}\n  ],`).join('\n')}
]

// AETAB (SNDPM.MAC:1197): 0 NUL, 1 SDR, 2 HRD, 3 QKR, 4 TIE.
export const AMP_ENVELOPES = [
${AMP_ENVELOPES.map((e) => `  [\n${fmt(e, 16)}\n  ],`).join('\n')}
]

export const TRACKS = {
${Object.keys(TRACKS)
  .map((t) => `  ${t}: {\n    segments: [\n${segLines(t)}\n    ],\n  },`)
  .join('\n')}
}
`

const out = join(__dirname, 'music-data.mjs')
writeFileSync(out, body)

const nVoices = Object.values(TRACKS).reduce((n, t) => n + t.segments.length * 4, 0)
console.log(`music-data.mjs written: ${Object.keys(TRACKS).length} tracks, ${nVoices} voices, NOTTAB[${NOTTAB.length}]`)
for (const [t, { segments }] of Object.entries(TRACKS)) {
  console.log(
    `  ${t.padEnd(14)} ${segments.map((s) => `${s.tune}(${s.voices.map((v) => v.length / 2).join('/')})`).join(' + ')}`,
  )
}
