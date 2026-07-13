// tests/core/surface-tower-geometry.test.ts
//
// Story sw3-11 — surface-phase geometry fidelity.
// RE-SEATED by story sw5-5 (O'Brien / TEA) into the ROM's own coordinate frame.
//
// GROUND TRUTH — the original Atari source, WSOBJ.MAC (`.WP GND — GROUND LASAR
// TOWER`), with the draw contract in the `.WGD TWR/BNK/STB` routines and the
// colours in WSGRND.MAC's GDVIEW.
//
// -- WHY THIS SUITE MOVED ----------------------------------------------------
//
// sw3-11 hand-re-authored the ground models into the port's own frame (y-up,
// base on y=0, x4 scale) and this suite measured them there. sw5-5 puts the
// models into RAW ROM UNITS instead — as models.ts already does for every ship —
// so that the contact sheet can compare them against the ROM at all (its edge
// diff is gated on the port's vertex array deep-equalling the ROM's). In the
// ROM's frame:
//
//     x = fore/aft ("FRONT" is -x)   y = lateral (+LEFT/-RIGHT)   z = UP
//
// so height is measured on Z, and a cross-section radius is hypot(x, y). The
// world-space presentation (y-up, base on the floor) is now the SHELL's job —
// see tests/shell/render.ground-object-placement.test.ts, which owns every claim
// that needs the world scale, including the TOWER_HEIGHT/WYSIWYG muzzle coupling
// that used to live at the bottom of this file.
//
// -- TWO CORRECTIONS TO THIS SUITE'S OWN GROUND TRUTH ------------------------
//
// 1. THE HEIGHTS ARE HEX. This header used to record the profile as
//    h = 0, 6, 14, 52, 58. WSOBJ.MAC is `.RADIX 16`, so those literals are
//    0x14 / 0x52 / 0x58 = 20 / 82 / 88. The tower is TALLER and differently
//    proportioned than sw3-11 believed, and the old "58 x 16 = 3.6:1" aspect was
//    the artifact of the misreading. The true profile, in units of .S:
//
//        h=0x00  r=8   base flare        (front/left/right — 3-point sections)
//        h=0x06  r=6   near bottom
//        h=0x14  r=5   midline
//        h=0x52  r=4   bottom of cannon  (the cap's seat)
//        h=0x58  r=4   top of cannon
//
//    -> a tall waisted column, 88 high on a 16-wide footprint: 5.5:1, not 3.6:1.
//    The aspect and ring-count pins below are tightened accordingly, so that a
//    regression to the decimal reading now FAILS them instead of sliding through.
//
// 2. THE POINT TABLE IS SHARED. `.WPZ2 TWR/BNK/STB` alias `.WP GND`: four objects,
//    ONE fifteen-point table, differing only in which points their `.WGD` routine
//    strokes. So each model carries points its own edges never touch, and every
//    measurement here is taken over the DRAWN subgraph — what the player actually
//    sees — not the raw vertex array. (models.test.ts carries the matching orphan
//    carve-out and explains why the untouched points must stay.)
//
// The suite still pins STRUCTURE, scale-invariantly (ratios and ring counts), per
// the 8-2/8-4 convention. The exact vertex values are pinned once, against a hand
// transcription of WSOBJ.MAC, in tests/core/ground-objects-rom.test.ts.

import { describe, it, expect } from 'vitest'
import * as ModelsModule from '../../src/core/models'
import type { Model3D } from '../../src/core/models'

// --- discovery helpers (mirror models.test.ts: find by NAME, never by export) --

function allModels(): Model3D[] {
  const reg = (ModelsModule as unknown as {
    MODELS?: readonly Model3D[] | Readonly<Record<string, Model3D>>
  }).MODELS
  if (!reg) return []
  return Array.isArray(reg) ? [...reg] : Object.values(reg)
}

/** Model3D-shaped module exports (authored overlays may live outside MODELS). */
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
/** The white cap/hat — the ROM's cannon section, drawn VGCWHT. */
const findCap = () => findAnywhere(/cap|hat/i)
const findBunker = () => findByName(/bunker/i)

// --- geometry helpers, in the ROM's frame ------------------------------------

const EPS_FRAC = 1e-6

/** GD$MDT — WSOBJ.MAC's "OFFSET HITE TO MID OF PLAYERS HITE". The ROM recentres
 *  every ground object's height by this, so the BASE ring sits at z = -GD$MDT and
 *  model z=0 is the height the player flies at. */
const GD$MDT = 0xf00 // 3840

/** ROM up-axis. Height is Z; a cross-section radius is hypot(x, y). */
const up = (v: readonly number[]) => v[2]
const radiusOf = (v: readonly number[]) => Math.hypot(v[0], v[1])

/**
 * The points a model's edges actually stroke. The ground objects share one ROM
 * point table (`.WPZ2`), so an object's array contains points belonging to its
 * siblings' draw routines; every silhouette question here is about what is DRAWN.
 */
function drawnVerts(m: Model3D): (readonly number[])[] {
  const used = new Set(m.edges.flat())
  return m.vertices.filter((_, i) => used.has(i))
}

/** Group DRAWN vertices into cross-section levels (shared height), bottom-up.
 *  Returns [z, radii[]]. Scale-invariant. */
function levelsOf(m: Model3D): { z: number; radii: number[] }[] {
  const verts = drawnVerts(m)
  const maxAbs = Math.max(1, ...verts.flatMap((v) => v.map(Math.abs)))
  const eps = EPS_FRAC * maxAbs
  const key = (x: number) => Math.round(x / eps)
  const byZ = new Map<number, number[]>()
  for (const v of verts) {
    const k = key(up(v))
    const g = byZ.get(k)
    if (g) g.push(radiusOf(v))
    else byZ.set(k, [radiusOf(v)])
  }
  return [...byZ.entries()]
    .map(([k, radii]) => ({ z: k * eps, radii }))
    .sort((a, b) => a.z - b.z)
}

/** Levels that are true cross-section rings: >= 3 members sharing one radius.
 *  The cabinet's sections are front/left/right — exactly 3 equal-radius points. */
function ringLevels(m: Model3D): { z: number; radius: number; size: number }[] {
  const verts = drawnVerts(m)
  const maxAbs = Math.max(1, ...verts.flatMap((v) => v.map(Math.abs)))
  const eps = EPS_FRAC * maxAbs
  return levelsOf(m)
    .filter((l) => l.radii.length >= 3)
    .filter((l) => Math.max(...l.radii) - Math.min(...l.radii) <= eps)
    .map((l) => ({ z: l.z, radius: l.radii[0], size: l.radii.length }))
}

const maxUp = (m: Model3D) => Math.max(...drawnVerts(m).map(up))
const minUp = (m: Model3D) => Math.min(...drawnVerts(m).map(up))
const maxRadius = (m: Model3D) => Math.max(...drawnVerts(m).map(radiusOf))

/** True iff the model's DRAWN points form ONE connected component. The untouched
 *  points of the shared table are not "floating sections" — they are simply not
 *  this object's geometry. */
function drawnIsSingleComponent(m: Model3D): boolean {
  const used = [...new Set(m.edges.flat())]
  if (used.length === 0) return false
  const adj = new Map<number, number[]>(used.map((i) => [i, []]))
  for (const [a, b] of m.edges) {
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  const seen = new Set([used[0]])
  const stack = [used[0]]
  while (stack.length) {
    for (const w of adj.get(stack.pop()!)!) if (!seen.has(w)) { seen.add(w); stack.push(w) }
  }
  return seen.size === used.length
}

/** The composite silhouette the cabinet draws at a tower site: column + cap.
 *  In the ROM these are ONE object (`.WGD TWR` strokes both, switching pen colour
 *  mid-draw); the port splits them only because Canvas strokes one colour per
 *  call. They share the placement transform, so the player sees their union. */
function composite(): { H: number; W: number; peak: number; foot: number } {
  const body = findTower()
  const cap = findCap()
  const verts = [...(body ? drawnVerts(body) : []), ...(cap ? drawnVerts(cap) : [])]
  const peak = Math.max(...verts.map(up))
  const foot = Math.min(...verts.map(up))
  return { H: peak - foot, W: 2 * Math.max(...verts.map(radiusOf)), peak, foot }
}

// --- helper self-checks (guard the guard, per models.test.ts idiom) -----------

describe('ringLevels (profile helper self-check)', () => {
  const towerish: Model3D = {
    name: 'fixture',
    vertices: [
      [-8, 0, 0], [0, 8, 0], [0, -8, 0], // 3-point base ring r=8, z=0
      [-4, 0, 10], [0, 4, 10], [0, -4, 10], // 3-point top ring r=4, z=10
      [-2, 0, 5], // stray mid point (no ring)
    ],
    edges: [[0, 3], [1, 4], [2, 5], [0, 6]],
  }
  it('finds exactly the >=3-member equal-radius levels', () => {
    const rings = ringLevels(towerish)
    expect(rings).toHaveLength(2)
    expect(rings[0].z).toBeCloseTo(0, 4)
    expect(rings[0].radius).toBeCloseTo(8, 6)
    expect(rings[0].size).toBe(3)
    expect(rings[1].z).toBeCloseTo(10, 4)
    expect(rings[1].radius).toBeCloseTo(4, 6)
    expect(rings[1].size).toBe(3)
  })
  it('rejects a level whose members differ in radius (hub + rim is not a ring)', () => {
    const mixed: Model3D = {
      name: 'mixed',
      vertices: [[0, 0, 0], [8, 0, 0], [0, 8, 0]], // r = 0, 8, 8 at z=0
      edges: [[0, 1], [1, 2]],
    }
    expect(ringLevels(mixed)).toHaveLength(0)
  })
  it('measures only DRAWN points — an unstroked point of a shared table is not a level', () => {
    // The sw5-5 property: `.WPZ2` siblings share a table, so a model carries
    // points its own routine never touches. They must not invent a ring.
    const shared: Model3D = {
      name: 'shared-table',
      vertices: [
        [-8, 0, 0], [0, 8, 0], [0, -8, 0], // drawn base ring
        [-4, 0, 99], [0, 4, 99], [0, -4, 99], // a SIBLING's ring — never stroked here
      ],
      edges: [[0, 1], [1, 2], [2, 0]],
    }
    expect(ringLevels(shared)).toHaveLength(1)
    expect(ringLevels(shared)[0].z).toBeCloseTo(0, 4)
  })
})

// --- the tower is a TALL column, not a squat slab ------------------------------

describe('sw3-11 — surface tower silhouette (WSOBJ.MAC .WP GND)', () => {
  it('exists in the MODELS registry', () => {
    expect(findTower()).toBeDefined()
  })

  it('is TALL: composite height >= 5x its width (authentic 0x58 x 16 = 5.5:1)', () => {
    // TIGHTENED by sw5-5. The old bound was 2.5:1, chosen against a tower whose
    // height had been misread in decimal (58 x 16 = 3.6:1). The real cabinet
    // column is 0x58 = 88 high on a 16-wide footprint. A model that regressed to
    // the decimal heights would score 3.6 and must now FAIL here.
    const { H, W } = composite()
    expect(H / W).toBeGreaterThanOrEqual(5)
    expect(H / W).toBeCloseTo(0x58 / 16, 1)
  })

  it('stacks exactly 5 cross-section rings — base / near-bottom / midline / cannon x2', () => {
    // TIGHTENED by sw5-5 from ">= 4". Four rings is precisely the bug this story
    // fixes: the port dropped the cannon-top ring. The tower's own draw routine
    // (`.WGD STB`) does not stroke that ring — TOWER_CAP does, from the same
    // shared table — so the fifth ring is counted on the composite, which is what
    // the player sees.
    const m = findTower()
    const cap = findCap()
    expect(m).toBeDefined()
    expect(cap).toBeDefined()
    if (!m || !cap) return
    const levels = new Set(
      [...drawnVerts(m), ...drawnVerts(cap)].map((v) => Math.round(up(v))),
    )
    expect([...levels].sort((a, b) => a - b)).toHaveLength(5)
    // The column alone stops at the cannon SEAT: four rings, the stub's own.
    expect(ringLevels(m)).toHaveLength(4)
  })

  it('cross-sections are the cabinet TRIANGLES: every ring level has exactly 3 points', () => {
    // WSOBJ.MAC sections are front/left/right — 3 points per level, never 4.
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

  it('keeps the GD$MDT recentring: the base ring sits at z = -GD$MDT, not at zero', () => {
    // RE-SEATED by sw5-5. This used to read "stands on the ground (base at y=0)",
    // which was true of sw3-11's hand-authored frame but is NOT how the ROM
    // authors a ground object: it recentres height by GD$MDT so that model z=0 is
    // the player's flight height. Dropping that offset (as sw3-11 did) throws away
    // the ROM's own statement of the skim altitude.
    //
    // "Stands on the ground" is now a claim about the SHELL's placement transform,
    // and is asserted there (render.ground-object-placement.test.ts).
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    const rings = ringLevels(m)
    expect(rings[0].z).toBeCloseTo(-GD$MDT, 6)
  })

  it('is a single connected wireframe (three profile polylines share their joints)', () => {
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    expect(drawnIsSingleComponent(m)).toBe(true)
  })
})

// --- the white cap (the TWR "hat", VGCWHT) --------------------------------------

describe('sw3-11 — tower cap (the ROM hat, drawn SPECIAL WHITE)', () => {
  it('a cap/hat model exists (registry or export)', () => {
    expect(findCap()).toBeDefined()
  })

  it('is SHORT: cap height <= 20% of the composite tower height (authentic 6 of 88)', () => {
    const cap = findCap()
    expect(cap).toBeDefined()
    if (!cap) return
    const { H } = composite()
    expect(maxUp(cap) - minUp(cap)).toBeLessThanOrEqual(0.2 * H)
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
    // Authentic: the hat spans 0x52..0x58 of 0x58 — seated at ~93% of the height.
    const cap = findCap()
    expect(cap).toBeDefined()
    if (!cap) return
    const { H, peak, foot } = composite()
    expect(maxUp(cap)).toBeCloseTo(peak, 6)
    expect(minUp(cap) - foot).toBeGreaterThanOrEqual(0.7 * H)
  })

  it('is a well-formed single wireframe over the points it draws', () => {
    // RE-SEATED by sw5-5: the cap indexes the SHARED 15-point table, so most of
    // its array belongs to the column. What it strokes must still be one shape.
    const cap = findCap()
    expect(cap).toBeDefined()
    if (!cap) return
    expect(cap.vertices.length).toBeGreaterThan(0)
    expect(cap.edges.length).toBeGreaterThan(0)
    expect(drawnIsSingleComponent(cap)).toBe(true)
  })
})

// --- the ground bunker (BNK — "SHORTY", VGCRED) ---------------------------------

describe('sw3-11 — ground bunker model (WSOBJ.MAC .WGD BNK)', () => {
  it('the MODELS registry includes a bunker (authentic ROM picture, not decoration)', () => {
    expect(findBunker()).toBeDefined()
  })

  it('is the SHORTY: height <= half its width, and <= 1/4 of the tower height', () => {
    // Authentic bunker: 6 high on a 16-wide footprint (0.375), vs the 88 tower.
    const b = findBunker()
    expect(b).toBeDefined()
    if (!b) return
    const h = maxUp(b) - minUp(b)
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

  it('shares the tower\'s base plane (z = -GD$MDT) as one connected wireframe', () => {
    // RE-SEATED (was "base at y = 0"): the bunker aliases the tower's own point
    // table, so it necessarily stands on the same recentred base plane.
    const b = findBunker()
    expect(b).toBeDefined()
    if (!b) return
    expect(minUp(b)).toBeCloseTo(-GD$MDT, 6)
    expect(drawnIsSingleComponent(b)).toBe(true)
  })
})

// --- the WYSIWYG muzzle coupling ------------------------------------------------
//
// MOVED by sw5-5 to tests/shell/render.ground-object-placement.test.ts.
//
// TOWER_HEIGHT is a WORLD constant (sim.ts erupts each tower's fireball from
// `pos.y + TOWER_HEIGHT`), but the model is now in RAW ROM UNITS. Bridging the two
// needs the shell's presentation scale, which core cannot see without breaking the
// core/shell boundary. The coupling is therefore asserted where both halves are
// visible — and it is asserted more strongly there than it was here, against the
// placed cannon-top ring rather than a bare vertex maximum.

describe('sw3-11 — the drawn peak IS the cannon top (the muzzle\'s seat)', () => {
  it('the composite peaks at the cannon-top ring, which only the cap strokes', () => {
    // The core-side half of the WYSIWYG contract: whatever the world scale, the
    // highest thing drawn at a tower site is the top of the cannon — so that is
    // where the fireball must erupt from. The column alone stops lower (it is the
    // STUB), which is exactly why the muzzle must track the COMPOSITE.
    const body = findTower()
    const cap = findCap()
    expect(body).toBeDefined()
    expect(cap).toBeDefined()
    if (!body || !cap) return
    const { peak } = composite()
    expect(maxUp(cap)).toBeCloseTo(peak, 6)
    expect(maxUp(body)).toBeLessThan(peak)
  })
})
