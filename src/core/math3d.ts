// src/core/math3d.ts
//
// The "Math Box" — the heart of the Star Wars core.
//
// Tempest's hardest core module was geometry.ts (a 2.5D tube + trivial 2D
// projection). Star Wars is true 3D, so its equivalent is a real vec3/mat4
// pipeline: object-space vertices → model/view/projection transform →
// normalised device coords the shell can paint as glowing vectors.
//
// PURE and deterministic. No DOM, no time, no randomness. Matrices are stored
// row-major as a flat length-16 array; points are perspective-divided on
// transform. Right-handed, looking down -Z (OpenGL convention).

export type Vec3 = readonly [number, number, number]
export type Mat4 = readonly number[] // length 16, row-major

export const IDENTITY: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

/** Row-major matrix product C = A · B. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const c = new Array<number>(16)
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[r * 4 + k] * b[k * 4 + col]
      c[r * 4 + col] = sum
    }
  }
  return c
}

/** Apply `m` to point `v` (w = 1) and perspective-divide back into a Vec3. */
export function transform(m: Mat4, v: Vec3): Vec3 {
  const [x, y, z] = v
  const xp = m[0] * x + m[1] * y + m[2] * z + m[3]
  const yp = m[4] * x + m[5] * y + m[6] * z + m[7]
  const zp = m[8] * x + m[9] * y + m[10] * z + m[11]
  const wp = m[12] * x + m[13] * y + m[14] * z + m[15]
  const w = wp === 0 ? 1 : wp
  return [xp / w, yp / w, zp / w]
}

export function translation(x: number, y: number, z: number): Mat4 {
  return [
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1,
  ]
}

export function rotationX(theta: number): Mat4 {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [
    1, 0, 0, 0,
    0, c, -s, 0,
    0, s, c, 0,
    0, 0, 0, 1,
  ]
}

export function rotationY(theta: number): Mat4 {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1,
  ]
}

export function rotationZ(theta: number): Mat4 {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return [
    c, -s, 0, 0,
    s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

/** Right-handed perspective projection (looking down -Z). */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2)
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), (2 * far * near) / (near - far),
    0, 0, -1, 0,
  ]
}

// --- Vec3 helpers (used by model transforms, culling, hit-tests later) ---

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a))
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a)
  return len === 0 ? [0, 0, 0] : scale(a, 1 / len)
}

/**
 * A pure rotation whose local forward axis (+Z) maps onto `forward` — i.e. it
 * turns a model so its nose points along `forward`. The other two axes complete
 * a right-handed orthonormal basis using `up` as the reference up (default world
 * +Y); when `forward` is (near-)parallel to `up`, a fallback reference keeps the
 * basis from degenerating (gimbal lock). No scale, shear, or translation. A zero
 * `forward` yields IDENTITY. `forward` is normalised here, so callers may pass an
 * un-normalised direction.
 */
export function lookRotation(forward: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  const f = normalize(forward)
  if (f[0] === 0 && f[1] === 0 && f[2] === 0) return IDENTITY
  // A reference up not parallel to f keeps cross() well-conditioned.
  const ref: Vec3 = Math.abs(dot(f, up)) > 0.999 ? [0, 0, 1] : up
  const r = normalize(cross(ref, f)) // local +X
  const u = cross(f, r) // local +Y (unit: f and r are orthonormal)
  // Columns [r, u, f] in row-major storage: local x->r, y->u, z->f.
  return [
    r[0], u[0], f[0], 0,
    r[1], u[1], f[1], 0,
    r[2], u[2], f[2], 0,
    0, 0, 0, 1,
  ]
}
