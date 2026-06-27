import { describe, it, expect } from 'vitest'
import {
  IDENTITY,
  multiply,
  rotationY,
  transform,
  translation,
  cross,
  dot,
  normalize,
  length,
} from '../../src/core/math3d'

describe('math3d — the Math Box', () => {
  it('identity leaves a point unchanged', () => {
    const p = transform(IDENTITY, [2, 3, 5])
    expect(p[0]).toBeCloseTo(2)
    expect(p[1]).toBeCloseTo(3)
    expect(p[2]).toBeCloseTo(5)
  })

  it('rotationY(PI/2) maps +Z onto +X', () => {
    const p = transform(rotationY(Math.PI / 2), [0, 0, 1])
    expect(p[0]).toBeCloseTo(1)
    expect(p[1]).toBeCloseTo(0)
    expect(p[2]).toBeCloseTo(0)
  })

  it('translation offsets the origin', () => {
    const p = transform(translation(1, -2, 3), [0, 0, 0])
    expect(p[0]).toBeCloseTo(1)
    expect(p[1]).toBeCloseTo(-2)
    expect(p[2]).toBeCloseTo(3)
  })

  it('multiplying by identity is a no-op', () => {
    const m = rotationY(0.7)
    const r = multiply(m, IDENTITY)
    for (let i = 0; i < 16; i++) expect(r[i]).toBeCloseTo(m[i])
  })
})

describe('math3d — vec3 helpers', () => {
  it('cross product of X and Y is Z', () => {
    const z = cross([1, 0, 0], [0, 1, 0])
    expect(z[0]).toBeCloseTo(0)
    expect(z[1]).toBeCloseTo(0)
    expect(z[2]).toBeCloseTo(1)
  })

  it('dot product is commutative and correct', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBeCloseTo(32)
  })

  it('normalize yields unit length', () => {
    expect(length(normalize([3, 4, 0]))).toBeCloseTo(1)
  })
})
