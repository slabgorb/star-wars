// tests/core/combat-kill-loop.test.ts
//
// Story 8-16 (bug, RED): "Firing does not kill enemies; the wave clears via
// collision/ramming, not kills." (Wave 1)
//
// The Wave-1 kill loop is broken END-TO-END. The per-pair hit-test works (the
// 8-3 suite hand-places a bolt ON a TIE and it dies), but the path a PLAYER
// actually uses does not: you put the crosshair on a TIE, pull the trigger, and
// miss. The cause is a consistency bug between the firing aim and the perspective
// projection the scene is drawn under:
//
//   * The renderer projects the world with a 60° vertical FOV (render.ts:
//     perspective(Math.PI/3, ...)). A world point [x,y,z] therefore lands at NDC
//     [(f/aspect)·x/-z, f·y/-z] with f = 1/tan(30°) ≈ 1.732.
//   * The crosshair is drawn at NDC [aimX, aimY] (gameRules.crosshairNdc), but a
//     bolt is fired along aimDirection = [aimX, aimY, -1] — whose path projects
//     to NDC [(f/aspect)·aimX, f·aimY]. The bolt overshoots the reticle by ~f,
//     so a TIE sitting under the crosshair is missed.
//
// With shots missing, the player can never meet the space kill quota by fire —
// the only thing that clears the sky is letting TIEs RAM the cockpit, which costs
// a shield and must NOT advance the wave. That is the reported symptom.
//
// These tests drive the REAL firing path (the trigger via Input), so the bolt is
// spawned and aimed by stepGame, not hand-placed on the enemy. They assert
// observable sim state (enemy count, score, shields, phase) so the GREEN fix is
// free to realign aim/projection however it likes. Vertical aim only (x = 0), so
// they are independent of the render's aspect ratio (a shell value the pure core
// cannot read — see the Delivery Findings for the horizontal/aspect dimension).
//
// Boundary intact: no DOM, no time except dt, no randomness except the seeded RNG.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  TIE_SCORE,
  SPACE_WAVE_QUOTA,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import type { Input } from '../../src/core/input'
import { aimDirection, crosshairNdc } from '../../src/core/gameRules'
import { perspective, transform, IDENTITY, type Vec3 } from '@arcade/shared/math3d'

const DT = 1 / 60

// The projection the renderer paints the scene with (render.ts): a 60° vertical
// FOV. near/far don't affect the x/y NDC a point maps to (only its depth), so any
// positive pair mirrors the render. Aspect only scales X; every test below keeps
// enemies on the vertical axis (x = 0), so the aspect choice is irrelevant.
const FOV_Y = Math.PI / 3
const proj = (aspect = 16 / 9): ReturnType<typeof perspective> => perspective(FOV_Y, aspect, 1, 5000)

/** A TIE holding station at `pos` (vel 0). A real TIE flies straight at the
 * cockpit, which keeps it on the same line of sight — under the same crosshair —
 * the whole way in; a stationary stand-in is the same target without the timing
 * and ram noise, so the only thing that can remove it is the player's own fire. */
const tieStill = (pos: Vec3): Enemy => ({ pos, kind: 'tie', orient: IDENTITY })

/** The yoke deflection that puts the crosshair ON a world point. The crosshair is
 * drawn at NDC [aimX, aimY] (crosshairNdc is identity), so aiming at a point means
 * setting the yoke to that point's projected NDC. */
const aimAt = (pos: Vec3): { aimX: number; aimY: number } => {
  const ndc = transform(proj(), pos)
  return { aimX: ndc[0], aimY: ndc[1] }
}

/** A lone-TIE wave with spawns and enemy fire suppressed, so the only thing that
 * can change the enemy count or shields is the player's own fire (or a ram). */
const loneWave = (enemy: Enemy, over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  enemies: [enemy],
  spawnTimer: 999,
  enemyFireCooldown: 999,
  ...over,
})

describe('Story 8-16 — firing kills the enemy under the crosshair', () => {
  it('a centred shot destroys a TIE dead ahead (control: the centre already works)', () => {
    const tie = tieStill([0, 0, -1200])
    let s = loneWave(tie)
    const fire: Input = { ...aimAt(tie.pos), fire: true } // dead centre → aim (0, 0)
    for (let i = 0; i < 180 && s.enemies.length > 0; i++) s = stepGame(s, fire, DT)
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(TIE_SCORE) // killed by fire (a ram would never score)
    expect(s.lives).toBe(STARTING_LIVES) // and cost no shield
  })

  it('a shot aimed at an OFF-CENTRE TIE under the crosshair destroys it', () => {
    // The TIE renders well above centre; the yoke puts the crosshair right on it.
    const tie = tieStill([0, 660, -1200])
    let s = loneWave(tie)
    const fire: Input = { ...aimAt(tie.pos), fire: true }
    for (let i = 0; i < 180 && s.enemies.length > 0; i++) s = stepGame(s, fire, DT)
    expect(s.enemies).toHaveLength(0) // the bolt must follow the crosshair, not overshoot it
    expect(s.score).toBe(TIE_SCORE) // destroyed by fire...
    expect(s.lives).toBe(STARTING_LIVES) // ...not by letting it ram the cockpit
  })

  it('the firing line projects onto the crosshair (vertical aim) — aim and sight agree', () => {
    // The precise pin: a point down the bolt's flight path must appear, on screen,
    // exactly where the crosshair is drawn. Today aimDirection ignores the FOV, so
    // the bolt's path projects to f·aimY instead of aimY and the two diverge.
    const aimY = 0.6
    const dir = aimDirection(0, aimY) // the direction the bolt flies
    const downrange: Vec3 = [dir[0] * 1000, dir[1] * 1000, dir[2] * 1000] // a point on its path
    const ndc = transform(proj(), downrange) // where that point lands on screen (NDC)
    const [, crossY] = crosshairNdc(0, aimY) // where the crosshair sits (NDC)
    expect(ndc[1]).toBeCloseTo(crossY, 5) // the bolt must fly toward the reticle
  })
})

describe('Story 8-16 — the space wave clears by kills, not by ramming', () => {
  it('shooting the final TIE under the crosshair clears the space phase', () => {
    const tie = tieStill([0, 660, -1200])
    // WAVE 2 — wave 1 has no ground phase (sw7-18 / D-015), so the space clear that
    // this "cleared by fire" test asserts advances into the surface first appears on wave 2.
    let s = loneWave(tie, { wave: 2, phaseKills: SPACE_WAVE_QUOTA - 1 })
    const fire: Input = { ...aimAt(tie.pos), fire: true }
    for (let i = 0; i < 180 && s.phase === 'space'; i++) s = stepGame(s, fire, DT)
    expect(s.phase).toBe('surface') // the final kill met the quota and advanced the wave
    expect(s.lives).toBe(STARTING_LIVES) // cleared by fire — no shield lost to a ram
  })

  it('a TIE ramming the cockpit costs a shield and does NOT clear the wave', () => {
    // One kill short of the quota, with a TIE already on the cockpit: ramming it is
    // the player taking a hit, never a kill, so the phase must hold in space. This
    // guards the wave-clear condition against ever counting a collision as a kill.
    const s0 = loneWave(tieStill([0, 0, 0]), { phaseKills: SPACE_WAVE_QUOTA - 1 })
    const s1 = stepGame(s0, { aimX: 0, aimY: 0, fire: false }, DT)
    expect(s1.phase).toBe('space') // ramming is not a kill — no wave clear
    expect(s1.lives).toBe(STARTING_LIVES - 1) // it cost a shield
    expect(s1.phaseKills).toBe(SPACE_WAVE_QUOTA - 1) // and did not count toward the quota
  })
})
