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
  ENEMY_SHOT_HIT_RADIUS,
  ENEMY_FIRE_INTERVAL,
  WAVE_SIZE,
  MAX_FIREBALL_SLOTS,
  TIE_SCORE,
  FIREBALL_SCORE,
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
  EXHAUST_PORT_DISTANCE,
  TRENCH_SCROLL_SPEED,
  TRENCH_BONUS,
  PORT_HIT_RADIUS,
  TIE_SWOOP_BIAS,
  TIE_BANK_ANGLE,
  TIE_NEAR_BOUND,
  TIE_EXIT_RANGE,
  TIE_PEEL_SWEEP,
} from './state'
import type { Input } from './input'
import type { GameEvent } from './events'
import {
  add,
  scale,
  sub,
  normalize,
  length,
  cross,
  multiply,
  rotationZ,
  lookRotation,
  type Vec3,
} from './math3d'
import { aimDirection, collides, waveParams } from './gameRules'
import { nextFloat, nextInt, type Rng } from './rng'

const COCKPIT: Vec3 = [0, 0, 0]
const ZERO: Vec3 = [0, 0, 0]
/** World up — the reference the level "right" axis a TIE banks around is built from. */
const UP: Vec3 = [0, 1, 0]

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
    return { ...state, t, events: [] }
  }
  if (state.mode === 'gameover' || state.gameOver) {
    if (input.start) return { ...state, mode: 'attract', gameOver: false, t, aimX, aimY, events: [] }
    return { ...state, t, aimX, aimY, events: [] }
  }

  // Clone the RNG so the step never mutates its input — purity intact.
  const rng: Rng = { seed: state.rng.seed }

  // The frame's event channel — a FRESH list every step (story 8-7). Every phase
  // pushes its gameplay moments here; `progress` appends level-clear on a
  // transition. Never seeded from `state.events`, so events never carry over.
  const events: GameEvent[] = []

  // --- Player bolts: advance & expire, then fire on the trigger (all phases) -
  const projectiles = advance(state.projectiles, dt)
  let fireCooldown = state.fireCooldown - dt
  if (input.fire && fireCooldown <= 0) {
    projectiles.push({
      pos: [...COCKPIT] as Vec3,
      vel: scale(aimDirection(aimX, aimY, input.aspect), PROJECTILE_SPEED),
      ttl: PROJECTILE_TTL,
    })
    fireCooldown = FIRE_INTERVAL
    events.push({ type: 'fire' })
  }

  // Enemy/turret fire advances & expires the same way in every phase.
  const enemyShots = advance(state.enemyShots, dt)

  const common: StepCommon = { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots, events }

  // Each phase runs its own combat, then `progress` checks the kill quota and
  // drops the run into the next phase once the wave is cleared. The trench is
  // terminal here — its gameplay is story 8-5; for now it just holds safely.
  if (state.phase === 'surface') return progress(stepSurface(state, input, dt, common))
  if (state.phase === 'trench') return stepTrench(state, common, dt)

  // The wave's difficulty knobs: later waves spawn TIEs sooner, send them in
  // faster, and lob fireballs more often (gameRules.waveParams; wave 1 is today's
  // balance exactly). The phase machinery (quotas/transitions) is 8-8's and is
  // untouched — this only scales how hard the space phase plays.
  const params = waveParams(state.wave)

  // --- TIEs: advance, drop any that have peeled away, then spawn -----------
  // A TIE that has completed its pass and receded past the exit range has left
  // the play volume; dropping it here (before the spawn check) frees its slot so a
  // fresh fighter can take its place (story 9-3, AC#1).
  const movedEnemies = state.enemies
    .map((e) => moveEnemy(e, dt))
    .filter((e) => !(e.peeling && length(e.pos) > TIE_EXIT_RANGE))
  let spawnTimer = state.spawnTimer - dt
  if (spawnTimer <= 0 && movedEnemies.length < WAVE_SIZE) {
    movedEnemies.push(spawnTie(rng, params.enemySpeed))
    spawnTimer = params.spawnInterval
  }

  // --- Enemy fireballs: each TIE strafes during its own pass window ----------
  // The RE'd cabinet does NOT lob one bolt from a single random TIE on a shared
  // formation timer (docs/tie-flight-ai-model.md §6). Each fighter fires
  // INDEPENDENTLY while it is making its pass: in the firing arc (still
  // approaching — not peeled away) AND in range (past the pass-end near edge,
  // "not too close"). Each TIE carries its own fire cooldown, seeded the first time
  // it is seen from the squad clock `state.enemyFireCooldown` (so a parked clock
  // still suppresses every fighter); the per-wave cadence (waveParams) now paces an
  // individual fighter, not the squad. Fire is a pure function of each fighter's
  // pass — no shooter is drawn from the RNG — and the 6-slot cap is enforced per
  // shot so several fighters firing together never overflow it. The fireball still
  // launches from the firing TIE's own position, aimed at the cockpit at the origin.
  const enemies = movedEnemies.map((e) => {
    const cooldown = (e.fireCooldown ?? state.enemyFireCooldown) - dt
    const inPassWindow = !e.peeling && length(e.pos) > TIE_NEAR_BOUND
    if (inPassWindow && cooldown <= 0 && enemyShots.length < MAX_FIREBALL_SLOTS) {
      enemyShots.push({
        pos: [...e.pos] as Vec3,
        vel: scale(toCockpit(e.pos), ENEMY_SHOT_SPEED),
        ttl: ENEMY_SHOT_TTL,
      })
      events.push({ type: 'enemy-fire', pos: [...e.pos] as Vec3 })
      return { ...e, fireCooldown: params.enemyFireInterval }
    }
    return { ...e, fireCooldown: cooldown }
  })

  // The squad clock now only SEEDS a new fighter's first shot; keep it ticking
  // (floored at 0) so it carries a sane value into the surface phase, whose turret
  // fire still runs on a formation timer (stepSurface, unchanged).
  const enemyFireCooldown = Math.max(0, state.enemyFireCooldown - dt)

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
        events.push({ type: 'enemy-death', enemyType: 'tie', pos: [...enemies[ei].pos] as Vec3 })
        break
      }
    }
  }
  const standingEnemies = enemies.filter((_, i) => !killedTie.has(i))

  // --- Player bolts vs enemy fireballs: shoot incoming fire down (story 8-18) -
  // Mirror the TIE loop: one bolt downs one fireball, sharing `spentBolt` so a
  // bolt already spent on a TIE can't also kill a fireball. Intercepted
  // fireballs drop out HERE, before the cockpit-damage pass below, so a fireball
  // shot down never also costs a shield.
  const killedShot = new Set<number>()
  for (let si = 0; si < enemyShots.length; si++) {
    for (let pi = 0; pi < projectiles.length; pi++) {
      if (spentBolt.has(pi)) continue
      if (collides(enemyShots[si].pos, projectiles[pi].pos, ENEMY_SHOT_HIT_RADIUS)) {
        killedShot.add(si)
        spentBolt.add(pi)
        score += FIREBALL_SCORE
        events.push({ type: 'fireball-destroyed', pos: [...enemyShots[si].pos] as Vec3 })
        break
      }
    }
  }
  const standingShots = enemyShots.filter((_, i) => !killedShot.has(i))
  const liveBolts = projectiles.filter((_, i) => !spentBolt.has(i))

  // --- Cockpit damage: any TIE that reaches it, any fireball that lands -----
  // In space, every cockpit hit is an enemy kill of the player (cause 'enemy').
  let damage = 0
  const liveEnemies = standingEnemies.filter((e) => {
    if (collides(e.pos, COCKPIT, COCKPIT_HIT_RADIUS)) {
      damage++
      events.push({ type: 'player-death', cause: 'enemy' })
      return false
    }
    return true
  })
  const liveShots = standingShots.filter((s) => {
    if (collides(s.pos, COCKPIT, COCKPIT_HIT_RADIUS)) {
      damage++
      events.push({ type: 'player-death', cause: 'enemy' })
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
    events,
  })
}

/**
 * Begin a fresh run from the attract/title (or game-over) screen: a brand-new
 * wave-1 playing game. The current RNG seed carries forward untouched — framing
 * transitions never consume randomness — so a run is reproducible from its seed.
 */
function startRun(s: GameState): GameState {
  // The ship spawns into the cockpit — emit the run-start cue (story 8-7).
  return { ...initialState(s.rng.seed), events: [{ type: 'player-spawn' }] }
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
  /** The frame's event channel, pre-seeded with any player `fire`; each phase
   * pushes its own moments and `progress` appends level-clear. */
  events: GameEvent[]
}

/**
 * Wave 2 — Death Star surface. The ship skims the y=0 floor (the yoke flies it
 * up/down, and dipping too low scrapes a shield); laser turrets scroll in from
 * ahead, lob bolts at the cockpit, and fall to the player's fire.
 */
function stepSurface(state: GameState, input: Input, dt: number, common: StepCommon): GameState {
  const { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots, events } = common

  // --- Terrain skim: yoke flies up/down; can't pass the floor; scrape crashes
  let altitude = state.altitude + aimY * ALTITUDE_RATE * dt
  if (altitude < 0) altitude = 0
  let damage = 0
  if (altitude < MIN_SKIM_ALTITUDE) {
    damage++ // crashed into the surface — costs a shield...
    altitude = SKIM_ALTITUDE // ...and bumps the ship back to a safe height
    events.push({ type: 'terrain-crash' }) // its own cue, not a player-death
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
    events.push({ type: 'enemy-fire', pos: [...shooter.pos] as Vec3 })
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
        events.push({ type: 'enemy-death', enemyType: 'turret', pos: [...turrets[ti].pos] as Vec3 })
        break
      }
    }
  }
  const standingTurrets = turrets.filter((_, i) => !killed.has(i))
  const liveBolts = projectiles.filter((_, i) => !spentBolt.has(i))

  // --- Cockpit damage: any turret bolt that lands (cause 'turret') ----------
  const liveShots = enemyShots.filter((s) => {
    if (collides(s.pos, COCKPIT, COCKPIT_HIT_RADIUS)) {
      damage++
      events.push({ type: 'player-death', cause: 'turret' })
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
    events,
  }
}

/**
 * Wave 3 — the trench run (story 8-9). One target, the exhaust port, scrolls up
 * the channel toward the cockpit. The player either lands a bolt on it — the run
 * CLEARS, the bonus scores, and the next (harder) wave opens in the space phase —
 * or it reaches the cockpit un-destroyed and costs a shield. A trench with no
 * active port holds safely (the run's bolts still fly, but nothing scrolls,
 * scores, or damages), preserving the 8-8 terminal-hold edge case.
 */
function stepTrench(state: GameState, common: StepCommon, dt: number): GameState {
  const { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots, events } = common
  // `events` carries the prologue's `fire` cue (story 8-7) and accumulates the
  // trench's own moments below; it rides every return path so the channel stays
  // a fresh per-frame list.
  const base: GameState = { ...state, rng, t, aimX, aimY, projectiles, enemyShots, fireCooldown, events }

  // No active port → safe hold (no scroll, no score, no damage).
  if (state.exhaustPort === null) return base

  // Scroll the port up the channel toward the cockpit (+Z, toward z=0). A fresh
  // array keeps the step pure — the input state is never mutated.
  const port: Vec3 = [
    state.exhaustPort.pos[0],
    state.exhaustPort.pos[1],
    state.exhaustPort.pos[2] + TRENCH_SCROLL_SPEED * dt,
  ]

  // --- Player bolt vs the port: a hit clears the run and scores the bonus -----
  const hitBolt = projectiles.findIndex((b) => collides(port, b.pos, PORT_HIT_RADIUS))
  if (hitBolt >= 0) {
    const liveBolts = projectiles.filter((_, i) => i !== hitBolt)
    // The Death Star blows: the whole run clears and loops to the next wave's
    // space phase — emit the warp / wave-clear cue (8-7), as `clearRun` re-opens
    // 'space'. `clearRun` → `enterPhase` spreads `...s`, so this event rides along.
    events.push({ type: 'level-clear', next: 'space' })
    return clearRun({ ...base, projectiles: liveBolts, score: state.score + TRENCH_BONUS })
  }

  // --- The port reaching the cockpit un-destroyed is a crash: costs a shield --
  if (collides(port, COCKPIT, COCKPIT_HIT_RADIUS)) {
    const lives = Math.max(0, state.lives - 1)
    // Flying into the trench structure is a crash, not hostile fire — reuse the
    // terrain-crash cue (8-7) rather than widen player-death's cause union.
    events.push({ type: 'terrain-crash' })
    return {
      ...base,
      lives,
      gameOver: lives <= 0,
      mode: lives <= 0 ? 'gameover' : state.mode,
      exhaustPort: spawnPort(), // another pass down the trench
    }
  }

  // Otherwise the port keeps scrolling in toward the cockpit.
  return { ...base, exhaustPort: { pos: port } }
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
  // The trench has no quota-driven next phase: it clears via the exhaust-port
  // hit in stepTrench (which loops to the next wave), not through progress().
  trench: null,
}

/** Kills that clear a phase. The trench never clears by KILL count — it ends
 * when the exhaust port is destroyed (handled in stepTrench), so its quota is
 * unreachable here. */
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
  // The phase cleared — carry the frame's events forward and announce the warp.
  const advanced = enterPhase(s, next)
  return { ...advanced, events: [...s.events, { type: 'level-clear', next }] }
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
    // The trench opens with its target downrange; other phases carry no port.
    exhaustPort: phase === 'trench' ? spawnPort() : null,
    enemyShots: [],
    altitude: phase === 'surface' ? SKIM_ALTITUDE : s.altitude,
    spawnTimer: phase === 'surface' ? TURRET_SPAWN_INTERVAL : SPAWN_INTERVAL,
    enemyFireCooldown: ENEMY_FIRE_INTERVAL,
  }
}

/** A fresh exhaust port: centred on the run, far down −Z toward the player. */
function spawnPort(): { pos: Vec3 } {
  return { pos: [0, 0, -EXHAUST_PORT_DISTANCE] }
}

/**
 * Clear a completed run: the player nailed the exhaust port, so the whole run
 * (space → surface → trench) is done. Loop back to the space phase one wave
 * harder — this is the one place `wave` advances, engaging the difficulty ramp
 * (gameRules.waveParams). Score and lives carry forward; the bonus is already
 * added by the caller.
 */
function clearRun(s: GameState): GameState {
  return { ...enterPhase(s, 'space'), wave: s.wave + 1 }
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

/**
 * Advance a TIE one step. Two phases (story 9-3 adds the second):
 *
 *  - APPROACH (story 9-2, docs/tie-flight-ai-model.md §5): the TIE thrusts along a
 *    HEADING that blends homing-toward-the-player with its own lateral swoop bias,
 *    tracing a banking arc rather than a beeline at the cockpit.
 *  - PEEL-AWAY (story 9-3, §7): once an un-killed fighter closes to TIE_NEAR_BOUND
 *    with room to veer, it completes its pass and thrusts OUTWARD instead — flying
 *    past the cockpit and receding out of the play volume rather than ramming and
 *    ballooning to a full-frame wall (the Image-1 defect). A near-dead-center TIE
 *    (lateral offset inside the cockpit hit sphere) has nothing to veer around and
 *    keeps homing, so a genuine collision still costs a shield (AC#3).
 *
 * Its SPEED is preserved as the heading turns — the difficulty ramp rides |vel|
 * (story 8-6), and a stationary stand-in (|vel| = 0, the combat-kill-loop
 * fixtures) stays put. Pure: every heading and roll derives only from the TIE's
 * position and its seeded bias/peel latch — no time, no randomness here.
 */
function moveEnemy(e: Enemy, dt: number): Enemy {
  const speed = length(e.vel ?? ZERO)
  // A motionless stand-in holds station, still facing the cockpit.
  if (speed === 0) return { ...e, orient: lookRotation(toCockpit(e.pos)) }

  // Distance from the cockpit, and how far off its forward centerline (the −Z view
  // axis) the TIE sits — its room to veer past. Latch the peel once begun (`??`,
  // not `||`: an approaching TIE omits the flag, so the falsy default is correct);
  // otherwise begin it when an un-killed TIE reaches the near-bound off-centerline.
  const dist = length(e.pos)
  const lateralOffset = Math.hypot(e.pos[0], e.pos[1])
  const peeling = e.peeling ?? (dist <= TIE_NEAR_BOUND && lateralOffset >= COCKPIT_HIT_RADIUS)

  if (peeling) {
    // Thrust OUTWARD (away from the cockpit) with a tangential sweep, so the TIE
    // banks off to the side as it leaves rather than reversing straight back. The
    // outward component keeps |pos| growing every frame, so a peeling fighter never
    // re-enters the near-bound (it stays bounded away — AC#2) and eventually
    // crosses TIE_EXIT_RANGE, where stepGame frees its slot (AC#1).
    const outward = normalize(e.pos)
    const sweepAxis = normalize(cross(outward, UP)) // a level "side" axis to peel along
    const side = Math.sign(e.bank ?? 0) || 1 // continue the established bank; default +1
    const heading = normalize(add(outward, scale(sweepAxis, side * TIE_PEEL_SWEEP)))
    const vel = scale(heading, speed)
    const pos = add(e.pos, scale(vel, dt))
    const orient = multiply(lookRotation(heading), rotationZ(TIE_BANK_ANGLE * side))
    return { ...e, pos, vel, orient, peeling: true }
  }

  // Approach: home toward the cockpit along the banking swoop arc.
  const toCk = toCockpit(e.pos)
  const lateral = normalize(cross(toCk, UP)) // a level "right" axis at the cockpit
  const bias = e.bank ?? 0
  const heading = normalize(add(toCk, scale(lateral, bias))) // homing + swoop
  const vel = scale(heading, speed) // direction turns; magnitude is preserved
  const pos = add(e.pos, scale(vel, dt))
  // Bank into the turn: roll the look-along-heading frame about its own nose (+Z).
  const orient = multiply(lookRotation(heading), rotationZ(TIE_BANK_ANGLE * Math.sign(bias)))
  return { ...e, pos, vel, orient }
}

/** A fresh TIE: lateral-spread spawn far down −Z, aimed at the cockpit at the
 * wave's approach speed (gameRules.waveParams), with a seeded swoop direction so
 * each fighter banks into its own arc on the way in (story 9-2). */
function spawnTie(rng: Rng, speed: number): Enemy {
  const x = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const y = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const pos: Vec3 = [x, y, -SPAWN_DISTANCE]
  const dir = toCockpit(pos)
  const bank = (nextFloat(rng) < 0.5 ? 1 : -1) * TIE_SWOOP_BIAS
  return { pos, vel: scale(dir, speed), kind: 'tie', orient: lookRotation(dir), bank }
}

/** Unit vector from a world position back toward the cockpit at the origin. */
function toCockpit(pos: Vec3): Vec3 {
  return normalize(sub(COCKPIT, pos))
}
