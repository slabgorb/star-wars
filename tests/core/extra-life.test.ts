// tests/core/extra-life.test.ts
//
// This file now pins TWO ROM-grounded behaviours around the score readout:
//
//   1. sw7-4 / S-015 — there is NO extra-life / extra-shield SCORE THRESHOLD.
//      The clone used to award a bonus shield when the running score crossed
//      400,000 or 800,000 (sw3-6, `EXTRA_LIFE_THRESHOLDS`). The 2026-07-15
//      primary-source audit's refuter did an exhaustive BCD-aware hunt of the
//      Warp Speed source and found NO score-threshold life/shield grant anywhere
//      (BOOK_WAS_WRONG). The numbers 400,000 / 800,000 are DISPLAY STRINGS on the
//      SELECT-A-DEATH-STAR screen (TCMES.MAC:597-599 over WSGAS.MAC:527-530
//      `TSCBN1..4` = 200k/400k/600k/800k — a ONE-TIME bonus for choosing a harder
//      Death Star, announced by MS.BON "DEATH STAR BONUS EARNED"), which the clone
//      misread as a recurring extra-life ladder. So crossing those scores must now
//      grant NOTHING. (The genuine start-of-game selection bonus is a separate,
//      unmodelled feature — see the sw7-4 Delivery Findings.)
//
//   2. sw3-6 — the flashing bonus/score HUD counter `byte_4B2C`. The score adder
//      `loc_9810` does `lda #$FF ; sta byte_4B2C` on EVERY score change ("score
//      changed, redraw HUD"), then `sub_761D` drains it under the score — a FLASH
//      intensity that re-arms to full on any score change and decays to zero. This
//      is REAL and unchanged by S-015; `bonusFlash` still models it, unit-agnostic
//      (invariants: zero at rest, armed on a change, monotonic decay, re-arm).
//
// == sw7-17 — MIGRATED OFF THE PROJECTILE MODEL (still current) ==============
// Every kill below is AIM-AND-PULL (`fireAt`) against the hitscan beam (R11b,
// audit G-004): it resolves on the same frame, so a "kill" is still one `stepGame`.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame, finalizeScore } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { fireAt } from '../support/aim'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

// --- Fixtures. A TIE the beam is aimed at dies on that very step and scores
//     TIE_SCORE (1,000). AT is dead ahead of the space cockpit eye and outside
//     COCKPIT_HIT_RADIUS. ------------------------------------------------------
const AT: Vec3 = [0, 0, -100]
const TICK = 1 / 60
const wave = (seed = 1983): GameState => initialState(seed)
const tie = (pos: Vec3): Enemy => ({ pos, vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })

/** A playing space state seeded with `score`/`lives`, ready to have one TIE
 *  killed on the next step. `spawnTimer` is parked far in the future so no fresh
 *  TIE wanders in and pollutes the score/lives under test. `initialState` leaves the
 *  trigger up and the gun ready (`firePrev: false`, `fireCooldown: 0`), so `kill` lands. */
function about(score: number, lives = STARTING_LIVES): GameState {
  return {
    ...wave(),
    mode: 'playing',
    phase: 'space',
    score,
    lives,
    enemies: [tie(AT)],
    spawnTimer: 1e9,
  }
}

/** Aim at the TIE and pull. The beam is hitscan, so the kill and its score land on this frame. */
const kill = (s: GameState): GameState => stepGame(s, fireAt(s, AT), TICK)

/** Step an idle space frame — no enemies, no shots, no spawns — so nothing
 *  changes the score. Used to age the flash counter. release() lets the trigger up,
 *  re-arming the firing edge for a later pull. */
function idle(s: GameState): GameState {
  return stepGame({ ...s, enemies: [], projectiles: [], enemyShots: [], spawnTimer: 1e9 }, NO_INPUT, TICK)
}

describe('sw7-4 / S-015 — NO extra-shield SCORE THRESHOLD (BOOK_WAS_WRONG: 400k/800k are invented)', () => {
  it('crossing 400,000 grants NO extra shield', () => {
    const s0 = about(399_000)
    const s1 = kill(s0)
    expect(s1.score).toBe(400_000) // the threshold really was crossed...
    expect(s1.lives).toBe(s0.lives) // ...and nothing was granted
  })

  it('crossing 800,000 grants NO extra shield', () => {
    const s0 = about(799_000)
    const s1 = kill(s0)
    expect(s1.score).toBe(800_000)
    expect(s1.lives).toBe(s0.lives)
  })

  it('a single delta vaulting past BOTH old thresholds still grants nothing', () => {
    // The removed code LOOPED over [400k, 800k] granting one shield per crossing —
    // a single 399,999 -> 800,000 delta handed out TWO. Now it grants zero.
    const prev: GameState = { ...wave(), score: 399_999, lives: 6 }
    const next: GameState = { ...prev, score: 800_000 }
    expect(finalizeScore(prev, next).lives).toBe(prev.lives)
  })

  it('finalizeScore never RAISES lives for any score jump (it only funnels the flash now)', () => {
    const jumps: readonly [number, number][] = [
      [0, 400_000],
      [399_999, 400_000],
      [700_000, 900_000],
      [0, 2_000_000],
    ]
    for (const [from, to] of jumps) {
      const prev: GameState = { ...wave(), score: from, lives: 6 }
      const next: GameState = { ...prev, score: to }
      expect(finalizeScore(prev, next).lives).toBe(prev.lives)
    }
  })

  it('a whole wave of kills leaves the shield count exactly where it started', () => {
    // Award is neither per-threshold nor per-kill: shields only ever DECREASE now.
    let s = about(398_000)
    for (let i = 0; i < 5 && s.phase === 'space'; i++) {
      s = kill({ ...s, enemies: [tie(AT)], spawnTimer: 1e9 })
    }
    expect(s.score, 'the kills really scored — not a vacuous pin').toBeGreaterThan(398_000)
    expect(s.lives).toBe(about(398_000).lives)
  })
})

describe('sw3-6 — flashing bonus/score HUD counter (byte_4B2C analog)', () => {
  it('is zero at rest on a fresh state', () => {
    expect(wave().bonusFlash).toBe(0)
  })

  it('stays at zero across an idle frame when the score does not change', () => {
    const s = idle(wave())
    expect(s.bonusFlash).toBe(0) // never armed, never driven negative
  })

  it('arms above zero the frame the score changes (a TIE kill)', () => {
    const s1 = kill(about(1000))
    expect(s1.score).toBe(2000) // the score actually changed
    expect(s1.bonusFlash).toBeGreaterThan(0)
  })

  it('decays toward zero over the following idle frames, never going negative', () => {
    const armed = kill(about(1000))
    const later = idle(armed)
    expect(later.bonusFlash).toBeLessThan(armed.bonusFlash)
    expect(later.bonusFlash).toBeGreaterThanOrEqual(0)
  })

  it('re-arms to full on a fresh score change even after partial decay', () => {
    let s = kill(about(1000)) // armed
    // Drain a while — long enough that the gun will accept a second pull (a kill
    // leaves FIRE_INTERVAL = 0.25 s = 15 frames on the clock; a refused pull would
    // score nothing and quietly turn this into an empty-frame test). 20 frames
    // clears the gun and still leaves the flash mid-decay to snap back from.
    for (let i = 0; i < 20; i++) s = idle(s)
    const decayed = s.bonusFlash
    expect(decayed).toBeGreaterThan(0) // still mid-flash (not yet fully drained)
    // Another kill (score changes again) must snap the flash back up — the ROM
    // `lda #$FF` re-arm on EVERY score change.
    const rearming: GameState = { ...s, enemies: [tie(AT)], spawnTimer: 1e9 }
    const rearmed = kill(rearming)
    expect(rearmed.score, 'the second kill really landed — the re-arm is not vacuous').toBe(3000)
    expect(rearmed.bonusFlash).toBeGreaterThan(decayed)
  })

  it('flashes fully out — reaches exactly zero after enough idle frames, monotonically', () => {
    let s = kill(about(1000)) // armed > 0
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
  it('the score funnel and the flash are deterministic for identical input', () => {
    const a = kill(about(399_000))
    const b = kill(about(399_000))
    expect(a.score, 'the threshold really was crossed — not two identical no-ops').toBe(400_000)
    expect(a.lives).toBe(b.lives)
    expect(a.score).toBe(b.score)
    expect(a.bonusFlash).toBe(b.bonusFlash)
  })
})
