// tests/core/tie-strafe-fire.test.ts
//
// Story 9-4 — Strafe-and-fire: per-TIE fireball cadence/source, RED phase.
//
// Today the space wave lobs enemy fire on a SINGLE whole-formation timer
// (`sim.ts` enemyFireCooldown): when the global clock ticks, ONE uniformly-random
// TIE — any TIE, regardless of where it is in its pass — fires, then the whole
// formation waits a fixed interval. The cabinet does the opposite
// (docs/tie-flight-ai-model.md §6): EACH fighter fires independently while it is
// IN ITS STRAFE/PASS WINDOW (in the firing arc AND in range — "not too close"),
// so the sky fills from several fighters at once. This suite pins the new
// contract and is EXPECTED TO FAIL until the GREEN phase implements it.
//
// SCOPE / SPEC RECONCILIATION (TEA design decisions — logged as session deviations):
//   * "Strafe window" is read from the model's fire gate (§6): a fighter strafes
//     while it is making its pass — approaching (not peeling/out-of-arc) AND beyond
//     the pass-end near edge (range > TIE_NEAR_BOUND, the §6 "not too close" gate,
//     reusing the existing single-sourced constant rather than inventing a new one).
//   * AC2's "matches the RE'd values (or documented fallback)" is loose on the exact
//     cadence number, so these tests pin the BEHAVIOUR (per-TIE, pass-gated, 6-slot
//     cap, deterministic) and leave Dev free to choose the cadence/PRNG values —
//     they do not hard-code a fire frame.
//   * The aim target stays the cockpit at the origin (the §6 launch vector = TIE −
//     ship; our ship sits at [0,0,0]) so the existing space-combat aim contract
//     and story 8-18 shoot-down both stay intact.
//
// Everything here obeys the sacred boundary: no DOM, no time except `dt`, no
// randomness except the seeded RNG carried in state.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  ENEMY_SPEED,
  ENEMY_SHOT_TTL,
  ENEMY_FIRE_INTERVAL,
  MAX_FIREBALL_SLOTS,
  TIE_NEAR_BOUND,
  COCKPIT_HIT_RADIUS,
  FIREBALL_SCORE,
  PROJECTILE_TTL,
  type GameState,
  type Enemy,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { normalize, sub, scale, length, type Vec3, type Mat4 } from '@arcade/shared/math3d'

const COCKPIT: Vec3 = [0, 0, 0]
const DT = 0.05
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** A TIE making its pass: at `pos`, thrusting toward the cockpit at `speed`, with
 * swoop `bank` (0 = pure homing). Mirrors `tieToward` in tie-peel-away.test.ts. */
const tieToward = (pos: Vec3, speed = ENEMY_SPEED, bank = 0): Enemy => ({
  pos,
  vel: scale(normalize(sub(COCKPIT, pos)), speed),
  kind: 'tie',
  orient: IDENTITY,
  bank,
})

/** A fighter that has finished its pass and is peeling away (out of the firing
 * arc): velocity points OUTWARD and the peel latch is set, so it recedes. */
const peelingTie = (pos: Vec3, speed = ENEMY_SPEED): Enemy => ({
  pos,
  vel: scale(normalize(pos), speed),
  kind: 'tie',
  orient: IDENTITY,
  bank: 1,
  peeling: true,
})

/** A playing state with the given TIEs, the enemy-fire clock READY (cooldown 0 —
 * so the OLD formation timer fires immediately, making the contrast tests RED),
 * and the spawner parked so the only fire that can appear comes from these TIEs.
 * `wave` defaults to 1; pass a deeper wave where the story 9-5 per-wave fireball
 * concurrency cap must permit several fighters to fill the sky at once. */
const fireReady = (enemies: Enemy[], seed = 1983, wave = 1): GameState => ({
  ...initialState(seed),
  wave,
  enemies,
  projectiles: [],
  enemyShots: [],
  spawnTimer: 1e9,
  enemyFireCooldown: 0,
})

/** Step a state forward `n` frames with a fixed input. */
function stepN(s: GameState, n: number, input = NO_INPUT, dt = DT): GameState {
  for (let i = 0; i < n; i++) s = stepGame(s, input, dt)
  return s
}

/** A two-interval window in frames — long enough that every eager in-window TIE
 * gets a turn, yet the OLD single timer can only fire twice (once per interval). */
const TWO_INTERVALS = Math.round((ENEMY_FIRE_INTERVAL * 2) / DT)

describe('Story 9-4 — fire is per-TIE, not a whole-formation timer (AC1)', () => {
  it('multiple in-window TIEs put more fire in the sky than one formation timer can', () => {
    // Three fighters squarely in their pass window (approaching, range >
    // TIE_NEAR_BOUND, in front of the camera). The whole-formation timer caps the
    // sky at ONE fireball per fire-interval — exactly TWO across this 2-interval
    // window. Per-TIE strafe fire lets all three contribute, so the sky holds MORE
    // than the formation clock alone could.
    //
    // Asserted at WAVE 7 (story 9-5): the new per-wave fireball-concurrency cap is
    // the RE'd fire table, and the ROM-faithful wave 1 permits only ONE fireball
    // aloft (index 0). The "several at once" contract therefore needs a wave whose
    // table cap (7 → 6) lets the sky fill; the per-TIE-vs-formation intent is
    // unchanged. Wave-1's faithful single-fireball cap is pinned in tie-wave-ramp.test.ts.
    // Per-TIE strafe fire: all three in-window fighters fire, so the sky holds MORE
    // than the formation timer's cap of two across the window. Homing fireballs
    // (sw4-2) now converge on the cockpit and are removed as they ARRIVE, so the
    // count at the window's END understates the fire that went up — track the PEAK
    // simultaneously aloft instead, the true "more fire in the sky" measure.
    // Positioned in the RESTORED approach band (sw4-1): |pos| ~3800–4000 sits past the
    // restored TIE_NEAR_BOUND (2048) fire floor, so all three are genuinely in-window.
    // (The pre-sw4-1 ~900-unit placement now falls INSIDE the near-bound and would
    // peel immediately — no fire — so it was moved out into the approach band.)
    let s = fireReady(
      [tieToward([250, 0, -4000]), tieToward([-200, 150, -3800]), tieToward([0, -220, -3900])],
      1983,
      7,
    )
    let peak = 0
    for (let i = 0; i < TWO_INTERVALS; i++) {
      s = stepGame(s, NO_INPUT, DT)
      peak = Math.max(peak, s.enemyShots.length)
    }
    expect(peak).toBeGreaterThanOrEqual(3)
  })

  it('a peeled-away fighter (pass complete, out of arc) never originates fire', () => {
    // A peeling TIE has finished its pass and is receding — out of the firing arc.
    // The formation timer fires whatever TIE it randomly grabs, peeling ones
    // included; strafe fire must come only from fighters still making a pass.
    // RED today: the global timer fires this lone peeling TIE on the first tick.
    let s = fireReady([peelingTie([200, 0, -400])])
    for (let i = 0; i < TWO_INTERVALS; i++) {
      s = stepGame(s, NO_INPUT, DT)
      expect(s.enemyShots).toHaveLength(0)
    }
  })

  it('a fighter that has bored past the strafe window (too close) never originates fire', () => {
    // The RE'd fire gate is "in range — NOT too close" (model §6): once a fighter
    // has closed inside the pass-end near edge (TIE_NEAR_BOUND) it no longer
    // strafes. Dead-centre so it bores straight in (it is not peeling). The
    // formation timer would still fire it; strafe fire must not. RED today.
    const tooClose = Math.round(TIE_NEAR_BOUND * 0.4) // ≈140: well inside the near edge, still clear of the cockpit sphere
    let s = fireReady([tieToward([0, 0, -tooClose])])
    for (let i = 0; i < 8; i++) {
      s = stepGame(s, NO_INPUT, DT)
      expect(s.enemyShots).toHaveLength(0)
    }
  })
})

describe('Story 9-4 — fireball source & aim track the firing TIE (AC1, AC3)', () => {
  it('a fireball launches from a firing TIE’s position, aimed at the cockpit', () => {
    let s = fireReady([
      tieToward([250, 0, -4000]),
      tieToward([-200, 150, -3800]),
      tieToward([0, -220, -3900]),
    ])
    let shot: Projectile | undefined
    for (let i = 0; i < 200 && shot === undefined; i++) {
      const before = s.enemyShots.length
      s = stepGame(s, NO_INPUT, DT)
      if (s.enemyShots.length > before) shot = s.enemyShots[s.enemyShots.length - 1]
    }
    expect(shot).toBeDefined()
    // Origin coincides with a live fighter — it was launched from a TIE, not a
    // fixed point or the cockpit.
    const originIsATie = s.enemies.some((e) => length(sub(e.pos, shot!.pos)) < 1e-6)
    expect(originIsATie).toBe(true)
    expect(length(shot!.pos)).toBeGreaterThan(COCKPIT_HIT_RADIUS)
    // Aimed back at the cockpit: the fireball HOMES there. Isolate this shot and
    // confirm a step pulls it inward toward the origin (sw4-2 replaced the old
    // straight-line velocity this once read off `shot!.vel`). Green under either
    // law — both close on the cockpit; homing just decays the position there.
    const isolated: GameState = {
      ...initialState(1983),
      enemies: [],
      enemyShots: [{ ...shot!, pos: [...shot!.pos] as Vec3 }],
      spawnTimer: 1e9,
    }
    const homed = stepGame(isolated, NO_INPUT, 0.02).enemyShots[0]
    expect(length(homed.pos)).toBeLessThan(length(shot!.pos))
  })
})

describe('Story 9-4 — invariants preserved under per-TIE fire (AC2, AC3, AC4)', () => {
  it('still respects the 6-fireball slot cap with several fighters strafing at once', () => {
    // Three fighters firing on their own cadences, fireballs living ENEMY_SHOT_TTL
    // seconds: without the slot cap the sky would overflow well past six. lives is
    // parked high so a stray ram never ends the run mid-measurement.
    let s: GameState = { ...fireReady([
      tieToward([250, 60, -4000]),
      tieToward([-220, -40, -3800]),
      tieToward([40, 200, -3900]),
    ]), lives: 999 }
    for (let i = 0; i < 120; i++) {
      s = stepGame(s, NO_INPUT, DT)
      expect(s.enemyShots.length).toBeLessThanOrEqual(MAX_FIREBALL_SLOTS)
    }
  })

  it('a player bolt still shoots an enemy fireball out of the air (story 8-18 intact)', () => {
    const P: Vec3 = [0, 0, -300]
    const base: GameState = {
      ...initialState(7),
      enemies: [],
      projectiles: [{ pos: [...P] as Vec3, vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
      enemyShots: [{ pos: [...P] as Vec3, vel: [0, 0, 1], ttl: ENEMY_SHOT_TTL }],
      spawnTimer: 1e9,
      enemyFireCooldown: 1e9,
    }
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.enemyShots).toHaveLength(0)
    expect(s1.score).toBe(base.score + FIREBALL_SCORE)
  })

  it('replays enemy fire bit-identically from a fixed seed (deterministic & pure)', () => {
    const run = (): Projectile[] =>
      stepN(
        fireReady(
          [tieToward([250, 0, -4000]), tieToward([-200, 150, -3800]), tieToward([0, -220, -3900])],
          4242,
        ),
        TWO_INTERVALS,
      ).enemyShots
    expect(run()).toEqual(run())
  })

  it('firing does not mutate the input enemyShots array in place', () => {
    let s = fireReady([tieToward([250, 0, -4000])])
    for (let i = 0; i < 200 && s.enemyShots.length === 0; i++) s = stepGame(s, NO_INPUT, DT)
    expect(s.enemyShots.length).toBeGreaterThan(0)
    const before = s.enemyShots
    const beforeLen = before.length
    stepGame(s, NO_INPUT, DT)
    expect(s.enemyShots).toBe(before) // same reference — untouched
    expect(s.enemyShots).toHaveLength(beforeLen)
  })
})
