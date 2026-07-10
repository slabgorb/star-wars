// tools/pokey-bake/bake-sfx.test.mjs
//
// RED-phase tests for Story 8-7's authentic POKEY SFX bake tool. This lives WITH
// the tool, as `.mjs`, on purpose (mirroring tempest/tools/pokey-bake): the bake
// is build-time Node tooling (node:fs etc.), while the game's TS suite is
// deliberately browser-pure. Keeping these node-flavoured assertions out of
// tests/ preserves that posture while still being picked up by Vitest's default
// `**/*.test.mjs` discovery.
//
// Nothing here exists yet: `sfx-data.mjs` and `bake-sfx.mjs` are absent, so this
// file is RED today (valid RED).
//
// These assertions are format-AGNOSTIC on purpose: the authentic register
// encoding for star-wars comes from its own sound disassembly and is the Dev's
// to design (it need not match tempest's ALSOUN 6-byte records). The contract
// pinned here is AC#2's deliverable: the tool exists and ships >= 3 real SFX.
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { SFX } from './sfx-data.mjs'

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url))

describe('pokey-bake sfx-data (AC2: >= 3 authentic SFX)', () => {
  it('exports an array of at least three sound effects', () => {
    expect(Array.isArray(SFX)).toBe(true)
    expect(SFX.length).toBeGreaterThanOrEqual(3)
  })

  it('gives every effect a unique, non-empty name', () => {
    const names = SFX.map((s) => s.name)
    for (const name of names) {
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
    expect(new Set(names).size).toBe(names.length) // no duplicates
  })

  it('gives every effect a sane playback gain in (0, 1]', () => {
    for (const spec of SFX) {
      expect(typeof spec.gain).toBe('number')
      expect(spec.gain).toBeGreaterThan(0)
      expect(spec.gain).toBeLessThanOrEqual(1)
    }
  })

  it('carries real register/envelope data for every effect (not a stub)', () => {
    for (const spec of SFX) {
      // some property beyond name/gain must hold non-empty POKEY data — the
      // exact field name + encoding is the Dev's design choice.
      const dataValues = Object.entries(spec)
        .filter(([k]) => k !== 'name' && k !== 'gain')
        .map(([, v]) => v)
      const hasData = dataValues.some((v) => {
        if (Array.isArray(v)) return v.length > 0
        if (v && typeof v === 'object') return Object.keys(v).length > 0
        return false
      })
      expect(hasData).toBe(true)
    }
  })
})

describe('pokey-bake render tool (AC2)', () => {
  it('ships the bake-sfx.mjs render script', () => {
    expect(existsSync(here('./bake-sfx.mjs'))).toBe(true)
  })
})
