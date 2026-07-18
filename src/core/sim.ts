// src/core/sim.ts
//
// The pure step. Deterministic: identical (state, input, dt) yields identical
// state. Time only ever enters here as `dt`; randomness only ever comes from
// `state.rng`. This boundary is what makes the game unit-testable and
// frame-rate independent — the same rule that anchors tempest.
//
// Wave 1 — space combat: the player's LASER is a hitscan beam cast from the ship down the aim
// direction (sw7-17 / R11b — it spawns nothing that travels, and `state.projectiles` is no longer
// fed by firing); TIEs spawn into their slots and bear down on the cockpit; the formation lobs
// fireballs back — those ARE real travelling objects, as in the ROM; the beam kills the nearest
// thing under the site (score), and TIEs or fireballs that reach the cockpit cost a shield. Every
// spatial test routes through the Math Box and the
// rule helpers — there is no ad-hoc geometry in here.

import { initialState } from './state'
import { mazeForWave } from './surfaceMazes'
import type { GameState, Projectile, Enemy, Turret, Phase, TrenchObstacle, DyingTie, GroundDebris } from './state'
import {
  FIRE_INTERVAL,
  LASER_SWEEP_SECONDS,
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
  SURFACE_SEED_SPEED,
  SURFACE_MAX_SPEED,
  SURFACE_ACCEL,
  SURFACE_SEQ_SPAN,
  SURFACE_END_SEQ,
  SURFACE_FINISH_GROUND_SPEED,
  GROUND_DEBRIS_LIFE_SECONDS,
  GROUND_DEBRIS_GRAVITY,
  GROUND_DEBRIS_LAUNCH_TOWER,
  GROUND_DEBRIS_LAUNCH_BUNKER,
  GROUND_DEBRIS_SPREAD,
  TURRET_SCORE,
  TURRET_HIT_RADIUS,
  TOWER_HEIGHT,
  TOWER_FIRE_GRACE,
  SPACE_WAVE_QUOTA,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  TRENCH_SCROLL_SPEED,
  TRENCH_BONUS,
  PORT_HIT_RADIUS,
  PORT_APPROACH_WINDOW,
  forceBonusForWave,
  SHIELD_BONUS_PER_UNIT,
  POST_HIT_SHIELD_WINDOW,
  TIE_SWOOP_BIAS,
  TIE_BANK_ANGLE,
  TIE_NEAR_BOUND,
  TIE_EXIT_RANGE,
  TIE_PEEL_SWEEP,
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
import { aimDirection, beamHit, collides, waveParams } from './gameRules'
import { createRng, nextFloat, nextInt, type Rng } from '@arcade/shared/rng'
import { stepNameEntry } from '@arcade/shared/name-entry'
import {
  spawnTrenchObstacles,
  TRENCH_TURRET_SCORE,
  TRENCH_SQUARE_SCORE,
  OBSTACLE_HIT_RADIUS,
} from './trench-obstacles'
import { trenchPortDistance } from './trench-wedges'
import {
  TRENCH_VIEW_HALF_W,
  TRENCH_VIEW_RATE,
  TRENCH_EYE_MIN,
  TRENCH_EYE_MAX,
  TRENCH_EYE_SEAT,
  TRENCH_FAR,
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

  // --- The player's laser: a trigger pull opens a sweep; nothing travels -----
  //
  // THE LASER IS HITSCAN (story sw7-17 / R11b, audit G-004). The ROM draws it gun-ports → site
  // each frame and resolves collision instantly against the nearest object under the site; there
  // is no travelling player shot and no lifetime in WSLAZR.MAC at all. What was here before was a
  // 12,000 u/s projectile, and the field closing on the cockpit while it flew gave every shot a
  // CONSTANT lead error of closing/(bolt+closing) — 4.8 % of the target's lateral offset today,
  // 30-64 % at the authentic surface speeds sw7-18 restores. Dead-on aim missed everything past
  // |x| ~ 4,100, and no aim could correct it. G-004 was re-ruled wont_fix → fix on that.
  //
  // `projectiles` still advances: it carries the proton torpedo and anything a fixture places.
  // The PLAYER's gun adds nothing to it.
  const projectiles = advance(state.projectiles, dt)
  let fireCooldown = state.fireCooldown - dt
  let laserEdge = state.laserEdge
  // EDGE-TRIGGERED SEMI-AUTO: one sweep per PULL, no auto-repeat (G-012, ruled 2026-07-16). The
  // cabinet's laser runs off the fire-button edge latch VG.LON — set by the IRQ (WSINT.MAC:188-192)
  // and consumed once per game frame by TSTLAZ — so holding the trigger down fires exactly one
  // shot. Ours auto-fired ~4/s while held, which was an invented cadence AND made the sweep
  // meaningless: 0.25 s of auto-fire reloads a 0.39 s LZ.EDG before it can ever run out, so the
  // laser was simply on for ever. `firePrev` is the rising-edge register (the `startPrev` pattern).
  const fireEdge = input.fire && !state.firePrev
  if (fireEdge && fireCooldown <= 0) {
    // ROM: `LDB #8 / STB LZ.EDG` (WSLAZR.MAC:106-107) — a pull LOADS the sweep counter, and it
    // does so unconditionally, so a fresh pull mid-sweep reloads it (retriggerable). Re-fire is
    // gated by FIRE_INTERVAL and NOT by the sweep: they are different quantities (G-012, which
    // says in terms "do not port 8 frames as a cooldown") and the sweep is the longer of the two.
    laserEdge = LASER_SWEEP_SECONDS
    fireCooldown = FIRE_INTERVAL
    events.push({ type: 'fire' })
  }
  // ROM (WSLAZR.MAC:110-113), and note that it keeps TWO variables, not one:
  //
  //     LDA LZ.EDG      ;the counter
  //     IFGT            ;?HAVE AN EDG TO DETECT?
  //     DEC LZ.EDG      ;burn one game frame off it
  //     STA LZ.ON       ;<- stores the PRE-decrement value, in its own byte
  //
  // `LZ.ON` is the GATE — CLSLZ/CLGLZ/CLBLZ all open with `LDA LZ.ON / IFNE ;?ARE LAZARS ON?`,
  // and VWLAZ draws off the same byte. One value, so the beam you see and the beam that kills are
  // the same beam by construction.
  //
  // We keep both for exactly that reason. Deriving the gate from the STORED counter instead
  // (`state.laserEdge > 0`) is off by one frame and was a real bug: `laserOn` is read
  // pre-decrement, so on the last live frame of every sweep the counter clamps to 0 while a kill
  // can still land — the shell drew nothing on a frame the beam was still shooting. `laserOn`
  // rides out on the state so the shell gates on the same fact the collision does.
  const laserOn = laserEdge > 0
  if (laserOn) laserEdge = Math.max(0, laserEdge - dt)

  // THE BEAM, cast from THE SHIP (story sw5-6; surface edition sw7-16). Wherever the pilot's eye
  // rides, the beam leaves from THERE. Cast from the world origin while the eye flies above it,
  // the sight-line and the beam run on parallel rays and everything the crosshair lands on is
  // missed underneath by exactly that gap. In the trench the ship is `trenchView` (the pilot flies
  // 512..3840 above the floor); on the surface it is [0, altitude, 0] (40..238 above it). Only in
  // space is the ship the fixed cockpit at the origin. `shipPoint` is that one point, per phase.
  //
  // It is the ship at the START of the step — the eye the pilot actually sighted down, since the
  // shell renders from this state and then samples the yoke. Same reasoning as sw7-16's muzzle;
  // see `shipPoint`.
  //
  // ROM: `WSGUNS.MAC FRPTGN` puts the shot on the ship — `LDD M$TX / ADDD #100 ;JUST A BIT IN
  // FRONT`, `LDD M$TY` (lateral), `LDD M$TZ` (height). The site is re-latched EVERY frame of the
  // sweep (`LDD VG.RSX / STD LZ.RSX` sits inside the `IFGT`), never frozen at the pull — which is
  // why the direction is read from THIS frame's aim and the beam tracks the reticle while it is on.
  const beamOrigin: Vec3 = shipPoint(state)
  const beamDir: Vec3 = aimDirection(aimX, aimY, input.aspect)

  // Enemy fire advances & expires each step. SPACE-phase TIE fireballs HOME on the
  // cockpit (ROM sub_A875, story sw4-2 / spec §B): their position decays 7/8 per
  // cabinet tick toward the origin, so an un-shot shot ALWAYS arrives. Surface/trench
  // fire still flies straight (out of sw4-2's scope; the trench carries no fire).
  const enemyShots =
    state.phase === 'space'
      ? homeShots(state.enemyShots, dt)
      : advance(state.enemyShots, dt)

  const common: StepCommon = {
    t,
    aimX,
    aimY,
    rng,
    projectiles,
    fireCooldown,
    enemyShots,
    events,
    laserEdge,
    firePrev: input.fire,
    laserOn,
    beamOrigin,
    beamDir,
  }

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

  // --- CLSLZ: the beam takes the nearest thing under the site ---------------
  //
  // ROM (WSLAZR.MAC:763-789), the whole of space's collision:
  //
  //     CLSLZ::
  //         LDA LZ.ON
  //         IFNE                    ;?ARE LAZARS ON?
  //         LDD CL.GDS              ;CHECK ALIEN GUNS FIRST
  //         IFPL                    ;?VALID GUN POSSIBILITY?
  //         SUBD CL.ADS             ;CHECK AGAINST ALIEN DISTANCE
  //         BLO HTSG                ;B IF CLOSER, THEN HIT THE GUN
  //         BRA HTSA                ;J ELSE VALID ALIEN IS CLOSER
  //
  // ONE object resolves per frame, across BOTH categories — the fireballs (CL.GDS, the "alien
  // guns'" shells) and the fighters (CL.ADS) rank in a single contest and the nearest wins. That
  // is why this is one loop over two lists rather than two independent passes: a fireball drifting
  // in front of the TIE that fired it eats the beam, and the TIE lives.
  //
  // A killed TIE also spawns its exploded-fragment death cue (story sw3-8), so it breaks apart on
  // screen instead of blinking out; older cues age and expire.
  let score = state.score
  const killedTie = new Set<number>()
  const spawnedDying: DyingTie[] = []
  // Darth indices that took a SCORING hit this frame — they survive (KEEP DARTH
  // ALIVE) but re-arm their glow window below so they cannot be re-scored yet.
  const darthScored = new Set<number>()
  const killedShot = new Set<number>()

  if (laserOn) {
    let bestRange = Infinity
    let hitTie = -1
    let hitShot = -1
    for (let ei = 0; ei < enemies.length; ei++) {
      const range = beamHit(beamOrigin, beamDir, enemies[ei].pos, TIE_HIT_RADIUS)
      if (range !== null && range < bestRange) {
        bestRange = range
        hitTie = ei
        hitShot = -1
      }
    }
    for (let si = 0; si < enemyShots.length; si++) {
      const range = beamHit(beamOrigin, beamDir, enemyShots[si].pos, ENEMY_SHOT_HIT_RADIUS)
      if (range !== null && range < bestRange) {
        bestRange = range
        hitShot = si
        hitTie = -1
      }
    }

    if (hitTie >= 0) {
      if (enemies[hitTie].kind === 'darth') {
        // Darth is immortal in space: CPHTSA resets his hit counter to keep him
        // alive (WSCPU.MAC:367-368), so a laser hit never destroys him. He scores
        // 2,000 (SCRDARTH) once per hit, gated by the post-hit glow so a burst
        // does not re-score while he is "glowing from a hit" (WSCPU.MAC:346-348).
        if ((enemies[hitTie].glow ?? 0) <= 0) {
          score += VADER_SCORE
          darthScored.add(hitTie)
        }
      } else {
        killedTie.add(hitTie)
        score += TIE_SCORE
        events.push({ type: 'enemy-death', enemyType: 'tie', pos: [...enemies[hitTie].pos] as Vec3 })
        spawnedDying.push({ pos: [...enemies[hitTie].pos] as Vec3, age: 0 })
      }
    } else if (hitShot >= 0) {
      // Shooting incoming fire down (story 8-18). Intercepted fireballs drop out HERE, before the
      // cockpit-damage pass below, so a fireball shot down never also costs a shield.
      killedShot.add(hitShot)
      score += FIREBALL_SCORE
      events.push({ type: 'fireball-destroyed', pos: [...enemyShots[hitShot].pos] as Vec3 })
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

  const standingShots = enemyShots.filter((_, i) => !killedShot.has(i))

  // --- Cockpit damage: any TIE that reaches it, any fireball that lands -----
  // SPACE ONLY — the surface and trench returned at :199/:200 above, so this block is reachable in
  // no other phase, and `cause: 'enemy'` below is space's alone (the surface pushes 'turret').
  //
  // Centred on `shipPoint`, not on a bare COCKPIT literal (sw7-16). Space IS the origin, so this is
  // behaviour-identical; the reason to route through it anyway is that a guard asserting "space
  // keeps its own seat" can only BITE if it goes through the function a regression would break.
  const ship = shipPoint(state)
  let damage = 0
  const liveEnemies = standingEnemies.filter((e) => {
    if (collides(e.pos, ship, COCKPIT_HIT_RADIUS)) {
      damage++
      events.push({ type: 'player-death', cause: 'enemy' })
      return false
    }
    return true
  })
  const liveShots = standingShots.filter((s) => {
    if (collides(s.pos, ship, COCKPIT_HIT_RADIUS)) {
      damage++
      events.push({ type: 'player-death', cause: 'enemy' })
      return false
    }
    return true
  })

  const spaceHit = loseShield(state.lives, state.shieldHitAt, damage, t) // S-016 window
  const lives = spaceHit.lives
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
      shieldHitAt: spaceHit.shieldHitAt,
      gameOver: lives <= 0,
      mode: lives <= 0 ? 'gameover' : state.mode,
      phaseKills: state.phaseKills + killedTie.size,
      projectiles,
      laserEdge,
      laserOn,
      firePrev: input.fire,
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
 * Fold the frame's SCORE change into its HUD flash (sw3-6). Runs once at every
 * active-play return, so it catches score from any phase (TIE/fireball, turrets,
 * trench obstacles, the exhaust-port + Force bonus, the cleared-all-towers bonus)
 * uniformly:
 *
 * - Arms `bonusFlash` to full on any score change, else decays it toward 0 — the
 *   ROM `byte_4B2C` "score changed, redraw HUD" flash. Clamped at 0 so it lands
 *   exactly on rest, never negative.
 *
 * (sw7-4 / S-015 removed the score-threshold extra-shield award that used to live
 * here — the ROM has no such grant; see EXTRA_LIFE_THRESHOLDS' removal in state.ts.)
 *
 * `prev` is the frame's input state (its `score`/`bonusFlash` are the pre-step
 * values); `next` is the fully-stepped state whose `score` is final.
 */
export function finalizeScore(prev: GameState, next: GameState): GameState {
  // sw7-4 / S-015: the ROM has NO score-threshold extra shield, so this funnel no
  // longer touches `lives` — it only drives the byte_4B2C score-change flash.
  const scoreChanged = next.score !== prev.score
  const bonusFlash = scoreChanged
    ? BONUS_FLASH_MAX
    : Math.max(0, prev.bonusFlash - BONUS_FLASH_DECAY)
  return { ...next, bonusFlash }
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
  /** Seconds left in the laser sweep AFTER this frame's decrement — what rides out on the
   * returned state (the ROM's LZ.EDG). */
  laserEdge: number
  /** This frame's `input.fire`, to ride out as next step's rising-edge register. */
  firePrev: boolean
  /** Whether the laser is on THIS frame, and so whether the beam may hit anything at all.
   * The ROM's LZ.ON: every collision routine opens `LDA LZ.ON / IFNE ;?ARE LAZARS ON?`, and the
   * shell draws off the same fact. Rides out on the returned state. */
  laserOn: boolean
  /** Where the beam leaves the ship — `shipPoint` at the start of the step, the eye the pilot
   * sighted down. */
  beamOrigin: Vec3
  /** The beam's unit direction — this frame's aim, because the ROM re-latches the site on every
   * frame of the sweep rather than freezing it at the pull. */
  beamDir: Vec3
}

/**
 * The three ground-debris pieces a destroyed tower/bunker throws off (sw7-14 /
 * X-005, ROM BGTWXP/BGBKXP). Each launches straight up at the kind's base velocity
 * with a left / centre / right lateral fan, from the object's kill position. A
 * kindless (legacy) turret bursts as a tower — the `?? 'tower'` back-compat contract
 * (sw3-11). Deterministic (no RNG), so a seed replays the burst exactly.
 */
function spawnGroundDebris(pos: Vec3, kind: Turret['kind']): GroundDebris[] {
  const debrisKind: GroundDebris['kind'] = kind === 'bunker' ? 'bunker' : 'tower'
  const launch = debrisKind === 'bunker' ? GROUND_DEBRIS_LAUNCH_BUNKER : GROUND_DEBRIS_LAUNCH_TOWER
  const fan = [-GROUND_DEBRIS_SPREAD, 0, GROUND_DEBRIS_SPREAD] // left / centre / right
  return fan.map((lateral): GroundDebris => ({
    pos: [pos[0], pos[1], pos[2]],
    vel: [lateral, launch, 0],
    age: 0,
    kind: debrisKind,
  }))
}

/**
 * Advance the ground debris one frame (sw7-14 / X-005, ROM DOXPLD move + gravity):
 * carry each piece by its velocity (and the world scroll), cut the vertical velocity
 * by gravity, freeze the height at the floor, and drop pieces past their life. The
 * spawn appends fresh pieces AFTER this, so a just-launched piece keeps its pristine
 * launch velocity for the frame it is born.
 */
function advanceGroundDebris(debris: GroundDebris[], dt: number, scrollSpeed: number): GroundDebris[] {
  const next: GroundDebris[] = []
  for (const p of debris) {
    const age = p.age + dt
    if (age >= GROUND_DEBRIS_LIFE_SECONDS) continue // XP$TMR ran out — dropped
    // Integrate height with the CURRENT vertical velocity, then freeze at the floor
    // (WSXPLD.MAC :550-555: ADDD XP$MZ / IFLT / LDD #0 ;FREEZE AT GROUND LEVEL).
    const y = Math.max(0, p.pos[1] + p.vel[1] * dt)
    const pos: Vec3 = [p.pos[0] + p.vel[0] * dt, y, p.pos[2] + p.vel[2] * dt + scrollSpeed * dt]
    // Then gravity cuts the vertical velocity (:559 SUBD #50.*4 = 200 u/frame²).
    const vel: Vec3 = [p.vel[0], p.vel[1] - GROUND_DEBRIS_GRAVITY * dt, p.vel[2]]
    next.push({ ...p, pos, vel, age })
  }
  return next
}

/**
 * Wave 2 — Death Star surface. The ship skims the y=0 floor (the yoke flies it
 * up/down, and dipping too low scrapes a shield); laser turrets scroll in from
 * ahead, lob bolts at the cockpit, and fall to the player's fire.
 */
function stepSurface(state: GameState, input: Input, dt: number, common: StepCommon): GameState {
  const { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots, events, laserEdge, firePrev, laserOn, beamOrigin, beamDir } =
    common

  // --- Terrain skim: yoke flies up/down; can't pass the floor; scrape crashes
  let altitude = state.altitude + aimY * ALTITUDE_RATE * dt
  // A NaN yoke (shell bug: `input.ts` divides by a zero-height canvas rect) would slip EVERY clamp
  // below — `<` and `>` are both false for NaN — and sw7-16 made that load-bearing: once the fire
  // target and the hit-test are centred on the ship, `collides(pos, [0, NaN, 0], r)` is false
  // forever and the pilot goes quietly invulnerable, with NaN absorbing so altitude never recovers.
  // Before this story both read finite constants, so a NaN could not reach them. Reset, don't
  // charge a shield: this is the shell miscounting, not the pilot scraping. NaN only — ±Infinity
  // is already handled correctly below (ceiling clamp / crash bump) and must keep that behaviour.
  if (Number.isNaN(altitude)) altitude = SKIM_ALTITUDE
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

  // --- Accelerating forward pace (sw7-18 / D-022) ---------------------------
  // The ROM ramps the ground speed from $100 (256 u/frame) to $400 (1024), +1
  // u/frame per frame (WSMAIN.MAC:1621/1660-1665). Seeded on surface entry,
  // integrated here, clamped at the cap. The WHOLE surface scroll rides this
  // rate — both the field and the scroll accumulator — keeping the world-scroll
  // camera inversion (STRUCTURAL-accepted); only the rate changed.
  const scrollSpeed = Math.min(state.surfaceScrollSpeed + SURFACE_ACCEL * dt, SURFACE_MAX_SPEED)
  const surfaceScrollZ = state.surfaceScrollZ + scrollSpeed * dt
  // GD.SEQ: how many full $8000 forward passes have completed (WSMAIN.MAC:2537-2545).
  const gdSeq = Math.floor(surfaceScrollZ / SURFACE_SEQ_SPAN)

  // Ground debris from earlier kills flies its ballistic arc (sw7-14 / X-005); a kill
  // below appends three fresh pieces to this list. Rides the SAME scroll as the field.
  const groundDebris = advanceGroundDebris(state.groundDebris, dt, scrollSpeed)

  // The PMREB "FINISH GROUND WITH REBEL" rider (sw7-18): the ROM fires it at
  // PH.TIM == 14 pseudo-seconds — game-frame 224, where the per-frame speed has
  // ramped from $100 to $1E0 (480). Fire the one-shot 'finishGround' tune the frame
  // our accelerating rate first crosses that speed — monotonic, so exactly once.
  if (state.surfaceScrollSpeed < SURFACE_FINISH_GROUND_SPEED && scrollSpeed >= SURFACE_FINISH_GROUND_SPEED) {
    events.push({ type: 'tune', tune: 'finishGround' })
  }

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
    const pos: Vec3 = [turret.pos[0], turret.pos[1], turret.pos[2] + scrollSpeed * dt]
    // age toward fire grace; keep the kind (bunker/tower/bishop) + seq riding along
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
  // Awakening gate (sw7-18 / D-018): an object may fire only once the traversal
  // has reached its awakening sequence (`gdSeq >= .C`, WSGRND.MAC:740-742). An
  // absent seq (hand-placed fixtures / pre-D-018 saves) is awake from the start.
  const armed = turrets.filter(
    (turret) => (turret.age ?? 0) >= TOWER_FIRE_GRACE && gdSeq >= (turret.seq ?? 0),
  )
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
  //
  // CLGLZ (WSLAZR.MAC:707) is CLSLZ's ground twin: gated on the laser being on, it takes the
  // NEAREST object under the site, instantly, and exactly one per frame. No forward clip here —
  // only the trench (CLBLZ) builds its beam against a fixed far line.
  let score = state.score
  let towerKills = 0
  const killed = new Set<number>()
  if (laserOn) {
    let bestRange = Infinity
    let hit = -1
    for (let ti = 0; ti < turrets.length; ti++) {
      const range = beamHit(beamOrigin, beamDir, turrets[ti].pos, TURRET_HIT_RADIUS)
      if (range !== null && range < bestRange) {
        bestRange = range
        hit = ti
      }
    }
    if (hit >= 0) {
      killed.add(hit)
      score += TURRET_SCORE
      if (turrets[hit].kind !== 'bunker') towerKills++
      events.push({ type: 'enemy-death', enemyType: 'turret', pos: [...turrets[hit].pos] as Vec3 })
      // X-005: the destroyed object throws off three ballistic debris pieces.
      groundDebris.push(...spawnGroundDebris(turrets[hit].pos, turrets[hit].kind))
    }
  }
  const standingTurrets = turrets.filter((_, i) => !killed.has(i))

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

  const surfaceHit = loseShield(state.lives, state.shieldHitAt, damage, t) // S-016 window
  const lives = surfaceHit.lives
  pushFarewell(events, lives) // fatal hit → the end-of-game farewell (sw7-8, U-017)

  // The 50,000 "cleared all towers" bonus (sw3-3 / H-021) now banks MID-PHASE,
  // decoupled from the phase length (sw7-18 / D-019): the frame the last tower
  // falls — phaseKills reaches the wave's quota — once, banner and all, while the
  // pilot keeps flying the rest of the traversal. `towerBonusAwardedAt` is the
  // once-latch; the bunkers-only wave (0 towers) can never satisfy it.
  const phaseKills = state.phaseKills + towerKills // towers only — bunkers are quota-neutral
  const towerQuota = towersForWave(state.wave)
  let towerBonusAwardedAt = state.towerBonusAwardedAt
  if (towerQuota > 0 && phaseKills >= towerQuota && towerBonusAwardedAt === null) {
    score += SURFACE_CLEAR_BONUS
    events.push({ type: 'tower-bonus', amount: SURFACE_CLEAR_BONUS })
    towerBonusAwardedAt = t
  }

  return {
    ...state,
    rng,
    t,
    aimX,
    aimY,
    score,
    lives,
    shieldHitAt: surfaceHit.shieldHitAt,
    altitude,
    // The ground grid rides the SAME accelerating flow as the turrets (sw7-18 /
    // D-022) — both advance by scrollSpeed·dt — so they rush past together.
    surfaceScrollZ,
    surfaceScrollSpeed: scrollSpeed,
    gdSeq,
    towerBonusAwardedAt,
    surfaceMazeLaid,
    gameOver: lives <= 0,
    mode: lives <= 0 ? 'gameover' : state.mode,
    phaseKills,
    projectiles,
    laserEdge,
    laserOn,
    firePrev,
    turrets: standingTurrets,
    groundDebris,
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
  const { t, aimX, aimY, rng, projectiles, fireCooldown, enemyShots, events, laserEdge, firePrev, laserOn, beamOrigin, beamDir } =
    common
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
    laserEdge,
    laserOn,
    firePrev,
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
  // --- SPENDS THE BEAM if it lands, so a beam that killed an obstacle can't also
  // --- arm the torpedo this same frame (the precedence the bolt model had).
  //
  // CLBLZ (WSLAZR.MAC:391) is the trench's collision, and it is the one that CLIPS: the beam is
  // built against a fixed forward line whose endpoint is $7000 = 28,672 units ahead of the ship —
  //
  //     10$:
  //         LDD #7000               ;FARTHEST FORWARD POINT
  //         ADDD M$TX+M.U1
  //
  // — so nothing beyond that line is under the beam at all, however clear the shot looks. The
  // clone already carries that number, ROM-anchored, as the channel's own far cutoff.
  //
  // The trench holds TWO kinds of thing the beam can land on — the obstacles here and the exhaust
  // port below — and CLSLZ resolves exactly ONE per frame: the NEAREST. So both are ranged first
  // and ranked against each other, and whichever is closer takes the beam. The port's range is
  // computed up here, before the obstacle loop, purely so the comparison is possible; the port's
  // own logic still lives below.
  //
  // An earlier cut asked "did the beam hit any obstacle?" instead of "which is nearer?", which let
  // an obstacle standing BEHIND the port shadow it — not CLSLZ, and not what the bolt model did
  // either (a travelling bolt reached the nearest thing first, so its precedence WAS distance).
  const portPos: Vec3 | null =
    state.exhaustPort === null
      ? null
      : [
          state.exhaustPort.pos[0],
          state.exhaustPort.pos[1],
          state.exhaustPort.pos[2] + TRENCH_SCROLL_SPEED * dt,
        ]
  const portRange =
    laserOn && portPos !== null
      ? beamHit(beamOrigin, beamDir, portPos, PORT_HIT_RADIUS, TRENCH_FAR)
      : null

  let beamObstacle = -1
  let beamObstacleRange = Infinity
  if (laserOn) {
    for (let i = 0; i < state.trenchObstacles.length; i++) {
      const o = state.trenchObstacles[i]
      if (o.kind === 'catwalk') continue // a catwalk is a hazard to fly into, not a target
      // The instantaneous beam hits the obstacle the pilot SEES — its position at the
      // START of the frame, before this frame's scroll (WYSIWYG, sw5-6). At the ROM
      // scroll speed (B-008) the obstacle advances ~768 units per frame, so ranging
      // against the post-scroll position would move the target off the aim between
      // sighting and resolution and make "aim at it, hit it" depend on the frame rate
      // — the exact defect trench-aim-wysiwyg.test.ts guards. The obstacle's own
      // scroll below still carries it up the channel for the next frame.
      const range = beamHit(beamOrigin, beamDir, o.pos, OBSTACLE_HIT_RADIUS, TRENCH_FAR)
      if (range !== null && range < beamObstacleRange) {
        beamObstacleRange = range
        beamObstacle = i
      }
    }
  }
  // The winner of the one-object-per-frame contest. A tie cannot matter: the two are different
  // objects at different depths, and an exact float tie hands it to the obstacle, which is the
  // same way the space loop breaks its ties (first list wins).
  const obstacleTakesTheBeam = beamObstacle >= 0 && beamObstacleRange <= (portRange ?? Infinity)

  let obstacleScore = 0
  const survivors: TrenchObstacle[] = []
  let crashedCatwalk = false
  for (let oi = 0; oi < state.trenchObstacles.length; oi++) {
    const o = state.trenchObstacles[oi]
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
      // At the ROM scroll speed a catwalk seated near the cockpit advances ~768
      // units per frame (B-008) and can leap clean over the hit sphere between two
      // frames — a catwalk at z=-1 lands at +261 in one step, well past the 240
      // radius. So the sphere (which still catches a catwalk that lands inside it on
      // approach) is backed by a CROSSING test: once the catwalk reaches or passes
      // the cockpit plane (z >= 0) still within a hit radius LATERALLY and
      // VERTICALLY of the ship, it has struck. dt-independent, and a full dive
      // (trenchView at TRENCH_EYE_MIN, > a hit radius below the catwalk) still opens
      // clean under it — the dodge is unchanged.
      const spanCrash = collides(pos, trenchView, CATWALK_HIT_RADIUS)
      const crossCrash =
        pos[2] >= 0 && Math.hypot(pos[0] - trenchView[0], pos[1] - trenchView[1]) <= CATWALK_HIT_RADIUS
      if (spanCrash || crossCrash) {
        crashedCatwalk = true
        events.push({ type: 'terrain-crash' })
        continue // crashed through it — removed
      }
    } else if (oi === beamObstacle && obstacleTakesTheBeam) {
      obstacleScore += o.kind === 'turret' ? TRENCH_TURRET_SCORE : TRENCH_SQUARE_SCORE
      events.push({ type: 'trench-obstacle-destroyed', kind: o.kind })
      continue
    }
    if (pos[2] > 0) continue // scrolled past the cockpit — despawn
    survivors.push({ kind: o.kind, pos })
  }
  const catwalkHit = crashedCatwalk ? loseShield(base.lives, base.shieldHitAt, 1, t) : null // S-016 window
  const afterObstacles: GameState = {
    ...base,
    score: base.score + obstacleScore,
    trenchObstacles: survivors,
    ...(catwalkHit
      ? {
          lives: catwalkHit.lives,
          shieldHitAt: catwalkHit.shieldHitAt,
          gameOver: catwalkHit.lives <= 0,
          mode: catwalkHit.lives <= 0 ? ('gameover' as const) : base.mode,
        }
      : {}),
  }
  // A fatal catwalk crash is a death like any other (sw7-8, U-017).
  if (catwalkHit) pushFarewell(events, catwalkHit.lives)

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
  // Reads the post-obstacle beam state, not the raw
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
  // IT IS THE BEAM THAT ARMS IT, and now literally so (sw7-17 / R11b). This was a swept test
  // against a travelling bolt — swept precisely because a 12,000 u/s bolt could step clean over
  // the box between two frames. A hitscan beam is an exact ray and cannot tunnel, so the sweep
  // goes with the projectile it existed to chase; the ROM's own arming test is the LASER's:
  //
  //     LDA PT.LZF              ;PROTON TORP LAZAR FLAG
  //     IFGT                    ;?LAZAR GOT CLOSE ENUF TO FIRE PROTON TORPS?
  //     LDA #0FF
  //     STA PT.LZF              ;MARK THAT PROTON TORP HAS FIRED
  //     JSR FRPTGN              ;THEN LAUNCH DIRECT HIT PROTON TORPS   (WSLAZR.MAC:406-411)
  //
  // — and it sits in CLBLZ, immediately above the `#7000` clip, so it is the same beam and the
  // same forward line. The beam is SPENT if it already killed an obstacle this frame, which keeps
  // the precedence the bolt model had ("a bolt spent on an obstacle can't also kill the port").
  // The port arms only if it WON the one-object-per-frame contest ranked above — i.e. the beam
  // reached it before it reached any obstacle. `portRange` was computed up there, against the same
  // scrolled position `port` carries here.
  const armingBeam = portRange !== null && !obstacleTakesTheBeam
  const armed = afterObstacles.portTorpedoArmed || armingBeam
  // The death knell (sw7-8, U-010) rings when the torpedo is FIRED, not when it
  // lands: WSGUNS.MAC:1220 puts `JSR PMSF2 ;SOUND THE DEATH KNELL` in FRPTGN —
  // the routine that CREATES the torpedo (PT.LIV=1). Our launch moment is this
  // arming edge (the bolt becomes the torpedo). One-shot by construction: the
  // latch is set after this frame, and a fresh port re-primes it (the miss path
  // below). Pushed BEFORE the detonation resolution so the degenerate
  // armed-inside-the-window frame carries knell-then-finale, the ROM's order.
  if (!afterObstacles.portTorpedoArmed && armingBeam) {
    events.push({ type: 'tune', tune: 'deathKnell' })
  }

  // --- RESOLVE: a DIRECT HIT, once the port reaches the window ----------------
  //
  // The torpedo cannot miss (MVPTGN's funnel drives both offsets to zero), so the outcome is the
  // flag, read at the window — exactly WSMAIN's `LDA PT.LIV` at `SUBD #0800`. The $800 gate that
  // sw3-15 pinned still holds: an armed run does not win at the trench mouth, it wins at the wall.
  const detonates = armed && inApproachWindow
  if (detonates) {
    // The beam is not an object; everything still in flight rides on untouched.
    const liveBolts = afterObstacles.projectiles
    // "Use the Force": a clean run — no trench shots before the killing torpedo
    // itself — awards FORCE_BONUS on top of TRENCH_BONUS (fidelity epic, task 4;
    // findings ## Exhaust port & run outcome, the type-4 marker's one-shot latch).
    const clean = afterObstacles.trenchShotsFired <= 1 // only the killing torpedo
    // sw7-4: the Force bonus is WAVE-SCALED (S-012) and clean-gated; the per-shield
    // bonus banks 5,000 x surviving shields (S-013) on ANY win, unconditionally.
    const forceBonus = clean ? forceBonusForWave(state.wave) : 0
    const shieldBonus = SHIELD_BONUS_PER_UNIT * afterObstacles.lives
    const bonus = TRENCH_BONUS + forceBonus + shieldBonus
    if (clean) events.push({ type: 'force-bonus', amount: forceBonus })
    events.push({ type: 'shield-bonus', amount: shieldBonus, shields: afterObstacles.lives })
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
      // The per-shield reward banner (S-013) rides the warp the same way — banked
      // on any win, so its banner shows into the next wave's space phase.
      shieldBonusAwardedAt: t,
    })
  }

  // --- The port reaching the cockpit un-destroyed is a crash: costs a shield --
  // At the ROM scroll speed the port advances up to ~768 units per game frame (B-008),
  // far past COCKPIT_HIT_RADIUS (80), so the old symmetric-sphere test let it TUNNEL
  // clean through the nose in one step and scroll away un-missed — a hazard the old
  // 500 u/s speed hid. Detect the CROSSING instead: the port has reached the nose
  // once it is at or past the cockpit plane (z >= 0) while still laterally within a
  // hit-radius. dt-independent (no overshoot escape), and an off-axis port — a test
  // construct; the ROM's port is centred — still never counts, exactly as the sphere
  // did (its 3D distance stayed ≥ its lateral offset ≫ the radius).
  const reachedCockpit = port[2] >= 0 && Math.hypot(port[0] - COCKPIT[0], port[1] - COCKPIT[1]) <= COCKPIT_HIT_RADIUS
  if (reachedCockpit) {
    const portHit = loseShield(afterObstacles.lives, afterObstacles.shieldHitAt, 1, t) // S-016 window
    const lives = portHit.lives
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
      shieldHitAt: portHit.shieldHitAt,
      gameOver: lives <= 0,
      mode: lives <= 0 ? 'gameover' : afterObstacles.mode,
      exhaustPort: spawnPort(romWave0(state.wave), createRng(state.rng.seed)), // another pass down the trench
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
  // the surviving projectiles (the beam that armed the torpedo was never an object in flight).
  return {
    ...afterObstacles,
    exhaustPort: { pos: port },
    projectiles: afterObstacles.projectiles,
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

/** The phase a cleared `s.phase` advances into. WAVE 1 HAS NO GROUND PHASE
 * (sw7-18 / D-015): the ROM flies wave 1 space -> trench, skipping the surface
 * (`;WAVE 1 HAS NO GROUND PHASE`, WSGRND.MAC:637; PHIGD's DECA "ALWAYS SKIPPED ON
 * FIRST GAME WAVE", WSMAIN.MAC:1604). Every later wave follows the ordered table. */
function nextPhaseFor(s: GameState): Phase | null {
  if (s.phase === 'space' && s.wave === 1) return 'trench'
  return NEXT_PHASE[s.phase]
}

/** Has this phase been cleared? Space is a flat KILL quota. The SURFACE ends by
 * TRAVERSAL ONLY (sw7-18 / D-019): the ROM flies five `$8000` passes of the maze
 * field and drops into the trench at `GD.SEQ >= 5` (`CMPA #5 ;ONLY GO SO FAR INTO
 * GROUND SEQUENCES`, WSMAIN.MAC:1678-1679) — killing every tower banks the 50,000
 * bonus (mid-phase, see `stepSurface`) but does NOT shorten the run, and a single
 * missed tower never strands it. The trench never clears by count (the exhaust-port
 * hit in stepTrench ends it). Exhaustive over Phase so a new phase can't silently
 * default to a wrong condition. */
function phaseCleared(s: GameState): boolean {
  switch (s.phase) {
    case 'space':
      return s.phaseKills >= SPACE_WAVE_QUOTA
    case 'surface':
      return s.gdSeq >= SURFACE_END_SEQ
    case 'trench':
      return false
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

/** The post-hit gauge-redraw window (sw7-4 / S-016): fold a frame's raw shield
 * damage into AT MOST ONE lost shield per POST_HIT_SHIELD_WINDOW — a hit landing
 * while the gauge is still animating the previous loss is dropped, not stacked
 * (ROM GS.GLW/GS.HIT debounce, WSGLOW.MAC:58-64 `BG1GLW`). The shared funnel every
 * shield-loss site routes through, so the cap holds across sources (two fireballs,
 * a TIE + a fireball, a crash right after a hit). Returns the post-hit lives and
 * the updated `shieldHitAt` stamp; `rawDamage <= 0` is a no-op. */
function loseShield(
  lives: number,
  shieldHitAt: number | null,
  rawDamage: number,
  t: number,
): { lives: number; shieldHitAt: number | null } {
  if (rawDamage <= 0) return { lives, shieldHitAt }
  if (shieldHitAt !== null && t - shieldHitAt < POST_HIT_SHIELD_WINDOW) {
    return { lives, shieldHitAt } // inside the redraw cycle — the hit is dropped
  }
  return { lives: Math.max(0, lives - 1), shieldHitAt: t }
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
  const next = nextPhaseFor(s)
  if (next === null) return s
  // The phase cleared — carry the frame's events forward, announce the warp, and
  // cue the entering phase's voice lines if it has any (sw2-5; sequence per sw7-8).
  const advanced = enterPhase(s, next)
  const events: GameEvent[] = [...s.events, { type: 'level-clear', next }]
  for (const line of ENTER_PHASE_SPEECH[next] ?? []) events.push({ type: 'speech', line })
  // The descent tune (sw7-8, U-014): PMDES fires at space PH.TIM 400, twenty
  // frames before the descend flip (WSMAIN.MAC:1439/:1442) — our un-sequenced
  // equivalent is the space -> surface edge itself.
  if (s.phase === 'space' && next === 'surface') {
    events.push({ type: 'tune', tune: 'descent' })
  }
  // Swap the looping music channel to the entering phase's theme (sw3-5). Fires on
  // this edge only; `enterPhase` preserves the wave, so surface->'towers' /
  // trench->'trench' regardless of wave (the Imperial March is a space-only swap).
  events.push({ type: 'music', track: musicTrackFor(next, advanced.wave) })
  // NOTE (sw7-18 / D-019): the 50,000 "cleared all towers" bonus is NO LONGER banked
  // here. It is decoupled from the phase clear and banks MID-PHASE in `stepSurface`
  // the frame the last tower falls (the ROM's Q.ATP is set independently of GD.SEQ).
  // But `enterPhase` nulls `towerBonusAwardedAt` on every entry, so the surface->trench
  // edge would otherwise DISCARD a stamp banked earlier in the same surface — cutting the
  // "50,000 FOR SHOOTING ALL TOWERS" banner short in the trench (render.ts), unlike the
  // sibling reward stamps that `clearRun` carries across the wave boundary. Carry it here,
  // ONLY when leaving the surface (a fresh surface has no bonus to preserve).
  if (s.phase === 'surface') {
    return { ...advanced, towerBonusAwardedAt: s.towerBonusAwardedAt, events }
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
    // A leftover death cue never crosses into the next phase (story sw3-8) — the
    // ground debris cloud (sw7-14) is wiped the same way, so none rains into the trench.
    dyingTies: [],
    groundDebris: [],
    turrets: [],
    // The trench opens with its target downrange at the chain-derived BS.PLC
    // (B-009); other phases carry no port. Seeded per-run like the obstacles below.
    exhaustPort: phase === 'trench' ? spawnPort(romWave0(s.wave), createRng(s.rng.seed)) : null,
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
    // The reward banners reset on phase entry too; `clearRun` re-stamps
    // shieldBonusAwardedAt (per-shield) so it survives the warp, and progress()
    // stamps towerBonusAwardedAt on the surface->trench drop.
    shieldBonusAwardedAt: null,
    towerBonusAwardedAt: null,
    // NOTE (sw7-4 R2, Reviewer): shieldHitAt is DELIBERATELY carried through `...s`,
    // NOT reset here — the ROM shield gauge (GS.GLW/GS.HIT) is ONE continuous
    // mechanism across a whole run (space->surface->trench), so the post-hit window
    // (S-016) must survive a wave-internal phase change. Resetting it let a hit on a
    // phase-clear frame escape the debounce. `t` is monotonic, so an old stamp
    // simply expires; no explicit reset is needed even at a new wave.
    enemyShots: [],
    altitude: phase === 'surface' ? SKIM_ALTITUDE : s.altitude,
    // Reset the surface scroll on every phase entry so a fresh (or jumped) surface
    // always opens with the ground grid anchored at the cockpit (story 11-5).
    surfaceScrollZ: 0,
    // Re-seed the accelerating surface pace on every phase entry (sw7-18): a fresh
    // (or jumped, or re-entered) surface always opens at the ROM's $100 seed speed —
    // a fast prior run never bleeds its rate into the next.
    surfaceScrollSpeed: SURFACE_SEED_SPEED,
    // GD.SEQ zeroes only when ENTERING the surface (a fresh traversal starts at
    // sequence 0); leaving the surface CARRIES its final count (>= SURFACE_END_SEQ)
    // so the surface->trench edge reflects the traversal that ended it, while
    // surfaceScrollZ resets. The next wave's surface entry re-zeroes it.
    gdSeq: phase === 'surface' ? 0 : s.gdSeq,
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

/** A fresh exhaust port: centred on the run, at the wave's chain-derived BS.PLC
 *  offset down −Z (finding B-009), clamped into the beam's `#7000` forward reach
 *  (TRENCH_FAR — WSLAZR CLBLZ) so the port that must exist to scroll is seated at
 *  the farthest point still under the beam. The location is read from the wedge
 *  chain (`trenchPortDistance`), not the old fixed −2400; the run RNG is threaded
 *  through a LOCAL cursor so the seed is never consumed here (core purity),
 *  matching how `enterPhase` seeds the trench obstacles. */
function spawnPort(baseWave: number, rng: Rng): { pos: Vec3 } {
  return { pos: [0, 0, -Math.min(trenchPortDistance(baseWave, rng), TRENCH_FAR)] }
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
    shieldBonusAwardedAt: s.shieldBonusAwardedAt,
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
    // Carry the awakening sequence (sw7-18 / D-018) so the fire-gate can hold this
    // object dormant until the traversal reaches `gdSeq >= seq`.
    seq: e.seq,
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
 * centre laterally. This IS the eye — `render.ts cameraView` builds the surface view matrix by
 * CALLING this — so it is also the muzzle, the point incoming fire aims at, and the centre of the
 * cockpit hit-test. One point, four jobs; that is the whole fix.
 *
 * Exported because the shell's camera calls it: the gun and the eye cannot drift apart if they are
 * the same call. Shell -> core is the allowed direction; core never imports shell.
 */
export function surfaceShip(altitude: number): Vec3 {
  return [0, altitude, 0]
}

/**
 * THE SHIP — the one point the pilot's eye, his gun, and everything aimed at him all share, in
 * whichever phase he is flying (stories sw5-6 + sw7-16). Each phase seats him somewhere different,
 * and the collision world does NOT follow him:
 *
 *   space    the fixed cockpit at the origin — the only phase where eye and origin coincide
 *   surface  [0, altitude, 0] — he flies 40..238 above the floor (MIN/MAX_SKIM_ALTITUDE)
 *   trench   `trenchView` — he flies 512..3840 above it (TRENCH_EYE_MIN/MAX), and steers
 *
 * Exhaustive over Phase — no `default`, no trailing return — so a fourth phase is a COMPILE error
 * (TS2366) instead of a silent origin. That silent default IS the bug this story pays off; the
 * type is what stops it recurring. Same guard `phaseCleared` relies on.
 *
 * NOTE this is the ship at the START of the step — the POINT, not a compromise. The shell steps
 * and THEN renders (`main.ts` :146, :287), so the yoke arriving here was set by a pilot looking at
 * the frame drawn from THIS state: this is the eye he sighted down, and his bolt leaves from it.
 * `stepSurface` builds its OWN `surfaceShip(altitude)` from the flown height because its jobs
 * resolve at the END of the frame. Both are right; they answer different questions. The two differ
 * by one frame of climb (ALTITUDE_RATE * dt = 3.33), and by up to 88 on a terrain-crash frame,
 * where the bump TELEPORTS the ship 40 -> 128 rather than flying it — so do not derive that bound
 * from ALTITUDE_RATE alone. Pinned by `surface-aim-wysiwyg.test.ts` (b), which fires with aimY != 0.
 */
export function shipPoint(s: GameState): Vec3 {
  switch (s.phase) {
    case 'trench':
      return [...s.trenchView] as Vec3
    case 'surface':
      return surfaceShip(s.altitude)
    case 'space':
      return [...COCKPIT] as Vec3
  }
}

/** Unit vector from a world position back toward the cockpit at the origin.
 *
 * ⚠ SPACE ONLY — this is the TIE flight model's homing target, where the ship really is the
 * origin. It is NOT the surface's ship: `stepSurface` aims its fire with `surfaceShip(altitude)`
 * instead. Retargeting this helper would break space the way the surface was broken before sw7-16
 * — caught via `moveEnemy` by `tests/core/tie-peel-away.test.ts` (story 9-3).
 *
 * That guard covers `moveEnemy` ONLY. The other caller, `spawnTie`, is unguarded by any test in
 * the repo — deliberately noted rather than papered over: its `dir` is vestigial, because
 * `moveEnemy` re-derives the heading from `toCockpit(e.pos)` every frame and reads only the
 * MAGNITUDE of `vel`, so a wrong spawn direction is overwritten on the first move and is
 * observable for one frame. Do not add a test to chase it; do not trust it to hold a decision. */
function toCockpit(pos: Vec3): Vec3 {
  return normalize(sub(COCKPIT, pos))
}
