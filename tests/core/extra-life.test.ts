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

// == sw7-17 — MIGRATED OFF THE PROJECTILE MODEL ==============================
//
// Every kill below was staged by parking a bolt on top of a TIE and stepping with the trigger
// UP. The gun is HITSCAN now (R11b, audit G-004): it spawns nothing, that fixture cannot occur
// in play, and it no longer kills anything. A kill is now what it always meant — AIM AT IT AND
// PULL (`fireAt`) — and the beam resolves on that same frame, so the tests below still read as
// "one step, one kill, check the score".
//
// ONE GUARD COULD NOT SURVIVE AS A stepGame FIXTURE, and it is called out in full at its own
// test rather than quietly dropped: the beam resolves exactly ONE object per frame, which puts
// the synthetic 402-kill frame — the only way the suite could manufacture a single score delta
// crossing BOTH thresholds — permanently out of reach. Rather than lose the guard, sw7-17
// EXPORTS `finalizeScore` and the test calls the scoring funnel directly. The award is a pure
// function of (prev.score, next.score), so that is the same arithmetic with the unreachable
// theatre removed — see 'a single score delta that vaults past BOTH thresholds'.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  EXTRA_LIFE_THRESHOLDS,
  SURFACE_CLEAR_BONUS,
  SPACE_WAVE_QUOTA,
  TIE_SCORE,
  FIRE_INTERVAL,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame, finalizeScore } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { fireAt, release } from '../support/aim'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

// --- Fixtures (adapted from rom-score-values.test.ts). A TIE the beam is aimed
//     at dies on that very step and scores TIE_SCORE (1,000). AT is dead ahead of
//     the space phase's cockpit eye and outside COCKPIT_HIT_RADIUS. ------------
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

/** Aim at the TIE and pull. The beam is hitscan, so the kill and its score land on this frame
 *  — which is why every threshold test below is still a single `stepGame`. */
const kill = (s: GameState): GameState => stepGame(s, fireAt(s, AT), TICK)

/** Step an idle space frame — no enemies, no shots, no spawns — so nothing
 *  changes the score. Used to age the flash counter. NO_INPUT also lets the trigger up, so
 *  coasting here re-arms the firing edge for a later pull. */
function idle(s: GameState): GameState {
  return stepGame({ ...s, enemies: [], projectiles: [], enemyShots: [], spawnTimer: 1e9 }, NO_INPUT, TICK)
}

describe('sw3-6 — extra-life thresholds (400,000 / 800,000; "do NOT ×10")', () => {
  it('a normal kill below the first threshold awards NO extra life', () => {
    const s0 = about(1000)
    const s1 = kill(s0)
    expect(s1.score).toBe(2000) // the kill scored (not a vacuous pin)
    expect(s1.lives).toBe(s0.lives)
  })

  it('awards exactly one extra life the first time the score reaches 400,000', () => {
    const s0 = about(399_000)
    const s1 = kill(s0)
    expect(s1.score).toBe(400_000) // crossed the threshold exactly
    expect(s1.lives - s0.lives).toBe(1)
  })

  it('does NOT award at 399,999 — one point below 400,000 (off-by-one guard)', () => {
    const s0 = about(398_999)
    const s1 = kill(s0)
    expect(s1.score).toBe(399_999) // still one short
    expect(s1.lives).toBe(s0.lives)
  })

  it('does not re-award the 400k life once the score is already past it', () => {
    const s0 = about(400_000)
    const s1 = kill(s0)
    expect(s1.score).toBe(401_000)
    expect(s1.lives).toBe(s0.lives) // already collected — no second 400k life
  })

  it('a kill well inside the 400k–800k band awards nothing (only the crossing does)', () => {
    const s0 = about(500_000)
    const s1 = kill(s0)
    expect(s1.score).toBe(501_000)
    expect(s1.lives).toBe(s0.lives)
  })

  it('awards a second extra life the first time the score reaches 800,000', () => {
    // Start already past 400k, so ONLY the 800k threshold fires here (+1).
    const s0 = about(799_000)
    const s1 = kill(s0)
    expect(s1.score).toBe(800_000)
    expect(s1.lives - s0.lives).toBe(1)
  })

  it('does not re-award the 800k life once the score is already past it', () => {
    const s0 = about(900_000)
    const s1 = kill(s0)
    expect(s1.score).toBe(901_000)
    expect(s1.lives).toBe(s0.lives)
  })

  it('a single score delta that vaults past BOTH thresholds grants BOTH lives', () => {
    // WHAT IT GUARDS. `finalizeScore` must LOOP over EXTRA_LIFE_THRESHOLDS, so that one frame's
    // score delta crossing both 400k and 800k grants two lives. An `else if` — or any
    // "highest threshold crossed" shape — grants one. That bug is invisible to every other test
    // in this file: single-threshold crossings, and any number of them spread across separate
    // frames, score identically under the correct loop and under the broken else-if. A single
    // delta spanning BOTH is the only thing that tells the two apart. (Checked, not assumed:
    // walking 399,000 → 801,000 one 1,000-point kill at a time awards 2 lives under either
    // shape, because no individual frame crosses more than one threshold.)
    //
    // WHY IT CANNOT RUN. The old fixture manufactured the delta synthetically — 402 TIEs, each
    // under its own bolt, all on one point, +402,000 in a single frame. The hitscan beam
    // resolves exactly ONE object per frame (CLSLZ ranks every candidate and keeps a single
    // winner, `min(CL.GDS, CL.ADS)`), so the gun's largest possible single-frame delta is now
    // VADER_SCORE = 2,000. The biggest scoring event anywhere in the sim is SURFACE_CLEAR_BONUS
    // = 50,000, asserted below. The delta this guard needs is 400,001 (800,000 − 399,999). That
    // is two orders of magnitude short, so it is not a matter of finding a cleverer fixture:
    // NO reachable game state produces it, and any fixture that appeared to would be a lie.
    //
    // HOW IT RUNS NOW. `finalizeScore` is EXPORTED (sw7-17) and tested directly. The award is a
    // pure function of (prev.score, next.score) — it reads nothing else — so calling the funnel
    // with two hand-built scores is not a weaker test than driving 402 TIEs through the sim; it
    // is the same arithmetic with the unreachable theatre removed. Exporting it is the whole
    // src/ change, and it buys back a guard that would otherwise have died with the projectile.
    //
    // The fixture is honest about being synthetic, and pins WHY it must be: assert first that no
    // real event could ever produce this delta, so nobody later "improves" this into a stepGame
    // fixture and quietly loses the guard again.
    const GAP = EXTRA_LIFE_THRESHOLDS[1] - EXTRA_LIFE_THRESHOLDS[0]
    expect(
      SURFACE_CLEAR_BONUS, // 50,000 — the biggest single-frame event in the game
      'the delta this guard needs is unreachable in play, which is WHY it calls the funnel ' +
        'directly rather than driving the sim. If a bigger event ever exists, revisit.',
    ).toBeLessThan(GAP)

    // 399,999 → 800,000 in one step: crosses 400k AND 800k. The loop grants two; an `else if`
    // (or any highest-threshold-only shape) grants one.
    const prev: GameState = { ...wave(), score: 399_999, lives: 6 }
    const next: GameState = { ...prev, score: 800_000 }

    expect(finalizeScore(prev, next).lives - prev.lives).toBe(2)
  })

  it('a single delta crossing only ONE threshold grants exactly one — the loop is not a blanket', () => {
    // The other half: the loop must be gated on `prev < t && next >= t` per threshold, not "grant
    // one per threshold in the list whenever the score moves". Same funnel, one crossing.
    const prev: GameState = { ...wave(), score: 399_999, lives: 6 }
    const next: GameState = { ...prev, score: 400_000 }

    expect(finalizeScore(prev, next).lives - prev.lives).toBe(1)
  })

  it('a whole wave of kills under 400k grants no life (threshold-gated, not per-kill)', () => {
    // Many kills, no threshold crossed, no life — the award is gated on the THRESHOLD, not
    // handed out per kill. A per-kill implementation hands back one life per TIE and is caught
    // here; that is the whole job of this test, and it is intact.
    //
    // sw7-17 SHRANK THE FIXTURE FROM 50 KILLS TO A WAVE'S WORTH, and this is the reason. The
    // old fixture stacked 50 TIEs under 50 bolts and killed them in ONE frame, which is the
    // only way 50 space kills can ever happen: the beam resolves one object per frame, and the
    // space wave CLEARS at SPACE_WAVE_QUOTA (6) kills, at which point `enterPhase` wipes every
    // TIE still on the field. So the run physically cannot put a 7th TIE kill on the board
    // without leaving the space phase — 50 sequential kills was never reachable, and the old
    // number only worked because simultaneity dodged the quota check.
    //
    // A wave's worth is what the phase actually allows, so that is what the pilot flies here:
    // pull whenever the gun is ready, hold the aim in between. Every kill is a shot a pilot
    // could really take, which fifty stacked bolts never were. 6 × 1,000 = 6,000 is still
    // nowhere near 400k, and a per-kill bug would still show up as six free lives.
    const s0: GameState = {
      ...wave(),
      mode: 'playing',
      phase: 'space',
      score: 0,
      lives: 6,
      enemies: Array.from({ length: SPACE_WAVE_QUOTA }, () => tie(AT)),
      spawnTimer: 1e9,
    }

    let s = s0
    let frames = 0
    const BUDGET = Math.ceil((SPACE_WAVE_QUOTA * FIRE_INTERVAL) / TICK) + 200 // the sweep beats it
    while (s.phase === 'space' && s.enemies.length > 0 && frames < BUDGET) {
      const aim = fireAt(s, AT)
      // Pull on every frame the gun will accept one, else hold the same aim with the trigger
      // up. (`firePrev` is the rising-edge register: a pull only lands off a released trigger.)
      const ready = s.fireCooldown <= 0 && !s.firePrev
      s = stepGame(s, ready ? aim : release(aim), TICK)
      frames++
    }

    // Every one of them was SHOT, not wiped by the phase change: the score is the only thing
    // that can tell those apart, and it only reaches the quota's worth if each kill scored.
    expect(s.score, 'a full wave was really shot down — not a vacuous pin').toBe(
      SPACE_WAVE_QUOTA * TIE_SCORE,
    )
    expect(s.score, 'and the whole haul is still nowhere near the first threshold').toBeLessThan(
      EXTRA_LIFE_THRESHOLDS[0],
    )
    expect(s.lives).toBe(s0.lives)
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
    // Drain a while — and, since sw7-17, long enough that the gun will accept a second pull at
    // all: the drain used to be three frames, but a kill now leaves FIRE_INTERVAL (0.25 s = 15
    // frames) on the clock, and a refused pull would score nothing and re-arm nothing, quietly
    // turning this into a test of an empty frame. 20 frames clears the gun and still leaves the
    // flash two-thirds up (it drains BONUS_FLASH_DECAY = 1/60 per step from 1), which is what
    // this test needs: a partial decay to snap back from.
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
  it('the extra-life award and the flash are deterministic for identical input', () => {
    const a = kill(about(399_000))
    const b = kill(about(399_000))
    expect(a.score, 'the threshold really was crossed — not two identical no-ops').toBe(400_000)
    expect(a.lives).toBe(b.lives)
    expect(a.score).toBe(b.score)
    expect(a.bonusFlash).toBe(b.bonusFlash)
  })
})
