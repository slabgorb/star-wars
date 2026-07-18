// tests/core/ground-debris.test.ts
//
// Story sw7-14 — R7b ground debris — RED phase (Han Solo / TEA).
// Audit finding X-005 (docs/audit/findings/pair-explosions.json, NO_COUNTERPART):
// "Tower/bunker destruction explosion (ballistic debris + ground shadow) is absent."
//
// GROUND TRUTH — WSXPLD.MAC (historicalsource/star-wars @ 5355b76, `.RADIX 16`),
// verified line-by-line against ~/Projects/star-wars-1983-source-text/WSXPLD.MAC:
//
//   BGBKXP:: (:305, bunker) and BGTWXP:: (:317, tower) each spawn THREE explosion
//   pieces (piece 1 :325, piece 2/center :360, piece 3/right :395). Every piece:
//     * LIFE  `LDA #20 / STA XP$TMR` (:330/:366/:401) — radix 16, so 0x20 = 32
//       game-frames. At the cabinet's 20.508 Hz game frame that is 32/20.508 =
//       1.560 s (sw7-1 timebase; the same idiom as TIE_WING_LIFE_SECONDS = 0x18/TICK_HZ).
//     * LAUNCH `LDA TMPVZ ... JSR LSLD2 ;*4 / STD XP$MZ` (:355-357/:390-392/:426-428) —
//       an UPWARD vertical velocity, the ROM comment "728. TO 1024., VARY AROUND
//       54.*120.*2/16=810." shifted left twice (×4). Both periods force decimal.
//     * GRAVITY `SUBD #50.*4 ;FORCE OF GRAVITY` (:559) — `50.` is decimal (trailing
//       period), so 50×4 = 200 subtracted from XP$MZ once per game frame → 200 u/frame².
//     * FLOOR-FREEZE (:550-555): `ADDD XP$MZ / IFVC / IFLT / LDD #0 ;THEN FREEZE IT
//       AT GROUND LEVEL / STD XP$CZ` — the vertical position is clamped to 0 (never
//       sinks below the ground) once it would cross it.
//   The scaled ground SHADOW (VWTWN white :691, VWBKN red :695) is a RENDER concern
//   pinned in tests/shell/render.ground-debris.test.ts — colour stays out of core.
//
// THE ROM'S UP-AXIS IS Z; OURS IS Y (render.ts TOWER_ORIENT; the "third coordinate
// is HEIGHT" rule). So XP$MZ (vertical velocity) → our `vel[1]`, XP$CZ (height) →
// our `pos[1]`, and the floor is `pos[1] = 0`.
//
// TIMEBASE CONVENTION (state.ts, established by sw7-1 / sw7-18): a ROM per-frame
// VELOCITY ports to u/s as `value × TICK_HZ` (SURFACE_SEED_SPEED = 0x100 × TICK_HZ);
// a per-frame² ACCELERATION as `value × TICK_HZ²` (SURFACE_ACCEL = TICK_HZ²); a
// life in frames as `frames / TICK_HZ` (TIE_WING_LIFE_SECONDS = 0x18 / TICK_HZ).
// These tests read velocities/accelerations BACK to u/frame (÷ TICK_HZ, ÷ TICK_HZ²)
// so the assertions speak the ROM's own units and bite on a missing ×4 OR a missing
// timebase conversion.
//
// == TEA CONTRACT (the shape Dev implements) — see the session Design Deviations ==
// X-005's "ours" is null: nothing today survives a surface ground-object kill except
// an 'enemy-death' event (sim.ts stepSurface :733-737 removes the turret). This is a
// NEW subsystem, mirroring `dyingTies` but as a real BALLISTIC entity (finding X-004:
// pieces carry velocity and are integrated in the sim, not faked in render). The
// contract these tests pin:
//   GameState gains `groundDebris: GroundDebris[]`, each piece
//     { pos: Vec3; vel: Vec3; age: number; kind: 'tower' | 'bunker' }
//   — `pos`/`vel`/`age` echo dyingTies + Enemy naming; `kind` selects the shadow
//   colour (bunker→red, else→white). Reset on phase entry like dyingTies.
// The field does not exist yet, so every read goes through a cast (`debrisOf` /
// `withDebris`) that keeps tsc green while the assertions fail on 0-vs-expected —
// the clean RED. When Dev adds the field the casts remain valid and the reds flip.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TICK_HZ,
  SKIM_ALTITUDE,
  type GameState,
  type Turret,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { fireAt } from '../support/aim'
import type { Vec3 } from '@arcade/shared/math3d'

// One kill lands cleanly on the proven bunker/tower fixture cadence (surface-bunkers.test.ts).
const DT = 0.02
// One ROM game-frame per step, so N steps == N game-frames and the ballistic
// integration reads in the ROM's own frame units.
const FRAME = 1 / TICK_HZ

/** The structural shape these tests read off `groundDebris` (Dev names the fields). */
type DebrisPiece = { pos: Vec3; vel: Vec3; age: number; kind: 'tower' | 'bunker' }

/** Read `state.groundDebris` without a compile error while the field is unborn.
 *  Single cast to a structural view (not `as any`, not a double cast); `?? []`
 *  makes the RED a clean 0-length assertion rather than a TypeError. */
const debrisOf = (s: GameState): DebrisPiece[] =>
  (s as { groundDebris?: DebrisPiece[] }).groundDebris ?? []

/** Seat a hand-built debris list on a state (forward-compat cast, like the
 *  `groundObject` helper in surface-bunkers.test.ts casts `as Turret`). */
const withDebris = (s: GameState, pieces: DebrisPiece[]): GameState =>
  ({ ...s, groundDebris: pieces } as GameState)

/** A fresh surface run (mirrors surface-bunkers.test.ts). */
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })

/** A ground object with an explicit kind. `as Turret` keeps this file compiling
 *  against today's kindless Turret — the pin is behavioural. */
const groundObject = (pos: Vec3, kind: 'tower' | 'bunker'): Turret => ({ pos, kind } as Turret)

/** Did the player's beam really destroy a ground object this frame? (sw7-17: NOT
 *  `turrets.length === 0`, which a scroll-past also satisfies — the event is the
 *  kill and nothing else.) */
const killedAGroundObject = (s: GameState): boolean =>
  s.events.some((e) => e.type === 'enemy-death' && e.enemyType === 'turret')

// Level with the eye so a dead-on shot is purely lateral (aimY stays 0, so aiming
// does not fly the ship) — surface-bunkers.test.ts's SITE, verbatim.
const SITE: Vec3 = [0, SKIM_ALTITUDE, -800]

/** A surface state with one ground object of `kind` at SITE, ready to be shot on
 *  the first frame (edge-triggered trigger released, no cooldown, field pre-laid). */
const armedKill = (kind: 'tower' | 'bunker'): GameState => ({
  ...surface(),
  turrets: [groundObject(SITE, kind)],
  surfaceMazeLaid: true, // hand-placed field — don't lay the wave maze over it
  enemyShots: [],
  fireCooldown: 0,
  firePrev: false,
})

/** Kill the object and return the FIRST frame after its destruction (the spawn frame). */
const killAndStep = (s0: GameState): GameState => stepGame(s0, fireAt(s0, SITE), DT)

// A debris fixture parked far above the floor so it ages/accelerates freely without
// ever tripping the floor-freeze — for isolating gravity and lifetime.
const aloft = (over: Partial<DebrisPiece> = {}): DebrisPiece => ({
  pos: [0, 1e7, -800],
  vel: [0, 0, 0],
  age: 0,
  kind: 'tower',
  ...over,
})

/** A quiet surface state that only ages the debris (no maze, no fire). */
const debrisOnly = (pieces: DebrisPiece[]): GameState =>
  withDebris({ ...surface(), turrets: [], surfaceMazeLaid: true, enemyShots: [], laserOn: false }, pieces)

describe('sw7-14 — a destroyed ground object spawns three ballistic debris pieces (X-005)', () => {
  it('the kill fixture actually destroys the object (sanity)', () => {
    const s1 = killAndStep(armedKill('bunker'))
    expect(killedAGroundObject(s1)).toBe(true)
  })

  it('destroying a BUNKER spawns exactly 3 pieces (BGBKXP: three NXTFRE calls)', () => {
    const s1 = killAndStep(armedKill('bunker'))
    expect(killedAGroundObject(s1)).toBe(true) // it really died…
    expect(debrisOf(s1)).toHaveLength(3) // …into three pieces (RED: 0 today)
  })

  it('destroying a TOWER spawns exactly 3 pieces (BGTWXP: three NXTFRE calls)', () => {
    const s1 = killAndStep(armedKill('tower'))
    expect(killedAGroundObject(s1)).toBe(true)
    expect(debrisOf(s1)).toHaveLength(3)
  })

  it('the spawn is ADDITIVE — a kill does not clobber debris still in flight', () => {
    // Two pieces already aloft from an earlier kill; a fresh kill adds three more.
    const s0 = withDebris(armedKill('bunker'), [aloft(), aloft()])
    const s1 = killAndStep(s0)
    expect(killedAGroundObject(s1)).toBe(true)
    expect(debrisOf(s1)).toHaveLength(5) // 2 survivors + 3 new (RED: undefined → 0)
  })
})

describe('sw7-14 — pieces launch UPWARD at the ROM vertical velocity (728–1024 ×4)', () => {
  it('all three bunker pieces launch with an upward velocity', () => {
    const pieces = debrisOf(killAndStep(armedKill('bunker')))
    expect(pieces).toHaveLength(3)
    for (const p of pieces) expect(p.vel[1]).toBeGreaterThan(0) // +Y is up (ROM +Z)
  })

  it('the upward launch speed is the ROM 728–1024 ×4 u/frame band', () => {
    // Read back to u/frame (÷ TICK_HZ). The band bites TWO real infidelities:
    //   * dropping the ×4 (LSLD2) → ~728–1024 u/frame, below 2712 → FAILS;
    //   * dropping the timebase (storing u/frame in the u/s field) → ~150 u/frame → FAILS.
    // Floor 2712 tolerates one frame of gravity (−200) + the ROM's P.RND1 spread on
    // the documented bunker value 0x0C00 = 4×0x300 = 3072; ceiling 4096 = 1024×4.
    const pieces = debrisOf(killAndStep(armedKill('bunker')))
    expect(pieces).toHaveLength(3)
    for (const p of pieces) {
      const uPerFrame = p.vel[1] / TICK_HZ
      expect(uPerFrame).toBeGreaterThanOrEqual(2712)
      expect(uPerFrame).toBeLessThanOrEqual(4096)
    }
  })

  it('a tower piece also launches upward (BGTWXP, type-3 base 0x800 = 4×0x200)', () => {
    const pieces = debrisOf(killAndStep(armedKill('tower')))
    expect(pieces).toHaveLength(3)
    for (const p of pieces) expect(p.vel[1]).toBeGreaterThan(0)
  })
})

describe('sw7-14 — gravity pulls the pieces down at 200 u/frame² (SUBD #50.*4)', () => {
  it('the vertical velocity loses 200 u/frame² each frame', () => {
    // A piece parked high up: gravity is the only thing acting on vel[1]. Sample the
    // velocity on two consecutive frames; the per-frame delta is −GRAVITY·FRAME, so
    // (vy1 − vy2)/FRAME = GRAVITY = 200 × TICK_HZ². Read back to u/frame² for the pin.
    let s = debrisOnly([aloft({ vel: [0, 0, 0] })])
    s = stepGame(s, NO_INPUT, FRAME)
    const vy1 = debrisOf(s)[0]?.vel[1] ?? 0
    s = stepGame(s, NO_INPUT, FRAME)
    const vy2 = debrisOf(s)[0]?.vel[1] ?? 0

    expect(vy2).toBeLessThan(vy1) // gravity always pulls DOWN (RED: no piece exists → 0 == 0 fails)
    const accelPerFrame2 = (vy1 - vy2) / FRAME / (TICK_HZ * TICK_HZ)
    expect(accelPerFrame2).toBeGreaterThan(190) // refutes 50 (no ×4), 80 (0x50), missing timebase
    expect(accelPerFrame2).toBeLessThan(210)
  })
})

describe('sw7-14 — pieces freeze at the floor, never sinking below y=0', () => {
  it('a descending piece is clamped to the floor (LDD #0 ;FREEZE AT GROUND LEVEL)', () => {
    // A piece just above the floor, falling fast: one step would carry it well below
    // 0; the ROM pins it at exactly 0 instead.
    const falling = aloft({ pos: [0, 10, -800], vel: [0, -4000 * TICK_HZ, 0] })
    let s = debrisOnly([falling])
    s = stepGame(s, NO_INPUT, FRAME)
    const p1 = debrisOf(s)[0]
    expect(p1).toBeDefined()
    expect(p1.pos[1]).toBe(0) // frozen at ground, not −3990-ish (RED: undefined → toBeDefined fails)

    // …and it STAYS on the floor the next frame (gravity keeps pulling, but the
    // clamp re-freezes it — no sinking, no bounce).
    s = stepGame(s, NO_INPUT, FRAME)
    expect(debrisOf(s)[0].pos[1]).toBe(0)
  })

  it('a launched piece never dips below the floor across its whole life', () => {
    // Integration guard: a real TOWER kill (lower launch, so it returns to the floor
    // within its 1.56 s life). Without the freeze it would plunge far below y=0 as it
    // falls; with it, every sampled height stays ≥ 0.
    let s = killAndStep(armedKill('tower'))
    let lowest = Infinity
    for (let i = 0; i < 40; i++) {
      for (const p of debrisOf(s)) lowest = Math.min(lowest, p.pos[1])
      s = stepGame(s, NO_INPUT, FRAME)
    }
    expect(Number.isFinite(lowest)).toBe(true) // debris existed at all (RED: never any → Infinity)
    expect(lowest).toBeGreaterThanOrEqual(0)
  })
})

describe('sw7-14 — a piece lives 0x20 = 32 game-frames (~1.56 s) then is dropped', () => {
  it('is present at 30 frames and gone by 34 (refutes a decimal-20 = 0.98 s misread)', () => {
    // Parked aloft so only its age matters (never freezes, never scrolls out).
    let s = debrisOnly([aloft()])
    for (let i = 0; i < 30; i++) s = stepGame(s, NO_INPUT, FRAME)
    expect(debrisOf(s)).toHaveLength(1) // still alive at 30/20.508 = 1.46 s

    for (let i = 30; i < 34; i++) s = stepGame(s, NO_INPUT, FRAME)
    expect(debrisOf(s)).toHaveLength(0) // dropped by 34/20.508 = 1.66 s
  })
})

describe('sw7-14 — subsystem rules (mirrors dyingTies + the kind back-compat)', () => {
  it('a leftover debris cloud does not cross into the next phase (enterPhase clears it)', () => {
    // dyingTies is wiped on every phase entry (sim.ts enterPhase); a transient
    // ground-explosion cue must be too, or debris would rain into the trench.
    const s = debrisOnly([aloft(), aloft(), aloft()])
    const next = enterPhase(s, 'trench')
    expect(debrisOf(next)).toHaveLength(0)
  })

  it('a KINDLESS (legacy) turret explodes as a TOWER, not a bunker (kind ?? tower)', () => {
    // sw3-11 back-compat: an absent `kind` means tower. The debris must inherit that
    // via `?? 'tower'` (rule #4: nullish, not `||`), so a bare `{ pos }` fixture — and
    // every pre-sw3-11 save — bursts white, never red.
    const s0: GameState = {
      ...armedKill('tower'),
      turrets: [{ pos: SITE }], // kindless
    }
    const pieces = debrisOf(killAndStep(s0))
    expect(pieces).toHaveLength(3)
    for (const p of pieces) expect(p.kind).toBe('tower')
  })

  it('the spawn is deterministic — identical kills give identical debris (no Math.random)', () => {
    // Core purity: any launch variation must ride state.rng, so a seed replays exactly.
    const a = debrisOf(killAndStep(armedKill('bunker')))
    const b = debrisOf(killAndStep(armedKill('bunker')))
    expect(a).toHaveLength(3)
    expect(a).toEqual(b)
  })
})
