// src/core/state.ts
//
// The complete game state. Everything stepGame() needs lives here — including
// the RNG seed — so the simulation is a pure function of (state, input, dt).
//
// Wave 1 (space combat) extends the Wave 0 skeleton with the gameplay it needs:
// player bolts, enemy TIEs, enemy fireballs, and the lives/score it all feeds.
// Per the epic's boundary, these are plain typed data in object/world space —
// no DOM, no time, no randomness. The 3D math that moves and hits them lives in
// math3d.ts (the Math Box) and the rule functions in gameRules.ts.

import type { Vec3, Mat4 } from '@arcade/shared/math3d'
import type { GameEvent } from './events'
import { createRng, type Rng } from '@arcade/shared/rng'

/** The three phases of an attack run, in order. */
export type Phase = 'space' | 'surface' | 'trench'

/**
 * The run lifecycle (story 8-6 framing). The cabinet idles on the attract/title
 * screen, plays a run, then shows game-over; pressing start drives the loop
 * attract -> playing -> gameover -> attract. The phases above happen WITHIN a
 * 'playing' run; mode frames the run.
 */
export type Mode = 'attract' | 'playing' | 'gameover'

/** A bolt in flight — the player's laser or an enemy fireball. World space. */
export interface Projectile {
  /** World-space position. */
  pos: Vec3
  /** World-space velocity (units/second). */
  vel: Vec3
  /** Remaining lifetime in seconds; the bolt is dropped once it reaches 0. */
  ttl: number
}

/** A live enemy fighter bearing down on the cockpit. World space. */
export interface Enemy {
  /** World-space position. The hit-test reads this. */
  pos: Vec3
  /** World-space velocity (units/second), pointed at the cockpit. */
  vel: Vec3
  /** Enemy type — a string union (no enum) so it stays cheap and serialisable. */
  kind: 'tie'
  /** Per-enemy facing (sim state; render only applies it). Story 8-13 made it a
   * look-toward-the-cockpit rotation; story 9-2 evolves it to BANK along the
   * flight path — the look-along-heading frame rolled into the swoop. Maps the
   * model's forward axis (+Z) onto the TIE's heading. */
  orient: Mat4
  /** Per-TIE lateral swoop bias (signed), seeded from the RNG at spawn: which way
   * the fighter banks its approach arc so it curves in instead of flying straight
   * at the cockpit (story 9-2, the RE'd flight model). Optional — collision/test
   * fixtures that only exercise hit-tests omit it (treated as 0: no swoop). */
  bank?: number
  /** True once this TIE has begun its peel-away / fly-past exit (story 9-3): it
   * completed its attack pass without landing a hit and is now thrusting outward,
   * receding out of the play volume. Latched — an approaching TIE omits it (treated
   * as false), so a fighter already peeling never re-homes on the cockpit. */
  peeling?: boolean
  /** Per-TIE fire cadence countdown (seconds) for strafe-and-fire (story 9-4): each
   * fighter fires on its OWN clock while it is in its pass window, not on a single
   * formation timer. Seeded the first time the TIE is seen from the squad clock
   * (`GameState.enemyFireCooldown`) — so a parked squad clock still suppresses every
   * fighter — then reset to the wave's fire interval after each shot. Optional:
   * freshly spawned TIEs and test fixtures omit it (it inherits the squad clock until
   * the fighter's first shot). */
  fireCooldown?: number
}

/** A laser turret standing on the Death Star surface (Wave 2). World space. */
export interface Turret {
  /** World-space position (y ≈ 0, on the floor). The hit-test reads this. */
  pos: Vec3
}

/** A trench wall/channel entity: turrets and squares are shootable for score;
 *  catwalks are hazards (cockpit contact costs a shield). Scrolls with the
 *  channel like the exhaust port. Fidelity epic (findings ## Trench catwalks,
 *  turrets & wall squares). */
export interface TrenchObstacle {
  kind: 'turret' | 'square' | 'catwalk'
  pos: Vec3
}

// --- Wave 1 gameplay constants ----------------------------------------------
//
// Two of these are AUTHENTIC, from Mitchell Gant's "Atari Star Wars Theory of
// Operation" (wardclan, the origin of the AVG disassembly this epic ports):
// the cabinet keeps a *maximum of 3 TIE fighter slots* and a *maximum of 6
// fireball slots* on screen at once. The rest are authentic-FEEL values: the
// cabinet disassembly (reference/disasm/StarWars.asm) is raw, unlabelled 6809
// with no symbolic score/shield/timing tables, so those are chosen to play
// right and named/single-sourced here for easy correction once deeper reverse
// engineering recovers them (see the Dev deviation + finding in the session).

/** Shields the player starts a run with; a hit costs one. */
export const STARTING_LIVES = 6
/** Points awarded for destroying a TIE fighter. */
export const TIE_SCORE = 100
/** Points awarded for shooting an enemy fireball out of the air (story 8-18).
 * Worth less than a TIE — fireballs are plentiful (6 slots) defensive ordnance,
 * not fighters. Authentic-FEEL like the other Wave-1 scores (StarWars.asm has no
 * symbolic score table); single-sourced here for easy correction. */
export const FIREBALL_SCORE = 50
/** Player bolt lifetime (seconds) before it fizzles out. */
export const PROJECTILE_TTL = 2
/** Minimum seconds between player shots (trigger fire rate). */
export const FIRE_INTERVAL = 0.25
/** Seconds between TIE spawns into a free slot. */
export const SPAWN_INTERVAL = 1.5
/** Maximum TIE fighters on screen at once — authentic "3 tie fighter slots". */
export const WAVE_SIZE = 3

// Internal tuning (not part of the test contract, but kept here so all the
// space-combat magic numbers live in one place the reviewer can scan).

/** Player bolt speed (units/second), fired down the aim direction. A bolt's REACH
 * is PROJECTILE_SPEED × PROJECTILE_TTL, and it must clear the whole TIE approach
 * volume: fighters spawn at TIE_SPAWN_DISTANCE (8000, corner ~8015 with
 * SPAWN_SPREAD) and bear in, so a bolt that dies short leaves inbound TIEs
 * unhittable until they close to point-blank — the sw2-1 defect. At 5000 the reach
 * is 10000 (≥ the 8015 worst-case spawn with margin), so the player can engage a
 * TIE the moment it appears. It also restores a faithful FEEL: the old 900 was
 * slower than the 1300-unit TIE approach — a laser the fighters outran. */
export const PROJECTILE_SPEED = 5000
/** Distance ahead (−Z) at which surface turrets appear, and the anchor the Death
 * Star surface is placed against. NOTE: TIEs no longer use this — they spawn at
 * TIE_SPAWN_DISTANCE (story 9-7). Kept at the original value so the surface phase
 * is unchanged. */
export const SPAWN_DISTANCE = 1200
/** Distance ahead (−Z) at which TIEs appear. Far enough that a freshly spawned
 * fighter subtends only a small fraction of the viewport and then grows
 * dramatically as it bears down — the cabinet "speck swoops into a ship" feel
 * (story 9-7). The authentic TIE model is large (bounding radius ~334), so this
 * sits well beyond the old shared 1200, which read as a half-screen wall at spawn.
 * Tuned out further (5000→8000) so a fresh TIE reads as a small distant speck. */
export const TIE_SPAWN_DISTANCE = 8000
/** Half-width of the lateral box TIEs spawn within. */
export const SPAWN_SPREAD = 350
/** TIE approach speed (units/second). Scaled up alongside TIE_SPAWN_DISTANCE
 * (story 9-7) so the longer approach resolves snappily (~5.9s from the 8000-unit
 * spawn, not a slow crawl); the 8-6 difficulty ramp still rides this as the
 * wave-1 base. */
export const ENEMY_SPEED = 1300
/** Enemy fireball speed (units/second). */
export const ENEMY_SHOT_SPEED = 300
/** Enemy fireball lifetime (seconds). */
export const ENEMY_SHOT_TTL = 6
/** Seconds between enemy fireballs (whole formation). */
export const ENEMY_FIRE_INTERVAL = 1
/** Maximum enemy fireballs on screen at once — authentic "6 fireball slots". */
export const MAX_FIREBALL_SLOTS = 6
/** Hit sphere around an enemy fireball for player bolts. A LARGE target (story
 * sw2-2): the fireball renders as a big glowing orb, so it must be a big thing to
 * shoot — what you see is what you shoot. Sized at 0.6× the TIE sphere — smaller
 * than a fighter, but far bigger than the old 90u speck that read as a HUD tick
 * and let real-speed bolts (PROJECTILE_SPEED 5000, ~83 u/frame) graze past
 * between frames (the sw2-1 tunneling finding). render.ts draws the orb at this
 * same radius. Authentic-FEEL, single-sourced like the other Wave-1 radii. */
export const ENEMY_SHOT_HIT_RADIUS = 150
/** Hit sphere around a TIE for player bolts (covers the model extent). */
export const TIE_HIT_RADIUS = 250
/** Hit sphere around the cockpit for enemy contact and fire. */
export const COCKPIT_HIT_RADIUS = 80
/**
 * Contact sphere for a trench catwalk reaching the cockpit (story 14-7). A
 * catwalk hangs at y=200 above the cockpit centreline and only its z advances as
 * it scrolls, so its closest approach is sqrt(200² + 0²) = 200 units at z=0 —
 * beyond COCKPIT_HIT_RADIUS (80), which is why the crash never fired. Its own
 * radius must span that fixed vertical offset PLUS a margin: at exactly 200 the
 * hit shell is the razor-thin z=0 plane, which the discrete ~8.3 u/frame scroll
 * can skip on floating-point drift. 240 opens a ~16-frame window around z=0 while
 * staying far below the ~2090-unit spawn distance, so the catwalk crashes as it
 * passes the cockpit but never fires early downrange. Separate from
 * COCKPIT_HIT_RADIUS so widening the catwalk's reach can't broaden every other
 * cockpit hit-test (TIE/port/fire).
 */
export const CATWALK_HIT_RADIUS = 240

// --- Wave 1 — TIE flight model (story 9-2) ----------------------------------
//
// The RE'd cabinet TIE does not fly dead-straight at the cockpit: it thrusts
// along its own heading while banking + steering toward the player, tracing a
// swooping arc (docs/tie-flight-ai-model.md §5). We port the confirmed
// kinematics at a CONSTANT approach speed (|vel| is preserved as the heading
// turns, so the 8-6 difficulty ramp still rides spawn speed); the full
// accelerate-from-rest + per-fighter script VM (§5.1/§5.3) is deferred. These are
// authentic-FEEL tuning values — the disassembly's rates are per cabinet-tick and
// not yet pinned to our dt (model §5.3 caveat) — single-sourced here for easy
// correction, like the rest of the Wave-1 constants.

/** Lateral bias blended into a TIE's homing heading, as a fraction of its forward
 * approach. 0 = the old beeline; >0 curves the path into a banking swoop arc. */
export const TIE_SWOOP_BIAS = 0.5
/** Roll angle (radians) a TIE holds while banking into its swoop (~34°), so the
 * orientation leans into the turn rather than sitting level (extends story 8-13). */
export const TIE_BANK_ANGLE = 0.6

// --- Wave 1 — TIE peel-away / fly-past lifecycle (story 9-3) -----------------
//
// An un-killed TIE must not fly all the way into the cockpit and balloon to a
// full-frame wall (the Image-1 defect). When it closes to TIE_NEAR_BOUND without
// landing a hit, it completes its pass and PEELS AWAY — thrusting outward so it
// flies past the cockpit and recedes out of the play volume, freeing its slot
// (docs/tie-flight-ai-model.md §7). A near-dead-center fighter (lateral offset
// inside the cockpit hit sphere) has no room to veer and still strafes through —
// a genuine collision still costs a shield (story AC#3; the model itself has no
// body collision, but the story deliberately keeps it — see the session
// deviations). Authentic-FEEL values, single-sourced here like the rest of the
// Wave-1 constants.

/** Range at which an un-killed TIE stops homing and peels away. It bounds the
 * nearest a peeling fighter ever gets, so no TIE renders as a full-frame wall
 * (the AC#2 near-bound). Sits well outside the cockpit hit sphere and well inside
 * the spawn distance. */
export const TIE_NEAR_BOUND = 350
/** Once a PEELING TIE has receded past this range it has left the play volume and
 * its slot is freed. Only peeling fighters are culled (the cull is gated on the
 * peel latch), so this sits well outside the peel trigger (TIE_NEAR_BOUND) — it
 * bounds the recession, not the spawn. Fresh, still-approaching TIEs spawn far
 * beyond it (at TIE_SPAWN_DISTANCE) and are never culled on arrival. */
export const TIE_EXIT_RANGE = 1800
/** How hard a peeling TIE sweeps sideways as it departs — the tangential blend
 * against the straight-outward radial. 0 = straight back out; 1 ≈ a 45° peel-off
 * to the side (the banking fly-past look). */
export const TIE_PEEL_SWEEP = 1

// --- Wave 2 surface constants -----------------------------------------------
//
// Authentic-FEEL, single-sourced here exactly as the Wave 1 constants are:
// StarWars.asm is raw 6809 with no symbolic surface tables (the 8-3 port already
// noted this), so these are chosen to play right and named for easy correction
// once deeper reverse-engineering recovers the real numbers.

/** Nominal skim height above the surface (the y=0 floor) at phase start. */
export const SKIM_ALTITUDE = 120
/** Below this clearance the ship scrapes the surface — a terrain crash. */
export const MIN_SKIM_ALTITUDE = 40
/** Points awarded for destroying a laser turret. */
export const TURRET_SCORE = 200
/** Seconds between turret spawns onto the surface ahead. */
export const TURRET_SPAWN_INTERVAL = 1.5
/** Maximum turrets on the surface at once. */
export const MAX_TURRETS = 4
/** Hit sphere around a turret for player bolts. */
export const TURRET_HIT_RADIUS = 200

// Internal tuning (not part of the test contract).

/** How fast the yoke flies the ship up/down (altitude units/second). */
export const ALTITUDE_RATE = 200
/** How fast the surface scrolls turrets toward the cockpit (units/second). */
export const TURRET_SCROLL_SPEED = 600

// --- Wave 3 trench constants ------------------------------------------------
//
// Authentic-FEEL, single-sourced here exactly as the Wave 1/2 constants are:
// StarWars.asm carries no symbolic trench tables, so these are chosen to play
// right and named for easy correction once deeper reverse-engineering recovers
// the real numbers. The trench run has ONE target — the exhaust port — that
// scrolls up the channel toward the cockpit; the player destroys it for the
// bonus or it reaches the cockpit and costs a shield.

/** Distance ahead (−Z) at which the exhaust port appears when the trench opens. */
export const EXHAUST_PORT_DISTANCE = 2400
/** Points awarded for destroying the exhaust port — the run's big payoff. */
export const TRENCH_BONUS = 1000
/** How fast the exhaust port scrolls toward the cockpit (units/second). */
export const TRENCH_SCROLL_SPEED = 500
/** Hit sphere around the exhaust port for player bolts (the octagon spans ~64). */
export const PORT_HIT_RADIUS = 120
/** Awarded on top of TRENCH_BONUS for a port kill with no prior trench shots —
 *  the arcade's "USE THE FORCE" bonus (findings ## Exhaust port & run outcome:
 *  the type-4 segment's one-shot `byte_4B36` latch fires `sub_97E3`, the
 *  Use-the-Force scoring trigger). findings ## Scoring tables: `byte_983B` is
 *  wave-indexed (5,000 / 10,000 / 25,000 / 50,000 for waves 1-4); we are not yet
 *  wave-scaled, so this pins the wave-1 base (`0,$50,0` → 5,000) — see docs
 *  Open follow-ups #11. */
export const FORCE_BONUS = 5000
/** Port distance (world units, −Z) at which the EXHAUST PORT AHEAD banner shows.
 *  findings ## HUD & framing / Open follow-ups #7 confirm "EXHAUST PORT AHEAD"
 *  as an authentic HUD string, but no ROM-recovered distance pins WHEN it first
 *  shows (only the hit/miss test's $800 approach window, findings ## Exhaust
 *  port & run outcome, which is the "close enough to resolve hit or miss"
 *  moment, not confirmed as the banner trigger). Kept as a tuned guess. */
export const PORT_AHEAD_RANGE = 1800 // PROVISIONAL(findings ## HUD & framing)

// --- Wave/phase progression constants ---------------------------------------
//
// A run escalates through the three phases in order (space -> surface ->
// trench); a phase is "cleared" when the player destroys its kill quota, at
// which point the run drops into the next phase. Authentic-FEEL like the Wave
// 1/2 constants: StarWars.asm carries no symbolic wave tables, so these are
// chosen to play right and single-sourced here for easy correction once deeper
// reverse-engineering recovers the real numbers.

/** TIEs to destroy to clear the space phase and dive to the Death Star surface. */
export const SPACE_WAVE_QUOTA = 6
/** Turrets to destroy to clear the surface phase and drop into the trench. */
export const SURFACE_WAVE_QUOTA = 4

export interface GameState {
  /** Run lifecycle: attract/title, an active run, or the game-over screen. */
  mode: Mode
  /** Which wave the run is on (1-based); drives the HUD and the difficulty ramp. */
  wave: number
  phase: Phase
  rng: Rng
  /** Crosshair / yoke aim, normalised [-1, 1] per axis. */
  aimX: number
  aimY: number
  /** Accumulated sim time (seconds) — drives the attract-mode wireframe spin. */
  t: number
  score: number
  lives: number
  /** Player height above the y=0 surface (Wave 2 terrain skim). */
  altitude: number
  /** How far the Death Star surface ground grid has scrolled toward the cockpit
   * (Wave 2, story 11-5). Advanced by TURRET_SCROLL_SPEED — the SAME flow that
   * scrolls the turrets — so the grid and turrets rush past together; read `mod
   * GRID_Z` by the surfaceGrid generator and reset to 0 on every phase entry. */
  surfaceScrollZ: number
  /** How far the walled trench channel has scrolled toward the cockpit (Wave 3,
   * story 11-6). Advanced by TRENCH_SCROLL_SPEED — the SAME rate that scrolls the
   * exhaust port up the channel — so the corridor and the port rush past together;
   * read `mod RIB_Z` by the trenchChannel generator and reset to 0 on every phase
   * entry. */
  trenchScrollZ: number
  /** Enemies destroyed in the CURRENT phase; clears the phase at its quota,
   * then resets to 0 on the transition into the next phase. */
  phaseKills: number
  /** Player bolts currently in flight. */
  projectiles: Projectile[]
  /** Live TIE fighters. */
  enemies: Enemy[]
  /** Laser turrets standing on the surface (Wave 2). */
  turrets: Turret[]
  /** The trench run's target (Wave 3): the exhaust port scrolling toward the
   * cockpit, or `null` when no run is active (space/surface, or destroyed). */
  exhaustPort: { pos: Vec3 } | null
  /** Trench wall turrets/squares (shootable, scored) and catwalks (hazard) —
   * seeded from TRENCH_OBSTACLE_STATIONS on entering the trench, scrolling
   * toward the cockpit alongside the port; empty in the other phases (fidelity
   * epic, findings ## Trench catwalks, turrets & wall squares). */
  trenchObstacles: TrenchObstacle[]
  /** Player bolts fired so far in the CURRENT trench run — the "Use the Force"
   * clean-run tell (fidelity epic, findings ## Exhaust port & run outcome).
   * Counts every `fire` this phase, including the killing torpedo; reset to 0
   * on every phase entry (like `phaseKills`). */
  trenchShotsFired: number
  /** Sim time (`t`) the FORCE_BONUS was last awarded, or `null` if it hasn't
   * been this run. Stamped by a clean port kill so the shell can show the
   * banner for a few seconds — including across the `clearRun` wave
   * transition, which re-stamps it after `enterPhase`'s reset (see `clearRun`
   * in sim.ts). Reset to `null` on every phase entry. */
  forceBonusAwardedAt: number | null
  /** Enemy fireballs currently in flight. */
  enemyShots: Projectile[]
  /** True once the last shield is lost — the wave is over. */
  gameOver: boolean
  /** Seconds until the trigger can fire again. */
  fireCooldown: number
  /** Seconds until the next TIE spawns into a free slot. */
  spawnTimer: number
  /** Seconds until the formation fires its next bolt. */
  enemyFireCooldown: number
  /** Gameplay moments emitted THIS frame for the shell's SFX engine to react
   * to (story 8-7). A fresh list every frame — never carried between frames —
   * so the channel stays pure DATA and replays identically from a seed. */
  events: GameEvent[]
}

export function initialState(seed = 1983): GameState {
  return {
    mode: 'playing',
    wave: 1,
    phase: 'space',
    rng: createRng(seed),
    aimX: 0,
    aimY: 0,
    t: 0,
    score: 0,
    lives: STARTING_LIVES,
    altitude: SKIM_ALTITUDE,
    surfaceScrollZ: 0,
    trenchScrollZ: 0,
    phaseKills: 0,
    projectiles: [],
    enemies: [],
    turrets: [],
    exhaustPort: null,
    trenchObstacles: [],
    trenchShotsFired: 0,
    forceBonusAwardedAt: null,
    enemyShots: [],
    gameOver: false,
    fireCooldown: 0,
    spawnTimer: SPAWN_INTERVAL,
    enemyFireCooldown: ENEMY_FIRE_INTERVAL,
    events: [],
  }
}
