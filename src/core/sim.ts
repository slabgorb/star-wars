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
import type { GameState, Projectile, Enemy, Turret, Phase, TrenchObstacle } from './state'
import {
  PROJECTILE_TTL,
  PROJECTILE_SPEED,
  FIRE_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_DISTANCE,
  TIE_SPAWN_DISTANCE,
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
  CATWALK_HIT_RADIUS,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  ALTITUDE_RATE,
  TURRET_SPAWN_INTERVAL,
  TURRET_SCROLL_SPEED,
  MAX_TURRETS,
  TURRET_SCORE,
  TURRET_HIT_RADIUS,
  TOWER_HEIGHT,
  TOWER_FIRE_GRACE,
  BUNKER_SPAWN_CHANCE,
  SPACE_WAVE_QUOTA,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  EXHAUST_PORT_DISTANCE,
  TRENCH_SCROLL_SPEED,
  TRENCH_BONUS,
  PORT_HIT_RADIUS,
  FORCE_BONUS,
  TIE_SWOOP_BIAS,
  TIE_BANK_ANGLE,
  TIE_NEAR_BOUND,
  TIE_EXIT_RANGE,
  TIE_PEEL_SWEEP,
} from './state'
import type { Input } from './input'
import type { GameEvent, SpeechLine, MusicTrack } from './events'
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
} from '@arcade/shared/math3d'
import { aimDirection, collides, waveParams } from './gameRules'
import { nextFloat, nextInt, type Rng } from '@arcade/shared/rng'
import { stepNameEntry } from '@arcade/shared/name-entry'
import {
  spawnTrenchObstacles,
  TRENCH_TURRET_SCORE,
  TRENCH_SQUARE_SCORE,
  OBSTACLE_HIT_RADIUS,
} from './trench-obstacles'
import { TRENCH_VIEW_HALF_W, TRENCH_VIEW_FLOOR, TRENCH_VIEW_RATE } from './trench-channel'

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
    const startHeld = input.start === true
    if (state.entry !== null) {
      // SH2-13: the ARMED initials entry gates the exit. A start press can
      // neither abandon the run's score (incomplete buffer → inert) nor
      // auto-commit it — the confirm fires only on a RISING edge (the
      // startPrev register) with all MAX_INITIALS typed, so a press held
      // across the entry-screen transition (or machine-gunned by a key-repeat
      // latch) never commits. The commit is announced as a GameEvent; the
      // shell owns the table and persists on the cue.
      if (startHeld && !state.startPrev && state.entry.initials.length === MAX_INITIALS) {
        return {
          ...state,
          mode: 'attract',
          gameOver: false,
          entry: null,
          startPrev: startHeld,
          t,
          aimX,
          aimY,
          events: [{ type: 'name-entered', name: state.entry.initials }],
        }
      }
      return { ...state, startPrev: startHeld, t, aimX, aimY, events: [] }
    }
    if (startHeld) {
      return { ...state, mode: 'attract', gameOver: false, startPrev: startHeld, t, aimX, aimY, events: [] }
    }
    return { ...state, startPrev: startHeld, t, aimX, aimY, events: [] }
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
  // pass — no shooter is drawn from the RNG — and the per-wave concurrency cap
  // (waveParams.maxConcurrentShots, the RE'd §8 fire table, story 9-5) is enforced
  // per shot: the ROM-faithful wave 1 keeps a single fireball aloft, climbing to the
  // full 6-slot pool by wave 7, so fighters firing together never overflow the wave's
  // allowance. The fireball still launches from the firing TIE's own position, aimed
  // at the cockpit at the origin.
  const enemies = movedEnemies.map((e) => {
    const cooldown = (e.fireCooldown ?? state.enemyFireCooldown) - dt
    const inPassWindow = !e.peeling && length(e.pos) > TIE_NEAR_BOUND
    if (inPassWindow && cooldown <= 0 && enemyShots.length < params.maxConcurrentShots) {
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
  // The ship spawns into the cockpit — emit the run-start cue (story 8-7) and
  // Luke reporting in over the comm (sw2-5).
  return {
    ...initialState(s.rng.seed),
    events: [
      { type: 'player-spawn' },
      { type: 'speech', line: 'redFiveStandingBy' },
      // Open the space theme on the run-start edge (sw3-5). Wave 1 is odd but < 3,
      // so it is never the Imperial March here — musicTrackFor still owns the rule.
      { type: 'music', track: musicTrackFor('space', 1) },
    ],
  }
}

/** Initials the entry screen collects — the 3-char arcade convention. One of
 * star-wars' per-cabinet NUMBERS; the entry VERB itself is the cabinet-wide
 * shared reducer (SH2-13). */
const MAX_INITIALS = 3

/**
 * Arm the high-score initials entry on the game-over screen (SH2-13, retiring
 * the shell's silent 'ACE' auto-tag). The SHELL calls this on the qualifying
 * playing→gameover edge — main.ts owns the table, so qualification is only
 * computable there; once armed, the core owns the machine and announces the
 * commit as a `name-entered` GameEvent. Inert outside the game-over screen.
 */
export function beginNameEntry(state: GameState): GameState {
  if (state.mode !== 'gameover' && !state.gameOver) return state
  return { ...state, entry: { initials: '' } }
}

/** One initials keydown on the armed entry screen. A PURE core event function
 * the shell calls per keydown — typed letters are edge events, not per-frame
 * held state, so they never ride on Input. The shared reducer
 * (@arcade/shared/name-entry) appends A–Z uppercased up to MAX_INITIALS and
 * deletes on Backspace (never past empty); every other key is inert. Inert
 * without an armed entry; a no-op returns the same state. */
export function enterInitial(state: GameState, key: string): GameState {
  if ((state.mode !== 'gameover' && !state.gameOver) || state.entry === null) return state
  const initials = stepNameEntry(state.entry.initials, key, MAX_INITIALS)
  if (initials === state.entry.initials) return state
  return { ...state, entry: { initials } }
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

  // --- Ground objects: scroll toward the cockpit with the surface, spawn ----
  const turrets = state.turrets
    .map((turret): Turret => {
      const pos: Vec3 = [turret.pos[0], turret.pos[1], turret.pos[2] + TURRET_SCROLL_SPEED * dt]
      // age toward fire grace; keep the kind (bunker/tower) riding along
      return { ...turret, pos, age: (turret.age ?? 0) + dt }
    })
    .filter((turret) => turret.pos[2] < 0) // drop those that have scrolled past
  let spawnTimer = state.spawnTimer - dt
  if (spawnTimer <= 0 && turrets.length < MAX_TURRETS) {
    turrets.push(spawnTurret(rng))
    spawnTimer = TURRET_SPAWN_INTERVAL
  }

  // --- A tower lobs a fireball from its white cap on the fire cadence -------
  // Only towers past their fire grace may shoot (Story sw2-3): a freshly-risen
  // tower holds fire for TOWER_FIRE_GRACE so round-1 firing is a readable beat,
  // not instant. The fireball erupts from the white cap up at TOWER_HEIGHT (the
  // tower's gun), not from the floor, and heads for the cockpit from there.
  // Bunkers don't fire (sw3-11): a shorty lobbing from TOWER_HEIGHT would erupt
  // from empty air — whether bunkers fire at all (and from where) is an open
  // ROM question logged in the story's Delivery Findings.
  const armed = turrets.filter(
    (turret) => turret.kind !== 'bunker' && (turret.age ?? 0) >= TOWER_FIRE_GRACE,
  )
  let enemyFireCooldown = state.enemyFireCooldown - dt
  if (enemyFireCooldown <= 0 && armed.length > 0 && enemyShots.length < MAX_FIREBALL_SLOTS) {
    const shooter = armed[nextInt(rng, armed.length)]
    const muzzle: Vec3 = [shooter.pos[0], shooter.pos[1] + TOWER_HEIGHT, shooter.pos[2]]
    enemyShots.push({
      pos: muzzle,
      vel: scale(toCockpit(muzzle), ENEMY_SHOT_SPEED),
      ttl: ENEMY_SHOT_TTL,
    })
    enemyFireCooldown = ENEMY_FIRE_INTERVAL
    events.push({ type: 'enemy-fire', pos: [...muzzle] as Vec3 })
  }

  // --- Player bolts vs ground objects: destroy on contact, score per kill --
  // Towers advance phaseKills toward the towersForWave quota; BUNKERS DO NOT
  // (sw3-11): the ROM's BUNKER maze macro never increments `.TWRS`, so bunkers
  // are shootable but quota-neutral — a bunker kill can never eat into the
  // byte_98CB count or trigger the cleared-all bonus.
  let score = state.score
  let towerKills = 0
  const killed = new Set<number>()
  const spentBolt = new Set<number>()
  for (let ti = 0; ti < turrets.length; ti++) {
    for (let pi = 0; pi < projectiles.length; pi++) {
      if (spentBolt.has(pi)) continue
      if (collides(turrets[ti].pos, projectiles[pi].pos, TURRET_HIT_RADIUS)) {
        killed.add(ti)
        spentBolt.add(pi)
        score += TURRET_SCORE
        if (turrets[ti].kind !== 'bunker') towerKills++
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
    // The ground grid rides the SAME flow as the turrets (story 11-5) — both
    // advance by TURRET_SCROLL_SPEED·dt — so they rush past the cockpit together.
    surfaceScrollZ: state.surfaceScrollZ + TURRET_SCROLL_SPEED * dt,
    gameOver: lives <= 0,
    mode: lives <= 0 ? 'gameover' : state.mode,
    phaseKills: state.phaseKills + towerKills, // towers only — bunkers are quota-neutral
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
  // Fly the pilotable viewpoint (story sw3-2): the yoke drives the eye each tick,
  // clamped to the sub_703B band — ±TRENCH_VIEW_HALF_W lateral, TRENCH_VIEW_FLOOR..0
  // vertical (the eye seats at the trench top and dives DOWN to dodge). Rides
  // `base`, so it survives even the no-port safe-hold return below (afterObstacles
  // spreads base); the trench catwalk collision tests the catwalk against it.
  const trenchView: Vec3 = [
    Math.max(-TRENCH_VIEW_HALF_W, Math.min(TRENCH_VIEW_HALF_W, state.trenchView[0] + aimX * TRENCH_VIEW_RATE * dt)),
    Math.max(TRENCH_VIEW_FLOOR, Math.min(0, state.trenchView[1] + aimY * TRENCH_VIEW_RATE * dt)),
    0,
  ]
  // The walled channel scrolls toward the cockpit at the SAME rate the port does
  // (story 11-6), so the corridor and the target rush past together — advanced on
  // `base` so it rides every return path (reset to 0 on the next phase entry).
  // Advance the trench voice-line timer (ROM word_4B0E) one tick and cue any
  // parity-gated voice line that lands on this tick (story sw3-4). The timer hits
  // each integer threshold exactly once, so the cue is inherently one-shot — no
  // re-fire guard needed. Pushed onto the shared `events` list, so the cue rides
  // every return path below (safe-hold, obstacle crash, or port hit).
  const trenchTimer = state.trenchTimer + 1
  const parity: 'even' | 'odd' = state.wave % 2 === 0 ? 'even' : 'odd'
  for (const cue of TRENCH_VOICE_CUES) {
    if (cue.timer === trenchTimer && cue.parity === parity) {
      events.push({ type: 'speech', line: cue.line })
    }
  }

  const base: GameState = {
    ...state,
    rng,
    t,
    aimX,
    aimY,
    projectiles,
    enemyShots,
    fireCooldown,
    events,
    trenchView,
    trenchTimer,
    trenchScrollZ: state.trenchScrollZ + TRENCH_SCROLL_SPEED * dt,
    // Count this frame's fire (if any) toward the "Use the Force" clean-run
    // tell — a clean port kill needs trenchShotsFired <= 1 (fidelity epic,
    // task 4; findings ## Exhaust port & run outcome).
    trenchShotsFired: state.trenchShotsFired + (events.some((e) => e.type === 'fire') ? 1 : 0),
  }

  // --- Trench obstacles: scroll with the channel; shoot turrets/squares; -----
  // --- catwalks crash the cockpit (findings ## Trench catwalks, turrets &
  // --- wall squares). Runs BEFORE the port logic below (and before the
  // --- no-port safe hold) so obstacles are live even on a passless trench, and
  // --- consumes bolts from `base.projectiles` so a bolt spent on an obstacle
  // --- can't also kill the port this same frame.
  let bolts = base.projectiles
  let obstacleScore = 0
  const survivors: TrenchObstacle[] = []
  let crashedCatwalk = false
  for (const o of state.trenchObstacles) {
    const pos: Vec3 = [o.pos[0], o.pos[1], o.pos[2] + TRENCH_SCROLL_SPEED * dt]
    if (o.kind === 'catwalk') {
      // Hazard check FIRST, before the despawn cutoff below: a catwalk starting
      // right at the cockpit's doorstep can scroll past z=0 in the same step
      // that carries it through the cockpit's hit sphere, and the crash must
      // still register rather than being silently despawned. Uses
      // CATWALK_HIT_RADIUS, not COCKPIT_HIT_RADIUS: the catwalk hangs at y=200
      // above the centreline, so an 80-unit cockpit sphere never reached it and
      // the crash was dead code (story 14-7).
      // Tests against the pilotable `trenchView`, not the fixed COCKPIT (story
      // sw3-2): an un-piloted eye seats at [0,0,0] (dist 200 < 240 → still bites),
      // but a dive opens clearance beneath the catwalk so it becomes dodgeable.
      if (collides(pos, trenchView, CATWALK_HIT_RADIUS)) {
        crashedCatwalk = true
        events.push({ type: 'terrain-crash' })
        continue // crashed through it — removed
      }
    } else {
      const hit = bolts.findIndex((b) => collides(pos, b.pos, OBSTACLE_HIT_RADIUS))
      if (hit >= 0) {
        bolts = bolts.filter((_, i) => i !== hit)
        obstacleScore += o.kind === 'turret' ? TRENCH_TURRET_SCORE : TRENCH_SQUARE_SCORE
        events.push({ type: 'trench-obstacle-destroyed', kind: o.kind })
        continue
      }
    }
    if (pos[2] > 0) continue // scrolled past the cockpit — despawn
    survivors.push({ kind: o.kind, pos })
  }
  const afterObstacles: GameState = {
    ...base,
    projectiles: bolts,
    score: base.score + obstacleScore,
    trenchObstacles: survivors,
    ...(crashedCatwalk
      ? {
          lives: Math.max(0, base.lives - 1),
          gameOver: base.lives - 1 <= 0,
          mode: base.lives - 1 <= 0 ? ('gameover' as const) : base.mode,
        }
      : {}),
  }

  // No active port → safe hold (no score, no damage; the empty channel still scrolls).
  if (state.exhaustPort === null) return afterObstacles

  // Scroll the port up the channel toward the cockpit (+Z, toward z=0). A fresh
  // array keeps the step pure — the input state is never mutated.
  const port: Vec3 = [
    state.exhaustPort.pos[0],
    state.exhaustPort.pos[1],
    state.exhaustPort.pos[2] + TRENCH_SCROLL_SPEED * dt,
  ]

  // --- Player bolt vs the port: a hit clears the run and scores the bonus -----
  // Reads `afterObstacles.projectiles` (post-obstacle bolts), not the raw
  // `projectiles` — a bolt already spent destroying a turret/square this frame
  // cannot also detonate the port.
  const hitBolt = afterObstacles.projectiles.findIndex((b) => collides(port, b.pos, PORT_HIT_RADIUS))
  if (hitBolt >= 0) {
    const liveBolts = afterObstacles.projectiles.filter((_, i) => i !== hitBolt)
    // "Use the Force": a clean run — no trench shots before the killing torpedo
    // itself — awards FORCE_BONUS on top of TRENCH_BONUS (fidelity epic, task 4;
    // findings ## Exhaust port & run outcome, the type-4 marker's one-shot latch).
    const clean = afterObstacles.trenchShotsFired <= 1 // only the killing torpedo
    const bonus = TRENCH_BONUS + (clean ? FORCE_BONUS : 0)
    if (clean) events.push({ type: 'force-bonus', amount: FORCE_BONUS })
    // Han's line on the winning shot — cued on ANY port kill (clean or not), so
    // it is independent of the clean-run Force bonus above (sw2-5).
    events.push({ type: 'speech', line: 'greatShotKidThatWasOneInAMillion' })
    // The Death Star BLOWS (sw2-4): a positioned explosion cue at the port's own
    // spot, emitted BEFORE the level-clear warp below so the shell stages the boom
    // before the jump to the next wave. `[...port]` keeps the step pure.
    events.push({ type: 'death-star-destroyed', pos: [...port] as Vec3 })
    // The whole run clears and loops to the next wave's space phase — emit the
    // warp / wave-clear cue (8-7), as `clearRun` re-opens 'space'. `clearRun` →
    // `enterPhase` spreads `...s`, so this event rides along.
    events.push({ type: 'level-clear', next: 'space' })
    // Reopen the space theme for the next wave (sw3-5) — `clearRun` bumps the wave
    // to `state.wave + 1`, so the Imperial March takes over here at wave>=3 odd
    // (ROM sub_6838). Rides through `clearRun`->`enterPhase` like the level-clear.
    events.push({ type: 'music', track: musicTrackFor('space', state.wave + 1) })
    return clearRun({
      ...afterObstacles,
      projectiles: liveBolts,
      score: afterObstacles.score + bonus,
      forceBonusAwardedAt: clean ? t : null,
      // Stamp the kill so the shell's Death-Star explosion survives the warp to
      // space that `clearRun` triggers this same frame (sw2-4). Unlike the Force
      // bonus, this fires on ANY port kill, clean or not.
      deathStarDestroyedAt: t,
    })
  }

  // --- The port reaching the cockpit un-destroyed is a crash: costs a shield --
  if (collides(port, COCKPIT, COCKPIT_HIT_RADIUS)) {
    const lives = Math.max(0, afterObstacles.lives - 1)
    // The run is LOST — the port slipped past un-destroyed. A distinct miss cue
    // (sw2-4) so the shell can say "YOU MISSED", separate from the crash tell.
    events.push({ type: 'exhaust-port-missed' })
    // Flying into the trench structure is a crash, not hostile fire — reuse the
    // terrain-crash cue (8-7) rather than widen player-death's cause union.
    events.push({ type: 'terrain-crash' })
    return {
      ...afterObstacles,
      lives,
      gameOver: lives <= 0,
      mode: lives <= 0 ? 'gameover' : afterObstacles.mode,
      exhaustPort: spawnPort(), // another pass down the trench
      // Stamp the miss so the shell can show a distinct "you missed" tell for a
      // beat (sw2-4), separate from the terrain-crash cue above.
      exhaustPortMissedAt: t,
    }
  }

  // Otherwise the port keeps scrolling in toward the cockpit.
  return { ...afterObstacles, exhaustPort: { pos: port } }
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

/** Kills that clear a phase this frame. Space is a flat quota; the SURFACE is
 * wave-scaled — the authentic ROM `byte_98CB` tower count (sw3-3), replacing the
 * old flat 4-kill quota; the trench never clears by KILL count (the exhaust-port
 * hit in stepTrench ends it), so its quota is unreachable here. Exhaustive over
 * Phase so a new phase can't silently default to a wrong quota. */
function phaseQuota(s: GameState): number {
  switch (s.phase) {
    case 'space':
      return SPACE_WAVE_QUOTA
    case 'surface':
      return towersForWave(s.wave)
    case 'trench':
      return Infinity
  }
}

/** The looping music track a phase opens with (sw3-5). The space wave swaps to the
 *  Imperial March at wave >= 3 AND odd (ROM `sub_6838`); the towers/trench themes are
 *  wave-independent. Track names are the ROM sound-board music (findings ## Sound
 *  hooks) — the surface phase's music is "Towers music", hence 'towers', not
 *  'surface'. */
const PHASE_MUSIC: Record<Phase, MusicTrack> = {
  space: 'space',
  surface: 'towers',
  trench: 'trench',
}

/** Which looping track opens `phase` on the wave `wave`. Only the space wave is
 *  wave-sensitive (the Imperial March replaces it at wave>=3 odd). */
function musicTrackFor(phase: Phase, wave: number): MusicTrack {
  if (phase === 'space' && wave >= 3 && wave % 2 === 1) return 'imperialMarch'
  return PHASE_MUSIC[phase]
}

/** The voice line cued when a run ENTERS a phase (sw2-5). Only the surface and
 * trench edges carry a line; a new wave's space phase (reached via clearRun, not
 * progress) has none. A `Partial` map so an unwired phase simply cues nothing. */
const ENTER_PHASE_SPEECH: Partial<Record<Phase, SpeechLine>> = {
  surface: 'lookAtTheSizeOfThatThing', // "Look at the size of that thing"
  trench: 'useTheForceLuke', // "Use the Force, Luke"
}

/** The trench voice lines cued off the timer (`trenchTimer` = ROM `word_4B0E`),
 * gated by run parity. The 1983 cabinet gates on `byte_4B12` (the trench
 * section-chain index); until that lands in sw3-7 we source parity from `wave`
 * (sw3-4 scope decision): EVEN wave → "Luke, trust me" @16 + "Yahoo, you're all
 * clear kid" @24; ODD wave → "The Force is strong in this one" @22. A line fires
 * on the single step the timer equals its threshold — one-shot, no re-fire.
 * (docs/star-wars-1983-source-findings.md, "Voice-line triggers by trench timer".) */
const TRENCH_VOICE_CUES: ReadonlyArray<{
  timer: number
  parity: 'even' | 'odd'
  line: SpeechLine
}> = [
  { timer: 16, parity: 'even', line: 'lukeTrustMe' }, // Sound_18
  { timer: 24, parity: 'even', line: 'youreAllClearKid' }, // Sound_1A
  { timer: 22, parity: 'odd', line: 'theForceIsStrongInThisOne' }, // Sound_16
]

/**
 * Drop the run into the next phase once the current one is cleared. A finished
 * run never advances; phases advance in order, one at a time; score and lives
 * carry forward untouched.
 */
function progress(s: GameState): GameState {
  if (s.gameOver) return s
  if (s.phaseKills < phaseQuota(s)) return s
  const next = NEXT_PHASE[s.phase]
  if (next === null) return s
  // The phase cleared — carry the frame's events forward, announce the warp, and
  // cue the entering phase's voice line if it has one (sw2-5).
  const advanced = enterPhase(s, next)
  const events: GameEvent[] = [...s.events, { type: 'level-clear', next }]
  const line = ENTER_PHASE_SPEECH[next]
  if (line) events.push({ type: 'speech', line })
  // Swap the looping music channel to the entering phase's theme (sw3-5). Fires on
  // this edge only; `enterPhase` preserves the wave, so surface->'towers' /
  // trench->'trench' regardless of wave (the Imperial March is a space-only swap).
  // Pushed BEFORE the tower-bonus early return so the surface->trench edge still
  // carries its 'trench' music cue.
  events.push({ type: 'music', track: musicTrackFor(next, advanced.wave) })
  // Clearing every tower on the surface banks the 50,000 "cleared all towers"
  // bonus and cues its banner — ONCE, on the drop into the trench (sw3-3).
  if (s.phase === 'surface') {
    events.push({ type: 'tower-bonus', amount: SURFACE_CLEAR_BONUS })
    return { ...advanced, score: advanced.score + SURFACE_CLEAR_BONUS, events }
  }
  return { ...advanced, events }
}

/**
 * Open a fresh phase: zero the kill counter and clear what the previous phase
 * left behind — no TIEs on the surface, no turrets in the trench, no stray
 * ordnance chasing the ship between phases. Score and lives are preserved; the
 * surface opens at the nominal skim height so the run never arrives mid-crash.
 *
 * Exported so the dev phase-jump (story 11-4) reuses the EXACT same transition
 * rather than hand-mutating `state.phase` — keeping a jumped scene consistent
 * with one reached through normal progression.
 */
export function enterPhase(s: GameState, phase: Phase): GameState {
  return {
    ...s,
    phase,
    phaseKills: 0,
    enemies: [],
    turrets: [],
    // The trench opens with its target downrange; other phases carry no port.
    exhaustPort: phase === 'trench' ? spawnPort() : null,
    // ...and its wall obstacles (fidelity epic, task 3); other phases carry none.
    trenchObstacles: phase === 'trench' ? spawnTrenchObstacles() : [],
    // The "Use the Force" clean-run tell resets on every phase entry, like
    // phaseKills/trenchScrollZ (fidelity epic, task 4) — `clearRun` below
    // re-stamps `forceBonusAwardedAt` after this reset so the banner survives
    // the wave transition.
    trenchShotsFired: 0,
    // The trench voice-line timer restarts on every phase entry so each fresh
    // trench run re-arms the parity-gated cues from tick 0 (story sw3-4).
    trenchTimer: 0,
    forceBonusAwardedAt: null,
    // Outcome-feedback stamps reset on every phase entry, like forceBonusAwardedAt
    // (sw2-4); `clearRun` re-stamps `deathStarDestroyedAt` so the explosion banner
    // survives the wave transition, and a fresh trench never opens mid-"missed".
    deathStarDestroyedAt: null,
    exhaustPortMissedAt: null,
    enemyShots: [],
    altitude: phase === 'surface' ? SKIM_ALTITUDE : s.altitude,
    // Reset the surface scroll on every phase entry so a fresh (or jumped) surface
    // always opens with the ground grid anchored at the cockpit (story 11-5).
    surfaceScrollZ: 0,
    // Likewise the trench channel scroll, so a fresh (or jumped) trench always
    // opens with the corridor anchored at the cockpit (story 11-6).
    trenchScrollZ: 0,
    // Seat the pilotable viewpoint at the centreline on every phase entry (story
    // sw3-2), so a fresh trench opens un-dived — the overhead catwalk still bites
    // until the pilot steers clear.
    trenchView: [0, 0, 0],
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
  // `enterPhase` resets `forceBonusAwardedAt` to null (every phase entry does,
  // like `trenchScrollZ`) — re-stamp it here so a clean port kill's banner
  // survives into the next wave's space phase (fidelity epic, task 4).
  // `deathStarDestroyedAt` rides along the same way so the explosion beat survives
  // the warp too (sw2-4).
  return {
    ...enterPhase(s, 'space'),
    wave: s.wave + 1,
    forceBonusAwardedAt: s.forceBonusAwardedAt,
    deathStarDestroyedAt: s.deathStarDestroyedAt,
  }
}

/** A fresh ground object: lateral-spread spawn far down −Z, on the floor.
 *  The seeded RNG decides tower vs bunker (sw3-11) — the ROM's fixed per-wave
 *  mazes mix both at roughly a 1-in-3 bunker rate (see BUNKER_SPAWN_CHANCE). */
function spawnTurret(rng: Rng): Turret {
  const x = (nextFloat(rng) * 2 - 1) * SPAWN_SPREAD
  const pos: Vec3 = [x, 0, -SPAWN_DISTANCE]
  const kind = nextFloat(rng) < BUNKER_SPAWN_CHANCE ? 'bunker' : 'tower'
  return { pos, age: 0, kind } // fresh — a tower holds fire for TOWER_FIRE_GRACE
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
  const pos: Vec3 = [x, y, -TIE_SPAWN_DISTANCE]
  const dir = toCockpit(pos)
  const bank = (nextFloat(rng) < 0.5 ? 1 : -1) * TIE_SWOOP_BIAS
  return { pos, vel: scale(dir, speed), kind: 'tie', orient: lookRotation(dir), bank }
}

/** Unit vector from a world position back toward the cockpit at the origin. */
function toCockpit(pos: Vec3): Vec3 {
  return normalize(sub(COCKPIT, pos))
}
