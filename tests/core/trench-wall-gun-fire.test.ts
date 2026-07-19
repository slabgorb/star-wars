// tests/core/trench-wall-gun-fire.test.ts
//
// Story sw7-20 — RED phase (Han Solo / TEA): the trench wall GUNS fire back at
// the player (finding B-017, the behaviour half; the model half — the WGA vertex
// table — is trench-wall-gun-rom.test.ts).
//
// -- WHAT THE ROM ACTUALLY DOES (WSBASE.MAC:1200-1330, .RADIX 16) -------------
//
//   DOBASE::                         ; called each trench game-frame
//     LDA PT.LIV / IFEQ              ; (no proton launched yet ⇒ allow shots)
//     LDB WV.HRD / CMPB #7. / IFHI / LDB #7.   ; difficulty index, clamped 0..7
//     LSLB / LDU #TGPROB / LEAU B(U)           ; 2-byte TGPROB entry for this diff
//     LDA FRAME+1 / ANDA 0(U) / IFEQ           ; ← TIMER MASK: an opening this frame?
//       LDA 1(U) / STA BS.PRB                  ;   the fire-probability threshold
//       JSR BSGUN                              ;   scan the gun panels and fire
//
//   TGPROB:            ; GUN SHOOTING PROB, TIMER MASK (0F = 1 SEC); PROB (0C0 = 25%)
//     .BYTE 0F,80  0F,60  0F,40  0F,20   07,60  07,20   03,60  03,20   ; diff 0..7
//
//   BSGUN: … for each wall panel flagged a gun bunker (panel byte & 0C0 == 0C0),
//     the player above it and CLOSE BY:  LDA P.RND1 / CMPA BS.PRB / IFHS ⇒
//       JSR FRPLGN / FRPRGN            ; FIRE LEFT / RIGHT PANEL GUN at the player
//
// So the trench return fire is: on a per-difficulty TIMER-MASK opening, roll each
// in-range wall gun against a per-difficulty PROBABILITY and, if it passes, fire a
// shot AT THE PLAYER. Fire chance rises with difficulty on BOTH axes — the mask
// tightens (0F→07→03, more frequent openings) and the threshold drops (80→20,
// P(fire)=(256−thr)/256 rises 50%→87.5%). This is the trench's OWN TGPROB
// (WSBASE.MAC:1224), distinct from the space TIE-fire table (WSCPU.MAC).
//
// -- OURS TODAY: the trench carries no fire ----------------------------------
//
// `stepTrench` (sim.ts) never touches `enemyShots`; sim.ts:258 states it outright:
// "fire still flies straight … the trench carries no fire." The turrets already in
// the channel (`kind:'turret'`, the WGA wall guns) are shoot-for-SCORE targets
// only — the entire return-fire subsystem is absent. Every core assertion below is
// therefore RED until B-017 lands.
//
// -- REPRESENTATION CONTRACT (defined here; Dev's implementation meets it) ----
//
// A wall gun is the live trench turret (`kind:'turret'`) — the same entity M-011
// re-skins as `.WP WGA`. On a difficulty-gated opening an in-range gun fires an
// `enemyShots` Projectile AIMED AT THE SHIP POINT (`trenchView`, per sw7-16 — the
// flying ship, NOT a detached floor origin, exactly the surface-fire lesson at
// sim.ts:807-810) and emits an `enemy-fire` event (the established vocabulary of
// the space and surface fire paths). A shot that reaches the cockpit costs a
// shield (a real hit — UNLIKE the force-field GRAZE of sw7-19, which costs none)
// and fires `player-death`. The EXACT TGPROB literals, the in-range window, and
// the cadence source are Dev's to derive from WSBASE.MAC — this suite pins the
// OBSERVABLE (guns fire, harder = more fire, a hit costs a shield, fire tracks the
// ship), not those literals.

import { describe, it, expect } from 'vitest'
import { initialState, type GameState, type TrenchObstacle } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { TRENCH_EYE_SEAT } from '../../src/core/trench-channel'
import type { Vec3 } from '@arcade/shared/math3d'

const SEAT = TRENCH_EYE_SEAT // 768 — the pilot's seat height, a full 768 above the floor
const DT = 1 / 60
const SEEDS = [1, 3, 5, 7, 9, 11, 13, 17] // fixed ⇒ deterministic aggregates, no flake

/** An isolated trench holding ONLY the given wall guns (and no exhaust port), at a
 *  chosen difficulty `wave` and pilot viewpoint. No port ⇒ a gun shot is the only
 *  thing that can touch a shield, so the count is clean. */
function trench(guns: TrenchObstacle[], view: Vec3, opts: { wave: number; seed: number }): GameState {
  return {
    ...enterPhase(initialState(opts.seed), 'trench'),
    mode: 'playing',
    wave: opts.wave,
    exhaustPort: null,
    projectiles: [],
    trenchObstacles: guns.map((o) => ({ kind: o.kind, pos: [...o.pos] as Vec3 })),
    trenchView: [...view] as Vec3,
  }
}

/** A wall gun (turret) mounted at wall-x `x`, seat height, depth `z`. */
const gun = (x: number, z: number): TrenchObstacle => ({ kind: 'turret', pos: [x, SEAT, z] })

/** A staggered line of wall guns marching up the channel on alternating walls, so
 *  that across a fly-through there is always a gun scrolling through the near zone
 *  where it can fire — many firing openings, not one lucky frame. */
const gunLine = (): TrenchObstacle[] =>
  Array.from({ length: 12 }, (_, i) => gun(i % 2 === 0 ? -300 : 300, -400 - i * 2000))

/** Drive a hands-off pilot (NO_INPUT holds trenchView fixed) through the channel,
 *  reporting how many shots the guns fired, how many reached the cockpit, and the
 *  net shields spent. */
function flyGuns(s0: GameState, frames = 160): { fires: number; deaths: number; shieldsLost: number } {
  let s = s0
  const lives0 = s.lives
  let fires = 0
  let deaths = 0
  for (let i = 0; i < frames && s.mode === 'playing'; i++) {
    s = stepGame(s, NO_INPUT, DT)
    fires += s.events.filter((e) => e.type === 'enemy-fire').length
    deaths += s.events.filter((e) => e.type === 'player-death').length
  }
  return { fires, deaths, shieldsLost: lives0 - s.lives }
}

describe('sw7-20 / B-017 — the trench wall guns fire back at the player', () => {
  it('an armed channel fires; an empty channel never does (inverts "the trench carries no fire")', () => {
    // Both halves in one test so neither passes alone: fire must be CAUSED by the
    // guns, not spontaneous. RED today — stepTrench never populates enemyShots, so
    // even the armed channel fires nothing.
    const armed = flyGuns(trench(gunLine(), [0, SEAT, 0], { wave: 8, seed: 7 }))
    const empty = flyGuns(trench([], [0, SEAT, 0], { wave: 8, seed: 7 }))
    expect(armed.fires, 'wall guns fire at the player').toBeGreaterThan(0)
    expect(empty.fires, 'an empty channel carries no fire').toBe(0)
  })

  it('fire scales with difficulty — WV.HRD/TGPROB: a hard wave fires more than an easy one', () => {
    // TGPROB ramps fire on both axes (mask 0F→03, threshold 80→20). Aggregated over
    // fixed seeds so it is a deterministic, non-flaky comparison. RED today: both
    // are 0, so `hard > easy` fails. A faithful ramp makes the hard wave fire
    // strictly more; an implementation that ignores difficulty makes them equal —
    // which this test rejects.
    let easy = 0
    let hard = 0
    for (const seed of SEEDS) {
      easy += flyGuns(trench(gunLine(), [0, SEAT, 0], { wave: 1, seed })).fires // TGPROB diff 0
      hard += flyGuns(trench(gunLine(), [0, SEAT, 0], { wave: 8, seed })).fires // TGPROB diff 7
    }
    expect(hard, 'the hardest wave fires at all').toBeGreaterThan(0)
    expect(hard, 'a hard wave fires more often than an easy one').toBeGreaterThan(easy)
  })

  it('a wall-gun shot reaches the cockpit and costs a shield — a HIT, not a graze', () => {
    // The headline of "fire BACK at the player". A gun shot that reaches the ship
    // costs a shield and fires player-death — UNLIKE the sw7-19 force-field graze,
    // which sounds a crash and costs nothing. Aggregated over seeds so no single
    // RNG stream decides it. RED today: no fire ⇒ no hit ⇒ no shield spent.
    let deaths = 0
    let shields = 0
    for (const seed of SEEDS) {
      const r = flyGuns(trench(gunLine(), [-300, SEAT, 0], { wave: 8, seed }))
      deaths += r.deaths
      shields += r.shieldsLost
    }
    expect(deaths, 'a gun shot reaches the cockpit (player-death)').toBeGreaterThan(0)
    expect(shields, 'and costs a shield, unlike the force-field graze (which costs none)').toBeGreaterThan(0)
  })

  it('fire tracks the SHIP point, not a detached origin (sw7-16): a centred and an off-centre pilot are both hit', () => {
    // sw7-16 unified fire onto the ship point. Both pilots are SEATED (y=768, a full
    // 768 above the floor): a shot laid on a detached floor origin (y=0) passes far
    // under either, and a shot laid on a fixed centreline (x=0) misses the off-centre
    // pilot — so only fire aimed at the actual `trenchView` (x AND y) hits both.
    // RED today for both; and this is the one test a floor-/centre-aimed regression
    // cannot pass.
    let centred = 0
    let offset = 0
    for (const seed of SEEDS) {
      centred += flyGuns(trench(gunLine(), [0, SEAT, 0], { wave: 8, seed })).shieldsLost
      offset += flyGuns(trench(gunLine(), [-300, SEAT, 0], { wave: 8, seed })).shieldsLost
    }
    expect(centred, 'a centred pilot is hit').toBeGreaterThan(0)
    expect(offset, 'an off-centre pilot is ALSO hit — fire tracks the ship point (sw7-16)').toBeGreaterThan(0)
  })

  it('is a pure function of the seed: identical seed + input ⇒ identical fire, and the input RNG is not mutated', () => {
    // A probabilistic subsystem must still replay identically from a seed (the core
    // purity rule). Two independent runs from the same seed agree exactly, and
    // stepGame must not mutate the caller's rng. The purity half holds today; the
    // fire-equality half becomes meaningful once guns fire — both must hold after.
    const s0 = trench(gunLine(), [-300, SEAT, 0], { wave: 8, seed: 5 })
    const seedBefore = s0.rng.seed
    const a = flyGuns(s0)
    const b = flyGuns(trench(gunLine(), [-300, SEAT, 0], { wave: 8, seed: 5 }))
    expect(s0.rng.seed, 'stepGame did not mutate the input state rng').toBe(seedBefore)
    expect(a).toEqual(b)
  })
})
