# ADR 0001 — Hand-rolled 3D-vector render pipeline (no 3D engine)

- **Status:** Accepted
- **Date:** 2026-06-29
- **Deciders:** Architect (Emperor Palpatine), product owner (Jedi)
- **Game:** `star-wars`
- **Supersedes / relates to:** epic 11; the per-model placement constants in `src/shell/render.ts` (the `8-11` bug fix); the project constraint in `CLAUDE.md` / `repos.yaml` ("Canvas 2D glowing vectors, no 3D engine")

## Context

In play (Wave 2 surface / Wave 3 trench, and the attract / game-over screen) the
3D geometry renders wrong:

- The **Death Star surface** and the **trench** draw as giant **triangles**
  instead of receding corridors / relief.
- Earlier the Death Star surface was **entirely invisible** (the historical
  `8-11` bug, patched with a hand-derived Z offset).
- Authoring model **position, size, and perspective** is trial-and-error.

We evaluated adopting a JavaScript 3D engine (Three.js / Babylon) to fix this and
**rejected it** (see Alternatives). The game's identity is a faithful Canvas-2D
vector clone with a *deterministic pure core* and a hand-rolled "Math Box"
(`src/core/math3d.ts`). The defects are **nameable bugs in the existing
pipeline**, not the absence of one — the project already contains a small,
working 3D vector renderer.

### Root causes (confirmed in code)

1. **No near-plane line clipping.** `src/shell/wireframe.ts` `drawWireframe()`
   projects an edge's two endpoints and then
   `if (!pa || !pb) continue` — and `project()` returns `null` for any vertex
   at/behind the near plane (`z >= -NEAR`). So **any edge straddling the camera
   plane is dropped wholesale.** For large ground geometry only the
   fully-in-front edges survive, and they converge to the vanishing point — that
   convergence *is* the "triangle".

2. **No camera/view transform and no scale.** `drawWireframe()` applies only
   `orient` (rotation) then `+pos` (translation). The camera is hard-wired at the
   origin looking down `−Z`; "movement" is faked by shoving the **world** around
   with bespoke constants (`SKIM_OFFSET`, `Z_SURFACE_PLACEMENT`,
   `surfacePlacement()`, `trenchPlacement()`). Size is **baked into raw vertex
   magnitudes** — there is no canonical world unit. Every model therefore carries
   hand-derived placement glue, and positioning is guesswork.

3. **No visual feedback loop.** `render.ts` itself admits orientation/scale
   "MUST be eyeballed in the dev server." Nothing in the scene shows where the
   origin, the ground plane, or the view frustum are — so placement bugs (the
   invisible surface, the triangles) are invisible until they ship.

## Decision

Build a small, **dependency-free "3D vector engine"** layer on top of the
existing Math Box. Three parts, each preserving the hard core/shell boundary and
full determinism:

### A — Near-plane edge clipping (shell)

Clip every edge against the near plane `z = −NEAR` *before* projection. When one
endpoint is in front and one behind, compute the parametric crossing
`t = (−NEAR − za) / (zb − za)`, lerp to the cut point, and draw to it instead of
discarding the edge. Edges fully behind the plane are skipped; edges fully in
front are unchanged. ~15–20 lines in `wireframe.ts`. **This alone turns the
triangles back into receding surfaces.**

### B — Camera + MVP transform pipeline

Introduce a proper model→view→projection chain:

- `camera { pos, orientation }` → a **view matrix** (inverse camera transform).
- A per-entity **model matrix** = `translation ∘ rotation ∘ scale`.
- Compose `MVP = projection × view × model` once per entity; transform all
  vertices through it.

This deletes the scattered placement constants: "put a TIE at `(x,y,z)` at scale
`s` facing the cockpit" becomes one model matrix, not an archaeology dig. The
Math Box already has `perspective`, `lookRotation`, `translation`, `rotation*`,
`multiply`; B adds a `scaling()` matrix builder and a `viewMatrix()` helper.

### C — Dev debug overlay (shell)

A toggle-key overlay that draws: world **axes** at the origin, a **ground grid**,
the camera **frustum**, and each model's **bounding sphere** + label (reusing
`modelView.modelBounds`). Pure Canvas 2D, dev-only. This is the feedback loop
that stops the invisible-geometry / triangle classes of bug from recurring.

### Boundary rules (non-negotiable — see `star-wars/CLAUDE.md`)

- **Pure matrix builders** (`scaling()`, `viewMatrix()`) live in
  `core/math3d.ts` — pure, deterministic, unit-tested.
- **Clipping, MVP composition, and overlay drawing** live in `shell/` — they
  touch the canvas / consume projected positions.
- **The camera derives from sim state** (the cockpit *is* the camera). The view
  matrix is built in the shell from that state using the pure core math. The core
  never imports the shell and never touches the DOM.

## Consequences

**Positive**

- The triangles become real receding surfaces the moment **A** lands — smallest
  change, biggest visible win, shippable on its own.
- Placement becomes "set `{pos, rot, scale}`"; the scattered constants collapse
  into one camera + per-entity model matrix (**B**).
- The overlay (**C**) converts blind trial-and-error into a feedback loop.
- **Zero new runtime dependencies.** Determinism and the core/shell boundary
  intact; the vector aesthetic unchanged.

**Negative / risks**

- `wireframe.ts` is shared by the game renderer **and** the model contact sheet
  (`tools/contactSheet.ts`). The clip change affects both — verify in both. (The
  contact sheet renders every model through this path, so it doubles as a test
  harness.)
- **B** is a real refactor of `render.ts`: the ad-hoc placement constants and
  their compensating comments must be removed in lockstep and the
  surface/trench/TIE placements re-derived through the camera/MVP path. Risk of
  visual regressions → eyeball in dev (`:5274`) **and** the contact sheet.
- Clipping math must handle degenerate cases (both endpoints behind, both in
  front, one exactly on the plane) — covered by unit tests.

## Alternatives considered

1. **Adopt Three.js / Babylon — rejected.** Gives matrices/camera/bloom for free,
   but contradicts the explicit "no 3D engine, Canvas-2D vector" constraint;
   forces a WebGL pipeline into what must stay a deterministic core; fights the
   engine to render pure glowing lines (≈5 % of a ~150 KB dependency); and solves
   a performance problem we do not have (hundreds of segments at 60 fps). Only
   justified if the product becomes a different, richer-3D game — it is not.
2. **Keep patching per-model placement constants — rejected.** This is the status
   quo that produced the `8-11` bug and the triangles. It never addresses the
   missing clip and scales linearly with every new model.
3. **Clipping only; skip camera + overlay — deferred, not rejected.** **A** alone
   fixes the visible triangles, but positioning/sizing (the actual pain) needs
   **B**, and **C** prevents regressions. Splitting lets **A** ship immediately
   while **B**/**C** follow.

## Story breakdown (epic 11 — `star-wars` 3D-vector render pipeline)

| Story | Type | Pts | Scope |
|-------|------|-----|-------|
| 11-1 | bug | 3 | Near-plane line clipping in `wireframe.ts` (A). Fixes the triangles. |
| 11-2 | refactor | 5 | Camera + MVP transform pipeline (B). `scaling()`/`viewMatrix()` in core; rewire `render.ts`; retire ad-hoc placement constants. |
| 11-3 | chore | 3 | Dev debug overlay (C): axes, grid, frustum, per-model bounds. |

Sequence **11-1 → 11-2 → 11-3.** 11-1 is independent and ships the visible win.
11-2 is the structural change positioning depends on. 11-3 builds on 11-2's camera
to draw the frustum (a minimal axes/grid sub-set could be pulled forward to aid
11-2 if needed). Per-story acceptance criteria are carried on each story in the
sprint YAML.
