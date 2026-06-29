import { describe, it, expect } from 'vitest'
import { drawWireframe, project, GLOW_FOR, NEAR } from '../../src/shell/wireframe'
import { perspective, transform, IDENTITY, type Mat4, type Vec3 } from '../../src/core/math3d'
import { CUBE, type Model3D } from '../../src/core/models'

// One projection shared by every case: 60° vertical FOV, square viewport, near=NEAR.
const proj: Mat4 = perspective(Math.PI / 3, 1, 1, 5000)

// Minimal canvas-context stub recording the segments drawn, so we can assert the
// routine projects + strokes without a real DOM canvas (vitest runs in node).
function makeCtx() {
  const segments: number[][] = []
  let pen: number[] = []
  const ctx = {
    lineWidth: 0, strokeStyle: '', shadowColor: '', shadowBlur: 0,
    beginPath() {},
    moveTo(x: number, y: number) { pen = [x, y] },
    lineTo(x: number, y: number) { segments.push([pen[0], pen[1], x, y]) },
    stroke() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments }
}

// Screen projection of a point WITHOUT project()'s near-plane guard, mirroring its
// NDC→pixel map exactly. A clipped endpoint lands precisely on z=-NEAR, which
// project() rejects (returns null), so the expected cut-point pixel must come
// straight from the math box. For points in front of the plane this equals project().
function screenOf(p: Vec3, w = 100, h = 100): [number, number] {
  const ndc = transform(proj, p)
  return [(ndc[0] * 0.5 + 0.5) * w, (-ndc[1] * 0.5 + 0.5) * h]
}

// A one-edge model spanning two object-space points — the smallest fixture that
// exercises a single clip decision in isolation.
function edgeModel(a: Vec3, b: Vec3): Model3D {
  return { name: 'edge', vertices: [a, b], edges: [[0, 1]] }
}

// True if `seg` ([x0,y0,x1,y1]) connects p and q in EITHER order. drawWireframe's
// moveTo/lineTo direction is an implementation detail; the clipped geometry — which
// two pixels the segment spans — is what the story specifies.
function connects(seg: number[], p: readonly [number, number], q: readonly [number, number]): boolean {
  const eq = (s: number, e: number) => Math.abs(s - e) < 1e-6
  const fwd = eq(seg[0], p[0]) && eq(seg[1], p[1]) && eq(seg[2], q[0]) && eq(seg[3], q[1])
  const rev = eq(seg[0], q[0]) && eq(seg[1], q[1]) && eq(seg[2], p[0]) && eq(seg[3], p[1])
  return fwd || rev
}

describe('project', () => {
  it('returns null for a point at/behind the camera', () => {
    expect(project([0, 0, 0], proj, 100, 100)).toBeNull()
    expect(project([0, 0, 5], proj, 100, 100)).toBeNull()
  })
  it('projects a centred point in front to the viewport centre', () => {
    const p = project([0, 0, -10], proj, 100, 100)
    expect(p).not.toBeNull()
    expect(p![0]).toBeCloseTo(50)
    expect(p![1]).toBeCloseTo(50)
  })
})

describe('drawWireframe', () => {
  it('strokes one segment per edge when the whole model is in front', () => {
    const { ctx, segments } = makeCtx()
    drawWireframe(ctx, CUBE, [0, 0, -5], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBe(CUBE.edges.length)
  })

  it('clips straddling edges of a model instead of dropping them', () => {
    const { ctx, segments } = makeCtx()
    // pos z=-1.2 ⇒ cube world z ∈ [-1.7,-0.7]. The object z=-0.5 face (world -1.7)
    // is fully in front (4 edges drawn whole); the object z=+0.5 face (world -0.7)
    // is fully behind z=-NEAR (4 edges draw nothing); the 4 connecting struts
    // straddle the plane and are now CLIPPED, not dropped. 4 + 4 = 8 segments.
    // The old drop-the-whole-edge behaviour drew only the 4 front-face edges.
    drawWireframe(ctx, CUBE, [0, 0, -1.2], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBe(8)
  })
})

describe('drawWireframe near-plane clipping', () => {
  it('clips a straddling edge to the near plane instead of dropping it', () => {
    const { ctx, segments } = makeCtx()
    const a: Vec3 = [2, 0, -3] // in front of z=-NEAR
    const b: Vec3 = [2, 0, 1]  // behind the camera
    drawWireframe(ctx, edgeModel(a, b), [0, 0, 0], proj, 100, 100, '#fff', IDENTITY)
    // t = (-NEAR - za)/(zb - za) = (-1 - -3)/(1 - -3) = 0.5 ⇒ cut at z=-NEAR.
    const cut: Vec3 = [2, 0, -NEAR]
    expect(segments.length).toBe(1)
    expect(connects(segments[0], screenOf(a), screenOf(cut))).toBe(true)
  })

  it('clips a straddling edge regardless of which endpoint is behind', () => {
    const { ctx, segments } = makeCtx()
    const a: Vec3 = [2, 0, 1]  // behind (first vertex)
    const b: Vec3 = [2, 0, -3] // in front
    drawWireframe(ctx, edgeModel(a, b), [0, 0, 0], proj, 100, 100, '#fff', IDENTITY)
    const cut: Vec3 = [2, 0, -NEAR]
    expect(segments.length).toBe(1)
    expect(connects(segments[0], screenOf(cut), screenOf(b))).toBe(true)
  })

  it('leaves an edge fully in front of the near plane unchanged', () => {
    const { ctx, segments } = makeCtx()
    const a: Vec3 = [1, 0, -3]
    const b: Vec3 = [-1, 0, -3]
    drawWireframe(ctx, edgeModel(a, b), [0, 0, 0], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBe(1)
    expect(connects(segments[0], screenOf(a), screenOf(b))).toBe(true)
  })

  it('draws nothing for an edge fully behind the near plane', () => {
    const { ctx, segments } = makeCtx()
    drawWireframe(ctx, edgeModel([1, 0, 2], [-1, 0, 3]), [0, 0, 0], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBe(0)
  })

  it('clips an edge whose endpoint sits exactly on the near plane', () => {
    const { ctx, segments } = makeCtx()
    const a: Vec3 = [2, 0, -3]    // in front
    const b: Vec3 = [2, 0, -NEAR] // exactly on z=-NEAR — project() returns null here
    drawWireframe(ctx, edgeModel(a, b), [0, 0, 0], proj, 100, 100, '#fff', IDENTITY)
    // t = (-NEAR - za)/(zb - za) = 1 ⇒ cut point is b itself; the whole edge draws.
    expect(segments.length).toBe(1)
    expect(connects(segments[0], screenOf(a), screenOf(b))).toBe(true)
  })

  it('is deterministic — identical inputs produce identical clipped segments', () => {
    const first = makeCtx()
    const second = makeCtx()
    const m = edgeModel([2, 0, -3], [2, 0, 1]) // a straddling edge that must be clipped
    drawWireframe(first.ctx, m, [0, 0, 0], proj, 100, 100, '#fff', IDENTITY)
    drawWireframe(second.ctx, m, [0, 0, 0], proj, 100, 100, '#fff', IDENTITY)
    expect(first.segments.length).toBe(1)
    expect(second.segments).toEqual(first.segments)
  })
})

describe('GLOW_FOR', () => {
  it('maps a registry model name to a hex colour', () => {
    expect(GLOW_FOR['TIE Fighter']).toMatch(/^#/)
  })
})
