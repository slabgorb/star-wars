// src/core/trench-obstacles.ts
//
// Fidelity epic (task 3) — the trench's wall content as ENTITIES: shootable
// turrets and wall squares, and catwalk hazards spanning the channel. Stations
// re-expressed from the ROM's obstacle records (docs/star-wars-1983-source-
// findings.md ## Trench catwalks, turrets & wall squares — off_7CC0 →
// off_7B1E..7BFE); scores from ## Scoring tables (byte_9853 turrets,
// byte_9850 squares).

import type { TrenchObstacle } from './state'
import { TRENCH_HALF_W } from './trench-channel'
import { createRng, nextInt, type Rng } from '@arcade/shared/rng'

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
 *  this against. Tuned near PORT_HIT_RADIUS instead; stays provisional pending
 *  a dedicated hit-test decode (findings ## Trench catwalks, turrets & wall
 *  squares; Open follow-ups #3). */
export const OBSTACLE_HIT_RADIUS = 90 // PROVISIONAL(findings ## Trench catwalks, turrets & wall squares)

const W = TRENCH_HALF_W

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
export const TRENCH_OBSTACLE_STATIONS: readonly TrenchObstacle[] = [
  { kind: 'turret', pos: [-W, 60, -900] }, // ROM row 1 ($B) — left wall only
  { kind: 'square', pos: [W, 120, -1300] },
  { kind: 'turret', pos: [W, 60, -1700] }, // ROM row 2 ($E) — right wall only
  { kind: 'catwalk', pos: [0, 200, -2100] },
  { kind: 'square', pos: [-W, 120, -2500] },
  { kind: 'square', pos: [W, 120, -2900] },
  { kind: 'turret', pos: [-W, 60, -3300] }, // ROM row 3 ($C) — both walls...
  { kind: 'turret', pos: [W, 60, -3300] }, //  ...left+right at the same station
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
 *  `off_7C7E` / `PIEXX` divider format). Includes the catwalk (a structural
 *  "DIVIDER W/ CATWALK"), so every run opens with the same stable entrance and
 *  always carries the catwalk hazard. */
export const TRENCH_HEAD_COUNT = 4

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
