// src/core/models.ts
//
// 3D vector model registry. The authentic models — TIE fighters, the Death Star
// surface towers, the trench and exhaust port — will be ported from
// reference/disasm/Object_3D_Data.asm, which holds the cabinet's real vertex
// and line-segment tables.
//
// Until then, a unit wireframe cube gives the render pipeline (math box →
// projection → glow) something to draw for the Wave 0 skeleton.

import type { Vec3 } from './math3d'

export interface Model3D {
  readonly name: string
  /** Vertices in object space. */
  readonly vertices: readonly Vec3[]
  /** Line segments as index pairs into `vertices` (vector games are wireframe). */
  readonly edges: readonly (readonly [number, number])[]
}

const S = 0.5

export const CUBE: Model3D = {
  name: 'cube',
  vertices: [
    [-S, -S, -S], [S, -S, -S], [S, S, -S], [-S, S, -S],
    [-S, -S, S], [S, -S, S], [S, S, S], [-S, S, S],
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 0], // back face
    [4, 5], [5, 6], [6, 7], [7, 4], // front face
    [0, 4], [1, 5], [2, 6], [3, 7], // connecting struts
  ],
}
