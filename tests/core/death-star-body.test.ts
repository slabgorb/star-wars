// tests/core/death-star-body.test.ts
//
// Story 11-7 — Death Star body: distant wireframe sphere in the space phase.
// RED phase (O'Brien / TEA). The contract the GREEN phase (Julia / DEV) must
// satisfy.
//
// WHY THIS STORY: today there is NO Death Star model anywhere in the registry
// (only DEATH_STAR_SURFACE, the narrow `Object_8` spike — see ADR 0002 §root
// cause). The space phase shows TIEs against empty black; the player cannot see
// what they are attacking. 11-7 adds a wireframe Death Star *body* — a pure
// sphere builder seated far in −Z that GROWS as `phaseKills` rises (you close on
// it), drawn BEHIND the TIEs so it never touches their hit-tests. See
// star-wars/docs/adr/0002-scene-geometry-surface-and-trench.md **part C**.
//
// THE CONTRACT IS SPLIT ALONG THE CORE/SHELL BOUNDARY (ADR 0002 §boundary rules,
// CLAUDE.md):
//   * GEOMETRY is PURE CORE — a deterministic sphere builder in `src/core/`
//     (no DOM/time/random), exported as a `DEATH_STAR` constant, a builder
//     function, or an entry in the `MODELS` registry. These tests probe the
//     module for any of those forms so DEV stays free to choose (mirrors the
//     8-2 `allModels()` "assert shape, never pin the export" approach).
//   * PLACEMENT / GROWTH is the SHELL deriving the seat from sim state — a pure
//     exported `deathStarPlacement(state)` in `src/shell/render.ts`, exactly like
//     the existing `surfacePlacement()` / `trenchPlacement(state)` that the
//     surface/trench core suites already exercise via `RenderModule`.
//
// WHAT IS NOT PINNED HERE (logged as a Delivery Finding, per repo convention —
// "structural topology catches tangles but NOT orientation or scale; eyeball it
// in the dev server", render.ts SURFACE_ORIENT note): the VISUAL correctness of
// the superlaser dish and the equatorial trench groove. We assert it is a
// connected, symmetric sphere with lat/long ring topology and a distinguishing
// feature; the dish/groove READING is an eyeball check once the space phase
// renders the body.

import { describe, it, expect } from 'vitest'
import * as ModelsModule from '../../src/core/models'
import { buildDeathStar } from '../../src/core/models'
import type { Model3D } from '../../src/core/models'
import * as RenderModule from '../../src/shell/render'
import { initialState, SPACE_WAVE_QUOTA, type GameState } from '../../src/core/state'

// ---------------------------------------------------------------------------
// Probes — read the forward-declared core geometry + shell placement WITHOUT a
// hard named import, so RED reports clean assertion failures (feature absent)
// instead of crashing on a missing-export error.
// ---------------------------------------------------------------------------

const AXES = [0, 1, 2] as const

function isModel(x: unknown): x is Model3D {
  if (typeof x !== 'object' || x === null) return false
  const m = x as { vertices?: unknown; edges?: unknown }
  return Array.isArray(m.vertices) && Array.isArray(m.edges)
}

/** A body name is "Death Star"-ish but NOT the existing "Death Star Surface". */
function isBodyName(name: unknown): boolean {
  return typeof name === 'string' && /death\s*star/i.test(name) && !/surface/i.test(name)
}

/**
 * Find the Death Star BODY model in whatever form DEV exposes it:
 *   1. an explicit `DEATH_STAR` (or similarly named) constant,
 *   2. a pure builder function (`buildDeathStar` / `deathStar` / …),
 *   3. an entry in the `MODELS` registry whose name reads as the body.
 */
function bodyModel(): Model3D | undefined {
  // safe: dynamic probe — exported names are intentionally not statically known here.
  const mod = ModelsModule as unknown as Record<string, unknown>

  for (const key of Object.keys(mod)) {
    if (isBodyName(key.replace(/_/g, ' ')) && isModel(mod[key])) return mod[key] as Model3D
  }
  if (isModel(mod.DEATH_STAR)) return mod.DEATH_STAR as Model3D

  for (const key of ['buildDeathStar', 'deathStar', 'makeDeathStar', 'deathStarBody', 'deathStarSphere']) {
    const fn = mod[key]
    if (typeof fn === 'function') {
      const m = (fn as () => unknown)()
      if (isModel(m)) return m
    }
  }

  const reg = mod.MODELS as readonly Model3D[] | Record<string, Model3D> | undefined
  const all = reg ? (Array.isArray(reg) ? [...reg] : Object.values(reg)) : []
  return all.find((m) => m && isBodyName(m.name))
}

interface Placement {
  pos: readonly [number, number, number]
  scale?: number
}

/** Locate the shell's pure placement function under any of the conventional names. */
function placementFn(): ((s: GameState) => Placement) | undefined {
  // safe: dynamic probe — the placement export name is intentionally not pinned here.
  const mod = RenderModule as unknown as Record<string, unknown>
  for (const key of ['deathStarPlacement', 'deathStarSeat', 'deathStarBodyPlacement']) {
    if (typeof mod[key] === 'function') return mod[key] as (s: GameState) => Placement
  }
  return undefined
}

const spaceState = (phaseKills: number): GameState => ({
  ...initialState(1983),
  phase: 'space',
  phaseKills,
})

// ---------------------------------------------------------------------------
// Geometry helpers (self-contained, mirroring tests/core/models.test.ts).
// ---------------------------------------------------------------------------

function radii(m: Model3D): number[] {
  return m.vertices.map((v) => Math.hypot(v[0], v[1], v[2]))
}

function medianRadius(m: Model3D): number {
  const r = radii(m).sort((a, b) => a - b)
  return r[Math.floor(r.length / 2)]
}

function centroid(m: Model3D): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0]
  for (const v of m.vertices) {
    c[0] += v[0]
    c[1] += v[1]
    c[2] += v[2]
  }
  const n = m.vertices.length === 0 ? 1 : m.vertices.length // guard /0 (0 is valid, so not `|| 1`)
  return [c[0] / n, c[1] / n, c[2] / n]
}

/** True iff the vertex set is invariant under reflection across the given axis plane. */
function symmetricAcross(m: Model3D, axis: number, eps: number): boolean {
  const verts = m.vertices
  return verts.every((v) =>
    verts.some((w) =>
      AXES.every((k) => (k === axis ? Math.abs(w[k] + v[k]) <= eps : Math.abs(w[k] - v[k]) <= eps)),
    ),
  )
}

/** True iff edges link every vertex into ONE connected component (8-10 helper). */
function isSingleComponent(m: Model3D): boolean {
  const n = m.vertices.length
  if (n === 0) return false
  const adj = new Map<number, number[]>()
  for (let i = 0; i < n; i++) adj.set(i, [])
  for (const [a, b] of m.edges) {
    if (adj.has(a) && adj.has(b)) {
      adj.get(a)!.push(b)
      adj.get(b)!.push(a)
    }
  }
  const seen = new Set<number>([0])
  const stack = [0]
  while (stack.length) {
    const v = stack.pop()!
    for (const w of adj.get(v)!) if (!seen.has(w)) (seen.add(w), stack.push(w))
  }
  return seen.size === n
}

/** Recover coplanar equal-radius rings from raw geometry (8-4 helper, verbatim). */
function deriveRings(vertices: Model3D['vertices']): number[][] {
  const maxAbs = Math.max(1, ...vertices.flatMap((v) => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]))
  const eps = 1e-4 * maxAbs
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

/** True iff the edges induce exactly ONE simple cycle on `ring` (8-4 helper, verbatim). */
function inducedSingleCycle(edges: Model3D['edges'], ring: readonly number[]): boolean {
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
  for (const v of ring) if (adj.get(v)!.length !== 2) return false
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

// ===========================================================================
// AC1 — core gains a pure, deterministic Death Star sphere builder.
// ===========================================================================

describe('11-7 — Death Star body geometry (pure core)', () => {
  it('the registry/module exposes a Death Star BODY model (distinct from the surface spike)', () => {
    // RED: only DEATH_STAR_SURFACE (Object_8) exists today; there is no body.
    expect(bodyModel()).toBeDefined()
  })

  it('conforms to the Model3D shape with finite vertices and integer in-range edges', () => {
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    expect(typeof m.name).toBe('string')
    expect(m.name.length).toBeGreaterThan(0)
    for (const v of m.vertices) {
      expect(v.length).toBe(3)
      for (const c of v) expect(Number.isFinite(c)).toBe(true)
    }
    const n = m.vertices.length
    for (const e of m.edges) {
      expect(e.length).toBe(2)
      expect(Number.isInteger(e[0])).toBe(true)
      expect(Number.isInteger(e[1])).toBe(true)
      expect(e[0]).toBeGreaterThanOrEqual(0)
      expect(e[0]).toBeLessThan(n)
      expect(e[1]).toBeGreaterThanOrEqual(0)
      expect(e[1]).toBeLessThan(n)
      expect(e[0]).not.toBe(e[1]) // no degenerate self-edge
    }
  })

  it('has no duplicate (undirected) edges and no orphan vertices', () => {
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    const seen = new Set<string>()
    const used = new Set<number>()
    for (const [a, b] of m.edges) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      used.add(a)
      used.add(b)
    }
    for (let i = 0; i < m.vertices.length; i++) expect(used.has(i)).toBe(true)
  })

  it('has a sphere-worthy vertex/edge count (lat/long rings + meridians)', () => {
    // A wireframe sphere is many ring vertices joined by latitude loops AND
    // longitude meridians, so it is edge-rich. Lenient lower bounds — DEV picks
    // the actual stack/slice resolution.
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    expect(m.vertices.length).toBeGreaterThanOrEqual(24)
    expect(m.edges.length).toBeGreaterThanOrEqual(m.vertices.length)
  })

  it('is centred on the object-space origin (the shell translates it into the scene)', () => {
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    const R = medianRadius(m)
    expect(R).toBeGreaterThan(0)
    const c = centroid(m)
    expect(Math.hypot(c[0], c[1], c[2])).toBeLessThanOrEqual(0.25 * R)
  })

  it('is a sphere — the bulk of vertices lie on one spherical shell of radius R', () => {
    // Radial symmetry: most vertices sit at a common distance from the centre.
    // (A minority may deviate — the superlaser dish / poles — see next test.)
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    const R = medianRadius(m)
    const onShell = radii(m).filter((r) => Math.abs(r - R) <= 0.08 * R).length
    // A real UV sphere puts the overwhelming majority of verts on the shell;
    // only a small dish/feature minority may deviate. 0.9 is a meaningful bar
    // (a blob/cylinder would fail), not the trivially-true 0.6.
    expect(onShell / m.vertices.length).toBeGreaterThanOrEqual(0.9)
  })

  it('is bilaterally symmetric across at least one principal plane', () => {
    // A lat/long sphere centred at the origin (poles on an axis, longitudes/
    // latitudes placed symmetrically) is invariant under reflection across a
    // principal plane; the equatorial groove and a dish seated ON a principal
    // plane preserve at least one such symmetry. Catches a lopsided blob without
    // pinning the pole axis or the dish direction.
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    const maxAbs = Math.max(1, ...m.vertices.flatMap((v) => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]))
    const eps = 1e-6 * maxAbs + 1e-9
    expect(AXES.some((axis) => symmetricAcross(m, axis, eps))).toBe(true)
  })

  it('has genuine lat/long ring structure — multiple rings, each a closed loop', () => {
    // Derived from the vertices alone (8-4 contract): several coplanar
    // equal-radius rings (the latitudes), and they close into single cycles
    // rather than a nearest-neighbour tangle. Asserts topology, never a pinned
    // edge list, so DEV stays free to choose the resolution.
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    const rings = deriveRings(m.vertices)
    expect(rings.length).toBeGreaterThanOrEqual(3)
    const closed = rings.filter((r) => inducedSingleCycle(m.edges, r)).length
    expect(closed).toBeGreaterThanOrEqual(3)
  })

  it('is a single connected wireframe (no free-floating ring or dish)', () => {
    const m = bodyModel()
    expect(m).toBeDefined()
    if (!m) return
    expect(isSingleComponent(m)).toBe(true)
  })

  it('is deterministic — two independent builds yield identical geometry', () => {
    // PURE core: no time/random, so calling the builder TWICE must produce
    // byte-for-byte identical output. We call buildDeathStar() directly (not the
    // cached DEATH_STAR singleton) so this test would actually FAIL if the
    // builder ever became nondeterministic — the singleton-vs-itself version was
    // tautological.
    const a = buildDeathStar()
    const b = buildDeathStar()
    expect(b).not.toBe(a) // genuinely separate objects, not one shared singleton
    expect(b.vertices).toEqual(a.vertices)
    expect(b.edges).toEqual(a.edges)
  })
})

// ===========================================================================
// AC2 — seated far in −Z in the space phase; grows on approach from sim state;
//        pure (does not mutate state / perturb determinism).
// ===========================================================================

describe('11-7 — Death Star body placement grows on approach (pure, from sim state)', () => {
  it('the shell exposes a pure deathStarPlacement(state) seat (like surface/trenchPlacement)', () => {
    // RED: no such export on render.ts yet.
    expect(placementFn()).toBeDefined()
  })

  it('seats the body far ahead in −Z at the start of the space phase (0 kills)', () => {
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const p = fn(spaceState(0))
    expect(Number.isFinite(p.pos[2])).toBe(true)
    expect(p.pos[2]).toBeLessThan(0) // down −Z, in front of the cockpit
    expect(Math.abs(p.pos[2])).toBeGreaterThanOrEqual(3000) // genuinely distant
  })

  it('grows on approach — apparent size increases monotonically as phaseKills rises', () => {
    // Mechanism-agnostic: apparent angular size ∝ size / distance, so we track
    // (scale / |z|). Whether DEV grows the body by moving it closer (|z| ↓),
    // scaling it up (scale ↑), or both, this metric must rise across the phase.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const apparent = (k: number): number => {
      const p = fn(spaceState(k))
      const z = Math.abs(p.pos[2])
      expect(z).toBeGreaterThan(0)
      return (p.scale ?? 1) / z
    }
    let prev = apparent(0)
    for (let k = 1; k <= SPACE_WAVE_QUOTA; k++) {
      const cur = apparent(k)
      expect(cur).toBeGreaterThanOrEqual(prev) // never shrinks while approaching
      prev = cur
    }
    expect(apparent(SPACE_WAVE_QUOTA)).toBeGreaterThan(apparent(0)) // strictly bigger by the dive
  })

  it('keeps the body in front of the camera (−Z) the whole approach', () => {
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    for (let k = 0; k <= SPACE_WAVE_QUOTA; k++) {
      expect(fn(spaceState(k)).pos[2]).toBeLessThan(0)
    }
  })

  it('returns a concrete, grown scale at full approach (not a silent default)', () => {
    // Pins the scale contribution explicitly: at the quota the body must report a
    // real scale > 1 (it has grown). `?? 1` defaults elsewhere would mask a
    // missing scale; here we require the field to be present and > 1.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const atQuota = fn(spaceState(SPACE_WAVE_QUOTA))
    const atStart = fn(spaceState(0))
    expect(atQuota.scale).toBeDefined()
    expect(atStart.scale).toBeDefined()
    // `?? 0` defaults to a value that FAILS these checks if scale is ever absent,
    // so it cannot mask a missing field (unlike `?? 1`).
    expect(atQuota.scale ?? 0).toBeGreaterThan(1)
    expect(atQuota.scale ?? 0).toBeGreaterThan(atStart.scale ?? 0) // scale itself grows
  })

  it('clamps growth at the quota — no overshoot past full approach', () => {
    // phaseKills can momentarily sit at/over the quota; the seat must saturate at
    // the full-approach value, never flying nearer or larger than at the quota.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const atQuota = fn(spaceState(SPACE_WAVE_QUOTA))
    const beyond = fn(spaceState(SPACE_WAVE_QUOTA + 5))
    expect(beyond).toEqual(atQuota) // identical seat (pos + scale) once clamped
  })

  it('is pure — placement does not mutate the game state', () => {
    // The body is render-only; deriving its seat must not touch sim state, so it
    // cannot perturb determinism or enemy hit-tests (AC2). Snapshot the whole
    // state and confirm it is unchanged after the read.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const s = spaceState(3)
    const before = JSON.parse(JSON.stringify({ ...s, rng: undefined }))
    fn(s)
    const after = JSON.parse(JSON.stringify({ ...s, rng: undefined }))
    expect(after).toEqual(before)
  })

  it('is deterministic — equal sim state yields an identical seat', () => {
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const a = fn(spaceState(4))
    const b = fn(spaceState(4))
    expect(b).toEqual(a)
  })
})
