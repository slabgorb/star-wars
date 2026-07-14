# ADR 0002 — Scene geometry for the Death Star surface and trench (procedural ground + walled channel)

> ⚠ **SUPERSEDED IN PART BY sw5-6.** The trench geometry below is the OLD, unpinned geometry and
> is kept as history. `TRENCH_HALF_W` is **1024** (`$400`), not ~256; `TRENCH_WALL_H` is **4096**
> (`$1000`), not ~400; and `TRENCH_SKIM` **no longer exists** — the pilot's eye is `trenchView`,
> a height above the y=0 floor clamped to the ROM's 512…3840 band. All four are pinned from
> `WSBASE.MAC` / `WSMAIN.MAC`; see `src/core/trench-channel.ts` and
> `docs/star-wars-1983-source-findings.md` § Open follow-ups #2.


- **Status:** Proposed
- **Date:** 2026-06-29
- **Deciders:** Architect, product owner
- **Game:** `star-wars`
- **Supersedes / relates to:** **amends [ADR 0001](./0001-3d-vector-render-pipeline.md)** — corrects its root-cause analysis for the surface/trench "triangles" and adds the scene geometry 0001 did not. Relates to epic 11; stories 11-1 (clipping) and 11-2 (camera/MVP); `src/core/models.ts` (`DEATH_STAR_SURFACE`/`Object_8`, `TRENCH`); `src/shell/render.ts`.

## Context

After epic 11's render rebuild shipped (11-1 near-plane clipping, 11-2 camera +
MVP), the Death Star **surface** still renders as a giant triangle collapsing to
a point and the **trench** as a tiny flat smear. The "Death Star" is not visible
at all. ADR 0001 attributed the triangles to (1) missing near-plane clipping and
(2) the missing camera/MVP transform. **That diagnosis was wrong for these two
scenes.** The transform stack 0001 built is correct; the refactor was
behavior-preserving (the old world-shift and the new camera-lift produce
identical eye space), which is why the picture did not change at all.

### Root cause (verified by reprojecting the actual vertices)

The surface and trench were never built as a *surface* and a *trench*. They are a
single narrow model and a single flat tile, and the projection math faithfully
draws exactly that.

**Surface** — `DEATH_STAR_SURFACE` (`Object_8`) is a long, narrow **3-fin
triangular spike**: ~960 units wide, ~10,560 deep. Seated by
`Z_SURFACE_PLACEMENT` with its near ring only **600 units** in front of the eye,
that near cross-section subtends a huge angle. Reprojected onto a 1456×1117
canvas (camera y=120, FOV 60°):

| vertex | eye-Z | screen | |
|---|---|---|---|
| near ring apex | −600 | (728, −22) | off the **top** |
| near ring right | −600 | (1502, 752) | off the **right** |
| near ring left | −600 | (−46, 752) | off the **left** |
| far ring apex | −11160 | (728, 486) | near center |
| far ring R/L | −11160 | (811/645, 569) | small triangle at center |

The near ring balloons off all three edges; the far rings shrink to a triangle
by the crosshair; the three fin-ridges connect them → a triangle collapsing to a
point. There is **no wide ground plane and no Death Star body model anywhere in
the registry** — so "the Death Star is just not visible" is literally true.

**Trench** — `TRENCH` is a single flat **512×384 double-rectangle floor tile** in
y=0, placed once at the exhaust port's Z. From camera y=60 its four outer corners
project to x 616→840, **y 581→585** — a ~224px-wide, **~4px-tall** sliver at the
vanishing point. No side walls, no length, no channel.

### Why it slipped through review

Stories 11-1 (AC#4) and 11-2 (AC#5) both required the surface/trench to be
"eyeballed in the dev server." Reaching those phases in play requires clearing
the space phase (6 TIE kills) **then** the surface phase (4 turret kills); the
model **contact sheet** renders each model centered and framed in isolation,
where the spike and the tile look fine. So both ACs were signed off without the
in-scene view that exposes the defect. A reachable way to view each phase (a dev
phase-jump, or the 11-3 debug overlay) is a prerequisite for trusting these ACs.

## Decision

Build the two scenes as **procedural, deterministic geometry generated in the
pure core** — the same approach Tempest uses for its tube (`core/geometry.ts`) —
and stroke them through the existing `drawWireframe`. The transform pipeline from
0001 is unchanged; this ADR only supplies the geometry that pipeline draws.

### A — Death Star surface: a wide receding ground grid

A pure generator `surfaceGrid(scroll) → Model3D` (or a line-segment list) on the
y=0 plane:

- **Longitudinal lines** parallel to −Z at `x = ±k·GRID_X` (wide enough that the
  outermost lines run off-screen at the horizon — half-width ≈ 3000–4000), giving
  the receding "ground."
- **Lateral lines** across X every `GRID_Z` from the cockpit out to a far cutoff,
  scrolling toward the camera and **recycling by `scroll mod GRID_Z`** so the
  ground rushes past.
- The existing `SURFACE_TOWER` turrets keep their sim positions and sit **on** the
  grid (already at y≈0, already scrolling in).
- **Retire `DEATH_STAR_SURFACE`/`Object_8` as "the surface."** It is a narrow
  structure, not a ground; re-classify it (likely a bunker/relief feature) and
  drop it from the surface render, or reuse it sparingly as a seated feature.
- Camera unchanged: skim at `y=altitude` looking down −Z (horizon at screen
  center reads correctly for a low skim).

### B — Trench: a long walled channel

A pure generator `trenchChannel(scroll) → Model3D`:

- **Floor rails** at `x=±TRENCH_HALF_W` (≈256) plus lateral floor ribs every
  `RIB_Z`, running from ~z=0 to a far cutoff (≈−6000).
- **Two side walls**: verticals from `y=0` to `y=TRENCH_WALL_H` (≈400) at each rib,
  plus top rails at `y=TRENCH_WALL_H` — a ribbed canyon that reads as depth.
- **Scroll** the whole pattern toward the camera by `scroll mod RIB_Z` (recycling),
  so the player flies down it; the exhaust port keeps its own sim scroll and is
  seated in the floor at channel center.
- Camera unchanged: skim just above the floor (`y=TRENCH_SKIM=60`), centered at
  x=0, so the walls frame the corridor.

### C — Death Star body (optional, deferred)

A pure wireframe sphere builder (`DEATH_STAR`: lat/long rings + the equatorial
trench line + the superlaser dish) seated far in −Z during the **space** phase,
growing as `phaseKills` rises (you are approaching it), drawn behind the TIEs.
Lower priority; does not block A/B.

### Scroll state

Add scalar accumulators to `GameState` — `surfaceScrollZ`, `trenchScrollZ` —
advanced by the existing `TURRET_SCROLL_SPEED`/`TRENCH_SCROLL_SPEED` and reset on
phase entry; the generators read them `mod` the lateral spacing. This keeps the
ground/channel attached to the same flow that already moves the turrets and the
port — no parallel motion model.

### Boundary rules (non-negotiable — same as ADR 0001 / `CLAUDE.md`)

- **All generators are pure core** (`core/`): deterministic, no DOM/time/random,
  unit-tested for segment counts, ±X symmetry, width/length envelope, and scroll
  recycling. The shell only strokes the returned geometry and derives the camera
  from sim state.
- Zero new runtime dependencies. The vector aesthetic and the core/shell boundary
  are unchanged.

## Consequences

**Positive**
- The surface reads as a surface and the trench as a corridor — the actual defect,
  fixed at the layer where it lives.
- Geometry stays pure and testable; the contact sheet still previews every model.
- No engine, no new deps; determinism intact.

**Negative / risks**
- New core surface area (two generators + scroll state) to test and tune. Grid
  width/spacing and wall height **must be eyeballed in a *reachable* surface/trench
  view** — land a dev phase-jump or 11-3's overlay first so the new ACs are
  actually verifiable (the gap that sank 11-1/11-2).
- `Object_8` re-classification needs the gitignored disassembly reference to
  confirm what it really is; until then it is simply removed from the surface
  scene, not deleted.

## Proposed stories (epic 11)

- **11-4 — Procedural Death Star surface (ground grid + horizon).** ~5 pts. Pure
  `surfaceGrid` generator; render swaps the spike for the grid; towers seated on
  it; `surfaceScrollZ` added; `Object_8` retired from the surface scene.
- **11-5 — Walled trench channel (floor + ribbed side walls).** ~5 pts. Pure
  `trenchChannel` generator; render swaps the flat tile for the channel; port
  rides inside it; `trenchScrollZ` added.
- **11-6 — (optional) Death Star body in the space phase.** ~3 pts. Pure sphere
  builder; seated far and growing on approach; drawn behind TIEs. Deferrable.
- **Prereq for verifiable ACs:** a dev phase-jump (or 11-3 debug overlay) so
  surface/trench are reachable for eyeballing — the missing piece that let the
  triangle ship twice.
