// tests/core/tie-peel-away.test.ts
//
// Story 9-3 — Peel-away / fly-past lifecycle, RED phase.
//
// The Image-1 defect: an un-killed TIE homes straight into the cockpit (origin),
// its projected size ballooning to a full-frame wall, until it rams (costs a
// shield) or is shot. The cabinet does NOT do this — un-killed fighters complete
// their attack pass and PEEL AWAY, leaving the play volume without ramming
// (docs/tie-flight-ai-model.md §7). This suite defines the new contract and is
// EXPECTED TO FAIL until the GREEN phase implements it.
//
// SCOPE / SPEC RECONCILIATION (TEA design decisions — logged as session deviations):
//   * The model (§7) has NO TIE-body↔ship collision at all ("only fireballs damage
//     the player"). Story AC#3 deliberately KEEPS cockpit damage for genuine
//     head-on hits ("peel-away does not make TIEs harmless"). Per the spec-authority
//     hierarchy the STORY wins: peel-away is a STEERING change only — off-center
//     TIEs veer past and miss; a dead-center TIE still clips the cockpit sphere and
//     costs a shield (the collision check is unchanged and runs every frame).
//   * Peel-away is keyed to a per-TIE NEAR-RANGE bound (new constant
//     TIE_NEAR_BOUND), not the cabinet's wave-end group transition. Each un-killed
//     TIE that closes to the near-bound completes its pass and exits on its own —
//     which is what bounds on-screen scale every approach (AC#1 + AC#2).
//   * AC#2's near clip is a new single-sourced constant TIE_NEAR_BOUND (>
//     COCKPIT_HIT_RADIUS, < SPAWN_DISTANCE), matching how every Wave-1 tuning value
//     lives in state.ts. Importing it before Dev adds it makes B2 RED with a clear
//     "constant missing" message.
//
// Everything here obeys the sacred boundary: no DOM, no time except `dt`, no
// randomness except the seeded RNG carried in state.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  ENEMY_SPEED,
  COCKPIT_HIT_RADIUS,
  TIE_SPAWN_DISTANCE,
  TIE_NEAR_BOUND,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { normalize, sub, scale, length, type Vec3 } from '@arcade/shared/math3d'

const COCKPIT: Vec3 = [0, 0, 0]
const DT = 0.05

/** Distance from a world position to the cockpit at the origin. */
const range = (p: Vec3): number => length(sub(p, COCKPIT))

/** A fully-typed single TIE fixture: at `pos`, thrusting toward the cockpit at
 * `speed`, with the given swoop `bank` (0 = pure homing — isolates peel-away from
 * the 9-2 swoop). Mirrors the `tieAt` idiom in tie-flight.test.ts. */
const tieToward = (pos: Vec3, speed = ENEMY_SPEED, bank = 0): Enemy => ({
  pos,
  vel: scale(normalize(sub(COCKPIT, pos)), speed),
  kind: 'tie',
  orient: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  bank,
})

/** A playing state with exactly one fixture TIE and NOTHING else moving: the
 * spawner and the enemy-fire timer are parked far in the future so the only thing
 * that can change `lives` or `enemies` is the one TIE's own lifecycle. */
function soloState(tie: Enemy, seed = 1983): GameState {
  return {
    ...initialState(seed),
    enemies: [tie],
    projectiles: [],
    enemyShots: [],
    spawnTimer: 1e9,
    enemyFireCooldown: 1e9,
  }
}

interface Track {
  /** Per-frame samples of the TIE while it is still alive (recorded before the step). */
  ranges: number[]
  zs: number[]
  /** Per-frame shield count after each step. */
  lives: number[]
  /** Final state once the TIE is gone or the cap is reached. */
  final: GameState
  /** True if the TIE despawned (its slot was freed) within the cap. */
  despawned: boolean
}

/** Run a solo fixture forward, sampling the lone TIE each frame until it
 * despawns (slot freed) or `cap` steps elapse. */
function runSolo(state: GameState, cap = 3000): Track {
  let s = state
  const ranges: number[] = []
  const zs: number[] = []
  const lives: number[] = []
  let despawned = false
  for (let i = 0; i < cap; i++) {
    if (s.enemies.length === 0) {
      despawned = true
      break
    }
    const e = s.enemies[0]
    ranges.push(range(e.pos))
    zs.push(e.pos[2])
    s = stepGame(s, NO_INPUT, DT)
    lives.push(s.lives)
  }
  if (s.enemies.length === 0) despawned = true
  return { ranges, zs, lives, final: s, despawned }
}

describe('Story 9-3 — un-killed TIEs peel away and exit, not ram (AC1)', () => {
  it('an off-center un-shot TIE leaves the play volume without costing a shield', () => {
    // Today: this TIE homes straight down the line to the origin, passes through
    // the cockpit sphere (~range 80), costs a shield, and is removed — so `lives`
    // drops and the only way it leaves is by ramming. RED.
    const t = runSolo(soloState(tieToward([400, 0, -5000])))
    expect(t.despawned).toBe(true) // it left the play volume (slot freed)
    // Not one frame of damage: a clean pass costs no shield (it peeled, didn't ram).
    expect(t.final.lives).toBe(STARTING_LIVES)
    expect(t.lives.every((l) => l === STARTING_LIVES)).toBe(true)
  })

  it('completes a pass — its range bottoms out then grows again (recedes), never ramming', () => {
    // A ram is a monotonic close to ~0; a peel-away has a closest-approach minimum
    // and then the TIE recedes and leaves. Today the range only ever decreases
    // until the TIE is removed at the cockpit, so there is no later, larger sample. RED.
    const t = runSolo(soloState(tieToward([350, 120, -5000])))
    expect(t.ranges.length).toBeGreaterThan(5)
    const minRange = Math.min(...t.ranges)
    const lastRange = t.ranges[t.ranges.length - 1]
    expect(minRange).toBeGreaterThan(COCKPIT_HIT_RADIUS) // never entered the hit sphere
    expect(lastRange).toBeGreaterThan(minRange + 50) // it receded after its closest approach
  })
})

describe('Story 9-3 — on-screen TIE scale is bounded (AC2, near-bound)', () => {
  it('a peeling TIE never closes inside the near-bound while in front of the camera', () => {
    // The "full-frame wall" is a tiny range while the TIE is still in front of the
    // camera (z < 0). The near-bound caps that. Today min in-front range ~80. RED.
    const t = runSolo(soloState(tieToward([400, 0, -5000])))
    const inFront = t.ranges.filter((_, i) => t.zs[i] < 0)
    expect(inFront.length).toBeGreaterThan(5)
    // 10% slack absorbs one-step discretization at the trigger crossing.
    expect(Math.min(...inFront)).toBeGreaterThanOrEqual(TIE_NEAR_BOUND * 0.9)
  })

  it('the near-bound is a real clip — larger than the cockpit hit sphere, well inside the spawn distance', () => {
    // Drives the new single-sourced constant. Undefined until Dev adds it → RED
    // with a clear "expected undefined to be greater than 80" message.
    expect(TIE_NEAR_BOUND).toBeGreaterThan(COCKPIT_HIT_RADIUS)
    expect(TIE_NEAR_BOUND).toBeLessThan(TIE_SPAWN_DISTANCE)
  })
})

describe('Story 9-3 — genuine collision/strafe hits still cost a shield (AC3 guard)', () => {
  it('a dead-center TIE that flies into the cockpit still costs a shield and is removed', () => {
    // Peel-away must NOT disarm a genuine head-on. A dead-center TIE (zero lateral
    // offset, bank 0 — the falsy-but-valid case the `??`-vs-`||` trap, lang-review
    // TS check #4, must respect) has nothing to veer around and still clips the
    // cockpit sphere. Guards against an over-correction that makes ALL TIEs harmless.
    // Approaches at a DELIBERATELY slow speed: at the restored ENEMY_SPEED (10000)
    // one 0.05 s step is 500u, wider than the 160u cockpit sphere diameter, so a
    // point-sphere collision would tunnel straight through on a hand-placed
    // dead-center fixture. A real spawn can never sit dead-center (the TBG table
    // always displaces one lateral axis, so every fighter peels off-center), so this
    // synthetic guard just needs a step small enough (< sphere diameter) to register
    // the head-on it is asserting. (Point-sphere tunneling is logged as a Delivery
    // Finding for a future swept-collision story.)
    const before = soloState(tieToward([0, 0, -100], 2000))
    const t = runSolo(before)
    expect(t.despawned).toBe(true)
    expect(t.final.lives).toBe(STARTING_LIVES - 1)
  })
})

describe('Story 9-3 — deterministic & pure (AC4)', () => {
  it('identical seed and inputs replay identically across a long un-shot run', () => {
    // Peel-away must add no time/randomness. A full seeded space wave (spawns,
    // approaches, peels, exits, refills) replays bit-identically from one seed.
    const run = (): GameState => {
      let s = initialState(2024)
      for (let i = 0; i < 400; i++) s = stepGame(s, NO_INPUT, DT)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('stepping does not mutate the input enemies in place while a TIE is peeling', () => {
    // Advance a fixture to within the near-bound (where peel-away is active), then
    // assert one more step leaves the INPUT array and its positions untouched.
    let s = soloState(tieToward([400, 0, -5000]))
    for (let i = 0; i < 80 && s.enemies.length > 0 && range(s.enemies[0].pos) > TIE_NEAR_BOUND; i++) {
      s = stepGame(s, NO_INPUT, DT)
    }
    expect(s.enemies.length).toBeGreaterThan(0)
    const before = s.enemies
    const beforePos = before.map((e) => e.pos)
    stepGame(s, NO_INPUT, DT)
    expect(s.enemies).toBe(before) // same array reference, untouched
    expect(s.enemies.map((e) => e.pos)).toEqual(beforePos) // positions unchanged
  })
})
