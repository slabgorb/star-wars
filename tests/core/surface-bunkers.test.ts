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
//
// == sw7-17 FIXTURE MIGRATION (the quota pins below, not their subject) =======
//
// The quota half of this file used to say "the player destroyed this thing" by parking a bolt on
// top of it (`projectiles: [boltOn(SITE)]`) and stepping with the trigger up. sw7-17 made the
// player's laser HITSCAN: the gun spawns nothing, so that fixture is now unbuildable in play and
// a state carrying it proves nothing about firing. The honest replacement is the sentence the
// bolt was standing in for — AIM AT IT AND PULL THE TRIGGER (`fireAt`) — which is strictly
// stronger, since it runs through the real aim, the real ship point and the real resolve.
//
// Two consequences worth stating, because they shape every fixture below:
//
//   * ONE BEAM KILLS ONE OBJECT PER FRAME (ROM CLGLZ keeps a single winner in CL.GDS), and the
//     trigger is edge-triggered semi-auto. Every pin here needs exactly one kill on one frame,
//     so none of them has to re-fire — but a state must carry `firePrev: false` / `fireCooldown:
//     0` for the pull to land at all, and `surface()` inherits both from `initialState`.
//   * THE KILL IS ASSERTED ON THE 'enemy-death' EVENT, not on `turrets` emptying. A ground object
//     also leaves that list by simply scrolling past the cockpit, so an empty list is a false
//     positive waiting for a fixture to drift; the event fires only on a real kill.
//
// The quota contract itself — bunkers are quota-neutral, towers and kindless legacy entries are
// not — is untouched.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  towersForWave,
  SKIM_ALTITUDE,
  type GameState,
  type Turret,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { fireAt } from '../support/aim'
import type { Vec3 } from '@arcade/shared/math3d'

const DT = 0.02

/** A fresh surface run (mirrors tests/core/surface-towers.test.ts). */
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })

const kindOf = (t: Turret): string | undefined => (t as { kind?: string }).kind

/** A ground object fixture with an explicit kind. `as Turret` keeps this file
 *  compiling against today's kindless Turret — the pin is behavioral. */
const groundObject = (pos: Vec3, kind: 'tower' | 'bunker'): Turret =>
  ({ pos, kind } as Turret)

/** Did the player's beam actually destroy a ground object this frame? (sw7-17.)
 *
 *  Deliberately NOT `turrets.length === 0`: the surface scroll drops every object off that list
 *  the moment it sweeps past the cockpit plane, so "the list is empty" is true of a MISS that was
 *  simply waited out. The 'enemy-death' event is emitted by the kill and by nothing else. */
const killedAGroundObject = (s: GameState): boolean =>
  s.events.some((e) => e.type === 'enemy-death' && e.enemyType === 'turret')

describe('sw3-11 — the surface spawns red ground bunkers among the towers', () => {
  it('a deterministic surface run raises BOTH kinds: towers and bunkers', () => {
    // WSGRND's mazes mix the two picture types in one table. WAVE 3 (SQUARE) is a
    // MIXED maze — 16 towers + 12 bunkers — so both kinds appear (wave 1 has no
    // ground phase and wave 2's BUNK is bunkers-only; D-015). RED: no object ever
    // carries kind 'bunker' today.
    let s: GameState = { ...surface(1983), wave: 3 }
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
  /**
   * The probe, seated at the PILOT'S OWN CRUISE HEIGHT rather than on the floor (sw7-17).
   *
   * That is not cosmetic. On the surface the yoke's vertical axis is ALSO the throttle
   * (`altitude += aimY · ALTITUDE_RATE · dt`), so aiming down at a floor-level object FLIES THE
   * SHIP while the shot is being measured. Level with the eye, dead-on is a purely lateral shot,
   * `aimY` stays 0, and the fixture's only moving part is the gun — which is what these pins are
   * about. Height is otherwise inert here: the quota reads `kind`, never `pos[1]`.
   */
  const SITE: Vec3 = [0, SKIM_ALTITUDE, -800]

  it('destroying a bunker does not advance phaseKills', () => {
    // RED: today every turret-list kill bumps phaseKills, so a bunker kill
    // would eat into the 22-tower byte_98CB quota — an infidelity the ROM's
    // BUNKER macro (no .TWRS increment) rules out.
    const s0: GameState = {
      ...surface(),
      turrets: [groundObject(SITE, 'bunker')],
      enemyShots: [],
      phaseKills: 5,
      fireCooldown: 0,
      firePrev: false, // the trigger is edge-triggered: a pull only lands off a released trigger
    }
    const s1 = stepGame(s0, fireAt(s0, SITE), DT)
    expect(killedAGroundObject(s1)).toBe(true) // the bunker IS destroyed (shootable)…
    expect(s1.phaseKills).toBe(5) // …but the tower quota is untouched
  })

  it('destroying a tower still advances phaseKills (explicit kind)', () => {
    const s0: GameState = {
      ...surface(),
      turrets: [groundObject(SITE, 'tower')],
      enemyShots: [],
      phaseKills: 5,
      fireCooldown: 0,
      firePrev: false,
    }
    const s1 = stepGame(s0, fireAt(s0, SITE), DT)
    expect(killedAGroundObject(s1)).toBe(true)
    expect(s1.phaseKills).toBe(6)
  })

  it('destroying a kindless (legacy) entry still advances phaseKills (absent == tower)', () => {
    // Guards the sw2-3 back-compat contract while kind is introduced.
    const s0: GameState = {
      ...surface(),
      turrets: [{ pos: SITE }],
      enemyShots: [],
      phaseKills: 0,
      fireCooldown: 0,
      firePrev: false,
    }
    const s1 = stepGame(s0, fireAt(s0, SITE), DT)
    expect(killedAGroundObject(s1)).toBe(true)
    expect(s1.phaseKills).toBe(1)
  })

  it('a bunker kill does not count toward the tower quota (banks no clear bonus)', () => {
    // One tower short of the wave-3 quota, the player kills a BUNKER: the bunker is
    // quota-neutral, so the all-towers bonus does NOT bank and the phase holds. (Under
    // sw7-18 / D-019 the phase never clears by kills anyway; the claim here is the
    // NEUTRALITY — a bunker kill neither advances the count nor banks the 50k.)
    //
    // The kill is asserted, not assumed. Under the old bolt fixture this test would have gone on
    // passing had the shot stopped landing altogether — "the phase held" is trivially true of a
    // frame in which nothing happened. The event pins that a bunker really did die and the phase
    // held ANYWAY, which is the whole claim.
    const s0: GameState = {
      ...surface(),
      wave: 3, // SQUARE — a real ground wave WITH towers (wave 1 has none, D-015)
      phaseKills: towersForWave(3) - 1,
      turrets: [groundObject(SITE, 'bunker')],
      surfaceMazeLaid: true, // hand-placed field — don't lay the wave maze over it
      enemyShots: [],
      fireCooldown: 0,
      firePrev: false,
    }
    const s1 = stepGame(s0, fireAt(s0, SITE), DT)
    expect(killedAGroundObject(s1), 'the bunker really did die this frame').toBe(true)
    expect(s1.phase).toBe('surface')
  })
})
