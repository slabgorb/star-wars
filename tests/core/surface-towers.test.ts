// tests/core/surface-towers.test.ts
//
// Story sw2-3 — surface-assault phase: TALL TOWERS with yellow-cube tops firing
// fireballs, not grounded trench turrets; gate round-1 firing. RED phase.
//
// Live-playtest defect (sw2 epic): the pre-trench surface phase reads like
// GROUNDED turrets — a fireball erupts from the FLOOR (y = 0) the instant a
// turret appears, with no reaction window. Authentic surface towers are tall
// structures tipped with a yellow cube: the fireball launches from that elevated
// cube, and a freshly-risen tower holds its fire briefly before the first shot so
// round-1 firing is readable rather than instantaneous.
//
// This suite pins the two DETERMINISTIC, core-observable halves of that contract
// (the yellow-cube *visual* is a render concern, pinned separately in
// tests/shell/render.surface-tower-cube.test.ts):
//
//   1. Fireballs originate from the tower cube-top elevation (TOWER_HEIGHT),
//      not the y = 0 floor — while still aimed back at the cockpit.
//   2. A newly-risen tower is fire-GATED for TOWER_FIRE_GRACE seconds (it must
//      not fire on the frame it appears), then fires once the grace elapses.
//
// TEA-defined contract (the sprint YAML carried only the story title). Values are
// referenced BY NAME — TOWER_HEIGHT / TOWER_FIRE_GRACE are new state constants
// GREEN adds, so `tsc` is red until they exist while vitest reports the behaviour
// as failing. Everything obeys the sacred core boundary: no DOM, no time except
// `dt`, no randomness except the seeded RNG in state.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TOWER_HEIGHT,
  TOWER_FIRE_GRACE,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { dot, sub, type Vec3 } from '@arcade/shared/math3d'

/** A fresh surface run: Wave 1's initial state flipped into the surface phase
 *  (mirrors tests/core/surface.test.ts). */
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })

const DT = 0.02

/** Step until the first surface fireball appears, returning it at its SPAWN
 *  origin (captured on the appearance frame, before the next step advances it). */
function firstFireball(seed = 1983): { shot: Projectile | undefined; state: GameState } {
  let s = surface(seed)
  let shot: Projectile | undefined
  for (let i = 0; i < 6000 && !shot; i++) {
    const before = s.enemyShots.length
    s = stepGame(s, NO_INPUT, DT)
    if (s.enemyShots.length > before) shot = s.enemyShots[s.enemyShots.length - 1]
  }
  return { shot, state: s }
}

// --- Contract constants exist and are sane (guards vacuous NaN-bound loops) ---

describe('sw2-3 — tower tuning constants', () => {
  it('exposes a positive, finite cube-top elevation and fire-grace window', () => {
    expect(Number.isFinite(TOWER_HEIGHT)).toBe(true)
    expect(TOWER_HEIGHT).toBeGreaterThan(0)
    expect(Number.isFinite(TOWER_FIRE_GRACE)).toBe(true)
    expect(TOWER_FIRE_GRACE).toBeGreaterThan(0)
  })
})

// --- Defect 1: the tower fires from its elevated cube top, not the floor -----

describe('sw2-3 — tall towers fire from their cube top, not the ground', () => {
  it('launches the fireball from the tower cube-top elevation (TOWER_HEIGHT), not y=0', () => {
    // sw7-5 re-seat: the armed pool now includes BUNKERS (D-016), whose muzzle
    // is their low body — sampling "the first shot of a real maze run" can
    // capture a bunker's shot. This pin's intent is the TOWER's muzzle, so the
    // shooter is staged as an explicit tower past its grace (green both before
    // and after the D-016 fix; the bunker muzzle is pinned by
    // surface-hazard.test.ts).
    const s0: GameState = {
      ...surface(),
      turrets: [{ pos: [0, 0, -2000] as Vec3, age: TOWER_FIRE_GRACE + 1, kind: 'tower' }],
      surfaceMazeLaid: true,
      enemyFireCooldown: 0,
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    const shot = s1.enemyShots[s1.enemyShots.length - 1]
    expect(shot).toBeDefined()
    // The bug: a grounded turret fires from the floor (y = 0). A tall tower's gun
    // is the yellow cube on top — the fireball erupts from up at TOWER_HEIGHT.
    expect(shot!.pos[1]).toBeGreaterThan(0)
    expect(shot!.pos[1]).toBeCloseTo(TOWER_HEIGHT, 0)
  })

  it('still looses the fireball back toward the cockpit (aim preserved)', () => {
    const { shot } = firstFireball()
    expect(shot).toBeDefined()
    // Velocity points from the elevated launch point back at the cockpit (origin).
    expect(dot(shot!.vel, sub([0, 0, 0], shot!.pos))).toBeGreaterThan(0)
  })
})

// --- Defect 2: round-1 firing is gated (a risen tower holds fire briefly) -----

describe('sw2-3 — round-1 firing is gated', () => {
  /** Advance a fresh surface run to the exact frame the first tower rises. */
  function untilFirstTower(seed = 1983): GameState {
    let s = surface(seed)
    for (let i = 0; i < 6000 && s.turrets.length === 0; i++) s = stepGame(s, NO_INPUT, DT)
    return s
  }

  it('does not fire on the very frame a tower first appears', () => {
    const s = untilFirstTower()
    expect(s.turrets.length).toBeGreaterThan(0)
    // Today enemyFireCooldown has already lapsed, so the tower fires the instant it
    // exists — the "unclear round-1 firing" the playtest flagged. The gate suppresses
    // that appearance-frame shot.
    expect(s.enemyShots.length).toBe(0)
  })

  it('holds fire through the TOWER_FIRE_GRACE window after a tower rises', () => {
    expect(Number.isFinite(TOWER_FIRE_GRACE)).toBe(true) // guards the NaN-bound loop below
    let s = untilFirstTower()
    expect(s.turrets.length).toBeGreaterThan(0)
    // From the moment the tower rose, no fireball may launch until the grace elapses.
    // (Any tower that spawns during the window is younger, so it is gated too.)
    for (let elapsed = 0; elapsed < TOWER_FIRE_GRACE - DT; elapsed += DT) {
      s = stepGame(s, NO_INPUT, DT)
      expect(s.enemyShots).toHaveLength(0)
    }
  })

  it('opens the gate after the grace — a tower does eventually fire (not muted)', () => {
    const { shot } = firstFireball()
    expect(shot).toBeDefined()
  })
})

// --- Purity + back-compat (SOUL boundary; lang-review #4 safe optional defaults)

describe('sw2-3 — the new fire logic stays pure and back-compatible', () => {
  it('fires identically for a fixed seed (gate + elevation are deterministic)', () => {
    let a = surface(7)
    let b = surface(7)
    for (let i = 0; i < 400; i++) {
      a = stepGame(a, NO_INPUT, DT)
      b = stepGame(b, NO_INPUT, DT)
    }
    expect(a.enemyShots).toEqual(b.enemyShots)
    expect(a).toEqual(b)
  })

  it('steps a bare {pos} turret (the existing fixture shape) safely, without new required fields', () => {
    // Guards lang-review #4: whatever per-tower fire-grace state GREEN adds must be
    // OPTIONAL (nullish-defaulted), so the hand-placed `{ pos }` turrets used across
    // the surface suite keep working. A bare turret must still scroll deterministically.
    const seed = 11
    const mk = (): GameState => ({ ...surface(seed), turrets: [{ pos: [0, 0, -300] as Vec3 }] })
    const a = stepGame(mk(), NO_INPUT, 0.05)
    const b = stepGame(mk(), NO_INPUT, 0.05)
    expect(a.turrets).toHaveLength(1)
    expect(a.turrets[0].pos[2]).toBeGreaterThan(-300) // scrolled toward the cockpit
    expect(a).toEqual(b) // deterministic on the bare fixture shape
  })
})
