// tests/core/surface-aim-wysiwyg.test.ts
//
// Story sw7-16 / R11a — RED (Han Solo / TEA). The surface half of sw5-6's lesson.
//
// == WHY THIS FILE EXISTS =====================================================
//
// Live report, 2026-07-16 (wave-1 surface): "I shoot way lower than the crosshairs
// indicate."
//
// sw5-6 put the gun on the ship IN THE TRENCH, and left a comment claiming the job was
// already done everywhere else (`sim.ts`, above the muzzle):
//
//     "Other phases keep the fixed cockpit: their camera and collision world already
//      share the origin."
//
// That sentence is FALSE for the surface, and has been false since the camera-lift
// (stories 11-2 / 11-5). The surface camera flies at `[0, state.altitude, 0]`
// (`render.ts cameraView`), altitude in [MIN_SKIM_ALTITUDE .. MAX_SKIM_ALTITUDE] =
// [40..238]. The muzzle, the fireball target (`toCockpit`) and the cockpit hit-test all
// still sit at the world origin. So the eye and the gun ride PARALLEL RAYS separated by
// `altitude` — the exact defect sw5-6 fixed one phase over, still live in this one.
//
// == WHAT THE ROM SAYS ========================================================
//
//   WSGUNS.MAC `FRPTGN` — the shot leaves THE SHIP, not the world origin:
//       LDD M$TX+M.S1 / ADDD #100  ;JUST A BIT IN FRONT
//       LDD M$TY+M.S1              <- the SHIP's lateral
//       LDD M$TZ+M.S1              <- the SHIP's HEIGHT
//
// Design (`docs/superpowers/specs/2026-07-16-surface-gunnery-and-traversal-design.md`,
// Defect 1 / R11a): ONE ship point for the surface, `[0, altitude, 0]`, shared by
// (a) the player muzzle, (b) the fireball target, (c) the cockpit hit-test centre —
// exactly the trench's `trenchView` pattern. "Pure-core change; TDD directly
// (muzzle == camera eye on surface)."
//
// == ROUND 2 (2026-07-16) — WHAT THE REVIEW CAUGHT ============================
//
// Round 1's suite was green and its fix was correct, but three of its tests could not have
// failed, and the file said things about itself that were not true. It was rejected on
// exactly that — which is the same failure as sw5-6's stale comment, one story later.
//
//   * `crosshairOn` is GONE. `tests/support/aim.ts` already exported `aimAt` — the same
//     projection inverse, character for character. One copy, in the place the trench suites
//     already import from.
//
//   * `flyingEye` no longer HAND-WRITES `[0, altitude, 0]`; it is now `eyeOf`, recovered
//     from `render.ts cameraView`. Written out by hand it was a FOURTH copy of the ship
//     point, so "puts the muzzle exactly on the camera eye" really only asserted "the muzzle
//     matches a constant I typed twice" — and would have stayed green if render.ts drifted.
//
//   * The floor-level hit-test fixture DISCRIMINATES now. It used to park a shot at
//     [0, MIN_SKIM_ALTITUDE, 0] = [0, 40, 0]; 40 is INSIDE COCKPIT_HIT_RADIUS (80), so the
//     unfixed build's origin-centred sphere scored that hit too. It passed against the very
//     bug it was written to catch. See (d).
//
//   * Section (e)'s space hit-test guard was inert for a subtler reason: it never routed
//     through `shipPoint` at all, so mutating the ship point left it green. Round 2 makes
//     `shipPoint` exhaustive over Phase and routes space's hit-tests through it.
//
//   * The yoke comes OFF CENTRE — see (b). Round 1 fired every shot with `aimY: 0`, which is
//     the one input that hides the question, and that is why nothing caught the docstring.
//
// THE STANDING RULE this file now holds itself to: a regression guard is only a guard if it
// FAILS when you revert the fix. Every guard below has been checked by mutation. Where a
// test is AC coverage rather than a guard, it says so instead of taking the credit.
//
// == WHY EVERY SHOT BELOW IS FIRED DEAD AHEAD (|x| = 0) =======================
//
// R11a is ONE of three compounding defects. Defect 2 (G-004, R11b/sw7-17) is that our
// 12,000 u/s travelling bolt lets the field close under it: bolt and target meet at
// `bolt/(bolt+closing)` of the ray, so a dead-on shot lands at 95.2% of the target's
// lateral offset and misses anything past |x| ~ 4,100. That is NOT this story, and a
// test that tripped over it would be unfixable inside R11a's 2 points.
//
// So every shot here is fired at |x| = 0, where the lateral lead error is exactly zero
// and the ONLY thing that can move the bolt off the reticle is the altitude parallax.
// These tests fail for R11a's reason or they do not fail at all.

import { describe, it, expect } from 'vitest'
import { stepGame, enterPhase } from '../../src/core/sim'
import {
  initialState,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  MAX_SKIM_ALTITUDE,
  TOWER_HEIGHT,
  TURRET_SCROLL_SPEED,
  ENEMY_SHOT_SPEED,
  COCKPIT_HIT_RADIUS,
  type GameState,
} from '../../src/core/state'
import { aimAt } from '../support/aim'
import { sub, scale, normalize, transform, IDENTITY, type Vec3 } from '@arcade/shared/math3d'
import type { Input } from '../../src/core/input'
import * as RenderModule from '../../src/shell/render'

const DT = 1 / 60
const ASPECT = 16 / 9
const ORIGIN: Vec3 = [0, 0, 0]

/**
 * A surface run with an EMPTY, already-laid maze: `surfaceMazeLaid: true` keeps
 * `stepSurface` from laying `mazeForWave(wave)` over a fixture's hand-placed field, so each
 * test faces only the objects it asked for.
 */
const surface = (over: Partial<GameState> = {}): GameState => ({
  ...enterPhase(initialState(1983), 'surface'),
  mode: 'playing',
  turrets: [],
  surfaceMazeLaid: true,
  projectiles: [],
  enemyShots: [],
  fireCooldown: 0,
  ...over,
})

/**
 * The pilot's eye in world space — RECOVERED from the camera the shell actually builds
 * (`render.ts cameraView`), never hand-copied.
 *
 * This is what makes "the muzzle is on the camera eye" mean what it says. Round 1 wrote
 * `[0, s.altitude, 0]` here, which made the helper a fourth hand-matched copy of the ship
 * point: the assertion only compared the muzzle against a constant typed twice in the same
 * file, and would have sat green through any drift in render.ts. Going through `cameraView`
 * ties every muzzle assertion below to the shell's real camera, across the boundary.
 *
 * The surface camera is IDENTITY-oriented, so its view matrix is a pure translation by −eye
 * and the eye falls straight out of the world origin's image: transform(view, [0,0,0]) = −eye.
 * (`+ 0` normalises −0, which `toEqual` reports as a difference from 0.)
 */
const eyeOf = (s: GameState): Vec3 => {
  const originInView = transform(RenderModule.cameraView(s), ORIGIN)
  return [-originInView[0] + 0, -originInView[1] + 0, -originInView[2] + 0]
}

/**
 * Yoke at rest, trigger down.
 *
 * A LEVEL STICK IS NOT THE NEUTRAL CASE IT LOOKS LIKE. On the surface the yoke's vertical
 * axis also FLIES the ship (`altitude += aimY · ALTITUDE_RATE · dt`), so `aimY: 0` is the one
 * input under which altitude cannot change during the step — and therefore the one input
 * under which the frame's two ship points collapse onto each other. Round 1 fired every shot
 * this way and justified it as "the only way to fire at a known, unchanging altitude"; what
 * it actually did was hide the whole question. Section (b) takes the stick off centre.
 */
const trigger = (over: Partial<Input> = {}): Input => ({
  aimX: 0,
  aimY: 0,
  fire: true,
  aspect: ASPECT,
  ...over,
})

const ALTITUDE_BAND = [
  ['the floor of the flight band', MIN_SKIM_ALTITUDE],
  ['the nominal skim height', SKIM_ALTITUDE],
  ['the ceiling of the flight band', MAX_SKIM_ALTITUDE],
] as const

/** Every altitude in the band × a yoke sweep spanning dive, level and climb. */
const YOKE_SWEEP = [-1, -0.5, 0, 0.5, 1] as const
const MUZZLE_SWEEP = ALTITUDE_BAND.flatMap(([label, alt]) =>
  YOKE_SWEEP.map((aimY) => [label, alt, aimY] as [string, number, number]),
)

// ---------------------------------------------------------------------------
// (a) The muzzle. The precise defect, pinned at every altitude in the band.
// ---------------------------------------------------------------------------

describe('sw7-16 — the surface muzzle IS the flying ship', () => {
  it.each(ALTITUDE_BAND)('spawns the bolt at the ship point at %s (altitude %s)', (_label, alt) => {
    const s = stepGame(surface({ altitude: alt }), trigger(), DT)

    expect(s.projectiles, 'the trigger must produce exactly one bolt').toHaveLength(1)
    // The bolt is pushed AFTER the frame's `advance`, so its recorded position is the
    // muzzle itself, untouched by a step of flight — an exact assertion is honest here.
    // The design names one ship point, `[0, altitude, 0]`, with no forward offset (the
    // trench's `trenchView` muzzle carries none either), so pin it exactly.
    expect(s.projectiles[0].pos).toEqual([0, alt, 0])
  })

  it('rides the ship up and down — the muzzle is never a fixed height', () => {
    // Guards the lazy fix: hard-coding SKIM_ALTITUDE (or any constant) satisfies the
    // nominal case above while leaving the gun off the ship everywhere else. The muzzle
    // must READ the altitude, not remember one.
    const low = stepGame(surface({ altitude: MIN_SKIM_ALTITUDE }), trigger(), DT)
    const high = stepGame(surface({ altitude: MAX_SKIM_ALTITUDE }), trigger(), DT)

    expect(low.projectiles[0].pos[1]).toBe(MIN_SKIM_ALTITUDE)
    expect(high.projectiles[0].pos[1]).toBe(MAX_SKIM_ALTITUDE)
    expect(high.projectiles[0].pos[1]).toBeGreaterThan(low.projectiles[0].pos[1])
  })

  it('puts the muzzle exactly on the camera eye — "muzzle == camera eye on surface"', () => {
    // The design's own acceptance sentence, and now a real cross-boundary assertion: `eyeOf`
    // reads the camera `render.ts cameraView` actually builds, so this fails if EITHER side
    // drifts. Sight-line and bolt axis are coaxial only if these two points are one point.
    const s0 = surface({ altitude: 173 }) // an arbitrary in-band height, not a constant
    const s = stepGame(s0, trigger(), DT)

    expect(s.projectiles[0].pos).toEqual(eyeOf(s0))
  })
})

// ---------------------------------------------------------------------------
// (b) The yoke comes off centre. The axis round 1 never tested.
// ---------------------------------------------------------------------------

describe('sw7-16 — the muzzle is the eye the pilot AIMED down', () => {
  // Every shot in (a) is fired with `aimY: 0`, where the ship cannot change altitude during
  // the step — so the ship at the START of the frame and the ship after the frame's flight
  // are the same point, and the distinction this section exists to make is invisible. That
  // is exactly why round 1 shipped a docstring that got the distinction wrong.
  //
  // Off centre, TWO ship points exist inside one frame, and they are different:
  //
  //     shipPoint(state)       the ship at the START of the step   <- the muzzle
  //     surfaceShip(altitude)  the ship after this frame's flight  <- fire target, hit-test
  //
  // BOTH ARE RIGHT, and the muzzle's is not the lesser of the two. The shell steps and THEN
  // renders (`main.ts`: `stepGame(state, input.sample(), dt)` at :146, `render(ctx, state, …)`
  // at :287), so the yoke position arriving in THIS step was chosen by a pilot looking at the
  // frame drawn from THIS state's altitude. The eye he sighted down is the eye at the start
  // of the step. His bolt must leave from there — from where he was aiming, not from where
  // the frame's flight then carried him. The fire target and the hit-test resolve at the END
  // of the frame, so they correctly use the flown point. The two answer different questions.
  //
  // So these tests pin the muzzle to the eye of the INPUT state (`s0`), never the returned
  // one. A well-meaning "fix" that re-seats the bolt on the flown ship reads tidier and is
  // wrong: it would run the bolt off the pilot's sight-line by exactly the frame's climb.

  it.each(MUZZLE_SWEEP)(
    'leaves from the aim-time eye at %s (altitude %s), yoke %s',
    (_label, alt, aimY) => {
      const s0 = surface({ altitude: alt })
      const s = stepGame(s0, trigger({ aimY }), DT)

      expect(s.projectiles, 'the trigger must produce exactly one bolt').toHaveLength(1)
      expect(s.projectiles[0].pos).toEqual(eyeOf(s0))
    },
  )

  it('leaves from the aim-time eye on a TERRAIN-CRASH frame — the 87-unit teleport', () => {
    // THE CASE ROUND 1'S DOCSTRING GOT WRONG, and the reason `aimY: 0` was not a harmless
    // convenience. Diving from just inside the floor of the band trips the crash bump, which
    // does not ease the ship up — it TELEPORTS it:
    //
    //     if (altitude < MIN_SKIM_ALTITUDE) altitude = SKIM_ALTITUDE   // 40 -> 128
    //
    // so the frame's two ship points sit 87 apart (88 firing from exactly 40) — NOT the "one
    // frame of climb (<= ALTITUDE_RATE * dt)" = 3.33 the docstring claimed, and not "three
    // orders under" anything. The pilot aimed from 41; his bolt leaves from 41. The teleport
    // is the same frame's business, and it is not the gun's.
    const s0 = surface({ altitude: MIN_SKIM_ALTITUDE + 1 })
    const s = stepGame(s0, trigger({ aimY: -1 }), DT)

    expect(
      s.events.some((e) => e.type === 'terrain-crash'),
      'the fixture must actually trip the crash bump, or it tests nothing',
    ).toBe(true)
    expect(s.altitude, 'the bump teleports the ship; it does not ease it').toBe(SKIM_ALTITUDE)
    expect(
      eyeOf(s)[1] - s0.altitude,
      'the frame really does hold two ship points ~87 apart — the docstring said 3.33',
    ).toBeCloseTo(87)

    expect(s.projectiles[0].pos).toEqual(eyeOf(s0))
  })
})

// ---------------------------------------------------------------------------
// (c) Fire the gun. What the player actually reported.
// ---------------------------------------------------------------------------

describe('sw7-16 — what you aim at is what you hit (surface towers)', () => {
  // WHICH OF THESE CASES ACTUALLY DISCRIMINATE — stated plainly, because a suite that takes
  // credit it has not earned is what got round 1 rejected. Aiming at a tower's base from
  // altitude A, the unfixed build's floor-level bolt arrives ~0.952·A BELOW it, against a
  // TURRET_HIT_RADIUS of 200. So it is only a MISS once 0.952·A > 200, i.e. A > ~210:
  //
  //     MIN_SKIM_ALTITUDE   40  ->  ~38 low   inside the sphere — a kill either way
  //     SKIM_ALTITUDE      128  -> ~122 low   inside the sphere — a kill either way
  //     MAX_SKIM_ALTITUDE  238  -> ~227 low   OUTSIDE — the only case that catches the bug
  //
  // The first two are AC coverage ("dead-on aim kills at every altitude in the band"), NOT
  // regression guards, and this file does not pretend otherwise. Sections (a) and (b) are
  // what pin the defect at every altitude; a kill test alone under-describes it.

  /**
   * Fire ONE bolt on the given yoke, then release and coast. Returns whether a tower died.
   *
   * IT MUST BE ONE BOLT — the lesson sw5-6's suite paid for. With the trigger HELD, a bolt
   * fired late (once the tower has scrolled close) barely drops before it arrives, so it can
   * blunder into the hit sphere even from the wrong, floor-level muzzle, and the test passes
   * with the regression intact. A single aimed shot has to actually be aimed.
   *
   * A KILL is the enemy-death EVENT, never `turrets.length === 0` — a tower also leaves the
   * list by simply scrolling past the cockpit, which would be a false positive.
   */
  function fireOnce(s0: GameState, yoke: Input, frames = 240): boolean {
    let s = s0
    for (let i = 0; i < frames; i++) {
      // Frame 0 fires; after that the stick LEVELS. The bolt's velocity was locked at spawn,
      // so levelling cannot touch the shot — but holding the aiming dive would not be inert:
      // aiming at a tower's base points DOWN, and the vertical axis is also the throttle, so
      // a held stick flies the ship into the floor over and over and litters the run with
      // crash bumps that have nothing to do with what is being measured.
      s = stepGame(s, i === 0 ? yoke : { ...yoke, aimY: 0, fire: false }, DT)
      if (s.events.some((e) => e.type === 'enemy-death' && e.enemyType === 'turret')) return true
      if (s.turrets.length === 0) return false // scrolled past — never hit
    }
    return false
  }

  it.each(ALTITUDE_BAND)(
    'DESTROYS a tower the crosshair is on, flying at %s (altitude %s)',
    (_label, alt) => {
      const tower: Vec3 = [0, 0, -4000]
      const s0 = surface({ altitude: alt, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

      const aim = aimAt(tower, eyeOf(s0), ASPECT)
      expect(
        aim.reachable,
        `the tower needs aim (${aim.aimX.toFixed(2)}, ${aim.aimY.toFixed(2)})`,
      ).toBe(true)

      expect(
        fireOnce(s0, trigger({ aimX: aim.aimX, aimY: aim.aimY })),
        'the bolt must go where the crosshair points',
      ).toBe(true)
    },
  )

  it('does NOT destroy a tower when the crosshair is on empty sky', () => {
    // The other half of "what you aim at is what you hit", and the shape of sw5-6's round-1
    // absurdity: with the gun on the floor, a crosshair pointed at nothing sent a bolt running
    // level out of the origin and into things the player never aimed at. A centred yoke, flying
    // at the band ceiling, points high over a tower's base — that shot must miss.
    const tower: Vec3 = [0, 0, -4000]
    const s0 = surface({ altitude: MAX_SKIM_ALTITUDE, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

    expect(fireOnce(s0, trigger()), 'a crosshair on empty sky must not kill a tower').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (d) Incoming. The fireball target and the hit-test share the same ship point.
// ---------------------------------------------------------------------------

/**
 * A fireball height that ONLY a ship-centred hit-test can catch while the pilot flies at the
 * floor of the band: outside the ORIGIN's sphere (> COCKPIT_HIT_RADIUS) but inside the SHIP's
 * (< MIN_SKIM_ALTITUDE + COCKPIT_HIT_RADIUS) — the window (80, 120). Its midpoint, DERIVED
 * from the constants rather than typed, so a retune moves the probe instead of rotting it.
 */
const PROBE_Y = (COCKPIT_HIT_RADIUS + (MIN_SKIM_ALTITUDE + COCKPIT_HIT_RADIUS)) / 2 // = 100

describe('sw7-16 — enemy fire tracks the flying ship', () => {
  it('aims a tower fireball at the ship point, not at the origin', () => {
    // One armed tower => `armed[nextInt(rng, 1)]` is deterministic, no seeding games.
    const tower: Vec3 = [0, 0, -2000]
    const s0 = surface({
      altitude: MAX_SKIM_ALTITUDE,
      turrets: [{ pos: [...tower] as Vec3, age: 10 }], // long past TOWER_FIRE_GRACE
      enemyFireCooldown: 0,
    })
    const s = stepGame(s0, trigger({ fire: false }), DT)

    expect(s.enemyShots, 'the armed tower must fire this frame').toHaveLength(1)

    // The shot leaves the tower's white cap and must fly at the SHIP. Rebuild the launch
    // geometry from the same constants the sim uses: the field scrolls one step before the
    // muzzle is read, so the cap's z has already advanced.
    //
    // The maze aims at where the ship IS at the end of this frame — the flown point, not the
    // aim-time one — which is why this is `eyeOf(s)` and not `eyeOf(s0)`. With a level yoke
    // the two coincide; (b) is where they are told apart.
    const muzzle: Vec3 = [tower[0], tower[1] + TOWER_HEIGHT, tower[2] + TURRET_SCROLL_SPEED * DT]
    const atShip = scale(normalize(sub(eyeOf(s), muzzle)), ENEMY_SHOT_SPEED)
    const atOrigin = scale(normalize(sub(ORIGIN, muzzle)), ENEMY_SHOT_SPEED)

    const vel = s.enemyShots[0].vel
    expect(vel[0]).toBeCloseTo(atShip[0], 6)
    expect(vel[1]).toBeCloseTo(atShip[1], 6)
    expect(vel[2]).toBeCloseTo(atShip[2], 6)

    // Belt and braces: the two targets must be genuinely distinguishable at this altitude,
    // or the assertion above proves nothing. (The cap is 352 up, the ship 238 up — the
    // fireball's climb differs by a wide margin.)
    expect(atShip[1]).not.toBeCloseTo(atOrigin[1], 3)
  })

  it('costs a shield when a fireball reaches the ship point', () => {
    // A dead-still fireball parked exactly where the ship is flying. With the hit-test at the
    // origin it is 238 units away — outside COCKPIT_HIT_RADIUS = 80 — and sails harmlessly
    // through the pilot.
    const s0 = surface({
      altitude: MAX_SKIM_ALTITUDE,
      enemyShots: [{ pos: [0, MAX_SKIM_ALTITUDE, 0], vel: [0, 0, 0], ttl: 5 }],
    })
    const s = stepGame(s0, trigger({ fire: false }), DT)

    expect(s.events.filter((e) => e.type === 'player-death' && e.cause === 'turret')).toHaveLength(1)
    expect(s.lives).toBe(s0.lives - 1)
  })

  it('ignores a fireball at the ORIGIN — the ship is not down there', () => {
    // The false-positive half. The origin is the FLOOR, `altitude` below the pilot; a shot
    // sitting there must not kill him. An origin-centred hit-test scores a direct hit on empty
    // air, which is a free shield lost every time enemy fire passes under the ship.
    const s0 = surface({
      altitude: MAX_SKIM_ALTITUDE,
      enemyShots: [{ pos: [0, 0, 0], vel: [0, 0, 0], ttl: 5 }],
    })
    const s = stepGame(s0, trigger({ fire: false }), DT)

    expect(s.events.some((e) => e.type === 'player-death')).toBe(false)
    expect(s.lives).toBe(s0.lives)
  })

  it('carries the hit sphere DOWN with the ship, not merely away from the origin', () => {
    // ROUND 1'S INERT GUARD, MADE TO BITE. It used to park the shot at [0, MIN_SKIM_ALTITUDE,
    // 0] = [0, 40, 0] and call itself "the ship flies down ONTO a floor-level fireball". It
    // never was a guard: 40 is INSIDE COCKPIT_HIT_RADIUS (80), so the unfixed build's
    // origin-centred sphere scored that hit too, and the test passed against the exact bug it
    // was written to catch. Its own comment even asserted `MIN_SKIM_ALTITUDE < COCKPIT_HIT_
    // RADIUS` — the fact that made it inert — and read it as the fixture's justification.
    //
    // To discriminate at the floor of the band the shot must sit OUTSIDE the origin's sphere
    // and INSIDE the ship's: the window (80, 120) with the pilot at 40. PROBE_Y is its
    // midpoint. This still tests what the old one meant to — that the hit sphere MOVES rather
    // than merely moving away — because a sphere left at the origin misses PROBE_Y entirely.
    const s0 = surface({
      altitude: MIN_SKIM_ALTITUDE,
      enemyShots: [{ pos: [0, PROBE_Y, 0], vel: [0, 0, 0], ttl: 5 }],
    })
    const s = stepGame(s0, trigger({ fire: false }), DT)

    // The window must be real, or the assertion below proves nothing. If a retune ever closes
    // it, fail loudly here rather than passing for the wrong reason.
    expect(PROBE_Y, 'outside the ORIGIN sphere — the unfixed build misses it').toBeGreaterThan(
      COCKPIT_HIT_RADIUS,
    )
    expect(
      Math.abs(PROBE_Y - MIN_SKIM_ALTITUDE),
      'inside the SHIP sphere — the fixed build catches it',
    ).toBeLessThan(COCKPIT_HIT_RADIUS)

    expect(s.events.filter((e) => e.type === 'player-death' && e.cause === 'turret')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// (e) The blast radius. R11a moves the SURFACE and nothing else.
// ---------------------------------------------------------------------------

describe('sw7-16 — the other phases do not move', () => {
  it('space still fires from the fixed cockpit at the origin', () => {
    // `altitude` is a live field in every phase — it rides in state through space. If the ship
    // point is applied globally instead of per-phase, this bolt leaves from [0, 238, 0] and
    // space's aim breaks the way the surface's is broken now.
    const s0: GameState = {
      ...enterPhase(initialState(1983), 'space'),
      mode: 'playing',
      altitude: MAX_SKIM_ALTITUDE,
      projectiles: [],
      fireCooldown: 0,
    }
    const s = stepGame(s0, trigger(), DT)

    expect(s.projectiles).toHaveLength(1)
    expect(s.projectiles[0].pos).toEqual([0, 0, 0])
  })

  it('space still takes cockpit hits at the origin', () => {
    // The hit-test's other half of the same guard: space's collision world IS the origin
    // (the claim sw5-6's comment made about every phase, true only here).
    //
    // ⚠ THIS ONLY BITES BECAUSE space's hit-tests now route through `shipPoint`. Round 1 wrote
    // it against the raw `COCKPIT` literal, so nothing it touched ever called `shipPoint` and
    // mutating the ship point left it green — an inert guard, in a file whose header promised
    // it worked. Behaviour is identical either way (`shipPoint`'s space branch returns
    // COCKPIT); what changed is that the guard can now FAIL, which is the whole of what makes
    // it a guard.
    const s0: GameState = {
      ...enterPhase(initialState(1983), 'space'),
      mode: 'playing',
      altitude: MAX_SKIM_ALTITUDE,
      enemies: [{ pos: [0, 0, 0], vel: [0, 0, 0], kind: 'tie', orient: IDENTITY }],
      fireCooldown: 0,
    }
    const s = stepGame(s0, trigger({ fire: false }), DT)

    expect(s.events.filter((e) => e.type === 'player-death' && e.cause === 'enemy')).toHaveLength(1)
  })

  it('the trench still fires from trenchView (sw5-6 stays fixed)', () => {
    const s0: GameState = {
      ...enterPhase(initialState(1983), 'trench'),
      mode: 'playing',
      exhaustPort: null,
      trenchObstacles: [],
      altitude: MAX_SKIM_ALTITUDE, // a stale surface altitude must not leak into the trench
      projectiles: [],
      fireCooldown: 0,
    }
    const s = stepGame(s0, trigger(), DT)

    expect(s.projectiles).toHaveLength(1)
    expect(s.projectiles[0].pos).toEqual([...s0.trenchView])
  })
})
