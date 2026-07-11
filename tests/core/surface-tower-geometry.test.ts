// tests/core/surface-tower-geometry.test.ts
//
// Story sw3-11 — RED phase (O'Brien / TEA): surface-phase geometry fidelity.
//
// GROUND TRUTH — the original Atari source (GitHub `historicalsource/star-wars`,
// commit 5355b76, codename "Warp Speed"), NOT the local reference/disasm (which
// holds only the trench fixtures; its `Object_10` — the current SURFACE_TOWER —
// shares its exact 512×384 base rectangle with `Obj_Trench_Squares` and is trench
// furniture, a catwalk brace, not a tower). The real ground objects live in
// WSOBJ.MAC (`.WP GND — GROUND LASAR TOWER`, scale `.S=30.*4`) with the draw
// contract in the `.WGD TWR/BNK/STB` ground-executing routines and the colors in
// WSGRND.MAC's GDVIEW:
//
//   point table (units of .S; height offset GD$MDT recenters, dropped here):
//     h= 0  r=8   base flare        (front/left/right — 3-point cross-sections)
//     h= 6  r=6   near bottom
//     h=14  r=5   midline
//     h=52  r=4   bottom of cannon  (the cap's seat)
//     h=58  r=4   top of tower, top of cannon
//
//   TWR  = base color VGCYLW (YELLOW) up the tapering column; the cannon section
//          (52→58) switches to the "special" color — VGCWHT, "SO DRAW IT SPECIAL
//          WHITE" — the white cap/hat (TYP$BK: "BUNKER (OR HAT ON TOWERS)").
//   STB  = the column alone, no hat ("STUB OF TOWER WITHOUT BUNKER HAT ON TOP").
//   BNK  = ONLY the base ring (r=8) + near-bottom ring (r=6, h=6) — a squat
//          truncated pyramid, the macro's own word: "SHORTY". Lone undamaged
//          bunkers draw VGCRED (RED).
//
// So the authentic tower is a TALL WAISTED COLUMN: 58 high vs 16 wide (~3.6:1),
// tapering 8→6→5→4, wearing a small white cap on the top ~10%. The current clone
// model is a 512-wide, 96-tall box — the aspect is INVERTED (0.19:1) and it is
// stroked red, reading as a grounded ship-hull. These tests pin the authentic
// silhouette, scale-invariantly (ratios only), per the 8-2/8-4 convention: the
// DEV stays free to choose the world scale and to author edges; we pin structure.
//
// WYSIWYG COUPLING: state.ts TOWER_HEIGHT is documented as "the SURFACE_TOWER
// model's peak" (fireballs erupt from it, sim.ts muzzle). Today it silently
// drifts (96 vs the drawn composite peak of 120 — the cube top). Pinned here so
// the re-authored geometry cannot drift again.

import { describe, it, expect } from 'vitest'
import * as ModelsModule from '../../src/core/models'
import type { Model3D } from '../../src/core/models'
import { TOWER_HEIGHT } from '../../src/core/state'

// --- discovery helpers (mirror models.test.ts: find by NAME, never by export) --

function allModels(): Model3D[] {
  const reg = (ModelsModule as unknown as {
    MODELS?: readonly Model3D[] | Readonly<Record<string, Model3D>>
  }).MODELS
  if (!reg) return []
  return Array.isArray(reg) ? [...reg] : Object.values(reg)
}

/** Model3D-shaped module exports (the TOWER_CUBE precedent: authored overlays
 *  live as direct exports, outside the authentic MODELS registry). */
function allExportedModels(): Model3D[] {
  return Object.values(ModelsModule).filter(
    (v): v is Model3D =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as Model3D).name === 'string' &&
      Array.isArray((v as Model3D).vertices) &&
      Array.isArray((v as Model3D).edges),
  )
}

const findByName = (re: RegExp): Model3D | undefined =>
  allModels().find((m) => re.test(m.name))
const findAnywhere = (re: RegExp): Model3D | undefined =>
  findByName(re) ?? allExportedModels().find((m) => re.test(m.name))

const findTower = () => findByName(/surface\s*tower/i)
/** The white cap/hat — replaces the sw2-3 TOWER_CUBE ('Tower Cube', no match). */
const findCap = () => findAnywhere(/cap|hat/i)
const findBunker = () => findByName(/bunker/i)

// --- geometry helpers ---------------------------------------------------------

const EPS_FRAC = 1e-6

/** Group vertices into horizontal levels (shared y), sorted bottom-up.
 *  Returns [y, radii[]] — radii = hypot(x, z) per member. Scale-invariant. */
function levelsOf(m: Model3D): { y: number; radii: number[] }[] {
  const maxAbs = Math.max(
    1,
    ...m.vertices.flatMap((v) => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]),
  )
  const eps = EPS_FRAC * maxAbs
  const key = (x: number) => Math.round(x / eps)
  const byY = new Map<number, number[]>()
  for (const v of m.vertices) {
    const k = key(v[1])
    const g = byY.get(k)
    const r = Math.hypot(v[0], v[2])
    if (g) g.push(r)
    else byY.set(k, [r])
  }
  return [...byY.entries()]
    .map(([k, radii]) => ({ y: k * eps, radii }))
    .sort((a, b) => a.y - b.y)
}

/** Levels that are true cross-section rings: >= 3 members sharing one radius.
 *  The cabinet's sections are front/left/right — exactly 3 equal-radius points. */
function ringLevels(m: Model3D): { y: number; radius: number; size: number }[] {
  const maxAbs = Math.max(
    1,
    ...m.vertices.flatMap((v) => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]),
  )
  const eps = EPS_FRAC * maxAbs
  return levelsOf(m)
    .filter((l) => l.radii.length >= 3)
    .filter((l) => Math.max(...l.radii) - Math.min(...l.radii) <= eps)
    .map((l) => ({ y: l.y, radius: l.radii[0], size: l.radii.length }))
}

const maxY = (m: Model3D) => Math.max(...m.vertices.map((v) => v[1]))
const minY = (m: Model3D) => Math.min(...m.vertices.map((v) => v[1]))
const maxRadius = (m: Model3D) => Math.max(...m.vertices.map((v) => Math.hypot(v[0], v[2])))

/** True iff the model's edges link every vertex into ONE connected component. */
function isSingleComponent(m: Model3D): boolean {
  const n = m.vertices.length
  if (n === 0) return false
  const adj = new Map<number, number[]>()
  for (let i = 0; i < n; i++) adj.set(i, [])
  for (const [a, b] of m.edges) {
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  const seen = new Set<number>([0])
  const stack = [0]
  while (stack.length) {
    const v = stack.pop()!
    for (const w of adj.get(v)!) if (!seen.has(w)) { seen.add(w); stack.push(w) }
  }
  return seen.size === n
}

/** The composite silhouette the cabinet draws at a tower site: column + cap
 *  (they share the tower's placement transform, like SURFACE_TOWER + TOWER_CUBE
 *  today). While the authentic cap does not exist yet, the sw2-3 Tower Cube IS
 *  today's drawn overlay, so it joins the composite — the WYSIWYG pin below must
 *  see the peak the player actually sees (the cube top at 120, not the body 96). */
function composite(): { verts: readonly (readonly number[])[]; H: number; W: number } {
  const body = findTower()
  const overlay = findCap() ?? findAnywhere(/tower\s*cube/i)
  const verts = [...(body?.vertices ?? []), ...(overlay?.vertices ?? [])]
  const H = Math.max(...verts.map((v) => v[1]))
  const W = 2 * Math.max(...verts.map((v) => Math.hypot(v[0], v[2])))
  return { verts, H, W }
}

// --- helper self-checks (guard the guard, per models.test.ts idiom) -----------

describe('ringLevels (profile helper self-check)', () => {
  const towerish: Model3D = {
    name: 'fixture',
    vertices: [
      [-8, 0, 0], [0, 0, 8], [0, 0, -8], // 3-point base ring r=8
      [-4, 10, 0], [0, 10, 4], [0, 10, -4], // 3-point top ring r=4
      [-2, 5, 0], // stray mid point (no ring)
    ],
    edges: [[0, 3], [1, 4], [2, 5], [0, 6]],
  }
  it('finds exactly the >=3-member equal-radius levels', () => {
    const rings = ringLevels(towerish)
    expect(rings).toHaveLength(2)
    expect(rings[0].y).toBeCloseTo(0, 4)
    expect(rings[0].radius).toBeCloseTo(8, 6)
    expect(rings[0].size).toBe(3)
    expect(rings[1].y).toBeCloseTo(10, 4)
    expect(rings[1].radius).toBeCloseTo(4, 6)
    expect(rings[1].size).toBe(3)
  })
  it('rejects a level whose members differ in radius (hub + rim is not a ring)', () => {
    const mixed: Model3D = {
      name: 'mixed',
      vertices: [[0, 0, 0], [8, 0, 0], [0, 0, 8]], // r = 0, 8, 8 at y=0
      edges: [[0, 1], [1, 2]],
    }
    expect(ringLevels(mixed)).toHaveLength(0)
  })
})

// --- AC-1: the tower is a TALL column, not a squat slab ------------------------

describe('sw3-11 — surface tower silhouette (WSOBJ.MAC .WP GND)', () => {
  it('exists in the MODELS registry', () => {
    expect(findTower()).toBeDefined()
  })

  it('is TALL: composite height >= 2.5x its width (authentic 58 x 16 = 3.6:1)', () => {
    // The cabinet column is 58 units high on a 16-unit-wide footprint. The
    // current model is 512 wide x 96 (120 with cube) high — aspect 0.19, a slab.
    const { H, W } = composite()
    expect(H / W).toBeGreaterThanOrEqual(2.5)
  })

  it('stacks >= 4 cross-section ring levels (base / near-bottom / midline / cannon)', () => {
    // Authentic column: rings at h = 0, 6, 14, 52 (+58 if the cap points stay in
    // the body model). The current model has only 2 (base rect + turret box).
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    expect(ringLevels(m).length).toBeGreaterThanOrEqual(4)
  })

  it('cross-sections are the cabinet TRIANGLES: every ring level has exactly 3 points', () => {
    // WSOBJ.MAC sections are front/left/right — 3 points per level, never 4.
    // The current model stacks 4-corner rectangles.
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    const rings = ringLevels(m)
    expect(rings.length).toBeGreaterThan(0)
    for (const ring of rings) expect(ring.size).toBe(3)
  })

  it('tapers upward — ring radii never grow with height, and base >= 1.5x top (8 -> 4)', () => {
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    const rings = ringLevels(m)
    expect(rings.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].radius).toBeLessThanOrEqual(rings[i - 1].radius + EPS_FRAC)
    }
    expect(rings[0].radius / rings[rings.length - 1].radius).toBeGreaterThanOrEqual(1.5)
  })

  it('stands on the ground (base at y = 0)', () => {
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    expect(minY(m)).toBeCloseTo(0, 6)
  })

  it('is a single connected wireframe (three profile polylines share their joints)', () => {
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    expect(isSingleComponent(m)).toBe(true)
  })
})

// --- AC-2: the white cap (the TWR "hat", VGCWHT) --------------------------------

describe('sw3-11 — tower cap (the ROM hat, drawn SPECIAL WHITE)', () => {
  it('a cap/hat model exists (registry or export — replaces the sw2-3 Tower Cube)', () => {
    expect(findCap()).toBeDefined()
  })

  it('is SHORT: cap height <= 20% of the composite tower height (authentic 6/58)', () => {
    const cap = findCap()
    expect(cap).toBeDefined()
    if (!cap) return
    const { H } = composite()
    expect(maxY(cap) - minY(cap)).toBeLessThanOrEqual(0.2 * H)
  })

  it('is NARROW: cap radius <= 60% of the column base radius (authentic 4/8)', () => {
    const cap = findCap()
    const body = findTower()
    expect(cap).toBeDefined()
    expect(body).toBeDefined()
    if (!cap || !body) return
    const baseRadius = Math.max(...ringLevels(body).map((r) => r.radius))
    expect(maxRadius(cap)).toBeLessThanOrEqual(0.6 * baseRadius)
  })

  it('sits at the SUMMIT: cap top is the composite peak, cap seat in the top 30%', () => {
    // Authentic: the hat spans 52..58 of 58 — seated at 90% height. The sw2-3
    // cube floats at 72..120 over a 96-peak body (misaligned both ways).
    const cap = findCap()
    expect(cap).toBeDefined()
    if (!cap) return
    const { H } = composite()
    expect(maxY(cap)).toBeCloseTo(H, 6)
    expect(minY(cap)).toBeGreaterThanOrEqual(0.7 * H)
  })

  it('is a well-formed single wireframe (it may live outside the registry suites)', () => {
    const cap = findCap()
    expect(cap).toBeDefined()
    if (!cap) return
    expect(cap.vertices.length).toBeGreaterThan(0)
    expect(cap.edges.length).toBeGreaterThan(0)
    const used = new Set<number>()
    for (const [a, b] of cap.edges) { used.add(a); used.add(b) }
    for (let i = 0; i < cap.vertices.length; i++) expect(used.has(i)).toBe(true)
    expect(isSingleComponent(cap)).toBe(true)
  })
})

// --- AC-3: the ground bunker (BNK — "SHORTY", VGCRED) ---------------------------

describe('sw3-11 — ground bunker model (WSOBJ.MAC .WGD BNK)', () => {
  it('the MODELS registry includes a bunker (authentic ROM picture, not decoration)', () => {
    expect(findBunker()).toBeDefined()
  })

  it('is the SHORTY: height <= half its width, and <= 1/4 of the tower height', () => {
    // Authentic bunker: 6 high on a 16-wide footprint (0.375), vs the 58 tower.
    const b = findBunker()
    expect(b).toBeDefined()
    if (!b) return
    const h = maxY(b) - minY(b)
    const w = 2 * maxRadius(b)
    expect(h).toBeGreaterThan(0)
    expect(h).toBeLessThanOrEqual(0.5 * w)
    const { H } = composite()
    expect(h).toBeLessThanOrEqual(H / 4)
  })

  it('is a truncated pyramid: >= 2 three-point rings, narrowing upward (8 -> 6)', () => {
    const b = findBunker()
    expect(b).toBeDefined()
    if (!b) return
    const rings = ringLevels(b)
    expect(rings.length).toBeGreaterThanOrEqual(2)
    for (const ring of rings) expect(ring.size).toBe(3)
    expect(rings[rings.length - 1].radius).toBeLessThan(rings[0].radius)
  })

  it('sits on the ground (base at y = 0) as one connected wireframe', () => {
    const b = findBunker()
    expect(b).toBeDefined()
    if (!b) return
    expect(minY(b)).toBeCloseTo(0, 6)
    expect(isSingleComponent(b)).toBe(true)
  })
})

// --- AC-4: the WYSIWYG muzzle coupling ------------------------------------------

describe('sw3-11 — TOWER_HEIGHT tracks the drawn composite peak (WYSIWYG muzzle)', () => {
  it('TOWER_HEIGHT equals the tallest drawn point of the tower composite', () => {
    // state.ts documents TOWER_HEIGHT as "the SURFACE_TOWER model's peak" and
    // sim.ts erupts fireballs from it. Today it is 96 while the drawn composite
    // peaks at 120 (the cube top) — a silent drift this pin makes impossible.
    const { H } = composite()
    expect(TOWER_HEIGHT).toBeCloseTo(H, 6)
  })
})
