// tests/core/extra-life.test.ts
//
// Story sw3-6 — RED phase. Two 1983-cabinet HUD-scoring behaviours the sw2-6
// disassembly fidelity audit flagged as MISSING from the ported sim:
//
//   1. Extra lives at 400,000 and 800,000 (docs/star-wars-1983-source-findings.md
//      ~442-449: the extra-life text `a40000`/`a80000` = 400,000 / 800,000; the
//      byte_9865 table's 200k/600k entries are DEAD). Today `lives` only ever
//      DECREASES (grep `400000|800000|extraLife` = 0 hits).
//
//   2. The flashing bonus/extra-life HUD counter `byte_4B2C`. The score adder
//      `loc_9810` does `lda #$FF ; sta byte_4B2C` on EVERY score change ("score
//      changed, redraw HUD"), then `sub_761D` drains it −8/refresh under the
//      score — i.e. a FLASH intensity that re-arms to full on any score change
//      and decays to zero. Explicitly called out as a gap: "NOT modelled in
//      core/state.ts (no bonus/extra-life field)."
//
// LOAD-BEARING (the ×10 trap): the thresholds are EXACTLY 400,000 / 800,000.
// The findings doc resolves a cross-note conflict warning against reading them
// as 4M/8M or 250k/500k — "do NOT ×10". These tests pin the exact literals AND
// drive them end-to-end through the real sim, so neither a bad threshold nor a
// broken award survives.
//
// The `bonusFlash` field does not exist on GameState pre-GREEN, so the flash
// assertions read `undefined` and fail (RED) until Dev adds it. The contract is
// deliberately UNIT-AGNOSTIC (like core/hud.ts formatShield): we pin the
// invariants any faithful byte_4B2C flash must satisfy — zero at rest, armed on
// a score change, monotonic decay to zero, re-arm on the next change — NOT a
// specific scale or the exact −8/refresh rate (a cosmetic detail; see the story
// context).

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

// --- Fixtures (adapted from rom-score-values.test.ts). A TIE under a live bolt
//     at the same point dies on the next step and scores TIE_SCORE (1,000). ---
const AT: Vec3 = [0, 0, -100]
const TICK = 1 / 60
const wave = (seed = 1983): GameState => initialState(seed)
const tie = (pos: Vec3): Enemy => ({ pos, vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })
const playerBolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })

/** A playing space state seeded with `score`/`lives`, ready to have one TIE
 *  killed on the next step. `spawnTimer` is parked far in the future so no fresh
 *  TIE wanders in and pollutes the score/lives under test. */
function about(score: number, lives = STARTING_LIVES): GameState {
  return {
    ...wave(),
    mode: 'playing',
    phase: 'space',
    score,
    lives,
    enemies: [tie(AT)],
    projectiles: [playerBolt(AT)],
    spawnTimer: 1e9,
  }
}

/** Step an idle space frame — no enemies, no bolts, no spawns — so nothing
 *  changes the score. Used to age the flash counter. */
function idle(s: GameState): GameState {
  return stepGame({ ...s, enemies: [], projectiles: [], enemyShots: [], spawnTimer: 1e9 }, NO_INPUT, TICK)
}

describe('sw3-6 — extra-life thresholds (400,000 / 800,000; "do NOT ×10")', () => {
  it('a normal kill below the first threshold awards NO extra life', () => {
    const s0 = about(1000)
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(2000) // the kill scored (not a vacuous pin)
    expect(s1.lives).toBe(s0.lives)
  })

  it('awards exactly one extra life the first time the score reaches 400,000', () => {
    const s0 = about(399_000)
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(400_000) // crossed the threshold exactly
    expect(s1.lives - s0.lives).toBe(1)
  })

  it('does NOT award at 399,999 — one point below 400,000 (off-by-one guard)', () => {
    const s0 = about(398_999)
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(399_999) // still one short
    expect(s1.lives).toBe(s0.lives)
  })

  it('does not re-award the 400k life once the score is already past it', () => {
    const s0 = about(400_000)
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(401_000)
    expect(s1.lives).toBe(s0.lives) // already collected — no second 400k life
  })

  it('a kill well inside the 400k–800k band awards nothing (only the crossing does)', () => {
    const s0 = about(500_000)
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(501_000)
    expect(s1.lives).toBe(s0.lives)
  })

  it('awards a second extra life the first time the score reaches 800,000', () => {
    // Start already past 400k, so ONLY the 800k threshold fires here (+1).
    const s0 = about(799_000)
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(800_000)
    expect(s1.lives - s0.lives).toBe(1)
  })

  it('does not re-award the 800k life once the score is already past it', () => {
    const s0 = about(900_000)
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(901_000)
    expect(s1.lives).toBe(s0.lives)
  })

  it('a single score delta that vaults past BOTH thresholds grants BOTH lives', () => {
    // No single in-game event jumps 400k, so drive a synthetic multi-kill step:
    // 402 TIEs each under their own bolt at one point → +402,000 in one frame.
    // 399,000 → 801,000 crosses 400k AND 800k, so lives must rise by 2 (guards
    // against an `else if` / highest-threshold-only implementation).
    const N = 402
    const s0: GameState = {
      ...wave(),
      mode: 'playing',
      phase: 'space',
      score: 399_000,
      lives: 6,
      enemies: Array.from({ length: N }, () => tie(AT)),
      projectiles: Array.from({ length: N }, () => playerBolt(AT)),
      spawnTimer: 1e9,
    }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(801_000) // all 402 kills scored
    expect(s1.lives - s0.lives).toBe(2)
  })

  it('a big multi-kill that stays under 400k grants no life (threshold-gated, not per-kill)', () => {
    const N = 50 // 50 × 1,000 = 50,000, nowhere near 400k
    const s0: GameState = {
      ...wave(),
      mode: 'playing',
      phase: 'space',
      score: 0,
      lives: 6,
      enemies: Array.from({ length: N }, () => tie(AT)),
      projectiles: Array.from({ length: N }, () => playerBolt(AT)),
      spawnTimer: 1e9,
    }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(50_000)
    expect(s1.lives).toBe(s0.lives)
  })
})

describe('sw3-6 — flashing bonus/extra-life HUD counter (byte_4B2C analog)', () => {
  it('is zero at rest on a fresh state', () => {
    expect(wave().bonusFlash).toBe(0)
  })

  it('stays at zero across an idle frame when the score does not change', () => {
    const s = idle(wave())
    expect(s.bonusFlash).toBe(0) // never armed, never driven negative
  })

  it('arms above zero the frame the score changes (a TIE kill)', () => {
    const s1 = stepGame(about(1000), NO_INPUT, TICK)
    expect(s1.score).toBe(2000) // the score actually changed
    expect(s1.bonusFlash).toBeGreaterThan(0)
  })

  it('decays toward zero over the following idle frames, never going negative', () => {
    const armed = stepGame(about(1000), NO_INPUT, TICK)
    const later = idle(armed)
    expect(later.bonusFlash).toBeLessThan(armed.bonusFlash)
    expect(later.bonusFlash).toBeGreaterThanOrEqual(0)
  })

  it('re-arms to full on a fresh score change even after partial decay', () => {
    let s = stepGame(about(1000), NO_INPUT, TICK) // armed
    s = idle(idle(idle(s))) // let it drain a few frames
    const decayed = s.bonusFlash
    expect(decayed).toBeGreaterThan(0) // still mid-flash (not yet fully drained)
    // Another kill (score changes again) must snap the flash back up — the ROM
    // `lda #$FF` re-arm on EVERY score change.
    const rearmed = stepGame({ ...s, enemies: [tie(AT)], projectiles: [playerBolt(AT)], spawnTimer: 1e9 }, NO_INPUT, TICK)
    expect(rearmed.bonusFlash).toBeGreaterThan(decayed)
  })

  it('flashes fully out — reaches exactly zero after enough idle frames, monotonically', () => {
    let s = stepGame(about(1000), NO_INPUT, TICK) // armed > 0
    let prev = s.bonusFlash
    expect(prev).toBeGreaterThan(0)
    for (let i = 0; i < 2000 && s.bonusFlash > 0; i++) {
      s = idle(s)
      expect(s.bonusFlash).toBeGreaterThanOrEqual(0) // never negative en route
      expect(s.bonusFlash).toBeLessThanOrEqual(prev) // never climbs while idle
      prev = s.bonusFlash
    }
    expect(s.bonusFlash).toBe(0) // a flash, not a permanent glow
  })
})

describe('sw3-6 — purity / determinism guards', () => {
  it('the extra-life award and the flash are deterministic for identical input', () => {
    const a = stepGame(about(399_000), NO_INPUT, TICK)
    const b = stepGame(about(399_000), NO_INPUT, TICK)
    expect(a.lives).toBe(b.lives)
    expect(a.score).toBe(b.score)
    expect(a.bonusFlash).toBe(b.bonusFlash)
  })
})
