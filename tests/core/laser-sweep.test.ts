// tests/core/laser-sweep.test.ts
//
// Story sw7-17 / R11b — RED (Han Solo / TEA). The 8-frame LZ.EDG sweep (G-012).
//
// == WHAT THE ROM DOES ========================================================
//
// `~/Projects/star-wars-1983-source-text/WSLAZR.MAC:101-118`, verbatim. `.RADIX 16`, so the
// bare `#8` is 8 and the timebase is 20.508 Hz:
//
//     SEI                     ;***PREVENT POSSIBLE IRQ/MAINLINE INTERACTIONS
//     LDA VG.LON              ;GET ON SWITCH FROM IRQ
//     IFNE
//     INC LZ.ALT              ;EDGED ALTERNATION
//     CLR LZ.HIT              ;STOP THE HIT PICTURE, ALLOW SWEEPING LAZARS
//     LDB #8
//     STB LZ.EDG
//     CLR VG.LON              ;PREPARE IRQ FOR NEXT MAINLINE
//     ENDIF
//     LDA LZ.EDG
//     IFGT                    ;?HAVE AN EDG TO DETECT?
//     DEC LZ.EDG
//     STA LZ.ON               ;TURN ON LAZARS TOO
//     LDD VG.RSX              ;16 BIT REAL SITE VALUE, FOR LAZAR
//     STD LZ.RSX
//     …
//     ENDIF
//
// Four facts fall out of those eighteen lines, and this file pins all four:
//
//   1. A trigger LOADS the counter to 8 (`LDB #8 / STB LZ.EDG`). Eight game frames
//      ÷ 20.508 Hz ≈ 0.390 s.
//   2. The laser is ON — and therefore CAN HIT — for exactly those frames, and for no others.
//      `LZ.ON` is cleared at the top of the routine every frame (`LDA #0 / STA LZ.ON ;AND STOP
//      ALL LAZARS`, :98-99) and only re-set inside the `IFGT`. CLSLZ/CLGLZ/CLBLZ each open with
//      `LDA LZ.ON / IFNE ;?ARE LAZARS ON?` and return without resolving anything when it is 0.
//      The window IS the collision window.
//   3. It is RETRIGGERABLE. A fresh `VG.LON` reloads 8 unconditionally, mid-sweep or not.
//   4. THE SITE IS RE-LATCHED EVERY FRAME OF THE SWEEP, not frozen at the pull: `LDD VG.RSX /
//      STD LZ.RSX` sits INSIDE the `IFGT`. The beam tracks the reticle while it is on — which
//      is what `CLR LZ.HIT ;… ALLOW SWEEPING LAZARS` is talking about. That is the whole reason
//      this is called a sweep, and it is what every test below leans on: fire, then WALK THE
//      CROSSHAIR onto a target without touching the trigger again.
//
// == WHY THIS IS RED ==========================================================
//
// Today there is no window at all. The trigger spawns a bolt whose velocity is fixed at spawn,
// so moving the crosshair afterwards cannot steer it — a shot fired at empty sky is a shot
// wasted, for ever. Every "the target dies" assertion below is red; the "it does NOT die"
// assertions are bound-guards that are green today for the wrong reason and say so.
//
// == THE ONE THING THIS FILE DELIBERATELY DOES NOT ASSERT ======================
//
// G-012's title is "Player fire is EDGE-TRIGGERED with an 8-frame laser sweep; ours is a fixed
// 0.25 s auto-fire cooldown" — two divergences, not one. This story's scope is the SWEEP; the
// edge-vs-level half is left alone and every test below pulls the trigger for exactly one frame,
// which is well-defined under either firing model. That is not an oversight and there is a real
// consequence recorded as a Delivery Finding on the session: FIRE_INTERVAL (0.25 s) is SHORTER
// than the sweep (0.39 s), so a held trigger re-loads LZ.EDG before it can ever expire and the
// laser stays on for ever. The window is only observable because these tests let go of the
// trigger. Whether that is acceptable — and whether G-012 may honestly be stamped while the
// level-triggered auto-fire stands — is a ruling for the Jedi, not a thing to smuggle in here.

import { describe, it, expect } from 'vitest'
import { stepGame, enterPhase } from '../../src/core/sim'
import {
  initialState,
  SKIM_ALTITUDE,
  FIRE_INTERVAL,
  TICK_HZ,
  type GameState,
} from '../../src/core/state'
import { aimAt, eyeOf } from '../support/aim'
import type { Input } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const DT = 1 / 60
const ASPECT = 16 / 9

/** The ROM's `LDB #8`, in the clone's house idiom for a ROM frame count — the same shape as
 *  `ENEMY_SHOT_TTL = 64 / TICK_HZ` (state.ts:240). ≈ 0.390 s. Derived here rather than imported
 *  so this suite pins the DURATION the player can observe, and leaves the naming and the storage
 *  of the counter to Dev. */
const SWEEP_SECONDS = 8 / TICK_HZ

/** The pilot's height, and the height every probe tower is seated at, so that dead-on aim is
 *  purely lateral: on the surface `aimY` is also the throttle, and a stick held off-centre would
 *  fly the ship while the window is being timed. See hitscan-laser.test.ts for the full note. */
const EYE_HIGH = SKIM_ALTITUDE

/** A tower far enough off-axis that a centred-ish crosshair is nowhere near it. */
const TOWER: Vec3 = [6000, EYE_HIGH, -10000]

/** The crosshair on empty sky, hard over to the LEFT — the tower is 6,000 to the RIGHT. */
const SKY_AIM_X = -0.9

const surface = (over: Partial<GameState> = {}): GameState => ({
  ...enterPhase(initialState(1983), 'surface'),
  mode: 'playing',
  turrets: [{ pos: [...TOWER] as Vec3, age: 0 }],
  surfaceMazeLaid: true,
  projectiles: [],
  enemyShots: [],
  fireCooldown: 0,
  ...over,
})

const yoke = (aimX: number, fire: boolean): Input => ({ aimX, aimY: 0, fire, aspect: ASPECT })

const towerDied = (s: GameState): boolean =>
  s.events.some((e) => e.type === 'enemy-death' && e.enemyType === 'turret')

/**
 * Pull the trigger for ONE frame with the crosshair on empty sky, hold that dead aim (trigger
 * RELEASED) for `delaySeconds`, then walk the crosshair onto the tower for a single frame.
 *
 * Returns whether the tower died on the frame the crosshair arrived. The trigger is never touched
 * again after frame 0, so a kill can only be the still-open sweep resolving against the site it
 * re-latched this frame — ROM fact (4) above. It cannot be a fresh shot.
 */
function fireAtSkyThenLookAt(s0: GameState, delaySeconds: number): boolean {
  let s = stepGame(s0, yoke(SKY_AIM_X, true), DT)
  expect(towerDied(s), 'fixture: the sky shot must not hit the tower on the trigger frame').toBe(false)

  const holdFrames = Math.max(0, Math.round(delaySeconds / DT) - 1)
  for (let i = 0; i < holdFrames; i++) {
    s = stepGame(s, yoke(SKY_AIM_X, false), DT)
    expect(towerDied(s), 'fixture: nothing may die while the crosshair is on the sky').toBe(false)
  }

  const tower = s.turrets[0]
  expect(tower, 'fixture: the tower must still be standing when the crosshair arrives').toBeTruthy()
  // Aim at where it IS now — it has been scrolling toward the pilot the whole time.
  const aim = aimAt(tower.pos, eyeOf(s), ASPECT)
  s = stepGame(s, yoke(aim.aimX, false), DT)
  return towerDied(s)
}

// ---------------------------------------------------------------------------
// (a) The window exists, and it is the length the ROM says.
// ---------------------------------------------------------------------------

describe('sw7-17 — a trigger pull opens an 8-game-frame sweep (LZ.EDG)', () => {
  it('a target the crosshair reaches WELL INSIDE the window still dies — the trigger is not touched again', () => {
    // RED: today the frame-0 bolt is already streaking off to the left with its velocity locked
    // at spawn, and no amount of looking at the tower will bring it back.
    //
    // This also rules out a one-frame "instant" window: 0.8 × 0.390 = 0.312 s is nineteen sim
    // frames after the pull.
    expect(
      fireAtSkyThenLookAt(surface(), SWEEP_SECONDS * 0.8),
      'the sweep re-latches the site each frame while it is on',
    ).toBe(true)
  })

  it('a target the crosshair reaches AFTER the window does NOT die', () => {
    // The bound. Green today for the wrong reason (nothing ever dies from a sky shot), so this
    // is a guard on the NEW code and this file does not claim it as a regression test: what it
    // stops is a sweep that never closes, i.e. a laser that is simply always on once fired.
    //
    // 1.2 × 0.390 = 0.468 s. Together with the test above the pair brackets the window to
    // roughly 7-9 game frames: a 6-frame window (0.293 s) fails the test above, a 10-frame one
    // (0.488 s) fails this one.
    expect(
      fireAtSkyThenLookAt(surface(), SWEEP_SECONDS * 1.2),
      'the sweep has expired — LZ.EDG has counted down to 0 and LZ.ON is clear',
    ).toBe(false)
  })

  it('no trigger, no laser — looking at a tower does not kill it', () => {
    // The floor of the whole model. CLSLZ opens `LDA LZ.ON / IFNE ;?ARE LAZARS ON?` and does
    // nothing at all when the laser is off. A resolver that runs every frame regardless of the
    // trigger would turn the crosshair into a death ray, and would pass every other test here.
    let s = surface()
    for (let i = 0; i < 30; i++) {
      const tower = s.turrets[0]
      expect(tower, 'fixture: the tower must not scroll away mid-test').toBeTruthy()
      const aim = aimAt(tower.pos, eyeOf(s), ASPECT)
      s = stepGame(s, yoke(aim.aimX, false), DT)
      expect(towerDied(s), 'the crosshair alone must never kill anything').toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// (b) Retriggerable. A fresh pull reloads the counter.
// ---------------------------------------------------------------------------

describe('sw7-17 — the sweep is retriggerable (a fresh pull reloads LZ.EDG to 8)', () => {
  it('a second pull mid-sweep extends the window past where the first one would have closed', () => {
    // ROM: `LDA VG.LON / IFNE / … / LDB #8 / STB LZ.EDG` is unconditional — an edge reloads the
    // counter whether or not one is already running.
    //
    // Fire at 0. Pull again at 0.3 s — inside the first window (0.390) and past FIRE_INTERVAL
    // (0.25), so the pull is admissible. The reload means the laser is now on until ~0.69 s, so
    // the crosshair arriving at ~0.5 s — where the un-reloaded sweep would be long dead — still
    // resolves.
    const RETRIGGER_AT = 0.3
    const LOOK_AT = 0.5

    expect(RETRIGGER_AT, 'the second pull must fall INSIDE the first sweep').toBeLessThan(SWEEP_SECONDS)
    expect(RETRIGGER_AT, 'and must be admissible under the re-fire cadence').toBeGreaterThan(FIRE_INTERVAL)
    expect(LOOK_AT, 'and the crosshair must arrive after the FIRST sweep would have closed').toBeGreaterThan(
      SWEEP_SECONDS,
    )

    let s = stepGame(surface(), yoke(SKY_AIM_X, true), DT) // frame 0 — the first pull
    const retriggerFrame = Math.round(RETRIGGER_AT / DT)
    const lookFrame = Math.round(LOOK_AT / DT)

    for (let i = 1; i <= lookFrame; i++) {
      if (i === lookFrame) break
      // The second pull happens with the crosshair STILL on the sky, so it cannot itself be the
      // thing that kills the tower — only the window it re-opens can.
      s = stepGame(s, yoke(SKY_AIM_X, i === retriggerFrame), DT)
      expect(towerDied(s), 'nothing may die while the crosshair is on empty sky').toBe(false)
    }

    const tower = s.turrets[0]
    expect(tower, 'the tower is still standing').toBeTruthy()
    const aim = aimAt(tower.pos, eyeOf(s), ASPECT)
    s = stepGame(s, yoke(aim.aimX, false), DT)

    expect(towerDied(s), 'the reloaded sweep is still on at 0.5 s').toBe(true)
  })

  it('WITHOUT the second pull the same crosshair at the same moment kills nothing', () => {
    // The control that makes the test above mean something. Identical timing, one pull removed:
    // if this also killed, the story above would be "the sweep never ends" wearing a disguise.
    expect(fireAtSkyThenLookAt(surface(), 0.5), 'one pull cannot still be sweeping at 0.5 s').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (c) The sweep is a DURATION. It is not a cooldown. (G-012's own warning.)
// ---------------------------------------------------------------------------

describe('sw7-17 — the 8-frame sweep is the laser ON-time, not the re-fire interval', () => {
  it('the pilot can fire again before the sweep ends', () => {
    // G-012's `refutation_corrections`, verbatim: "the 8-frame LZ.EDG value is the laser's
    // on/collision DURATION per shot, a different quantity from a re-fire interval — DO NOT PORT
    // 8 FRAMES AS A COOLDOWN."
    //
    // The two quantities are 0.390 s and 0.250 s and they must stay independent. Conflating them
    // — clamping re-fire to the sweep — is the single most likely way to mis-port these eighteen
    // lines, and it is invisible to every other test in this file.
    expect(FIRE_INTERVAL, 'the trap only exists because re-fire is SHORTER than the sweep').toBeLessThan(
      SWEEP_SECONDS,
    )

    const FIRE_AGAIN_AT = 0.3 // > FIRE_INTERVAL (0.25), < SWEEP_SECONDS (0.39)
    let s = stepGame(surface(), yoke(SKY_AIM_X, true), DT) // first pull

    const frames = Math.round(FIRE_AGAIN_AT / DT)
    for (let i = 1; i < frames; i++) s = stepGame(s, yoke(SKY_AIM_X, false), DT)

    // Second pull, this time with the crosshair ON the tower. Under a correct port this is an
    // ordinary shot and it lands. If the sweep has been wired up as the cooldown, the gun is
    // still locked out at 0.3 s and the tower lives.
    const tower = s.turrets[0]
    const aim = aimAt(tower.pos, eyeOf(s), ASPECT)
    s = stepGame(s, yoke(aim.aimX, true), DT)

    expect(towerDied(s), 're-fire is gated by FIRE_INTERVAL, never by LZ.EDG').toBe(true)
  })
})
