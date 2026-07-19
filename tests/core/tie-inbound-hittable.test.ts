// tests/core/tie-inbound-hittable.test.ts
//
// Story sw2-1 (bug, RED): "TIE fighters cannot be hit on their way in — a hit only
// registers after a fighter finishes its attack run, turns back, and closes to very
// short range." (Wave 1 space combat.)
//
// Shape of the defect (what these RED tests PIN — not how GREEN must fix it): a
// player bolt lives PROJECTILE_TTL (2s) at PROJECTILE_SPEED (900), so it travels
// only ~1800 units before it expires. TIEs SPAWN at TIE_SPAWN_DISTANCE (8000) and
// bear in. An inbound fighter is therefore beyond a bolt's reach until it has closed
// to ~1800 units — "very close" — which is exactly when the player reports finally
// being able to hit it. A fighter that has PEELED away (retreating, culled at
// TIE_EXIT_RANGE 1800) already sits inside that reach, so the retreat path works
// today while the whole approach does not.
//
// These tests drive the REAL firing path (the trigger via Input), so stepGame spawns
// and aims the bolt — they assert only observable sim state (enemy count, score,
// shields, the enemy-death event), never a mechanism, so the GREEN fix is free to
// restore reach however it likes (bolt lifetime, speed, or an explicit range model).
// A STATIONARY stand-in TIE isolates reach from the approach's timing/ram noise — the
// same fixture the 8-16 kill-loop suite uses; a real fighter flies the same line of
// sight straight in, so a still target under the crosshair is the same shot without
// the flicker. Aim stays on the vertical axis (x = 0) so the pure core never needs
// the render's aspect ratio.
//
// Boundary intact: no DOM, no time except dt, no randomness except the seeded RNG.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  TIE_SCORE,
  TIE_SPAWN_DISTANCE,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { perspective, transform, IDENTITY, type Vec3 } from '@arcade/shared/math3d'

const DT = 1 / 60

// The projection the renderer paints the scene with (render.ts): a 60° vertical FOV.
// near/far don't affect the x/y NDC a point maps to (only its depth), so any positive
// pair mirrors the render. Aspect scales X only; every aimed target below is on the
// vertical axis (x = 0), so the aspect choice is irrelevant.
const FOV_Y = Math.PI / 3
const proj = (aspect = 16 / 9): ReturnType<typeof perspective> => perspective(FOV_Y, aspect, 1, 5000)

/** A TIE holding station at `pos`. A real fighter flies straight at the cockpit,
 * holding the same line of sight the whole way in; a stationary stand-in is that
 * target without the timing and ram noise, so the only thing that can remove it is
 * the player's own fire. */
const tieStill = (pos: Vec3): Enemy => ({ pos, kind: 'tie', orient: IDENTITY })

/** The yoke deflection that puts the crosshair ON a world point (crosshairNdc is
 * identity, so aiming at a point = setting the yoke to that point's projected NDC). */
const aimAt = (pos: Vec3): { aimX: number; aimY: number } => {
  const ndc = transform(proj(), pos)
  return { aimX: ndc[0], aimY: ndc[1] }
}

/** A lone-TIE wave with spawns and enemy fire suppressed, so the only thing that can
 * change the enemy count or shields is the player's own fire (or a ram). */
const loneWave = (enemy: Enemy, over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  enemies: [enemy],
  spawnTimer: 999,
  enemyFireCooldown: 999,
  ...over,
})

/** Hold the trigger aimed at `target` until the wave is clear or the budget runs out.
 * The budget is generous so a GREEN fix may reach the target with a fast short-lived
 * bolt OR a slow long-lived one — the test never assumes which. Returns the final state. */
const fireUntilClear = (s0: GameState, target: Vec3, maxFrames: number): GameState => {
  let s = s0
  const fire: Input = { ...aimAt(target), fire: true }
  for (let i = 0; i < maxFrames && s.enemies.length > 0; i++) s = stepGame(s, fire, DT)
  return s
}

describe('Story sw2-1 — inbound TIEs are hittable on the way in', () => {
  it('destroys a TIE bearing in at spawn distance — engageable as it comes, not only when it is on top of you', () => {
    // Dead ahead, far downrange: a freshly-inbound fighter at the far edge of the
    // approach. Today the bolt expires at ~1800 units and never reaches 8000, so this
    // fails RED; the GREEN fix must let a bolt reach across the approach volume.
    const tie = tieStill([0, 0, -TIE_SPAWN_DISTANCE])
    const s = fireUntilClear(loneWave(tie), tie.pos, 1200)
    expect(s.enemies).toHaveLength(0) // the bolt reached it — killed on the way IN
    expect(s.score).toBe(TIE_SCORE) // by fire (a ram never scores)
    expect(s.lives).toBe(STARTING_LIVES) // and cost no shield
    expect(s.events.some((e) => e.type === 'enemy-death' && e.enemyType === 'tie')).toBe(true) // the kill event fired
  })

  it('destroys a TIE mid-approach, well beyond the current bolt reach', () => {
    // A representative mid-approach range (4000): unambiguously "inbound" (>2x the
    // ~1800 bolt reach, >2x TIE_EXIT_RANGE), so it too is out of reach today. Guards
    // against a partial fix that only nudges reach a little past close range.
    const tie = tieStill([0, 0, -4000])
    const s = fireUntilClear(loneWave(tie), tie.pos, 600)
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(TIE_SCORE)
    expect(s.lives).toBe(STARTING_LIVES)
  })
})

describe('Story sw2-1 — the retreat path and aim precision must survive the reach fix', () => {
  it('still destroys a TIE that is very close in (regression — the path that already works)', () => {
    // "After the attack run, turned back, very close": a fighter that has closed in
    // lives well inside a bolt's reach — the one window the player can hit today.
    // Passes now; the GREEN reach fix must NOT break it.
    const tie = tieStill([0, 0, -900])
    const s = fireUntilClear(loneWave(tie), tie.pos, 300)
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(TIE_SCORE)
    expect(s.lives).toBe(STARTING_LIVES)
  })

  it('a straight-ahead shot does NOT hit an inbound TIE off to the side (reach must stay on the aim line)', () => {
    // Extending a bolt's reach must not turn it into a depth-plane sweep: a fighter at
    // the same downrange depth but far off the firing axis must still be missed. Guards
    // the GREEN fix against widening WHAT collides instead of only HOW FAR the bolt flies.
    const tie = tieStill([1600, 0, -4000]) // deep-inbound depth, far off-centre
    let s = loneWave(tie)
    const fire: Input = { aimX: 0, aimY: 0, fire: true } // aim dead centre, NOT at the TIE
    for (let i = 0; i < 600 && s.enemies.length > 0; i++) s = stepGame(s, fire, DT)
    expect(s.enemies).toHaveLength(1) // the off-axis fighter survives a centre shot
    expect(s.score).toBe(0) // nothing was hit
    expect(s.lives).toBe(STARTING_LIVES) // and it never rammed (stationary)
  })
})
