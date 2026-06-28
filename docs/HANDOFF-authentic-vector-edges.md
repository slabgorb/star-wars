# HANDOFF — Authentic vector-model edges (star-wars), via external extraction (option #2)

**Written:** 2026-06-28, end of a long session. Read this top-to-bottom before doing anything.

## TL;DR

The star-wars vector models have **authentic vertices** (ported from the cabinet
ROM) but **hand-authored, approximate edges** — because the real line-segment
connectivity is NOT in the disassembly we have. The task is to source the
**authentic edge connectivity** from an external authoritative extraction of the
Atari 1983 *Star Wars* arcade vector objects, map it onto our vertex indices, and
replace the guessed edges in `src/core/models.ts`. Verify every model visually in
the `/models.html` contact sheet.

## Why we're here (the core finding — don't re-derive it)

- `reference/` (GITIGNORED — copyrighted disassembly, never commit) contains the
  main-board 6809 disassembly. `reference/disasm/Object_3D_Data.asm` has authentic
  **vertex tables only** (`fdb x,y,z` triples; leading `fdb 0,0,0` is the object
  anchor and is dropped): `Obj_Tie_Fighter` = 52 pts, `Obj_Darth_Tie` = 56 pts,
  `Obj_Trench_Squares` = 8 pts (all y=0, i.e. FLAT), `Object_8` = Death Star
  surface relief, `Object_10..21` = towers / trench-scene pieces, etc.
- The **connectivity (edges) is absent** from our files:
  1. `StarWars.asm` header lists a **separate Vector ROM `136021.105` at
     `$3000–$3FFF`** holding the AVG vector data — and that ROM is **not in our
     dump** (we have program ROMs `$6000–$FFFF` + Math Box only). No TIE/trench
     vertex values or `Obj_*` labels appear anywhere in `StarWars.asm`.
  2. 3D objects are drawn at runtime: the 6809 streams each vertex through the
     Math Box (→ `Math_XT2/YT2`, `$5040`), then emits AVG vectors and triggers
     `EVGGO` (`$4600`). The "which vertex connects to which" is logic/data inside
     that draw routine, not a liftable table.
- So `models.ts`'s long-standing note — edges "are not recoverable by object name
  from the disassembly we have" — is **correct**. Every edge list is a guess.
- The `/models.html` contact sheet (built this session) proved this matters: the
  TIEs rendered as a **box** under the prior "close every derived ring" test
  contract, which is geometrically wrong for them (their derived rings are
  cross-panel quads). See memory `starwars-tie-edges-no-cabinet-data`.

## The goal (option #2)

Replace hand-authored edges with **authentic connectivity from an external source**:

1. **Find the source.** Best candidates:
   - **MAME** — the `starwars` driver + its `mathbox` device, and especially the
     **vector ROM `136021.105`**. The vector ROM + the 3D draw code encode the
     real connectivity. (Disassembling/decoding the vector ROM is the most
     authoritative route.)
   - Hobbyist / preservation **3D-model reconstructions** of the SW arcade objects
     (point + line lists). `reference/README.md` notes the disassembly traces to
     "wardclan" AVG tooling (site now offline) — look for mirrors.
2. **Map to OUR vertex indices.** Critical: any external source must be aligned to
   our index order (= `Object_3D_Data.asm` order with the anchor dropped, so our
   index `0` = the ROM's 2nd `fdb`). **Match by vertex COORDINATES, never trust
   external point numbering.** Write a small script to align coordinate sets.
3. **Replace edges** in `src/core/models.ts` for `TIE_FIGHTER`, `DARTH_TIE`, and
   re-check `DEATH_STAR_SURFACE` / `SURFACE_TOWER` / `TRENCH` / `EXHAUST_PORT`
   against authentic data too (those were also hand-authored / ring-reconstructed).
4. **Verify visually** in the contact sheet for every model (the whole point —
   CI cannot catch valid-but-wrong geometry).

## Current git state (verified at handoff)

- Repo: `star-wars` (origin `github.com/slabgorb/star-wars`, default `develop`, gitflow).
- Branch: **`feat/8-10-reauthor-tie-darth-tie-edges`**, working tree **CLEAN**.
- Commits on the branch (newest first):
  - `fb66f59` `feat(contact-sheet)`: 3/4 view tilt (flat models no longer edge-on)
  - `aa1a445` `fix(8-10)`: **current** TIE edges re-authored BY STRUCTURE (hand-authored);
    topology guard switched from ring-closure → `isSingleComponent`
  - `f1f96cd` merge develop (brings the contact sheet onto this branch)
  - `74c78f9` box green — **SUPERSEDED** (the ring-closure approach that boxed the TIEs; kept in history)
  - `f9c3499` RED topology tests (8-10)
- `origin/develop` = `8f38750` (contact sheet, PR #9, already merged).
- ⚠️ **Local `develop` is 3 commits ahead of origin** with an unpushed BAD "box"
  merge. Harmless as long as you **never push local develop**. Resetting it via
  `git branch -f develop origin/develop` was blocked by the pf protected-branch
  hook this session — leave it, or reset through the pf workflow. Just don't push it.
- No stashes. Tests: **194/194 green** (`npm test`).
- Both TIEs currently (hand-authored): single connected component, 0 orphans,
  Y-symmetric (TIE_FIGHTER 52v/96e, DARTH_TIE 56v/104e).

## Tools

- **Contact sheet (verification tool):** `src/tools/contactSheet.ts` → `/models.html`.
  Grid of all `MODELS` through the REAL render pipeline. `[G]` toggles fit/gameplay
  scale, `[Space]` pauses, fixed 3/4 view tilt. Serve:
  `cd star-wars && npm run dev -- --port 5999 --strictPort`
  (5274 is owned by another checkout). Open `http://localhost:5999/star-wars/models.html`.
  The Chrome extension is NOT connected — screenshot via the **Playwright MCP**
  tools (navigate + browser_take_screenshot, then Read the PNG).
- **Connectivity check:** a throwaway `node` script (`/tmp/conn-check.mjs` —
  likely gone after context clear; re-create) parses the edges arrays and runs
  union-find to report connected-components + orphan vertices per model.
- **Memory (auto-loaded):** `starwars-tie-edges-no-cabinet-data`,
  `contact-sheet-previews-vector-models`.

## Topology tests — keep the revised contract

`tests/core/models.test.ts`: the TIE guards were changed from "every derived ring
closes" (boxes them) to **`isSingleComponent`** connectivity; universal
**no-orphan-vertices** and **bilateral Y-symmetry** suites cover the rest. When
authentic edges land:
- They should still be a single component with no orphans.
- **Y-symmetry may NOT hold** for real data — if authentic edges break the
  bilateral-symmetry assertion, that's expected; relax/adjust that test rather than
  bending the authentic edges to satisfy it.
- Don't reintroduce the ring-closure guard for the TIEs.

## Open items (not done — decide later)

- **TIE orientation ("strange axis"):** panels are on the Y axis (top/bottom) in
  object space; the iconic left/right needs a `TIE_ORIENT` rotation in `render.ts`
  (game) mirrored in the contact sheet. Separate RENDER task; NOT started.
- **Trench "walls":** the ROM trench object is genuinely flat. Walls/relief in the
  real game come from the surrounding Death Star **surface** object, not the trench
  floor — this is scene composition in the render/trench-run code, not a trench
  MODEL edit. Don't add fake walls to `Obj_Trench_Squares`.
- **Branch hygiene at finalize:** the 8-10 geometry (`aa1a445`) and the
  contact-sheet tilt (`fb66f59`) are SEPARATE concerns sharing this branch. Split
  on merge: 8-10 geometry → its own PR to develop; contact-sheet tilt → develop.
- **Story 8-10 is mid-flight** (workflow tdd, green phase). Session file
  `.session/8-10-session.md`. The topology APPROACH changed (ring-closure →
  connectivity) — a spec deviation worth a TEA/Architect note if finishing via pf.
  Authentic edges (#2) arguably make 8-10 a bigger story than originally scoped.

## First steps next session

1. `cd star-wars && git status` — confirm on `feat/8-10`, tree clean. Don't push local develop.
2. `npm test` (expect 194/194).
3. Serve on 5999, open the contact sheet, screenshot via Playwright to see the current (hand-authored) state.
4. Research authentic SW arcade vector connectivity — start with MAME's `starwars`
   driver + the vector ROM `136021.105`; then preservation/hobbyist model extractions.
5. Map external data to our vertex indices BY COORDINATE; replace edges in
   `models.ts`; verify each model in the contact sheet + `npm test`.
