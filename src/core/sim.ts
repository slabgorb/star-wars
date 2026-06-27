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

import type { GameState, Projectile, Enemy } from './state'
import {
  PROJECTILE_TTL,
  PROJECTILE_SPEED,
  FIRE_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_DISTANCE,
  SPAWN_SPREAD,
  ENEMY_SPEED,
  ENEMY_SHOT_SPEED,
  ENEMY_SHOT_TTL,
  ENEMY_FIRE_INTERVAL,
  WAVE_SIZE,
  MAX_FIREBALL_SLOTS,
  TIE_SCORE,
  TIE_HIT_RADIUS,
  COCKPIT_HIT_RADIUS,
} from './state'
import type { Input } from './input'
import { add, scale, sub, normalize, type Vec3 } from './math3d'
import { aimDirection, collides } from './gameRules'
import { nextFloat, nextInt, type Rng } from './rng'

const COCKPIT: Vec3 = [0, 0, 0]
const ZERO: Vec3 = [0, 0, 0]

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  const t = state.t + dt
  const aimX = input.aimX
  const aimY = input.aimY

  // Once the last shield is gone the wave is over: track time and aim, but leave
  // the battlefield frozen as it lies.
  if (state.gameOver) {
    return { ...state, t, aimX, aimY }
  }

  // Clone the RNG so the step never mutates its input — purity intact.
  const rng: Rng = { seed: state.rng.seed }

  // --- Player bolts: advance & expire, then fire on the trigger -------------
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

  // --- TIEs: advance, then spawn into a free slot --------------------------
  const enemies = state.enemies.map((e) => moveEnemy(e, dt))
  let spawnTimer = state.spawnTimer - dt
  if (spawnTimer <= 0 && enemies.length < WAVE_SIZE) {
    enemies.push(spawnTie(rng))
    spawnTimer = SPAWN_INTERVAL
  }

  // --- Enemy fireballs: advance & expire, then a TIE fires at the cockpit ---
  const enemyShots = advance(state.enemyShots, dt)
  let enemyFireCooldown = state.enemyFireCooldown - dt
  if (enemyFireCooldown <= 0 && enemies.length > 0 && enemyShots.length < MAX_FIREBALL_SLOTS) {
    const shooter = enemies[nextInt(rng, enemies.length)]
    enemyShots.push({
      pos: [...shooter.pos] as Vec3,
      vel: scale(toCockpit(shooter.pos), ENEMY_SHOT_SPEED),
      ttl: ENEMY_SHOT_TTL,
    })
    enemyFireCooldown = ENEMY_FIRE_INTERVAL
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

  return {
    ...state,
    rng,
    t,
    aimX,
    aimY,
    score,
    lives,
    gameOver: lives <= 0,
    projectiles: liveBolts,
    enemies: liveEnemies,
    enemyShots: liveShots,
    fireCooldown,
    spawnTimer,
    enemyFireCooldown,
  }
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

/** A fresh TIE: lateral-spread spawn far down −Z, aimed at the cockpit. */
function spawnTie(rng: Rng): Enemy {
  const x = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const y = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const pos: Vec3 = [x, y, -SPAWN_DISTANCE]
  return { pos, vel: scale(toCockpit(pos), ENEMY_SPEED), kind: 'tie' }
}

/** Unit vector from a world position back toward the cockpit at the origin. */
function toCockpit(pos: Vec3): Vec3 {
  return normalize(sub(COCKPIT, pos))
}
