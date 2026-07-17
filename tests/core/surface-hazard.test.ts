// tests/core/surface-hazard.test.ts
//
// Story sw7-5 — R5 Surface hazard (RED phase, Imperator Furiosa / TEA):
// bunkers fire (D-016, GDBNKGN) and flying into a standing tower/bunker costs
// a shield (D-020, GDVIEW BG1GLW+AUDCR) — the maze fights back.
//
// GROUND TRUTH (WSGRND.MAC / WSMAIN.MAC / WSGLOW.MAC / WSGAS.MAC,
// ~/Projects/star-wars-1983-source-text, historicalsource/star-wars @ 5355b76):
//
//   D-016 — bunkers fire. GDGUN dispatches every STANDING (TYP$DM clear,
//   WSGRND:1194-1196) building while the player is alive (S.GAS >= 0, :1188):
//   `LBHI GDBNKGN ;>2==>BUNKER GUN` (WSGRND:1200). The clone's armed filter
//   (src/core/sim.ts) silences them via `kind !== 'bunker'`. HOUSE RULE D-017
//   keeps the clone's return-fire MODEL (one homing fireball through the
//   ENEMY_FIRE_INTERVAL cadence, not the ROM's FRB*GN directional guns), so the
//   fix folds bunkers into the armed pool WITHIN that model. The bunker's gun is
//   its LOW BODY, not a tower cap: the bunker's whole body spans 0..6 height
//   units (WSOBJ.MAC .WP GND rings; hex radix), i.e. 6*120 = 720 raw ROM units
//   = 24 at the surface sim's 1/30 height scale (D-013: SKIM_ALTITUDE 128 ==
//   GD$MDT 3840). GDHTBK even centers the bunker's hit explosion at 3*120
//   (WSGRND:1166). So a bunker muzzle is <= 24 — never TOWER_HEIGHT (352).
//   The ROM's distance-weighted fire chance (`LDA #40 / SUBA 4+M.X0 / CMPA
//   P.RND1`, WSGRND:1294-1296) belongs to the house-ruled fire model and is
//   routed to a Delivery Finding, not pinned here.
//
//   D-020 — ship↔object collision. Per object in the 45° forward cone
//   (|M.YP| < M.XP, WSGRND:766-771):
//     tower : `M.XP - $200 - speed <= 0` → JSR BG1GLW (glow shields) +
//             JSR AUDCR ;AND CRASH INTO TOWER (WSGRND:901-912) — NO height
//             gate: a tower cannot be overflown.
//     bunker: only while STANDING (TYP$DM clear, :937-939) AND the ship is
//             BELOW the bunker top (`M$TZ+M.U1 - 6*120.*2 IFLT`, :940-942) AND
//             `M.XP - $400 - speed <= 0` (:943-946) — a bunker CAN be overflown.
//   One crash = ONE shield: BG1GLW arms only when GS.GLW == 0 ("READY FOR
//   ANOTHER HIT?", WSGLOW.MAC:58-64) and DO1GAS decrements S.GAS once per
//   arming (WSGAS.MAC:63-81). The crash never scores. The ROM also rolls the
//   ship (S.ROL ±$20 tower / ±19. bunker, WSGRND:914-924/954-962) — routed to
//   a Delivery Finding (render/feel), not pinned here.
//
//   The ceiling that makes towers unavoidable: the surface flight band is
//   GD$MNT ($200) .. GD$MXT ($1C00) (WSMAIN.MAC:2597-2598) = 512..7168 raw ROM
//   units, i.e. ~17..~239 at the 1/30 height scale — BELOW the 58*120/30 = 232
//   ... tower cap at TOWER_HEIGHT (352). Unclamped climb would let the pilot
//   hop every tower and the maze could not fight back; the clamp is pinned
//   here (any ceiling strictly below TOWER_HEIGHT passes).
//
// REACHABILITY RULING (logged as a TEA deviation in the session): the ROM's
// bunker-crash band exists because its floor (512) is below the bunker top
// (720). The clone's floor is MIN_SKIM_ALTITUDE = 40 (house rule D-021), ABOVE
// the raw-scaled bunker top (24) — a 1:1 scale port would make the bunker half
// of D-020 dead code. The story title says the maze fights back, so this suite
// stages the bunker crash at MIN_SKIM_ALTITUDE (the lowest legal flight): the
// clone's bunker-crash ceiling must sit ABOVE the floor (40) and AT OR BELOW
// the default cruise (SKIM_ALTITUDE = 128), preserving the ROM's shape:
// low flight risks bunkers, cruise clears them. (Proportional candidate:
// 40 * 720/512 ≈ 56 — Dev's pick, cited in the session.)
//
// CONTRACT PINNED HERE (TEA-defined; the sprint YAML carried only the title):
//   - the crash emits ONE 'object-crash' GameEvent per hit (its own cue, like
//     'terrain-crash' — the ROM's AUDCR is a distinct sound), never a
//     'terrain-crash' or 'player-death' stand-in, and never an 'enemy-death'
//     (the ROM crash does not destroy the building);
//   - kindless legacy `{ pos }` entries crash as TOWERS (absent kind == tower,
//     the sw3-11 back-compat contract / lang-review #4 nullish default);
//   - determinism holds through the new paths (CLAUDE.md core boundary).
//
// PASS-BY-DESIGN GUARDS (green pre-GREEN on purpose — the keep-behavior
// mirror halves): bunker grace, tower muzzle, bunker overfly at cruise,
// off-lane pass, destroyed-object pass, determinism. Every other test here
// is RED today and goes GREEN with the fix.
//
// SIBLING RE-SEAT (same story): surface-towers.test.ts's cube-top muzzle pin
// sampled the first shot of a real maze run; once bunkers join the armed pool
// that sample can be a bunker's low shot. Re-seated onto an explicit tower
// fixture (intent unchanged: TOWERS fire from the cap).

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  TOWER_HEIGHT,
  TOWER_FIRE_GRACE,
  type GameState,
  type Turret,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { fireAt } from '../support/aim'
import { dot, sub, type Vec3 } from '@arcade/shared/math3d'

const DT = 0.02 // 12 world units of scroll per step at TURRET_SCROLL_SPEED 600

/** A fresh surface run: Wave 1's initial state flipped into the surface phase
 *  (mirrors tests/core/surface.test.ts). */
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })

/** A hand-placed ground object. `surfaceMazeLaid: true` must ride along in the
 *  fixture state or the wave maze is laid over the stage (and re-laid the frame
 *  the last hand-placed object dies). */
const ground = (pos: Vec3, kind: 'tower' | 'bunker' | 'bishop', age = 0): Turret => ({
  pos,
  age,
  kind,
})

const CLIMB: Input = { aimX: 0, aimY: 1, fire: false } // +aimY = up (surface.test.ts convention)

/** The bunker's whole body tops out at 6 height units * 120 scale = 720 raw ROM
 *  units = 24 at the sim's 1/30 height scale (WSOBJ.MAC .WP GND / D-013). A
 *  LITERAL, not a constant-under-audit (tp1-27 rule). */
const BUNKER_BODY_TOP = 24

/** GD$MXT ($1C00 = 7168 raw, WSMAIN.MAC:2598) at the 1/30 height scale — the
 *  ROM's surface ceiling, staged as "as high as the cabinet lets you fly". */
const ROM_CEILING = 238

/** Step `steps` frames, collecting every emitted event type along the way. */
function fly(s0: GameState, steps: number, input: Input = NO_INPUT): { s: GameState; types: string[] } {
  let s = s0
  const types: string[] = []
  for (let i = 0; i < steps; i++) {
    s = stepGame(s, input, DT)
    for (const e of s.events) types.push(e.type)
  }
  return { s, types }
}

const count = (types: string[], t: string): number => types.filter((x) => x === t).length

// =============================================================================
// D-016 — bunkers fire (GDBNKGN, WSGRND:1200)
// =============================================================================

describe('sw7-5 / D-016 — standing bunkers fire', () => {
  /** A lone armed bunker, cadence clock expired, ready to shoot this frame. */
  const armedBunker = (): GameState => ({
    ...surface(),
    turrets: [ground([0, 0, -2000], 'bunker', TOWER_FIRE_GRACE + 1)],
    surfaceMazeLaid: true,
    enemyFireCooldown: 0,
  })

  it('a standing bunker past its grace fires on the cadence (RED: silenced today)', () => {
    // ROM: GDGUN dispatches PC$BNK to GDBNKGN (WSGRND:1200). Clone: the armed
    // filter excludes kind 'bunker', so no shot ever launches from this state.
    const s1 = stepGame(armedBunker(), NO_INPUT, DT)
    expect(s1.enemyShots).toHaveLength(1)
    expect(count(s1.events.map((e) => e.type), 'enemy-fire')).toBe(1)
  })

  it("the bunker's fireball erupts from its LOW body, never the tower cap (RED)", () => {
    // The bunker's body spans 0..720 raw ROM units = 0..24 sim height units;
    // a muzzle at TOWER_HEIGHT (352) would erupt from empty air — the exact
    // wrongness the old sim comment worried about.
    const s1 = stepGame(armedBunker(), NO_INPUT, DT)
    const shot = s1.enemyShots[0]
    expect(shot).toBeDefined()
    expect(shot.pos[1]).toBeLessThanOrEqual(BUNKER_BODY_TOP)
    // Write the refutation into the test: the lazy port (tower-cap muzzle for
    // every kind) must stay dead.
    expect(Math.abs(shot.pos[1] - TOWER_HEIGHT)).toBeGreaterThan(100)
    // House rule D-017: still the clone's homing fireball, aimed back at the
    // cockpit from that low muzzle.
    expect(dot(shot.vel, sub([0, 0, 0] as Vec3, shot.pos))).toBeGreaterThan(0)
  })

  it('a freshly-risen bunker holds fire through TOWER_FIRE_GRACE (guard — green today)', () => {
    // Bunkers join the clone's cadence model wholesale: the sw2-3 readable-beat
    // grace applies to them exactly as to towers.
    const s0: GameState = {
      ...surface(),
      turrets: [ground([0, 0, -2000], 'bunker', 0)],
      surfaceMazeLaid: true,
      enemyFireCooldown: 0,
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.enemyShots).toHaveLength(0)
  })

  it('towers still fire from the cube top after bunkers join the pool (guard — green today)', () => {
    // The sw2-3 contract must survive the armed-filter change untouched.
    const s0: GameState = {
      ...surface(),
      turrets: [ground([0, 0, -2000], 'tower', TOWER_FIRE_GRACE + 1)],
      surfaceMazeLaid: true,
      enemyFireCooldown: 0,
    }
    const s1 = stepGame(s0, NO_INPUT, DT)
    const shot = s1.enemyShots[0]
    expect(shot).toBeDefined()
    expect(shot.pos[1]).toBeCloseTo(TOWER_HEIGHT, 0)
  })

  it('a real wave-1 maze run eventually fires from a bunker body (RED: integration)', () => {
    // Keeps the wiring honest: the fixture tests above could be satisfied by a
    // bunker-only special path that the real maze never reaches. Wave 1's
    // SQUARE maze mixes 12 bunkers among its 28 objects (D-015 house rule keeps
    // the wave-1 surface); on the clone's cadence a bunker muzzle (y <= 24)
    // must show up well inside the maze's ~57 s traversal. Tower muzzles sit at
    // 352, so the two populations cannot be confused. Lives are padded so the
    // homing return fire cannot end the run mid-observation
    // (surface-clear.test.ts precedent).
    let s: GameState = { ...surface(1983), lives: 9999 }
    let lowMuzzle = false
    for (let i = 0; i < 2400 && !lowMuzzle; i++) {
      s = stepGame(s, NO_INPUT, DT)
      for (const e of s.events) {
        if (e.type === 'enemy-fire' && e.pos[1] <= BUNKER_BODY_TOP) lowMuzzle = true
      }
    }
    expect(lowMuzzle).toBe(true)
  })
})

// =============================================================================
// D-020 — flying into a standing tower/bunker costs a shield
// (GDVIEW: BG1GLW + AUDCR, WSGRND:901-912 tower / 937-964 bunker)
// =============================================================================

describe('sw7-5 / D-020 — a standing TOWER dead ahead is a crash', () => {
  /** One standing tower on the flight line, 300 units out — 40 steps sweep it
   *  clear through the cockpit plane and past the cull. */
  const towerAhead = (extra: Partial<GameState> = {}): GameState => ({
    ...surface(),
    turrets: [ground([0, 0, -300], 'tower')],
    surfaceMazeLaid: true,
    ...extra,
  })

  it('costs exactly ONE shield across the whole pass — latched, not per-frame (RED)', () => {
    // ROM: BG1GLW arms only when GS.GLW == 0 (WSGLOW.MAC:58-64) and DO1GAS
    // spends S.GAS once per arming (WSGAS.MAC:63-81). A per-frame drain would
    // charge the multi-frame collision window several shields.
    const s0 = towerAhead()
    const { s, types } = fly(s0, 40)
    expect(s.lives).toBe(s0.lives - 1)
    expect(count(types, 'object-crash')).toBe(1)
  })

  it('emits its own cue — never a terrain-crash, player-death, or enemy-death stand-in (RED)', () => {
    // AUDCR is its own sound (the 'terrain-crash' precedent: "its own cue, not
    // a player-death"), and the ROM crash does NOT demolish the building — no
    // kill event, no score.
    const s0 = towerAhead()
    const { s, types } = fly(s0, 40)
    expect(count(types, 'object-crash')).toBe(1)
    expect(types).not.toContain('terrain-crash')
    expect(types).not.toContain('player-death')
    expect(types).not.toContain('enemy-death')
    expect(s.score).toBe(s0.score)
  })

  it('a kindless legacy { pos } entry crashes as a tower — absent kind == tower (RED)', () => {
    // sw3-11 back-compat / lang-review #4: the new collision path must ride the
    // same nullish default as every other kind read, not throw or skip.
    const s0: GameState = {
      ...surface(),
      turrets: [{ pos: [0, 0, -300] as Vec3 }],
      surfaceMazeLaid: true,
    }
    const { s, types } = fly(s0, 40)
    expect(s.lives).toBe(s0.lives - 1)
    expect(count(types, 'object-crash')).toBe(1)
  })

  it('cannot be overflown — the crash bites even at the ROM ceiling (RED)', () => {
    // ROM: the tower branch has NO height gate (WSGRND:901-912), and the flight
    // band tops out at GD$MXT below the tower cap — staged at the scaled
    // ceiling (238), still under TOWER_HEIGHT (352).
    const s0 = towerAhead({ altitude: ROM_CEILING })
    const { s, types } = fly(s0, 40)
    expect(s.lives).toBe(s0.lives - 1)
    expect(count(types, 'object-crash')).toBe(1)
  })

  it('a DESTROYED object no longer collides (guard — green today)', () => {
    // ROM gates the bunker crash on TYP$DM ("CHECK COLLISION SINCE BLOWN
    // AWAY?", WSGRND:937-939); the clone removes killed objects outright, and
    // the crash test must read the LIVE field, not the maze data.
    //
    // sw7-17: the tower is destroyed by AIMING AT IT AND PULLING THE TRIGGER, not by parking a
    // bolt on it — the player's laser is hitscan and spawns nothing that flies, so the old
    // fixture cannot occur in play. The pull is DOWNWARD here (the tower stands on the floor and
    // the pilot cruises SKIM_ALTITUDE above it) and that is fine: the beam resolves on its own
    // frame, so the one frame of throttle the dip costs cannot reach the crash window this test
    // measures. The rest of the pass then flies hands-off with the trigger released.
    //
    // The pull's ~0.39 s LZ.EDG sweep does keep the beam alive into that pass (~19 of the 40
    // frames, now centred), which is harmless and deliberately not worked around: the only object
    // on the stage is the one just killed, and `surfaceMazeLaid` stops a wave maze being laid
    // over it — so there is nothing left for the sweep to find, which is the guard's whole point.
    const TOWER_SITE: Vec3 = [0, 0, -300]
    const s0 = towerAhead()
    const first = stepGame(s0, fireAt(s0, TOWER_SITE), DT)
    // The kill EVENT, not an emptied list: a tower also leaves `turrets` by scrolling past the
    // cockpit, which is exactly the pass this test then flies — so the list alone would call a
    // total miss a kill and the guard would go green having proved nothing.
    expect(count(first.events.map((e) => e.type), 'enemy-death'), 'the beam got it…').toBe(1)
    expect(first.turrets).toHaveLength(0)
    const { s, types } = fly(first, 40)
    expect(s.lives).toBe(s0.lives) // …so nothing is left to crash into
    expect(count(types, 'object-crash')).toBe(0)
  })

  it('an off-lane tower passes harmlessly — the window is narrower than a maze lane (guard)', () => {
    // ROM lateral reach at contact is the 45° cone ∩ X window ≈ $200..$600 raw
    // units; the tightest authored lane offset is 2048. A window that eats the
    // neighbouring lane would make whole mazes unsurvivable.
    const s0: GameState = {
      ...surface(),
      turrets: [ground([2048, 0, -300], 'tower')],
      surfaceMazeLaid: true,
    }
    const { s, types } = fly(s0, 40)
    expect(s.lives).toBe(s0.lives)
    expect(count(types, 'object-crash')).toBe(0)
  })

  it('crashing on the last shield ends the run (RED)', () => {
    const s0 = towerAhead({ lives: 1 })
    const { s } = fly(s0, 40)
    expect(s.lives).toBe(0)
    expect(s.gameOver).toBe(true)
    expect(s.mode).toBe('gameover')
  })
})

describe('sw7-5 / D-020 — a standing BUNKER is a LOW hazard: dive risks it, cruise clears it', () => {
  const bunkerAhead = (altitude: number): GameState => ({
    ...surface(),
    turrets: [ground([0, 0, -300], 'bunker')],
    surfaceMazeLaid: true,
    altitude,
  })

  it('a low-flying ship crashes into a standing bunker (RED)', () => {
    // Staged at MIN_SKIM_ALTITUDE — the lowest legal flight. See the
    // REACHABILITY RULING in the header: the clone's bunker-crash ceiling must
    // sit above the flight floor or this half of D-020 is dead code.
    const s0 = bunkerAhead(MIN_SKIM_ALTITUDE)
    const { s, types } = fly(s0, 40)
    expect(s.lives).toBe(s0.lives - 1)
    expect(count(types, 'object-crash')).toBe(1)
    expect(types).not.toContain('terrain-crash') // MIN_SKIM_ALTITUDE is legal flight
  })

  it('the default cruise altitude clears bunkers — overfly is safe (guard — green today)', () => {
    // ROM: `M$TZ+M.U1 - 6*120.*2 IFLT` (WSGRND:940-942) — above the bunker top
    // there is no crash. At cruise the ROM pilot rides 3840 raw units, 5× the
    // bunker's 720. This guard is also what keeps wave 2 (BUNK: two bunkers
    // authored dead-centre at x=0) survivable at cruise.
    const s0 = bunkerAhead(SKIM_ALTITUDE)
    const { s, types } = fly(s0, 40)
    expect(s.lives).toBe(s0.lives)
    expect(count(types, 'object-crash')).toBe(0)
  })
})

// =============================================================================
// The ceiling — the maze can fight back only if the pilot can't hop it
// =============================================================================

describe('sw7-5 — the surface flight band has the ROM ceiling (GD$MXT, WSMAIN:2598)', () => {
  it('sustained max climb clamps at a ceiling strictly below the tower cap (RED)', () => {
    // Unclamped, 30 s of full climb reaches 128 + 200·30 = 6128 — the pilot
    // hops every tower and D-020 is decoration. The ROM band is $200..$1C00
    // raw (512..7168), ceiling ≈ 238 at the height scale — any finite clamp
    // strictly below TOWER_HEIGHT (352) passes; the exact value is Dev's, with
    // the citation.
    let s: GameState = { ...surface(), turrets: [], surfaceMazeLaid: true }
    for (let i = 0; i < 400; i++) s = stepGame(s, CLIMB, 0.05) // 20 s of climb
    const a1 = s.altitude
    for (let i = 0; i < 200; i++) s = stepGame(s, CLIMB, 0.05) // +10 s more
    const a2 = s.altitude
    expect(Number.isFinite(a1)).toBe(true)
    expect(a2).toBe(a1) // a real clamp, not a slower drift
    expect(a1).toBeLessThan(TOWER_HEIGHT) // strictly below the cap: no hopping
    expect(a1).toBeGreaterThan(MIN_SKIM_ALTITUDE) // …but still a real band
  })
})

// =============================================================================
// Purity — the new paths stay deterministic (CLAUDE.md core boundary)
// =============================================================================

describe('sw7-5 — the hazard is deterministic (guard — green today, protects GREEN)', () => {
  it('same seed, same crashes: two real wave-1 runs stay deep-equal through the crash frames', () => {
    // 1600 steps ≈ 32 s: past the centre-line bunker (~22.5 s, overflown at
    // cruise) and the centre-line tower (~29.3 s, a crash post-GREEN). Any
    // Math.random()/Date.now() sneaking into the new paths diverges here.
    const run = (): GameState => {
      let s = surface(7)
      for (let i = 0; i < 1600; i++) s = stepGame(s, NO_INPUT, DT)
      return s
    }
    const a = run()
    const b = run()
    expect(a).toEqual(b)
    expect(Number.isFinite(a.altitude)).toBe(true)
  })
})
