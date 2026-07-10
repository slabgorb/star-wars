// tests/core/fireball-large-target.test.ts
//
// Story sw2-2 — enemy fireballs are LARGE, shootable targets (RED phase).
//
// The live-playtest defect: enemy fireballs read as small "+" glyphs and don't
// feel like the big, shootable fireballs of the cabinet. Story 8-18 already
// wired interception (a bolt downs a fireball), but two gaps remain, both flagged
// by sw2-1's Reviewer as Delivery Findings pointed at THIS story:
//
//   1. The interception tests (tests/core/shootable-fireballs.test.ts) hand-place
//      UNIT-velocity bolts at a 0.001s tick — they never exercise a bolt fired at
//      the real PROJECTILE_SPEED (5000, ~83 units/frame at 60fps). Collision is a
//      per-frame point-sphere test with no swept fallback, so a real, fast bolt
//      can skip a small sphere between frames (tunneling). The Reviewer asked for
//      a real-fired-bolt test here.
//   2. The fireball's hit sphere is a *small speck* (ENEMY_SHOT_HIT_RADIUS = 90),
//      out of step with the "large fireball" this story renders. A large fireball
//      should be a large TARGET — what you see is what you shoot.
//
// The sprint YAML carried no acceptance criteria, so TEA defines the contract:
//
//   * A bolt fired at the real PROJECTILE_SPEED (input.fire → the sim scales the
//     aim ray by PROJECTILE_SPEED) and followed frame-by-frame at 60fps destroys
//     a fireball it is aimed at, downrange, WITHOUT costing a shield — and scores
//     FIREBALL_SCORE and emits a positioned fireball-destroyed cue, exactly like
//     the hand-placed-bolt path in story 8-18.
//   * The fireball is a LARGE target: ENEMY_SHOT_HIT_RADIUS is a substantial
//     fraction of the other shootable body (TIE_HIT_RADIUS), not the old small
//     speck. WYSIWYG — the big fireball you see is the big fireball you can hit.
//   * A real-fired bolt that grazes the large fireball's BODY (offset from its
//     centre by more than the old 90u speck, but well inside the new large body)
//     still connects. With the old small radius that shot sailed past.
//
// These drive behaviour through the pure surface — stepGame(state, input, dt) and
// the GameState it returns — asserting observable gameplay, never internal shape,
// and obey the sacred boundary: no DOM, no time except dt, no randomness except
// the seeded RNG carried in state. Constants are referenced BY NAME so the suite
// survives whatever authentic-feel numbers GREEN settles on.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  ENEMY_SHOT_TTL,
  ENEMY_SHOT_HIT_RADIUS,
  TIE_HIT_RADIUS,
  FIREBALL_SCORE,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'

/** A fresh Wave-1 run: initialState starts in 'playing' + 'space' with a live
 *  trigger (fireCooldown 0) and no TIEs, so the only actor is the fireball. */
const wave = (seed = 1983): GameState => initialState(seed)

// One real 60fps frame. Not the 0.001s micro-tick the 8-18 suite uses to keep a
// hand-placed unit bolt still — here the bolt moves its true ~83 units/frame.
const FRAME = 1 / 60

// Trigger held, aim dead-centre, square aspect: the sim spawns a bolt at the
// cockpit with velocity = aimDirection(0,0,1) * PROJECTILE_SPEED = [0,0,-5000],
// flying straight down-range. This is a REAL fired bolt, not a hand-placed one.
const FIRE: Input = { aimX: 0, aimY: 0, fire: true, aspect: 1 }

// An enemy fireball drifting back toward the cockpit (+Z), full lifetime. Placed
// far enough down-range (-Z) that the bolt needs several frames to reach it, so a
// per-frame collision gap has room to bite if one exists.
const fireball = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 1], ttl: ENEMY_SHOT_TTL })

/**
 * Fire ONE real bolt, then coast, stepping at a true 60fps until the fireball is
 * gone (destroyed) or the horizon runs out. Returns the terminal state and every
 * event seen along the way — the fireball-destroyed cue fires on the impact frame
 * only (events are fresh each step), so we must collect across frames.
 */
function fireAndFollow(s0: GameState, maxFrames = 90): { state: GameState; events: GameEvent[]; frames: number } {
  const events: GameEvent[] = []
  let s = stepGame(s0, FIRE, FRAME) // frame 1: bolt spawns at the cockpit
  events.push(...s.events)
  let frames = 1
  while (s.enemyShots.length > 0 && frames < maxFrames) {
    s = stepGame(s, NO_INPUT, FRAME) // release the trigger and let the bolt fly
    events.push(...s.events)
    frames++
  }
  return { state: s, events, frames }
}

describe('sw2-2 — a real-fired bolt downs a fireball (real-speed coverage)', () => {
  it('destroys an on-axis fireball fired at the real PROJECTILE_SPEED', () => {
    // The gap the 8-18 suite left: those bolts are hand-placed at unit velocity.
    // This one is fired by the sim at 5000 u/s and followed at 60fps.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball([0, 0, -2000])], projectiles: [] }
    const { state } = fireAndFollow(s0)
    expect(state.enemyShots).toHaveLength(0) // downed, not tunneled through
  })

  it('intercepting it downrange costs no shield', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball([0, 0, -2000])], projectiles: [] }
    const { state } = fireAndFollow(s0)
    expect(state.lives).toBe(STARTING_LIVES)
  })

  it('scores FIREBALL_SCORE and emits a positioned fireball-destroyed cue', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball([0, 0, -2000])], projectiles: [] }
    const { state, events } = fireAndFollow(s0)
    expect(state.score).toBe(base.score + FIREBALL_SCORE)
    const cue = events.find((e) => e.type === 'fireball-destroyed')
    expect(cue).toBeDefined()
    // The cue carries the fireball's OWN down-range position, not the cockpit
    // origin — a kill happened out in front, not a cockpit collision.
    expect(cue && 'pos' in cue ? cue.pos[2] : 0).toBeLessThan(-100)
  })
})

describe('sw2-2 — the fireball is a LARGE target', () => {
  it('has a hit sphere a substantial fraction of a TIE, not a small speck', () => {
    // WYSIWYG: the large fireball this story renders must be a large target too.
    // Half a TIE's hit radius is "large fireball" scale; the old 90u speck is not.
    expect(ENEMY_SHOT_HIT_RADIUS).toBeGreaterThanOrEqual(TIE_HIT_RADIUS * 0.5)
  })

  it('a real-fired bolt grazing the large body still connects', () => {
    // A fireball offset 110u from the bolt's straight-ahead axis. That is OUTSIDE
    // the old small speck (90) — the bolt sailed past — but well INSIDE the large
    // body this story gives it, so the shot now connects. Tied to the constant so
    // the premise can't silently drift from the large-target radius above.
    const GRAZE = 110
    expect(ENEMY_SHOT_HIT_RADIUS).toBeGreaterThan(GRAZE)
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball([GRAZE, 0, -2000])], projectiles: [] }
    const { state } = fireAndFollow(s0)
    expect(state.enemyShots).toHaveLength(0) // the big fireball is hit, not skimmed past
    expect(state.lives).toBe(STARTING_LIVES) // and downed downrange, no shield lost
  })
})
