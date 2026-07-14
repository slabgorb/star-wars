#!/usr/bin/env node
// bake-music.mjs — render the Star Wars POKEY music to .wav, headless.
//
// Drives the SAME vendored web-pokey core the SFX bake uses
// (../pokey-bake/vendor/pokey.js, MIT, by Mariusz Kryński) in a shimmed Node VM
// context. No second POKEY implementation enters this repo — two chips that drift
// apart would give the cabinet two different voices.
//
// Usage:
//   node tools/music-bake/bake-music.mjs [outDir] [--rate 48000] [--only <track>]
//                                        [--no-clock-correct] [--suffix <s>]
//
// Defaults: outDir = tools/music-bake/out, rate = 48000.
//
// ── HOW A MUSIC VOICE REACHES POKEY ──────────────────────────────────────────
// The cabinet gives music FOUR voices, each 16-BIT (`.TVC 1,PKFL1,16`), so each one
// occupies a JOINED CHANNEL PAIR: the driver writes the divisor's low byte to 0(X),
// its high byte to 2(X), and the amplitude to 3(X) — "AMPLITUDE GOES IN SECOND
// CHANNEL FOR 16 BIT" (SNDPM.MAC:919). Four voices x 2 channels = 8 channels = the
// board's two POKEYs, at 0x1810 and 0x1818:
//
//     voice 1 -> PKFL1 = POKEY2+0   chip B, channels 1+2
//     voice 2 -> PKFL2 = POKEY2+4   chip B, channels 3+4
//     voice 3 -> PKFL3 = POKEY +0   chip A, channels 1+2
//     voice 4 -> PKFL4 = POKEY +4   chip A, channels 3+4
//
// AUDCTL therefore joins both pairs and clocks them at the base rate:
//   0x10 link ch1+2 | 0x08 link ch3+4 | 0x40 ch1 fast | 0x20 ch3 fast = 0x78
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

import { TRACKS, TICK_SECONDS } from './music-data.mjs'
import { renderVoice, toEmulatorDivisor } from './pm-player.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Logical track -> the filename src/shell/audio.ts's MUSIC manifest fetches from R2.
// These MUST agree with the manifest; a mismatch is a 404, and a 404 is silence.
export const OUTPUT_FILES = {
  space: 'space_theme.wav',
  towers: 'towers_theme.wav',
  trench: 'trench_theme.wav',
  imperialMarch: 'imperial_march.wav',
}

const AUDCTL = 0x78
const AUDCTL_REG = 8

// web-pokey's POKEY runs at sampleRate * divider (the constructor picks the divider).
const DIVIDER = { 48000: 37, 44100: 40, 56000: 32 }
export const emuClockHz = (sampleRate) => sampleRate * DIVIDER[sampleRate]

// pokey.js is written for an AudioWorklet: it references the globals `sampleRate` and
// `currentFrame`, extends AudioWorkletProcessor, and calls registerProcessor at top
// level. Satisfy those in a sandbox and pull the class out.
function loadPokeyClass(sampleRate) {
  const src =
    readFileSync(join(__dirname, '..', 'pokey-bake', 'vendor', 'pokey.js'), 'utf8') + '\n;globalThis.__POKEY = POKEY;'
  const sandbox = {
    sampleRate,
    currentFrame: 0,
    console,
    AudioWorkletProcessor: class {},
    registerProcessor: () => {},
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox, { filename: 'vendor/pokey.js' })
  if (typeof sandbox.__POKEY !== 'function') throw new Error('failed to load POKEY from vendor/pokey.js')
  return sandbox.__POKEY
}

// voice index (0-3) -> { chip, pair } — see the header.
const VOICE_PORT = [
  { chip: 'B', lo: 0 },
  { chip: 'B', lo: 2 },
  { chip: 'A', lo: 0 },
  { chip: 'A', lo: 2 },
]

/**
 * Build the timed POKEY register writes for one track, flattening its segments in the
 * order WSMAIN fires them (space = TH5 then THB; towers = 4TH then REB).
 */
function buildFeeds(track, { sampleRate, clockCorrect }) {
  const clock = emuClockHz(sampleRate)
  const feeds = { A: [], B: [] }
  let t0 = 0 // where the current segment starts, in seconds
  let end = 0

  for (const seg of TRACKS[track].segments) {
    let segTicks = 0

    seg.voices.forEach((bytes, vi) => {
      const frames = renderVoice(bytes)
      segTicks = Math.max(segTicks, frames.length)

      const { chip, lo } = VOICE_PORT[vi]
      const hi = lo + 1
      const feed = feeds[chip]

      // the low channel of a linked pair carries no volume of its own
      feed.push([lo * 2 + 1, 0, t0])

      let lastF = null
      let lastC = null
      frames.forEach((f, i) => {
        const t = t0 + i * TICK_SECONDS
        const n = toEmulatorDivisor(f.divisor, clock, clockCorrect)
        if (n !== lastF) {
          feed.push([lo * 2, n & 0xff, t]) // AUDF low byte
          feed.push([hi * 2, (n >> 8) & 0xff, t]) // AUDF high byte
          lastF = n
        }
        if (f.audc !== lastC) {
          feed.push([hi * 2 + 1, f.audc, t]) // AUDC — the linked pair's amplitude
          lastC = f.audc
        }
      })

      // silence the voice when its own stream ends, so a short voice does not hang on
      const tEnd = t0 + frames.length * TICK_SECONDS
      feed.push([hi * 2 + 1, 0, tEnd])
    })

    t0 += segTicks * TICK_SECONDS
    end = t0
  }

  const build = (arr) => [AUDCTL_REG, AUDCTL, 0.0, ...arr.sort((a, b) => a[2] - b[2]).flat()]
  return { feedA: build(feeds.A), feedB: build(feeds.B), durationSeconds: end }
}

/** Render one track to a mono Float32Array. */
export function bakeTrack(name, { sampleRate = 48000, clockCorrect = true, gain = 1.0 } = {}) {
  if (!TRACKS[name]) throw new Error(`bake-music: unknown track ${JSON.stringify(name)}`)
  if (!DIVIDER[sampleRate]) throw new Error(`bake-music: unsupported sample rate ${sampleRate}`)

  const POKEY = loadPokeyClass(sampleRate)
  const { feedA, feedB, durationSeconds } = buildFeeds(name, { sampleRate, clockCorrect })

  const nSamples = Math.max(1, Math.round(durationSeconds * sampleRate))
  const a = new POKEY('L')
  a.feed(feedA)
  const b = new POKEY('R')
  b.feed(feedB)

  const samples = new Float32Array(nSamples)
  for (let i = 0; i < nSamples; i++) {
    a.processEvents(i)
    b.processEvents(i)
    samples[i] = (a.get() + b.get()) * 0.5 * gain
  }
  return { samples, sampleRate, durationMs: Math.round(durationSeconds * 1000) }
}

// ── WAV ──────────────────────────────────────────────────────────────────────
function toWav(samples, sampleRate) {
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples.length * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buf
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('bake-music.mjs')) {
  const argv = process.argv.slice(2)
  const flag = (name, dflt) => {
    const i = argv.indexOf(name)
    return i === -1 ? dflt : argv[i + 1]
  }
  const sampleRate = Number(flag('--rate', 48000))
  const only = flag('--only', null)
  const suffix = flag('--suffix', '')
  const clockCorrect = !argv.includes('--no-clock-correct')
  const outDir = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) || join(__dirname, 'out')

  mkdirSync(outDir, { recursive: true })

  for (const [track, file] of Object.entries(OUTPUT_FILES)) {
    if (only && only !== track) continue
    const { samples, durationMs } = bakeTrack(track, { sampleRate, clockCorrect })

    let peak = 0
    for (const s of samples) peak = Math.max(peak, Math.abs(s))

    const name = suffix ? file.replace(/\.wav$/, `${suffix}.wav`) : file
    writeFileSync(join(outDir, name), toWav(samples, sampleRate))
    console.log(
      `${name.padEnd(26)} ${(durationMs / 1000).toFixed(1)}s  peak ${peak.toFixed(3)}` +
        `  ${clockCorrect ? '1.512MHz-corrected' : 'RAW (uncorrected)'}`,
    )
  }
}
