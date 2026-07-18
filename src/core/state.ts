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
import { mazeForWave } from './surfaceMazes'
import { TRENCH_EYE_SEAT, TRENCH_FAR } from './trench-channel'
import { TRENCH_PORT_OFFSET } from './trench-wedges'

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
  /** Enemy type — a string union (no enum) so it stays cheap and serialisable.
   * `'darth'` is Darth Vader's TIE (ROM shape RTH): a distinct enemy that is
   * immortal to player fire and scores VADER_SCORE per hit (sw7-13, A-016/S-002). */
  kind: 'tie' | 'darth'
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
  /** Post-hit cooldown in seconds — the ROM A$GLW "glowing from a hit" flag
   * (WSCPU.MAC:346-348,371). Set when Darth takes a scoring hit and decays each
   * frame; while it is > 0 CPHTSA leaves him alone, so a burst of fire scores 2,000
   * ONCE, not once per bolt (no double jeopardy). Only Darth carries it — plain TIEs
   * omit it (treated as 0). A sim scoring gate, NOT a render field; the visual
   * roll/glow is the deferred A-018. (sw7-13) */
  glow?: number
}

/** A TIE caught mid-death: it has been shot and is drawn as its exploded wing
 *  fragments flying apart for a brief beat, instead of vanishing (story sw3-8).
 *  Purely a render cue — it has no collision and never fires. */
export interface DyingTie {
  /** World-space position where the TIE was destroyed (the fragments' origin). */
  pos: Vec3
  /** Seconds since the kill; the shell spreads the fragments by this and the sim
   * drops the entry once it passes TIE_DEATH_SECONDS. */
  age: number
}

/** A blown-apart piece of a surface tower/bunker (story sw7-14, ROM finding X-005:
 *  BGTWXP/BGBKXP, WSXPLD.MAC). Unlike DyingTie — a render-only cue whose fly-apart
 *  the shell fakes from `age` — this is a REAL ballistic entity (finding X-004): the
 *  sim carries its 3D velocity and integrates it each frame (upward launch, gravity,
 *  floor-freeze), exactly as the ROM's DOXPLD moves XP$Cx / XP$Mx. The shell only draws
 *  it (a tumbling chunk + a scaled ground shadow, coloured by `kind`). */
export interface GroundDebris {
  /** World-space position of the piece. `pos[1]` is HEIGHT above the y=0 floor (the
   * ROM's XP$CZ; its up-axis is Z, ours is Y), clamped to ≥ 0 by the floor-freeze. */
  pos: Vec3
  /** World-space velocity (units/second). `vel[1]` is the vertical launch, cut down
   * GROUND_DEBRIS_GRAVITY·dt each frame (the ROM's XP$MZ / `SUBD #50.*4`). */
  vel: Vec3
  /** Seconds since the piece was spawned; the sim drops it once it passes
   * GROUND_DEBRIS_LIFE_SECONDS (the ROM's XP$TMR countdown from 0x20 frames). */
  age: number
  /** Which shadow the shell paints: red for a bunker (VWBKN), white for a tower
   * (VWTWN). A kindless (legacy) turret bursts as a tower — see the spawn in sim.ts. */
  kind: 'tower' | 'bunker'
}

/** A ground object standing on the Death Star surface (Wave 2). World space.
 *  Mirrors the ROM's one-table design (WSGRND.MAC mazes: TOWER/BISHOP/BUNKER
 *  entries share one list, discriminated by a picture-type byte). */
export interface Turret {
  /** World-space position of the object's BASE (y ≈ 0, on the floor). The
   * hit-test reads this; a tower's fireball launches from TOWER_HEIGHT above it
   * (the white cap — the tower's gun). */
  pos: Vec3
  /** Seconds since this object rose (Story sw2-3). A tower holds its fire for
   * TOWER_FIRE_GRACE after it appears so round-1 firing is a readable beat, not
   * instant. Optional — hand-placed `{ pos }` fixtures omit it and are treated as
   * a fresh tower (age 0) via `?? 0`. */
  age?: number
  /** Ground-object type (sw3-11, the ROM TGD$PC byte). ABSENT means 'tower' —
   * pre-sw3-11 fixtures and saves stay valid. Bunkers are the squat red
   * SURFACE_BUNKER shorties: shootable, but quota-NEUTRAL (the ROM's BUNKER
   * maze macro never increments `.TWRS`, so they never count toward the
   * towersForWave quota or the cleared-all bonus). Bishops (sw4-3, the ROM
   * BISHOP maze macro) DO count toward the quota, like towers — only bunkers
   * are neutral. */
  kind?: 'tower' | 'bunker' | 'bishop'
  /** Awakening sequence (WSGRND `.BYTE .C`, 0..3): the object is dormant — it does
   * not fire (nor, in the shell, draw) — until the ground traversal has reached its
   * sequence (`gdSeq >= seq`, WSGRND.MAC:740-742). Optional — hand-placed `{ pos }`
   * fixtures and pre-sw7-18 saves omit it and are treated as awake-from-the-start
   * (seq 0) via `?? 0`, like `age`/`kind` (sw7-18 / D-018). */
  seq?: number
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
// fireball slots* on screen at once. The SCORE values below are now
// ROM-resolved from the packed-BCD score table recovered by the sw2-6
// disassembly fidelity audit (docs/sw2-6-disassembly-fidelity-audit.md,
// ## Scoring values), each cited by its ROM symbol. The remaining shield/timing
// constants are still authentic-FEEL — chosen to play right and single-sourced
// here for easy correction once deeper reverse engineering recovers them.

/** Shields the player starts a run with; a hit costs one. */
export const STARTING_LIVES = 6
// sw7-4 / S-015 removed the 400,000 / 800,000 "extra shield" thresholds: the ROM
// has NO score-threshold life/shield grant (the 2026-07-15 audit's refuter did the
// exhaustive BCD hunt). Those numbers are the Death-Star-SELECTION start-bonus
// DISPLAY strings (TSCBN1..4 = 200k/400k/600k/800k, WSGAS.MAC:527-530; banner
// MS.BON "DEATH STAR BONUS EARNED"), which the clone misread as a recurring ladder.
// The genuine selection bonus is a separate, unmodelled feature (see the sw7-4
// session Delivery Findings).
/** The bonus/extra-life HUD flash (`bonusFlash`) re-arms to this on any score
 *  change, then decays by BONUS_FLASH_DECAY per tick toward 0 — the ROM `byte_4B2C`
 *  "score changed, redraw HUD" counter (`lda #$FF` on every score change; `sub_761D`
 *  drains it under the score). Modeled as a normalized [0,1] intensity; the exact
 *  −8/refresh rate is a cosmetic detail, so BONUS_FLASH_DECAY is an authentic-FEEL
 *  tunable (~1s flash at 60fps), not a test-pinned value. */
export const BONUS_FLASH_MAX = 1
export const BONUS_FLASH_DECAY = 1 / 60
/** Points for destroying a TIE fighter — ROM `byte_984A` = 1,000 (sw3-1, from
 *  the sw2-6 audit; its load-bearing cross-note settles this at 1,000, "do NOT
 *  ×10"). Was a 100-point authentic-feel guess. */
export const TIE_SCORE = 1000
/** Points for destroying Darth Vader's ship — ROM `byte_984D` = 2,000 (sw3-1).
 *  Baked as a single-sourced constant: the sim has no distinct Vader enemy yet
 *  (`Enemy.kind` is `'tie'` only; Vader exists only as a render model), so
 *  nothing awards this today. A future Vader-enemy story wires it to the kill
 *  (see the Delivery Findings in the sw3-1 session). */
export const VADER_SCORE = 2000
/** Points for shooting an enemy fireball out of the air (story 8-18) — ROM
 *  `byte_985C` = 33 (sw3-1, from the sw2-6 audit). The cheapest kill on the
 *  board: fireballs are plentiful (6 slots) defensive ordnance, not fighters.
 *  Was a 50-point authentic-feel guess. */
export const FIREBALL_SCORE = 33
/**
 * NO LONGER THE PLAYER'S GUN (sw7-17 / R11b, audit G-004). The player's laser is a HITSCAN beam:
 * it spawns nothing that travels and has no lifetime, so nothing in `src/` reads this any more.
 *
 * It survives as the lifetime of a generic `Projectile` fixture — tests still build travelling
 * bolts with it to exercise the paths that DO still carry real objects. Deleting it is a
 * follow-up on sw7-17 (it needs an audit of ~11 suites first); it is kept honest rather than
 * kept quiet.
 *
 * What it USED to mean, for anyone reading the history: player bolt lifetime in seconds, paired
 * with PROJECTILE_SPEED so a bolt's REACH (speed × ttl) cleared the far plane (sw4-1).
 */
export const PROJECTILE_TTL = 3
/** Minimum seconds between player shots (trigger fire rate).
 *
 * NOT the laser's on-time — see LASER_SWEEP_SECONDS, which is a different quantity and a
 * longer one (0.39 s vs 0.25 s). G-012 says so in terms: "the 8-frame LZ.EDG value is the
 * laser's on/collision DURATION per shot, a different quantity from a re-fire interval — do
 * not port 8 frames as a cooldown." Re-fire is gated HERE and nowhere else. */
export const FIRE_INTERVAL = 0.25
/** Seconds between TIE spawns into a free slot. */
export const SPAWN_INTERVAL = 1.5
/** Maximum TIE fighters on screen at once — authentic "3 tie fighter slots". */
export const WAVE_SIZE = 3

// Internal tuning (not part of the test contract, but kept here so all the
// space-combat magic numbers live in one place the reviewer can scan).

/**
 * NO LONGER THE PLAYER'S GUN (sw7-17 / R11b, audit G-004) — the laser is HITSCAN and fires no
 * bolt at all; nothing in `src/` reads this. It is kept because it is the number that DESCRIBES
 * the model this story replaced, and `hitscan-laser.test.ts` still uses it to prove its own
 * fixture discriminates (it derives the old projectile's lead error and fails loudly if a retune
 * ever closes the gap). Deleting it is a follow-up on sw7-17.
 *
 * EVERYTHING BELOW IS HISTORY — it describes the travelling bolt, which no longer exists. It is
 * left because the reasoning is the audit trail for G-004, not because any of it is still live:
 *
 * Player bolt speed (units/second), fired down the aim direction. A bolt's REACH
 * is PROJECTILE_SPEED × PROJECTILE_TTL, and it must clear the whole restored TIE
 * approach volume (sw4-1, spec §A): fighters spawn at TIE_SPAWN_DISTANCE (31744)
 * with laterals out to ±2048, so the worst-case spawn corner is ~31876 units away,
 * and a bolt that dies short leaves inbound TIEs unhittable until point-blank — the
 * sw2-1 defect, now at 1983-world scale. 12000 × 3 = 36000 clears that corner with
 * margin. The reach is split (12000 × 3) rather than a single 16000 × 2 bolt on
 * purpose: at 60 fps a 16000-u/s bolt steps ~267 u/frame, wider than the exhaust
 * port's 240-u hit diameter (2 × PORT_HIT_RADIUS), so it would tunnel straight
 * through the port between frames (the sw2-1/sw2-4 tunneling finding). At 12000 the
 * step is ~200 u/frame — inside every shootable target's diameter — and the bolt
 * still outruns the 10000-u/s TIE approach, so the fighters never outrun their own
 * doom. */
export const PROJECTILE_SPEED = 12000
/** Distance ahead (−Z) at which surface turrets appear, and the anchor the Death
 * Star surface is placed against. NOTE: TIEs no longer use this — they spawn at
 * TIE_SPAWN_DISTANCE (story 9-7). Kept at the original value so the surface phase
 * is unchanged. */
export const SPAWN_DISTANCE = 1200
/** Distance ahead (−Z) at which TIEs appear — the RESTORED 1983 world metric
 * (sw4-1, spec §A). The authentic ROM spawns fighters at depth $7C00 = 31744
 * (WSCPU.MAC `.SBTTL STARTING LOCATIONS`, the depth word of every TBG entry), and
 * because models.ts is already authored in raw ROM units the distance ports in
 * UNSCALED. This replaces the compressed 8000 the clone was carrying (~4× too
 * close), which — with the large authentic TIE (bounding radius ~334) — made a
 * fresh fighter read as a screen-filling wall and the whole wave a turkey shoot.
 * At 31744 a spawn is a distant speck that swoops in and grows dramatically. */
export const TIE_SPAWN_DISTANCE = 0x7c00 // 31744 — WSCPU STARTING LOCATIONS depth word
/** TIE approach speed (units/second). PROVISIONAL (sw4-1, spec §A): the cabinet
 * advances the range by $200/tick, but that per-tick delta is NOT pinned to a
 * source-true units/second figure (docs/tie-flight-ai-model.md porting caveat).
 * This is applied as a units/second rate — moveEnemy (sim.ts) steps pos by
 * ENEMY_SPEED × dt — so it is frame-rate independent of TICK_HZ. It is tuned
 * to the spec's design target — a playable ~2.5–4 s spawn→near-bound transit across
 * the restored world: (31744 − 2048) / 10000 ≈ 3.0 s. Retune in playtest; the 8-6
 * difficulty ramp still rides this as the wave-1 base. */
export const ENEMY_SPEED = 10000
/** Cabinet game-frame rate (Hz) — the shared basis for every ROM per-game-frame
 *  rate ported from the 1983 source, which counts in game frames (fireball life
 *  `5,u = $40` = 64 frames; docs/tie-flight-ai-model.md §6). The PRIMARY SOURCE pins
 *  it: WSINT.MAC:147 `LDA #11. ;12.*4.2MS==>50. MS, 20 PER SECOND` — GMTIMR reloads
 *  11+1 = 12 IRQs per game frame; IRQ = 12.096 MHz / 4096 / 12 = 246.094 Hz; game
 *  frame = 246.094 / 12 = 20.508 Hz (audit T-007, pinned three ways). The earlier
 *  guess of 30 ("rate not pinned by the disassembly") ran every ROM-per-frame rate
 *  1.46× fast — the MACRO-11 source pins it. Drives ENEMY_SHOT_TTL, the homing decay,
 *  and the trench voice timer; shared with sw4-1 — define it ONCE here (epic sw4/sw7
 *  guardrail). */
export const TICK_HZ = 246.094 / 12
/** Surface tower/turret fireball speed (units/second, straight-line). Space TIE
 *  fireballs no longer use it — they home via the ROM decay law (story sw4-2, spec
 *  §B); surface fire stays straight-line (out of sw4-2's scope). */
export const ENEMY_SHOT_SPEED = 300
/** Enemy fireball lifetime: the ROM's 64-game-frame fireball life (`5,u = $40`,
 *  FRAGUN `LDB #40`, WSGUNS.MAC:150; docs/tie-flight-ai-model.md §6) expressed in
 *  seconds via the game-frame rate: 64 / 20.508 = 3.12 s (audit G-003). A homing
 *  space fireball (story sw4-2) reaches the cockpit well inside this, so the TTL is a
 *  cleanup cap, not the balance lever. */
export const ENEMY_SHOT_TTL = 64 / TICK_HZ
/** How long the player's laser stays ON — and therefore able to hit — after one trigger pull
 *  (story sw7-17 / R11b, audit G-012). The ROM's LZ.EDG: a pull loads 8 and every game frame
 *  decrements it, with the laser on while it is positive:
 *
 *      LDB #8 / STB LZ.EDG                     WSLAZR.MAC:106-107  (a pull LOADS it)
 *      LDA LZ.EDG / IFGT / DEC LZ.EDG / STA LZ.ON                :110-113  (and burns it down)
 *
 *  8 / 20.508 Hz ≈ 0.390 s, expressed in the same idiom as ENEMY_SHOT_TTL above so it stays a
 *  ROM frame count and not an invented cadence — and in seconds so it is dt-independent.
 *
 *  THIS IS A DURATION, NOT A COOLDOWN. Re-fire is FIRE_INTERVAL's job (0.25 s) and the two are
 *  deliberately independent — a fresh pull RELOADS this counter mid-sweep (the ROM's `LDB #8`
 *  is unconditional). Conflating them is the documented mis-port; see G-012. */
export const LASER_SWEEP_SECONDS = 8 / TICK_HZ
/** How long Darth "glows from a hit" and cannot be re-scored — the ROM loads
 *  `LDA #01F` into A$GLW/A$ROL ("TWO OR SO SECONDS", WSCPU.MAC:371) = 31 game
 *  frames, i.e. 31 / 20.508 Hz ≈ 1.51 s. During this the damage path is skipped
 *  (`LDA A$GLW / IFNE / RTS`, WSCPU.MAC:346-348), so hitting Darth awards 2,000
 *  once per glow window rather than once per bolt of a burst. (sw7-13, S-002) */
export const DARTH_GLOW_SECONDS = 0x1f / TICK_HZ
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
/** Hit sphere around a TIE — the radius the player's BEAM must pass within to hit it
 *  (sw7-17: the gun is hitscan; this is the "under the site" radius at the TIE's depth).
 *  Covers the model extent. */
export const TIE_HIT_RADIUS = 250
/** A destroyed TIE breaks into three ROM pieces, each with its OWN life timer in
 *  XP$TMR, decremented once per 20.508 Hz game frame by DOXPLD (WSXPLD.MAC:485-490).
 *  The two WINGS load `LDA #18` (BGAXP, WSXPLD.MAC:165, :196) = 0x18 = 24 frames =
 *  24 / 20.508 ≈ 1.170 s. RADIX 16 (`.INCLUDE WSCOMN`) — the immediate is HEX 24, not
 *  decimal 18. Frame-true, like DARTH_GLOW_SECONDS = 0x1f / TICK_HZ. (sw7-7 X-002) */
export const TIE_WING_LIFE_SECONDS = 0x18 / TICK_HZ
/** The centre GLOBE piece loads `LDA #10` (BGAXP, WSXPLD.MAC:224) = 0x10 = 16 frames
 *  = 16 / 20.508 ≈ 0.780 s — so the globe pops BEFORE the wings, the "cooling apart"
 *  tell a single flat lifetime erased. (sw7-7 X-002) */
export const TIE_GLOBE_LIFE_SECONDS = 0x10 / TICK_HZ
/** How long a destroyed TIE's whole exploded-fragment cue plays before the sim drops
 *  it (story sw3-8) — the LONGEST piece, i.e. the wings. Now ROM-true (sw7-7). */
export const TIE_DEATH_SECONDS = TIE_WING_LIFE_SECONDS
/** How far (world units) the three wing fragments drift apart as the TIE blows
 *  apart. A render tunable — the split distance is an eyeball concern. */
export const TIE_DEATH_SPREAD = 520
/** Hit sphere around the cockpit for enemy contact and fire. */
export const COCKPIT_HIT_RADIUS = 80
/**
 * Contact sphere for a trench catwalk reaching the cockpit (story 14-7; heights re-anchored
 * by sw5-6). The catwalk hangs ABOVE THE SEATED PILOT and only its z advances as it scrolls, so
 * its closest approach is that fixed vertical offset — CATWALK_Y − TRENCH_EYE_SEAT, which
 * trench-obstacles.ts owns and keeps at half this radius. It is far beyond COCKPIT_HIT_RADIUS
 * (80), which is why the crash never fired on that sphere. This radius must span the offset PLUS
 * a margin: with no margin at all the
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

/** Range at which an un-killed TIE stops homing and peels away — the RESTORED ROM
 * fire/peel floor (sw4-1, spec §A). The authentic cabinet's "not too close" gate is
 * $800 = 2048 (WSCPU.MAC): a fighter that closes inside it has finished its pass and
 * stops both homing and strafing. It doubles as the strafe fire floor (sim.ts
 * inPassWindow) and bounds the nearest a peeling fighter ever gets, so no TIE renders
 * as a full-frame wall. Sits well outside the cockpit hit sphere and far inside the
 * spawn distance (31744). Replaces the compressed 350 the clone was carrying. */
export const TIE_NEAR_BOUND = 0x800 // 2048 — WSCPU "not too close" fire/peel floor
/** Once a PEELING TIE has receded past this range it has left the play volume and
 * its slot is freed. Only peeling fighters are culled (the cull is gated on the
 * peel latch), so this sits well outside the peel trigger (TIE_NEAR_BOUND) — it
 * bounds the recession, not the spawn. Fresh, still-approaching TIEs spawn far
 * beyond it (at TIE_SPAWN_DISTANCE = 31744) and are never culled on arrival.
 * Rescaled to the restored world (sw4-1): ~8000, comfortably above the 2048 near
 * bound and well inside the 31744 spawn depth. Tuning latitude (spec §A). */
export const TIE_EXIT_RANGE = 8000

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

/** Nominal skim height above the surface (the y=0 floor) at phase start.
 *
 * RECOVERED FROM THE ROM (sw5-5), no longer a hand-picked number. WSOBJ.MAC
 * recentres every ground object's height by GD$MDT (0xF00 = 3840), whose comment
 * is "OFFSET HITE TO MID OF PLAYERS HITE" — the offset exists precisely so that a
 * ground object's model z = 0 sits at the height the player flies at. So GD$MDT IS
 * the skim altitude, expressed in raw ROM units; at the shell's 1/30 presentation
 * scale (render.ts GROUND_MODEL_SCALE) that is 3840/30 = 128. Pinned against the
 * shell in tests/shell/render.ground-object-placement.test.ts. */
export const SKIM_ALTITUDE = 128
/** Below this clearance the ship scrapes the surface — a terrain crash. */
export const MIN_SKIM_ALTITUDE = 40
/** Points awarded for destroying a laser turret. */
export const TURRET_SCORE = 200
/** Legacy surface cadence constant — since sw4-3 the surface lays the wave's
 * fixed WSGRND maze instead of spawning on a timer, so `stepSurface` no longer
 * decrements a turret spawn timer. Retained as the surface `spawnTimer` seed and
 * as a convenient step-size unit in the surface suites. */
export const TURRET_SPAWN_INTERVAL = 1.5
/** Hit sphere around a turret — the radius the player's BEAM must pass within to hit it
 *  (sw7-17: the gun is hitscan). */
export const TURRET_HIT_RADIUS = 200
/** Elevation of a tower's gun — the white cap crowning the column (sw3-11,
 * ex the sw2-3 yellow cube). Fireballs launch from world y = TOWER_HEIGHT, not
 * from the y=0 floor. This IS the drawn composite peak (SURFACE_TOWER column +
 * TOWER_CAP top ring), so the shot erupts WYSIWYG from the cap — pinned against
 * the PLACED cap in tests/shell/render.ground-object-placement.test.ts.
 *
 * CORRECTED by sw5-5 from 232. The cannon top is WSOBJ.MAC `.PGND -4,0,58`, and
 * that 58 is HEX (the file is `.RADIX 16`): 0x58 = 88 .S units, which at the
 * shell's 1/30 presentation scale is y = 352. sw3-11 read the column in decimal,
 * so the shipped tower was short — and its true aspect is 5.5:1, not the 3.6:1
 * that misreading implied. The ship now skims at the ROM's own fraction of tower
 * height (SKIM_ALTITUDE / TOWER_HEIGHT = 3840 / (0x58 × 120) ≈ 0.36), not the
 * ~mid-tower the old pairing appeared to give: the towers LOOM.
 *
 * NOTE the tower now out-reaches TURRET_HIT_RADIUS (200): the hit sphere no longer
 * covers the cannon section it draws above y=328. The collidable VOLUME is
 * unchanged — the tower simply grew around it. Growing the radius to match is a
 * play-balance call, not a fidelity one, and is deliberately not made here. */
export const TOWER_HEIGHT = 352
/** Grace window (seconds) a freshly-risen tower holds fire before its first shot
 * (Story sw2-3). Turns round-1 firing into a readable reaction beat instead of a
 * tower that fires the instant it appears. Kept well under the ~2s a tower dwells
 * on screen (SPAWN_DISTANCE / TURRET_SCROLL_SPEED) so it still fires in time. */
export const TOWER_FIRE_GRACE = 0.75
/** Elevation of a bunker's gun (sw7-5 / D-016). The ROM's bunker is the squat
 * base of the shared GND table — its whole body spans 0..6 height units (0..720
 * raw; 0..24 at the 1/30 scale), and GDHTBK centers the bunker's blast at
 * 3×120 = mid-body (WSGRND.MAC:1166). The fireball erupts from that low body,
 * never from empty air at TOWER_HEIGHT. */
export const BUNKER_MUZZLE_HEIGHT = 12
/** Ceiling below which the ship crashes into a STANDING bunker (sw7-5 / D-020).
 * ROM: the crash needs the ship below the bunker top (`M$TZ+M.U1 - 6*120.*2
 * IFLT`, WSGRND.MAC:940-942) — a 720-raw-unit top over a 512-raw-unit floor
 * (GD$MNT), so low flight risks bunkers and cruise clears them. The clone's
 * raised floor (MIN_SKIM_ALTITUDE 40, house rule D-021) sits above the
 * raw-scaled top (24), so the band is re-based proportionally:
 * 40 × 720/512 ≈ 56 (see the sw7-5 reachability-ruling deviation). */
export const BUNKER_CRASH_CEILING = 56
/** The surface flight-band ceiling (sw7-5). ROM: `GD$MXT ==1C00` (7168 raw,
 * WSMAIN.MAC:2597-2598) = ~238 at the 1/30 scale — deliberately BELOW the
 * tower cap (TOWER_HEIGHT 352), so a tower can never be overflown and the
 * maze can fight back (D-020's tower crash carries no height gate). */
export const MAX_SKIM_ALTITUDE = 238
/** Lateral half-width of the ship↔object crash window (sw7-5 / D-020), in the
 * maze's raw lateral units. ROM contact reach is the 45° cone ∩ the X window
 * ($200..$400 + speed, WSGRND.MAC:901-946) ≈ $300..$1800 raw; $400 = 1024 sits
 * mid-band and safely inside the tightest authored lane offset (2048), so a
 * neighbouring lane can never clip the ship. */
export const OBJECT_CRASH_LATERAL = 1024

// Internal tuning (not part of the test contract).

/** How fast the yoke flies the ship up/down (altitude units/second). */
export const ALTITUDE_RATE = 200
/** Legacy flat surface scroll rate (units/second). RETIRED as the live surface
 * pace by sw7-18 / D-022 — the ground phase now scrolls at an ACCELERATING rate
 * (SURFACE_SEED_SPEED → SURFACE_MAX_SPEED). Kept only as a step-size unit some
 * surface fixtures still reference. */
export const TURRET_SCROLL_SPEED = 600

// --- Wave 2 surface pacing & traversal (sw7-18 / R11c) ----------------------
//
// The ROM flies the ground phase at an ACCELERATING player speed and ends it by
// TRAVERSAL alone. PHIGD seeds `M$VX+M.S1 = $100` (256 u/game-frame,
// WSMAIN.MAC:1621) and PHEGD ramps it `ADDD #1 / CMPD #400` (+1 u/frame per frame,
// capped at $400 = 1024, WSMAIN.MAC:1660-1665). Every sw7 speed is frame-true —
// the immediate × the game-frame rate — exactly like TRENCH_SCROLL_SPEED.

/** Surface scroll SEED rate: the ROM's `$100` (256 u/frame) over the timebase ≈
 * 5,250 u/s (WSMAIN.MAC:1621 `LDD #100 ;INITIAL PLAYER SPEED`). */
export const SURFACE_SEED_SPEED = 0x100 * TICK_HZ
/** Surface scroll CAP: the ROM's `$400` (1024 u/frame) over the timebase ≈ 21,000
 * u/s (WSMAIN.MAC:1662 `CMPD #400`). Never exceeded. */
export const SURFACE_MAX_SPEED = 0x400 * TICK_HZ
/** Surface scroll ACCELERATION: the ROM adds 1 u/frame to the per-frame speed
 * every frame. In continuous terms that is TICK_HZ (frames/s) × TICK_HZ (the
 * per-frame delta becoming u/s) = TICK_HZ² ≈ 420.6 u/s² (WSMAIN.MAC:1661 `ADDD #1`). */
export const SURFACE_ACCEL = TICK_HZ * TICK_HZ
/** One forward "sequence" of ground travel: the ROM's `$8000` M$TX wrap
 * (S1MVGD, WSMAIN.MAC:2537-2545 — `INC GD.SEQ` on each signed overflow). */
export const SURFACE_SEQ_SPAN = 0x8000
/** The surface phase ends once the traversal has completed this many `$8000`
 * passes: `LDA GD.SEQ / CMPA #5 ;ONLY GO SO FAR INTO GROUND SEQUENCES`
 * (WSMAIN.MAC:1678-1679). Five passes ≈ 371 frames ≈ 18.1 s. */
export const SURFACE_END_SEQ = 5
/** The accelerating rate at which the PMREB "FINISH GROUND WITH REBEL" tune fires
 * (sw7-18 audio rider). The ROM plays it at `PH.TIM == 14` pseudo-seconds
 * (WSMAIN.MAC:1673) — PH.TIM ticks once per 16 frames, so that is game-frame 224,
 * where the per-frame speed has ramped from `$100` to `$100 + 224 = $1E0` (480).
 * As a u/s rate that is `$1E0 × TICK_HZ` ≈ 9,844 u/s — reached ≈ 10.9 s into the
 * traversal, still below the cap. The tune fires the frame the pace first crosses it. */
export const SURFACE_FINISH_GROUND_SPEED = 0x1e0 * TICK_HZ

// --- Wave 2 ground-debris explosion (sw7-14 / X-005) ------------------------
//
// The ROM's tower/bunker destruction (BGTWXP :317 / BGBKXP :305, WSXPLD.MAC,
// `.RADIX 16`): three explosion pieces, each launched UPWARD and pulled back by
// gravity, freezing at the floor, living 0x20 game-frames. Every ROM per-frame
// figure ports through the sw7-1 timebase exactly like the surface-scroll rates
// above: a per-frame VELOCITY × TICK_HZ, a per-frame² ACCELERATION × TICK_HZ², a
// life in frames ÷ TICK_HZ.

/** Debris lifetime: `LDA #20 / STA XP$TMR` (WSXPLD.MAC:330) — hex 0x20 = 32 game
 *  frames, 32 / 20.508 ≈ 1.560 s. Frame-true, like TIE_WING_LIFE_SECONDS. */
export const GROUND_DEBRIS_LIFE_SECONDS = 0x20 / TICK_HZ
/** Gravity on the vertical velocity: `SUBD #50.*4 ;FORCE OF GRAVITY` (WSXPLD.MAC:559)
 *  — `50.` is DECIMAL (trailing period), so 50 × 4 = 200 u/frame² subtracted once per
 *  game frame. As a continuous rate that is 200 × TICK_HZ² ≈ 84,113 u/s². */
export const GROUND_DEBRIS_GRAVITY = 200 * TICK_HZ * TICK_HZ
/** Upward launch speed (units/second). The ROM loads TMPVZ (the type-3 low byte,
 *  `#…+2` tower / `#…+3` bunker) and `JSR LSLD2 ;*4` → a per-frame vertical velocity
 *  of 4 × 0x200 = 0x800 = 2048 (tower) or 4 × 0x300 = 0x0C00 = 3072 (bunker), i.e. the
 *  "728. TO 1024. ×4" band the comment cites. Ported × TICK_HZ. The ROM also varies it
 *  by the P.RND1 low byte; we launch at the fixed base (the spread is a logged, unpinned
 *  fidelity nicety), so the burst stays deterministic from the seed. */
export const GROUND_DEBRIS_LAUNCH_TOWER = 0x800 * TICK_HZ
export const GROUND_DEBRIS_LAUNCH_BUNKER = 0xc00 * TICK_HZ
/** Lateral fan (units/second) that splits the three pieces left / centre / right —
 *  the ROM's `ADDA #-3F ;GO LEFT` / `ADDA #3F ;GO RIGHT` offsets on XP$MY (its lateral
 *  axis is Y; ours is X). A modest fraction of the launch so they arc apart, not up a line. */
export const GROUND_DEBRIS_SPREAD = 0x180 * TICK_HZ

// --- Wave 3 trench constants ------------------------------------------------
//
// Authentic-FEEL, single-sourced here exactly as the Wave 1/2 constants are:
// StarWars.asm carries no symbolic trench tables, so these are chosen to play
// right and named for easy correction once deeper reverse-engineering recovers
// the real numbers. The trench run has ONE target — the exhaust port — that
// scrolls up the channel toward the cockpit; the player destroys it for the
// bonus or it reaches the cockpit and costs a shield.

/**
 * Distance ahead (−Z) at which the exhaust port becomes an interactive target when
 * the trench opens — finding B-009. No longer the fabricated 2400 stub (which gave
 * the trench no channel body at all).
 *
 * The port's true location is the ROM's BS.PLC, DERIVED from the wedge chain
 * (`trenchPortDistance`) — the sum of the $800/$1000 wedge lengths before the PORT
 * wedge (0x50000 = 327,680 on the balanced pies), with the END wall $1000 beyond.
 * That full length is the pure model (tests/core/trench-length.test.ts). But the
 * ROM only lets the beam reach `#7000 = TRENCH_FAR = 28,672` units forward
 * (WSLAZR.MAC CLBLZ, "FARTHEST FORWARD POINT"), and our channel renders only that
 * far. Our sim carries ONE port object that must exist to scroll, so we seat it at
 * its BS.PLC CLAMPED into that forward window — the farthest it can be and still be
 * under the beam. The ~19 s of empty channel the pilot flies before the port comes
 * into range is the trench length buildTrench models; streaming the wedges in
 * one-by-one is R6b/R6c, out of this story's scope. `sim.ts spawnPort` recomputes
 * this per wave from the chain so it stays data-driven. */
export const EXHAUST_PORT_DISTANCE = Math.min(TRENCH_PORT_OFFSET, TRENCH_FAR)
/** Points for destroying the exhaust port — the run's big payoff. ROM
 *  `byte_985F` = 25,000 (sw3-1, from the sw2-6 audit; the load-bearing
 *  cross-note settles this at 25,000, "do NOT ×10"). Was a 1,000-point
 *  authentic-feel guess. The clean-run "Use the Force" bonus (FORCE_BONUS,
 *  5,000) still lands on top of this. */
export const TRENCH_BONUS = 25000
/**
 * How fast the whole trench scrolls toward the cockpit (units/second) — finding
 * B-008. The ROM sets the forward speed once at trench entry (PHIBS `LDD #300
 * ;INITIAL PLAYER SPEED`, WSMAIN.MAC:1834 → $300 = 768) and integrates it ONCE PER
 * GAME-FRAME by the single caller S1MVBS (`ADDD M$TX+M.S1`, WSMAIN.MAC:2654). So
 * the per-second rate is that immediate times the game-frame rate — 768 × TICK_HZ
 * ≈ 15,750 u/s, 31.5× the old invented 500. Frame-true like every other sw7 speed
 * constant (ENEMY_SHOT_TTL, DARTH_GLOW_SECONDS …): derived from the timebase, not
 * a re-tuned magic number. length ÷ speed is ONE traversal system, so this single
 * rate scrolls the whole channel — ribs, port, and end wall alike. (Playable only
 * because sw7-17 made the gun hitscan; the old 12,000 u/s projectile bolt was
 * out-run at this speed.) */
export const TRENCH_SCROLL_SPEED = 0x300 * TICK_HZ
/** Hit sphere around the exhaust port for player bolts. WYSIWYG (sw3-15): you may
 *  only HIT what you can SEE — a rule this constant keeps, re-pointed by sw5-4 at
 *  the geometry that is actually there.
 *
 *  It used to be 70, the reach of an AUTHORED octagon. models.ts now carries the
 *  real ROM object (`.WP PORT`), and `.WGD PORT`'s red ";PORTHOLE" pen says which
 *  part of it is the hole: the INNER SQUARE at ±96. The berm (160) and outer base
 *  (256) are the raised lip and the Death Star surface around the shaft — a proton
 *  torpedo into the armour plating must not blow up the Death Star, so the sphere
 *  is tuned to the porthole and NOT to the 3.6x-wider plate.
 *
 *  The hole is a SQUARE and this test is a SPHERE, so no single radius is exact.
 *  108 is the EQUAL-AREA disc of the ±96 square (96 * 2/sqrt(pi) = 108.3): it
 *  neither systematically forgives nor systematically punishes. The alternatives
 *  are both worse — the square's corner reach (136) would score shots sitting
 *  visibly OUTSIDE the hole, in the gap before the berm (the very forgiveness
 *  sw3-15 removed), while its half-width (96) would refuse in-hole corner shots.
 *
 *  GAMEPLAY IMPACT (sw5-4 AC-4, called out rather than slipped in): the finish
 *  gets EASIER — the sphere grows 70 -> 108, about 1.5x the radius and 2.4x the
 *  disc area. That is deliberate. The old sphere was tuned to a fabricated shape
 *  ~30% smaller than the real porthole, so part of the "unmissable finish" sw3-15
 *  was fighting was this fidelity bug wearing a disguise. It is still a target:
 *  a shot out on the berm or the base misses, as it always did. */
export const PORT_HIT_RADIUS = 108
/** Near-cockpit approach window (world units, −Z) inside which a player bolt can
 *  resolve the exhaust-port hit. Outside it — a shot fired far up the trench that
 *  merely crosses the port mid-channel — cannot detonate it; the port must have
 *  scrolled to within this band of the cockpit (z=0). This restores the ROM's
 *  narrow end-wall decision window (WSMAIN.MAC:1896-1917 `SUBD #0800`, one short
 *  trench-wedge spacing; findings ## Exhaust port & run outcome, the $800 window)
 *  so the finish demands timing, not just aim (sw3-15). Named authentic-FEEL like
 *  the other Wave 3 constants — no ROM↔world-unit scale is recovered. */
export const PORT_APPROACH_WINDOW = 800
/**
 * How close a LASER must come to the porthole to ARM the proton torpedo (story sw5-6).
 *
 * This is the cabinet's own "close enuf", and it is a real ROM number, not a feel constant.
 * `WSLAZR.MAC` tests the laser's aim against a BOX around the porthole and, if it lands
 * inside, hands the shot to the machine:
 *
 *     LDA BS.PFL / IFNE            ;?EXHAUST PORT ON?
 *     LDA PT.LZF / IFEQ            ;?PROTON TORP STILL PRIMED?
 *     LDD TMPTY / ADDD #200 / IFGE ;?WITHIN LEFT EDGE?
 *                 SUBD #400 / IFLE ;?WITHIN RIGHT EDGE?
 *     LDD TMPTX / SUBD BS.PLC      ;GET DELTA FROM PORTHOLE LOC
 *                 ADDD #200 / IFGE ;?ABOVE BOTTOM EDGE?
 *                 SUBD #400 / IFLE ;?BELOW TOP EDGE?
 *     LDA #1 / STA PT.LZF          ;SET LAZAR FIRE FLAG
 *
 * `+$200 >= 0 && −$200 <= 0` is a ±$200 range test, so the box is ±512 about the hole.
 * Once armed, `WSLAZR` launches the torpedo (`JSR FRPTGN ;THEN LAUNCH DIRECT HIT PROTON
 * TORPS`) and `WSGUNS.MAC MVPTGN` funnels it in — its height above the floor clamped to the
 * forward distance D, its lateral offset to D/16, stopping dead above the porthole. As D → 0
 * both clamps drive to zero: it cannot miss.
 *
 * So the PRECISION LIVES IN THE ARMING, not the terminal — which is the whole reason the
 * cabinet's pilot never has to make the 43.8°-down shot into his own floor that our 60° FOV
 * forbids. He only has to get close; the machine flies it home.
 *
 * ⚠ WE DO **NOT** TRANSPLANT THE ±$200, and the reason matters. The ROM's box is measured
 * against `TMPTX` — the endpoint of a laser drawn a fixed `$7000` (28,672 units) ahead of the
 * ship — so it encodes the cabinet's engagement STANDOFF, not a tolerance around the hole. Our
 * whole trench is 2,400 units long; there is no $7000 standoff here to measure against, and
 * dropping 512 in as a proximity radius would let a shot out on the SUPPORT BERM (±160) or the
 * OUTER BASE (±256) win the run — which sw5-4 pinned as a MISS, from this same source. Two ROM
 * numbers from the same machine, and the one that survives our scale is the porthole.
 *
 * So the ARMING RADIUS IS THE PORTHOLE: `PORT_HIT_RADIUS` (108, tuned by sw5-4 to the ROM's ±96
 * hole). What sw5-6 takes from `WSLAZR`/`MVPTGN` is the STRUCTURE, which is the load-bearing
 * part — **arm early, resolve late** — not a constant that does not survive the crossing. Logged
 * as a deviation.
 */
/** The "USE THE FORCE" clean-run bonus, WAVE-SCALED (sw7-4 / S-012). ROM table
 *  `TSCFRC` (WSGAS.MAC:509-513), five entries of packed BCD read as decimal
 *  digit-pairs: `00,50,00`→5,000 / `01,00,00`→10,000 / `02,50,00`→25,000 /
 *  `05,00,00`→50,000 / `10,00,00`→100,000 (";LEVEL 5 AND ABOVE"). Indexed 0-based
 *  by `GM.WAV` (= our `wave - 1`) and CLAMPED to the last entry for wave >= 5
 *  (`GETFRP` `IFHS`, WSGAS.MAC:404-416 — ";HIGHER LEVELS USE MAX SCORE"). */
export const FORCE_BONUS_BY_WAVE: readonly number[] = [5000, 10000, 25000, 50000, 100000]

/** The clean-run Force bonus for a (1-based) wave — `TSCFRC` clamped: waves past
 *  the table's last row all award the max (100,000). `state.wave` climbs without a
 *  cap (clearRun), so the clamp is load-bearing, not defensive. */
export function forceBonusForWave(wave: number): number {
  const i = Math.max(0, Math.min(wave - 1, FORCE_BONUS_BY_WAVE.length - 1))
  return FORCE_BONUS_BY_WAVE[i]
}

/** Points per SURVIVING shield unit, banked once at the end of a won run
 *  (sw7-4 / S-013). ROM `TSCSHL` (WSGAS.MAC:519) `.BYTE 00,50,00` = 5,000 (BCD),
 *  added once per remaining shield by `SCRSHLD` (WSGAS.MAC:375-391). Awarded on ANY
 *  win — NOT clean-gated, unlike the Force bonus. */
export const SHIELD_BONUS_PER_UNIT = 5000

/** Post-hit shield-loss window (sw7-4 / S-016): at most ONE shield is lost per
 *  gauge-redraw cycle — a hit that lands while the gauge is still animating the
 *  previous loss is dropped, not stacked (ROM GS.GLW/GS.HIT debounce,
 *  WSGLOW.MAC:58-64 `BG1GLW` / WSGAS.MAC:63-82 `DO1GAS`). The ROM cycle length is
 *  data-dependent (GS.VTP/VUP/VBS off the shield count, ~200 ms–1 s+ at the 20 Hz
 *  game frame), so this duration is an authentic-FEEL tunable, not a ROM constant. */
export const POST_HIT_SHIELD_WINDOW = 0.5
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

/**
 * Towers to destroy to clear the surface phase of the given (1-based) wave —
 * the count of TOWER+BISHOP entries in that wave's authored WSGRND maze
 * (`mazeForWave(wave).towerCount`, the ROM `.TWRS`/TTWRS value; bunkers are
 * quota-neutral).
 *
 * sw4-3 RECONCILE (user-ratified): this SUPERSEDES sw3-3's disasm `byte_98CB`
 * stream quota (22,22,32,…,50). The surface is a finite single-pass maze — the
 * original Atari source (`WSGRND.MAC` `IGRND` seeds "# OF TOWERS LEFT" straight
 * from `.TWRS`) outranks the disasm per CLAUDE.md, and a maze of N towers can
 * only be cleared by killing its N towers (a larger target would soft-lock).
 */
export function towersForWave(wave: number): number {
  return mazeForWave(wave).towerCount
}

/** Score for clearing every tower in the surface phase — the ROM `byte_9862`
 * "cleared all towers" value (BCD 05,00,00 = 50,000; on-screen banner
 * "50,000 FOR SHOOTING ALL TOWERS", ROM:E039). Banked ONCE, when the last tower
 * falls and the run drops into the trench (ROM `sub_973A`). (sw3-3) */
export const SURFACE_CLEAR_BONUS = 50000

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
  /** The flashing bonus/extra-life HUD counter under the score — the ROM
   *  `byte_4B2C` analog (sw3-6). A normalized [0,1] flash intensity: re-armed to
   *  BONUS_FLASH_MAX on any score change, decayed by BONUS_FLASH_DECAY each tick
   *  toward 0. The shell draws the amber row beneath the score only while this is
   *  > 0 (render.ts); when it reaches 0 the row is absent. Owned by the core tick
   *  (`finalizeScore` in sim.ts); the shell only reads it. */
  bonusFlash: number
  /** Player height above the y=0 surface (Wave 2 terrain skim). */
  altitude: number
  /** How far the Death Star surface ground grid has scrolled toward the cockpit
   * (Wave 2, story 11-5). Advanced by the ACCELERATING `surfaceScrollSpeed`·dt
   * (sw7-18 / D-022) — the SAME flow that scrolls the turrets — so the grid and
   * turrets rush past together; read `mod GRID_Z` by the surfaceGrid generator and
   * reset to 0 on every phase entry. Also drives `gdSeq` (= floor / SURFACE_SEQ_SPAN). */
  surfaceScrollZ: number
  /** The live ACCELERATING surface scroll rate (units/second), sw7-18 / D-022.
   * Seeded to SURFACE_SEED_SPEED on surface entry, ramped by SURFACE_ACCEL·dt each
   * surface frame, clamped to SURFACE_MAX_SPEED. The surface scroll (both
   * `surfaceScrollZ` and the ground field) rides THIS, not the retired flat 600. */
  surfaceScrollSpeed: number
  /** The ROM's GD.SEQ — how many full `$8000` forward passes the ground traversal
   * has completed (sw7-18 / D-019). `= floor(surfaceScrollZ / SURFACE_SEQ_SPAN)`;
   * 0 on surface entry. The phase ends at `gdSeq >= SURFACE_END_SEQ`, and a ground
   * object wakes once `gdSeq >= (turret.seq ?? 0)`. */
  gdSeq: number
  /** Whether this surface run's authored WSGRND maze field has been laid into
   * `turrets` yet (sw4-3). `enterPhase` resets it to false per wave; the first
   * `stepSurface` frame lays `mazeForWave(wave)` into `turrets` — but ONLY if no
   * turrets were hand-placed, so pre-placed fixtures and saves are respected. */
  surfaceMazeLaid: boolean
  /** How far the walled trench channel has scrolled toward the cockpit (Wave 3,
   * story 11-6). Advanced by TRENCH_SCROLL_SPEED — the SAME rate that scrolls the
   * exhaust port up the channel — so the corridor and the port rush past together;
   * read `mod RIB_Z` by the trenchChannel generator and reset to 0 on every phase
   * entry. */
  trenchScrollZ: number
  /** The pilotable trench viewpoint (story sw3-2, re-framed by sw5-6) — the SHIP: the pilot's
   * eye, the muzzle his bolts leave from, and the point the catwalk is tested against.
   *
   * `[0]` is lateral, clamped to ±TRENCH_VIEW_HALF_W (the ROM's ±$1FF). `[1]` is the eye's
   * HEIGHT ABOVE THE y=0 TRENCH FLOOR, clamped to [TRENCH_EYE_MIN, TRENCH_EYE_MAX] (512..3840,
   * the ROM's band) and seated at TRENCH_EYE_SEAT on every phase entry — the height WSMAIN.MAC's
   * `SMVG1B` drops the pilot to as he enters ("JUST ABOVE BOTTOM OF TRENCH"). `[2]` is unused
   * (always 0).
   *
   * Before sw5-6 this was a NEGATIVE dive-only offset added to a shell constant, which summed to
   * a camera 3268 units UNDER the floor; and the gun did not move with it, so what you aimed at
   * was not what you hit. Both are fixed: this IS the ship. */
  trenchView: Vec3
  /** The proton torpedo is armed and running (story sw5-6) — the ROM's `PT.LIV`.
   *
   * The player fires ordinary aimed LASERS, which is what kills turrets and squares. When one
   * lands within PORT_ARM_RADIUS of the porthole, `WSLAZR.MAC` hands the shot to the machine
   * (`JSR FRPTGN ;THEN LAUNCH DIRECT HIT PROTON TORPS`) and this latches. `WSGUNS.MAC MVPTGN`
   * then funnels the torpedo into the hole, and `WSMAIN.MAC` reads the flag at the end-wall
   * window to decide HIT or MISS. So the shot is EARNED early, at a range the yoke can actually
   * reach, and RESOLVES late, inside the ROM's $800 end-wall gate. Reset on every phase entry.
   *
   * (Phrasing note: the pure-core purity guard scans this file as TEXT for a DOM global followed
   * by a dot, so that word cannot end a sentence here — even inside a comment.) */
  portTorpedoArmed: boolean
  /** Enemies destroyed in the CURRENT phase; clears the phase at its quota,
   * then resets to 0 on the transition into the next phase. */
  phaseKills: number
  /** Player bolts currently in flight.
   *
   * NOT the player's laser (sw7-17 / R11b): the laser is a HITSCAN beam and spawns nothing that
   * travels — see `laserEdge`. What still lives here is the PROTON TORPEDO, which the ROM really
   * does fly as an object (FRPTGN/MVPTGN; audit G-006 keeps our simplified model), plus anything
   * a fixture hands us. Nothing in play adds to this list any more. */
  projectiles: Projectile[]
  /** Seconds remaining in the laser's sweep — the ROM's LZ.EDG (sw7-17 / R11b, G-012).
   *
   * A trigger pull loads LASER_SWEEP_SECONDS and every step burns dt off it. 0 = the sweep is
   * spent. This is the COUNTER (the ROM's LZ.EDG byte), not the gate — do not read it to ask
   * "is the laser on": it is stored POST-decrement, so on the last live frame of a sweep it has
   * already clamped to 0 while the beam is still shooting. Ask `laserOn`. */
  laserEdge: number
  /** Whether the laser was ON during the step that produced this state — the ROM's LZ.ON.
   *
   * The cabinet keeps this as its own byte rather than deriving it (`LDA LZ.EDG / IFGT /
   * DEC LZ.EDG / STA LZ.ON` stores the PRE-decrement value, WSLAZR.MAC:110-113), and every
   * consumer reads THIS: CLSLZ/CLGLZ/CLBLZ each open `LDA LZ.ON / IFNE ;?ARE LAZARS ON?`, and
   * VWLAZ draws the beam off the same byte. So the beam that is drawn and the beam that kills are
   * one fact, not two that must be kept in step. The shell gates its beam on this. */
  laserOn: boolean
  /** Live TIE fighters. */
  enemies: Enemy[]
  /** TIEs destroyed this frame or recently, playing their exploded-fragment death
   * cue (story sw3-8). Each ages by dt and is dropped past TIE_DEATH_SECONDS. */
  dyingTies: DyingTie[]
  /** Blown-apart tower/bunker pieces mid-flight (Wave 2, story sw7-14 / X-005). Each
   * carries a real 3D velocity the sim integrates (launch, gravity, floor-freeze) and
   * is dropped past GROUND_DEBRIS_LIFE_SECONDS; wiped on phase entry like dyingTies. */
  groundDebris: GroundDebris[]
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
  /** The trench voice-line timer (Wave 3, story sw3-4) — the ROM's `word_4B0E`.
   * A game-frame accumulator that advances by dt·TICK_HZ each trench step (sw7-1
   * made it frame-true at 20.508 Hz) and resets to 0 on every phase entry; the
   * iconic voice lines fire when it CROSSES their ROM thresholds (16/22/24), gated
   * by 0-based BS.WAV parity (sw7-2; see TRENCH_VOICE_CUES in sim.ts). The thresholds
   * fire at their authentic 0.78–1.17 s wall-clock times regardless of tick rate
   * (docs/star-wars-1983-source-findings.md, trench voice timer). */
  trenchTimer: number
  /** Sim time (`t`) the FORCE_BONUS was last awarded, or `null` if it hasn't
   * been this run. Stamped by a clean port kill so the shell can show the
   * banner for a few seconds — including across the `clearRun` wave
   * transition, which re-stamps it after `enterPhase`'s reset (see `clearRun`
   * in sim.ts). Reset to `null` on every phase entry. */
  forceBonusAwardedAt: number | null
  /** Sim time (`t`) the exhaust port was destroyed, or `null` if not this run.
   * Stamped by ANY port kill (clean or not, unlike `forceBonusAwardedAt`) so the
   * shell can stage the Death-Star explosion for a beat — including across the
   * `clearRun` warp, which re-stamps it after `enterPhase`'s reset (sw2-4). The
   * `death-star-destroyed` GameEvent fires the same frame for the SFX pump; this
   * timestamp is what lets the VISUAL survive the immediate jump to space. Reset
   * to `null` on every phase entry. */
  deathStarDestroyedAt: number | null
  /** Sim time (`t`) the port slipped past the cockpit un-destroyed (a MISS), or
   * `null` if it hasn't this run. Stamped by the port-reaches-cockpit path so the
   * shell can show a "you missed" tell distinct from a generic crash (sw2-4);
   * pairs with the `exhaust-port-missed` GameEvent. Reset on every phase entry. */
  exhaustPortMissedAt: number | null
  /** Sim time (`t`) the per-surviving-shield bonus (sw7-4 / S-013) was banked at a
   * won run, or `null`. Stamped on ANY port kill; `clearRun` re-stamps it so the
   * "BONUS FOR REMAINING ENERGY" banner survives the warp into the next space wave.
   * Reset to `null` on every phase entry. */
  shieldBonusAwardedAt: number | null
  /** Sim time (`t`) the all-towers reward (sw7-4 / H-021) was banked, or `null`.
   * Stamped on the surface->trench drop when every tower was cleared, so the
   * "50,000 FOR SHOOTING ALL TOWERS" banner (MS.RWD) shows through the trench run.
   * Reset to `null` on every phase entry. */
  towerBonusAwardedAt: number | null
  /** Sim time (`t`) the last shield was lost, or `null` if none lost recently — the
   * post-hit gauge-redraw window (sw7-4 / S-016). While `t - shieldHitAt <
   * POST_HIT_SHIELD_WINDOW`, further hits cost no shield (ROM GS.GLW debounce).
   * Reset to `null` on every phase entry. */
  shieldHitAt: number | null
  /** Enemy fireballs currently in flight. */
  enemyShots: Projectile[]
  /** True once the last shield is lost — the wave is over. */
  gameOver: boolean
  /** The initials-entry buffer (SH2-13) — non-null only while the game-over
   * screen has an ARMED entry (the shell arms it via sim.beginNameEntry when
   * the run's score qualifies). Holds exactly what the player has typed. */
  entry: { initials: string } | null
  /** Last step's `input.start` — the rising-edge register (SH2-13, the
   * asteroids startPrev precedent): the entry confirm fires on a fresh press
   * only, so a start held across the entry-screen transition cannot commit. */
  startPrev: boolean
  /** Last step's `input.fire` — the trigger's rising-edge register (story sw7-17 / R11b,
   * audit G-012; the same `startPrev` pattern one field up).
   *
   * The cabinet's gun is EDGE-TRIGGERED SEMI-AUTO: one shot per trigger pull, no auto-repeat.
   * The laser runs off the fire-button edge latch VG.LON, set by the IRQ (WSINT.MAC:188-192) and
   * consumed once per game frame by TSTLAZ (`LDA VG.LON / IFNE / … / CLR VG.LON ;PREPARE IRQ FOR
   * NEXT MAINLINE`). Ours used to auto-fire ~4/s while the button was held — an invented cadence.
   *
   * This register is what makes the 8-frame sweep MEAN anything: LASER_SWEEP_SECONDS (0.39 s) is
   * longer than FIRE_INTERVAL (0.25 s), so under the old level-triggered auto-fire a held trigger
   * reloaded LZ.EDG before it could ever expire and the laser was simply always on. */
  firePrev: boolean
  /** Seconds until the trigger can fire again. */
  fireCooldown: number
  /** Seconds until the next TIE spawns into a free slot. */
  spawnTimer: number
  /** Count of TIEs spawned so far — a monotonic, deterministic index into the
   * authentic TBG lateral table (sim.ts SPAWN_LATERALS), advanced by one on every
   * TIE spawn (sw4-1, spec §A "per-slot in TBG order"). Pure state, NOT the RNG: the
   * spawn LATERAL walks the ROM STARTING-LOCATIONS table in order, so a run cycles
   * through the full {0, ±1024, ±2048} set deterministically. */
  spawnCount: number
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
    bonusFlash: 0,
    altitude: SKIM_ALTITUDE,
    surfaceScrollZ: 0,
    surfaceScrollSpeed: SURFACE_SEED_SPEED,
    gdSeq: 0,
    surfaceMazeLaid: false,
    trenchScrollZ: 0,
    // The eye rides at the ROM's trench entry height above the floor (sw5-6) — see
    // TRENCH_EYE_SEAT. A trench state built straight from initialState() (as the render
    // suites do) is therefore already seated inside the band, not sitting on the floor.
    trenchView: [0, TRENCH_EYE_SEAT, 0],
    phaseKills: 0,
    projectiles: [],
    laserEdge: 0,
    laserOn: false,
    enemies: [],
    dyingTies: [],
    groundDebris: [],
    turrets: [],
    exhaustPort: null,
    trenchObstacles: [],
    trenchShotsFired: 0,
    portTorpedoArmed: false,
    trenchTimer: 0,
    forceBonusAwardedAt: null,
    deathStarDestroyedAt: null,
    exhaustPortMissedAt: null,
    shieldBonusAwardedAt: null,
    towerBonusAwardedAt: null,
    shieldHitAt: null,
    enemyShots: [],
    gameOver: false,
    entry: null,
    startPrev: false,
    firePrev: false,
    fireCooldown: 0,
    spawnTimer: SPAWN_INTERVAL,
    spawnCount: 0,
    enemyFireCooldown: ENEMY_FIRE_INTERVAL,
    events: [],
  }
}
