// tests/core/death-star-dish-orientation.test.ts
//
// Story sw3-10 — Death Star renders "inside-out / anomalous". RED phase (O'Brien /
// TEA). The 11-7 body (buildDeathStar, src/core/models.ts) is topologically a
// clean UV wireframe sphere — the 11-7 suite (death-star-body.test.ts) already
// pins that: connected, origin-centred, ~all vertices on one shell, bilaterally
// symmetric, deterministic. Those invariants STAY GREEN through this fix.
//
// What 11-7 deliberately did NOT pin (its own header: "the VISUAL correctness of
// the superlaser dish ... is an eyeball check once the space phase renders the
// body") is exactly the sw3-10 defect. The recessed superlaser dish was seated on
// the +X axis. But the space phase draws the body with IDENTITY orientation:
//   * render.ts deathStarPlacement(state) → pos [0, 0, z] with z < 0,
//   * render.ts cameraView(state) → IDENTITY for 'space' (eye at the origin
//     looking down −Z),
//   * render.ts draws it as modelMatrix(pos, IDENTITY, scale) — no rotation.
// So the object-space +Z hemisphere is the NEAR face the player sees. With the
// dish on +X it is seen edge-on and renders as a crossed, bowtie-shaped spike
// jutting off the sphere's side — the "anomalous / turned-through" artifact.
// Reseated to face the camera (+Z), the same 8-spoke rim reads as the iconic
// concave superlaser dish on the visible face.
//
// THE FIX IS PURE GEOMETRY (the story scope): reseat the dish in buildDeathStar
// onto the +Z hemisphere. These tests recover the dish direction FROM GEOMETRY
// ALONE (no pinned vertex indices), so DEV stays free to choose the exact seat as
// long as the dish faces the viewer, stays concave, and stays stitched to the hull.

import { describe, it, expect } from 'vitest'
import { buildDeathStar, DEATH_STAR } from '../../src/core/models'
import type { Model3D } from '../../src/core/models'
import type { Vec3 } from '@arcade/shared/math3d'

// ---------------------------------------------------------------------------
// Geometry helpers — self-contained, mirroring tests/core/death-star-body.test.ts.
// ---------------------------------------------------------------------------

const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])

/** The sphere radius R: with ~all vertices on one shell (the 11-7 contract), the
 *  median vertex radius is that shell, robust to the dish minority. */
function medianRadius(m: Model3D): number {
  const r = m.vertices.map(len).sort((a, b) => a - b)
  return r[Math.floor(r.length / 2)]
}

/** Indices of the recessed (concave) vertices — the only ones sitting well inside
 *  the spherical shell. On a UV sphere every ring/pole vertex is at radius exactly
 *  R; the superlaser dish's recessed floor is the lone feature pulled inward, so
 *  radius ≤ 0.9·R isolates it without pinning which vertex it is. */
function recessedIndices(m: Model3D): number[] {
  const R = medianRadius(m)
  const out: number[] = []
  m.vertices.forEach((v, i) => {
    if (len(v) <= 0.9 * R) out.push(i)
  })
  return out
}

/** Unit direction the dish faces: the way from the body centre (the origin) to the
 *  centroid of its recessed vertices. Null if there is no recessed feature at all
 *  (i.e. the dish was deleted rather than reseated) or it sits dead-centre. */
function dishAxis(m: Model3D): Vec3 | null {
  const idx = recessedIndices(m)
  if (idx.length === 0) return null
  let cx = 0
  let cy = 0
  let cz = 0
  for (const i of idx) {
    const v = m.vertices[i]
    cx += v[0]
    cy += v[1]
    cz += v[2]
  }
  const centre: Vec3 = [cx / idx.length, cy / idx.length, cz / idx.length]
  const L = len(centre)
  if (L < 1e-6) return null
  return [centre[0] / L, centre[1] / L, centre[2] / L]
}

// ===========================================================================
// The bug — the recessed dish must face the player, not the side.
// ===========================================================================

describe('sw3-10 — Death Star superlaser dish faces the player (not an edge-on side spike)', () => {
  it('seats the recessed dish on the camera-facing +Z hemisphere', () => {
    // +Z is the near face in the space phase: the body is drawn with IDENTITY
    // orientation at pos [0,0,z<0] and the space camera is IDENTITY at the origin
    // looking −Z (render.ts deathStarPlacement / cameraView). A dish on +Z reads
    // as the concave superlaser; the shipped +X seat is edge-on → the anomalous
    // crossed spike this story removes.
    const axis = dishAxis(DEATH_STAR)
    expect(axis).not.toBeNull()
    if (!axis) return
    expect(axis[2]).toBeGreaterThan(0.5) // faces substantially toward the viewer (+Z)
    expect(axis[2]).toBeGreaterThan(Math.abs(axis[0])) // forward beats lateral
  })

  it('does NOT point the dish sideways along ±X (the shipped edge-on orientation)', () => {
    // The shipped model has the dish exactly on +X (axis ≈ [1,0,0]); a viewer-facing
    // dish has a small |x|. A separate, complementary assertion so a half-fix that
    // merely nudges the dish off +X without turning it forward is still caught.
    const axis = dishAxis(DEATH_STAR)
    expect(axis).not.toBeNull()
    if (!axis) return
    expect(Math.abs(axis[0])).toBeLessThan(0.5)
  })

  // -------------------------------------------------------------------------
  // Guards — GREEN today; they keep the fix honest (a reseat, not a hack).
  // -------------------------------------------------------------------------

  it('keeps the dish a CONCAVE depression contained within the hull (no protruding bump)', () => {
    // The dish reads right only as an inward depression: a recessed floor must
    // exist, and NO vertex may poke past the spherical shell — a fix that turned
    // the dish into an outward bump/spike would just relocate the anomaly.
    const R = medianRadius(DEATH_STAR)
    const radii = DEATH_STAR.vertices.map(len)
    for (const r of radii) expect(r).toBeLessThanOrEqual(R * 1.001)
    expect(recessedIndices(DEATH_STAR).length).toBeGreaterThan(0)
  })

  it('keeps the reseated dish stitched into the shell (a connected feature, not a floater)', () => {
    // The dish must remain part of the single connected wireframe (11-7 §single
    // component): at least one edge must join a recessed dish vertex to an on-shell
    // sphere vertex. Guards a reseat that leaves the dish as a free-floating ring.
    const recessed = new Set(recessedIndices(DEATH_STAR))
    expect(recessed.size).toBeGreaterThan(0)
    const stitched = DEATH_STAR.edges.some(([a, b]) => recessed.has(a) !== recessed.has(b))
    expect(stitched).toBe(true)
  })

  it('is deterministic — the reseated builder still yields identical geometry twice', () => {
    // PURE core: reseating the dish must not smuggle in time/random. Call the
    // builder directly (not the DEATH_STAR singleton) so nondeterminism would show.
    const a = buildDeathStar()
    const b = buildDeathStar()
    expect(b).not.toBe(a)
    expect(b.vertices).toEqual(a.vertices)
    expect(b.edges).toEqual(a.edges)
  })
})
