# Star Wars 1983 Source Findings + Trench-Run Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distill the 1983 arcade ROM disassembly into a committed findings doc, then rebuild the trench run to arcade fidelity — wall detail, targetable turrets/squares, catwalk obstacles, authentic exhaust-port/force-bonus gameplay, and a faithful HUD — verified on the scene sheet and in a live run.

**Architecture:** Pure deterministic generators and entity logic in `src/core/` (no DOM/time/random; ROM data re-expressed as our own TypeScript constants citing the findings doc); the shell only strokes returned `Model3D`s and lays out HUD text. Every render change is judged on the 13-1 scene contact sheet (`/scenes.html`); the capstone is a live playtest.

**Tech Stack:** TypeScript (strict, ES modules) · Vite · Vitest (TDD on core) · Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-07-02-sw-1983-source-findings-and-trench-fidelity-design.md`

## Global Constraints

- **Hard core/shell boundary:** `src/core/` never imports `src/shell/`, never touches DOM/`Date.now()`/`Math.random()`/`performance.now()`. All time enters as `dt`; all randomness from the seeded RNG in `GameState`.
- **Never commit `reference/`:** the disassembly quarry is gitignored, read-only source material. ROM data enters the clone only as re-expressed TypeScript constants with a findings-doc citation comment.
- **PROVISIONAL constants:** tasks 2–5 seed ROM-derived values as named constants marked `// PROVISIONAL(findings §…)`. Each task has a mandatory true-up step against `docs/star-wars-1983-source-findings.md` before its commit. Tests reference constants BY NAME, never literal numbers, so true-ups don't break them.
- **Scene sheet is the render acceptance surface:** `npm run dev` → `http://localhost:5274/star-wars/scenes.html`.
- **Suite must stay green:** 512 tests pass today. `npm test` and `npm run build` (tsc + vite) after every task.
- Zero new runtime dependencies.

---

### Task 1: Reference quarry + whole-game source findings doc

**Files:**
- Create: `docs/star-wars-1983-source-findings.md`
- Create (local only, NOT committed): `reference/` (copied from the `a-3` checkout)

**Interfaces:**
- Consumes: `/Users/slabgorb/Projects/a-3/star-wars/reference/` (disasm quarry: `StarWars_annotated.lst` 40,047 lines, `Object_3D_Data.asm`, `Memory_Locations.asm`, `Direct_Page.asm`, `SW_M_Hi.asm`, `sound/`).
- Produces: the committed findings doc with these EXACT section headings (later tasks cite them):
  `## Space wave & TIE fighters` · `## Death Star surface & towers` · `## Trench geometry & limits` · `## Trench catwalks, turrets & wall squares` · `## Exhaust port & run outcome` · `## Scoring tables` · `## HUD & framing` · `## Colors & intensities` · `## Sound hooks` · `## Open follow-ups`

- [ ] **Step 1: Copy the quarry and verify it is ignored**

```bash
cp -R /Users/slabgorb/Projects/a-3/star-wars/reference ./reference
git check-ignore reference/ && echo "IGNORED OK"
git status --short | grep -c reference   # Expected: 0
```

Expected: `IGNORED OK`, and `git status` shows nothing under `reference/`. If `check-ignore` fails, STOP — add `reference/` to `.gitignore` first and re-verify.

- [ ] **Step 2: Dispatch parallel extraction agents over the annotated listing**

Dispatch 8 parallel read-only subagents, one per line range of `reference/disasm/StarWars_annotated.lst` (~5,000 lines each: 1–5000, 5001–10000, … 35001–40047). Each agent prompt:

```
You are extracting facts from an annotated IDA disassembly of Atari's 1983
Star Wars arcade game (Motorola 6809E). Read ONLY lines <RANGE> of
reference/disasm/StarWars_annotated.lst.

Report every fact in your range as `SYMBOL / ROM address — what it is — data
values if a table`. Capture: subroutine purposes from the hand comments, data
tables (dump the actual bytes/words for small tables, e.g. off_7CC0,
byte_9850), constants, limits, score values, color/intensity writes, HUD/text
handling, phase/state machine facts, and sound trigger points. Flag
uncertain annotations (comments ending in '?') with ⚠︎. Group your findings
under these candidate topics where applicable: space wave / TIEs, surface +
towers, trench geometry, trench catwalks/turrets/squares, exhaust port,
scoring, HUD/framing, colors, sound. Return raw structured notes, not prose.
```

Plus one agent each for `Object_3D_Data.asm` (dump every model's vertex/edge tables with names), `Memory_Locations.asm` + `Direct_Page.asm` (variable map), and `SW_M_Hi.asm` + `sound/` (Math Box + sound-board surface — breadth only).

- [ ] **Step 3: Assemble the findings doc**

Merge agent notes into `docs/star-wars-1983-source-findings.md`, modeled on `tempest/docs/tempest-1981-source-findings.md`: header (source, provenance per `reference/README.md`, transcription caveats), a coverage table mapping ROM regions → our code files, then the ten exact section headings from **Produces** above. Trench sections get depth (dump the actual table data: `off_7CC0` → `off_7B1E..7BFE` records, `byte_9850` = `0,0,$50`, `byte_9853` = `0,1,0`, `sub_703B` viewpoint limits, `sub_CCFC`/`sub_CD08`/`sub_CD38`/`sub_CD44` geometry routines, `Obj_Trench_Squares` vertices); other sections get breadth. Every ⚠︎ from the agents is preserved inline. End with `## Open follow-ups` keyed to our code files.

- [ ] **Step 4: Spot-check the doc against the quarry**

Pick 5 claims from the doc (one per major section) and re-grep the listing to confirm symbol, address, and values match, e.g.:

```bash
grep -n "byte_9850" reference/disasm/StarWars_annotated.lst
grep -n "off_7CC0" reference/disasm/StarWars_annotated.lst
grep -n "Obj_Trench_Squares" reference/disasm/Object_3D_Data.asm
```

Expected: each matches the doc's quoted values. Fix any mismatch in the doc.

- [ ] **Step 5: Verify build/tests untouched and commit**

```bash
npm test && npm run build
git add docs/star-wars-1983-source-findings.md
git status --short | grep -v "^??" | grep -c reference   # Expected: 0
git commit -m "docs: 1983 source findings — whole-game extraction from ROM disassembly"
```

---

- [x] **Story 14-1 complete** — run `pf sprint story complete 14-1`

### Task 2: Trench wall detail — panels/windows generator + envelope true-up

**Files:**
- Create: `src/core/trench-detail.ts`
- Modify: `src/core/trench-channel.ts` (true-up `TRENCH_HALF_W`/`TRENCH_WALL_H`/`RIB_Z`/`TRENCH_FAR` values only — names/exports unchanged)
- Modify: `src/shell/render.ts` (trench phase: stroke the detail model after the channel)
- Test: `tests/core/trench-detail.test.ts`

**Interfaces:**
- Consumes: `type Vec3` from `src/core/math3d.ts`; `type Model3D` from `src/core/models.ts`; `TRENCH_HALF_W`, `TRENCH_WALL_H`, `RIB_Z`, `TRENCH_FAR` from `src/core/trench-channel.ts`; findings `## Trench geometry & limits`.
- Produces: `trenchWallDetail(scroll: number): Model3D` — recessed panel/window rectangles on BOTH walls, recycling with the same `scroll mod PANEL_Z` idiom; constants `PANEL_Z`, `PANEL_W`, `PANEL_H`, `PANEL_INSET_Y` exported from `src/core/trench-detail.ts`.

Deliberately a SEPARATE generator (not folded into `trenchChannel`): the 11-6 suite asserts every across-Y wall edge spans floor→top (`tests/core/trench-channel.test.ts:261-273`); partial-height window edges inside `trenchChannel` would break that contract. A second model keeps 11-6 untouched and mirrors the surface-grid/trench-channel module idiom.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/trench-detail.test.ts
import { describe, it, expect } from 'vitest'
import { trenchWallDetail, PANEL_Z, PANEL_W, PANEL_H } from '../../src/core/trench-detail'
import { TRENCH_HALF_W, TRENCH_WALL_H, TRENCH_FAR } from '../../src/core/trench-channel'

describe('trenchWallDetail — recessed wall panels (fidelity epic)', () => {
  it('returns a well-formed Model3D', () => {
    const d = trenchWallDetail(0)
    expect(d.vertices.length).toBeGreaterThan(0)
    expect(d.edges.length).toBeGreaterThan(0)
    for (const [a, b] of d.edges) {
      expect(a).not.toBe(b)
      expect(a).toBeLessThan(d.vertices.length)
      expect(b).toBeLessThan(d.vertices.length)
    }
  })

  it('puts every vertex ON a wall plane (x = ±TRENCH_HALF_W), inside the wall band', () => {
    for (const v of trenchWallDetail(0).vertices) {
      expect(Math.abs(Math.abs(v[0]) - TRENCH_HALF_W)).toBeLessThan(1e-6)
      expect(v[1]).toBeGreaterThan(0)
      expect(v[1]).toBeLessThan(TRENCH_WALL_H)
      expect(v[2]).toBeLessThanOrEqual(0 + PANEL_Z) // never behind the cockpit by more than one cell
      expect(v[2]).toBeGreaterThanOrEqual(-TRENCH_FAR - PANEL_Z)
    }
  })

  it('is mirror-symmetric across x=0', () => {
    const d = trenchWallDetail(0)
    const present = new Set(d.vertices.map((v) => `${v[0]}|${v[1]}|${v[2]}`))
    for (const v of d.vertices) expect(present.has(`${-v[0]}|${v[1]}|${v[2]}`)).toBe(true)
  })

  it('is pure & deterministic, and recycles every PANEL_Z', () => {
    expect(trenchWallDetail(137.5)).toEqual(trenchWallDetail(137.5))
    for (const s of [0, PANEL_Z / 3, PANEL_Z * 2.25]) {
      expect(trenchWallDetail(s)).toEqual(trenchWallDetail(s + PANEL_Z))
    }
  })

  it('panels have real extent (PANEL_W × PANEL_H rectangles, 4 edges each)', () => {
    const d = trenchWallDetail(0)
    expect(d.edges.length % 4).toBe(0)
    expect(PANEL_W).toBeGreaterThan(0)
    expect(PANEL_H).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/trench-detail.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/trench-detail'` (vitest runs via esbuild without typecheck; this is the repo's RED convention).

- [ ] **Step 3: Implement the generator**

```typescript
// src/core/trench-detail.ts
//
// Fidelity epic — recessed panel/window detail on the trench walls, the surface
// texture the bare 11-6 rail-and-rib cage lacks (see the arcade reference:
// docs/star-wars-1983-source-findings.md ## Trench geometry & limits).
// PURE core, mirrors trench-channel.ts: deterministic, no DOM/time/random. A
// SEPARATE Model3D from trenchChannel so the 11-6 full-height-rung contract
// stays intact; the shell strokes both with the same glow.

import type { Vec3 } from './math3d'
import type { Model3D } from './models'
import { TRENCH_HALF_W, TRENCH_WALL_H, TRENCH_FAR } from './trench-channel'

/** Panel spacing down −Z — also the detail's scroll-recycle period. */
export const PANEL_Z = 800 // PROVISIONAL(findings ## Trench geometry & limits)
/** Panel width along Z and height along Y — the recessed window rectangle. */
export const PANEL_W = 240 // PROVISIONAL(findings ## Trench geometry & limits)
export const PANEL_H = 120 // PROVISIONAL(findings ## Trench geometry & limits)
/** Panel bottom edge's height above the floor. */
export const PANEL_INSET_Y = 80 // PROVISIONAL(findings ## Trench geometry & limits)

/** Rectangular wall panels at each PANEL_Z station on BOTH walls, scrolled
 *  toward the cockpit by `scroll` (same modulo idiom as trenchChannel). */
export function trenchWallDetail(scroll: number): Model3D {
  const vertices: Vec3[] = []
  const edges: [number, number][] = []
  const offset = ((scroll % PANEL_Z) + PANEL_Z) % PANEL_Z
  const count = Math.round(TRENCH_FAR / PANEL_Z)
  const y0 = PANEL_INSET_Y
  const y1 = Math.min(PANEL_INSET_Y + PANEL_H, TRENCH_WALL_H - 1)
  for (let k = 0; k <= count; k++) {
    const zNear = -k * PANEL_Z + offset
    const zFar = zNear - PANEL_W
    for (const x of [-TRENCH_HALF_W, TRENCH_HALF_W]) {
      const a = vertices.push([x, y0, zNear]) - 1
      const b = vertices.push([x, y1, zNear]) - 1
      const c = vertices.push([x, y1, zFar]) - 1
      const d = vertices.push([x, y0, zFar]) - 1
      edges.push([a, b], [b, c], [c, d], [d, a])
    }
  }
  return { name: 'Trench Wall Detail', vertices, edges }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/trench-detail.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: True the constants against the findings doc**

Read `docs/star-wars-1983-source-findings.md` `## Trench geometry & limits` (the `sub_703B` viewpoint limits, `sub_CCFC`/`sub_CD08` line spacing, wall proportions). Update `PANEL_Z`/`PANEL_W`/`PANEL_H`/`PANEL_INSET_Y` here AND `TRENCH_HALF_W`/`TRENCH_WALL_H`/`RIB_Z`/`TRENCH_FAR` in `src/core/trench-channel.ts` to the ROM-derived proportions (keep our world scale; preserve the ratio). Replace each `PROVISIONAL` marker with `findings:` + the quoted value. If the findings don't pin a value, keep ours and note it in the findings doc's `## Open follow-ups`.

Run: `npm test` — Expected: full suite PASS (all trench tests are name-based).

- [ ] **Step 6: Stroke the detail in the trench phase**

In `src/shell/render.ts`, add the import and one line after the existing channel stroke (`drawWireframe(ctx, trenchChannel(...))` at ~line 228):

```typescript
import { trenchWallDetail } from '../core/trench-detail'
// … inside the `state.phase === 'trench'` branch, immediately after the channel:
    drawWireframe(ctx, trenchWallDetail(state.trenchScrollZ), view, proj, w, h, SURFACE_GLOW)
```

- [ ] **Step 7: Eyeball on the scene sheet**

Run: `npm run dev` → `http://localhost:5274/star-wars/scenes.html`
Expected: all three trench presets show panelled walls (rectangles on both walls), not a bare cage. Compare against the arcade reference still.

- [ ] **Step 8: Full verify and commit**

```bash
npm test && npm run build
git add src/core/trench-detail.ts src/core/trench-channel.ts src/shell/render.ts tests/core/trench-detail.test.ts
git commit -m "feat: trench wall panel detail per 1983 findings (pure core generator)"
```

---

- [x] **Story 14-2 complete** — run `pf sprint story complete 14-2`

### Task 3: Trench turrets, wall squares & catwalks — targetable scored entities

**Files:**
- Create: `src/core/trench-obstacles.ts`
- Modify: `src/core/state.ts` (add `TrenchObstacle` type + `trenchObstacles` field; seed empty in `initialState`)
- Modify: `src/core/sim.ts` (spawn in `enterPhase('trench')`; scroll/collide/score in `stepTrench`)
- Modify: `src/core/events.ts` (add `{ type: 'trench-obstacle-destroyed'; kind: 'turret' | 'square' }` to the event union)
- Modify: `src/core/models.ts` (add `TRENCH_TURRET`, `TRENCH_SQUARE`, `TRENCH_CATWALK` wireframe models re-expressed from findings)
- Modify: `src/core/scenePresets.ts` (add a `turret-alley` preset)
- Modify: `src/shell/render.ts` (draw obstacles in the trench phase)
- Test: `tests/core/trench-obstacles.test.ts`
- Modify: `tests/core/scene-presets.test.ts` (expect the new preset id)

**Interfaces:**
- Consumes: `TRENCH_SCROLL_SPEED`, `type GameState` from `src/core/state.ts`; `collides` from `src/core/gameRules.ts`; `stepTrench`/`enterPhase` internals in `src/core/sim.ts`; findings `## Trench catwalks, turrets & wall squares` (the `off_7CC0` → `off_7B1E..7BFE` records) and `## Scoring tables` (`byte_9850`, `byte_9853`).
- Produces:
  - `type TrenchObstacle = { kind: 'turret' | 'square' | 'catwalk'; pos: Vec3 }` (exported from `src/core/state.ts`)
  - `TRENCH_OBSTACLE_STATIONS: readonly TrenchObstacle[]` and `spawnTrenchObstacles(): TrenchObstacle[]` from `src/core/trench-obstacles.ts`
  - `TRENCH_TURRET_SCORE`, `TRENCH_SQUARE_SCORE`, `OBSTACLE_HIT_RADIUS` from `src/core/trench-obstacles.ts`
  - `GameState.trenchObstacles: TrenchObstacle[]`

Semantics: **turrets** (wall-mounted) and **squares** (wall panels) are shootable — a player bolt within `OBSTACLE_HIT_RADIUS` destroys them and scores; **catwalks** span the trench and are pure hazards — cockpit contact costs a shield (reuses the `terrain-crash` event) and removes the catwalk (you crashed through it). All obstacles advance +Z at `TRENCH_SCROLL_SPEED` like the port and despawn past the cockpit (`pos[2] > 0`).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/trench-obstacles.test.ts
import { describe, it, expect } from 'vitest'
import {
  spawnTrenchObstacles,
  TRENCH_OBSTACLE_STATIONS,
  TRENCH_TURRET_SCORE,
  TRENCH_SQUARE_SCORE,
  OBSTACLE_HIT_RADIUS,
} from '../../src/core/trench-obstacles'
import { initialState, TRENCH_SCROLL_SPEED, PROJECTILE_TTL, type GameState } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

describe('trench obstacles — spawn & scroll', () => {
  it('enterPhase(trench) seeds the full station table; other phases carry none', () => {
    const t = enterPhase(initialState(), 'trench')
    expect(t.trenchObstacles).toEqual(spawnTrenchObstacles())
    expect(t.trenchObstacles.length).toBe(TRENCH_OBSTACLE_STATIONS.length)
    expect(enterPhase(initialState(), 'space').trenchObstacles).toEqual([])
    expect(enterPhase(initialState(), 'surface').trenchObstacles).toEqual([])
  })

  it('spawnTrenchObstacles returns fresh arrays (no shared mutable state)', () => {
    const a = spawnTrenchObstacles()
    const b = spawnTrenchObstacles()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('obstacles scroll toward the cockpit at TRENCH_SCROLL_SPEED, like the port', () => {
    const s0 = enterPhase(initialState(), 'trench')
    const z0 = s0.trenchObstacles[0].pos[2]
    const s1 = stepGame(s0, NO_INPUT, 0.1)
    expect(s1.trenchObstacles[0].pos[2]).toBeCloseTo(z0 + TRENCH_SCROLL_SPEED * 0.1)
  })

  it('despawns obstacles that pass the cockpit (pos z > 0)', () => {
    let s = enterPhase(initialState(), 'trench')
    const nearest: GameState = {
      ...s,
      trenchObstacles: [{ ...s.trenchObstacles[0], pos: [s.trenchObstacles[0].pos[0], s.trenchObstacles[0].pos[1], -0.1] }],
    }
    const stepped = stepGame(nearest, NO_INPUT, 1)
    expect(stepped.trenchObstacles.length).toBe(0)
  })
})

describe('trench obstacles — shooting & scoring', () => {
  /** A trench state with one obstacle of `kind` dead ahead and a live bolt on it. */
  function boltOn(kind: 'turret' | 'square'): GameState {
    const s = enterPhase(initialState(), 'trench')
    const pos: [number, number, number] = [0, 60, -400]
    return {
      ...s,
      mode: 'playing',
      trenchObstacles: [{ kind, pos }],
      projectiles: [{ pos: [...pos], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
    }
  }

  it('a bolt on a TURRET destroys it, scores TRENCH_TURRET_SCORE, emits the event', () => {
    const s1 = stepGame(boltOn('turret'), NO_INPUT, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(0)
    expect(s1.score).toBe(TRENCH_TURRET_SCORE)
    expect(s1.events).toContainEqual({ type: 'trench-obstacle-destroyed', kind: 'turret' })
  })

  it('a bolt on a SQUARE destroys it and scores TRENCH_SQUARE_SCORE', () => {
    const s1 = stepGame(boltOn('square'), NO_INPUT, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(0)
    expect(s1.score).toBe(TRENCH_SQUARE_SCORE)
  })

  it('the destroying bolt is consumed (no double-kill on the port behind)', () => {
    const s1 = stepGame(boltOn('turret'), NO_INPUT, 1 / 60)
    expect(s1.projectiles.length).toBe(0)
  })

  it('CATWALKS are not shootable — a bolt passes through', () => {
    const s = enterPhase(initialState(), 'trench')
    const pos: [number, number, number] = [0, 60, -400]
    const s1 = stepGame(
      {
        ...s,
        mode: 'playing',
        trenchObstacles: [{ kind: 'catwalk', pos }],
        projectiles: [{ pos: [...pos], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
      },
      NO_INPUT,
      1 / 60,
    )
    expect(s1.trenchObstacles.length).toBe(1)
    expect(s1.score).toBe(0)
  })

  it('cockpit contact with a CATWALK costs a shield and emits terrain-crash', () => {
    const s = enterPhase(initialState(), 'trench')
    const lives0 = s.lives
    const s1 = stepGame(
      { ...s, mode: 'playing', trenchObstacles: [{ kind: 'catwalk', pos: [0, 0, -1] }] },
      NO_INPUT,
      1 / 60,
    )
    expect(s1.lives).toBe(lives0 - 1)
    expect(s1.events).toContainEqual({ type: 'terrain-crash' })
    expect(s1.trenchObstacles.length).toBe(0) // crashed through it
  })

  it('OBSTACLE_HIT_RADIUS and both scores are positive (table sanity)', () => {
    expect(OBSTACLE_HIT_RADIUS).toBeGreaterThan(0)
    expect(TRENCH_TURRET_SCORE).toBeGreaterThan(0)
    expect(TRENCH_SQUARE_SCORE).toBeGreaterThan(0)
    expect(TRENCH_OBSTACLE_STATIONS.length).toBeGreaterThanOrEqual(8) // ≥ the off_7CC0 record count
    for (const o of TRENCH_OBSTACLE_STATIONS) expect(o.pos[2]).toBeLessThan(0) // all downrange
  })

  it('is deterministic for a fixed seed across 20 trench steps', () => {
    let a = enterPhase(initialState(7), 'trench')
    let b = enterPhase(initialState(7), 'trench')
    for (let i = 0; i < 20; i++) {
      a = stepGame(a, NO_INPUT, 0.1)
      b = stepGame(b, NO_INPUT, 0.1)
    }
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/trench-obstacles.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/trench-obstacles'`.

- [ ] **Step 3: Implement the station table + state field**

```typescript
// src/core/trench-obstacles.ts
//
// Fidelity epic — the trench's wall content as ENTITIES: shootable turrets and
// wall squares, and catwalk hazards spanning the channel. Stations re-expressed
// from the ROM's obstacle records (docs/star-wars-1983-source-findings.md
// ## Trench catwalks, turrets & wall squares — off_7CC0 → off_7B1E..7BFE);
// scores from ## Scoring tables (byte_9853 turrets, byte_9850 squares).

import type { TrenchObstacle } from './state'
import { TRENCH_HALF_W } from './trench-channel'

export const TRENCH_TURRET_SCORE = 100 // PROVISIONAL(findings ## Scoring tables: byte_9853 = 0,1,0)
export const TRENCH_SQUARE_SCORE = 50 // PROVISIONAL(findings ## Scoring tables: byte_9850 = 0,0,$50)
/** Bolt-vs-obstacle proximity, world units — tuned near PORT_HIT_RADIUS. */
export const OBSTACLE_HIT_RADIUS = 90 // PROVISIONAL(findings ## Trench catwalks, turrets & wall squares)

const W = TRENCH_HALF_W
/** Downrange stations, cockpit → far. PROVISIONAL layout pending the decoded
 *  off_7B1E..7BFE records — alternating wall turrets, squares, one catwalk. */
export const TRENCH_OBSTACLE_STATIONS: readonly TrenchObstacle[] = [
  { kind: 'turret', pos: [-W, 60, -900] },
  { kind: 'square', pos: [W, 120, -1300] },
  { kind: 'turret', pos: [W, 60, -1700] },
  { kind: 'catwalk', pos: [0, 200, -2100] },
  { kind: 'square', pos: [-W, 120, -2500] },
  { kind: 'turret', pos: [-W, 60, -2900] },
  { kind: 'square', pos: [W, 120, -3300] },
  { kind: 'turret', pos: [W, 60, -3700] },
]

/** Fresh per-run copies (positions mutate as they scroll — never share). */
export function spawnTrenchObstacles(): TrenchObstacle[] {
  return TRENCH_OBSTACLE_STATIONS.map((o) => ({ kind: o.kind, pos: [...o.pos] }))
}
```

In `src/core/state.ts`, next to the `exhaustPort` field:

```typescript
/** A trench wall/channel entity: turrets and squares are shootable for score;
 *  catwalks are hazards (cockpit contact costs a shield). Scrolls with the
 *  channel like the exhaust port. Fidelity epic (findings ## Trench catwalks,
 *  turrets & wall squares). */
export interface TrenchObstacle {
  kind: 'turret' | 'square' | 'catwalk'
  pos: Vec3
}
```

Add to `GameState`: `trenchObstacles: TrenchObstacle[]` — and seed `trenchObstacles: [],` in `initialState()`.

In `src/core/events.ts`, add to the event union:

```typescript
  | { type: 'trench-obstacle-destroyed'; kind: 'turret' | 'square' }
```

- [ ] **Step 4: Wire spawn + step into the sim**

In `src/core/sim.ts` `enterPhase` (~line 507), alongside the port spawn:

```typescript
    trenchObstacles: phase === 'trench' ? spawnTrenchObstacles() : [],
```

In `stepTrench` (~line 396), after `base` is built, before the port logic:

```typescript
  // --- Trench obstacles: scroll with the channel; shoot turrets/squares; ---
  // --- catwalks crash the cockpit (findings ## Trench catwalks, turrets & wall squares)
  let bolts = base.projectiles
  let obstacleScore = 0
  const survivors: TrenchObstacle[] = []
  let crashedCatwalk = false
  for (const o of state.trenchObstacles) {
    const pos: Vec3 = [o.pos[0], o.pos[1], o.pos[2] + TRENCH_SCROLL_SPEED * dt]
    if (pos[2] > 0) continue // scrolled past the cockpit — despawn
    if (o.kind !== 'catwalk') {
      const hit = bolts.findIndex((b) => collides(pos, b.pos, OBSTACLE_HIT_RADIUS))
      if (hit >= 0) {
        bolts = bolts.filter((_, i) => i !== hit)
        obstacleScore += o.kind === 'turret' ? TRENCH_TURRET_SCORE : TRENCH_SQUARE_SCORE
        events.push({ type: 'trench-obstacle-destroyed', kind: o.kind })
        continue
      }
    } else if (collides(pos, COCKPIT, COCKPIT_HIT_RADIUS)) {
      crashedCatwalk = true
      events.push({ type: 'terrain-crash' })
      continue // crashed through it
    }
    survivors.push({ kind: o.kind, pos })
  }
  const afterObstacles: GameState = {
    ...base,
    projectiles: bolts,
    score: base.score + obstacleScore,
    trenchObstacles: survivors,
    ...(crashedCatwalk
      ? {
          lives: Math.max(0, state.lives - 1),
          gameOver: state.lives - 1 <= 0,
          mode: state.lives - 1 <= 0 ? ('gameover' as const) : state.mode,
        }
      : {}),
  }
```

Then replace every subsequent use of `base` in `stepTrench` with `afterObstacles` (the safe-hold return, the port-hit spread, the crash spread, and the final return), and replace `projectiles.findIndex` in the port check with `afterObstacles.projectiles.findIndex` so a consumed bolt can't also kill the port. Import `spawnTrenchObstacles`, `TRENCH_TURRET_SCORE`, `TRENCH_SQUARE_SCORE`, `OBSTACLE_HIT_RADIUS` from `./trench-obstacles` and `type TrenchObstacle` from `./state`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/core/trench-obstacles.test.ts && npm test`
Expected: new suite PASS; full suite PASS (512 + new). If `trench.test.ts` or `phase-progression.test.ts` assert exact state shapes, update them to include `trenchObstacles: []` — a mechanical, documented adjustment.

- [ ] **Step 6: Wireframe models + render**

In `src/core/models.ts`, re-express the obstacle shapes from the findings' `Object_3D_Data.asm` dump (provisional simple shapes until trued — each a small `Model3D` following the file's existing ring/edge idiom):

```typescript
/** Trench wall turret — a squat emplacement (findings ## Trench catwalks,
 *  turrets & wall squares; PROVISIONAL until Object_3D_Data true-up). */
export const TRENCH_TURRET: Model3D = {
  name: 'Trench Turret',
  vertices: [
    [-30, 0, -30], [30, 0, -30], [30, 0, 30], [-30, 0, 30], // base
    [-16, 44, -16], [16, 44, -16], [16, 44, 16], [-16, 44, 16], // cap
    [0, 44, 0], [0, 72, 0], // barrel
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
    [8, 9],
  ],
}

/** Trench wall square — the shootable panel (Obj_Trench_Squares). */
export const TRENCH_SQUARE: Model3D = {
  name: 'Trench Square',
  vertices: [[-40, -40, 0], [40, -40, 0], [40, 40, 0], [-40, 40, 0]],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
}

/** Trench catwalk — a girder spanning the channel (PROVISIONAL). */
export const TRENCH_CATWALK: Model3D = {
  name: 'Trench Catwalk',
  vertices: [
    [-256, -12, 0], [256, -12, 0], [256, 12, 0], [-256, 12, 0],
    [-256, -12, -24], [256, -12, -24], [256, 12, -24], [-256, 12, -24],
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ],
}
```

Register all three in the `MODELS` array. In `src/shell/render.ts`'s trench branch, after the wall-detail stroke:

```typescript
    for (const o of state.trenchObstacles) {
      const model =
        o.kind === 'turret' ? TRENCH_TURRET : o.kind === 'square' ? TRENCH_SQUARE : TRENCH_CATWALK
      drawWireframe(ctx, model, multiply(view, modelMatrix(o.pos, TRENCH_ORIENT)), proj, w, h, TURRET_GLOW)
    }
```

(`TURRET_GLOW` already exists for surface turrets; reuse it.)

- [ ] **Step 7: Scene preset + preset test**

In `src/core/scenePresets.ts`, add after `mid-run`:

```typescript
  { id: 'turret-alley', label: 'TURRET-ALLEY', hint: 'obstacles in range',
    state: { ...trenchAt(-1400), trenchObstacles: spawnTrenchObstacles().map((o) => ({ ...o, pos: [o.pos[0], o.pos[1], o.pos[2] + 600] as Vec3 })) } },
```

(imports: `spawnTrenchObstacles` from `./trench-obstacles`, `type Vec3` from `./math3d`). In `tests/core/scene-presets.test.ts`, add `'turret-alley'` to the expected-id assertions.

- [ ] **Step 8: True constants + stations against the findings doc**

Read `## Trench catwalks, turrets & wall squares` and `## Scoring tables`: replace the PROVISIONAL station layout with the decoded `off_7B1E..7BFE` records (positions/kinds), the scores with the decoded BCD values, and true the three models against the `Object_3D_Data.asm` dump. Update markers. Run: `npm test` — Expected: PASS (tests are name-based and table-shape-based).

- [ ] **Step 9: Eyeball, full verify, commit**

Run: `npm run dev` → `/scenes.html`: `turret-alley` shows turrets/squares on the walls and a catwalk spanning the channel.

```bash
npm test && npm run build
git add src/core/trench-obstacles.ts src/core/state.ts src/core/sim.ts src/core/events.ts src/core/models.ts src/core/scenePresets.ts src/shell/render.ts tests/core/trench-obstacles.test.ts tests/core/scene-presets.test.ts
git commit -m "feat: trench turrets, wall squares & catwalks — targetable scored entities per 1983 findings"
```

---

- [x] **Story 14-3 complete** — run `pf sprint story complete 14-3`

### Task 4: Exhaust-port fidelity + the force bonus + trench banners

**Files:**
- Modify: `src/core/state.ts` (add `trenchShotsFired: number` + `forceBonusAwardedAt: number | null`; constants `FORCE_BONUS`, `PORT_AHEAD_RANGE`)
- Modify: `src/core/sim.ts` (count trench shots; award the bonus on a clean port kill; reset both fields in `enterPhase`)
- Modify: `src/core/events.ts` (add `{ type: 'force-bonus'; amount: number }`)
- Modify: `src/core/models.ts` (true `EXHAUST_PORT` against the findings dump)
- Modify: `src/shell/render.ts` (trench banners: `EXHAUST PORT AHEAD`, `${FORCE_BONUS} FOR USING THE FORCE`)
- Modify: `src/core/scenePresets.ts` (`port-in-sight` preset gains `forceBonusAwardedAt` variant? No — add `force-bonus` preset showing the banner state)
- Test: `tests/core/force-bonus.test.ts`
- Modify: `tests/core/scene-presets.test.ts` (expect the new preset id)

**Interfaces:**
- Consumes: `stepTrench`'s port-hit path (`src/core/sim.ts:428-437`), the prologue's `{ type: 'fire' }` event in `common.events`; findings `## Exhaust port & run outcome` + `## HUD & framing`.
- Produces: `GameState.trenchShotsFired: number`, `GameState.forceBonusAwardedAt: number | null`, `FORCE_BONUS`, `PORT_AHEAD_RANGE` (exported from `src/core/state.ts`); event `{ type: 'force-bonus'; amount: number }`.

Rule (arcade): finishing the trench WITHOUT firing at anything before the port kill awards the force bonus — "X,XXX FOR USING THE FORCE". We track shots fired during the trench phase; a port kill with `trenchShotsFired <= 1` (the killing torpedo itself) awards `FORCE_BONUS` on top of `TRENCH_BONUS` and stamps `forceBonusAwardedAt = t` so the shell can show the banner across the wave transition.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/force-bonus.test.ts
import { describe, it, expect } from 'vitest'
import {
  initialState,
  FORCE_BONUS,
  TRENCH_BONUS,
  PORT_AHEAD_RANGE,
  PROJECTILE_TTL,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

/** A playing trench state with the port at `portZ` and a bolt already on it. */
function portKill(state: GameState): GameState {
  const port = state.exhaustPort!.pos
  return {
    ...state,
    mode: 'playing',
    projectiles: [{ pos: [port[0], port[1], port[2]], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
  }
}

describe('force bonus — using the Force in the trench', () => {
  it('enterPhase(trench) resets trenchShotsFired and forceBonusAwardedAt', () => {
    const dirty = { ...initialState(1983), trenchShotsFired: 9, forceBonusAwardedAt: 5 }
    const t = enterPhase(dirty, 'trench')
    expect(t.trenchShotsFired).toBe(0)
    expect(t.forceBonusAwardedAt).toBeNull()
  })

  it('counts shots fired while flying the trench', () => {
    const s0 = enterPhase(initialState(), 'trench')
    const s1 = stepGame({ ...s0, mode: 'playing' }, { ...NO_INPUT, fire: true }, 1 / 60)
    expect(s1.trenchShotsFired).toBe(1)
  })

  it('a clean port kill (no prior shots) awards TRENCH_BONUS + FORCE_BONUS and the event', () => {
    const s0 = { ...portKill(enterPhase(initialState(), 'trench')), trenchShotsFired: 0 }
    const s1 = stepGame(s0, NO_INPUT, 1 / 60)
    expect(s1.score).toBe(TRENCH_BONUS + FORCE_BONUS)
    expect(s1.forceBonusAwardedAt).not.toBeNull()
    expect(s1.events).toContainEqual({ type: 'force-bonus', amount: FORCE_BONUS })
  })

  it('a port kill after prior trench shots scores only TRENCH_BONUS', () => {
    const s0 = { ...portKill(enterPhase(initialState(), 'trench')), trenchShotsFired: 3 }
    const s1 = stepGame(s0, NO_INPUT, 1 / 60)
    expect(s1.score).toBe(TRENCH_BONUS)
    expect(s1.forceBonusAwardedAt).toBeNull()
    expect(s1.events.some((e) => e.type === 'force-bonus')).toBe(false)
  })

  it('PORT_AHEAD_RANGE and FORCE_BONUS are positive (banner/table sanity)', () => {
    expect(FORCE_BONUS).toBeGreaterThan(0)
    expect(PORT_AHEAD_RANGE).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/force-bonus.test.ts`
Expected: FAIL — `FORCE_BONUS`/`PORT_AHEAD_RANGE` not exported; `trenchShotsFired` undefined.

- [ ] **Step 3: Implement state + sim**

In `src/core/state.ts` near `TRENCH_BONUS` (line ~234):

```typescript
/** Awarded on top of TRENCH_BONUS for a port kill with no prior trench shots —
 *  "USING THE FORCE" (findings ## Exhaust port & run outcome). */
export const FORCE_BONUS = 5000 // PROVISIONAL(findings ## Scoring tables)
/** Port distance at which the EXHAUST PORT AHEAD banner shows (world units). */
export const PORT_AHEAD_RANGE = 1800 // PROVISIONAL(findings ## HUD & framing)
```

Add to `GameState` (with doc comments in the file's idiom): `trenchShotsFired: number` and `forceBonusAwardedAt: number | null`; seed `trenchShotsFired: 0, forceBonusAwardedAt: null,` in `initialState()`.

In `src/core/sim.ts`:
- `enterPhase`: add `trenchShotsFired: 0, forceBonusAwardedAt: null,` to the phase-entry spread (every phase resets them, like `trenchScrollZ`).
- `stepTrench`, in `base`: `trenchShotsFired: state.trenchShotsFired + (events.some((e) => e.type === 'fire') ? 1 : 0),`
- The port-hit branch (line ~430) becomes:

```typescript
  if (hitBolt >= 0) {
    const liveBolts = afterObstacles.projectiles.filter((_, i) => i !== hitBolt)
    const clean = afterObstacles.trenchShotsFired <= 1 // only the killing torpedo
    const bonus = TRENCH_BONUS + (clean ? FORCE_BONUS : 0)
    if (clean) events.push({ type: 'force-bonus', amount: FORCE_BONUS })
    events.push({ type: 'level-clear', next: 'space' })
    return clearRun({
      ...afterObstacles,
      projectiles: liveBolts,
      score: state.score + bonus,
      forceBonusAwardedAt: clean ? t : null,
    })
  }
```

Note: `clearRun` → `enterPhase` would reset the just-stamped `forceBonusAwardedAt` (phase entry resets it like `trenchScrollZ`). Fix in `clearRun` (sim.ts ~line 542): re-stamp it after the spread so the award survives into the next wave for the banner:

```typescript
  return { ...enterPhase(s, 'space'), wave: s.wave + 1, forceBonusAwardedAt: s.forceBonusAwardedAt }
```

In `src/core/events.ts`, add to the union:

```typescript
  | { type: 'force-bonus'; amount: number }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/force-bonus.test.ts && npm test`
Expected: both PASS. `trench.test.ts` port-kill assertions that check exact score may need the `trenchShotsFired` seed set (test states built via `enterPhase` start at 0 — a fresh kill with a hand-seeded bolt counts as clean and now also awards FORCE_BONUS; update those expected scores to `TRENCH_BONUS + FORCE_BONUS` or seed `trenchShotsFired: 2`). Document each adjustment in the commit body.

- [ ] **Step 5: Trench banners in the shell**

In `src/shell/render.ts`, add a banner block inside the playing-HUD branch (next to `drawHudHeader`), using the existing `BANNER_FONT`/`glowText` idiom:

```typescript
const FORCE_BANNER_SECONDS = 3 // banner dwell after the award

function drawTrenchBanners(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.font = BANNER_FONT
  ctx.textAlign = 'center'
  if (
    state.phase === 'trench' &&
    state.exhaustPort &&
    -state.exhaustPort.pos[2] <= PORT_AHEAD_RANGE
  ) {
    glowText(ctx, 'EXHAUST PORT AHEAD', w / 2, h * 0.22, '#dddddd', 14)
  }
  if (state.forceBonusAwardedAt !== null && state.t - state.forceBonusAwardedAt <= FORCE_BANNER_SECONDS) {
    glowText(ctx, `${FORCE_BONUS.toLocaleString('en-US')} FOR USING THE FORCE`, w / 2, h * 0.16, '#dddddd', 12)
  }
  ctx.textAlign = 'left'
}
```

Call it after `drawHudHeader(ctx, state, w, h)` in `render()`. Import `PORT_AHEAD_RANGE`, `FORCE_BONUS` from `../core/state`.

- [ ] **Step 6: True EXHAUST_PORT + constants against the findings doc**

Read `## Exhaust port & run outcome` + `## Scoring tables` + the `Object_3D_Data.asm` dump: true the `EXHAUST_PORT` model in `src/core/models.ts`, the `FORCE_BONUS`/`PORT_AHEAD_RANGE` values, and the banner copy (exact arcade wording/position per `## HUD & framing`). Update PROVISIONAL markers. Run: `npm test`.

- [ ] **Step 7: Scene preset + eyeball**

In `src/core/scenePresets.ts` add:

```typescript
  { id: 'force-bonus', label: 'FORCE-BONUS', hint: 'clean run banner',
    state: { ...trenchAt(-600), forceBonusAwardedAt: 0 } },
```

Add `'force-bonus'` to `tests/core/scene-presets.test.ts` expected ids. Run `/scenes.html`: `port-in-sight` shows `EXHAUST PORT AHEAD`; `force-bonus` shows the force banner.

- [ ] **Step 8: Full verify and commit**

```bash
npm test && npm run build
git add src/core/state.ts src/core/sim.ts src/core/events.ts src/core/models.ts src/core/scenePresets.ts src/shell/render.ts tests/core/force-bonus.test.ts tests/core/scene-presets.test.ts
git commit -m "feat: exhaust-port fidelity — force bonus, trench banners, authentic port per 1983 findings"
```

---

- [x] **Story 14-4 complete** — run `pf sprint story complete 14-4`

### Task 5: HUD/framing fidelity — wireframe shield gauge + arcade palette

**Files:**
- Modify: `src/shell/render.ts` (`drawHudHeader`, `drawShieldMeter` → arcade layout; trench glow color)
- Modify: `src/core/hud.ts` (formatters if the arcade layout needs new ones — e.g. zero-padded score groups)
- Test: `tests/core/hud.test.ts` (formatter additions only — shell layout is eyeballed)

**Interfaces:**
- Consumes: findings `## HUD & framing` (layout: SCORE red top-left, segmented wireframe SHIELD gauge top-center with numeral, WAVE top-right) and `## Colors & intensities` (per-phase palette — the trench reads green in the cabinet); existing `glowText`/`glowLine` helpers and `formatScore`/`formatLives`/`formatWave` from `src/core/hud.ts`.
- Produces: reworked `drawHudHeader`/`drawShieldMeter` (same signatures — internal layout change only); `TRENCH_GLOW` color constant in `src/shell/render.ts` replacing `SURFACE_GLOW` for the trench-phase strokes.

- [ ] **Step 1: Write the failing formatter test (only if the findings demand a new format)**

Read findings `## HUD & framing` first. If the arcade shows scores in grouped digits (e.g. `12,066`), add to `tests/core/hud.test.ts`:

```typescript
  it('formatScore groups thousands per the 1983 HUD (findings ## HUD & framing)', () => {
    expect(formatScore(12066)).toBe('12,066')
    expect(formatScore(0)).toBe('0')
  })
```

If the current format already matches the findings, skip Steps 1–3 and note "formatters already faithful" in the commit body.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/hud.test.ts`
Expected: FAIL on the new assertion (current formatter differs).

- [ ] **Step 3: Update the formatter in `src/core/hud.ts`**

```typescript
/** Score exactly as the 1983 HUD shows it (findings ## HUD & framing). */
export function formatScore(score: number): string {
  return score.toLocaleString('en-US')
}
```

Run: `npx vitest run tests/core/hud.test.ts` — Expected: PASS.

- [ ] **Step 4: Rework the HUD header to the arcade layout**

In `src/shell/render.ts`, rework `drawHudHeader` and `drawShieldMeter` per findings `## HUD & framing`, keeping signatures and the `glowText`/`glowLine` idiom. Target layout (true exact positions/copy against the findings):

```typescript
// Palette per findings ## Colors & intensities:
const HUD_SCORE_COLOR = '#ff3b30' // PROVISIONAL — cabinet score red
const HUD_SHIELD_COLOR = '#33ff66' // PROVISIONAL — cabinet gauge green
const TRENCH_GLOW = '#33ff66' // PROVISIONAL — trench wireframe green

function drawHudHeader(ctx: CanvasRenderingContext2D, state: GameState, w: number, _h: number): void {
  const margin = Math.round(w * HUD_MARGIN_FRAC)
  ctx.textBaseline = 'alphabetic'
  ctx.font = HUD_FONT
  // Left: SCORE label over the value, cabinet red.
  ctx.textAlign = 'left'
  glowText(ctx, 'SCORE', margin, HUD_ROW1_Y, HUD_SCORE_COLOR, 10)
  glowText(ctx, formatScore(state.score), margin, HUD_ROW2_Y, HUD_SCORE_COLOR, 10)
  // Right: WAVE, cabinet red.
  ctx.textAlign = 'right'
  glowText(ctx, `${formatWave(state.wave)} WAVE`, w - margin, HUD_ROW1_Y, HUD_SCORE_COLOR, 10)
  // Center: the segmented wireframe shield gauge with its numeral.
  drawShieldMeter(ctx, state, w)
  ctx.textAlign = 'left'
  ctx.letterSpacing = '0px'
  ctx.shadowBlur = 0
}

function drawShieldMeter(ctx: CanvasRenderingContext2D, state: GameState, w: number): void {
  // The cabinet gauge: a wireframe trapezoid strip of STARTING_LIVES segments,
  // one tick per remaining shield, the count as a numeral beneath, label SHIELD.
  const segW = 22
  const gaugeW = STARTING_LIVES * segW
  const x0 = Math.round(w / 2 - gaugeW / 2)
  const y = HUD_METER_Y
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = HUD_SHIELD_COLOR
  ctx.shadowColor = HUD_SHIELD_COLOR
  ctx.shadowBlur = 8
  ctx.lineWidth = 1.5
  for (let i = 0; i < STARTING_LIVES; i++) {
    ctx.strokeRect(x0 + i * segW, y, segW - 3, HUD_METER_H)
    if (i < state.lives) {
      // lit segment: an inner tick
      ctx.beginPath()
      ctx.moveTo(x0 + i * segW + (segW - 3) / 2, y + 1)
      ctx.lineTo(x0 + i * segW + (segW - 3) / 2, y + HUD_METER_H - 1)
      ctx.stroke()
    }
  }
  ctx.restore()
  ctx.font = HUD_FONT
  ctx.textAlign = 'center'
  glowText(ctx, `${state.lives}`, w / 2, y + HUD_METER_H + 16, HUD_SHIELD_COLOR, 8)
  glowText(ctx, 'SHIELD', w / 2, y + HUD_METER_H + 34, HUD_SHIELD_COLOR, 8)
  ctx.shadowBlur = 0
}
```

Swap the two trench-phase `drawWireframe(…, SURFACE_GLOW)` calls (channel + detail) to `TRENCH_GLOW`. Remove now-unused pieces (`HUD_METER_FRAC`, `formatShield`/`formatLevel` imports) ONLY if nothing else consumes them — `noUnusedLocals` will tell you.

- [ ] **Step 5: True palette + layout against the findings**

Read `## Colors & intensities` + `## HUD & framing`; true the three color constants, positions, and label copy. Replace PROVISIONAL markers.

- [ ] **Step 6: Eyeball on the scene sheet**

Run: `/scenes.html` — every trench preset now shows the arcade header (red SCORE/WAVE, green segmented SHIELD gauge) over a green corridor. Compare against the cabinet still.

- [ ] **Step 7: Full verify and commit**

```bash
npm test && npm run build
git add src/shell/render.ts src/core/hud.ts tests/core/hud.test.ts
git commit -m "feat: arcade-faithful trench HUD — segmented wireframe shield gauge, cabinet palette per 1983 findings"
```

---

- [x] **Story 14-5 complete** — run `pf sprint story complete 14-5`

### Task 6: Live playtest capstone (absorbs canceled story 13-3's ACs)

**Files:**
- Modify: `docs/superpowers/plans/2026-07-02-sw-1983-findings-and-trench-fidelity.md` (this file — record pass/fail notes inline below)

**Interfaces:**
- Consumes: everything Tasks 2–5 shipped; the dev phase-jump (key `9` jumps to the trench — `src/shell/input.ts` / story 11-4).
- Produces: a signed-off fidelity epic, or follow-up bug stories.

- [x] **Step 1: Serve and reach the trench in a live run**

```bash
npm run dev   # http://localhost:5274/star-wars/
```

Start a run, press `9` to jump to the trench phase. Play at least two full trench passes (one clean/no-fire, one shooting obstacles).

**PASS.** Reused the already-running dev server on `:5274` (this checkout's tunnelled instance). Drove the live page with Playwright MCP (`browser_navigate`/`browser_evaluate`/`browser_take_screenshot`/`browser_console_messages`), reading `src/shell/input.ts` and `src/main.ts` first to confirm controls: `Enter`/`Digit1` starts a run (edge-triggered `pendingStart`), `Digit9` dev-jumps straight to the trench (`import.meta.env.DEV`-gated, works from any mode), `Space`/pointerdown fires, and the mouse position maps to `aimX`/`aimY` (default `(0,0)` — dead centre — until a `pointermove` fires). Played well over two full trench passes: a clean pass (zero shots until a single centred kill-shot), a combative pass (four precision-timed shots at two turrets, one square, and the port), and two dedicated isolation passes (one to isolate the port-crash shield cost, one to isolate the catwalk hazard). All 10 trench entries logged `[dev] phase-jump → trench` with no console errors.

Operational note for future live playtests of this game: the automated tab only advances its `requestAnimationFrame`-driven sim while the tool session is actively dispatching to it. Passive waiting (a bare `sleep` between calls, or a `browser_evaluate` that only `setTimeout`s with no dispatched events) left the corridor frozen at its entry frame indefinitely, while a `browser_evaluate` that opens with a couple of real `keydown`/`keyup` dispatches (e.g. the `Enter`,`Enter` warm-up before `Digit9`) reliably kept the sim ticking in real time for the rest of that call, including multi-second internal waits. All timed action sequences below route through that pattern — one `browser_evaluate` call performing the whole timed sequence (dispatch → wait → dispatch → screenshot immediately after), never a bare cross-call sleep — after an early test relying on cross-call sleeps left the run idling in the space phase and drained all 6 lives to a real `GAME OVER` before the next screenshot even fired.

- [x] **Step 2: Corridor integrity across real frames (13-3 AC1)**

Confirm the corridor + wall detail render identically to `/scenes.html`'s static presets across continuously-advancing frames — no popping, tearing, or visible seam at the scroll-recycle boundaries (`RIB_Z` for the channel, `PANEL_Z` for the detail). Record: PASS/FAIL + notes.

**PASS.** Captured the live corridor at multiple distinct scroll depths within a single continuous trench entry (`t≈0s`, `t≈0.6s`, `t≈2s` — screenshots `02-trench-entry-clean-t0.png`, `17-corridor-t0.6s.png`, `16-corridor-recipe-retry.png`), each showing the obstacle stations (turrets/squares/catwalk) at correspondingly different, monotonically-closer downrange positions with clean, continuous wall-panel/rib geometry — no popping, tearing, z-fighting, or missing/duplicate segments at any sampled frame. Cross-checked against the static `/scenes.html` contact sheet (`19-scenes-html-large.png`, all 5 presets: TRENCH-ENTRY, MID-RUN, TURRET-ALLEY, PORT-IN-SIGHT, FORCE-BONUS) at a larger viewport — the live frames match the static presets' rib density, panel spacing, obstacle wireframe styling, and HUD compositing exactly. No discrepancy between the live continuously-scrolling render and the static single-frame renders.

- [x] **Step 3: Combat + scoring in the live loop (13-3 AC2 + fidelity)**

- A bolt on the exhaust port clears the run and awards `TRENCH_BONUS` (+`FORCE_BONUS` on the clean pass — banner shows).
- Shooting a turret/square destroys it and scores; a catwalk collision costs one shield; the port reaching the cockpit un-destroyed costs one shield.
Record: PASS/FAIL + notes.

**PASS on 3 of 4 sub-checks; FAIL on the catwalk.**
- *Port kill + bonus:* PASS. A single centred shot (default `aimX=aimY=0`, fired before the port's ~4.8s auto-crash) cleared the run; live SCORE read exactly `6,000` = `TRENCH_BONUS`(1000, `src/core/state.ts`) + `FORCE_BONUS`(5000) on a clean pass (0 prior shots), and WAVE advanced 1→2 (screenshot `06-force-banner-attempt2.png`, which also shows the "USE THE FORCE 5,000" banner live).
- *Turret/square destroy + score:* PASS. Precision-timed shots (computed live in-page from `aimDirection`'s exact geometry — `f=1/tan(FOV_Y/2)`, target-intercept solved per shot) landed on two turrets, one square, and the port in one combative pass; live SCORE delta was exactly `1,250` = `TRENCH_TURRET_SCORE`(100)×2 + `TRENCH_SQUARE_SCORE`(50) + `TRENCH_BONUS`(1000) (screenshot `07-combative-result.png`), confirming all four aimed shots connected and scored correctly (non-clean, so no force bonus, as expected with 4 shots fired).
- *Port-reaching-cockpit costs a shield:* PASS. Let a fresh 6-shield pass run unaddressed through one full port approach (~4.8s) — shields dropped exactly 6→5, port respawned for "another pass" down the trench, no `gameOver` (screenshot `04-clean-pass-result.png`, taken right after).
- *Catwalk collision costs a shield:* **FAIL.** Confirmed live and by code: the catwalk station spawns at `(0, 200, -2100)` (`src/core/trench-obstacles.ts`) and only its `z` advances as it scrolls (`src/core/sim.ts` `stepTrench`); its hazard check is `collides(pos, COCKPIT, COCKPIT_HIT_RADIUS)` with `COCKPIT=[0,0,0]` and `COCKPIT_HIT_RADIUS=80` (`src/core/state.ts`). The closest the catwalk can ever get is `z=0`, giving distance `sqrt(200²+0²)=200` — always `>80` — so the crash branch can never fire. Verified live: fresh trench entry, zero shots fired, checkpoint at `t=4.5s` (strictly after the catwalk's own ~4.2s crossing of `z=0`, strictly before the port's ~4.8s crash) — the isolation screenshot showed shields at 5 (one port-crash cycle had already elapsed before capture); the catwalk contributes zero shield loss, and the FAIL verdict rests on the static geometric analysis (`y=200` vs `COCKPIT_HIT_RADIUS=80`), verified in code (screenshot `09-catwalk-isolation-test.png`). Filed as follow-up story **14-7** (below) — this is exactly the kind of collision-over-time bug the static `/scenes.html` single-frame sheet could not have caught.

- [x] **Step 4: HUD/banner compositing in the real loop (13-3 AC3)**

Confirm the arcade HUD header, `EXHAUST PORT AHEAD`, the force banner, crosshair, and lock-on compose correctly over the corridor in live play (not just the single static render() of the sheet). Record: PASS/FAIL + notes.

**PASS.** Across the captured live frames: the arcade HUD header (red SCORE/WAVE labels, green live digits, segmented trapezoid shield gauge) renders correctly on every frame; `EXHAUST PORT AHEAD` composes correctly over the moving corridor once the port is in range (screenshots `02`, `09`, `16`, `17`); the "USE THE FORCE 5,000" force banner composes correctly over the post-clear space-phase scene alongside a live lock-on ring around a TIE fighter and the crosshair (screenshot `06-force-banner-attempt2.png`) — confirming banner, crosshair, and lock-on all compose correctly together, not just individually on a static sheet render.

- [x] **Step 5: Console + pacing check (13-3 AC4)**

DevTools console: zero errors/warnings across a full trench run. Frame pacing looks smooth (informal, not benchmarked). Record: PASS/FAIL + notes.

**PASS.** `browser_console_messages` (debug level, whole session) reported **0 errors, 0 warnings** across the entire live playtest — 10 trench entries, multiple full runs, resets, and two genuine `GAME OVER`s; the only log lines are the two Vite HMR connect messages and 10 `[dev] phase-jump → trench` lines, one per `Digit9` press. (An `all:true` query surfaced *stale* errors — `TRENCH is not defined`, `drawTrenchBanners is not defined`, etc. — from a pre-existing HMR session on this reused tab, timestamped well before this navigation's cache-busted module URLs; scoped to the current navigation only, those are absent.) Frame pacing: informal, but the four precision-timed combative shots (`831ms`, `1618ms`, `2707ms`, `4407ms` after trench entry — see the report) were computed assuming an exact, undrifted 60Hz fixed-timestep and all four landed within their 90–120-unit hit radii; that would not happen if the loop were stuttering or drifting, so pacing reads as smooth.

- [x] **Step 6: Sign off (13-3 AC5)**

Write the pass/fail notes under this step in this plan file. If the live run reveals an issue the static sheet could not catch, file it as a follow-up bug story via `pf sprint story add` before signing off.

**Sign-off:** Steps 1, 2, 4, 5 PASS. Step 3 PASS on 3 of 4 sub-checks (port kill + force bonus, turret/square destroy-and-score, port-crash shield cost); FAIL on the catwalk hazard (never costs a shield — geometrically unreachable collision check, confirmed above). Filed follow-up bug **story 14-7** — "Trench catwalk hazard never costs a shield (COCKPIT_HIT_RADIUS < catwalk y-offset)" (2pts, p2, `sprint/epic-14.yaml`) — with full repro and a fix-direction note, rather than patching game code from this verification task. Per the brief, a FAIL on one check does not block this sign-off commit. Full step-by-step detail, all 19 screenshots, and the console transcript are in `.superpowers/sdd/task-6-report.md`.

```bash
git add docs/superpowers/plans/2026-07-02-sw-1983-findings-and-trench-fidelity.md
git commit -m "docs: trench fidelity live-playtest sign-off (absorbs 13-3 ACs)"
```

---

- [ ] **Story 14-6 complete** — run `pf sprint story complete 14-6`

## Self-review notes

- **Spec coverage:** Task 1 → spec "Story 1 — extraction"; Task 2 → "Trench geometry fidelity"; Task 3 → "Catwalks + wall turrets as entities" (+ the ROM's shootable squares, which the spec's scoring anchors imply); Task 4 → "Exhaust-port gameplay fidelity"; Task 5 → "HUD/framing fidelity"; Task 6 → "Live playtest capstone". Presets extended in Tasks 3–4 per the spec's acceptance-surface clause.
- **Known test-suite touchpoints:** Task 3/4 may require mechanical updates to `trench.test.ts` / `phase-progression.test.ts` where exact-state or exact-score assertions exist — each such change is called out in its step and must be documented in the commit body.
- **PROVISIONAL discipline:** every ROM-derived value has a named constant, a `PROVISIONAL(findings §…)` marker, and a mandatory true-up step before its task's commit.
