# Star Wars 1983 source findings + trench-run fidelity — design

**Date:** 2026-07-02 · **Status:** approved (brainstorm with boss)
**Supersedes/extends:** `2026-07-01-trench-run-render-eval-and-rebuild-design.md`
(the eval harness that *revealed* this gap)

## Problem

Story 13-1's scene contact sheet (`/scenes.html`) works — and did exactly its
job: it showed that the trench-run scene is far below the fidelity of the 1983
arcade original. Side-by-side with a cabinet screenshot:

| Dimension | Arcade (1983) | Ours today |
|---|---|---|
| Wall surface | Panelled walls with recessed window/block detail | 4 rails + bare ribs (a cage) — `trenchChannel()` |
| Wall content | Catwalks and red/blue laser turrets, targetable | none |
| Exhaust port | Distinct end-of-run target, "EXHAUST PORT AHEAD" banner | generic ring |
| HUD | Wireframe SHIELD gauge, score+bonus, force-bonus messaging | "SHIELDS 6" text + generic crosshair |
| Palette | Predominantly green wireframe trench | blue/cyan |

**Chosen scope (boss decision): render + gameplay fidelity.** The walls get
real detail, the catwalks/turrets become targetable scored entities, the
exhaust-port hit-test is verified in a live run. Not render-only decoration.

## Approach — the tempest playbook, whole-game extraction first

Tempest faced the same problem (authoritative source material too raw and
gitignored to cite) and solved it with an extraction pass that distilled the
source into a committed findings doc (`tempest/docs/tempest-1981-source-findings.md`),
which then fed a whole fidelity epic (VGMSGA font, authentic explosions,
Superzapper flash — tempest epic 10). We repeat that here.

**Boss decision (approach B): the extraction covers the whole 1983 game**, not
just the trench — space wave, surface, trench, framing/HUD, sound hooks — like
tempest's whole-book doc. Implementation in this epic remains **trench-only**;
the other sections are future-value reference.

Why a committed doc instead of reading the disassembly ad-hoc per story:

1. **Checkout portability.** `reference/` is gitignored and currently exists
   only in the `a-3` sibling checkout — the exact failure mode that produced
   the epic-11/13 corridor discrepancy. A committed doc survives the shuffle.
2. **Auditability.** Every fidelity story cites doc sections, not a 40k-line
   listing only one machine has.
3. **Authority.** Palette, turret behavior, scoring, and HUD layout get
   answered from the ROM rather than guessed from screenshots.

## Epic structure & sequencing

**New epic (14): "Star Wars 1983 source findings + trench-run fidelity."**
Epic 13's remaining scope stays as declared (eval harness + verification).

- **13-1 (`in_review`) merges first** and closes its scope; the merge gate
  blocks new story work until then.
- **13-3's dependency is dead** (`depends_on: 13-2`, canceled). Re-scope: 13-3
  is superseded by the live-playtest **capstone story of epic 14**. Playtesting
  the current thin corridor, then re-playtesting after fidelity lands, would
  verify throwaway state twice. The capstone absorbs 13-3's ACs (seam/recycle
  check, port hit-test, HUD compositing, console-clean run).

## Story 1 — whole-game source extraction → committed findings doc

**Input.** Copy `reference/` from the `a-3` checkout into this one. It stays
gitignored — a local learning quarry, exactly like tempest's `docs/rom/`.
Provenance and licensing stance per `reference/README.md`: we *read* the
disassembly and re-express recovered data as our own TypeScript; we never
commit or redistribute it.

**Method.** The proven tempest cadence: parallel extraction agents, each
assigned a line-range/subsystem of `disasm/StarWars_annotated.lst` (40,047
lines, ~4000 hand comments) plus the small maps (`Object_3D_Data.asm`,
`Memory_Locations.asm`, `Direct_Page.asm`, `SW_M_Hi.asm`) and `disasm/sound/`.
Each agent pulls labels, addresses, data tables, constants, and algorithms for
its range.

**Output.** `docs/star-wars-1983-source-findings.md` — committed, structured
like the tempest findings doc:

- coverage table mapping listing regions → our code
  (`core/sim.ts`, `core/trench-channel.ts`, `shell/render.ts`, …)
- one section per subsystem: space wave / TIEs · Death Star surface + towers ·
  **trench run** (depth priority) · exhaust port + run outcome · scoring ·
  HUD/framing (shield gauge, banners, colors) · sound hooks (documented only)
- ⚠︎ flags on transcription/annotation suspects, and an "open follow-ups"
  list keyed to our code

**Known trench anchors** (initial probe of the listing; these seed and prove
the extraction):

| Symbol / address | Annotation |
|---|---|
| `sub_703B` | Trench viewpoint calc; X min/max + Y top/bottom limits nearby (`loc_705B`, `$70A4`) |
| `off_7CC0` → `off_7B1E..7BFE` | Trench catwalk/turrets data (≥8 records; code scans to `off_7CC0+$16`) |
| `sub_CCFC` / `sub_CD08` | Trench floor lines / side vertical lines calcs |
| `sub_CD38` / `sub_CD44` | Trench left / right side turret calcs |
| `byte_9850` = `0,0,$50` | Trench green squares score value |
| `byte_9853` = `0,1,0` | Trench turrets score value |
| `sub_8341` / `sub_83A4` / `sub_8408` | Entering / starting / drawing trench |
| `Obj_Trench_Squares` | Trench squares model data (`Object_3D_Data.asm`) |

**Caveat:** several annotations are hypotheses (e.g. *"Trench catwalk/turrets
data?"* — question mark in the source). Treat comments as leads; verify by
tracing the code and cross-checking the un-annotated `StarWars.asm` before
baking any number into the clone.

## Stories 2–N — trench fidelity implementation (keyed to findings)

Sketch; the PM firms splits/points once the findings doc exists:

| Story | Scope | Layer |
|---|---|---|
| Trench geometry fidelity | Extend/replace `trenchChannel()` per ROM: floor lines, side vertical lines, wall panel/window detail, authentic limits & proportions | pure core generator + render swap |
| Catwalks + wall turrets as entities | Port the `off_7CC0` tables; `GameState` gains trench entities; targetable, scored per ROM values | core sim + render |
| Exhaust-port gameplay fidelity | Authentic port geometry/behavior, hit-test → `TRENCH_BONUS`, "EXHAUST PORT AHEAD" / force-bonus flow | core + shell |
| HUD/framing fidelity | Wireframe SHIELD gauge, score+bonus layout, banners, authentic palette | shell only |
| Live playtest capstone | Absorbs 13-3's ACs: recycle-seam check, hit-tests, HUD compositing, console-clean, sign-off notes | verification |

**Acceptance surface.** Every render story is judged on the 13-1 scene sheet
(`/scenes.html`) — `core/scenePresets.ts` extended so new content (turrets,
catwalks, port states) appears in presets — with the capstone as the live check.

## Testing & boundaries

- **Core (TDD):** unit tests per generator (envelope, symmetry, scroll-recycle
  invariants — the `trench-channel` idiom) and per entity behavior (fixed RNG
  seed, spawn tables, collision, scoring).
- **Shell:** eyeballed via scene sheet + live capstone; no canvas tests.
- **Hard boundary unchanged:** `core/` never imports shell, no DOM/time/random;
  scene presets stay pure and double as test fixtures.
- **Data provenance:** ROM data enters as our own TypeScript constants with a
  findings-doc citation in the comment; the quarry itself is never vendored.

## Non-goals

- Implementing space-wave or surface fidelity (documented in the findings doc,
  deferred to future epics).
- Audio implementation (sound hooks documented only; Wave 5 owns it).
- Committing any `reference/` material to git.

## Risks

| Risk | Mitigation |
|---|---|
| Annotation errors in the hobbyist listing | ⚠︎ flags; trace code, cross-check `StarWars.asm`; trust structure over prose |
| Whole-game extraction balloons | Structured sweep with per-range agents; trench sections get depth priority, others breadth |
| Reference drift between checkouts | The committed findings doc is the single citable authority; quarry is disposable |
| 13-1 merge stalls the epic | It's approved ("Ready to merge = Yes"); merge is the first action |
