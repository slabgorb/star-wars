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
import { SW_BEAT, bakeSfx } from './bake-sfx.mjs'

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

// ── sw6-4: THE CLOCK ─────────────────────────────────────────────────────────
// Everything above this line is format-AGNOSTIC by design (see the header): it
// pins that the effects EXIST, are named, and carry data. Nothing pinned their
// TIMING — and so every shipped effect was baked at double speed for an entire
// epic, with the suite green the whole way. Existence is not correctness.
//
// Three numbers are in play and two of them are wrong, so these tests REFUTE
// rather than merely assert — the house rule, after this project was bitten
// twice by a stale ROM label and twice by a radix misread.
const IRQ = 0.004096 //         the sound board's interrupt period. Real — but not the FX tick.
const FX_TICK = 0.008192 //     the FX tick: AUDDO runs on every OTHER interrupt.
const AUDDO_HEADER = 0.016384 // what AUDDO's own STALE header comment implies.

describe('sw6-4 — the FX driver ticks on the 8 ms boundary, not the 4 ms sound IRQ', () => {
  it('walks the FX records at 8.192 ms', () => {
    // SNDAUX.MAC:165-168 gates the call:
    //     LDA $INTCT   ; incremented once per 4 ms IRQ (SNDAUX.MAC:102)
    //     LSRA         ; shift bit 0 into carry
    //     IFCC         ; ?8 MILL BOUNDARY?   <- the ROM's own words
    //     JSR AUDDO    ; THEN AUDIO SPECIAL EFFECTS
    expect(SW_BEAT).toBeCloseTo(FX_TICK, 9)
  })

  it('REFUTES the 4.096 ms sound IRQ — the FX driver is gated, not free-running', () => {
    // The trap that shipped. 4.096 ms is a TRUE fact about the interrupt and a
    // FALSE one about the FX driver: PKDR (music) and SPKIRQ (speech) are called
    // on every interrupt, but `JSR AUDDO` sits inside the IFCC. Bake at the IRQ
    // period and every effect is exactly twice as fast as the cabinet's.
    expect(SW_BEAT).not.toBeCloseTo(IRQ, 9)
    expect(SW_BEAT / IRQ).toBeCloseTo(2, 6) // precisely a factor of two — the whole bug
  })

  it("REFUTES AUDDO's own header, which claims 'EVERY 16 MILS' and is STALE", () => {
    // SNDAUD.MAC:1084 — `.SBTTL AUDDO - UPDATE AUDIO EVERY 16 MILS`. Believe it and
    // the effects come out 4x too SLOW. It is wrong on two independent counts:
    //   1. Its caller consumes ONE bit (LSRA -> carry). A 16 ms gate would need a
    //      two-bit test (ANDA #03).
    //   2. AUDDO's body (SNDAUD.MAC:1086-1126) has NO internal divider — one
    //      `DEC AU$TMR(X)` per call, per channel. Its tick IS its call rate.
    // A label's comment is not its caller. sw6-1 learned this from PMBEN, labelled
    // ';BENS THEME (START OF TOWER)' and fired only on the game-over path.
    expect(SW_BEAT).not.toBeCloseTo(AUDDO_HEADER, 9)
  })
})

describe('sw6-4 — the clock scales TIME ONLY, which is why an ear signoff missed it', () => {
  // SW_BEAT sets how long each register value is HELD (stepDur = duration * SW_BEAT).
  // It never touches AUDF. So the old bake ran every frequency sweep twice as fast
  // through the IDENTICAL pitches: nothing was transposed, the envelopes were merely
  // rushed. The effects sounded like SHORTER versions of the right sound, not higher
  // ones — no wrongness to hear, only absence. An ear cannot catch that. A test can.
  const byName = Object.fromEntries(SFX.map((s) => [s.name, s]))

  // Measured at the corrected 8.192 ms tick. At the old 4.096 ms each was exactly
  // half of these — a pure time scale, no pitch change.
  const EXPECTED_SECONDS = {
    player_fire: 0.446,
    enemy_fire: 0.151,
    enemy_explosion: 1.62,
    player_explosion: 1.069,
    wave_clear: 0.446,
    spawn: 0.479,
    terrain_crash: 0.888,
    // sw7-8 — the two dedicated effects (SNDAUD.MAC AUDDF/AUDSS):
    death_star_boom: 2.379, // 288 ticks of finite decay + 20 ms tail (own 2.5 s cap)
    fireball_hit: 0.135, // a 14-tick rising crackle
  }

  it('covers every effect the game fetches', () => {
    expect(Object.keys(byName).sort()).toEqual(Object.keys(EXPECTED_SECONDS).sort())
  })

  it.each(Object.entries(EXPECTED_SECONDS))('holds %s for %ss at the corrected tick', (name, seconds) => {
    const { samples, peak, seconds: got } = bakeSfx(byName[name])

    expect(got).toBeCloseTo(seconds, 2)
    expect(samples.length).toBeGreaterThan(0)
    expect(peak).toBeGreaterThan(0.05) // a silent bake is the failure this epic exists to end
    expect(peak).toBeLessThanOrEqual(1.0) // and a clipped one is the other
  }, 30_000) // CPU-bound bake: death_star_boom exceeds vitest's 5s default on GitHub's slower runners
})
