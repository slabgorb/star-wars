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
// (tests/core/models.test.ts). TRENCH's floor squares already closed cleanly; story
// 8-5 connected them with catwalk rails and added the ring-based EXHAUST_PORT.
// TIE_FIGHTER and DARTH_TIE were likewise RE-AUTHORED from their own ring structure
// (story 8-10), clearing the inherited 8-2 heuristic-edge debt; both are now closed
// into ring loops + symmetric struts and guarded by the same topology test.
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
  // RE-AUTHORED by structure (story 8-10, revised). The disassembly gives only
  // vertices, so edges are hand-authored. The TIE is built as its real sub-bodies
  // — two hexagonal solar panels, two pylons, and a faceted cockpit ball — NOT by
  // closing deriveRings() rings: those rings are cross-panel quads (4 corners that
  // share an x and a y/z-radius span BOTH panels), so closing them boxes the ship.
  // Instead: each panel is an outer rim + inner hub joined by radial spokes; a
  // hexagonal-prism pylon joins each panel hub to a cockpit cap; the ball is two
  // cap hexagons (y=±78) and two equator octagon belts (y=±26) chained together.
  // Guarded by an isSingleComponent connectivity test (the deriveRings ring-closure
  // guard is wrong for this geometry); kept bilaterally Y-symmetric, no orphans.
  edges: [
    // bottom solar panel (y=-208): outer rim, inner hub, radial spokes
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
    [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 6],
    [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11],
    // top solar panel (y=208): outer rim, inner hub, radial spokes
    [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 12],
    [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 18],
    [12, 18], [13, 19], [14, 20], [15, 21], [16, 22], [17, 23],
    // pylons: panel hub -> cockpit cap (vertically aligned hexagonal prisms)
    [6, 24], [7, 25], [8, 26], [9, 27], [10, 28], [11, 29],
    [18, 30], [19, 31], [20, 32], [21, 33], [22, 34], [23, 35],
    // cockpit caps (hexagons at y=-78 / y=78)
    [24, 25], [25, 26], [26, 27], [27, 28], [28, 29], [29, 24],
    [30, 31], [31, 32], [32, 33], [33, 34], [34, 35], [35, 30],
    // cockpit-ball equator belts (octagons at y=-26 / y=26)
    [36, 37], [37, 38], [38, 39], [39, 40], [40, 41], [41, 42], [42, 43], [43, 36],
    [44, 45], [45, 46], [46, 47], [47, 48], [48, 49], [49, 50], [50, 51], [51, 44],
    // belt struts: lower belt <-> upper belt (the equator)
    [36, 44], [37, 45], [38, 46], [39, 47], [40, 48], [41, 49], [42, 50], [43, 51],
    // cap -> belt struts: cockpit cap down/up to the ball equator
    [24, 36], [25, 37], [26, 39], [27, 41], [28, 42], [29, 43],
    [30, 44], [31, 45], [32, 47], [33, 49], [34, 50], [35, 51],
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
  // RE-AUTHORED by structure (story 8-10, revised) — like TIE_FIGHTER, built from
  // the real sub-bodies rather than by closing deriveRings() rings (which would
  // box it). Vader's TIE Advanced has BENT solar wings, so each wing is an outer
  // octagon rim + a small inner square hub (the bend line, at y=±270) joined by
  // spokes; a 4-strut pylon joins each wing hub to a cockpit square (y=±60); and
  // the ball is two cockpit squares, two pod-belt octagons (y=±30/±80), and a +x
  // nose octagon, all chained together. Guarded by an isSingleComponent
  // connectivity test; kept bilaterally Y-symmetric, no orphans.
  edges: [
    // bottom wing (y=-180/-270): outer octagon rim, inner square hub, spokes
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
    [8, 9], [9, 10], [10, 11], [11, 8],
    [0, 8], [7, 8], [1, 9], [2, 9], [3, 10], [4, 10], [5, 11], [6, 11],
    // top wing (y=180/270)
    [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 12],
    [20, 21], [21, 22], [22, 23], [23, 20],
    [12, 20], [19, 20], [13, 21], [14, 21], [15, 22], [16, 22], [17, 23], [18, 23],
    // pylons: wing inner square -> cockpit square (y=±60)
    [8, 24], [9, 25], [10, 26], [11, 27],
    [20, 28], [21, 29], [22, 30], [23, 31],
    // cockpit squares (y=-60 / y=60)
    [24, 25], [25, 26], [26, 27], [27, 24],
    [28, 29], [29, 30], [30, 31], [31, 28],
    // pod-belt octagons (y=-30/-80 and y=30/80)
    [32, 33], [33, 34], [34, 35], [35, 36], [36, 37], [37, 38], [38, 39], [39, 32],
    [40, 41], [41, 42], [42, 43], [43, 44], [44, 45], [45, 46], [46, 47], [47, 40],
    // belt struts: lower belt <-> upper belt (the equator)
    [32, 40], [33, 41], [34, 42], [35, 43], [36, 44], [37, 45], [38, 46], [39, 47],
    // cockpit square -> belt struts
    [24, 39], [25, 34], [26, 35], [27, 38],
    [28, 47], [29, 42], [30, 43], [31, 46],
    // +x nose octagon and its attachment to the belts
    [48, 49], [49, 50], [50, 51], [51, 52], [52, 53], [53, 54], [54, 55], [55, 48],
    [55, 34], [54, 35], [50, 42], [51, 43],
    [48, 33], [49, 41], [52, 44], [53, 36],
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

/**
 * Authentic `Obj_Trench_Squares` geometry from the cabinet disassembly: two
 * concentric floor squares (outer 0-3, inner 4-7) lying flat in y=0. The ported
 * floor rings already close cleanly; story 8-5 adds the CATWALK RAILS that bridge
 * each outer corner to its matching inner corner, so the trench reads as one
 * connected channel instead of two free-floating rims. Rails stay in the y=0
 * plane (the camera skims the floor) and span the rings without disturbing either
 * loop, so the induced-single-cycle topology guard still holds.
 */
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
    // outer floor square
    [0, 1], [0, 3], [1, 2], [2, 3],
    // inner floor square
    [4, 5], [4, 7], [5, 6], [6, 7],
    // catwalk rails: each outer corner to its matching inner corner
    [0, 4], [1, 5], [2, 6], [3, 7],
  ],
}

/**
 * The trench exhaust port — the run's target. No authentic vertex table exists
 * for it in `Object_3D_Data.asm`, so the geometry is authored here: a small
 * octagonal opening lying flat in the y=0 floor plane, ring-based from the start
 * (a single closed loop), per the epic's geometry-connectivity contract. The
 * symmetric (±64,±27)/(±27,±64) octagon keeps every vertex at one exact integer
 * radius, so it reads as a single ring and avoids floating-point drift. Display
 * orientation (recessing it into the trench floor / facing the run) is a render
 * concern applied in the shell, not baked into this object-space data.
 */
export const EXHAUST_PORT: Model3D = {
  name: 'Exhaust Port',
  vertices: [
    [64, 0, 27],
    [27, 0, 64],
    [-27, 0, 64],
    [-64, 0, 27],
    [-64, 0, -27],
    [-27, 0, -64],
    [27, 0, -64],
    [64, 0, -27],
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
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
  EXHAUST_PORT,
]
