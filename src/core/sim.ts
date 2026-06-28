// src/core/sim.ts
//
// The pure step. Deterministic: identical (state, input, dt) yields identical
// state. Time only ever enters here as `dt`; randomness only ever comes from
// `state.rng`. This boundary is what makes the game unit-testable and
// frame-rate independent — the same rule that anchors tempest.
//
// Wave 1 — space combat: the player's bolts fly down the aim direction; TIEs
// spawn into their slots and bear down on the cockpit; the formation lobs
// fireballs back; bolts kill TIEs (score), and TIEs or fireballs that reach the
// cockpit cost a shield. Every spatial test routes through the Math Box and the
// rule helpers — there is no ad-hoc geometry in here.

import { initialState } from './state'
import type { GameState, Projectile, Enemy, Turret, Phase } from './state'
import {
  PROJECTILE_TTL,
  PROJECTILE_SPEED,
  FIRE_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_DISTANCE,
  SPAWN_SPREAD,
  ENEMY_SHOT_SPEED,
  ENEMY_SHOT_TTL,
  ENEMY_FIRE_INTERVAL,
  WAVE_SIZE,
  MAX_FIREBALL_SLOTS,
  TIE_SCORE,
  TIE_HIT_RADIUS,
  COCKPIT_HIT_RADIUS,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  ALTITUDE_RATE,
  TURRET_SPAWN_INTERVAL,
  TURRET_SCROLL_SPEED,
  MAX_TURRETS,
  TURRET_SCORE,
  TURRET_HIT_RADIUS,
  SPACE_WAVE_QUOTA,
  SURFACE_WAVE_QUOTA,
} from './state'
import type { Input } from './input'
import { add, scale, sub, normalize, type Vec3 } from './math3d'
import { aimDirection, collides, waveParams } from './gameRules'
import { nextFloat, nextInt, type Rng } from './rng'

const COCKPIT: Vec3 = [0, 0, 0]
const ZERO: Vec3 = [0, 0, 0]

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const t = state.t + dt
  const aimX = input.aimX
  const aimY = input.aimY

  // --- Run lifecycle framing (story 8-6) -----------------------------------
  // The attract/title screen idles (the wireframe keeps spinning on `t`) and only
  // `start` matters — it begins a fresh run. A run that has ended holds the
  // battlefield frozen until `start` returns to attract. Both screens ignore the
  // gameplay inputs, so attract -> playing -> gameover -> attract is the whole
  // loop. Active play is the fall-through below (mode === 'playing').
  if (state.mode === 'attract') {
    if (input.start) return startRun(state)
    return { ...state, t }
  }
  if (state.mode === 'gameover' || state.gameOver) {
    if (input.start) return { ...state, mode: 'attract', gameOver: false, t, aimX, aimY }
    return { ...state, t, aimX, aimY }
  }

  // Clone the RNG so the step never mutates its input — purity intact.
  const rng: Rng = { seed: state.rng.seed }

  // --- Player bolts: advance & expire, then fire on the trigger (all phases) -
  const projectiles = advance(state.projectiles, dt)
  let fireCooldown = state.fireCooldown - dt
  if (input.fire && fireCooldown <= 0) {
    projectiles.push({
      pos: [...COCKPIT] as Vec3,
      vel: scale(aimDirection(aimX, aimY), PROJECTILE_SPEED),
      ttl: PROJECTILE_TTL,
    })
    fireCooldown = FIRE_INTERVAL
  }

  // Enemy/turret fire advances & expires the same way in every phase.
  const enemyShots = advance(state.enemyShots, dt)

  const common: StepCommon = { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots }

  // Each phase runs its own combat, then `progress` checks the kill quota and
  // drops the run into the next phase once the wave is cleared. The trench is
  // terminal here — its gameplay is story 8-5; for now it just holds safely.
  if (state.phase === 'surface') return progress(stepSurface(state, input, dt, common))
  if (state.phase === 'trench') return stepTrench(state, common)

  // The wave's difficulty knobs: later waves spawn TIEs sooner, send them in
  // faster, and lob fireballs more often (gameRules.waveParams; wave 1 is today's
  // balance exactly). The phase machinery (quotas/transitions) is 8-8's and is
  // untouched — this only scales how hard the space phase plays.
  const params = waveParams(state.wave)

  // --- TIEs: advance, then spawn into a free slot --------------------------
  const enemies = state.enemies.map((e) => moveEnemy(e, dt))
  let spawnTimer = state.spawnTimer - dt
  if (spawnTimer <= 0 && enemies.length < WAVE_SIZE) {
    enemies.push(spawnTie(rng, params.enemySpeed))
    spawnTimer = params.spawnInterval
  }

  // --- Enemy fireballs: a TIE fires at the cockpit -------------------------
  let enemyFireCooldown = state.enemyFireCooldown - dt
  if (enemyFireCooldown <= 0 && enemies.length > 0 && enemyShots.length < MAX_FIREBALL_SLOTS) {
    const shooter = enemies[nextInt(rng, enemies.length)]
    enemyShots.push({
      pos: [...shooter.pos] as Vec3,
      vel: scale(toCockpit(shooter.pos), ENEMY_SHOT_SPEED),
      ttl: ENEMY_SHOT_TTL,
    })
    enemyFireCooldown = params.enemyFireInterval
  }

  // --- Player bolts vs TIEs: destroy on contact, score per kill ------------
  let score = state.score
  const killedTie = new Set<number>()
  const spentBolt = new Set<number>()
  for (let ei = 0; ei < enemies.length; ei++) {
    for (let pi = 0; pi < projectiles.length; pi++) {
      if (spentBolt.has(pi)) continue
      if (collides(enemies[ei].pos, projectiles[pi].pos, TIE_HIT_RADIUS)) {
        killedTie.add(ei)
        spentBolt.add(pi)
        score += TIE_SCORE
        break
      }
    }
  }
  const standingEnemies = enemies.filter((_, i) => !killedTie.has(i))
  const liveBolts = projectiles.filter((_, i) => !spentBolt.has(i))

  // --- Cockpit damage: any TIE that reaches it, any fireball that lands -----
  let damage = 0
  const liveEnemies = standingEnemies.filter((e) => {
    if (collides(e.pos, COCKPIT, COCKPIT_HIT_RADIUS)) {
      damage++
      return false
    }
    return true
  })
  const liveShots = enemyShots.filter((s) => {
    if (collides(s.pos, COCKPIT, COCKPIT_HIT_RADIUS)) {
      damage++
      return false
    }
    return true
  })

  const lives = Math.max(0, state.lives - damage)

  return progress({
    ...state,
    rng,
    t,
    aimX,
    aimY,
    score,
    lives,
    gameOver: lives <= 0,
    mode: lives <= 0 ? 'gameover' : state.mode,
    phaseKills: state.phaseKills + killedTie.size,
    projectiles: liveBolts,
    enemies: liveEnemies,
    enemyShots: liveShots,
    fireCooldown,
    spawnTimer,
    enemyFireCooldown,
  })
}

/**
 * Begin a fresh run from the attract/title (or game-over) screen: a brand-new
 * wave-1 playing game. The current RNG seed carries forward untouched — framing
 * transitions never consume randomness — so a run is reproducible from its seed.
 */
function startRun(s: GameState): GameState {
  return initialState(s.rng.seed)
}

/** Pieces the shared prologue already computed, threaded into a phase step. */
interface StepCommon {
  t: number
  aimX: number
  aimY: number
  rng: Rng
  projectiles: Projectile[]
  fireCooldown: number
  enemyShots: Projectile[]
}

/**
 * Wave 2 — Death Star surface. The ship skims the y=0 floor (the yoke flies it
 * up/down, and dipping too low scrapes a shield); laser turrets scroll in from
 * ahead, lob bolts at the cockpit, and fall to the player's fire.
 */
function stepSurface(state: GameState, input: Input, dt: number, common: StepCommon): GameState {
  const { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots } = common

  // --- Terrain skim: yoke flies up/down; can't pass the floor; scrape crashes
  let altitude = state.altitude + aimY * ALTITUDE_RATE * dt
  if (altitude < 0) altitude = 0
  let damage = 0
  if (altitude < MIN_SKIM_ALTITUDE) {
    damage++ // crashed into the surface — costs a shield...
    altitude = SKIM_ALTITUDE // ...and bumps the ship back to a safe height
  }

  // --- Turrets: scroll toward the cockpit with the surface, then spawn ------
  const turrets = state.turrets
    .map((turret): Turret => {
      const pos: Vec3 = [turret.pos[0], turret.pos[1], turret.pos[2] + TURRET_SCROLL_SPEED * dt]
      return { pos }
    })
    .filter((turret) => turret.pos[2] < 0) // drop those that have scrolled past
  let spawnTimer = state.spawnTimer - dt
  if (spawnTimer <= 0 && turrets.length < MAX_TURRETS) {
    turrets.push(spawnTurret(rng))
    spawnTimer = TURRET_SPAWN_INTERVAL
  }

  // --- A turret lobs a bolt at the cockpit on the fire cadence --------------
  let enemyFireCooldown = state.enemyFireCooldown - dt
  if (enemyFireCooldown <= 0 && turrets.length > 0 && enemyShots.length < MAX_FIREBALL_SLOTS) {
    const shooter = turrets[nextInt(rng, turrets.length)]
    enemyShots.push({
      pos: [...shooter.pos] as Vec3,
      vel: scale(toCockpit(shooter.pos), ENEMY_SHOT_SPEED),
      ttl: ENEMY_SHOT_TTL,
    })
    enemyFireCooldown = ENEMY_FIRE_INTERVAL
  }

  // --- Player bolts vs turrets: destroy on contact, score per kill ---------
  let score = state.score
  const killed = new Set<number>()
  const spentBolt = new Set<number>()
  for (let ti = 0; ti < turrets.length; ti++) {
    for (let pi = 0; pi < projectiles.length; pi++) {
      if (spentBolt.has(pi)) continue
      if (collides(turrets[ti].pos, projectiles[pi].pos, TURRET_HIT_RADIUS)) {
        killed.add(ti)
        spentBolt.add(pi)
        score += TURRET_SCORE
        break
      }
    }
  }
  const standingTurrets = turrets.filter((_, i) => !killed.has(i))
  const liveBolts = projectiles.filter((_, i) => !spentBolt.has(i))

  // --- Cockpit damage: any turret bolt that lands --------------------------
  const liveShots = enemyShots.filter((s) => {
    if (collides(s.pos, COCKPIT, COCKPIT_HIT_RADIUS)) {
      damage++
      return false
    }
    return true
  })

  const lives = Math.max(0, state.lives - damage)

  return {
    ...state,
    rng,
    t,
    aimX,
    aimY,
    score,
    lives,
    altitude,
    gameOver: lives <= 0,
    mode: lives <= 0 ? 'gameover' : state.mode,
    phaseKills: state.phaseKills + killed.size,
    projectiles: liveBolts,
    turrets: standingTurrets,
    enemyShots: liveShots,
    fireCooldown,
    spawnTimer,
    enemyFireCooldown,
  }
}

/**
 * Wave 3 — the trench run. Its gameplay (catwalks, the exhaust port, the bonus)
 * is story 8-5 and not built yet; reaching the trench is what story 8-8 wires.
 * Until 8-5 lands the trench is a SAFE TERMINAL HOLD: the run arrives and the
 * cockpit still tracks and fires, but nothing spawns, scores, or damages, and the
 * phase does not advance. 8-5 replaces this hold with the real trench.
 */
function stepTrench(state: GameState, common: StepCommon): GameState {
  const { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots } = common
  return { ...state, rng, t, aimX, aimY, projectiles, enemyShots, fireCooldown }
}

// --- Wave/phase progression -------------------------------------------------
//
// A run escalates through the three phases in order; clearing a phase's kill
// quota drops it into the next. The order and quotas are total over Phase, so
// the third phase can never be forgotten (the type makes the table exhaustive).

/** The phase a cleared phase advances into — `null` for the terminal trench. */
const NEXT_PHASE: Record<Phase, Phase | null> = {
  space: 'surface',
  surface: 'trench',
  trench: null, // terminal until story 8-5 builds the trench gameplay
}

/** Kills that clear a phase. The trench never auto-clears (end of the run). */
const PHASE_QUOTA: Record<Phase, number> = {
  space: SPACE_WAVE_QUOTA,
  surface: SURFACE_WAVE_QUOTA,
  trench: Infinity,
}

/**
 * Drop the run into the next phase once the current one is cleared. A finished
 * run never advances; phases advance in order, one at a time; score and lives
 * carry forward untouched.
 */
function progress(s: GameState): GameState {
  if (s.gameOver) return s
  if (s.phaseKills < PHASE_QUOTA[s.phase]) return s
  const next = NEXT_PHASE[s.phase]
  if (next === null) return s
  return enterPhase(s, next)
}

/**
 * Open a fresh phase: zero the kill counter and clear what the previous phase
 * left behind — no TIEs on the surface, no turrets in the trench, no stray
 * ordnance chasing the ship between phases. Score and lives are preserved; the
 * surface opens at the nominal skim height so the run never arrives mid-crash.
 */
function enterPhase(s: GameState, phase: Phase): GameState {
  return {
    ...s,
    phase,
    phaseKills: 0,
    enemies: [],
    turrets: [],
    enemyShots: [],
    altitude: phase === 'surface' ? SKIM_ALTITUDE : s.altitude,
    spawnTimer: phase === 'surface' ? TURRET_SPAWN_INTERVAL : SPAWN_INTERVAL,
    enemyFireCooldown: ENEMY_FIRE_INTERVAL,
  }
}

/** A fresh turret: lateral-spread spawn far down −Z, standing on the floor. */
function spawnTurret(rng: Rng): Turret {
  const x = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const pos: Vec3 = [x, 0, -SPAWN_DISTANCE]
  return { pos }
}

/** Move bolts by their velocity, age them, and drop the expired. New array. */
function advance(bolts: readonly Projectile[], dt: number): Projectile[] {
  const out: Projectile[] = []
  for (const b of bolts) {
    const ttl = b.ttl - dt
    if (ttl <= 0) continue
    out.push({ pos: add(b.pos, scale(b.vel ?? ZERO, dt)), vel: b.vel, ttl })
  }
  return out
}

/** Advance a TIE along its velocity toward the cockpit. New object. */
function moveEnemy(e: Enemy, dt: number): Enemy {
  return { ...e, pos: add(e.pos, scale(e.vel ?? ZERO, dt)) }
}

/** A fresh TIE: lateral-spread spawn far down −Z, aimed at the cockpit at the
 * wave's approach speed (gameRules.waveParams). */
function spawnTie(rng: Rng, speed: number): Enemy {
  const x = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const y = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const pos: Vec3 = [x, y, -SPAWN_DISTANCE]
  return { pos, vel: scale(toCockpit(pos), speed), kind: 'tie' }
}

/** Unit vector from a world position back toward the cockpit at the origin. */
function toCockpit(pos: Vec3): Vec3 {
  return normalize(sub(COCKPIT, pos))
}
