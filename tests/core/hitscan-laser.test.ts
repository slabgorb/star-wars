// tests/core/hitscan-laser.test.ts
//
// Story sw7-17 / R11b — RED (Han Solo / TEA). The player laser is a HITSCAN beam.
//
// == WHY THIS FILE EXISTS =====================================================
//
// Live report, 2026-07-16 (wave-1 surface): "towers are way too far away, it is nearly
// impossible to hit them." R11a (sw7-16) fixed one half of that — the gun now leaves from
// the ship instead of the floor. This is the other half, and it is the one that survives
// a correct muzzle.
//
// Ours flies a 12,000 u/s projectile with a 3 s lifetime. While the bolt is in the air the
// field closes on the cockpit at TURRET_SCROLL_SPEED, so bolt and target meet at fraction
// `bolt/(bolt+closing)` of the ray — and the bolt crosses the target's plane at that same
// fraction of its LATERAL offset. The error is therefore proportional to |x|, and it is a
// CONSTANT fraction, so no amount of aiming fixes it:
//
//     closing 600 u/s (today)      lead 4.8 %   -> dead-on misses past |x| ~ 4,100
//     closing 5,250 u/s (sw7-18)   lead 30 %    -> everything off-centre
//     closing 21,000 u/s (ROM cap) lead 64 %    -> everything
//
// That is why G-004's audit-time `wont_fix` was RE-RULED to `fix` by the Jedi on 2026-07-16:
// sw7-18's authentic surface speeds and sw7-6's ~15,750 u/s trench scroll (which simply
// OUT-RUNS a 12,000 u/s bolt) are both unreachable while the gun throws a projectile. The
// finding argued for keeping the modernisation; the coupling to two blocked stories is the
// new fact that overturns it.
//
// == WHAT THE ROM ACTUALLY DOES (verified at source, not from the finding) =====
//
// `~/Projects/star-wars-1983-source-text/WSLAZR.MAC`. `.RADIX 16` — bare immediates are HEX.
//
//   * The laser is HITSCAN. There is no travelling player shot and no lifetime anywhere in
//     the module. Beams are drawn gun-ports -> site each frame (VWLAZ, :149).
//
//   * Collision resolves INSTANTLY against the NEAREST object under the site. CLSLZ (:763):
//
//         LDA LZ.ON
//         IFNE                    ;?ARE LAZARS ON?
//         LDD CL.GDS              ;CHECK ALIEN GUNS FIRST
//         IFPL                    ;?VALID GUN POSSIBILITY?
//         SUBD CL.ADS             ;CHECK AGAINST ALIEN DISTANCE
//         BLO HTSG                ;B IF CLOSER, THEN HIT THE GUN
//         BRA HTSA                ;J ELSE VALID ALIEN IS CLOSER
//
//     i.e. min(CL.GDS, CL.ADS) — nearest wins. CLGLZ (:707) is the ground twin, CLBLZ (:391)
//     the trench one.
//
//   * "Under the site" is recorded during the object draw, not by a sphere in the world. Each
//     object tests the site against its own PROJECTED SIZE and keeps the nearest (WSGUNS.MAC
//     :938-948): a box test, then `LDD TMPSIZ / LSRD / ADDD TMPSIZ ;MAKE 1.5 FOR OCTAGON`,
//     then `LDD M.XT ;THEN SEE IF WE ARE THE CLOSEST ALIEN / CMPD CL.GDS / IFLO / STD CL.GDS`.
//     The clone's world-space equivalent is exact and needs no new constant: the aim RAY from
//     the eye passes within the object's existing hit radius, and of those, the nearest along
//     the ray wins. Same predicate, same radii (TURRET_HIT_RADIUS &c.), pure Math Box.
//
//   * The distances are cleared to "none" every frame (:137-141, `LDA #0FF / STA CL.ADS ...`),
//     so a hit is decided fresh each frame from what is under the site RIGHT NOW.
//
// == WHAT THIS FILE DOES NOT TOUCH ============================================
//
//   * The 8-frame LZ.EDG sweep window is `laser-sweep.test.ts`. Every shot below is fired on
//     a single frame and measured on that frame, so the window's length cannot affect it.
//   * ENEMY FIREBALLS STAY PROJECTILES — authentic; they are real travelling objects in the
//     ROM. Section (e) is the guard that keeps them that way, and it is GREEN today.
//   * G-007 (four-gun LZ.ALT alternation) and G-008 (the LZ.HIT hit-picture) live in this same
//     ROM module and are NOT ported here — see `tests/audit/sw7-17-remediation.test.ts`.
//   * The trench torpedo latch (G-005/G-006) is untouched.
//
// == WHICH TESTS BELOW ACTUALLY DISCRIMINATE, AND WHY =========================
//
// Stated plainly and CHECKED BY RUNNING THEM, because taking unearned credit is what got sw7-16
// rejected once already. Every "kill" assertion here fires on ONE frame and measures that frame,
// so today they are red for a single shared reason — the bolt has flown 200 units by then and is
// nowhere near anything. That is the instant-resolve half of the story doing the work, NOT the
// lead-fraction half. Where a test's headline reason is not the reason it is currently red, it
// says so rather than implying it caught something it did not:
//
//   (a) RED. Instant resolve, straightforwardly.
//   (b) RED, both offsets — but only |x| = 6,000 is a LEAD test. At |x| = 2,000 the lead error
//       is ~97 units, inside TURRET_HIT_RADIUS, so a projectile fired there lands (measured:
//       it kills at t = 0.81 s if you let it fly). It is axis coverage that happens to be red
//       today for reason (a). Only the 6,000 case is unreachable at ANY time by a projectile.
//   (c) RED for reason (a). Its real job is forward: the list is written FAR-FIRST so a resolver
//       that takes list order — or the farthest — fails. Given time to fly, today's bolt does
//       reach the near tower first and is spent on it, so this is not a regression guard.
//   (d) RED for reason (a). Its real job is forward too, and it is the sharpest trap in the
//       story: the nearest-object-under-the-reticle machinery the old lock-on ring used
//       (`lockedEnemy` / `isLocked`, removed in sw7-21) was exactly CLSLZ — except it measured
//       from the WORLD ORIGIN (`length(e.pos)`, and a `transform(perspective…, pos)` that assumed
//       the camera at the origin) and was space-only. True in space, false on the surface. Reused
//       unchanged the beam resolves from the floor `altitude` below the pilot, and R11a's
//       parallax walks straight back in under a new name.
//   (e) GREEN TODAY and must stay green — the one true regression guard in the file.
//   (f) The inside probe is RED for reason (a). The outside probe is GREEN TODAY, and NOT
//       because of any clip: measured, today's bolt ALIASES past it. See the note in (f).

import { describe, it, expect } from 'vitest'
import { stepGame, enterPhase } from '../../src/core/sim'
import {
  initialState,
  SKIM_ALTITUDE,
  MAX_SKIM_ALTITUDE,
  TURRET_HIT_RADIUS,
  TURRET_SCROLL_SPEED,
  PROJECTILE_SPEED,
  ENEMY_SHOT_SPEED,
  TOWER_HEIGHT,
  TICK_HZ,
  EXHAUST_PORT_DISTANCE,
  type GameState,
} from '../../src/core/state'
import { TRENCH_FAR } from '../../src/core/trench-channel'
import { aimAt, eyeOf, fireAt } from '../support/aim'
import { length, sub, add, scale, normalize, type Vec3 } from '@arcade/shared/math3d'
import type { Input } from '../../src/core/input'

const DT = 1 / 60
const ASPECT = 16 / 9

/**
 * A surface run with an EMPTY, already-laid maze — `surfaceMazeLaid: true` stops `stepSurface`
 * laying `mazeForWave(wave)` over the fixture, so each test faces only the objects it asked for.
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
 * A trench run with nothing in it but what the fixture places. `enterPhase(…, 'trench')` SPAWNS
 * a fresh obstacle field (`sim.ts:1137`), so both overrides are load-bearing: without them the
 * spawner's own squares sit under the site and shadow the probe.
 */
const trench = (over: Partial<GameState> = {}): GameState => ({
  ...enterPhase(initialState(1983), 'trench'),
  mode: 'playing',
  exhaustPort: null,
  trenchObstacles: [],
  projectiles: [],
  enemyShots: [],
  fireCooldown: 0,
  ...over,
})

const trigger = (over: Partial<Input> = {}): Input => ({
  aimX: 0,
  aimY: 0,
  fire: true,
  aspect: ASPECT,
  ...over,
})

const towerDied = (s: GameState): boolean =>
  s.events.some((e) => e.type === 'enemy-death' && e.enemyType === 'turret')

/**
 * Every tower fixture below is seated at the PILOT'S OWN HEIGHT rather than on the floor.
 *
 * That is deliberate and it is not cosmetic: on the surface the yoke's vertical axis is also the
 * THROTTLE (`altitude += aimY · ALTITUDE_RATE · dt`, sim.ts:490). Aiming DOWN at a floor-level
 * tower therefore flies the ship while the shot is being measured, and at the floor of the band
 * it trips the terrain-crash bump. Level with the pilot, dead-on aim is purely lateral, `aimY`
 * stays 0, and the ship cannot move during the measurement — so what is measured is the gun.
 * The sim never reads a turret's height for anything but the collision itself.
 */
const EYE_HIGH = SKIM_ALTITUDE

// ---------------------------------------------------------------------------
// (a) The beam does not travel. The kill is on the trigger frame.
// ---------------------------------------------------------------------------

describe('sw7-17 — the player laser resolves INSTANTLY (no travelling bolt)', () => {
  it('kills a tower 20,000 units out on the FIRING FRAME', () => {
    // A projectile needs 20000/12000 = 1.67 s to cover this. A hitscan beam needs no time at
    // all: it is drawn gun->site and resolved in the same frame it is fired. At DT the old
    // bolt has flown 200 units when this assertion runs — 1 % of the way.
    const tower: Vec3 = [0, EYE_HIGH, -20000]
    const s0 = surface({ altitude: EYE_HIGH, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

    // Dead ahead AND level with the eye, so the yoke is at rest and dead-on at once.
    const s = stepGame(s0, trigger(), DT)

    expect(towerDied(s), 'the beam reaches it the moment the trigger goes down').toBe(true)
  })

  it('leaves NO bolt in flight — there is no travelling shot left to lead with', () => {
    // The other half of "instant": not merely that the kill is early, but that the projectile
    // is GONE. `projectiles` is the player's list alone (enemy fire lives in `enemyShots`), so
    // an empty list after a trigger frame is exactly the ROM's "no travelling player shot".
    const s0 = surface({ altitude: EYE_HIGH, turrets: [] })
    const s = stepGame(s0, trigger(), DT)

    expect(s.projectiles, 'the hitscan gun spawns nothing that flies').toHaveLength(0)
  })

  it('kills at 20,000 without the range a lifetime would impose', () => {
    // PROJECTILE_TTL = 3 s × 12,000 u/s put a ~36,000-unit wall on the gun. The ROM has no
    // lifetime in the laser module at all; on the ground path (CLGLZ) there is no forward clip
    // either — only the TRENCH clips, and that is section (f). Fire at the far edge of the
    // authored field ($7C00 = 31,744) and it must still land.
    const tower: Vec3 = [0, EYE_HIGH, -31744]
    const s0 = surface({ altitude: EYE_HIGH, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })
    const s = stepGame(s0, trigger(), DT)

    expect(towerDied(s), 'the ground beam has no lifetime and no forward clip').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// (b) THE HEADLINE. The lead fraction is gone.
// ---------------------------------------------------------------------------

describe('sw7-17 — a dead-on shot hits, however far off-axis the tower is', () => {
  // The arithmetic these two tests are built on, at depth 10,000 with today's 600 u/s scroll.
  // Miss distance ≈ |x| · (L·c)/(L·c + b·d) with L = |tower − eye|, c = closing, b = bolt:
  //
  //     |x| = 2,000  ->  miss ~97   INSIDE TURRET_HIT_RADIUS (200) — kills either way
  //     |x| = 6,000  ->  miss ~331  OUTSIDE — the projectile CANNOT land this shot
  //
  // Both are reachable on the yoke at this depth (|aimX| = 0.19 and 0.58), so neither is
  // hiding behind an un-aimable target.

  it('DESTROYS a tower 6,000 units off-axis that a projectile physically cannot reach', () => {
    // THE POINT OF THE STORY. The bolt crosses this tower's plane 331 units inside of it —
    // every frame, at every aim, for ever. Dead-on is not good enough for a travelling shot
    // when the world is closing; it is exactly good enough for a beam.
    const tower: Vec3 = [6000, EYE_HIGH, -10000]
    const s0 = surface({ altitude: EYE_HIGH, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

    const aim = aimAt(tower, eyeOf(s0), ASPECT)
    expect(aim.reachable, `the yoke must be able to point here (${aim.aimX.toFixed(2)})`).toBe(true)
    expect(aim.aimY, 'level with the eye — the throttle stays still').toBeCloseTo(0, 10)

    const s = stepGame(s0, trigger({ aimX: aim.aimX, aimY: aim.aimY }), DT)

    expect(towerDied(s), 'what the crosshair covers, the beam hits').toBe(true)
  })

  it('the fixture is honest: the projectile really does fall short by more than a hit radius', () => {
    // A guard on the guard. If a retune of PROJECTILE_SPEED / TURRET_SCROLL_SPEED / the hit
    // radius ever closed this gap, the test above would start passing for the wrong reason and
    // silently stop describing anything. Derive the miss from the constants themselves and fail
    // loudly here instead.
    const eye: Vec3 = [0, EYE_HIGH, 0]
    const tower: Vec3 = [6000, EYE_HIGH, -10000]
    const d = -tower[2]
    const L = length(sub(tower, eye))
    const miss = Math.abs(tower[0]) * ((L * TURRET_SCROLL_SPEED) / (L * TURRET_SCROLL_SPEED + PROJECTILE_SPEED * d))

    expect(miss, 'the travelling bolt must genuinely miss, or (b) proves nothing').toBeGreaterThan(
      TURRET_HIT_RADIUS,
    )
  })

  it('axis coverage: a tower 2,000 off-axis dies too', () => {
    // NOT a lead test, and this file does not claim it as one. The lead error at this offset is
    // ~97 units — inside TURRET_HIT_RADIUS — so a projectile fired here DOES land (measured: it
    // kills at t = 0.81 s given room to fly). It is red today only because it is measured on the
    // firing frame, i.e. for the instant-resolve reason every test in (a) is red. It is here so
    // that "dead-on hits" is asserted across the axis and not only at the offset that breaks.
    const tower: Vec3 = [2000, EYE_HIGH, -10000]
    const s0 = surface({ altitude: EYE_HIGH, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

    const aim = aimAt(tower, eyeOf(s0), ASPECT)
    const s = stepGame(s0, trigger({ aimX: aim.aimX, aimY: aim.aimY }), DT)

    expect(towerDied(s)).toBe(true)
  })

  it('still misses what the crosshair is NOT on — the beam is not an auto-aim', () => {
    // The other half of WYSIWYG, and the thing a "nearest object anywhere ahead" resolver
    // would break. The tower is 6,000 off-axis; the yoke is centred, pointing at empty sky.
    const tower: Vec3 = [6000, EYE_HIGH, -10000]
    const s0 = surface({ altitude: EYE_HIGH, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

    const s = stepGame(s0, trigger(), DT)

    expect(towerDied(s), 'a centred crosshair must not kill a tower 6,000 to the right').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (c) CLSLZ: min(CL.GDS, CL.ADS). The nearest thing under the site, and only it.
// ---------------------------------------------------------------------------

describe('sw7-17 — the beam resolves against the NEAREST object under the site', () => {
  it('kills the near tower and spares the far one on the same ray', () => {
    // Both towers sit exactly on the aim ray, so both are under the site; only the near one may
    // die. This is red today for the instant-resolve reason (nothing at all dies on the firing
    // frame), NOT because today's build picks the wrong tower — given room to fly, the bolt
    // reaches the near one first and is spent on it, so "nearest wins" already holds.
    //
    // Its real work is forward. The list is written FAR FIRST, so a resolver that takes the
    // first match in list order — or the farthest — fails here, and both are easy to write.
    const far: Vec3 = [0, EYE_HIGH, -8000]
    const near: Vec3 = [0, EYE_HIGH, -3000]
    const s0 = surface({
      altitude: EYE_HIGH,
      turrets: [
        { pos: [...far] as Vec3, age: 0 },
        { pos: [...near] as Vec3, age: 0 },
      ],
    })

    const s = stepGame(s0, trigger(), DT)

    const deaths = s.events.filter((e) => e.type === 'enemy-death' && e.enemyType === 'turret')
    expect(deaths, 'exactly one object resolves per frame — CL.GDS holds ONE winner').toHaveLength(1)

    // Identify the survivor by depth rather than by index: the list is rebuilt each step.
    expect(s.turrets, 'the far tower must survive').toHaveLength(1)
    expect(s.turrets[0].pos[2], 'the SURVIVOR is the far one — the near one took the beam').toBeLessThan(
      -7000,
    )
  })
})

// ---------------------------------------------------------------------------
// (d) The beam leaves the SHIP. R11a's point, carried into R11b's model.
// ---------------------------------------------------------------------------

describe('sw7-17 — the beam is cast from the ship point, not the world origin', () => {
  it('hits a near, low tower the pilot is diving at from the top of the band', () => {
    // Red today for the instant-resolve reason, like everything else in (a) — given room to fly,
    // today's bolt lands this shot at t = 0.07 s, because sw7-16 already put the MUZZLE on the
    // eye. So this is not a regression guard; it is a FORWARD guard, and it is the sharpest one
    // in the file: R11b must put the RESOLVE on the eye too — the ray is cast from the ship point.
    //
    // The trap is concrete: `lockedEnemy`/`isLocked` (the old lock-on ring's selector, removed in
    // sw7-21) answered "nearest object under the reticle", which is exactly CLSLZ — but they
    // measured from the WORLD ORIGIN (`length(e.pos)`, and a raw `transform(perspective…, pos)`
    // that assumed the camera at the origin). True in space, false on the surface. Reused
    // unchanged, the beam would resolve from the floor `altitude` below the pilot and R11a's
    // parallax comes straight back.
    //
    // The fixture makes that distinction bite. Flying at the band ceiling (238) against a
    // tower 800 out on the floor, the aim ray from the EYE passes through the tower; the same
    // ray cast from the ORIGIN passes ~228 away — outside TURRET_HIT_RADIUS (200).
    const tower: Vec3 = [0, 0, -800]
    const s0 = surface({ altitude: MAX_SKIM_ALTITUDE, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })

    const aim = aimAt(tower, eyeOf(s0), ASPECT)
    expect(aim.reachable, 'the pilot can point at it').toBe(true)

    const s = stepGame(s0, trigger({ aimX: aim.aimX, aimY: aim.aimY }), DT)

    expect(towerDied(s), 'the ray is cast from the pilot, not from the floor beneath him').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// (e) Enemy fireballs STAY projectiles. Authentic — and the thing most at risk.
// ---------------------------------------------------------------------------

describe('sw7-17 — enemy fire is still a real travelling object', () => {
  // GREEN TODAY, and the whole point is that it stays that way. The ROM's fireballs ARE
  // travelling objects; only the player's laser is hitscan. `advance()` (sim.ts:1223) is shared
  // between the player's bolts and surface/trench enemy fire, so deleting the player projectile
  // is a CALLER deletion — the function itself must survive. These are the tests that notice if
  // it does not.

  it('a tower fireball travels, frame over frame, at ENEMY_SHOT_SPEED', () => {
    const tower: Vec3 = [0, 0, -2000]
    const s0 = surface({
      altitude: SKIM_ALTITUDE,
      turrets: [{ pos: [...tower] as Vec3, age: 10 }], // long past TOWER_FIRE_GRACE
      enemyFireCooldown: 0,
    })
    const s1 = stepGame(s0, trigger({ fire: false }), DT)
    expect(s1.enemyShots, 'the armed tower fires').toHaveLength(1)

    const p0 = s1.enemyShots[0].pos
    const s2 = stepGame(s1, trigger({ fire: false }), DT)
    expect(s2.enemyShots, 'and the shot is still in the air a frame later').toHaveLength(1)
    const p1 = s2.enemyShots[0].pos

    // It MOVED — a hitscan conversion that swept up enemy fire would leave it parked.
    expect(length(sub(p1, p0)), 'the fireball flies; it does not resolve instantly').toBeCloseTo(
      ENEMY_SHOT_SPEED * DT,
      3,
    )
    expect(s2.enemyShots[0].ttl, 'and it still burns a lifetime down').toBeLessThan(s1.enemyShots[0].ttl)
  })

  it('the fireball still launches from the tower cap and flies AT the ship (sw7-16 stands)', () => {
    const tower: Vec3 = [0, 0, -2000]
    const s0 = surface({
      altitude: MAX_SKIM_ALTITUDE,
      turrets: [{ pos: [...tower] as Vec3, age: 10 }],
      enemyFireCooldown: 0,
    })
    const s = stepGame(s0, trigger({ fire: false }), DT)

    expect(s.enemyShots).toHaveLength(1)
    expect(s.enemyShots[0].pos[1], 'it leaves the white cap at TOWER_HEIGHT').toBeCloseTo(
      tower[1] + TOWER_HEIGHT,
      6,
    )

    // Aimed at the SHIP — which here means aimed DOWNWARD. The white cap stands at TOWER_HEIGHT
    // (352) and the pilot cruises at MAX_SKIM_ALTITUDE (238), so the tower shoots down at him.
    // Assert the DIRECTION rather than a sign: "it climbs toward the pilot" is simply false at
    // this altitude, and a sign test would also pass for a shot aimed at the floor.
    const muzzle: Vec3 = [tower[0], tower[1] + TOWER_HEIGHT, tower[2] + TURRET_SCROLL_SPEED * DT]
    const toShip = normalize(sub(eyeOf(s), muzzle))
    const flown = normalize(s.enemyShots[0].vel)
    expect(flown[0]).toBeCloseTo(toShip[0], 6)
    expect(flown[1]).toBeCloseTo(toShip[1], 6)
    expect(flown[2]).toBeCloseTo(toShip[2], 6)
    expect(toShip[1], 'the cap stands ABOVE the pilot, so "at the ship" is downward').toBeLessThan(0)
  })

  it('a space TIE fireball still HOMES by the 7/8-per-tick decay (sw4-2 stands)', () => {
    // The space fireball's motion is not `advance` at all but `homeShots` (sim.ts:1244) — the
    // ROM's decay law. Pinned here because "make the player laser hitscan" is the kind of change
    // that invites a sweep through everything in the file that looks like a shot.
    const s0: GameState = {
      ...enterPhase(initialState(1983), 'space'),
      mode: 'playing',
      enemies: [],
      enemyShots: [{ pos: [0, 0, -4000], vel: [0, 0, 0], ttl: 5 }],
      fireCooldown: 0,
    }
    const s = stepGame(s0, trigger({ fire: false }), DT)

    expect(s.enemyShots, 'the incoming shot survives the frame').toHaveLength(1)
    const decay = Math.pow(7 / 8, DT * TICK_HZ)
    expect(s.enemyShots[0].pos[2], 'it decays toward the cockpit, un-shot').toBeCloseTo(-4000 * decay, 6)
  })
})

// ---------------------------------------------------------------------------
// (f) CLBLZ: the trench beam is clipped to $7000 forward.
// ---------------------------------------------------------------------------

describe('sw7-17 — the trench beam is clipped to 28,672 units forward (CLBLZ)', () => {
  // ROM, WSLAZR.MAC:417 inside CLBLZ — the far endpoint the trench beam is built against:
  //
  //     10$:
  //         LDD #7000               ;FARTHEST FORWARD POINT
  //         ADDD M$TX+M.U1
  //         STD TMPTX
  //
  // $7000 = 28,672. The clone already carries the constant, ROM-anchored, as the channel's
  // draw cull (`TRENCH_FAR`, trench-channel.ts:72) — the beam clip is the same number and must
  // read it rather than re-typing 28672.
  //
  // The probes straddle the line, and the margin is RE-DERIVED off the ROM scroll speed
  // (sw7-6 / B-008): a trench object advances $300 = 768 units per game frame, and the
  // laser holds a LZ.EDG sweep for 8 game frames, so an obstacle scrolls 768 × 8 = 6,144
  // units closer while the beam is on — the TICK_HZ cancels, so this is exact and
  // frame-rate independent. (At the old invented 500 u/s it was only ~195 units, which is
  // why MARGIN = 400 used to be safe and now is not — re-derived, not relabelled.) A probe
  // nearer the boundary than the sweep scroll would cross it mid-sweep and the test would
  // measure the scroll instead of the clip, so the margin sits comfortably past 6,144.
  const SWEEP_SCROLL = 0x300 * 8 // 6,144 — $300/frame × the 8-frame LZ.EDG sweep
  const MARGIN = SWEEP_SCROLL + 400
  const obstacleDied = (s: GameState): boolean =>
    s.events.some((e) => e.type === 'trench-obstacle-destroyed')

  it('destroys a square JUST INSIDE the clip, on the firing frame', () => {
    const s0 = trench({
      trenchObstacles: [{ kind: 'square', pos: [0, 0, -(TRENCH_FAR - MARGIN)] }],
    })
    // The pilot's seat and the probe share a height, so dead-on is the yoke at rest.
    const aim = aimAt([0, 0, -(TRENCH_FAR - MARGIN)], eyeOf(s0), ASPECT)
    const s = stepGame(s0, trigger({ aimX: aim.aimX, aimY: aim.aimY }), DT)

    expect(obstacleDied(s), '28,272 is inside $7000 — the beam reaches it at once').toBe(true)
  })

  it('NEVER destroys a square just OUTSIDE the clip, however long the pilot waits', () => {
    // GREEN TODAY, AND NOT BECAUSE OF ANY CLIP — there is none. Measured on this build: the
    // 28,272 probe dies at t = 2.25 s and the 29,072 one never dies at all. The old bolt has
    // ~36,000 units of reach and comfortably covers both, so the difference is not range. It is
    // ALIASING: the bolt advances 200 units per frame (12,000 u/s × 1/60) and is tested as a
    // POINT against a 90-unit sphere (`collides`, sim.ts:750), so whether it registers depends
    // on where the frame grid happens to land relative to the target. At range that is a coin
    // flip — which is its own pre-existing defect, recorded as a Delivery Finding on the session
    // and incidentally cured by hitscan, since an exact ray cannot alias.
    //
    // So this test is a pure FORWARD guard and claims nothing else: it goes red the moment the
    // beam lands without the clip, which is the one way this AC can be missed.
    const startZ = -(TRENCH_FAR + MARGIN)
    const s0 = trench({ trenchObstacles: [{ kind: 'square', pos: [0, 0, startZ] }] })
    const aim = aimAt([0, 0, startZ], eyeOf(s0), ASPECT)

    // One trigger frame, then coast with the trigger RELEASED for the WHOLE life of the probe
    // in the channel — comfortably past the LZ.EDG sweep, so "it never dies TO THE BEAM" is a
    // claim about the model, not the clock. RE-DERIVED for the ROM scroll (sw7-6 / B-008): at
    // 768 u/frame the probe scrolls the entire trench and out through the cockpit in ~135
    // frames, so it despawns by SCROLLING rather than lingering — the old 500 u/s speed left it
    // barely-moved and "still standing" after 240 frames, which is no longer true. What the
    // clip guarantees is unchanged: the beam is never built out to 29,072, so across every frame
    // it is on, the far probe takes no `trench-obstacle-destroyed` event; it simply flies past.
    let s = stepGame(s0, trigger({ aimX: aim.aimX, aimY: aim.aimY }), DT)
    let everDied = obstacleDied(s)
    for (let i = 0; i < 240 && !everDied; i++) {
      s = stepGame(s, trigger({ aimX: aim.aimX, aimY: aim.aimY, fire: false }), DT)
      everDied = everDied || obstacleDied(s)
    }

    expect(everDied, '29,072 is beyond $7000 — the beam is not built out that far').toBe(false)
    // It left the channel un-destroyed: it scrolled clear through the cockpit (despawn), never
    // took a beam kill. `everDied === false` above is the clip's teeth; this pins that its exit
    // was the harmless scroll-past, not a destruction the guard failed to see.
    expect(s.trenchObstacles, 'the far probe scrolled clear un-destroyed').toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// (g) The core stays the core.
// ---------------------------------------------------------------------------

describe('sw7-17 — the hitscan gun is pure and deterministic', () => {
  it('the same shot from the same state resolves identically', () => {
    const tower: Vec3 = [6000, EYE_HIGH, -10000]
    const build = (): GameState =>
      surface({ altitude: EYE_HIGH, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })
    const aim = aimAt(tower, eyeOf(build()), ASPECT)
    const shot = trigger({ aimX: aim.aimX, aimY: aim.aimY })

    const a = stepGame(build(), shot, DT)
    const b = stepGame(build(), shot, DT)

    expect(a.score).toBe(b.score)
    expect(a.turrets).toEqual(b.turrets)
    expect(a.events).toEqual(b.events)
  })

  it('does not mutate the state it was handed', () => {
    const tower: Vec3 = [0, EYE_HIGH, -20000]
    const s0 = surface({ altitude: EYE_HIGH, turrets: [{ pos: [...tower] as Vec3, age: 0 }] })
    const before = structuredClone(s0)

    stepGame(s0, trigger(), DT)

    expect(s0).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// (h) The trench ranks its TWO kinds of target against each other. CLSLZ, again.
// ---------------------------------------------------------------------------

describe('sw7-17 — obstacles and the exhaust port compete for ONE beam, by distance', () => {
  // FOUND IN REVIEW. The trench is the one phase holding two different kinds of thing the beam can
  // land on — wall obstacles, and the porthole that arms the torpedo. CLSLZ resolves exactly one
  // object per frame, the NEAREST, so they must be ranked against each other.
  //
  // The first cut asked "did the beam hit any obstacle?" (`beamObstacle < 0`) rather than "which
  // is nearer?", which let an obstacle standing BEHIND the port shadow it and silently refuse the
  // arming. It was unreachable with today's obstacle stations — they sit at y ∈ [768, 1280], all
  // above the floor, and the ray to a floor-mounted port descends below them beyond it — but
  // sw7-6 rebuilds this field on the B-010 panel grid and can trivially make it reachable.
  //
  // Both directions are pinned, because the naive fix for one is the bug in the other: rank the
  // port first and a NEAR obstacle stops stopping the beam.

  const PORT_Z = -EXHAUST_PORT_DISTANCE
  const port: Vec3 = [0, 0, PORT_Z]

  /** A trench with the port live at its spawn distance and whatever obstacles the test places. */
  const withPort = (obstacles: GameState['trenchObstacles']): GameState =>
    trench({ exhaustPort: { pos: [...port] as Vec3 }, trenchObstacles: obstacles })

  /** A point exactly on the beam's own ray, `factor` × as far out as the port. Built from the real
   *  aim so it is genuinely under the site rather than approximately so. */
  const onTheRay = (s: GameState, factor: number): Vec3 => {
    const eye = eyeOf(s)
    const dir = normalize(sub(port, eye))
    return add(eye, scale(dir, length(sub(port, eye)) * factor)) as Vec3
  }

  it('a FAR obstacle behind the port does not shadow it — the port is nearer, so the port arms', () => {
    const s0 = withPort([])
    const far = onTheRay(s0, 2.5) // same ray, two and a half times the distance
    const s = stepGame(withPort([{ kind: 'square', pos: far }]), fireAt(s0, port, ASPECT), DT)

    expect(s.portTorpedoArmed, 'the beam reaches the port first — distance decides').toBe(true)
    expect(
      s.events.some((e) => e.type === 'trench-obstacle-destroyed'),
      'and the beam is SPENT on the port: the far obstacle must survive, not die in the same frame',
    ).toBe(false)
  })

  it('a NEAR obstacle in front of the port DOES stop the beam — the obstacle is nearer', () => {
    // The other direction, and the reason the fix is a ranking rather than a re-ordering.
    const s0 = withPort([])
    const near = onTheRay(s0, 0.4) // same ray, well short of the port
    const s = stepGame(withPort([{ kind: 'square', pos: near }]), fireAt(s0, port, ASPECT), DT)

    expect(
      s.events.some((e) => e.type === 'trench-obstacle-destroyed'),
      'the near obstacle eats the beam',
    ).toBe(true)
    expect(s.portTorpedoArmed, 'so the port behind it is NOT armed this frame').toBe(false)
  })

  it('the control: with nothing in the way the same shot arms the port', () => {
    // Without this, the near-obstacle test above could pass for the wrong reason (a shot that
    // never arms anything).
    const s0 = withPort([])
    const s = stepGame(s0, fireAt(s0, port, ASPECT), DT)
    expect(s.portTorpedoArmed).toBe(true)
  })
})
