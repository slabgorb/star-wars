// tests/shell/render.tie-death-fragments.test.ts
//
// Story sw3-8 — RED phase (O'Brien / TEA). The WIRING half of the story.
//
// Porting the three exploded-TIE fragment models (see tests/core/tie-wing-
// fragments.test.ts) is worthless if a killed TIE still blinks out of existence.
// Today it does: stepGame filters a hit TIE out of `state.enemies` the same frame
// (sim.ts, the player-bolt-vs-TIE loop) and render.ts only ever draws
// `state.enemies` — so the fighter vanishes with no death beat. This suite pins
// that a destroyed TIE leaves a brief, BOUNDED fragment burst on screen.
//
// SEAM-AGNOSTIC BY CONSTRUCTION. The death animation must live in GameState and be
// advanced by stepGame(dt): render()'s signature is render(ctx, state, w, h) — it
// has no clock, so a shell-only timer could not animate it, and core purity
// forbids the shell reaching back in. We therefore never name a new field. We
// drive the REAL kill path (fire a bolt, let stepGame destroy the TIE) and then
// step the returned state forward, so WHATEVER representation the DEV adds (a
// debris list, a `tieDestroyedAt` stamp like deathStarDestroyedAt, ...) rides
// along automatically. The tests read only public API: initialState, stepGame,
// render.
//
// We assert TOTAL stroked segments, not colour or vertex positions (those are the
// eyeball's job, per repo convention). The baseline is an identical space frame
// with the TIE simply absent and no death in flight; every constant backdrop
// element is matched (the Death Star is a pure function of phaseKills — render.ts
// deathStarPlacement — and there is no starfield), so the segment DIFFERENCE is
// exactly the fragment burst.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { stepGame } from '../../src/core/sim'
import {
  initialState,
  TIE_SCORE,
  STARTING_LIVES,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { NO_INPUT, type Input } from '../../src/core/input'
import { perspective, transform, IDENTITY, type Vec3 } from '@arcade/shared/math3d'

const W = 800
const H = 600
const DT = 1 / 60

// --- a canvas-context stub that counts stroked line segments (one lineTo = one
//     drawn edge). Mirrors the proven stub in render.enemy-fireball-animation. ---
function makeCtx() {
  let segs = 0
  const ctx = {
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    strokeStyle: '',
    fillStyle: '',
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {
      segs++
    },
    arc() {},
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    fillText() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segs: () => segs }
}
const segCount = (state: GameState): number => {
  const rec = makeCtx()
  render(rec.ctx, state, W, H)
  return rec.segs()
}

// --- the same TIE-kill fixture the combat-kill-loop suite uses -----------------
const FOV_Y = Math.PI / 3
const proj = perspective(FOV_Y, 16 / 9, 1, 5000)
/** Yoke deflection that puts the crosshair ON a world point (crosshairNdc is id). */
const aimAt = (pos: Vec3): { aimX: number; aimY: number } => {
  const ndc = transform(proj, pos)
  return { aimX: ndc[0], aimY: ndc[1] }
}
const tieStill = (pos: Vec3): Enemy => ({ pos, vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })
/** A lone TIE with spawns and enemy fire suppressed — the only thing that can
 *  change the sky is the player's own fire. */
const loneWave = (enemy: Enemy, over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [enemy],
  projectiles: [],
  enemyShots: [],
  spawnTimer: 999,
  enemyFireCooldown: 999,
  ...over,
})

/** Fire on a dead-ahead TIE and return the FIRST state in which it is destroyed by
 *  fire (its own kill frame). Guards the fixture: it really died to a bolt, not a ram. */
function destroyTie(): GameState {
  const P: Vec3 = [0, 0, -1200]
  let s = loneWave(tieStill(P))
  const fire: Input = { ...aimAt(P), fire: true }
  let postKill: GameState | null = null
  for (let i = 0; i < 240 && postKill === null; i++) {
    const before = s.enemies.length
    s = stepGame(s, fire, DT)
    if (before > 0 && s.enemies.length === 0) postKill = s
  }
  if (postKill === null) throw new Error('fixture: the TIE was never destroyed by fire')
  expect(postKill.score).toBe(TIE_SCORE) // killed by the bolt...
  expect(postKill.lives).toBe(STARTING_LIVES) // ...not by letting it ram the cockpit
  return postKill
}

/** A space frame identical to a post-kill frame's backdrop but with NO TIE and no
 *  death in flight — the Death Star (∝ phaseKills) and HUD (∝ score/lives) match,
 *  so any segment difference is the fragment burst alone. Built fresh (not spread
 *  from the kill) so it can never carry the DEV's new death-animation state. */
const emptyBaseline = (like: GameState): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  projectiles: [],
  enemyShots: [],
  spawnTimer: 999,
  enemyFireCooldown: 999,
  score: like.score,
  lives: like.lives,
  phaseKills: like.phaseKills,
  t: like.t,
  aimX: 0,
  aimY: 0,
})

/** Step forward with the sky forced empty (no respawns), so only the death
 *  animation ages between frames. */
const advanceEmpty = (s: GameState): GameState => ({
  ...stepGame(s, NO_INPUT, DT),
  enemies: [],
  projectiles: [],
  enemyShots: [],
  spawnTimer: 999,
  enemyFireCooldown: 999,
})

// A fragment burst is a whole wireframe body's worth of edges (each fragment model
// is 18–28 vertices / dozens of edges); 8 is a comfortable floor that HUD-digit or
// crosshair jitter (already matched out) can never reach.
const BURST_MIN = 8

describe('sw3-8 — a destroyed TIE breaks into a visible fragment burst', () => {
  it('the kill fixture actually destroys a TIE by fire (sanity)', () => {
    const postKill = destroyTie()
    expect(postKill.enemies).toHaveLength(0)
  })

  it('renders a burst of extra geometry where the TIE died — it does not just vanish', () => {
    const postKill = destroyTie()
    const clean: GameState = { ...postKill, projectiles: [], enemyShots: [] }
    const base = segCount(emptyBaseline(postKill))

    // Look across the first few frames after the kill, so a one-frame animation
    // start-up delay cannot hide the burst.
    let s = clean
    let peak = segCount(s)
    for (let i = 0; i < 8; i++) {
      s = advanceEmpty(s)
      peak = Math.max(peak, segCount(s))
    }

    // TODAY: the TIE is filtered out and nothing replaces it → peak ≈ base → FAILS.
    // GREEN: the death animation draws the fragment models for a beat → peak ≫ base.
    expect(peak).toBeGreaterThanOrEqual(base + BURST_MIN)
  })

  it('the burst is BOUNDED — it clears within a few seconds, leaving no permanent cloud', () => {
    const postKill = destroyTie()
    const base = segCount(emptyBaseline(postKill))

    let s: GameState = { ...postKill, projectiles: [], enemyShots: [] }
    for (let i = 0; i < 300; i++) s = advanceEmpty(s) // ~5s at 60fps

    // A death animation must be transient: once it has fully aged out, the sky is
    // back to the empty baseline (a burst that never ends would be a regression).
    expect(segCount(s)).toBeLessThan(base + BURST_MIN)
  })
})
