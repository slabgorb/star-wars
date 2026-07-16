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
import { mazeForWave } from './surfaceMazes'
import type { GameState, Projectile, Enemy, Turret, Phase, TrenchObstacle, DyingTie } from './state'
import {
  PROJECTILE_TTL,
  PROJECTILE_SPEED,
  FIRE_INTERVAL,
  SPAWN_INTERVAL,
  SPAWN_DISTANCE,
  TIE_SPAWN_DISTANCE,
  ENEMY_SHOT_SPEED,
  ENEMY_SHOT_TTL,
  ENEMY_SHOT_HIT_RADIUS,
  TICK_HZ,
  ENEMY_FIRE_INTERVAL,
  WAVE_SIZE,
  MAX_FIREBALL_SLOTS,
  TIE_SCORE,
  VADER_SCORE,
  DARTH_GLOW_SECONDS,
  FIREBALL_SCORE,
  TIE_HIT_RADIUS,
  TIE_DEATH_SECONDS,
  COCKPIT_HIT_RADIUS,
  CATWALK_HIT_RADIUS,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  MAX_SKIM_ALTITUDE,
  BUNKER_MUZZLE_HEIGHT,
  BUNKER_CRASH_CEILING,
  OBJECT_CRASH_LATERAL,
  ALTITUDE_RATE,
  TURRET_SPAWN_INTERVAL,
  TURRET_SCROLL_SPEED,
  TURRET_SCORE,
  TURRET_HIT_RADIUS,
  TOWER_HEIGHT,
  TOWER_FIRE_GRACE,
  SPACE_WAVE_QUOTA,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  EXHAUST_PORT_DISTANCE,
  TRENCH_SCROLL_SPEED,
  TRENCH_BONUS,
  PORT_HIT_RADIUS,
  PORT_APPROACH_WINDOW,
  FORCE_BONUS,
  TIE_SWOOP_BIAS,
  TIE_BANK_ANGLE,
  TIE_NEAR_BOUND,
  TIE_EXIT_RANGE,
  TIE_PEEL_SWEEP,
  EXTRA_LIFE_THRESHOLDS,
  BONUS_FLASH_MAX,
  BONUS_FLASH_DECAY,
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
import { aimDirection, collides, sweptCollides, waveParams } from './gameRules'
import { createRng, nextFloat, nextInt, type Rng } from '@arcade/shared/rng'
import { stepNameEntry } from '@arcade/shared/name-entry'
import {
  spawnTrenchObstacles,
  TRENCH_TURRET_SCORE,
  TRENCH_SQUARE_SCORE,
  OBSTACLE_HIT_RADIUS,
} from './trench-obstacles'
import {
  TRENCH_VIEW_HALF_W,
  TRENCH_VIEW_RATE,
  TRENCH_EYE_MIN,
  TRENCH_EYE_MAX,
  TRENCH_EYE_SEAT,
} from './trench-channel'
import { waveSpawnPlan } from './tie-waves'

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
    // THE GUN IS ON THE SHIP (story sw5-6; surface edition sw7-16). Wherever the pilot's eye
    // rides, the bolt leaves from THERE. Spawning at the world origin while the eye flies above it
    // puts the crosshair ray and the bolt ray on parallel lines, and everything the crosshair
    // lands on is missed underneath by exactly that gap. In the trench the ship is `trenchView`
    // (the pilot flies 512..3840 above the floor); on the surface it is [0, altitude, 0] (40..238
    // above it). Only in space is the ship the fixed cockpit at the origin. `shipPoint` is that
    // one point, per phase — see it for the whole story.
    //
    // ROM: `WSGUNS.MAC FRPTGN` spawns the shot at the ship — `LDD M$TX / ADDD #100 ;JUST A BIT IN
    // FRONT`, `LDD M$TY` (lateral), `LDD M$TZ` (height).
    const muzzle: Vec3 = shipPoint(state)
    projectiles.push({
      pos: muzzle,
      vel: scale(aimDirection(aimX, aimY, input.aspect), PROJECTILE_SPEED),
      ttl: PROJECTILE_TTL,
    })
    fireCooldown = FIRE_INTERVAL
    events.push({ type: 'fire' })
  }

  // Enemy fire advances & expires each step. SPACE-phase TIE fireballs HOME on the
  // cockpit (ROM sub_A875, story sw4-2 / spec §B): their position decays 7/8 per
  // cabinet tick toward the origin, so an un-shot shot ALWAYS arrives. Surface/trench
  // fire still flies straight (out of sw4-2's scope; the trench carries no fire).
  const enemyShots =
    state.phase === 'space'
      ? homeShots(state.enemyShots, dt)
      : advance(state.enemyShots, dt)

  const common: StepCommon = { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots, events }

  // Each phase runs its own combat, then `progress` checks the kill quota and
  // drops the run into the next phase once the wave is cleared. The trench is
  // terminal here — its gameplay is story 8-5; for now it just holds safely.
  if (state.phase === 'surface') return finalizeScore(state, progress(stepSurface(state, input, dt, common)))
  if (state.phase === 'trench') return finalizeScore(state, stepTrench(state, common, dt))

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
    // Decay Darth's post-hit glow (the A$GLW window); plain TIEs never carry it.
    .map((e) => (e.glow ? { ...e, glow: Math.max(0, e.glow - dt) } : e))
    .filter((e) => !(e.peeling && length(e.pos) > TIE_EXIT_RANGE))
  let spawnTimer = state.spawnTimer - dt
  let spawnCount = state.spawnCount
  if (spawnTimer <= 0 && movedEnemies.length < WAVE_SIZE) {
    // Walk the authentic TBG lateral table in order (sw4-1) — the spawn counter is
    // the deterministic per-slot index, advanced only when a fighter actually spawns.
    // The counter also indexes the wave's TSPWAV plan (sw7-12) so the RTH slot spawns
    // Darth; the plan is per-wave, walked 0-based from SP.WAV = state.wave − 1.
    movedEnemies.push(spawnTie(rng, params.enemySpeed, spawnCount, state.wave - 1))
    spawnCount += 1
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
        // The homing law (homeShots) drives the fireball by decaying this position
        // toward the cockpit — it carries no straight-line velocity (sw4-2, spec §B).
        pos: [...e.pos] as Vec3,
        vel: [0, 0, 0],
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
  // A killed TIE also spawns its exploded-fragment death cue (story sw3-8), so it
  // breaks apart on screen instead of blinking out; older cues age and expire.
  let score = state.score
  const killedTie = new Set<number>()
  const spentBolt = new Set<number>()
  const spawnedDying: DyingTie[] = []
  // Darth indices that took a SCORING hit this frame — they survive (KEEP DARTH
  // ALIVE) but re-arm their glow window below so they cannot be re-scored yet.
  const darthScored = new Set<number>()
  for (let ei = 0; ei < enemies.length; ei++) {
    for (let pi = 0; pi < projectiles.length; pi++) {
      if (spentBolt.has(pi)) continue
      if (collides(enemies[ei].pos, projectiles[pi].pos, TIE_HIT_RADIUS)) {
        spentBolt.add(pi)
        if (enemies[ei].kind === 'darth') {
          // Darth is immortal in space: CPHTSA resets his hit counter to keep him
          // alive (WSCPU.MAC:367-368), so a laser hit never destroys him. He scores
          // 2,000 (SCRDARTH) once per hit, gated by the post-hit glow so a burst
          // does not re-score while he is "glowing from a hit" (WSCPU.MAC:346-348).
          if ((enemies[ei].glow ?? 0) <= 0 && !darthScored.has(ei)) {
            score += VADER_SCORE
            darthScored.add(ei)
          }
          break
        }
        killedTie.add(ei)
        score += TIE_SCORE
        events.push({ type: 'enemy-death', enemyType: 'tie', pos: [...enemies[ei].pos] as Vec3 })
        spawnedDying.push({ pos: [...enemies[ei].pos] as Vec3, age: 0 })
        break
      }
    }
  }
  const standingEnemies = enemies
    // Re-arm the glow window on every Darth that scored — a killed mook is dropped
    // by the filter, but a hit Darth survives and starts his no-double-jeopardy timer.
    .map((e, i) => (darthScored.has(i) ? { ...e, glow: DARTH_GLOW_SECONDS } : e))
    .filter((_, i) => !killedTie.has(i))
  // Age existing death cues and drop the finished ones, then add this frame's kills.
  const dyingTies: DyingTie[] = [
    ...state.dyingTies
      .map((d) => ({ pos: d.pos, age: d.age + dt }))
      .filter((d) => d.age <= TIE_DEATH_SECONDS),
    ...spawnedDying,
  ]

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
  pushFarewell(events, lives) // fatal hit → the end-of-game farewell (sw7-8, U-017)

  return finalizeScore(
    state,
    progress({
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
      dyingTies,
      enemyShots: liveShots,
      fireCooldown,
      spawnTimer,
      spawnCount,
      enemyFireCooldown,
      events,
    }),
  )
}

/**
 * Fold the frame's SCORE change into its lives + HUD flash (sw3-6). Runs once at
 * every active-play return, so it catches score from any phase (TIE/fireball,
 * turrets, trench obstacles, the exhaust-port + Force bonus, the cleared-all-towers
 * bonus) uniformly:
 *
 * - Awards one bonus shield per EXTRA_LIFE_THRESHOLDS entry (400,000 / 800,000)
 *   the first time the score reaches it — a loop over prev-vs-new score, so a
 *   single frame's delta can cross both and grant both (do NOT ×10 the thresholds).
 * - Arms `bonusFlash` to full on any score change, else decays it toward 0 — the
 *   ROM `byte_4B2C` "score changed, redraw HUD" flash. Clamped at 0 so it lands
 *   exactly on rest, never negative.
 *
 * `prev` is the frame's input state (its `score`/`bonusFlash` are the pre-step
 * values); `next` is the fully-stepped state whose `score` is final.
 */
function finalizeScore(prev: GameState, next: GameState): GameState {
  const scoreChanged = next.score !== prev.score
  let lives = next.lives
  for (const threshold of EXTRA_LIFE_THRESHOLDS) {
    if (prev.score < threshold && next.score >= threshold) lives += 1
  }
  const bonusFlash = scoreChanged
    ? BONUS_FLASH_MAX
    : Math.max(0, prev.bonusFlash - BONUS_FLASH_DECAY)
  return { ...next, lives, bonusFlash }
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
  // The ROM's flight-band ceiling (sw7-5): GD$MXT caps the climb below the
  // tower tops, so towers can't be hopped and the maze can fight back.
  if (altitude > MAX_SKIM_ALTITUDE) altitude = MAX_SKIM_ALTITUDE
  let damage = 0
  if (altitude < MIN_SKIM_ALTITUDE) {
    damage++ // crashed into the surface — costs a shield...
    altitude = SKIM_ALTITUDE // ...and bumps the ship back to a safe height
    events.push({ type: 'terrain-crash' }) // its own cue, not a player-death
  }

  // THE SHIP, now that it has flown this frame (sw7-16 / R11a). The eye is here (render.ts
  // `cameraView`), so the maze aims its fire HERE and the cockpit hit-test is centred HERE — the
  // origin is the floor, `altitude` below the pilot, and nothing about him lives there.
  const ship = surfaceShip(altitude)

  // --- Ground objects: lay the authored WSGRND maze once, then scroll it in --
  // sw4-3: the surface is the wave's fixed, hand-authored WSGRND tower maze —
  // NOT a random spawner. Lay the whole field on the first surface frame (unless
  // turrets were hand-placed, so pre-seated fixtures/saves are respected), then
  // the existing scroll/cull machinery translates the field toward the cockpit
  // and drops each object as it sweeps past (a finite, single-pass field).
  let surfaceMazeLaid = state.surfaceMazeLaid
  let field = state.turrets
  if (!surfaceMazeLaid) {
    if (field.length === 0) field = mazeField(state.wave)
    surfaceMazeLaid = true
  }
  const scrolled = field.map((turret): Turret => {
    const pos: Vec3 = [turret.pos[0], turret.pos[1], turret.pos[2] + TURRET_SCROLL_SPEED * dt]
    // age toward fire grace; keep the kind (bunker/tower/bishop) riding along
    return { ...turret, pos, age: (turret.age ?? 0) + dt }
  })
  const turrets = scrolled.filter((turret) => turret.pos[2] < 0) // still ahead of the cockpit

  // --- Ship↔object collision (sw7-5 / D-020): the maze fights back ----------
  // ROM GDVIEW: closing on a standing tower glows the shields and crashes
  // (`JSR BG1GLW` / `JSR AUDCR ;AND CRASH INTO TOWER`, WSGRND.MAC:901-912) with
  // NO height gate — a tower can't be overflown (the flight band tops out below
  // the cap). A bunker crashes only when the ship is BELOW its top
  // (WSGRND.MAC:940-946) — cruise clears it. One crash = one shield: BG1GLW
  // latches through GS.GLW (WSGLOW.MAC:58-64). The clone latches on the cull
  // edge instead: an object crashes on the single frame it sweeps past the
  // cockpit plane (its scrolled z crosses 0), the same speed-widened moment as
  // the ROM's `M.XP - $200 - speed` time-window — the crashed object is NOT destroyed
  // (no enemy-death, no score) — it flies off behind, like the cabinet's.
  for (const passed of scrolled) {
    if (passed.pos[2] < 0) continue // still in flight — only plane-crossers crash
    if (Math.abs(passed.pos[0]) > OBJECT_CRASH_LATERAL) continue // off the flight line
    const kind = passed.kind ?? 'tower' // absent kind == tower (sw3-11 back-compat)
    if (kind === 'bunker' && altitude >= BUNKER_CRASH_CEILING) continue // overflown
    damage++
    events.push({ type: 'object-crash', kind, pos: [...passed.pos] as Vec3 })
  }

  // --- Every standing ground object fires on the cadence --------------------
  // Only objects past their fire grace may shoot (Story sw2-3): a freshly-risen
  // one holds fire for TOWER_FIRE_GRACE so round-1 firing is a readable beat,
  // not instant. Towers/bishops fire from the white cap up at TOWER_HEIGHT (the
  // tower's gun); BUNKERS FIRE TOO (sw7-5 / D-016 — the ROM's "open question"
  // is answered: GDGUN dispatches PC$BNK to GDBNKGN, `LBHI GDBNKGN ;>2==>BUNKER
  // GUN`, WSGRND.MAC:1200), from their LOW body (BUNKER_MUZZLE_HEIGHT), within
  // the clone's homing-fireball model (house rule D-017 — not the ROM's
  // directional FRB*GN guns; its distance-weighted fire chance is a logged
  // Delivery Finding, not ported).
  const armed = turrets.filter((turret) => (turret.age ?? 0) >= TOWER_FIRE_GRACE)
  let enemyFireCooldown = state.enemyFireCooldown - dt
  if (enemyFireCooldown <= 0 && armed.length > 0 && enemyShots.length < MAX_FIREBALL_SLOTS) {
    const shooter = armed[nextInt(rng, armed.length)]
    const muzzleY = (shooter.kind ?? 'tower') === 'bunker' ? BUNKER_MUZZLE_HEIGHT : TOWER_HEIGHT
    const muzzle: Vec3 = [shooter.pos[0], shooter.pos[1] + muzzleY, shooter.pos[2]]
    enemyShots.push({
      pos: muzzle,
      // At the SHIP, not at the origin (sw7-16): the pilot is flying `altitude` above the floor,
      // so fire laid on the origin passes harmlessly under him. Deliberately not `toCockpit` —
      // that one is space's, and belongs to the TIE flight model.
      vel: scale(normalize(sub(ship, muzzle)), ENEMY_SHOT_SPEED),
      ttl: ENEMY_SHOT_TTL,
    })
    enemyFireCooldown = ENEMY_FIRE_INTERVAL
    events.push({ type: 'enemy-fire', pos: [...muzzle] as Vec3 })
  }

  // --- Player bolts vs ground objects: destroy on contact, score per kill --
  // Towers advance phaseKills toward the towersForWave quota; BUNKERS DO NOT
  // (sw3-11): the ROM's BUNKER maze macro never increments `.TWRS`, so bunkers
  // are shootable but quota-neutral — a bunker kill can never eat into the maze's
  // tower count (`.TWRS`/TTWRS) or trigger the cleared-all bonus.
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
  // Centred on the SHIP, not the origin (sw7-16): the hit sphere flies with the pilot. Left at the
  // origin it both missed fire that reached him and "hit" him with fire that passed under.
  const liveShots = enemyShots.filter((s) => {
    if (collides(s.pos, ship, COCKPIT_HIT_RADIUS)) {
      damage++
      events.push({ type: 'player-death', cause: 'turret' })
      return false
    }
    return true
  })

  const lives = Math.max(0, state.lives - damage)
  pushFarewell(events, lives) // fatal hit → the end-of-game farewell (sw7-8, U-017)

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
    surfaceMazeLaid,
    gameOver: lives <= 0,
    mode: lives <= 0 ? 'gameover' : state.mode,
    phaseKills: state.phaseKills + towerKills, // towers only — bunkers are quota-neutral
    projectiles: liveBolts,
    turrets: standingTurrets,
    enemyShots: liveShots,
    fireCooldown,
    // The surface no longer runs a turret spawn timer (sw4-3 replaced the random
    // spawner with the fixed maze field); pass it through untouched.
    spawnTimer: state.spawnTimer,
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
  // Fly the pilotable viewpoint (story sw3-2, re-framed by sw5-6): the yoke drives the
  // eye each tick, clamped to the ROM band — ±TRENCH_VIEW_HALF_W lateral, and vertically
  // TRENCH_EYE_MIN..TRENCH_EYE_MAX as a HEIGHT ABOVE THE TRENCH FLOOR.
  //
  // The pilot flies that band BOTH ways. The old clamp was `Math.min(0, …)` against a
  // negative dive-only band — he could only ever sink from his seat, and (because the
  // channel's floor is y=0, not its top) sinking took the camera clean through the floor.
  // Climbing is how he gets an angle on a target lying IN the floor.
  //
  // Rides `base`, so it survives even the no-port safe-hold return below (afterObstacles
  // spreads base); the trench catwalk collision tests the catwalk against it.
  const trenchView: Vec3 = [
    Math.max(-TRENCH_VIEW_HALF_W, Math.min(TRENCH_VIEW_HALF_W, state.trenchView[0] + aimX * TRENCH_VIEW_RATE * dt)),
    Math.max(TRENCH_EYE_MIN, Math.min(TRENCH_EYE_MAX, state.trenchView[1] + aimY * TRENCH_VIEW_RATE * dt)),
    0,
  ]
  // The walled channel scrolls toward the cockpit at the SAME rate the port does
  // (story 11-6), so the corridor and the target rush past together — advanced on
  // `base` so it rides every return path (reset to 0 on the next phase entry).
  // Advance the trench voice-line timer (ROM word_4B0E) at the GAME-FRAME rate and
  // cue any parity-gated voice line whose threshold this step CROSSES (story sw3-4;
  // sw7-1/T-008 made it frame-true). The ROM advances word_4B0E once per 20.508 Hz
  // game frame — not once per 60 Hz loop step — so the timer accumulates dt·TICK_HZ
  // (game frames), and its 16/22/24-frame thresholds fire at their authentic wall-
  // clock times (0.78–1.17 s) regardless of tick rate. A cue fires the step its
  // threshold is first crossed — inherently one-shot. Pushed onto the shared `events`
  // list, so the cue rides every return path below (safe-hold, crash, or port hit).
  // Parity is the ROM's 0-based BS.WAV bit 0 (`LDA BS.WAV / LSRA`, WSMAIN:1868), NOT a
  // 1-based `wave % 2` — sw7-2 reconciled the base (audit U-008): BS.WAV-even (human
  // ODD waves) → 'even' set; BS.WAV-odd (human EVEN) → 'odd' set.
  const trenchTimer = state.trenchTimer + dt * TICK_HZ
  const parity: 'even' | 'odd' = romWave0(state.wave) % 2 === 0 ? 'even' : 'odd'
  for (const cue of TRENCH_VOICE_CUES) {
    if (state.trenchTimer < cue.timer && trenchTimer >= cue.timer && cue.parity === parity) {
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
      // CATWALK_HIT_RADIUS, not COCKPIT_HIT_RADIUS: the catwalk hangs above the pilot, well
      // outside an 80-unit cockpit sphere, so the crash was dead code (story 14-7).
      // Tests against the pilotable `trenchView` — the SHIP — not a fixed cockpit point (sw3-2,
      // re-anchored by sw5-6): a hands-off pilot rides at TRENCH_EYE_SEAT and the catwalk is
      // seated within one hit radius of it, so it still bites; a dive to TRENCH_EYE_MIN opens
      // more than a hit radius of clearance beneath it, so it stays dodgeable. Both bounds are
      // asserted behaviourally in tests/core/trench-viewpoint.test.ts.
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
  // A fatal catwalk crash is a death like any other (sw7-8, U-017).
  if (crashedCatwalk) pushFarewell(events, base.lives - 1)

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
  // The hit/miss only resolves once the port has scrolled into the narrow
  // near-cockpit approach window (sw3-15, the ROM $800 end-wall window). A bolt
  // that merely crosses the port far up the channel — the entry-shot that used
  // to win every run — is outside the window and cannot count.
  const inApproachWindow = port[2] >= -PORT_APPROACH_WINDOW

  // --- ARM: the laser earns the shot; the machine takes it (story sw5-6) ------
  //
  // The pilot flies 768 above the floor and the porthole lies IN the floor, so inside the $800
  // window the port sits 43.8° below him — past the 30° the 60° FOV allows. He physically cannot
  // make that shot, and the cabinet never asked him to. `WSLAZR.MAC` tests his LASER against a
  // ±$200 box around the hole ("?LAZAR GOT CLOSE ENUF TO FIRE PROTON TORPS?") and, if it lands
  // inside, launches the torpedo for him — `JSR FRPTGN ;THEN LAUNCH DIRECT HIT PROTON TORPS`.
  // `MVPTGN` then funnels it home (height above floor ≤ D, lateral ≤ D/16, stopping above the
  // porthole), and `WSMAIN.MAC` reads the flag at the end-wall window to call it.
  //
  // So the shot is EARNED EARLY — out where the port is still a reachable ~17.7° and the yoke can
  // point at it — and RESOLVES LATE, inside the ROM's $800 gate: precision lives in the ARMING.
  //
  // Swept, not snapshot, and for the same reason as the old terminal test: `advance` has already
  // moved the bolt this tick, so a 12,000 u/s bolt can step clean over the box between two frames.
  const armingBolt = afterObstacles.projectiles.findIndex((b) =>
    sweptCollides(port, sub(b.pos, scale(b.vel ?? ZERO, dt)), b.pos, PORT_HIT_RADIUS),
  )
  const armed = afterObstacles.portTorpedoArmed || armingBolt >= 0
  // The arming laser is CONSUMED — the ROM latches PT.LZF to $FF ("MARK THAT PROTON TORP HAS
  // FIRED") so one run arms one torpedo, and the bolt becomes the torpedo rather than flying on.
  const boltsAfterArming =
    !afterObstacles.portTorpedoArmed && armingBolt >= 0
      ? afterObstacles.projectiles.filter((_, i) => i !== armingBolt)
      : afterObstacles.projectiles
  // The death knell (sw7-8, U-010) rings when the torpedo is FIRED, not when it
  // lands: WSGUNS.MAC:1220 puts `JSR PMSF2 ;SOUND THE DEATH KNELL` in FRPTGN —
  // the routine that CREATES the torpedo (PT.LIV=1). Our launch moment is this
  // arming edge (the bolt becomes the torpedo). One-shot by construction: the
  // latch is set after this frame, and a fresh port re-primes it (the miss path
  // below). Pushed BEFORE the detonation resolution so the degenerate
  // armed-inside-the-window frame carries knell-then-finale, the ROM's order.
  if (!afterObstacles.portTorpedoArmed && armingBolt >= 0) {
    events.push({ type: 'tune', tune: 'deathKnell' })
  }

  // --- RESOLVE: a DIRECT HIT, once the port reaches the window ----------------
  //
  // The torpedo cannot miss (MVPTGN's funnel drives both offsets to zero), so the outcome is the
  // flag, read at the window — exactly WSMAIN's `LDA PT.LIV` at `SUBD #0800`. The $800 gate that
  // sw3-15 pinned still holds: an armed run does not win at the trench mouth, it wins at the wall.
  const detonates = armed && inApproachWindow
  if (detonates) {
    // The arming laser is already gone (it became the torpedo); everything still in flight rides on.
    const liveBolts = boltsAfterArming
    // "Use the Force": a clean run — no trench shots before the killing torpedo
    // itself — awards FORCE_BONUS on top of TRENCH_BONUS (fidelity epic, task 4;
    // findings ## Exhaust port & run outcome, the type-4 marker's one-shot latch).
    const clean = afterObstacles.trenchShotsFired <= 1 // only the killing torpedo
    const bonus = TRENCH_BONUS + (clean ? FORCE_BONUS : 0)
    if (clean) events.push({ type: 'force-bonus', amount: FORCE_BONUS })
    // Han's line on the winning shot — the ROM (WSMAIN.MAC:1919) reserves it for the
    // same 0-based gate as the Imperial March: GM.WAV >= 3 AND GM.WAV odd, i.e. human
    // waves {4,6,8,...}; every other wave explodes silent (sw7-2, U-006). The gate is
    // independent of the clean-run Force bonus above (sw2-5) — clean/dirty never gates it.
    const gmKill = romWave0(state.wave)
    if (gmKill >= 3 && gmKill % 2 === 1) {
      events.push({ type: 'speech', line: 'greatShotKidThatWasOneInAMillion' })
    }
    // The Death Star BLOWS (sw2-4): a positioned explosion cue at the port's own
    // spot, emitted BEFORE the level-clear warp below so the shell stages the boom
    // before the jump to the next wave. `[...port]` keeps the step pure.
    events.push({ type: 'death-star-destroyed', pos: [...port] as Vec3 })
    // The finale (sw7-8, U-012): the ROM starts the end-of-Death-Star music the
    // moment the explosion phase inits — PHIDX1's `JSR PMEND` (WSMAIN.MAC:2179).
    // Our detonation frame IS that init. On the shared tune channel it steals
    // the knell if both land on one frame, exactly as the one tune player would.
    events.push({ type: 'tune', tune: 'finale' })
    // The whole run clears and loops to the next wave's space phase — emit the
    // warp / wave-clear cue (8-7), as `clearRun` re-opens 'space'. `clearRun` →
    // `enterPhase` spreads `...s`, so this event rides along.
    events.push({ type: 'level-clear', next: 'space' })
    // Reopen the space theme for the next wave (sw3-5) — `clearRun` bumps the wave
    // to `state.wave + 1`, so the Imperial March takes over here on human waves
    // {4,6,8,...} (GM.WAV >= 3 AND odd, WSMAIN.MAC:1421; base reconciled by sw7-2).
    // Rides through `clearRun`->`enterPhase` like the level-clear.
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
    // R2 swears ONLY when you live to retry (sw7-8, U-015): the ROM checks
    // `LDA S.GAS / LBLE PHIB0D` BEFORE `JSR SPKR2N ;R2 SWEARS AT PLAYER FOR
    // MISSING EXHAUST PORT` (WSMAIN.MAC:1905-1914). A fatal bash skips the
    // swear and speaks the end-of-game farewell instead.
    if (lives > 0) events.push({ type: 'speech', line: 'r2Scream' })
    else pushFarewell(events, lives)
    return {
      ...afterObstacles,
      lives,
      gameOver: lives <= 0,
      mode: lives <= 0 ? 'gameover' : afterObstacles.mode,
      exhaustPort: spawnPort(), // another pass down the trench
      // A fresh port is a fresh torpedo: the ROM re-primes both flags the moment a new porthole
      // comes into sight (WSBASE.MAC, at `STD BS.PLC ;LOCATION OF THE PORT` — `STA PT.LZF ;NO
      // FIRE VIA LAZAR YET` / `STA PT.LIV ;PROTON TORP NOT LIVE YET`). Without this an armed run
      // that MISSED would carry its lock into the next pass and win it unearned.
      portTorpedoArmed: false,
      // Stamp the miss so the shell can show a distinct "you missed" tell for a
      // beat (sw2-4), separate from the terrain-crash cue above.
      exhaustPortMissedAt: t,
    }
  }

  // Otherwise the port keeps scrolling in toward the cockpit — carrying the torpedo latch and
  // the surviving bolts (the arming laser, if there was one, BECAME the torpedo and is gone).
  return {
    ...afterObstacles,
    exhaustPort: { pos: port },
    projectiles: boltsAfterArming,
    portTorpedoArmed: armed,
  }
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

/** Has this phase been cleared? Space is a flat KILL quota. The SURFACE is a
 * scroll-COMPLETION approach (sw4-3): its authored WSGRND maze is a FINITE,
 * single-pass field, so the run drops into the trench once that field has swept
 * fully past the cockpit — killing every tower only clears it EARLY (and banks the
 * 50,000 bonus, see `progress`). A kill-count-only gate would SOFT-LOCK the run:
 * towers sit out to x = ±$8000 and a single missed one would make the quota
 * permanently unreachable over an empty floor. The trench never clears by count
 * (the exhaust-port hit in stepTrench ends it). Exhaustive over Phase so a new
 * phase can't silently default to a wrong condition. */
function phaseCleared(s: GameState): boolean {
  switch (s.phase) {
    case 'space':
      return s.phaseKills >= SPACE_WAVE_QUOTA
    case 'surface':
      return allTowersKilled(s) || s.surfaceScrollZ >= surfaceFieldDepth(s.wave)
    case 'trench':
      return false
  }
}

/** Every tower in the wave's maze is down — the authentic "cleared all towers"
 * condition (WSGRND `sub_973A` fires the bonus on the kill that drives "# OF
 * TOWERS LEFT" to 0). `towerCount > 0` matters: the bunkers-only wave (BUNK) has
 * NO towers, so it can never "clear them all" — without this guard its 0-quota is
 * met at entry, insta-clearing the surface and gifting a free 50,000. Bunkers are
 * quota-neutral, so `phaseKills` only ever counts towers/bishops. */
function allTowersKilled(s: GameState): boolean {
  const towers = towersForWave(s.wave)
  return towers > 0 && s.phaseKills >= towers
}

/** How far the surface must scroll for the wave's whole authored field to pass the
 * cockpit: the deepest entry's authored depth, plus the SPAWN_DISTANCE lead-in
 * `mazeField` places it behind. `surfaceScrollZ` accumulates at exactly the rate
 * the turrets advance (TURRET_SCROLL_SPEED·dt), so reaching this distance means the
 * last object has crossed z=0 and been culled — the field is spent. Derived from the
 * maze data, not from the live `turrets` array, so shooting objects down cannot make
 * the field "end" early. */
function surfaceFieldDepth(wave: number): number {
  const entries = mazeForWave(wave).entries
  let deepest = 0
  for (const e of entries) if (e.y > deepest) deepest = e.y
  return deepest + SPAWN_DISTANCE
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

/** The ROM's wave-gated music and speech read the ZERO-based hardware wave counters
 *  GM.WAV / BS.WAV (WSMAIN.MAC:1421 / 1868 / 1919); our `state.wave` is 1-based. This
 *  is the SINGLE conversion every wave-gated cue passes through — the Imperial March,
 *  the "Great shot kid" line, and the trench voice parity all read it — so flipping
 *  this one shim moves every gate together (sw7-2, audit U-005..U-008). */
function romWave0(wave1Based: number): number {
  return wave1Based - 1
}

/** Which looping track opens `phase` on the (1-based) `wave`. Only the space wave is
 *  wave-sensitive: the ROM plays the Imperial March instead of the space theme when
 *  GM.WAV >= 3 AND GM.WAV is odd (WSMAIN.MAC:1421) — i.e. human waves {4,6,8,...}. */
function musicTrackFor(phase: Phase, wave: number): MusicTrack {
  const gm = romWave0(wave)
  if (phase === 'space' && gm >= 3 && gm % 2 === 1) return 'imperialMarch'
  return PHASE_MUSIC[phase]
}

/** The voice lines cued when a run ENTERS a phase (sw2-5; widened to a SEQUENCE
 * by sw7-8/U-016). Only the surface and trench edges carry lines; a new wave's
 * space phase (reached via clearRun, not progress) has none. Event ORDER is
 * spoken order — the shell's TMS5220 queue plays them back-to-back (one chip,
 * one throat), which is how the cabinet sequenced multi-line moments
 * (SNDSPK.MAC's TFOA table). A `Partial` map so an unwired phase cues nothing. */
const ENTER_PHASE_SPEECH: Partial<Record<Phase, readonly SpeechLine[]>> = {
  // "This is Red Five, I'm going in" (SPKTHI, WSMAIN.MAC:1515) leads; "Look at
  // the size of that thing" follows (SPKSIZ, :1550). The ROM keys the pair to a
  // wave-select our sim doesn't have — the sequenced-both contract is U-016's
  // remediation (deviation logged in the session file).
  surface: ['redFiveImGoingIn', 'lookAtTheSizeOfThatThing'],
  trench: ['useTheForceLuke'], // "Use the Force, Luke"
}

/** The end-of-game farewell (sw7-8, U-017): PHIEGM speaks SPKREM then SPKFOA on
 * EVERY loss (WSMAIN.MAC:2143-2144), BEFORE the high-score fork — and SPKFOA is
 * not a 24th phrase but the TFOA sequence table `.BYTE 15.,16.,0FF`
 * (SNDSPK.MAC:100-103): exactly our baked FOR + ALW lines. So the death frame
 * cues three lines in utterance order; the shell's serial queue does the rest.
 * Every death site calls this with its post-hit lives — the trio belongs to the
 * DEATH, not to any one cause. IDEMPOTENT per frame (review R-1): two fatal
 * causes can land on one frame (a catwalk and the port scroll in lockstep and
 * can cross the cockpit plane together), but the player died once and PHIEGM
 * speaks the farewell once per game over — never once per cause. */
function pushFarewell(events: GameEvent[], lives: number): void {
  if (lives > 0) return
  if (events.some((e) => e.type === 'speech' && e.line === 'remember')) return
  events.push({ type: 'speech', line: 'remember' })
  events.push({ type: 'speech', line: 'theForceWillBeWithYou' })
  events.push({ type: 'speech', line: 'always' })
}

/** The trench voice lines cued off the timer (`trenchTimer` = ROM `word_4B0E`),
 * gated by 0-based wave parity. The 1983 cabinet gates on the 0-based wave counter
 * BS.WAV (`LDA BS.WAV / LSRA / IFCC`, WSMAIN.MAC:1868) — NOT `byte_4B12`. Carry-clear
 * = BS.WAV EVEN (`parity: 'even'`) = human ODD waves {1,3,5,...}: "Luke, trust me" @16
 * + "Yahoo, you're all clear kid" @24; BS.WAV ODD (`parity: 'odd'`) = human EVEN
 * {2,4,6,...}: "Let go Luke" @16 + "The Force is strong in this one" @22. sw7-2
 * reconciled the base (it had been a 1-based `wave % 2`, which INVERTED the sets and
 * dropped "Let go Luke" — audit U-007/U-008). A line fires on the single step the
 * timer crosses its threshold — one-shot, no re-fire.
 * (docs/star-wars-1983-source-findings.md, "Voice-line triggers by trench timer".) */
const TRENCH_VOICE_CUES: ReadonlyArray<{
  timer: number
  parity: 'even' | 'odd'
  line: SpeechLine
}> = [
  { timer: 16, parity: 'even', line: 'lukeTrustMe' }, // BS.WAV even / human odd — SPKTRU (Sound_18)
  { timer: 24, parity: 'even', line: 'youreAllClearKid' }, // BS.WAV even / human odd — SPKYAU (Sound_1A)
  { timer: 16, parity: 'odd', line: 'letGoLuke' }, // BS.WAV odd / human even — SPKLET (restored, U-007)
  { timer: 22, parity: 'odd', line: 'theForceIsStrongInThisOne' }, // BS.WAV odd / human even — SPKSTR (Sound_16)
]

/**
 * Drop the run into the next phase once the current one is cleared. A finished
 * run never advances; phases advance in order, one at a time; score and lives
 * carry forward untouched.
 */
function progress(s: GameState): GameState {
  if (s.gameOver) return s
  if (!phaseCleared(s)) return s
  const next = NEXT_PHASE[s.phase]
  if (next === null) return s
  // The phase cleared — carry the frame's events forward, announce the warp, and
  // cue the entering phase's voice lines if it has any (sw2-5; sequence per sw7-8).
  const advanced = enterPhase(s, next)
  const events: GameEvent[] = [...s.events, { type: 'level-clear', next }]
  for (const line of ENTER_PHASE_SPEECH[next] ?? []) events.push({ type: 'speech', line })
  // The descent tune (sw7-8, U-014): PMDES fires at space PH.TIM 400, twenty
  // frames before the descend flip (WSMAIN.MAC:1439/:1442) — our un-sequenced
  // equivalent is the space -> surface edge itself. It rides OVER the towers
  // loop below (the ROM's PMDES -> descend -> PM4TH spacing is sw7-9 / A-019).
  if (s.phase === 'space' && next === 'surface') {
    events.push({ type: 'tune', tune: 'descent' })
  }
  // Swap the looping music channel to the entering phase's theme (sw3-5). Fires on
  // this edge only; `enterPhase` preserves the wave, so surface->'towers' /
  // trench->'trench' regardless of wave (the Imperial March is a space-only swap).
  // Pushed BEFORE the tower-bonus early return so the surface->trench edge still
  // carries its 'trench' music cue.
  events.push({ type: 'music', track: musicTrackFor(next, advanced.wave) })
  // Clearing every tower on the surface banks the 50,000 "cleared all towers"
  // bonus and cues its banner — ONCE, on the drop into the trench (sw3-3). Gated on
  // the towers ACTUALLY being killed (sw4-3): the surface can now also be left by
  // simply outliving the field (scroll-completion), and flying over towers you never
  // shot must bank nothing — nor may the 0-tower bunker wave gift the bonus.
  if (s.phase === 'surface' && allTowersKilled(s)) {
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
    // A leftover death cue never crosses into the next phase (story sw3-8).
    dyingTies: [],
    turrets: [],
    // The trench opens with its target downrange; other phases carry no port.
    exhaustPort: phase === 'trench' ? spawnPort() : null,
    // ...and its wall obstacles (fidelity epic, task 3); other phases carry none.
    // Seeded per-run variation (sw3-7): the trench chain's picked tail is drawn
    // from the run RNG via a LOCAL cursor (createRng(s.rng.seed)), so different
    // runs get different obstacle chains while `s.rng` stays unmutated (purity).
    trenchObstacles: phase === 'trench' ? spawnTrenchObstacles(createRng(s.rng.seed)) : [],
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
    // A fresh surface re-lays its authored WSGRND maze (sw4-3): the next
    // stepSurface frame fills `turrets` from `mazeForWave(wave)`. Reset here so
    // each wave's surface (and a dev phase-jump) lays its own field.
    surfaceMazeLaid: false,
    // Likewise the trench channel scroll, so a fresh (or jumped) trench always
    // opens with the corridor anchored at the cockpit (story 11-6).
    trenchScrollZ: 0,
    // Seat the pilotable viewpoint on every phase entry (story sw3-2, re-framed by
    // sw5-6): dead centre laterally, and vertically at TRENCH_EYE_SEAT — the height
    // WSMAIN.MAC's `SMVG1B` drops the pilot to as he enters ("JUST ABOVE BOTTOM OF
    // TRENCH"). So a fresh trench opens un-dived, riding low, with the overhead catwalk
    // still biting until the pilot steers clear.
    trenchView: [0, TRENCH_EYE_SEAT, 0],
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
    // Restart the per-wave spawn walk so the new wave's TSPWAV plan (and the TBG
    // lateral table) index from 0. The counter is monotonic within a wave but must
    // reset at the wave boundary, or it would step past the Darth (RTH) slot and he
    // would never appear in waves 2+ (sw7-13).
    spawnCount: 0,
    forceBonusAwardedAt: s.forceBonusAwardedAt,
    deathStarDestroyedAt: s.deathStarDestroyedAt,
  }
}

/** The wave's authored WSGRND maze as a fixed field of ground objects (sw4-3),
 *  replacing the old random spawner. Each entry sits at its authored lateral X
 *  on the floor (y=0); its authored forward depth Y maps UNSCALED to −Z, shifted
 *  by SPAWN_DISTANCE so the nearest row enters from the same spawn horizon the
 *  turrets always rose at. The existing surface scroll then translates the whole
 *  field toward the cockpit, preserving the maze's relative depth spacing. All
 *  objects rise together (age 0), so a fresh tower still holds fire for
 *  TOWER_FIRE_GRACE. */
function mazeField(wave: number): Turret[] {
  return mazeForWave(wave).entries.map((e) => ({
    pos: [e.x, 0, -(e.y + SPAWN_DISTANCE)] as Vec3,
    age: 0,
    kind: e.kind,
  }))
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
 * Advance enemy fireballs by the ROM homing law (`sub_A875`,
 * docs/tie-flight-ai-model.md §6): the shot's position decays 7/8 per cabinet tick
 * toward the cockpit at the origin, so it homes along its launch line and ALWAYS
 * arrives — the sole space damage source (story sw4-2, spec §B). Frame-rate
 * independent: the per-tick 7/8 is raised to `dt × TICK_HZ`, so 30/60/144 Hz stepping
 * traces the same trajectory (`pow` composes: `pow(r, a)·pow(r, b) = pow(r, a+b)`).
 * Ages ttl (the 64-tick life) and drops the expired. New array — never mutates the
 * input, keeping the step pure. Velocity is unused (the shot has none); it is
 * carried through untouched so the Projectile shape stays intact.
 */
function homeShots(shots: readonly Projectile[], dt: number): Projectile[] {
  const decay = Math.pow(7 / 8, dt * TICK_HZ)
  const out: Projectile[] = []
  for (const s of shots) {
    const ttl = s.ttl - dt
    if (ttl <= 0) continue
    out.push({ pos: scale(s.pos, decay), vel: s.vel, ttl })
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

/**
 * The authentic TIE spawn LATERAL table — the 1983 ROM's STARTING LOCATIONS
 * (sw4-1, spec §A). Decoded from WSCPU.MAC `.SBTTL STARTING LOCATIONS`
 * (historicalsource/star-wars @ 5355b76): the `.WB name,_,a,b` macro emits
 * `(.WORD $7C00 ; .WORD a×$400 ; .WORD b×$400)`, so depth is always $7C00
 * (TIE_SPAWN_DISTANCE) and the two lateral words are `a×1024` (our X) and `b×1024`
 * (our Y). The 12 entries, "FRONT TO BACK, LEFT TO RIGHT, TOP TO BOTTOM":
 *   1A/1B/1C groups: (0,1) (−1,0) (1,0)      → laterals {0, ±1024}
 *   1D group:        (−2,0) (2,0) (0,2)      → the ±2048 corners
 * Every entry displaces EXACTLY ONE lateral axis; ±2048 lives only in the D-group.
 * A monotonic spawn counter (GameState.spawnCount) walks this in order — pure and
 * deterministic (NOT the RNG), so a run cycles the full authentic set. */
const ROM_LATERAL_UNIT = 0x400 // 1024 — the ×$400 STARTING-LOCATION lateral step
const SPAWN_LATERALS: ReadonlyArray<readonly [number, number]> = [
  [0, ROM_LATERAL_UNIT], // 1A1
  [-ROM_LATERAL_UNIT, 0], // 1A2
  [ROM_LATERAL_UNIT, 0], // 1A3
  [0, ROM_LATERAL_UNIT], // 1B1
  [-ROM_LATERAL_UNIT, 0], // 1B2
  [ROM_LATERAL_UNIT, 0], // 1B3
  [0, ROM_LATERAL_UNIT], // 1C1
  [-ROM_LATERAL_UNIT, 0], // 1C2
  [ROM_LATERAL_UNIT, 0], // 1C3
  [-2 * ROM_LATERAL_UNIT, 0], // 1D1
  [2 * ROM_LATERAL_UNIT, 0], // 1D2
  [0, 2 * ROM_LATERAL_UNIT], // 1D3
]

/** A fresh TIE spawned far down −Z at the authentic depth, aimed at the cockpit at
 * the wave's approach speed (gameRules.waveParams), with a seeded swoop direction so
 * each fighter banks into its own arc on the way in (story 9-2). The LATERAL comes
 * from the ROM TBG table walked in order by `spawnIndex` (sw4-1, spec §A) — no
 * longer a continuous RNG spread — so every fighter appears on one of the authentic
 * {0, ±1024, ±2048} starting slots. The RNG still seeds only the swoop bank. */
function spawnTie(rng: Rng, speed: number, spawnIndex: number, spaceWave: number): Enemy {
  const [x, y] = SPAWN_LATERALS[spawnIndex % SPAWN_LATERALS.length]
  const pos: Vec3 = [x, y, -TIE_SPAWN_DISTANCE]
  const dir = toCockpit(pos)
  const bank = (nextFloat(rng) < 0.5 ? 1 : -1) * TIE_SWOOP_BIAS
  // The wave's TSPWAV plan (sw7-12) says which slot is Darth: the RTH shape spawns
  // kind 'darth', every other slot a plain TIE. Past the plan's end (a long wave that
  // keeps refilling its slots) fall back to a mook.
  const shape = waveSpawnPlan(spaceWave)[spawnIndex]?.shape ?? 'TIE'
  const kind = shape === 'RTH' ? 'darth' : 'tie'
  return { pos, vel: scale(dir, speed), kind, orient: lookRotation(dir), bank }
}

/**
 * THE SURFACE SHIP (story sw7-16 / R11a): the pilot skims the Death Star at `altitude`, dead
 * centre laterally. This IS the eye — `render.ts cameraView` builds the surface view matrix from
 * the same point — so it is also the muzzle, the point incoming fire aims at, and the centre of
 * the cockpit hit-test. One point, three jobs; that is the whole fix.
 */
function surfaceShip(altitude: number): Vec3 {
  return [0, altitude, 0]
}

/**
 * THE SHIP — the one point the pilot's eye, his gun, and everything aimed at him all share, in
 * whichever phase he is flying (stories sw5-6 + sw7-16). Each phase seats the pilot somewhere
 * different, and the collision world does NOT follow him:
 *
 *   space    the fixed cockpit at the origin — the only phase where eye and origin coincide
 *   surface  [0, altitude, 0] — he flies 40..238 above the floor (MIN/MAX_SKIM_ALTITUDE)
 *   trench   `trenchView` — he flies 512..3840 above it (TRENCH_EYE_MIN/MAX), and steers
 *
 * sw5-6 learned the lesson in the trench: with the gun left at the origin, the crosshair ray and
 * the bolt ray run parallel, separated by the pilot's height, so the player misses what he aims at
 * and hits what he does not. It fixed the trench and left a comment claiming the other phases
 * "already share the origin" — false for the surface from the moment the camera lifted (stories
 * 11-2/11-5), and the live report ("I shoot way lower than the crosshairs indicate") was the bill.
 * sw7-16 pays it. What you aim at is what you hit, in EVERY phase.
 *
 * NOTE this is the ship at the START of the step. The surface's `stepSurface` re-flies the ship
 * before it aims the maze's fire at him, so it builds its own `surfaceShip(altitude)` from the
 * fresh height rather than calling this — the trench muzzle reads a step-old `trenchView` the same
 * way. The gap is one frame of climb (<= ALTITUDE_RATE * dt), three orders under the 40..238 error
 * this exists to kill.
 */
function shipPoint(s: GameState): Vec3 {
  if (s.phase === 'trench') return [...s.trenchView] as Vec3
  if (s.phase === 'surface') return surfaceShip(s.altitude)
  return [...COCKPIT] as Vec3
}

/** Unit vector from a world position back toward the cockpit at the origin.
 *
 * ⚠ SPACE ONLY — this is the TIE flight model's homing target (`spawnTie`, `moveEnemy`), where the
 * ship really is the origin. It is NOT the surface's ship: `stepSurface` aims its fire with
 * `surfaceShip(altitude)` instead. Retargeting this helper would break space the way the surface
 * was broken before sw7-16 (guarded by `tests/core/surface-aim-wysiwyg.test.ts`, section (d)). */
function toCockpit(pos: Vec3): Vec3 {
  return normalize(sub(COCKPIT, pos))
}
