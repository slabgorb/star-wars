// tools/music-bake/bake-music.test.mjs — RED for sw6-1.
//
// Nothing under tools/music-bake/ exists yet, so this file is RED today (valid RED).
//
// ── THE CONTRACT DEV MUST BUILD ──────────────────────────────────────────────
//   bakeTrack(name, { sampleRate }) -> { samples: Float32Array, sampleRate, durationMs }
//   OUTPUT_FILES: { space, towers, trench, imperialMarch } -> .wav filename
//   bake-music.mjs                  the headless CLI that writes the four .wav
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import { bakeTrack, OUTPUT_FILES } from './bake-music.mjs'

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const TRACKS = ['space', 'towers', 'trench', 'imperialMarch']
const RATE = 48000

// Baking four full tunes through a cycle-accurate POKEY is not a 5 ms unit test.
const SLOW = 120_000

describe('sw6-1 AC-7 — no second POKEY implementation enters the repo', () => {
  it('keeps exactly ONE pokey core in the tree — the vendored one', () => {
    // AC-7 is explicit: drive the SAME vendored web-pokey core. A hand-rolled
    // second POKEY would drift from the one the SFX are baked with, and the game
    // would have two different-sounding chips.
    const found = []
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'out') continue
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) walk(p)
        else if (/pokey.*\.(js|mjs|ts)$/i.test(entry) && !/\.test\./.test(entry)) found.push(p)
      }
    }
    walk(repoRoot)

    const cores = found.filter((p) => !/music-bake|pm-player/.test(p))
    expect(cores).toHaveLength(1)
    expect(cores[0]).toMatch(/tools\/pokey-bake\/vendor\/pokey\.js$/)
  })

  it('drives that vendored core rather than shipping its own', () => {
    const src = readFileSync(here('./bake-music.mjs'), 'utf8')
    expect(src).toMatch(/pokey-bake\/vendor\/pokey\.js/)
  })
})

describe('sw6-1 AC-7 — the bake is headless and reproducible', () => {
  it('ships the bake-music.mjs render script', () => {
    expect(existsSync(here('./bake-music.mjs'))).toBe(true)
  })

  it('emits filenames that AGREE with the shell MUSIC manifest', () => {
    // AC-7: "manifest and filenames must agree in the same PR". The manifest is
    // the thing production actually fetches; a bake that writes space.wav while
    // the game asks for space_theme.wav is a 404 and therefore silence — which
    // is precisely the bug this epic exists to end.
    const audio = readFileSync(join(repoRoot, 'src', 'shell', 'audio.ts'), 'utf8')
    const block = audio.slice(audio.indexOf('export const MUSIC ='))
    const manifest = {}
    for (const [, key, file] of block.matchAll(/(\w+):\s*'([\w.]+\.wav)'/g)) {
      manifest[key] = file
      if (Object.keys(manifest).length === 4) break
    }

    expect(manifest).toEqual({
      space: 'space_theme.wav',
      towers: 'towers_theme.wav',
      trench: 'trench_theme.wav',
      imperialMarch: 'imperial_march.wav',
    })
    expect(OUTPUT_FILES).toEqual(manifest)
  })

  it.each(TRACKS)('bakes %s to real audio, not silence', async (track) => {
    // The whole point. A bake that runs clean and emits a silent buffer leaves the
    // game exactly as quiet as it is today — and every other assertion here would
    // still pass.
    const { samples, sampleRate } = await bakeTrack(track, { sampleRate: RATE })

    expect(sampleRate).toBe(RATE)
    expect(samples.length).toBeGreaterThan(RATE) // at least a second of music

    let sum = 0
    let peak = 0
    for (const s of samples) {
      sum += s * s
      const a = Math.abs(s)
      if (a > peak) peak = a
    }
    const rms = Math.sqrt(sum / samples.length)

    expect(peak).toBeGreaterThan(0.05)
    expect(rms).toBeGreaterThan(0.01)
    expect(peak).toBeLessThanOrEqual(1.0) // no clipping
  }, SLOW)

  it('is deterministic — the same tune bakes to the same samples twice', async () => {
    // A reproducible bake is the only kind you can review. Any RNG, Date.now, or
    // Map-iteration-order dependence in the player shows up here.
    const a = await bakeTrack('trench', { sampleRate: RATE })
    const b = await bakeTrack('trench', { sampleRate: RATE })

    expect(a.samples.length).toBe(b.samples.length)
    for (let i = 0; i < a.samples.length; i++) {
      if (a.samples[i] !== b.samples[i]) {
        throw new Error(`bake is not deterministic: sample ${i} differs (${a.samples[i]} vs ${b.samples[i]})`)
      }
    }
  }, SLOW)

  it.each(TRACKS)('bakes %s as a SEAMLESS loop — no dead air at either end', async (track) => {
    // These are looped by startLoop(). Padding at either end becomes an audible
    // gap every time the loop wraps.
    const { samples, sampleRate } = await bakeTrack(track, { sampleRate: RATE })
    const quiet = (buf) => buf.every((s) => Math.abs(s) < 1e-4)

    const head = samples.subarray(0, Math.floor(sampleRate * 0.02)) // first 20 ms
    expect(quiet(head), 'loop starts with dead air').toBe(false)

    const tail = samples.subarray(samples.length - Math.floor(sampleRate * 0.05)) // last 50 ms
    expect(quiet(tail), 'loop ends with dead air').toBe(false)
  }, SLOW)
})
