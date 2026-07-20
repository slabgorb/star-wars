// src/core/trench-obstacles.ts
//
// Fidelity epic (task 3) — the trench's wall content as ENTITIES: shootable
// turrets and wall squares, and catwalk hazards spanning the channel. Stations
// re-expressed from the ROM's obstacle records (docs/star-wars-1983-source-
// findings.md ## Trench catwalks, turrets & wall squares — off_7CC0 →
// off_7B1E..7BFE); scores from ## Scoring tables (byte_9853 turrets,
// byte_9850 squares).

import { type TrenchObstacle } from './state'
import { TRENCH_HALF_W, TRENCH_WALL_H } from './trench-channel'
import { createRng, nextInt, type Rng } from '@arcade/shared/rng'
import { buildTrench, wedgeLength, PANEL_FORCEFIELD, type Wedge } from './trench-wedges'

// --- Scores: TRUED against ## Scoring tables --------------------------------
//
// loc_9810 "Add to score total" reads a 3-byte record (hi, mid, lo) as
// BCD(hi)×10,000 + BCD(mid)×100 + BCD(lo)×1 (confirmed by the on-screen
// "SCORING" text at ROM:DE07+ — see the doc's ⚠︎ cross-note-conflict resolution
// for TIE/exhaust-port/all-towers, which anchors this same digit-placement read).

/** Points for destroying a trench wall turret. `byte_9853` "Trench turrets" =
 *  raw record (0,1,0) → BCD(1)×100 = 100, confirmed by the on-screen
 *  `aTrenchTurrets10` "TRENCH TURRETS ... 100" text. */
export const TRENCH_TURRET_SCORE = 100

/** Points for destroying a trench wall square. `byte_9850` "Trench green
 *  squares" = raw record (0,0,$50) → BCD($50)×1 = 50. The findings table has no
 *  confirming on-screen text line for this record (annotated "no line; catwalk
 *  hit value" — the doc's own naming hedge between "green square" and
 *  "catwalk"); the symbol name and the shootable/scored semantics below follow
 *  the flight-instructions text, which is unambiguous that only a CATWALK
 *  *strike* costs a shield (see OBSTACLE_HIT_RADIUS and Open follow-ups #3). */
export const TRENCH_SQUARE_SCORE = 50

/** Bolt-vs-obstacle proximity, world units. No ROM value was found for THIS
 *  test: the doc's one nearby hit-box tolerance (`MReg3E ± $200 vs MReg22`,
 *  sub_B3E9's row 2) is a DIFFERENT check — the ship's firing-cone box, not a
 *  player bolt striking a turret/square — so it isn't a sound anchor to true
 *  this against. Originally tuned near PORT_HIT_RADIUS (then 70, so 90 was a
 *  deliberate ~1.29x). sw5-4 re-seated PORT_HIT_RADIUS to the ROM porthole
 *  (108), which flips that ratio to ~0.83x — PORT_HIT_RADIUS moved for
 *  unrelated reasons (the real port geometry), not because 90 was re-tuned
 *  against it, so read this as historical provenance, not a live tuning
 *  relationship the two values still track. Stays provisional pending a
 *  dedicated hit-test decode (findings ## Trench catwalks, turrets & wall
 *  squares; Open follow-ups #3). */
export const OBSTACLE_HIT_RADIUS = 90 // PROVISIONAL(findings ## Trench catwalks, turrets & wall squares)

const W = TRENCH_HALF_W

// --- Furniture heights, re-anchored to the pinned trench (story sw5-6) ------
//
// These were absolute constants (60 / 120 / 200) hand-tuned against the old 320-tall wall.
// Against the ROM's 4096-deep trench they all collapse into the bottom 5% — the "overhead"
// catwalk ends up lying on the floor. None of them carries a ROM pin (the cabinet's wall
// detail is a PRNG-picked shape script, not a grid), so they are re-anchored rather than
// re-pinned: no invented numbers are dressed up as ROM data.
//
// WALL furniture scales with the WALL — turret and square keep exactly the proportions of
// its height that they had (3/16 and 3/8, i.e. the old 60/320 and 120/320). Note the pilot
// is clamped to ±511 inside ±1024 walls, so he can never reach them: these are things he
// SHOOTS, not things he crashes into.
//
// The CATWALK is now a wall FORCE FIELD (TD$WFF, B-012): it mounts on ONE wall and is
// SIDE-GATED — it grazes only a pilot on the wall it hangs from, within a vertical band
// about its height. A hands-off pilot rides centred (trenchView[0] = 0), which the ROM's
// `IFLE ;?ON LEFT SIDE?` counts as the left side, so seating the field on the LEFT wall
// still makes a neutral run graze it — hazard preserved. The dodge is LATERAL: steer to the
// opposite (right) wall and it can't touch you (or climb clear of its height band). The
// graze costs NO shield (WSPANL glow+sound+roll; the shield accounting rides WSGLOW,
// score-shields scope). tests/core/trench-viewpoint.test.ts asserts these behaviourally.
// (The dense authentic panel grid — ~80 fields streamed over the full channel — is R6d /
// sw7-22, which un-clamps the port stub; here the trench carries the one head-of-pie divider
// catwalk, wall-mounted.) Its height need only sit within a hands-off pilot's hit band.

/** Wall-mounted turret — 3/16 of the wall's height, as it was on the 320 wall. This lands it at
 *  exactly TRENCH_EYE_SEAT, so the seated pilot looks a turret dead in the eye: aim (0, 0). */
const TURRET_Y = (TRENCH_WALL_H * 3) / 16 // 768
/** Wall square — above the turret, but it must stay INSIDE THE PILOT'S AIM CONE from its own
 *  station, or it is scenery he can see and never shoot.
 *
 *  The cone is the FOV: at range D the crosshair reaches ±D/f about the eye, with f = 1/tan(30°).
 *  The nearest square station is 1300 downrange, so it reaches 1300/1.732 = 750 above the seat —
 *  i.e. anything above ~1518 is UNAIMABLE the moment it appears. The old 3/8 (=1536) sat just past
 *  that line and the square could never be shot. 5/16 keeps the square high on the wall with real
 *  margin, and every station stays reachable (pinned in tests/core/trench-aim-wysiwyg.test.ts).
 *
 *  This is what "re-anchor the furniture" (AC-5) actually means: not just scaling it with the wall,
 *  but keeping it a TARGET. */
const SQUARE_Y = (TRENCH_WALL_H * 5) / 16 // 1280
/**
 * Downrange stations, cockpit → far. PROVISIONAL layout: the ROM's off_7CC0 →
 * off_7B1E..7BFE records (findings ## Trench catwalks, turrets & wall squares)
 * are confirmed to be (type-byte, dx, dy) shape-script triples — type 1 =
 * catwalk cross-brace, type 2 = turret housing — but the extraction notes flag
 * it uncertain whether an off_7Bxx row encodes per-section PLACEMENT or only
 * silhouette geometry, and there is no ROM↔world-unit conversion to turn either
 * reading into station coordinates (the same gap that keeps TRENCH_HALF_W/
 * TRENCH_WALL_H provisional — see Open follow-ups #2/#3). What IS confirmed and
 * IS reflected here: turret spawn/aim (`sub_B3E9`) runs three ROM rows — left
 * wall only (param $B), right wall only (param $E), then both walls together
 * (param $C) — so this table places its four turret stations as one left-only,
 * one right-only, then a same-station left+right pair, rather than an arbitrary
 * alternation. Exact Z spacing and the square/catwalk placements remain
 * hand-authored pending a full geometry-decode pass.
 */
// The stations move OUT with the walls (story sw5-6). They were spaced for a ±256 trench; the
// pinned trench is ±1024, and a wall object 900 units downrange on a ±1024 wall subtends 48.7°
// off-axis — outside the frustum entirely. It is not a hard shot, it is OFF SCREEN.
//
// The aim cone is the FOV: the crosshair reaches |x|/D ≤ tan(FOV_Y/2)·aspect. At the narrowest
// aspect we support (1:1) that is 0.577, so a wall object is only aimable beyond
// TRENCH_HALF_W / 0.577 ≈ 1774. Seating the nearest station at 2·TRENCH_HALF_W puts every wall
// object at ≤ 26.6° — comfortably inside the cone at ANY aspect ≥ 1, which also closes the
// aspect-dependent reachability hole the reviewer flagged. Spacing is unchanged.
//
// Still PROVISIONAL (the ROM's off_7CC0 records give no station coordinates) — re-anchored, not
// pinned. tests/core/trench-aim-wysiwyg.test.ts holds them to the only contract that matters: the
// pilot can point at every one of them.
const NEAR = 2 * TRENCH_HALF_W // 2048 — the closest a wall object may stand and still be aimable
const GAP = 400

export const TRENCH_OBSTACLE_STATIONS: readonly TrenchObstacle[] = [
  { kind: 'turret', pos: [-W, TURRET_Y, -NEAR] }, // ROM row 1 ($B) — left wall only
  { kind: 'square', pos: [W, SQUARE_Y, -(NEAR + GAP)] },
  { kind: 'turret', pos: [W, TURRET_Y, -(NEAR + 2 * GAP)] }, // ROM row 2 ($E) — right wall only
  { kind: 'square', pos: [-W, SQUARE_Y, -(NEAR + 4 * GAP)] },
  { kind: 'square', pos: [W, SQUARE_Y, -(NEAR + 5 * GAP)] },
  { kind: 'turret', pos: [-W, TURRET_Y, -(NEAR + 6 * GAP)] }, // ROM row 3 ($C) — both walls...
  { kind: 'turret', pos: [W, TURRET_Y, -(NEAR + 6 * GAP)] }, //  ...left+right at the same station
]

/**
 * Per-run variation (sw3-7). The cabinet builds each trench from a PRNG
 * **fixed-head + picked-tail** "pie" (ROM `sub_83A4` "Called when starting
 * trench" → copy a fixed skeleton from `off_7C7E`, then overwrite tail slots
 * with random picks from `off_7C9E`; WSBASE.MAC `GNBASE` "GEN A NEW BASE PIE"
 * fills each wedge slot via `LDB P.RND1; MUL`). We port that shape: the leading
 * TRENCH_HEAD_COUNT stations are the fixed skeleton (a stable trench entrance,
 * incl. the catwalk divider), and each tail station keeps its fixed downrange
 * position but has its KIND picked from TRENCH_TAIL_POOL by the seeded RNG. So
 * runs DIFFER instead of being byte-identical, while the chain LENGTH stays
 * fixed (the ROM's fixed-size RPIE — only the contents vary).
 */

/** Leading stations copied verbatim every run — the fixed pie skeleton (ROM
 *  `off_7C7E` / `PIEXX` divider format), so every run opens with the same stable
 *  entrance. The force-field ("catwalk") divider that used to sit here is no longer
 *  a placeholder station: force fields are now STREAMED from the wedge grid over the
 *  full channel (`streamForceFields`, sw7-22 / R6d), so this table carries only the
 *  shootable turret/square furniture. */
export const TRENCH_HEAD_COUNT = 3

/** Kinds the picked tail draws from — the ROM's random WEDGE pool (`off_7C9E` /
 *  `TWDGXX` "list of wedges to use"): a wall-mounted turret or square. Catwalks
 *  are structural dividers (fixed head), never a randomly-picked wedge. */
const TRENCH_TAIL_POOL: readonly TrenchObstacle['kind'][] = ['turret', 'square']

/** Seed for the no-arg (static) spawn used by scene presets and the
 *  catwalk/viewpoint fixtures — a deterministic representative run. */
const TRENCH_DEFAULT_SEED = 1983

/**
 * Fresh per-run copies (positions mutate as they scroll — never share). Pass the
 * run's `Rng` to seed the picked tail; the no-arg form yields a deterministic
 * default run. Callers thread a LOCAL cursor (`createRng(state.rng.seed)`) so the
 * run RNG is never mutated (core purity).
 */
export function spawnTrenchObstacles(rng?: Rng): TrenchObstacle[] {
  const gen = rng ?? createRng(TRENCH_DEFAULT_SEED)
  return TRENCH_OBSTACLE_STATIONS.map((o, i) => {
    const kind = i < TRENCH_HEAD_COUNT ? o.kind : TRENCH_TAIL_POOL[nextInt(gen, TRENCH_TAIL_POOL.length)]
    return { kind, pos: [...o.pos] as TrenchObstacle['pos'] }
  })
}

// --- The streamed wall force-field grid (sw7-22 / R6d, B-012) ----------------
//
// The authentic trench draws its wall content from the wedge PANEL GRID (sw7-6 /
// B-010): each wedge carries a left- and right-wall 4-slot column, and a
// PANEL_FORCEFIELD (TD$WFF) slot is a wall force field. `buildTrench` lays the
// whole chain — tens of these across the full ~327,680-unit channel — so with the
// port un-clamped to its real BS.PLC distance (sw7-22) they finally have somewhere
// to go. This replaces the single placeholder catwalk the 1.8s stub carried.

/** The four vertical wall slots' heights above the floor (slot 0 = top … slot 3 =
 *  bottom), as the panel grid stacks them. PROVISIONAL: the exact ROM band
 *  (`M.Z0 ± $200` top / `$400` band, WSPANL.MAC:186-215) is not yet pinned (sw7-22
 *  Delivery Finding); the four slots are spread across the wall's usable height so
 *  each lands in a band the diving/climbing pilot can meet. */
const FORCE_FIELD_SLOT_Y: readonly number[] = [
  (TRENCH_WALL_H * 4) / 5, // slot 0 — top
  (TRENCH_WALL_H * 3) / 5,
  (TRENCH_WALL_H * 2) / 5,
  (TRENCH_WALL_H * 1) / 5, // slot 3 — bottom
]

/**
 * Stream the wave's wedge grid into wall force-field obstacles (B-012). Walks the
 * chain `buildTrench` builds; each PANEL_FORCEFIELD slot becomes one 'catwalk'
 * obstacle — the kind the side-gated graze collision reads (sw7-19) — mounted on
 * its column's wall (left → −x, right → +x) at the slot's height, seated at the
 * wedge's −Z distance down the channel. Pure and deterministic like the chain it
 * reads; the caller threads a LOCAL RNG cursor so the run seed is never consumed.
 */
export function streamForceFields(baseWave: number, rng: Rng): TrenchObstacle[] {
  const fields: TrenchObstacle[] = []
  let z = 0
  for (const w of buildTrench(baseWave, rng) as readonly Wedge[]) {
    w.left.forEach((slot, i) => {
      if (slot === PANEL_FORCEFIELD) fields.push({ kind: 'catwalk', pos: [-W, FORCE_FIELD_SLOT_Y[i], -z] })
    })
    w.right.forEach((slot, i) => {
      if (slot === PANEL_FORCEFIELD) fields.push({ kind: 'catwalk', pos: [W, FORCE_FIELD_SLOT_Y[i], -z] })
    })
    z += wedgeLength(w.type)
  }
  return fields
}
