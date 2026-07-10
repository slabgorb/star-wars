import { describe, it, expect } from 'vitest'
import * as ModelsModule from '../../src/core/models'
import type { Model3D } from '../../src/core/models'

// ---------------------------------------------------------------------------
// Story 8-2 — RED phase (Han Solo / TEA)
//
// These tests are the contract the GREEN phase (Yoda / DEV) must satisfy when
// porting the authentic vector models from the cabinet disassembly
// (reference/disasm/Object_3D_Data.asm — GITIGNORED, read-only).
//
// Two things the DEV must know, both surfaced during test design:
//
//  1. EDGE DATA IS NOT IN Object_3D_Data.asm. That file holds ONLY the vertex
//     tables (`fdb x, y, z` triples). The line-segment / edge connectivity is
//     encoded elsewhere (the AVG vector-draw routines in StarWars.asm). So the
//     DEV must author well-formed wireframe edges to match each silhouette.
//     These tests therefore assert edge *well-formedness*, never specific edges.
//
//  2. CONTRACT: "render vertices only." Each object table in the disassembly
//     begins with a `0,0,0` object anchor that is metadata, not a drawn point.
//     Ported models contain drawn vertices only — hence "no orphan vertices"
//     (every vertex must be referenced by at least one edge) is enforceable.
//
// The DEV must export a `MODELS` registry (array OR record of Model3D) that is
// the single canonical source consumed by Wave 1+ (8-3 … 8-5). Individual
// models are identified by their human-readable `Model3D.name`, not by a fixed
// export name — so the DEV is free to name the exports naturally.
// ---------------------------------------------------------------------------

/**
 * Read the forward-declared `MODELS` registry without a hard import, so the
 * suite reports clean assertion failures during RED (when MODELS does not yet
 * exist) instead of crashing on a missing-named-export error. Normalises an
 * array or a record into a flat Model3D[].
 */
function allModels(): Model3D[] {
  const reg = (ModelsModule as unknown as {
    MODELS?: readonly Model3D[] | Readonly<Record<string, Model3D>>
  }).MODELS
  if (!reg) return []
  return Array.isArray(reg) ? [...reg] : Object.values(reg)
}

function findByName(re: RegExp): Model3D | undefined {
  return allModels().find((m) => typeof m.name === 'string' && re.test(m.name))
}

const findTie = () => findByName(/tie[\s_-]?fighter/i)
const findTrench = () => findByName(/trench/i)

describe('models — registry', () => {
  it('exposes a MODELS registry covering the four authentic model groups', () => {
    // Story 8-2 scope: TIE fighters, Death Star surface tiles, towers, trench.
    const all = allModels()
    expect(all.length).toBeGreaterThanOrEqual(4)
  })

  it('every registry entry conforms to the Model3D shape', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(typeof m.name).toBe('string')
      expect(m.name.length).toBeGreaterThan(0)
      expect(Array.isArray(m.vertices)).toBe(true)
      expect(Array.isArray(m.edges)).toBe(true)
    }
  })

  it('includes the TIE fighter (hero model for Wave 1 space combat)', () => {
    expect(findTie()).toBeDefined()
  })

  it('includes the trench (Wave 3)', () => {
    expect(findTrench()).toBeDefined()
  })
})

describe('models — well-formedness (every model)', () => {
  it('every vertex is a finite Vec3 (length-3 number tuple)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m.vertices.length).toBeGreaterThan(0)
      for (const v of m.vertices) {
        expect(Array.isArray(v)).toBe(true)
        expect(v.length).toBe(3)
        for (const c of v) expect(Number.isFinite(c)).toBe(true)
      }
    }
  })

  it('every edge is a pair of integer vertex indices', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m.edges.length).toBeGreaterThan(0)
      for (const e of m.edges) {
        expect(e.length).toBe(2)
        expect(Number.isInteger(e[0])).toBe(true)
        expect(Number.isInteger(e[1])).toBe(true)
      }
    }
  })

  it('every edge index is in range [0, vertexCount)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      const n = m.vertices.length
      for (const [a, b] of m.edges) {
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(n)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThan(n)
      }
    }
  })

  it('has no degenerate edges (an edge never joins a vertex to itself)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      for (const [a, b] of m.edges) expect(a).not.toBe(b)
    }
  })

  it('has no duplicate edges (undirected)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      const seen = new Set<string>()
      for (const [a, b] of m.edges) {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })

  it('has no orphan vertices (every vertex is referenced by an edge)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      const used = new Set<number>()
      for (const [a, b] of m.edges) {
        used.add(a)
        used.add(b)
      }
      for (let i = 0; i < m.vertices.length; i++) {
        expect(used.has(i)).toBe(true)
      }
    }
  })
})

describe('models — TIE fighter authentic invariants', () => {
  it('ports the full vertex set (>= 52 render vertices from Obj_Tie_Fighter)', () => {
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return
    expect(tie.vertices.length).toBeGreaterThanOrEqual(52)
  })

  it('is bilaterally symmetric under Y reflection (top wing mirrors bottom)', () => {
    // Verified against Object_3D_Data.asm: the Obj_Tie_Fighter vertex set is
    // invariant under y -> -y. This holds regardless of uniform scaling, so it
    // survives the DEV normalising the raw 16-bit coords to a sane unit size.
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return

    const verts = tie.vertices
    const maxAbs = Math.max(
      1,
      ...verts.flatMap((v) => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]),
    )
    const eps = 1e-6 * maxAbs + 1e-9
    const hasYMirror = (v: readonly number[]) =>
      verts.some(
        (w) =>
          Math.abs(w[0] - v[0]) <= eps &&
          Math.abs(w[1] + v[1]) <= eps &&
          Math.abs(w[2] - v[2]) <= eps,
      )

    for (const v of verts) expect(hasYMirror(v)).toBe(true)
  })

  it('has no coincident (duplicate) vertices', () => {
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return
    const keys = new Set(tie.vertices.map((v) => v.join(',')))
    expect(keys.size).toBe(tie.vertices.length)
  })
})

describe('models — trench authentic invariants', () => {
  it('ports the floor squares (>= 8 vertices)', () => {
    const trench = findTrench()
    expect(trench).toBeDefined()
    if (!trench) return
    expect(trench.vertices.length).toBeGreaterThanOrEqual(8)
  })

  it('lies flat in a single horizontal (Y) plane', () => {
    // Verified against Object_3D_Data.asm: every Obj_Trench_Squares vertex has
    // y == 0 — the trench floor is a ground plane.
    const trench = findTrench()
    expect(trench).toBeDefined()
    if (!trench) return
    const ys = trench.vertices.map((v) => v[1])
    const spread = Math.max(...ys) - Math.min(...ys)
    expect(spread).toBeCloseTo(0)
  })
})

// ---------------------------------------------------------------------------
// Story 8-4 — RED phase (Han Solo / TEA): ring-reconstruction topology guard.
//
// DEATH_STAR_SURFACE and SURFACE_TOWER still carry the 8-2 nearest-neighbour
// heuristic edges — well-formed (valid indices, no orphans) but visually
// tangled: polygon rims never close and spokes jump to arbitrary vertices.
// Story 8-4 re-authors both models' edges from the vertices' OWN ring structure.
// This guard catches the tangle WITHOUT pinning a specific edge list, mirroring
// the 8-2 "assert well-formedness, never specific edges" contract.
//
//   * deriveRings() recovers candidate rings from the VERTICES ALONE: coplanar
//     sets (sharing one axis coordinate) that ALSO share a radius about that
//     axis — a genuine ring, not a line or a hub+rim mix. Hubs (radius ~0) and
//     stray points fall out naturally. It reads no edges, so the topology check
//     can't be satisfied by hand-listing edges, and it is uniform-scale
//     invariant, so it survives the DEV normalising the raw 16-bit coords.
//   * inducedSingleCycle() asserts the edges restricted to a ring form exactly
//     ONE closed loop (a connected 2-regular graph is precisely a single cycle).
//     Spokes/struts to vertices outside the ring are ignored, so the
//     reconstruction stays free to add them.
//
// NOTE for GREEN/REVIEW: structural topology catches tangles but NOT orientation
// or scale — every model MUST be eyeballed in the dev server on first render
// (see context-epic-8.md → "Geometry connectivity").
// ---------------------------------------------------------------------------

/**
 * Recover candidate rings from raw geometry. For each axis, group vertices that
 * share that axis coordinate (coplanar), then split each group by radius about
 * the axis; a sub-group of >= 3 equal-radius vertices is a ring. Derived from
 * the vertices alone and invariant under uniform scaling.
 */
function deriveRings(vertices: Model3D['vertices']): number[][] {
  const maxAbs = Math.max(
    1,
    ...vertices.flatMap((v) => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]),
  )
  const eps = 1e-6 * maxAbs
  const key = (x: number) => Math.round(x / eps)
  const rings: number[][] = []
  const seen = new Set<string>()
  for (let axis = 0; axis < 3; axis++) {
    const o1 = (axis + 1) % 3
    const o2 = (axis + 2) % 3
    const planes = new Map<number, number[]>()
    vertices.forEach((v, i) => {
      const k = key(v[axis])
      const g = planes.get(k)
      if (g) g.push(i)
      else planes.set(k, [i])
    })
    for (const group of planes.values()) {
      if (group.length < 3) continue
      const byRadius = new Map<number, number[]>()
      for (const i of group) {
        const v = vertices[i]
        const k = key(Math.hypot(v[o1], v[o2]))
        const g = byRadius.get(k)
        if (g) g.push(i)
        else byRadius.set(k, [i])
      }
      for (const sub of byRadius.values()) {
        if (sub.length < 3) continue
        const id = [...sub].sort((a, b) => a - b).join(',')
        if (seen.has(id)) continue
        seen.add(id)
        rings.push(sub)
      }
    }
  }
  return rings
}

/**
 * True iff the subgraph that `edges` induces on the index set `ring` (edges with
 * both endpoints in `ring`) is exactly one simple cycle visiting every member:
 * every ring vertex has induced-degree 2, and a single walk reaches them all
 * before closing back to the start.
 */
function inducedSingleCycle(
  edges: Model3D['edges'],
  ring: readonly number[],
): boolean {
  if (ring.length < 3) return false
  const ringSet = new Set(ring)
  const adj = new Map<number, number[]>()
  for (const v of ring) adj.set(v, [])
  for (const [a, b] of edges) {
    if (a !== b && ringSet.has(a) && ringSet.has(b)) {
      adj.get(a)!.push(b)
      adj.get(b)!.push(a)
    }
  }
  for (const v of ring) {
    if (adj.get(v)!.length !== 2) return false
  }
  let prev = -1
  let cur = ring[0]
  const visited = new Set<number>()
  for (let i = 0; i < ring.length; i++) {
    if (visited.has(cur)) break
    visited.add(cur)
    const [n0, n1] = adj.get(cur)!
    const next = n0 !== prev ? n0 : n1
    prev = cur
    cur = next
  }
  return visited.size === ring.length && cur === ring[0]
}

const findSurface = () => findByName(/death\s*star\s*surface/i)
const findTower = () => findByName(/surface\s*tower/i)

describe('inducedSingleCycle (topology helper self-check)', () => {
  // Guard the guard: a helper that always returned true/false would silently
  // pass the model tests below. These fixtures prove it discriminates.
  const triangle: Model3D['edges'] = [[0, 1], [1, 2], [2, 0]]
  const openPath: Model3D['edges'] = [[0, 1], [1, 2]] // rim that never closes
  const square: Model3D['edges'] = [[0, 1], [1, 2], [2, 3], [3, 0]]

  it('accepts a closed loop', () => {
    expect(inducedSingleCycle(triangle, [0, 1, 2])).toBe(true)
    expect(inducedSingleCycle(square, [0, 1, 2, 3])).toBe(true)
  })

  it('rejects an unclosed rim (a vertex with induced-degree != 2)', () => {
    expect(inducedSingleCycle(openPath, [0, 1, 2])).toBe(false)
  })

  it('rejects two disjoint loops sharing the ring set', () => {
    // Two triangles {0,1,2} and {3,4,5}: every vertex is degree 2, but it is two
    // cycles, not one — the walk from 0 only reaches three of the six.
    const twoLoops: Model3D['edges'] = [
      [0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3],
    ]
    expect(inducedSingleCycle(twoLoops, [0, 1, 2, 3, 4, 5])).toBe(false)
  })

  it('rejects a ring that ignores spokes to outside vertices', () => {
    // A closed rim {0,1,2} plus a hub 3 with spokes; the rim is still one cycle.
    const rimPlusHub: Model3D['edges'] = [
      [0, 1], [1, 2], [2, 0], [3, 0], [3, 1], [3, 2],
    ]
    expect(inducedSingleCycle(rimPlusHub, [0, 1, 2])).toBe(true)
  })
})

describe('models — Death Star surface ring topology (8-4)', () => {
  it('exists with vertices and edges', () => {
    const m = findSurface()
    expect(m).toBeDefined()
    if (!m) return
    expect(m.vertices.length).toBeGreaterThan(0)
    expect(m.edges.length).toBeGreaterThan(0)
  })

  it('every coplanar ring closes into a single loop (no nearest-neighbour tangle)', () => {
    const m = findSurface()
    expect(m).toBeDefined()
    if (!m) return
    const rings = deriveRings(m.vertices)
    // The authentic surface has five cross-section rings stacked along Z.
    expect(rings.length).toBeGreaterThanOrEqual(5)
    for (const ring of rings) {
      expect(inducedSingleCycle(m.edges, ring)).toBe(true)
    }
  })
})

describe('models — surface tower ring topology (8-4)', () => {
  it('exists with vertices and edges', () => {
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    expect(m.vertices.length).toBeGreaterThan(0)
    expect(m.edges.length).toBeGreaterThan(0)
  })

  it('every coplanar ring closes into a single loop (base + stacked rings)', () => {
    const m = findTower()
    expect(m).toBeDefined()
    if (!m) return
    const rings = deriveRings(m.vertices)
    // At minimum the y=0 base square and the upper stack ring.
    expect(rings.length).toBeGreaterThanOrEqual(2)
    for (const ring of rings) {
      expect(inducedSingleCycle(m.edges, ring)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Story 8-5 — RED phase (Han Solo / TEA): Wave 3 trench run geometry.
//
// GROUND TRUTH (measured against the live registry, not assumed — see the
// session's Delivery Findings): the 8-3 architect note's "TRENCH renders tangled
// / still carries heuristic edges" premise is FALSE for ring closure. TRENCH's
// two concentric floor squares ([0,1,2,3] outer rim, [4,5,6,7] inner rim) ALREADY
// close into clean single loops — the 8-vertex case was simple enough that the
// 8-2 nearest-neighbour heuristic happened to land both rectangle perimeters.
//
// The real Wave 3 gaps are STRUCTURAL, not a tangle:
//   (a) the two floor loops are DISCONNECTED components — nothing bridges them, so
//       the trench reads as two free-floating rectangles instead of a channel with
//       catwalk rails; and
//   (b) the exhaust port (the run's target) has no geometry in the registry at all.
//
// These tests therefore: (1) GUARD the already-correct floor ring closure against
// regression while GREEN adds rails; (2) drive the missing catwalk rails that
// connect the floor loops into one wireframe; and (3) drive a ring-clean,
// connected exhaust-port model authored with ring-based edges FROM THE START.
// As with 8-2/8-4 they assert well-formedness + topology, never a specific edge
// list, so GREEN stays free to choose the actual rails/port vertices.
//
// OUT OF SCOPE here, logged as findings: orientation/scale are RENDER concerns
// kept out of core (context-epic-8.md → "Display orientation is a render concern")
// and verified by eyeball on first render; the "bonus" scoring in the story title
// is unspecified sim behaviour, not geometry. TIE_FIGHTER/DARTH_TIE still FAIL the
// ring guard (heuristic edges, no topology test) — inherited 8-3 debt, not 8-5.
// ---------------------------------------------------------------------------

const findExhaustPort = () => findByName(/exhaust/i)

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
    for (const w of adj.get(v)!) {
      if (!seen.has(w)) {
        seen.add(w)
        stack.push(w)
      }
    }
  }
  return seen.size === n
}

/** Count edges whose endpoints lie in two DISTINCT derived rings (catwalk rails). */
function countCrossRingRails(m: Model3D): number {
  const rings = deriveRings(m.vertices).map((r) => new Set(r))
  const ringOf = (i: number) => rings.findIndex((s) => s.has(i))
  let rails = 0
  for (const [a, b] of m.edges) {
    const ra = ringOf(a)
    const rb = ringOf(b)
    if (ra !== -1 && rb !== -1 && ra !== rb) rails++
  }
  return rails
}

describe('isSingleComponent (connectivity helper self-check)', () => {
  // Guard the guard: a helper that always returned true would silently pass the
  // trench connectivity test below. These fixtures prove it discriminates.
  it('accepts a single connected component', () => {
    const connected: Model3D = {
      name: 'c',
      vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
      edges: [[0, 1], [1, 2]],
    }
    expect(isSingleComponent(connected)).toBe(true)
  })

  it('rejects two disjoint components sharing no edge', () => {
    const split: Model3D = {
      name: 's',
      vertices: [[0, 0, 0], [1, 0, 0], [5, 0, 0], [6, 0, 0]],
      edges: [[0, 1], [2, 3]],
    }
    expect(isSingleComponent(split)).toBe(false)
  })
})

describe('models — trench floor ring topology (8-5 regression guard)', () => {
  it('the two floor squares each close into one loop', () => {
    // Already GREEN — locks the closure in so the GREEN rail work can't regress it.
    const m = findTrench()
    expect(m).toBeDefined()
    if (!m) return
    const rings = deriveRings(m.vertices)
    expect(rings.length).toBeGreaterThanOrEqual(2)
    for (const ring of rings) {
      expect(inducedSingleCycle(m.edges, ring)).toBe(true)
    }
  })
})

describe('models — trench catwalk rails (8-5)', () => {
  it('the trench is a single connected wireframe (rails bridge the floor loops)', () => {
    // RED: the ported TRENCH is two disjoint squares. Wave 3 adds catwalk rails so
    // the floor reads as one connected structure, not two free-floating rims.
    const m = findTrench()
    expect(m).toBeDefined()
    if (!m) return
    expect(isSingleComponent(m)).toBe(true)
  })

  it('has at least one catwalk rail bridging the inner and outer floor rings', () => {
    // RED: zero cross-ring edges today. Derived from the rings, not hardcoded
    // indices, so GREEN stays free to choose which vertices the rails join.
    const m = findTrench()
    expect(m).toBeDefined()
    if (!m) return
    expect(countCrossRingRails(m)).toBeGreaterThanOrEqual(1)
  })
})

describe('models — exhaust port (8-5)', () => {
  it('the registry includes an exhaust-port model (the run target)', () => {
    // RED: no exhaust-port geometry exists yet.
    expect(findExhaustPort()).toBeDefined()
  })

  it('the exhaust port is a closed ring opening, not a heuristic tangle', () => {
    // The port is an opening — at least one coplanar equal-radius ring that closes
    // into a single loop. Ring-based edges from the start, per the epic contract.
    const m = findExhaustPort()
    expect(m).toBeDefined()
    if (!m) return
    const rings = deriveRings(m.vertices)
    expect(rings.length).toBeGreaterThanOrEqual(1)
    for (const ring of rings) {
      expect(inducedSingleCycle(m.edges, ring)).toBe(true)
    }
  })

  it('the exhaust port is one connected wireframe (no floating segments)', () => {
    const m = findExhaustPort()
    expect(m).toBeDefined()
    if (!m) return
    expect(isSingleComponent(m)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Story 8-10 — RED phase (Han Solo / TEA): TIE_FIGHTER + DARTH_TIE ring topology.
//
// Inherited 8-3 debt, surfaced during 8-5: both TIE models still carry the 8-2
// nearest-neighbour heuristic edges. They are well-formed (the universal suite
// above passes for them) but visually TANGLED — their coplanar rims never close —
// and until now had NO topology guard, despite context-epic-8.md claiming 8-3
// fixed them. Story 8-10 re-authors both edge lists by STRUCTURE (solar panels +
// pylons + cockpit ball), NOT by closing deriveRings() rings.
//
// REVISED (GREEN eyeball via the /models.html contact sheet): the 8-4
// "close every derived ring" contract is WRONG for the TIEs. Their derived rings
// are cross-panel / cross-body quads (4 corners sharing an axis coord + radius
// that span BOTH solar panels), so closing them all BOXES the ship — rings close,
// CI passes, but the model renders as a box. The guard below was therefore
// changed from ring-closure to an isSingleComponent connectivity check; the
// universal no-orphan-vertices and bilateral Y-symmetry suites cover the rest.
// The deriveRings/inducedSingleCycle ground-truth notes that follow are retained
// as the record of why the ring approach was abandoned for these two models.
//
// GROUND TRUTH (measured against the live registry, not assumed — see 8-5's note
// on measuring premises, and this story's Delivery Findings):
//   * TIE_FIGHTER: deriveRings() finds 9 coplanar equal-radius rings (all size 4,
//     vertex-disjoint); 0 close under the current heuristic edges.
//   * DARTH_TIE: deriveRings() finds 38 rings (size 4); 2 happen to close, 36 do
//     NOT. (The story's "38 rings, none close" overstates it — 2 already close —
//     but the guard still fails RED on the other 36. Logged as a finding.)
// Verified FEASIBLE for GREEN before pinning this contract: ordering each ring's
// members by polar angle and closing the perimeter makes all 9 / all 38 rings
// single induced cycles (DARTH's 38 rings overlap — 72 pairs share 2 vertices —
// yet still close simultaneously). TIE's 9 rings cover only 36 of its 52
// vertices, so GREEN must ALSO strut in the remaining 16 cockpit-detail vertices
// — already enforced by the universal "no orphan vertices" test above.
//
// As with 8-2/8-4/8-5, these assert well-formedness + topology, never a specific
// edge list, so GREEN stays free to choose the actual loops/struts. Orientation
// and scale stay RENDER concerns (context-epic-8.md) — eyeball both TIEs on first
// Wave 1 render. Connectivity (both TIEs are currently fragmented, not a single
// component) is logged as a non-blocking finding for that eyeball pass, not pinned
// here — it is outside the 8-4 ring-closure contract this story mirrors.
// ---------------------------------------------------------------------------

const findDarth = () => findByName(/darth/i)

describe('models — TIE fighter ring topology (8-10)', () => {
  it('exists with vertices and edges', () => {
    const m = findTie()
    expect(m).toBeDefined()
    if (!m) return
    expect(m.vertices.length).toBeGreaterThan(0)
    expect(m.edges.length).toBeGreaterThan(0)
  })

  it('is a single connected wireframe (panels + pylons + ball, not fragmented)', () => {
    // 8-10 (revised): deriveRings() on the TIE finds cross-panel quads — 4 corners
    // sharing an x and a y/z-radius that span BOTH solar panels — so closing every
    // derived ring would BOX the ship (see models.ts). The TIE's real structure is
    // panels + pylons + a faceted ball, so the topology guard here is connectivity:
    // one component, no free-floating panel or ball. No-orphan-vertices and
    // bilateral Y-symmetry remain covered by the universal suite above.
    const m = findTie()
    expect(m).toBeDefined()
    if (!m) return
    expect(isSingleComponent(m)).toBe(true)
  })
})

describe('models — Darth Vader TIE ring topology (8-10)', () => {
  it('exists with vertices and edges', () => {
    const m = findDarth()
    expect(m).toBeDefined()
    if (!m) return
    expect(m.vertices.length).toBeGreaterThan(0)
    expect(m.edges.length).toBeGreaterThan(0)
  })

  it('is a single connected wireframe (bent wings + pylons + ball, not fragmented)', () => {
    // 8-10 (revised): like TIE_FIGHTER, deriveRings() on Vader's TIE finds
    // cross-body quads whose closure boxes the ship, so the topology guard here is
    // connectivity, not ring-closure. No-orphan-vertices and bilateral Y-symmetry
    // remain covered by the universal suite above.
    const m = findDarth()
    expect(m).toBeDefined()
    if (!m) return
    expect(isSingleComponent(m)).toBe(true)
  })
})
