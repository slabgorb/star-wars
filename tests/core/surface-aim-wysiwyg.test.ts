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
// == WHY THE KILL TEST FLIES AT MAX_SKIM_ALTITUDE =============================
//
// This is the detail that let the bug ship, and it is worth stating plainly. Aiming at a
// tower's base from altitude A, the buggy bolt arrives ~0.952·A BELOW it, and the hit
// sphere is TURRET_HIT_RADIUS = 200 centred on that base. So the miss only becomes a MISS
// once 0.952·A > 200, i.e. A > ~210. At the nominal SKIM_ALTITUDE of 128 the parallax
// hides INSIDE the hit radius and a kill-test still passes — green, with the gun bolted
// to the floor. Only the top of the flight band (MAX_SKIM_ALTITUDE = 238 -> ~227 low)
// puts the bolt outside the sphere.
//
// A kill-test alone therefore under-describes the defect; the muzzle-position tests are
// what pin it at EVERY altitude. Both are here on purpose.

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
import { FOV_Y } from '../../src/core/gameRules'
import { sub, scale, normalize, IDENTITY, type Vec3 } from '@arcade/shared/math3d'
import type { Input } from '../../src/core/input'

const DT = 1 / 60
const ASPECT = 16 / 9
const ORIGIN: Vec3 = [0, 0, 0]

/**
 * Where a target at world `p` lands on screen, in NDC, seen from `eye` — i.e. exactly
 * where the player puts the crosshair. This inverts the SAME projection the crosshair is
 * drawn under (`gameRules`: `aimDirection` / `crosshairNdc`), so "aim at it" means what it
 * says. Lifted from the trench's sw5-6 suite (`trench-aim-wysiwyg.test.ts`) — same job,
 * other phase.
 *
 * The yoke clamps to [-1, 1]; |NDC| > 1 means the player cannot point at the target at all.
 */
function crosshairOn(p: Vec3, eye: Vec3): { aimX: number; aimY: number; reachable: boolean } {
  const f = 1 / Math.tan(FOV_Y / 2)
  const [dx, dy, dz] = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]
  const depth = -dz
  const aimX = (f * dx) / depth / ASPECT
  const aimY = (f * dy) / depth
  return { aimX, aimY, reachable: Math.abs(aimX) <= 1 && Math.abs(aimY) <= 1 }
}

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

/** The pilot's eye on the surface, in world space — what `render.ts cameraView` builds. */
const flyingEye = (s: GameState): Vec3 => [0, s.altitude, 0]

/** Yoke at rest, trigger down. aimY = 0 matters: on the surface the yoke's vertical axis
 *  ALSO flies the ship (`altitude += aimY · ALTITUDE_RATE · dt`), so a level stick is the
 *  only way to fire at a known, unchanging altitude. */
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
    // The design's own acceptance sentence. `flyingEye` is what render.ts's `cameraView`
    // builds its view matrix from; the bolt must leave from THERE. Sight-line and bolt
    // axis are coaxial only if these two points are the same point.
    const s0 = surface({ altitude: 173 }) // an arbitrary in-band height, not a constant
    const s = stepGame(s0, trigger(), DT)

    expect(s.projectiles[0].pos).toEqual(flyingEye(s0))
  })
})

// ---------------------------------------------------------------------------
// (b) Fire the gun. What the player actually reported.
// ---------------------------------------------------------------------------

describe('sw7-16 — what you aim at is what you hit (surface towers)', () => {
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
      s = stepGame(s, i === 0 ? yoke : { ...yoke, fire: false }, DT)
      if (s.events.some((e) => e.type === 'enemy-death' && e.enemyType === 'turret')) return true
      if (s.turrets.length === 0) return false // scrolled past — never hit
    }
    return false
  }

  it('DESTROYS a tower the crosshair is on, flying at the top of the band', () => {
    // The discriminating case (see the header): at MAX_SKIM_ALTITUDE the parallax puts the
    // buggy bolt ~227 below the base — outside TURRET_HIT_RADIUS = 200 — so this is a real
    // miss, not a near one. Dead ahead (x = 0), so Defect 2's lateral lead cannot confound it.
    const tower: Vec3 = [0, 0, -4000]
    const s0 = surface({ altitude: MAX_SKIM_ALTITUDE, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

    const aim = crosshairOn(tower, flyingEye(s0))
    expect(aim.reachable, `the tower needs aim (${aim.aimX.toFixed(2)}, ${aim.aimY.toFixed(2)})`).toBe(true)

    expect(
      fireOnce(s0, trigger({ aimX: aim.aimX, aimY: aim.aimY })),
      'the bolt must go where the crosshair points',
    ).toBe(true)
  })

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
// (c) Incoming. The fireball target and the hit-test share the same ship point.
// ---------------------------------------------------------------------------

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
    const muzzle: Vec3 = [tower[0], tower[1] + TOWER_HEIGHT, tower[2] + TURRET_SCROLL_SPEED * DT]
    const atShip = scale(normalize(sub(flyingEye(s0), muzzle)), ENEMY_SHOT_SPEED)
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

  it('still costs a shield when the ship flies down ONTO a floor-level fireball', () => {
    // The hit-test must MOVE, not merely move AWAY. Sitting at MIN_SKIM_ALTITUDE = 40, a shot
    // at [0, 40, 0] is a hit; the same shot is not a hit from the band ceiling. Both directions
    // of the same invariant, so "ignore everything near the origin" cannot pass.
    const s0 = surface({
      altitude: MIN_SKIM_ALTITUDE,
      enemyShots: [{ pos: [0, MIN_SKIM_ALTITUDE, 0], vel: [0, 0, 0], ttl: 5 }],
    })
    const s = stepGame(s0, trigger({ fire: false }), DT)

    // This fixture only means anything while the band's floor sits INSIDE the cockpit's hit
    // sphere — that is what makes the same shot a hit down low and a miss up high. If either
    // constant is ever retuned past the other, fail loudly here rather than quietly passing
    // for the wrong reason.
    expect(MIN_SKIM_ALTITUDE).toBeLessThan(COCKPIT_HIT_RADIUS)
    expect(s.events.filter((e) => e.type === 'player-death' && e.cause === 'turret')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// (d) The blast radius. R11a moves the SURFACE and nothing else.
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
