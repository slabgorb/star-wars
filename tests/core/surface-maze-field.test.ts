// tests/core/surface-maze-field.test.ts
//
// Story sw4-3 — Surface maze port (spec §C), sim integration. RED phase (TEA).
//
// The surface phase stops spawning random turrets and instead lays the wave's
// authored WSGRND.MAC maze as a FIXED field that translates toward the cockpit
// with the existing surface scroll (spec §C: "the maze is a fixed field ...
// entities are not spawned one-by-one"). Two consequences this suite pins:
//
//   1. Placement is AUTHORED, not random: the surface layout is a pure function
//      of the wave — same wave + different RNG seed ⇒ identical turret field.
//      Turrets appear only at the maze's authored lateral coordinates, never at
//      the old random ±SPAWN_SPREAD positions.
//   2. RECONCILE (spec §C flag; ratified in-story): the towers-to-clear quota is
//      the placed maze's own tower count (TTWRS), NOT sw3-3's byte_98CB stream
//      quota. A single-pass finite maze of N towers is cleared by killing its N
//      towers — a larger byte_98CB target (22–50) would soft-lock. Original
//      source (WSGRND TTWRS) outranks the disasm (byte_98CB) per star-wars
//      CLAUDE.md; see the session file's Design Deviations for the decision.
//
// Scroll SPEED is a PROVISIONAL feel item (spec §D) tuned in playtest, so it is
// deliberately NOT asserted here — every pin below is scroll-rate-agnostic.
//
// Sacred boundary: pure core, no DOM, no time except `dt`, no RNG except state's.

import { describe, it, expect } from 'vitest'
import { mazeForWave } from '../../src/core/surfaceMazes'
import { initialState, towersForWave, type GameState, type Turret } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const DT = 0.05

/** Drive a fresh run through space→surface at a chosen wave, so the surface
 *  maze is laid by the real phase transition (whatever mechanism GREEN builds).
 *  phaseKills is forced well past the space quota to trigger the crossing. */
function enterSurface(seed: number, wave: number): GameState {
  let s: GameState = {
    ...initialState(seed),
    wave,
    phase: 'space',
    phaseKills: 9999, // ≥ the space-wave quota — forces the space→surface cross
    enemies: [],
    enemyShots: [],
  }
  for (let i = 0; i < 200 && s.phase !== 'surface'; i++) s = stepGame(s, NO_INPUT, DT)
  return s
}

/** Collect the set of distinct turret lateral (X) coordinates seen across a
 *  surface run of `frames` steps. */
function turretXsOverRun(seed: number, wave: number, frames: number): Set<number> {
  let s = enterSurface(seed, wave)
  const xs = new Set<number>()
  for (let i = 0; i < frames; i++) {
    for (const t of s.turrets) xs.add(t.pos[0])
    s = stepGame(s, NO_INPUT, DT)
  }
  return xs
}

// --- mazeForWave: a total, pure wave→maze map --------------------------------

describe('sw4-3 — mazeForWave maps every wave to an authored maze', () => {
  it('returns a registered maze for every playable wave (no undefined, no throw)', () => {
    for (let wave = 1; wave <= 40; wave++) {
      const m = mazeForWave(wave)
      expect(m, `wave ${wave}`).toBeDefined()
      expect(m.entries.length).toBeGreaterThan(0)
    }
  })

  it('is a pure function of the wave — same wave, same maze (no RNG, no time)', () => {
    expect(mazeForWave(7)).toBe(mazeForWave(7))
    expect(mazeForWave(12)).toBe(mazeForWave(12))
  })
})

// --- RECONCILE + wave→maze map: pinned to CONCRETE ROM values -----------------

describe('sw4-3 — the wave→maze map and tower counts are the ROM values', () => {
  // Independently-known WSGRND values (TGDPTR order + TTWRS), NOT
  // `towersForWave(w) === mazeForWave(w).towerCount` — that is a tautology
  // (towersForWave IS that expression), so it can't catch a wrong mapping.
  const WAVE_MAZE: ReadonlyArray<readonly [wave: number, name: string, towers: number]> = [
    [1, 'SQUARE', 16], // clone intro (ROM has no wave-1 ground)
    [2, 'BUNK', 0], // the bunkers-only wave
    [5, 'TURNON', 20],
    [7, 'DIFF', 20],
    [10, 'VALLEY', 27],
    [16, '3DIFF', 24],
    [20, '3TWRCTY', 32],
  ]
  it.each(WAVE_MAZE)('wave %i → maze %s with %i towers', (wave, name, towers) => {
    expect(mazeForWave(wave).name).toBe(name)
    expect(towersForWave(wave)).toBe(towers)
  })

  it('deep waves (≥21) wrap the last six extended mazes with period 6', () => {
    expect(mazeForWave(21).name).toBe('3WEDGE') // MAP$RPT
    expect(mazeForWave(21).name).toBe(mazeForWave(27).name) // period 6
    expect(mazeForWave(21).name).not.toBe(mazeForWave(22).name) // …not a constant
    // the wrap only ever selects the extended (T3) mazes — never BUNK or a base form
    for (let w = 21; w <= 44; w++) expect(mazeForWave(w).towerCount).toBeGreaterThanOrEqual(24)
  })

  it('clamps wave ≤ 0 and floors a fractional wave to the wave-1 maze', () => {
    expect(mazeForWave(0).name).toBe(mazeForWave(1).name)
    expect(mazeForWave(-5).name).toBe(mazeForWave(1).name)
    expect(mazeForWave(7.9).name).toBe(mazeForWave(7).name)
  })
})

// --- Placement is AUTHORED, not random ---------------------------------------

describe('sw4-3 — the surface field is authored, not randomly spawned', () => {
  it('lays an identical field for the same wave regardless of RNG seed', () => {
    // The old spawnTurret(rng) makes the layout seed-dependent; the authored
    // maze must not. Different seeds, same wave ⇒ byte-identical turret field.
    // Step a few surface frames so the field is scrolled into view (non-vacuous).
    let a = enterSurface(7, 5)
    let b = enterSurface(999, 5)
    let sawField = false
    for (let i = 0; i < 40; i++) {
      if (a.turrets.length > 0) sawField = true
      expect(a.turrets).toEqual(b.turrets) // same layout at every frame, any seed
      a = stepGame(a, NO_INPUT, DT)
      b = stepGame(b, NO_INPUT, DT)
    }
    expect(sawField).toBe(true) // the authored field really is present
  })

  it('places turrets only at the maze’s authored lateral coordinates', () => {
    const wave = 5
    const authoredX = new Set(mazeForWave(wave).entries.map((e) => e.x))
    const seenX = turretXsOverRun(1983, wave, 400)
    expect(seenX.size).toBeGreaterThan(0)
    for (const x of seenX) {
      expect(authoredX.has(x), `turret at x=${x} is not an authored maze position`).toBe(true)
    }
  })

  it('is a finite field, not an endless stream — distinct X stay within the maze', () => {
    // The random spawner emits unboundedly many distinct lateral positions over a
    // long run; the authored maze has a fixed, finite set. Over a long surface
    // run the distinct turret X count must not exceed the maze's entry count.
    const wave = 5
    const seenX = turretXsOverRun(1983, wave, 1200)
    expect(seenX.size).toBeLessThanOrEqual(mazeForWave(wave).entries.length)
  })

  it('lays the FULL authored field on entry — every maze entry, not a subset', () => {
    // Guards the half-field bug the Reviewer flagged: towersForWave reads the
    // maze's OWN full tower count, so a partial placement would silently
    // soft-lock. One surface frame in, the whole field is laid and nothing has
    // yet scrolled past the cull plane (the nearest entry enters at −SPAWN_DISTANCE).
    const wave = 5
    const s = stepGame(enterSurface(1983, wave), NO_INPUT, DT)
    expect(s.turrets).toHaveLength(mazeForWave(wave).entries.length)
  })
})

// --- Bishops ride the tower path (kind union gains 'bishop') ------------------

describe('sw4-3 — bishops ride the existing tower collision/quota path', () => {
  const SITE: Vec3 = [0, 0, -800]
  const bolt = (pos: Vec3) => ({ pos: [...pos] as Vec3, vel: [0, 0, 0] as Vec3, ttl: 1 })

  it('a bishop is shootable and DOES advance the tower quota (BISHOP increments .TWRS)', () => {
    // Requires Turret.kind to admit 'bishop' (new in sw4-3). A bishop, like a
    // tower, counts toward the clear quota — only bunkers are quota-neutral.
    const bishop: Turret = { pos: SITE, kind: 'bishop', age: 0 }
    const s0: GameState = {
      ...initialState(1983),
      phase: 'surface',
      turrets: [bishop],
      projectiles: [bolt(SITE)],
      enemyShots: [],
      phaseKills: 3,
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.turrets).toHaveLength(0) // destroyed via the tower hit-test
    expect(s1.phaseKills).toBe(4) // and counted toward the quota
  })
})
