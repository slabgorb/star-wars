import { describe, it, expect } from 'vitest'
import { drawWireframe, project, GLOW_FOR } from '../../src/shell/wireframe'
import { perspective, IDENTITY } from '../../src/core/math3d'
import { CUBE } from '../../src/core/models'

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

describe('project', () => {
  const proj = perspective(Math.PI / 3, 1, 1, 5000)
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
  const proj = perspective(Math.PI / 3, 1, 1, 5000)
  it('strokes one segment per edge when the whole model is in front', () => {
    const { ctx, segments } = makeCtx()
    drawWireframe(ctx, CUBE, [0, 0, -5], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBe(CUBE.edges.length)
  })
  it('skips edges straddling the near plane (some, not all)', () => {
    const { ctx, segments } = makeCtx()
    // pos z=-1.2 ⇒ cube world z ∈ [-1.7,-0.7]; front verts (≥ -NEAR) are culled.
    drawWireframe(ctx, CUBE, [0, 0, -1.2], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.length).toBeLessThan(CUBE.edges.length)
  })
})

describe('GLOW_FOR', () => {
  it('maps a registry model name to a hex colour', () => {
    expect(GLOW_FOR['TIE Fighter']).toMatch(/^#/)
  })
})
