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
//   * This file's `crosshairOn` is GONE — it re-implemented `aimAt`, which `tests/support/aim.ts`
//     already exported. This suite now imports the shared one. (`trench-aim-wysiwyg.test.ts:91`
//     still keeps its own copy and does not import `aim.ts`; that file is sw5-6's and out of
//     scope here, so there are still TWO implementations in the repo, not one.)
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
//     through `shipPoint` at all, so mutating the ship point left it green. Round 2 routes
//     space's hit-tests through `shipPoint` — that routing, and nothing else, is what makes
//     the guard able to fail. (`shipPoint` is also now an exhaustive switch over Phase, but
//     that is a compile-time guard against a FUTURE phase, not what arms this test.)
//
//   * The yoke comes OFF CENTRE — see (b). Round 1 fired every shot with `aimY: 0`, which is
//     the one input that hides the question, and that is why nothing caught the docstring.
//
// == ROUND 3 (2026-07-17) — WHAT sw7-17 TOOK AWAY =============================
//
// sw7-17 (R11b) made the player's laser a HITSCAN beam, so the gun no longer spawns a bolt and
// `s.projectiles` is empty after a trigger frame. Every assertion here that read the muzzle off
// a spawned bolt now reads `shipPoint` — the point the beam is cast from — which the core
// exports. Sections (c) and (d) did not change at all and did not even go red: "what you aim at
// is what you hit" is a behavioural claim, and hitscan keeps it.
//
// Section (b)'s 15-case altitude × yoke sweep is GONE, not migrated, and its header says why in
// full: the aim-time-vs-flown distinction is no longer observable from the state, and no
// behavioural fixture can recover it (the two points differ by 3.33-to-87 units against a
// 200-unit hit radius). Rewriting it would have produced fifteen tests that cannot fail. That
// loss is recorded as a Delivery Finding on sw7-17 rather than papered over here.
//
// THE STANDING RULE this file now holds itself to: a regression guard is only a guard if it
// FAILS when you revert the fix. Every guard below has been checked by mutation, with ONE
// documented exception that cannot be — see `surface-ship-point.test.ts`, where reverting
// `render.ts` to an inline `[0, altitude, 0]` is behaviour-PRESERVING and therefore invisible
// to any value assertion. Where a test is AC coverage rather than a guard, it says so instead
// of taking the credit.
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
//
// sw7-17 HAS since landed, so that lead error is gone and |x| = 0 is no longer load-bearing —
// `hitscan-laser.test.ts` is where the off-axis shot is pinned now. This file keeps its shots
// dead ahead anyway: they are R11a's guards, and they should keep failing for R11a's reason
// alone rather than quietly depending on R11b's fix as well.

import { describe, it, expect } from 'vitest'
import { stepGame, enterPhase, shipPoint } from '../../src/core/sim'
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
import { aimAt, eyeOf } from '../support/aim'
import { sub, scale, normalize, IDENTITY, type Vec3 } from '@arcade/shared/math3d'
import type { Input } from '../../src/core/input'

const DT = 1 / 60
const ASPECT = 16 / 9
/** The world origin — the floor point the ship USED to be pinned to. Kept as the foil the
 *  ship point is told apart from, never as a stand-in for the eye. */
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
 * Yoke at rest, trigger down.
 *
 * A LEVEL STICK IS NOT THE NEUTRAL CASE IT LOOKS LIKE. On the surface the yoke's vertical
 * axis also FLIES the ship (`altitude += aimY · ALTITUDE_RATE · dt`), so `aimY: 0` is the one
 * input under which altitude cannot change during the step — and therefore the one input
 * under which the frame's two ship points collapse onto each other. Round 1 fired every shot
 * this way and justified it as "the only way to fire at a known, unchanging altitude"; what
 * it actually did was hide the whole question. Section (b) is where that was taken apart —
 * see its header for why sw7-17 could not keep the sweep it used to do that with.
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

// ---------------------------------------------------------------------------
// (a) The muzzle. The precise defect, pinned at every altitude in the band.
// ---------------------------------------------------------------------------

describe('sw7-16 — the surface gun IS on the flying ship', () => {
  // == HOW sw7-17 CHANGED THIS SECTION ========================================
  //
  // Every test here used to read the muzzle straight off the state — `s.projectiles[0].pos`,
  // the bolt the trigger spawned. sw7-17 made the laser HITSCAN (audit G-004): the gun spawns
  // nothing that flies, `s.projectiles` is empty after a trigger frame, and the muzzle is no
  // longer an object. It is `shipPoint(state)` — the point the beam is cast from — which the
  // core now exports.
  //
  // So these assert `shipPoint` instead of a bolt. They pin the same two things they always did:
  // the gun's point READS the altitude (no remembered constant), and it IS the shell's camera eye.

  it.each(ALTITUDE_BAND)('casts the beam from the ship point at %s (altitude %s)', (_label, alt) => {
    // The design names one ship point, `[0, altitude, 0]`, with no forward offset (the trench's
    // `trenchView` muzzle carries none either), so pin it exactly.
    expect(shipPoint(surface({ altitude: alt }))).toEqual([0, alt, 0])
  })

  it('rides the ship up and down — the gun is never at a fixed height', () => {
    // Guards the lazy fix: hard-coding SKIM_ALTITUDE (or any constant) satisfies the
    // nominal case above while leaving the gun off the ship everywhere else. The gun
    // must READ the altitude, not remember one.
    const low = shipPoint(surface({ altitude: MIN_SKIM_ALTITUDE }))
    const high = shipPoint(surface({ altitude: MAX_SKIM_ALTITUDE }))

    expect(low[1]).toBe(MIN_SKIM_ALTITUDE)
    expect(high[1]).toBe(MAX_SKIM_ALTITUDE)
    expect(high[1]).toBeGreaterThan(low[1])
  })

  it('puts the gun exactly on the camera eye — "muzzle == camera eye on surface"', () => {
    // The design's own acceptance sentence, and a real cross-boundary assertion: `eyeOf`
    // reads the camera `render.ts cameraView` actually builds, so this fails if EITHER side
    // drifts. Sight-line and beam axis are coaxial only if these two points are one point.
    const s0 = surface({ altitude: 173 }) // an arbitrary in-band height, not a constant

    expect(shipPoint(s0)).toEqual(eyeOf(s0))
  })
})

// ---------------------------------------------------------------------------
// (b) The two ship points in one frame. What the hitscan port cost this file.
// ---------------------------------------------------------------------------

describe('sw7-16 — the two ship points inside one frame', () => {
  // == WHAT THIS SECTION USED TO PIN, AND WHY IT NO LONGER CAN =================
  //
  // Off centre, TWO ship points exist inside one frame, and they are different:
  //
  //     shipPoint(state)       the ship at the START of the step   <- the gun
  //     surfaceShip(altitude)  the ship after this frame's flight  <- fire target, hit-test
  //
  // BOTH ARE RIGHT, and the gun's is not the lesser of the two. The shell steps and THEN
  // renders (`main.ts`: `stepGame(state, input.sample(), dt)` at :146, `render(ctx, state, …)`
  // at :287), so the yoke position arriving in THIS step was chosen by a pilot looking at the
  // frame drawn from THIS state's altitude. The eye he sighted down is the eye at the start of
  // the step, and his shot must leave from there — not from where the frame's flight then
  // carried him. The fire target and the hit-test resolve at the END of the frame, so they
  // correctly use the flown point. The two answer different questions, and `sim.ts` still makes
  // exactly that choice (`beamOrigin = shipPoint(state)`), and still says why, above the beam.
  //
  // IT IS NO LONGER OBSERVABLE, AND THIS FILE WILL NOT PRETEND OTHERWISE. Round 2 pinned it by
  // reading the bolt's spawn point off the state — `expect(s.projectiles[0].pos).toEqual(eyeOf(s0))`
  // — across a 15-case altitude × yoke sweep. sw7-17 made the laser hitscan (audit G-004), so the
  // gun leaves no object behind and nothing on the returned state records where the beam started.
  //
  // Nor can a behavioural fixture tell the two apart, and that is arithmetic, not laziness: the
  // points differ by ONE frame of climb (ALTITUDE_RATE × dt = 3.33) and by at most 87 on the
  // crash frame below, while TURRET_HIT_RADIUS is 200. A dead-on shot lands from EITHER origin at
  // every altitude in the band; there is no surface target that a 3-to-87-unit origin shift can
  // move outside its own hit sphere.
  //
  // So the 15-case sweep is GONE rather than rewritten. `shipPoint(s0)` does not read `aimY` at
  // all, so a migrated sweep would be fifteen tests that cannot fail — the exact sin this file
  // was rejected for once already. What survives is the FACT the sweep was built on, which is
  // still true and still worth pinning. The lost guard is recorded as a Delivery Finding on
  // sw7-17: it is a real cost of the hitscan port, not an oversight.

  it('a TERRAIN-CRASH frame holds two ship points 87 apart — the teleport is real', () => {
    // THE CASE ROUND 1'S DOCSTRING GOT WRONG, and the reason `aimY: 0` was never a harmless
    // convenience. Diving from just inside the floor of the band trips the crash bump, which
    // does not ease the ship up — it TELEPORTS it:
    //
    //     if (altitude < MIN_SKIM_ALTITUDE) altitude = SKIM_ALTITUDE   // 40 -> 128
    //
    // so the frame's two ship points sit 87 apart (88 firing from exactly 40) — NOT the "one
    // frame of climb (<= ALTITUDE_RATE * dt)" = 3.33 the docstring claimed, and not "three
    // orders under" anything. The pilot aimed from 41; his shot leaves from 41. The teleport is
    // the same frame's business, and it is not the gun's.
    //
    // The gun half of that sentence is no longer assertable (see this section's header — the
    // beam leaves no object to read a spawn point from). The DISTANCE half is, and it is the
    // load-bearing fact: it is what makes "which ship point?" a real question rather than a
    // rounding error, and it is what round 1's docstring got wrong by a factor of 26.
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

  it('a NaN yoke cannot make the pilot immortal — the ship point stays a real place', () => {
    // sw7-16 made NaN LOAD-BEARING, and that is the only reason this test exists. Before the
    // story, the hit sphere sat on the constant COCKPIT and the fire velocity came from
    // `toCockpit` — both finite, so a NaN altitude could not reach either. Now both are centred
    // on the ship, and `stepSurface`'s clamps are all `<`/`>`, which are FALSE for NaN: a NaN
    // would slip every one of them, make `collides(pos, [0, NaN, 0], r)` false forever, and the
    // pilot would go quietly invulnerable — with NaN absorbing, so altitude never recovers.
    // Failing OPEN is strictly worse than the bug this story fixed. Reachable via `input.ts`'s
    // `0/0` on a zero-height canvas rect (the yoke listener is on `window`, not the canvas).
    const s0 = surface({
      altitude: MIN_SKIM_ALTITUDE,
      enemyShots: [{ pos: [0, PROBE_Y, 0], vel: [0, 0, 0], ttl: 5 }],
      lives: 3,
    })
    const s = stepGame(s0, trigger({ fire: false, aimY: NaN }), DT)

    expect(s.altitude, 'a NaN yoke must not poison the ship point').toBe(SKIM_ALTITUDE)
    expect(Number.isNaN(s.altitude)).toBe(false)
    // The pilot is still mortal: the fireball at PROBE_Y is inside the sphere around the reset
    // ship (|100 − 128| = 28 < 80), so it lands. A NaN-poisoned sphere would have missed it.
    expect(s.events.filter((e) => e.type === 'player-death' && e.cause === 'turret')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// (e) The blast radius. R11a moves the SURFACE and nothing else.
// ---------------------------------------------------------------------------

describe('sw7-16 — the other phases do not move', () => {
  it('space still fires from the fixed cockpit at the origin', () => {
    // `altitude` is a live field in every phase — it rides in state through space. If the ship
    // point is applied globally instead of per-phase, space's beam is cast from [0, 238, 0] and
    // space's aim breaks the way the surface's is broken now. (Read through `shipPoint` rather
    // than a spawned bolt since sw7-17: the hitscan gun leaves nothing behind to read.)
    const s0: GameState = {
      ...enterPhase(initialState(1983), 'space'),
      mode: 'playing',
      altitude: MAX_SKIM_ALTITUDE,
      projectiles: [],
      fireCooldown: 0,
    }
    expect(shipPoint(s0)).toEqual([0, 0, 0])
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
    expect(shipPoint(s0)).toEqual([...s0.trenchView])
  })
})
