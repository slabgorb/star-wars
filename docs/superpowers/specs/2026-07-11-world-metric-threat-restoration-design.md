# World-Metric & Threat Restoration — Space + Surface Phases

**Date:** 2026-07-11
**Status:** Approved (brainstorm with user, architect-led)
**Repo:** star-wars
**Sources:** `~/Projects/star-wars-1983-source-text/` (greppable copy of
github `historicalsource/star-wars` @ `5355b76` — see CLAUDE.md § "The original
1983 Atari source"), `docs/tie-flight-ai-model.md`,
`docs/sw2-6-disassembly-fidelity-audit.md`.

## Problem

Playtesting: the space wave is a turkey shoot — TIEs fill half the screen and
enemy fire is no threat (20+ waves without pressure). A distance audit against
the 1983 ROM proved the cause. The TIE *model* is faithful (WSOBJ.MAC authors
it as small ints × `.S=13.` — our `models.ts` vertices are the raw ROM words
1:1), but the *world* around it was compressed and the threat model inverted:

| Quantity | 1983 ROM | Clone today | Divergence |
|---|---|---|---|
| TIE spawn depth | `$7C00` = 31,744 | `TIE_SPAWN_DISTANCE` 8,000 | world 4.0× too shallow |
| Closest engagement | fire floor `$800` = 2,048 | `TIE_NEAR_BOUND` 350 | 5.9× too close |
| TIE angular size, closest | ~19° (⅓ screen) | ~88° (exceeds 60° FOV) | screen-filling |
| Relative transit | `$200`/tick ≈ cube in ~62 ticks | 1,300 u/s = 6.2 s | 3–6× slower |
| Fireball | homing `vel −= vel>>3`, 64-tick life → **always arrives ~1 s**; the ONLY damage source in space | straight line 300 u/s, TTL 6 s → max reach 1,800 < spawn 8,000; a TIE (1,300 u/s) outruns its own shot | threat is decorative |
| Surface placement | hand-authored per-wave tower mazes out to Y=`$7C00` (WSGRND.MAC) | random turret spawns at 1,200 | ~26× compressed, layout invented |

Because `models.ts` already uses raw ROM units, ROM distances port **unscaled**.

## Decisions (user-confirmed)

1. **Scope:** space + surface phases. Trench is separate (sw3-15 covers the
   port window); input-ease (mouse vs yoke, lock radius) is out of scope.
2. **Depth:** world-metric surgery — keep the playtested swoop/peel kinematics
   (9-2..9-5); restore the ROM numbers. No behavior-script VM, no loiter-in-cube
   (those remain the deferred "TIE deep model" epic item).
3. **Fireball defense:** pure gunnery — restored fireballs home and always
   arrive; un-shot = shield hit; shooting them down is the defense (cabinet's
   iconic play; shot-vs-fireball collision already exists). No artificial
   near-misses, no ship-translation dodge mechanic.
4. **Surface:** port the authored WSGRND.MAC tower mazes — real per-wave
   layouts, not random spawns, not provisional scaling.

## A. Space-wave world metric (constants surgery)

All in `src/core/state.ts` / `gameRules.ts` except the spawn-table change in
`sim.ts` `spawnTie`:

| Constant | Today | Restored | Source |
|---|---|---|---|
| `TIE_SPAWN_DISTANCE` | 8,000 | **31,744** (`$7C00`) | WSCPU.MAC `STARTING LOCATIONS` (`TBG*`) |
| Spawn lateral | random ±350 | **table `{0, ±1024, ±2048}`** (`×$400`) on both lateral axes, per-slot in TBG order | same |
| `TIE_NEAR_BOUND` | 350 | **2,048** (`$800`, the ROM's "not too close" fire floor) | WSCPU fire gate / doc §6 |
| `TIE_EXIT_RANGE` | 1,800 | **~8,000** (must exceed near bound; bounds the peel recession — tuning latitude) | derived |
| `ENEMY_SPEED` | 1,300 | **~10,000 PROVISIONAL** — thrust is `$200`/cabinet-tick and the tick rate is unpinned; target full-depth transit ≈ 2.5–4 s; tune in playtest | doc §5.3 + porting caveat |
| `PROJECTILE_SPEED` | 5,000 | **16,000**, TTL sized so reach ≥ 32,000 (bolts must cover the far plane + spread) | derived |

Unchanged: `TIE_HIT_RADIUS` 250, `COCKPIT_HIT_RADIUS` 80 (already
model-scale-faithful), `waveParams` ramp structure (rides the new bases),
per-TIE fire cooldown + per-wave concurrency caps (9-5, already faithful to the
RE'd §8 fire tables).

Effect: max TIE angular size drops from 88° (over-full-screen) to the
cabinet's ~19°; fighters spend their pass small, fast, and distant.

## B. Fireball threat (homing restoration)

In `sim.ts` (space-phase enemy fire) + `state.ts` constants:

- Replace `vel: scale(toCockpit(e.pos), ENEMY_SHOT_SPEED)` straight-line motion
  with the ROM homing law (`sub_A875`): the shot's position decays toward the
  cockpit by **7/8 per cabinet tick** — implemented frame-rate-independently as
  `pos_rel *= pow(7/8, dt × TICK_HZ)` with `TICK_HZ` a named PROVISIONAL
  constant (same tick-derivation caveat as §A speeds).
- Lifetime: **64 ticks** (`5,u = $40`) expressed in seconds via `TICK_HZ`;
  practical arrival ≈ 1–2 s from any launch range. TTL is cleanup, not the
  balance lever.
- Un-shot fireball → existing cockpit-collision path (shield hit) — unchanged.
- Fireballs stay shootable (`ENEMY_SHOT_HIT_RADIUS` 150). Score value (33) is
  sw3-1's concern; note the sibling dependency, do not implement here.

## C. Surface maze port

New pure-data module **`src/core/surfaceMazes.ts`** (like `models.ts`: data
only, no logic):

- Transcribe `WSGRND.MAC` `TOWER MAZES` (line ~144 onward): entries
  `{ x, y, kind: 'tower'|'bunker'|'bishop', typeDigit }`. Source coordinate
  frame is top-view **X ±right, Y forward** (hex, out to `$7C00`+) → our
  **X lateral, −Z depth**, unscaled.
- Preserve the **prefix structure**: each named maze (DIFF, CLUSTR, BUNK,
  TWRCTY, SYMTRC, TRAP, WEDGE, …) has a base form and an extended `T3*` form
  that appends entries after a mid-table `MAZEND` — encode as one entry list +
  two lengths, not two copies.
- Port the **wave → maze** mapping from the source comments
  (`TBUNK` = wave 2, bunkers only; `TDIFF` = wave 07; `T3DIFF` = wave 16; …)
  and the `TTWRS` per-maze tower counts.
- `sim.ts` surface phase: replace the random turret spawn timer with
  maze-driven placement — the maze is a **fixed field** laid out at its authored
  coordinates; the whole field translates toward the cockpit with the existing
  surface scroll (entities are not spawned one-by-one; they become visible and
  collidable as the scroll brings them into range). Surface scroll speed
  re-derived on the same PROVISIONAL `TICK_HZ` basis as §A.
- Bunkers/bishops render + collide through the existing tower path (bunker
  model exists per sw3-11).

**Flagged reconcile:** sw3-3's `byte_98CB` towers-remaining quota vs the mazes'
`TTWRS` counts. If they disagree for a wave, **maze data wins for placement**;
the quota reconciliation is an in-story decision with the discrepancy
documented in the session file.

## D. Testing (TDD, pure core)

- **Geometry:** spawn depth/lateral-table assertions; peel triggers at 2,048;
  bolt reach ≥ far plane + spread.
- **Fireball:** converges to cockpit radius from any launch range within the
  tick budget; dt-split determinism (30/60/144 Hz step sequences produce the
  same trajectory); un-shot → shield hit; shootable.
- **Mazes:** structural — entry counts match `TTWRS` per maze; coordinates
  within the clamp cube; every wave maps to a maze; prefix invariant
  (base list ⊂ extended list).
- **PROVISIONAL feel items** (speeds, `TICK_HZ`): playtest verification, not
  unit tests; constants carry `PROVISIONAL` doc-comments naming this spec.

## E. Story decomposition (all tdd, repo star-wars)

1. **Space world-metric restoration** — §A. 5 pts, p1.
2. **Homing fireball threat** — §B. 3 pts, p1, depends on story 1.
3. **Surface maze port** — §C. 5 pts, p2.

Complementary, no overlap: sw3-1 (score values), sw3-7 (trench PRNG
variation), sw3-14 (voice parity), sw3-15 (exhaust-port window).

## Open items

- Cabinet tick rate unpinned → all `TICK_HZ`-derived speeds are PROVISIONAL,
  tuned to transit-time targets in playtest.
- `TTWRS` vs `byte_98CB` reconcile (§C flag).
- Turret/tower *fire behavior* (aim, cadence on the surface) is untouched this
  pass — placement only.
