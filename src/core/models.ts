// src/core/models.ts
//
// 3D vector model registry — the authentic Star Wars cabinet geometry.
//
// VERTICES are ported verbatim from the cabinet disassembly
// (reference/disasm/Object_3D_Data.asm — gitignored, never committed): the real
// signed 16-bit object-space coordinates from the 1983 board. The leading
// (0,0,0) object anchor in each table is metadata, not a drawn point, so it is
// dropped — every exported vertex is a render vertex.
//
// EDGES are authored here, not ported: Object_3D_Data.asm holds vertex tables
// only — the line-segment connectivity lived in the AVG vector-draw routines,
// which are not recoverable by object name from the disassembly we have. The
// wireframe is therefore derived from the geometry itself.
//
// DEATH_STAR_SURFACE and SURFACE_TOWER edges were RE-AUTHORED from their own ring
// structure (story 8-4): each coplanar, equal-radius vertex set is closed into a
// single loop, then joined with radial spokes (rim → hub) and struts (between
// stacked rings). This replaces the original 8-2 nearest-neighbour heuristic,
// which was well-formed but rendered as a tangle (rims never closed). The
// reconstruction is guarded by an induced-single-cycle topology test
// (tests/core/models.test.ts). TIE_FIGHTER, DARTH_TIE, and TRENCH still carry the
// 8-2 heuristic edges — owed work for a later pass (TRENCH lands with 8-5).
//
// PURE data. No DOM, no time, no randomness — safe for the deterministic core.

import type { Vec3 } from './math3d'

export interface Model3D {
  readonly name: string
  /** Vertices in object space. */
  readonly vertices: readonly Vec3[]
  /** Line segments as index pairs into `vertices` (vector games are wireframe). */
  readonly edges: readonly (readonly [number, number])[]
}

const S = 0.5

/**
 * Unit wireframe cube — the Wave 0 skeleton's placeholder draw target
 * (consumed by src/shell/render.ts until Wave 1 wires in the authentic models).
 */
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

/** Authentic `Obj_Tie_Fighter` geometry from the cabinet disassembly. */
export const TIE_FIGHTER: Model3D = {
  name: 'TIE Fighter',
  vertices: [
    [-130, -208, 234],
    [104, -208, 234],
    [182, -208, 0],
    [104, -208, -234],
    [-130, -208, -234],
    [-208, -208, 0],
    [-26, -208, 26],
    [0, -208, 26],
    [13, -208, 0],
    [0, -208, -26],
    [-26, -208, -26],
    [-39, -208, 0],
    [-130, 208, 234],
    [104, 208, 234],
    [182, 208, 0],
    [104, 208, -234],
    [-130, 208, -234],
    [-208, 208, 0],
    [-26, 208, 26],
    [0, 208, 26],
    [13, 208, 0],
    [0, 208, -26],
    [-26, 208, -26],
    [-39, 208, 0],
    [-26, -78, 26],
    [0, -78, 26],
    [13, -78, 0],
    [0, -78, -26],
    [-26, -78, -26],
    [-39, -78, 0],
    [-26, 78, 26],
    [0, 78, 26],
    [13, 78, 0],
    [0, 78, -26],
    [-26, 78, -26],
    [-39, 78, 0],
    [-52, -26, 78],
    [26, -26, 78],
    [78, -26, 39],
    [78, -52, 0],
    [78, -26, -39],
    [26, -26, -78],
    [-52, -26, -78],
    [-104, -26, 0],
    [-52, 26, 78],
    [26, 26, 78],
    [78, 26, 39],
    [78, 52, 0],
    [78, 26, -39],
    [26, 26, -78],
    [-52, 26, -78],
    [-104, 26, 0],
  ],
  edges: [
    [0, 1], [0, 6], [1, 7], [2, 7], [2, 8], [3, 4], [3, 9], [4, 10],
    [5, 6], [5, 11], [6, 7], [6, 11], [7, 8], [8, 9], [9, 10], [10, 11],
    [12, 13], [12, 18], [13, 19], [14, 19], [14, 20], [15, 16], [15, 21], [16, 22],
    [17, 18], [17, 23], [18, 19], [18, 23], [19, 20], [20, 21], [21, 22], [22, 23],
    [24, 25], [24, 29], [24, 36], [25, 26], [26, 27], [27, 28], [28, 29], [28, 42],
    [29, 43], [30, 31], [30, 35], [30, 44], [31, 32], [32, 33], [33, 34], [34, 35],
    [34, 50], [35, 51], [36, 44], [37, 38], [37, 45], [38, 39], [38, 46], [39, 40],
    [40, 41], [40, 48], [41, 49], [42, 50], [43, 51], [45, 46], [46, 47], [47, 48],
    [48, 49],
  ],
}

/** Authentic `Obj_Darth_Tie` geometry from the cabinet disassembly. */
export const DARTH_TIE: Model3D = {
  name: 'Darth Vader TIE',
  vertices: [
    [-180, -180, 130],
    [180, -180, 130],
    [180, -270, 50],
    [180, -270, -50],
    [180, -180, -130],
    [-180, -180, -130],
    [-180, -270, -50],
    [-180, -270, 50],
    [-20, -270, 30],
    [20, -270, 30],
    [20, -270, -30],
    [-20, -270, -30],
    [-180, 180, 130],
    [180, 180, 130],
    [180, 270, 50],
    [180, 270, -50],
    [180, 180, -130],
    [-180, 180, -130],
    [-180, 270, -50],
    [-180, 270, 50],
    [-20, 270, 30],
    [20, 270, 30],
    [20, 270, -30],
    [-20, 270, -30],
    [-60, -60, 50],
    [60, -60, 50],
    [60, -60, -50],
    [-60, -60, -50],
    [-60, 60, 50],
    [60, 60, 50],
    [60, 60, -50],
    [-60, 60, -50],
    [-30, -30, 80],
    [30, -30, 80],
    [80, -80, 30],
    [80, -80, -30],
    [30, -30, -80],
    [-30, -30, -80],
    [-80, -80, -30],
    [-80, -80, 30],
    [-30, 30, 80],
    [30, 30, 80],
    [80, 80, 30],
    [80, 80, -30],
    [30, 30, -80],
    [-30, 30, -80],
    [-80, 80, -30],
    [-80, 80, 30],
    [50, -20, 60],
    [50, 20, 60],
    [80, 60, 20],
    [80, 60, -20],
    [50, 20, -60],
    [50, -20, -60],
    [80, -60, -20],
    [80, -60, 20],
  ],
  edges: [
    [0, 7], [0, 39], [1, 2], [1, 34], [2, 3], [3, 4], [4, 35], [5, 6],
    [5, 38], [6, 7], [8, 9], [8, 11], [9, 10], [10, 11], [12, 19], [12, 47],
    [13, 14], [13, 42], [14, 15], [15, 16], [16, 43], [17, 18], [17, 46], [18, 19],
    [20, 21], [20, 23], [21, 22], [22, 23], [24, 32], [24, 39], [25, 33], [25, 34],
    [25, 55], [26, 35], [26, 36], [26, 54], [27, 37], [27, 38], [28, 40], [28, 47],
    [29, 41], [29, 42], [29, 50], [30, 43], [30, 44], [30, 51], [31, 45], [31, 46],
    [32, 33], [32, 40], [33, 48], [34, 55], [35, 54], [36, 37], [36, 53], [37, 45],
    [38, 39], [41, 49], [42, 50], [43, 51], [44, 52], [46, 47], [48, 49], [52, 53],
  ],
}

/** Authentic `Object_8` geometry from the cabinet disassembly. */
export const DEATH_STAR_SURFACE: Model3D = {
  name: 'Death Star Surface',
  vertices: [
    [0, 0, -3840],
    [-960, 0, -3840],
    [0, 960, -3840],
    [0, -960, -3840],
    [-480, 0, 6720],
    [0, 480, 6720],
    [0, -480, 6720],
    [-480, 0, 6000],
    [0, 480, 6000],
    [0, -480, 6000],
    [-600, 0, -1440],
    [0, 600, -1440],
    [0, -600, -1440],
    [-720, 0, -3120],
    [0, 720, -3120],
    [0, -720, -3120],
  ],
  // Five triangular cross-sections (rings) stacked along Z, each a fin trio at
  // (-X, +Y, -Y); the z=-3840 ring also carries a central hub (vertex 0).
  // Reconstruction: close each ring into a loop, spoke the hub to its rim, and
  // run three longitudinal struts (the -X / +Y / -Y fins) down the surface.
  edges: [
    // ring loops (one per Z cross-section)
    [1, 2], [2, 3], [3, 1], // z = -3840 rim
    [13, 14], [14, 15], [15, 13], // z = -3120
    [10, 11], [11, 12], [12, 10], // z = -1440
    [7, 8], [8, 9], [9, 7], // z = 6000
    [4, 5], [5, 6], [6, 4], // z = 6720
    // hub spokes (z = -3840 centre → its rim)
    [0, 1], [0, 2], [0, 3],
    // longitudinal struts: -X fin ridge
    [1, 13], [13, 10], [10, 7], [7, 4],
    // +Y fin ridge
    [2, 14], [14, 11], [11, 8], [8, 5],
    // -Y fin ridge
    [3, 15], [15, 12], [12, 9], [9, 6],
  ],
}

/** Authentic `Object_10` geometry from the cabinet disassembly. */
export const SURFACE_TOWER: Model3D = {
  name: 'Surface Tower',
  vertices: [
    [-256, 0, 192],
    [256, 0, 192],
    [256, 0, -192],
    [-256, 0, -192],
    [-96, 96, 64],
    [96, 32, 64],
    [96, 32, -64],
    [-96, 96, -64],
    [-96, 32, -64],
    [-96, 32, 64],
    [-96, 72, 32],
    [-96, 56, 32],
    [-96, 72, -32],
    [-96, 56, -32],
  ],
  // Two rings — the y=0 base rectangle (0-3) and the y=32 turret-box rectangle
  // (5,6,8,9) — plus the -X back panel (4,7) up at y=96 and an inner detail
  // rectangle (10-13). Reconstruction: close both rings, strut the base corners
  // up to the box, frame the back panel, and anchor the inner detail.
  edges: [
    // base ring (y = 0)
    [0, 1], [1, 2], [2, 3], [3, 0],
    // upper box ring (y = 32)
    [5, 6], [6, 8], [8, 9], [9, 5],
    // base → box struts
    [0, 9], [1, 5], [2, 6], [3, 8],
    // back panel up to y = 96
    [4, 7], [4, 9], [7, 8],
    // inner detail rectangle, anchored to the panel
    [10, 11], [11, 13], [13, 12], [12, 10], [4, 10], [7, 12],
  ],
}

/** Authentic `Obj_Trench_Squares` geometry from the cabinet disassembly. */
export const TRENCH: Model3D = {
  name: 'Trench',
  vertices: [
    [-256, 0, -192],
    [-256, 0, 192],
    [256, 0, 192],
    [256, 0, -192],
    [-128, 0, -64],
    [-128, 0, 64],
    [128, 0, 64],
    [128, 0, -64],
  ],
  edges: [
    [0, 1], [0, 3], [1, 2], [2, 3], [4, 5], [4, 7], [5, 6], [6, 7],
  ],
}

/**
 * The authentic model registry — the single source consumed by Wave 1+
 * (space combat, Death Star surface, trench run). The Wave 0 placeholder
 * CUBE is intentionally excluded; this registry is authentic geometry only.
 */
export const MODELS: readonly Model3D[] = [
  TIE_FIGHTER,
  DARTH_TIE,
  DEATH_STAR_SURFACE,
  SURFACE_TOWER,
  TRENCH,
]
