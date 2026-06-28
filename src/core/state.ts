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

import type { Vec3 } from './math3d'
import { createRng, type Rng } from './rng'

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
}

/** A laser turret standing on the Death Star surface (Wave 2). World space. */
export interface Turret {
  /** World-space position (y ≈ 0, on the floor). The hit-test reads this. */
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

/** Player bolt speed (units/second), fired down the aim direction. */
export const PROJECTILE_SPEED = 900
/** Distance ahead (−Z) at which TIEs appear. */
export const SPAWN_DISTANCE = 1200
/** Half-width of the lateral box TIEs spawn within. */
export const SPAWN_SPREAD = 350
/** TIE approach speed (units/second). */
export const ENEMY_SPEED = 120
/** Enemy fireball speed (units/second). */
export const ENEMY_SHOT_SPEED = 300
/** Enemy fireball lifetime (seconds). */
export const ENEMY_SHOT_TTL = 6
/** Seconds between enemy fireballs (whole formation). */
export const ENEMY_FIRE_INTERVAL = 1
/** Maximum enemy fireballs on screen at once — authentic "6 fireball slots". */
export const MAX_FIREBALL_SLOTS = 6
/** Hit sphere around a TIE for player bolts (covers the model extent). */
export const TIE_HIT_RADIUS = 250
/** Hit sphere around the cockpit for enemy contact and fire. */
export const COCKPIT_HIT_RADIUS = 80

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
    phaseKills: 0,
    projectiles: [],
    enemies: [],
    turrets: [],
    exhaustPort: null,
    enemyShots: [],
    gameOver: false,
    fireCooldown: 0,
    spawnTimer: SPAWN_INTERVAL,
    enemyFireCooldown: ENEMY_FIRE_INTERVAL,
  }
}
