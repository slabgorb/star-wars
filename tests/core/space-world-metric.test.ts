// tests/core/space-world-metric.test.ts
//
// Story sw4-1 — Space world-metric restoration (spec §A), RED phase.
//
// Playtesting root-caused the space wave as a "turkey shoot": TIEs fill half the
// screen and enemy fire is no threat. The TIE *model* is faithful (WSOBJ.MAC raw
// ROM units, 1:1 in models.ts) but the *world* around it was compressed ~4–6×.
// This story restores the 1983 ROM's world metric UNSCALED (models.ts is already
// in raw ROM units, so the distances port straight in):
//
//   TIE_SPAWN_DISTANCE   8000  -> 31744  ($7C00, WSCPU.MAC STARTING LOCATIONS)
//   spawn lateral        rand ±350 -> table {0, ±1024, ±2048} (×$400, TBG order)
//   TIE_NEAR_BOUND       350   -> 2048   ($800, the ROM "not too close" FIRE FLOOR)
//   TIE_EXIT_RANGE       1800  -> ~8000  (tuning latitude; must exceed near bound)
//   ENEMY_SPEED          1300  -> ~10000 PROVISIONAL (target transit ≈ 2.5–4 s)
//   PROJECTILE_SPEED     5000  -> 16000  (reach ≥ 32000: cover the far plane + spread)
//
// This suite pins the restored metric and is EXPECTED TO FAIL until GREEN. It obeys
// the sacred core boundary throughout: no DOM, no time except `dt`, no randomness
// except the seeded RNG carried in state.
//
// SPEC-AUTHORITY & TEA DESIGN DECISIONS (logged as session deviations):
//   * The geometry constants are the ROM's EXACT integers ($7C00, $800, ×$400) and
//     are asserted exactly. The speed-like constants (ENEMY_SPEED, TICK_HZ) are
//     PROVISIONAL — the cabinet tick rate is unpinned (docs/tie-flight-ai-model.md
//     porting caveat) — so per the spec they are guarded by POLICY (a loose,
//     playtest-shaped transit band + a plausible-value sanity check), NEVER pinned
//     to an exact figure. The Reviewer verifies the PROVISIONAL doc-comments on the
//     diff; a runtime unit test cannot see a comment.
//   * The spawn LATERAL TABLE is pinned by its authentic VALUE SET and structure
//     (each spawn offsets exactly one lateral axis by a member of {0,±1024,±2048},
//     and the full table incl. the ±2048 D-group is exercised over a run), decoded
//     from WSCPU.MAC below. It is NOT pinned spawn-by-spawn to a fixed
//     index→entry sequence: "per-slot in TBG order" leaves the concurrency-slot
//     mapping to Dev (spec §A "tuning latitude"), and pinning the exact sequence
//     would reject faithful ports. The value-set + full-table coverage is the
//     AC#2/#14 "matches the WSCPU order" contract at the level the spec fixes.
//
// AUTHENTIC SOURCE — WSCPU.MAC `.SBTTL STARTING LOCATIONS` (github
// historicalsource/star-wars @ 5355b76). The `.WB name,_,a,b` macro emits
// `(.WORD $7C00 ; .WORD a×$400 ; .WORD b×$400)` — depth is always $7C00, and the
// two lateral words are a×$400 and b×$400 with $400 = 1024. The 12 entries
// (comment: "FRONT TO BACK, LEFT TO RIGHT, TOP TO BOTTOM" → a = left/right = our
// X, b = top/bottom = our Y):
//   1A1(0,1) 1A2(-1,0) 1A3(1,0) | 1B1(0,1) 1B2(-1,0) 1B3(1,0)
//   1C1(0,1) 1C2(-1,0) 1C3(1,0) | 1D1(-2,0) 1D2(2,0) 1D3(0,2)
// → lateral offsets ∈ {0, ±1024, ±2048}; exactly ONE axis is nonzero per entry;
//   the ±2048 magnitude lives only in the D-group (1D1/1D2/1D3).

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TIE_SPAWN_DISTANCE,
  TIE_NEAR_BOUND,
  PROJECTILE_SPEED,
  PROJECTILE_TTL,
  STARTING_LIVES,
  TIE_SCORE,
  // TICK_HZ does not exist yet — Dev adds it in GREEN (shared with sw4-2). Importing
  // a not-yet-exported constant binds `undefined` under vitest, so the AC#7
  // assertions fail RED with a clear "expected undefined" message; GREEN's export
  // resolves it. This is the tie-peel-away precedent (it imported TIE_NEAR_BOUND
  // before Dev added it) — a bare import, NOT a @ts-expect-error (which would rot
  // into a dead-suppression lint failure the moment the export lands).
  TICK_HZ,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { perspective, transform, IDENTITY } from '@arcade/shared/math3d'

// The ROM constants this story restores, named here so the assertions read as the
// spec's table (and so a reviewer can diff the expectations against WSCPU.MAC).
const ROM_SPAWN_DEPTH = 0x7c00 // 31744 — WSCPU STARTING LOCATIONS depth word
const ROM_FIRE_FLOOR = 0x800 // 2048  — the "not too close" fire/peel floor
const ROM_LATERAL_UNIT = 0x400 // 1024  — the ×$400 lateral step
const AUTHENTIC_LATERALS = new Set([0, -ROM_LATERAL_UNIT, ROM_LATERAL_UNIT, -2 * ROM_LATERAL_UNIT, 2 * ROM_LATERAL_UNIT])
// The distinct authentic (|x|,|y|) lateral pairs, encoded as "mx:my" magnitude keys:
// exactly one axis nonzero, at 1024 or 2048 (0:0 never occurs — every ROM entry
// displaces one axis).
const AUTHENTIC_PAIR_KEYS = new Set(['0:1024', '1024:0', '2048:0', '0:2048'])

// --- Spawn observation ------------------------------------------------------
//
// The space step spawns at most one TIE per frame, placing it at exactly
// pos = [x, y, -TIE_SPAWN_DISTANCE] (sim.ts spawnTie), and only THEN, on later
// frames, does the VM-driven flight (applyManeuver) advance it inward. So a fresh
// spawn is the unique enemy whose z equals -TIE_SPAWN_DISTANCE exactly; every moved
// TIE has a fractional, closer z that never returns to the spawn plane. Exact-equality
// detection is thus robust to whatever the flight model does after spawn.

interface Spawn {
  x: number
  y: number
  z: number
}

/** Step a fresh space wave forward `steps` frames at `dt`, capturing every TIE on
 * the frame it spawns (z exactly at the spawn plane). Player fires nothing
 * (NO_INPUT), so TIEs cycle spawn → approach → peel → exit → respawn, giving many
 * samples across the table. Lives are parked high so the sample window runs to its
 * end: sw4-2's HOMING enemy fireballs converge on the idle cockpit and would
 * otherwise end the run (gameOver halts spawning) long before the table is sampled —
 * an incidental interaction orthogonal to the spawn GEOMETRY this helper observes. */
function collectSpawns(dt: number, steps: number, seed = 4041): Spawn[] {
  let s: GameState = { ...initialState(seed), lives: 1e9 }
  const out: Spawn[] = []
  const atPlane = (e: Enemy) => Math.abs(e.pos[2] + TIE_SPAWN_DISTANCE) < 1e-6
  for (let i = 0; i < steps; i++) {
    s = stepGame(s, NO_INPUT, dt)
    for (const e of s.enemies) if (atPlane(e)) out.push({ x: e.pos[0], y: e.pos[1], z: e.pos[2] })
    // sw8-2 RE-SEAT: force slot turnover independent of the flight model. sw8-2 ports the ROM's
    // rate-limited $67 aim (4.48°/frame, `aimOrient`), so a homing TIE now curves at turn radius
    // v/ω ≈ 3–6k units — far outside the 80u cockpit hit sphere — and ORBITS instead of snap-homing
    // into a ram (this is authentic: the ROM's homing does not ram either; the space threat is
    // enemy FIRE). Under NO_INPUT slots therefore no longer free by ramming, which stalls the TBG
    // table walk this suite exercises. Clearing TIEs that have LEFT the spawn plane frees a slot so a
    // fresh one spawns next window and the table keeps walking to the ±2048 D-group — the SAME spawn
    // GEOMETRY (depth/lateral/one-offset), now decoupled from ram turnover. (Was: turnover-limited to
    // ~8–10 spawns per long window; see the AC#2/#14 non-vacuity note below.)
    s = { ...s, enemies: s.enemies.filter(atPlane) }
  }
  return out
}

// --- AC#1 / AC#3 — geometry constants are the ROM's exact integers -----------

describe('sw4-1 §A — restored geometry constants (exact ROM integers)', () => {
  it('TIE_SPAWN_DISTANCE is restored to $7C00 = 31744 (world 4× deeper)', () => {
    // RED today: 8000 (world compressed ~4×). WSCPU STARTING LOCATIONS depth word.
    expect(TIE_SPAWN_DISTANCE).toBe(ROM_SPAWN_DEPTH)
    expect(TIE_SPAWN_DISTANCE).toBe(31744)
  })

  it('TIE_NEAR_BOUND is restored to $800 = 2048 (the ROM fire/peel floor)', () => {
    // RED today: 350 (~5.9× too close → TIEs balloon to 88° of the 60° FOV).
    expect(TIE_NEAR_BOUND).toBe(ROM_FIRE_FLOOR)
    expect(TIE_NEAR_BOUND).toBe(2048)
  })
})

// --- AC#4 — TIE_EXIT_RANGE: RETIRED (sw7-23) ----------------------------------
//
// The "exit range bounds the peel recession" block was removed in sw7-23. TIE_EXIT_RANGE
// was the peel-away recession cull's threshold; the cull (Enemy.peeling) was retired
// once flight became VM-driven (PR #110), so the constant is gone with it.

// --- AC#5 / AC#12 — bolt reach must cover the far plane + lateral spread -------

describe('sw4-1 §A — player bolt reach covers the restored approach volume', () => {
  it('reach (speed × ttl) is ≥ 32000 and clears the worst-case spawn corner', () => {
    // RED today: 5000 × 2 = 10000, far short of the 31744 far plane — inbound TIEs
    // are unreachable until point-blank. GREEN: 16000 × 2 = 32000.
    const reach = PROJECTILE_SPEED * PROJECTILE_TTL
    expect(reach).toBeGreaterThanOrEqual(32000)
    // The farthest spawn is a corner of the spawn plane: depth 31744 with both
    // lateral axes at their ±2048 extreme. A bolt must still clear it.
    const worstCaseCorner = Math.hypot(ROM_SPAWN_DEPTH, 2 * ROM_LATERAL_UNIT, 2 * ROM_LATERAL_UNIT)
    expect(reach).toBeGreaterThanOrEqual(worstCaseCorner)
  })

  it('a deep-inbound TIE beyond the old reach is now killable on the way in', () => {
    // Drives the REAL firing path (trigger via Input) and asserts only observable
    // state, so GREEN is free to restore reach via speed, ttl, or an explicit range
    // model. Depth 24000 is beyond the pre-sw4-1 ~10000 reach yet comfortably inside
    // the restored 32000 reach — RED today (the bolt expires short; the TIE lives).
    const DEEP = 24000
    const tie: Enemy = { pos: [0, 0, -DEEP], kind: 'tie', orient: IDENTITY }
    const proj = perspective(Math.PI / 3, 16 / 9, 1, 5000)
    const ndc = transform(proj, tie.pos) // crosshairNdc is identity: aim = projected NDC
    const fire: Input = { aimX: ndc[0], aimY: ndc[1], fire: true }
    let s: GameState = { ...initialState(1983), enemies: [tie], spawnTimer: 1e9, enemyFireCooldown: 1e9 }
    for (let i = 0; i < 1200 && s.enemies.length > 0; i++) s = stepGame(s, fire, 1 / 60)
    expect(s.enemies).toHaveLength(0) // the bolt reached across the approach volume
    expect(s.score).toBe(TIE_SCORE) // killed by fire, not a ram
    expect(s.lives).toBe(STARTING_LIVES) // and cost no shield
  })
})

// --- AC#2 / AC#11 / AC#14 — spawn depth + authentic lateral table -------------

describe('sw4-1 §A — TIEs spawn on the far plane with the TBG lateral table', () => {
  const spawns = collectSpawns(0.05, 3000)

  it('the wave actually spawns a healthy sample of fighters', () => {
    // Guards the observation itself: if spawning were broken the coverage checks
    // below would pass vacuously on an empty set.
    // History: sw7 task-4/5 re-baselined this count DOWN (15 → 10, window 1500 → 3000) as
    // VM-driven TIEs began to LOITER instead of the old fast home→peel→exit cycle, so slots
    // turned over slower under NO_INPUT and the 12-slot TBG table walked to index 9 (the first
    // ±2048 D-group slot the coverage test needs) more slowly. sw8-2 took that to its authentic
    // limit — the ROM $67 aim orbits rather than rams (see the collectSpawns RE-SEAT above) — so
    // turnover is now FORCED there and this count is a healthy, flight-independent sample (>>10)
    // walking well past the D-group slot. The spawn SEQUENCE and GEOMETRY are unchanged.
    expect(spawns.length).toBeGreaterThanOrEqual(10)
  })

  it('every fresh TIE spawns on the far plane at depth 31744', () => {
    for (const sp of spawns) expect(-sp.z).toBe(ROM_SPAWN_DEPTH)
  })

  it('every spawn lateral is an authentic table value {0, ±1024, ±2048}', () => {
    // RED today: spawnTie draws each lateral from a CONTINUOUS (rand·2−1)·350
    // distribution — values like 137.4 or −298.1, which are never table members.
    for (const sp of spawns) {
      expect(AUTHENTIC_LATERALS.has(sp.x)).toBe(true)
      expect(AUTHENTIC_LATERALS.has(sp.y)).toBe(true)
    }
  })

  it('each spawn displaces exactly one lateral axis — the ROM one-offset structure', () => {
    // The ROM structure: each STARTING LOCATION entry offsets ONE lateral axis (by
    // 1024 or 2048); the other is 0 — never both, never neither. (Quantisation to
    // the ×$400 grid is already enforced by the authentic-set membership above; the
    // set uses SameValueZero so a signed −0 offset still matches.) RED today:
    // continuous random offsets displace both axes at once.
    for (const sp of spawns) {
      const nonzeroAxes = (sp.x !== 0 ? 1 : 0) + (sp.y !== 0 ? 1 : 0)
      expect(nonzeroAxes).toBe(1) // exactly one displaced axis
    }
  })

  it('the FULL table is exercised — the ±2048 D-group appears, not just {0, ±1024}', () => {
    // AC#2/#14: the authentic table includes the D-group (1D1/1D2/1D3 at ±2048). A
    // truncated {0, ±1024} port would miss it. RED today: max |lateral| ≤ 350.
    const magnitudes = new Set(spawns.flatMap((sp) => [Math.abs(sp.x), Math.abs(sp.y)]))
    expect(magnitudes.has(0)).toBe(true)
    expect(magnitudes.has(ROM_LATERAL_UNIT)).toBe(true) // 1024 (A/B/C groups)
    expect(magnitudes.has(2 * ROM_LATERAL_UNIT)).toBe(true) // 2048 (D group)
  })

  it('no foreign lateral pairs appear — the observed set matches WSCPU order values', () => {
    // Every observed (|x|,|y|) pair must be one the WSCPU table actually emits;
    // nothing outside it. RED today: continuous pairs are all foreign.
    const seen = new Set(spawns.map((sp) => `${Math.abs(sp.x)}:${Math.abs(sp.y)}`))
    for (const key of seen) expect(AUTHENTIC_PAIR_KEYS.has(key)).toBe(true)
  })
})

// --- AC#6 — ENEMY_SPEED: RETIRED (sw7-23) --------------------------------------
//
// The "enemy approach speed (PROVISIONAL, transit-time policy)" block was removed in
// sw7-23. ENEMY_SPEED only ever seeded the unread Enemy.vel once TIE motion became
// VM-driven (PR #110), so there is no approach-speed constant left to guard, and no
// spawn→near-bound transit time to assert. See tie-flight-cleanup.test.ts.

// --- AC#7 — TICK_HZ: one shared PROVISIONAL cabinet-tick constant --------------

describe('sw4-1 §A — TICK_HZ shared cabinet-tick constant (defined once in core)', () => {
  it('exists as a positive, finite, plausible cabinet tick rate', () => {
    // Defined here so sw4-2 (homing fireball, pow(7/8, dt×TICK_HZ)) inherits ONE
    // constant instead of forking a second. It carries a PROVISIONAL doc-comment
    // (cabinet tick unpinned). RED today: undefined (Dev adds it in GREEN).
    expect(typeof TICK_HZ).toBe('number')
    expect(Number.isFinite(TICK_HZ)).toBe(true)
    expect(TICK_HZ).toBeGreaterThan(0)
    expect(TICK_HZ).toBeLessThanOrEqual(1000) // a sane cabinet frame/tick band
  })
})

// --- AC#13 — determinism & frame-rate independence of the restored metric -----

describe('sw4-1 §A — deterministic & frame-rate-independent spawn geometry', () => {
  it('identical seed and dt sequence replay bit-identically (no hidden time/rng)', () => {
    const run = (): GameState => {
      let s = initialState(2024)
      for (let i = 0; i < 400; i++) s = stepGame(s, NO_INPUT, 0.05)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('spawn depth and lateral values do not depend on the step size (30 vs 144 Hz)', () => {
    // AC#13: the restored geometry must be frame-rate-independent VALUES — every
    // spawn at any dt lands on the far plane with an authentic lateral. (The spawn
    // TIMING legitimately differs with dt; the GEOMETRY must not.) RED today: the
    // continuous ±350 laterals are foreign at every dt.
    for (const dt of [1 / 30, 1 / 144]) {
      const spawns = collectSpawns(dt, Math.ceil(60 / dt), 7777)
      expect(spawns.length).toBeGreaterThanOrEqual(10)
      for (const sp of spawns) {
        expect(-sp.z).toBe(ROM_SPAWN_DEPTH)
        expect(AUTHENTIC_LATERALS.has(sp.x)).toBe(true)
        expect(AUTHENTIC_LATERALS.has(sp.y)).toBe(true)
      }
    }
  })
})
