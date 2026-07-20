// tests/core/shootable-fireballs.test.ts
//
// Wave 1 — shootable enemy fireballs (story 8-18), RED phase.
//
// Today a player bolt sails straight THROUGH an enemy fireball: sim.ts kills
// TIEs with bolts and lets fireballs damage the cockpit, but there is no
// bolt-vs-fireball hit-test. This story closes that gap — a player laser that
// strikes an incoming fireball destroys it BEFORE it reaches the cockpit,
// turning Wave 1 from "dodge the fire" into "intercept the fire."
//
// These tests are EXPECTED TO FAIL until the GREEN phase implements it. They
// drive behaviour through the existing pure surface — `stepGame(state, input,
// dt)` and the `GameState` it returns — so they assert observable gameplay, not
// internal shape, and obey the sacred boundary: no DOM, no time except `dt`, no
// randomness except the seeded RNG carried in state.
//
// Contract this suite asks DEV to implement (in the space phase of sim.ts,
// mirroring the existing bolt-vs-TIE loop and the named-constant convention):
//
//   * A player bolt overlapping an enemy fireball destroys that fireball
//     (removed from state.enemyShots) and is itself consumed (one bolt, one
//     kill — exactly like a TIE kill).
//   * Interception costs NO shield: a fireball shot down away from the cockpit
//     never decrements `lives`.
//   * Destroying a fireball scores `FIREBALL_SCORE` (a NEW named constant in
//     state.ts; its exact value is GREEN's tuning call — the test references it
//     by name, so it stays correct whatever value the disassembly/feel yields,
//     including 0).
//   * A new `ENEMY_SHOT_HIT_RADIUS` named constant (state.ts) sizes the hit
//     sphere, joining TIE_HIT_RADIUS / TURRET_HIT_RADIUS / PORT_HIT_RADIUS.
//   * Destroying a fireball emits a positioned `fireball-destroyed` event
//     (a fresh GameEvent variant) so Wave-5 SFX/particles have a cue — every
//     other destruction in the game already emits a positioned cue.
//
// Constants are referenced by name, never hard-coded, so the suite survives
// whatever authentic-feel numbers GREEN settles on.

// == sw7-17 — MIGRATED OFF THE PROJECTILE MODEL ==============================
//
// Every "a player bolt …" fixture below used to be a hand-placed `Projectile` sitting on top
// of its target, stepped with the trigger UP:
//
//     projectiles: [playerBolt(DOWNRANGE)]   +   stepGame(s0, NO_INPUT, TICK)
//
// The player's gun is HITSCAN now (R11b, audit G-004): a pull resolves the beam instantly
// against the nearest object under the site, and NOTHING the player fires ever exists as an
// object. That fixture cannot occur in play at all, so it is not a valid stand-in for "the
// player shot this" — it is a stand-in for nothing.
//
// The honest replacement is not a different fixture but a different sentence: AIM AT IT AND
// PULL THE TRIGGER — `fireAt(state, target)`, which goes through the real eye, the real aim
// and the real resolve. It is strictly stronger than the bolt it replaces.
//
// ENEMY fire is untouched and stays a real `Projectile`: fireballs genuinely are travelling
// objects in the ROM. That asymmetry is the whole subject of this suite, and it is now
// visible in the fixtures themselves — the player has no bolt, the enemy does.
//
// WHAT CHANGED OBSERVABLY, and where each test says so:
//   * ONE object resolves per frame, across BOTH lists (CLSLZ `min(CL.GDS, CL.ADS)`). Two
//     fireballs no longer need two bolts — they need two FRAMES.
//   * The sweep re-latches the site every frame it is on, so one pull can down two fireballs
//     on consecutive frames by WALKING the crosshair (see 'separate shots …').
//   * A fireball exactly AT the cockpit is at the gun and can no longer be shot at all
//     (`along <= 0`); see 'intercepts a fireball on the cockpit's doorstep'.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  ENEMY_SHOT_TTL,
  ENEMY_SHOT_HIT_RADIUS,
  COCKPIT_HIT_RADIUS,
  FIREBALL_SCORE,
  TIE_SCORE,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { fireAt, release } from '../support/aim'
import type { FireballDestroyedEvent } from '../../src/core/events'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

// A point well downrange of the cockpit: far outside COCKPIT_HIT_RADIUS (80),
// so anything destroyed here is destroyed "before it reaches the cockpit" and
// cannot be confused with a cockpit collision.
const DOWNRANGE: Vec3 = [0, 0, -400]

// Minimal literals; stepGame reads `.pos` for the hit-test (and vel/ttl to age
// the shot). A fireball flies back toward the cockpit (+Z). At the tiny dt these
// tests use, it does not move enough to leave the hit sphere it starts in.
const fireball = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 1], ttl: ENEMY_SHOT_TTL })
// A fully-typed TIE fixture (stepGame reads `.pos` for the hit-test; vel/orient
// keep it a real Enemy, no type-escape cast).
const tie = (pos: Vec3): Enemy => ({ pos, kind: 'tie', orient: IDENTITY })

/**
 * The trigger pulled with the yoke hard over to the left — a shot at empty sky, the beam's
 * equivalent of the old bolt parked at [9999, 0, -400].
 *
 * It is a REACHABLE yoke position (|aimX| = 1 is the stop), which the old fixture's 9,999
 * was not, and the miss is comfortable rather than marginal: the ray leaves the eye at
 * atan(tan(30°)) = 30° off-axis, so against a target dead ahead at 400 it passes 200 units
 * wide at closest approach — well outside ENEMY_SHOT_HIT_RADIUS (150).
 */
const MISS: Input = { aimX: -1, aimY: 0, fire: true, aspect: 1 }

/** A fresh wave: initialState already starts in the 'space' phase, with the trigger up
 *  (`firePrev: false`) and the gun ready (`fireCooldown: 0`), so a `fireAt` lands. */
const wave = (seed = 1983): GameState => initialState(seed)

/** A single step short enough that fireballs stay put for the hit-test. */
const TICK = 0.001

describe('Wave 1 — intercepting a fireball (story 8-18)', () => {
  it('a shot aimed at a fireball destroys it', () => {
    const s0: GameState = { ...wave(), enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    expect(s1.enemyShots).toHaveLength(0)
  })

  it('the gun leaves nothing in flight — there is no bolt to consume', () => {
    // This asserted the same empty list before sw7-17, but for the OPPOSITE reason: the bolt
    // was consumed BY the kill ("one bolt, one kill"). Now `projectiles` is empty because the
    // hitscan gun never put anything there. The economy that "one bolt, one kill" was really
    // protecting — a shot cannot down two things — survives as the one-object-per-frame rule
    // below ('one shot destroys at most one fireball'), which is where it is now guarded.
    const s0: GameState = { ...wave(), enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    expect(s1.enemyShots, 'the fireball really was shot down — not a vacuous pin').toHaveLength(0)
    expect(s1.projectiles, 'the player gun spawns nothing that flies').toHaveLength(0)
  })

  it('intercepting a fireball downrange costs no shield', () => {
    // The whole point of the story: kill it before it lands, take no damage.
    //
    // NOTE this was passing VACUOUSLY between the hitscan change and this migration — the
    // hand-placed bolt stopped intercepting anything, so "no shield lost" was just "a fireball
    // sat quietly downrange". The kill assertion below is what makes it bite again.
    const s0: GameState = { ...wave(), enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    expect(s1.enemyShots, 'it really was intercepted').toHaveLength(0)
    expect(s1.lives).toBe(STARTING_LIVES)
  })

  it('destroying a fireball scores FIREBALL_SCORE points', () => {
    // Value is GREEN's tuning call; the test pins the wiring via the constant.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    expect(s1.score).toBe(base.score + FIREBALL_SCORE)
  })

  it('emits a positioned fireball-destroyed cue for the kill', () => {
    const s0: GameState = { ...wave(), enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    const cue = s1.events.find((e): e is FireballDestroyedEvent => e.type === 'fireball-destroyed')
    expect(cue).toBeDefined()
    // Carries the fireball's OWN world-space position — downrange near its launch
    // (~-400, less one homing tick's inward decay; sw4-2 fireballs decay toward the
    // cockpit each step), not the cockpit origin — for Wave-5 particle/SFX placement.
    expect(cue?.pos[2]).toBeLessThan(-350)
    expect(cue?.pos[2]).toBeGreaterThan(-401)
  })

  it('exposes a positive named hit radius for fireballs', () => {
    // Joins TIE_HIT_RADIUS / TURRET_HIT_RADIUS / PORT_HIT_RADIUS — one named
    // place for the magic number, not a literal buried in the step.
    expect(ENEMY_SHOT_HIT_RADIUS).toBeGreaterThan(0)
  })

  it('awards a positive score for a fireball kill', () => {
    // Pairs with the named-radius guard above: keeps the scoring tests
    // meaningful rather than passing vacuously if FIREBALL_SCORE were 0.
    expect(FIREBALL_SCORE).toBeGreaterThan(0)
  })

  it("intercepts a fireball on the cockpit's doorstep without losing a shield", () => {
    // The standingShots-before-cockpit ordering: a fireball that is ALREADY inside the
    // cockpit's hit sphere on the step it is shot down. The beam wins, no shield is lost. A
    // regression that fed the raw enemyShots to the cockpit-damage pass would fail here (the
    // fireball would be both shot down AND cost a shield).
    //
    // sw7-17 MOVED THE FIREBALL, and had to: it used to sit exactly ON the cockpit at
    // [0,0,0], which is now the gun muzzle itself. `beamHit` rejects `along <= 0` — a target
    // at or behind the eye is never "under the site" — so a fireball in the pilot's lap can no
    // longer be shot at all, and that fixture would have made this test vacuous. DOORSTEP is
    // 60 units out: still inside COCKPIT_HIT_RADIUS (80), so it lands this frame if it is not
    // stopped, but in front of the gun, so the shot is real. The ordering under test is
    // untouched — only the geometry moved, and it moved to somewhere the pilot can shoot.
    const DOORSTEP: Vec3 = [0, 0, -60]
    expect(Math.abs(DOORSTEP[2]), 'fixture: inside the cockpit sphere — it lands if not stopped').toBeLessThan(
      COCKPIT_HIT_RADIUS,
    )

    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOORSTEP)] }

    // The control that makes the assertion mean something: UNSHOT, this same fireball costs a
    // shield on this same frame. Without it, "no shield lost" could pass on a fireball that
    // was never a threat.
    const unshot = stepGame(s0, NO_INPUT, TICK)
    expect(unshot.lives, 'fixture: it really would have landed').toBe(STARTING_LIVES - 1)

    const s1 = stepGame(s0, fireAt(s0, DOORSTEP), TICK)
    expect(s1.enemyShots).toHaveLength(0)
    expect(s1.lives).toBe(STARTING_LIVES)
    expect(s1.score).toBe(base.score + FIREBALL_SCORE)
  })

  it('does not advance the space-phase kill quota when a fireball is shot', () => {
    // Only TIE kills feed phaseKills; intercepting a fireball must not advance
    // the wave toward its clear quota.
    const s0: GameState = { ...wave(), enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    expect(s1.enemyShots, 'a fireball really was shot — not a vacuous pin').toHaveLength(0)
    expect(s1.phaseKills).toBe(s0.phaseKills)
  })
})

describe('Wave 1 — fireballs that are not hit (story 8-18)', () => {
  it('a shot that misses leaves the fireball in flight', () => {
    const s0: GameState = { ...wave(), enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, MISS, TICK)
    expect(s1.enemyShots).toHaveLength(1)
  })

  it('a missed shot scores nothing and still leaves nothing in flight', () => {
    // The "NOT consumed" half of this became unaskable: there is no bolt to keep or spend, so
    // `projectiles` is empty on a miss for the same reason it is empty on a hit. What still
    // discriminates — and is the half that ever mattered — is that a miss must not score and
    // must not emit a kill cue. The beam is not an auto-aim.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, MISS, TICK)
    expect(s1.enemyShots, 'the fireball is untouched').toHaveLength(1)
    expect(s1.projectiles).toHaveLength(0)
    expect(s1.score).toBe(base.score)
    expect(s1.events.some((e) => e.type === 'fireball-destroyed')).toBe(false)
  })

  it('a fireball nobody shoots at is left untouched', () => {
    // Guards against the hit-test firing on its own — a fireball alone in flight survives and
    // costs nothing while it is still downrange. Sharper under hitscan than under the bolt: the
    // trigger is genuinely up here (NO_INPUT), so the laser is OFF, and CLSLZ must not resolve
    // at all. A resolver that ran every frame regardless of the trigger would turn the
    // crosshair into a death ray and would be caught right here.
    const s0: GameState = { ...wave(), enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(1)
    expect(s1.lives).toBe(STARTING_LIVES)
  })
})

describe('Wave 1 — multiple shots and fireballs (story 8-18)', () => {
  it('one shot destroys at most one fireball', () => {
    // Two fireballs share a spot; a single frame's beam takes ONE and the other survives.
    //
    // This is the surviving form of "one bolt, one kill" — and under hitscan it is not an
    // economy of ammunition but the ROM's own rule: CLSLZ ranks every candidate and keeps a
    // single winner (`min(CL.GDS, CL.ADS)`; CL.GDS holds ONE distance), so exactly one object
    // resolves per frame. A resolver that looped and killed everything under the ray would
    // fail here, which is the regression this test now exists to catch.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE), fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    expect(s1.enemyShots).toHaveLength(1)
    expect(s1.projectiles).toHaveLength(0)
    expect(s1.score, 'exactly one fireball scored').toBe(base.score + FIREBALL_SCORE)
  })

  it('separate shots destroy separate fireballs — one pull, two frames', () => {
    // OBSERVABLY DIFFERENT UNDER HITSCAN, and this test is where the difference lives.
    //
    // Two bolts used to down two fireballs in ONE frame. One beam downs one object per frame,
    // so this now takes two frames — but NOT two pulls: the sweep re-latches the site every
    // frame it is on ("CLR LZ.HIT ;… ALLOW SWEEPING LAZARS"), so the pilot fires once and WALKS
    // THE CROSSHAIR from one fireball to the next. The trigger is never touched again — frame 2
    // uses `release()`, same aim, trigger up — so the second kill can only be the still-open
    // sweep resolving against the site it re-latched. Two frames at TICK is 0.002 s, far inside
    // the 0.39 s window.
    //
    // Seated at ±200 across a depth of 400: both are reachable yoke positions (|aimX| = 0.87 at
    // the 30° half-FOV) and 400 apart, so neither is ever under the ray aimed at the other.
    const base = wave()
    const a: Vec3 = [-200, 0, -400]
    const b: Vec3 = [200, 0, -400]
    const s0: GameState = { ...base, enemyShots: [fireball(a), fireball(b)] }

    const shot = fireAt(s0, a)
    let s = stepGame(s0, shot, TICK)
    expect(s.enemyShots, 'the pull took the one it was aimed at, and only it').toHaveLength(1)

    // Aim at where `b` actually IS now — it has been homing at the cockpit since the pull.
    s = stepGame(s, release(fireAt(s, s.enemyShots[0].pos)), TICK)

    expect(s.enemyShots).toHaveLength(0)
    expect(s.projectiles).toHaveLength(0)
    expect(s.score).toBe(base.score + 2 * FIREBALL_SCORE)
  })

  it('a single shot lined up on BOTH a TIE and a fireball spends on only one — the nearer', () => {
    // ONE object resolves per frame ACROSS BOTH LISTS — the fighters (CL.ADS) and the alien
    // guns' shells (CL.GDS) rank in a single contest and the nearest wins. That is why sim.ts
    // runs one loop over the two lists rather than two independent passes, and it is the one
    // CLSLZ rule no other suite covers (hitscan-laser.test.ts ranks turrets against turrets).
    //
    // sw7-17 REPLACED THE RULE THIS TEST GUARDS. It used to be pass ORDER: "the TIE loop runs
    // first, so the bolt is spent on the TIE before the fireball loop sees it" — the TIE won
    // wherever the two sat, and the old fixture stacked them on one point. Under hitscan the
    // winner is DISTANCE (`LDD CL.GDS / SUBD CL.ADS / BLO HTSG` — min of the two), so stacking
    // them on a point no longer says anything: the fireball homes before the beam resolves,
    // which lands it a hair in front, and it would take the shot. Being off by a hair is not a
    // contract worth pinning, so the migration puts real distance between them and runs the
    // contest BOTH WAYS. The invariant under test is the one that survives the rule change and
    // is what "spends on only one" always meant: exactly one thing dies, and exactly one scores.
    const base = wave()
    const NEAR: Vec3 = [0, 0, -100] // outside COCKPIT_HIT_RADIUS (80), so nothing lands on us
    const FAR: Vec3 = [0, 0, -600] // same ray, five times further out

    // (i) The fireball is in front of the TIE that fired it — the ROM's own example. It eats the
    //     beam and the fighter behind it lives.
    const shielded: GameState = {
      ...base,
      enemies: [tie(FAR)],
      enemyShots: [fireball(NEAR)],
      spawnTimer: 1e9,
    }
    const s1 = stepGame(shielded, fireAt(shielded, NEAR), TICK)
    expect(s1.enemyShots, 'the near fireball took the beam').toHaveLength(0)
    expect(s1.enemies, 'so the TIE behind it lives').toHaveLength(1)
    expect(s1.score, 'and only the fireball scored').toBe(base.score + FIREBALL_SCORE)

    // (ii) Swap the two along the same ray and the result swaps with them — proof the contest is
    //      decided by RANGE and not by which list is looped first (a pass-ordered resolver
    //      passes (i) or (ii), never both).
    const exposed: GameState = {
      ...base,
      enemies: [tie(NEAR)],
      enemyShots: [fireball(FAR)],
      spawnTimer: 1e9,
    }
    const s2 = stepGame(exposed, fireAt(exposed, NEAR), TICK)
    expect(s2.enemies, 'the near TIE took the beam').toHaveLength(0)
    expect(s2.enemyShots, 'so the fireball behind it flies on').toHaveLength(1)
    expect(s2.score, 'and only the TIE scored').toBe(base.score + TIE_SCORE)
  })
})

describe('Wave 1 — purity & determinism (story 8-18)', () => {
  it('does not mutate the input state when destroying a fireball', () => {
    const base = wave()
    const shots = [fireball(DOWNRANGE)]
    const bolts: Projectile[] = [] // the player's list — the hitscan gun never adds to it
    const s0: GameState = { ...base, enemyShots: shots, projectiles: bolts }
    const s1 = stepGame(s0, fireAt(s0, DOWNRANGE), TICK)
    expect(s1.enemyShots, 'a kill really happened — purity is being tested through a WRITE').toHaveLength(0)
    // The input arrays are untouched: same references, same contents. `projectiles` is asserted
    // alongside `enemyShots` (it held the bolt before sw7-17): the step must neither mutate the
    // player's list nor push a shot into it.
    expect(s0.enemyShots).toBe(shots)
    expect(s0.enemyShots).toHaveLength(1)
    expect(s0.projectiles).toBe(bolts)
    expect(s0.projectiles).toHaveLength(0)
  })

  it('identical seeds and inputs yield identical states through a fireball kill', () => {
    const setup = (seed: number): GameState => ({ ...wave(seed), enemyShots: [fireball(DOWNRANGE)] })
    let a = setup(42)
    let b = setup(42)
    // One pull on frame 0, then coast with the same dead aim and the trigger up — the identical
    // input script both runs see. (Holding `fire` would fire nothing anyway: the trigger is
    // edge-triggered, so a second frame of `true` is not a second shot.)
    const shot = fireAt(a, DOWNRANGE)
    for (let i = 0; i < 10; i++) {
      const input = i === 0 ? shot : release(shot)
      a = stepGame(a, input, 0.02)
      b = stepGame(b, input, 0.02)
    }
    expect(a.enemyShots, 'the kill really happened in both runs').toHaveLength(0)
    expect(a).toEqual(b)
  })
})
