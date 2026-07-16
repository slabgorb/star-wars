// tests/core/tie-piece-lifetimes.test.ts
//
// sw7-7 (R7a) — RED phase (Han Solo / TEA). Finding X-002 (pair-explosions.json).
//
// ROM: BGAXP ("BEGIN ALIEN EXPLOSION", WSXPLD.MAC) spawns three TIE explosion
// pieces, each with its OWN life timer in XP$TMR, decremented once per 20.508 Hz
// game frame by DOXPLD (WSXPLD.MAC:485-490):
//
//   TP$TI1  left wing    LDA #18   (WSXPLD.MAC:165)  -> 0x18 = 24 frames
//   TP$TI2  right wing   LDA #18   (WSXPLD.MAC:196)  -> 0x18 = 24 frames
//   TP$TI3  centre globe LDA #10   (WSXPLD.MAC:224)  -> 0x10 = 16 frames
//
// RADIX is 16 (WSXPLD `.INCLUDE WSCOMN`); the immediates are UN-DOTTED, so #18/#10
// are HEX 24/16 — not decimal 18/10. At the sw7-1 game-frame rate this is
//   wings  24 / 20.508 = 1.170 s
//   globe  16 / 20.508 = 0.780 s
//
// Ours today (state.ts:263) is a single flat `TIE_DEATH_SECONDS = 0.7` — an
// avowed "eyeball tunable" — used for all three pieces (sim.ts:309 cull,
// render.ts:390 spread). So our wings vanish ~40% too early and, worse, never
// outlive the globe: the whole "wings persist, globe pops first" tell is gone.
//
// This suite pins the two authentic per-piece lifetimes as FRAME-TRUE constants
// (frames / TICK_HZ — the same idiom as DARTH_GLOW_SECONDS = 0x1f / TICK_HZ and
// ENEMY_SHOT_TTL = 64 / TICK_HZ). The wished-for API is two named exports on
// state.ts; RED today because they do not yet exist (undefined -> assertions fail).
//
// The refutation of every plausible misreading (decimal byte, 60 Hz timebase, the
// old flat 0.7 s) is written INTO the expectations so nobody can quietly regress.

import { describe, it, expect } from 'vitest'
import { TICK_HZ, TIE_WING_LIFE_SECONDS, TIE_GLOBE_LIFE_SECONDS } from '../../src/core/state'

// The ROM bytes, decoded from RADIX-16 WSXPLD.MAC.
const WING_FRAMES = 0x18 // = 24, LDA #18 (WSXPLD.MAC:165, :196)
const GLOBE_FRAMES = 0x10 // = 16, LDA #10 (WSXPLD.MAC:224)

describe('sw7-7 X-002 — TIE explosion piece lifetimes are per-piece and frame-true', () => {
  it('the wing pieces live 0x18 = 24 game frames = 24 / 20.508 ≈ 1.170 s', () => {
    expect(TIE_WING_LIFE_SECONDS).toBeCloseTo(WING_FRAMES / TICK_HZ, 6)
    expect(TIE_WING_LIFE_SECONDS).toBeCloseTo(1.1703, 3)
  })

  it('the centre globe lives 0x10 = 16 game frames = 16 / 20.508 ≈ 0.780 s', () => {
    expect(TIE_GLOBE_LIFE_SECONDS).toBeCloseTo(GLOBE_FRAMES / TICK_HZ, 6)
    expect(TIE_GLOBE_LIFE_SECONDS).toBeCloseTo(0.7802, 3)
  })

  it('the wings OUTLIVE the globe by the ROM ratio 24 : 16 = 1.5 — the split the flat 0.7 s erased', () => {
    expect(TIE_WING_LIFE_SECONDS).toBeGreaterThan(TIE_GLOBE_LIFE_SECONDS)
    expect(TIE_WING_LIFE_SECONDS / TIE_GLOBE_LIFE_SECONDS).toBeCloseTo(24 / 16, 6)
  })

  it('neither lifetime is the old flat 0.7 s, a decimal-radix misread, or the wrong 60 Hz timebase', () => {
    // Existence guard FIRST, so the refutations below cannot pass vacuously while
    // the constants are still undefined (undefined is "not close to" everything).
    expect(Number.isFinite(TIE_WING_LIFE_SECONDS)).toBe(true)
    expect(Number.isFinite(TIE_GLOBE_LIFE_SECONDS)).toBe(true)

    // The old flat eyeball tunable (state.ts:263) — refuted.
    expect(TIE_WING_LIFE_SECONDS).not.toBeCloseTo(0.7, 2)
    expect(TIE_GLOBE_LIFE_SECONDS).not.toBeCloseTo(0.7, 2)

    // Reading the HEX byte as decimal (#18 -> 18, #10 -> 10) — refuted.
    expect(TIE_WING_LIFE_SECONDS).not.toBeCloseTo(18 / TICK_HZ, 3) // 0.878
    expect(TIE_GLOBE_LIFE_SECONDS).not.toBeCloseTo(10 / TICK_HZ, 3) // 0.488

    // Counting frames at the 60 Hz browser loop, not the 20.508 Hz game frame — refuted.
    expect(TIE_WING_LIFE_SECONDS).not.toBeCloseTo(WING_FRAMES / 60, 3) // 0.400
    expect(TIE_GLOBE_LIFE_SECONDS).not.toBeCloseTo(GLOBE_FRAMES / 60, 3) // 0.267
  })
})
