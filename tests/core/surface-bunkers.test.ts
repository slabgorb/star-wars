// tests/core/surface-bunkers.test.ts
//
// Story sw3-11 — RED phase (O'Brien / TEA): red ground bunkers join the surface.
//
// GROUND TRUTH (WSGRND.MAC, historicalsource/star-wars @ 5355b76): the tower
// mazes mix TOWER/BISHOP/BUNKER entries in ONE ground-object table, discriminated
// by a picture-type byte (TGD$PC: PC$TWR / PC$BSH / PC$BNK) — wave 2 is even an
// all-bunker maze ("TBUNK: 0 TOWERS ... BUNKER WAVE"). Critically, the BUNKER
// macro does NOT increment `.TWRS` (the per-maze tower count that seeds GD.TWL,
// "# OF TOWERS LEFT"): bunkers are shootable scenery-guns that NEVER count toward
// the tower quota — they have their own score routine (SCRBNK), separate from the
// progressive tower score (SCRTWR).
//
// The clone mirrors the ROM's one-list-plus-type-byte design: surface ground
// objects stay in `state.turrets`, and entries gain an optional discriminator
// `kind?: 'tower' | 'bunker'` — ABSENT means tower, preserving the sw2-3
// back-compat contract that a bare `{ pos }` fixture steps safely.
//
// Pinned here (the sw3-3 quota fidelity depends on it):
//   1. the surface phase actually spawns bunkers (deterministically, from the
//      state RNG) alongside towers;
//   2. destroying a bunker does NOT advance `phaseKills` — the ROM tower quota
//      counts towers only (a bunker kill today would corrupt the byte_98CB
//      count and the 50,000 cleared-all bonus);
//   3. a bunker IS still destroyable (ROM bunkers are shootable — SCRBNK);
//   4. kindless entries keep counting (back-compat: absent kind == tower).
//
// NOT pinned (logged as Delivery Findings, not fabricated spec): the bunker
// score value (SCRBNK's amount is unrecovered), whether bunkers fire, and the
// ROM's per-wave tower/bunker maze mixes (TBUNK etc. are a future maze story).

import { describe, it, expect } from 'vitest'
import {
  initialState,
  towersForWave,
  type GameState,
  type Turret,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const DT = 0.02

/** A fresh surface run (mirrors tests/core/surface-towers.test.ts). */
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })

const kindOf = (t: Turret): string | undefined => (t as { kind?: string }).kind

/** A ground object fixture with an explicit kind. `as Turret` keeps this file
 *  compiling against today's kindless Turret — the pin is behavioral. */
const groundObject = (pos: Vec3, kind: 'tower' | 'bunker'): Turret =>
  ({ pos, kind } as Turret)

/** A player bolt parked on the target — sim destroys ground objects on contact. */
const boltOn = (pos: Vec3) => ({ pos: [...pos] as Vec3, vel: [0, 0, 0] as Vec3, ttl: 1 })

describe('sw3-11 — the surface spawns red ground bunkers among the towers', () => {
  it('a deterministic surface run raises BOTH kinds: towers and bunkers', () => {
    // WSGRND's mazes mix the two picture types in one table. Run the surface
    // long enough for many spawns; both kinds must appear. RED: no spawn ever
    // carries kind 'bunker' today.
    let s = surface(1983)
    let sawBunker = false
    let sawTower = false
    for (let i = 0; i < 9000 && !(sawBunker && sawTower); i++) {
      s = stepGame(s, NO_INPUT, DT)
      for (const t of s.turrets) {
        const k = kindOf(t)
        if (k === 'bunker') sawBunker = true
        else sawTower = true // absent kind == tower (back-compat)
      }
    }
    expect(sawTower).toBe(true)
    expect(sawBunker).toBe(true)
  })

  it('spawning is deterministic: same seed, same kinds sequence', () => {
    // The kind decision must come from the state RNG, not Math.random.
    const run = (seed: number): string => {
      let s = surface(seed)
      const kinds: string[] = []
      const seen = new Set<Turret>()
      for (let i = 0; i < 3000; i++) {
        s = stepGame(s, NO_INPUT, DT)
        for (const t of s.turrets) {
          if (!seen.has(t)) {
            seen.add(t)
            kinds.push(kindOf(t) ?? 'tower')
          }
        }
      }
      return kinds.join(',')
    }
    expect(run(7)).toBe(run(7))
  })
})

describe('sw3-11 — bunkers are quota-NEUTRAL (the ROM .TWRS count is towers only)', () => {
  const SITE: Vec3 = [0, 0, -800]

  it('destroying a bunker does not advance phaseKills', () => {
    // RED: today every turret-list kill bumps phaseKills, so a bunker kill
    // would eat into the 22-tower byte_98CB quota — an infidelity the ROM's
    // BUNKER macro (no .TWRS increment) rules out.
    const s0: GameState = {
      ...surface(),
      turrets: [groundObject(SITE, 'bunker')],
      projectiles: [boltOn(SITE)],
      enemyShots: [],
      phaseKills: 5,
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.turrets).toHaveLength(0) // the bunker IS destroyed (shootable)…
    expect(s1.phaseKills).toBe(5) // …but the tower quota is untouched
  })

  it('destroying a tower still advances phaseKills (explicit kind)', () => {
    const s0: GameState = {
      ...surface(),
      turrets: [groundObject(SITE, 'tower')],
      projectiles: [boltOn(SITE)],
      enemyShots: [],
      phaseKills: 5,
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.turrets).toHaveLength(0)
    expect(s1.phaseKills).toBe(6)
  })

  it('destroying a kindless (legacy) entry still advances phaseKills (absent == tower)', () => {
    // Guards the sw2-3 back-compat contract while kind is introduced.
    const s0: GameState = {
      ...surface(),
      turrets: [{ pos: SITE }],
      projectiles: [boltOn(SITE)],
      enemyShots: [],
      phaseKills: 0,
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.turrets).toHaveLength(0)
    expect(s1.phaseKills).toBe(1)
  })

  it('a bunker kill alone can never clear the surface phase', () => {
    // One tower short of the wave-1 quota, the player kills a BUNKER: the phase
    // must hold. (The equivalent TOWER kill crossing to trench is pinned by
    // sw3-3's quota suite.)
    const s0: GameState = {
      ...surface(),
      wave: 1,
      phaseKills: towersForWave(1) - 1,
      turrets: [groundObject(SITE, 'bunker')],
      projectiles: [boltOn(SITE)],
      enemyShots: [],
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.phase).toBe('surface')
  })
})
