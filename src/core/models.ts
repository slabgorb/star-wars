// src/core/models.ts
//
// 3D vector model registry — the authentic Star Wars cabinet geometry.
//
// VERTICES are ported verbatim from the cabinet disassembly
// (reference/disasm/Object_3D_Data.asm — gitignored, never committed): the real
// signed 16-bit object-space coordinates from the 1983 board. The leading
// (0,0,0) object anchor in each table is metadata, not a drawn point, so it is
// dropped — so for most models every exported vertex is a render vertex.
//
// THE ONE EXCEPTION (sw5-5): the three GROUND LASAR TOWER objects — SURFACE_TOWER,
// TOWER_CAP, SURFACE_BUNKER — each carry the ROM's SHARED fifteen-point `.WP GND`
// table while their own `.WGD` draw routine strokes only a subset of it, so they
// DO hold vertices their edges never touch. That is ROM structure, not dead weight
// (WSOBJ.MAC's `.WPZ2 TWR/BNK/STB` alias one table across four objects), and it is
// load-bearing: the contact sheet will not diff edges until the port's vertex array
// deep-equals the ROM's. tests/core/models.test.ts carries the matching, named
// orphan-vertex carve-out and re-asserts the invariant's intent over what each model
// actually draws.
//
// EDGES are authored here, not ported: Object_3D_Data.asm holds vertex tables
// only — the line-segment connectivity lived in the AVG vector-draw routines,
// which are not recoverable by object name from the disassembly we have. The
// wireframe is therefore derived from the geometry itself.
//
// DEATH_STAR_SURFACE edges were RE-AUTHORED from their own ring structure
// (story 8-4): each coplanar, equal-radius vertex set is closed into a single
// loop, then joined with radial spokes (rim → hub) and struts (between stacked
// rings). This replaces the original 8-2 nearest-neighbour heuristic, which was
// well-formed but rendered as a tangle (rims never closed). The reconstruction
// is guarded by an induced-single-cycle topology test (tests/core/models.test.ts).
// The ground objects were re-authored from the original Atari source by story
// sw3-11 and then RE-PORTED by sw5-5, which is the version that stands: sw3-11 read
// the `.PGND` height column in decimal from a `.RADIX 16` file and re-expressed the
// models in a private ×4 y-up frame, so its "real WSOBJ.MAC data" was neither the
// ROM's numbers nor the ROM's frame. As of sw5-5 the vertices AND the stroke order
// ARE the ROM's (see each model's doc comment), so their guard is connectivity, not
// ring-closure (the cabinet never closes the 3-point cross-sections).
// TRENCH's floor squares already closed cleanly; story
// 8-5 connected them with catwalk rails and added the ring-based EXHAUST_PORT.
// TIE_FIGHTER was RE-AUTHORED from its own ring structure (story 8-10), clearing
// the inherited 8-2 heuristic-edge debt; it is closed into ring loops + symmetric
// struts and guarded by a connectivity test. DARTH_TIE was authored the same way by
// 8-10, but story sw5-2 RE-PORTED its edges from the ROM draw list `.WL RTH`
// (WSOBJ.MAC) — so it is no longer authored; it is the ROM's six pen-up sub-bodies
// (see its own doc comment). TIE_FIGHTER's own re-port is story sw5-3.
//
// PURE data. No DOM, no time, no randomness — safe for the deterministic core.

import type { Vec3 } from '@arcade/shared/math3d'

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

// The three EXPLODED-TIE death fragments (`Obj_Tie_Wing_Frag_1/2/3`, ROM object
// labels `TI1`/`TI2`/`TI3`; cabinet source WSOBJ.MAC). A shot TIE breaks into its
// left wing+strut, its right wing+strut, and its centre cabin. Vertices are the
// authentic ROM point tables at the same `.S=13.` scale as `TIE_FIGHTER` (each raw
// coord ×13); edges follow the ROM's shared draw routine (`.WL TI1` / `.WL2 TI2`
// draw both wings; `.WL TI3` draws the cabin), re-authored here as index pairs.
//
// The two wings are the SAME shape on different planes — TI2 is TI1 rigidly turned
// about the fin axis, (x,y,z) → (x,z,−y) — so they share one edge list. The cabin
// reuses the TIE fighter's own aft half (its verts 25–52 are byte-identical to
// TI3), so it is sliced straight off `TIE_FIGHTER` rather than re-transcribed.

/** Shared wing connectivity for both exploded wings: the small fin circle, the
 *  strut circle, the outer fin hexagon, and the radial "spider" lines joining them
 *  (ROM `.WL TI1`/`.WL2 TI2`). Same index pairs for TI1 and TI2 (shared routine). */
const TIE_WING_FRAG_EDGES: ReadonlyArray<readonly [number, number]> = [
  // small circle on the fin (inner)
  [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 6],
  // strut circle
  [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 12],
  // outer fin hexagon
  [6, 0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
  // spider lines: outer fin → inner circle → strut
  [1, 7], [7, 13], [14, 8], [8, 2], [3, 9], [9, 15], [16, 10], [10, 4], [5, 11], [11, 17],
]

/** `Obj_Tie_Wing_Frag_1` (`TI1`) — the exploded TIE's LEFT wing + strut (18 verts). */
export const TIE_WING_FRAG_1: Model3D = {
  name: 'TIE Fragment Left Wing',
  vertices: [
    // left outer fin (ROM y = −2 plane)
    [-130, -26, 234], [104, -26, 234], [182, -26, 0], [104, -26, -234], [-130, -26, -234], [-208, -26, 0],
    // small circle on the fin
    [-26, -26, 26], [0, -26, 26], [13, -26, 0], [0, -26, -26], [-26, -26, -26], [-39, -26, 0],
    // inner circle on the strut (ROM y = 10 plane)
    [-26, 130, 26], [0, 130, 26], [13, 130, 0], [0, 130, -26], [-26, 130, -26], [-39, 130, 0],
  ],
  edges: TIE_WING_FRAG_EDGES,
}

/** `Obj_Tie_Wing_Frag_2` (`TI2`) — the exploded TIE's RIGHT wing + strut (18 verts).
 *  Same shape as TI1, rotated onto a new plane: (x,y,z) → (x,z,−y). */
export const TIE_WING_FRAG_2: Model3D = {
  name: 'TIE Fragment Right Wing',
  vertices: [
    // right outer fin (ROM z = 2 plane)
    [-130, 234, 26], [104, 234, 26], [182, 0, 26], [104, -234, 26], [-130, -234, 26], [-208, 0, 26],
    // small circle on the fin
    [-26, 26, 26], [0, 26, 26], [13, 0, 26], [0, -26, 26], [-26, -26, 26], [-39, 0, 26],
    // inner circle on the strut (ROM z = −10 plane)
    [-26, 26, -130], [0, 26, -130], [13, 0, -130], [0, -26, -130], [-26, -26, -130], [-39, 0, -130],
  ],
  edges: TIE_WING_FRAG_EDGES,
}

/** `Obj_Tie_Wing_Frag_3` (`TI3`) — the exploded TIE's CENTRE cabin (28 verts). Its
 *  points are byte-identical to `TIE_FIGHTER`'s aft half (verts 25–52: the two inner
 *  strut circles + the two cockpit-ball body octagons), so they are sliced off it. */
export const TIE_WING_FRAG_3: Model3D = {
  name: 'TIE Fragment Cabin',
  vertices: TIE_FIGHTER.vertices.slice(-28),
  edges: [
    // strut pentagon
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
    // strut → body connectors
    [12, 13], [13, 14], [14, 22],
    [14, 15], [15, 16], [16, 24],
    [16, 17], [17, 18], [18, 19], [19, 12],
    // body octagon (aft ball rim)
    [20, 21], [21, 22], [22, 23], [23, 24], [24, 25], [25, 26], [26, 27], [27, 20],
    // second strut hexagon
    [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 6],
    // spider lines binding cabin rings together
    [7, 21], [21, 13], [13, 1],
    [2, 15],
    [23, 8],
    [9, 25], [25, 17], [17, 3],
    [4, 18], [18, 26], [26, 10],
    [11, 27], [27, 19], [19, 5],
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
  // Edges are the ROM draw list `.WL RTH` (WSOBJ.MAC:1427-1479), re-ported by
  // story sw5-2 — replacing story 8-10's heuristic reconstruction, which invented
  // 44 edges the ROM never draws (the rim→hub spokes and a 4-strut pylon) and
  // missed 12 it does. The AVG hardware strokes the ship as SIX pen-up runs (`.BD`
  // blank-moves between them), so the authentic wireframe is six disjoint
  // sub-bodies, not one connected blob: the two wing octagons, the two wing
  // struts+squares, the body equator belts, and the +x front-window octagon.
  // Indices are 0-based — the ROM's 1-based draw indices minus the dropped
  // `.P 0,0,0` anchor. The ROM's one degenerate self-edge (`.BD …,21,21,…` →
  // [20,20]) is NOT copied: it strokes a zero-length line, not connectivity. Order
  // and grouping follow `.WL RTH`'s own section labels; the independent-oracle
  // proof (0/0 drift vs a hand-decoded `.WL RTH`) is tests/core/darth-tie-rom.test.ts.
  edges: [
    // RIGHT WING — .BD 8,1,2,3,8,7,4,3 / .BD 4,5,6,7
    [7, 0], [0, 1], [1, 2], [2, 7], [7, 6], [6, 3], [3, 2], [3, 4], [4, 5], [5, 6],
    // RIGHT STRUT — .BD 12,11,10,9,12,28 / .BD 27,11 / .BD 10,26 / .BD 25,9
    [11, 10], [10, 9], [9, 8], [8, 11], [11, 27], [26, 10], [9, 25], [24, 8],
    // BODY — .BD 37,36,35,34,42,43,44,45,37 / .LD 38,46,47,48,41,33,40,39,38 / cross-struts
    [36, 35], [35, 34], [34, 33], [33, 41], [41, 42], [42, 43], [43, 44], [44, 36],
    [36, 37], [37, 45], [45, 46], [46, 47], [47, 40], [40, 32], [32, 39], [39, 38], [38, 37],
    [38, 35], [34, 39], [32, 33], [41, 40], [47, 42], [43, 46], [45, 44],
    // LEFT STRUT — .BD 31,23,22,21,21,24,23 (the 21,21 self-edge dropped) / .BD 22,30 / .BD 29,21 / .BD 24,32
    [30, 22], [22, 21], [21, 20], [20, 23], [23, 22], [21, 29], [28, 20], [23, 31],
    // LEFT WING — .BD 19,18,17,16,19,20,15,16 / .BD 15,14,13,20
    [18, 17], [17, 16], [16, 15], [15, 18], [18, 19], [19, 14], [14, 15], [14, 13], [13, 12], [12, 19],
    // FRONT WINDOW — .BD 49,50,51,52,53,54,55,56,49,53 / .BD 54,50 / .BD 51,55 / .BD 56,52
    [48, 49], [49, 50], [50, 51], [51, 52], [52, 53], [53, 54], [54, 55], [55, 48], [48, 52],
    [53, 49], [50, 54], [55, 51],
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

// --- the GROUND LASAR TOWER family (WSOBJ.MAC `.WP GND`) ----------------------
//
// Re-ported from the original Atari source by story sw5-5, replacing sw3-11's
// hand-re-authored versions. Two things changed, and both matter:
//
// 1. RAW ROM UNITS, like every ship model above. sw3-11 re-authored these three
//    into a private frame (×4, y-up, base on y=0), which is why they were the
//    only models the contact sheet could not compare against the ROM. They now
//    carry `.WP GND`'s table verbatim, in the ROM's own axes:
//
//        x = fore/aft (the "FRONT" point is -x)   y = lateral   z = UP
//
//    Standing them up in the y-up world is the SHELL's job — see render.ts's
//    TOWER_ORIENT / GROUND_MODEL_SCALE.
//
// 2. THE HEIGHTS ARE HEX. WSOBJ.MAC is `.RADIX 16`, so the `.PGND` height column
//    reads 0x14 / 0x52 / 0x58 = 20 / 82 / 88 — not the decimal 14 / 52 / 58 that
//    sw3-11 transcribed. The shipped tower was therefore too short AND wrong in
//    the middle. (The arithmetic settles it: 0x58 × 120 − GD$MDT = 6720, which is
//    exactly what the ROM bake emits; the decimal reading gives 3120, a number
//    that appears nowhere in the ROM.)
//
// ONE TABLE, FOUR OBJECTS. `.WPZ2 TWR` / `.WPZ2 BNK` / `.WPZ2 STB` all alias
// `.WP GND`: the four objects SHARE these fifteen points and differ only in which
// of them their `.WGD` draw routine strokes. So each model below carries the full
// table while its own edges touch a subset — the untouched points are ROM
// structure, not port dead weight, and trimming them would break the vertex
// equality the contact sheet needs before it will diff edges at all.
// (tests/core/models.test.ts carries the matching orphan carve-out.)

/**
 * GD$MDT — WSOBJ.MAC's "OFFSET HITE TO MID OF PLAYERS HITE" (0xF00).
 *
 * The ROM recentres every ground object's height by this, so that model z = 0
 * sits at the height the player flies at and the base ring lands at z = -GD$MDT.
 * It is therefore the ROM's own statement of the skim altitude: the shell undoes
 * the recentring to seat the base on the floor (render.ts), and state.ts's
 * SKIM_ALTITUDE is this value at the shell's presentation scale.
 */
export const GD_HEIGHT_OFFSET = 0xf00

/**
 * Authentic GROUND LASAR TOWER column — the surface tower body (sw3-11, re-ported
 * from the ROM by sw5-5).
 *
 * This model is the STUB: WSOBJ.MAC `.WGD STB`, "STUB OF TOWER WITHOUT BUNKER HAT
 * ON TOP" — the yellow column. It strokes 12 of the shared table's 15 points,
 * leaving the cannon-top ring (points 3-5) bare, because in the ROM the white cap
 * strokes it. The profile, in .S units, is (h,r) = (0,8) (6,6) (0x14,5) (0x52,4)
 * (0x58,4): a tall waisted column, 0x58 = 88 high on a 16-wide footprint (5.5:1),
 * with 3-point front/left/right cross-sections — never 4-corner boxes, and the
 * cabinet never closes them into horizontal bands.
 *
 * The cannon/hat section (0x52 → 0x58) is the separate TOWER_CAP so the shell can
 * stroke it VGCWHT; see that model for why the split exists and what proves it
 * lossless.
 *
 * (The model this replaces was local-disasm `Object_10`, misidentified as the
 * tower — its base rectangle is identical to `Obj_Trench_Squares`' outer floor
 * square; it is trench furniture, the catwalk brace of the EXHAUST_PORT note.)
 */
export const SURFACE_TOWER: Model3D = {
  name: 'Surface Tower',
  vertices: [
    // The shared `.WP GND` table: five 3-point cross-sections (front/left/right).
    // z = h × .S(120) − GD$MDT, with h read in the file's own hex radix.
    [-960, 0, -3840], [0, 960, -3840], [0, -960, -3840], //  0- 2  h=0     r=8  BASE
    [-480, 0, 6720], [0, 480, 6720], [0, -480, 6720], //     3- 5  h=0x58  r=4  TOP OF CANNON
    [-480, 0, 6000], [0, 480, 6000], [0, -480, 6000], //     6- 8  h=0x52  r=4  BOTTOM OF CANNON
    [-600, 0, -1440], [0, 600, -1440], [0, -600, -1440], //  9-11  h=0x14  r=5  MIDLINE
    [-720, 0, -3120], [0, 720, -3120], [0, -720, -3120], // 12-14  h=6     r=6  NEAR BOTTOM
  ],
  // `.WGD STB` — three vertical profile polylines meeting at the base front and
  // the cannon seat. The routine's own 1-based point numbers, minus one:
  //   BDRAWTO 1,3,15,12,9   ;UP RIGHT SIDE
  //   DRAWTO  7,10,13,1     ;DOWN CENTER
  //   DRAWTO  2,14,11,8,7   ;UP LEFT SIDE
  edges: [
    [0, 2], [2, 14], [14, 11], [11, 8], // up the right side
    [8, 6], [6, 9], [9, 12], [12, 0], // down the centre
    [0, 1], [1, 13], [13, 10], [10, 7], [7, 6], // up the left side
  ],
}

/**
 * The tower's WHITE CAP — the ROM's cannon/hat section (sw3-11, re-ported by
 * sw5-5): the strokes `.WGD TWR` makes under `MOVD M.GDCT`, the "special" colour
 * of WSGRND.MAC's GDVIEW ("SO DRAW IT SPECIAL WHITE"). It spans the shared table's
 * cannon rings, h = 0x52 → 0x58 (r = 4).
 *
 * WHY THIS MODEL EXISTS AT ALL — in the ROM it does not. `.WGD TWR` (which IS
 * `.WGD2 GND`: one object, two names, ONE draw routine) strokes the column and the
 * hat together in a single plot, switching pen colour mid-draw. Canvas strokes one
 * colour per `drawWireframe` call, so the port splits that single routine into two
 * models — a COLOUR split, not a geometry one. It is lossless, and provably so:
 * SURFACE_TOWER's 13 edges ∪ this model's 7 (2 shared) are exactly the 18 edges of
 * `.WGD TWR` (pinned in tests/core/ground-objects-rom.test.ts). The two share the
 * ROM point table and hence the placement transform, so the cap cannot drift off
 * the column's cannon ring.
 *
 * The 2-edge overlap with SURFACE_TOWER is the ROM's, not sloppiness: the partial
 * cannon-bottom ring is stroked white here, and in the base colour by the stub to
 * close its open top. Each port model inherits its own routine's version.
 *
 * The cap's top ring is the highest thing drawn at a tower site — the gun, where
 * the tower's fireballs erupt (state.ts TOWER_HEIGHT, WYSIWYG).
 */
export const TOWER_CAP: Model3D = {
  name: 'Tower Cap',
  vertices: SURFACE_TOWER.vertices, // `.WPZ2` — the same `.WP GND` table
  // The 7 white strokes of `.WGD TWR`: up the cannon sides, across the top, and
  // the partial cannon-bottom ring (BDRAWTO 7,9 / 7,8).
  edges: [
    [8, 5], [5, 3], [3, 6], // up the right cannon side and across the top
    [7, 4], [4, 3], // up the left cannon side to the top front
    [6, 8], [6, 7], // the partial cannon-bottom ring
  ],
}

/**
 * Authentic GROUND BUNKER (sw3-11, re-ported by sw5-5) — WSOBJ.MAC `.WGD BNK`,
 * which strokes ONLY the base (r=8) and near-bottom (h=6, r=6) rings of the shared
 * GND table: a squat truncated pyramid, the macro's own word — "SHORTY" (6 high on
 * a 16-wide footprint). It never touches the column. Lone undamaged bunkers stroke
 * `VGCRED` (GDVIEW). Quota note for the sim: WSGRND's BUNKER maze macro never
 * increments `.TWRS` — bunkers do not count toward the tower quota.
 */
export const SURFACE_BUNKER: Model3D = {
  name: 'Surface Bunker',
  vertices: SURFACE_TOWER.vertices, // `.WPZ2` — the same `.WP GND` table
  // `.WGD BNK`:  BDRAWTO 1,2,14,13,1,3,15,13  /  BDRAWTO 14,15
  edges: [
    [0, 1], [1, 13], [13, 12], [12, 0], // the left face, up and back to the front
    [0, 2], [2, 14], [14, 12], // the right face
    [13, 14], // the top cross-stroke
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
 * The trench exhaust port — the run's target. Authentic, from WSOBJ.MAC `.WP PORT`
 * ("THERMAL EXHAUST PORT") and its `.WGD PORT` draw routine (sw5-4).
 *
 * This object was invented by hand until now, because the disassembly held no
 * vertex table the port could be identified with. It did hold the geometry —
 * `Object_12` @ `$6545`, "12 verts, Z=0, three concentric squares at $60/$A0/$100"
 * — but nothing in the dump said what that object WAS, so the old comment here
 * called the identification an inference and shipped an octagon instead. The 1983
 * source settles it: the object is named PORT and its comment reads ";THERMAL
 * EXHAUST PORT". The octagon is gone.
 *
 * TWELVE points in THREE CONCENTRIC SQUARES, all at third-component 0 — and that third
 * component is the ROM's HEIGHT axis, so this is a HORIZONTAL PLATE THAT LIES FLAT IN THE
 * TRENCH FLOOR. It is a hole in the floor, which is exactly where the old octagon was: the
 * octagon's PLANE was right all along; only its shape was wrong.
 *
 * ⚠ CORRECTED BY sw5-6 — and this comment is the reason the correction was needed.
 * It used to say the plate "looks down the trench at the pilot … it does NOT lie in the floor
 * plane the way the old octagon did", and the shell duly drew it under TRENCH_ORIENT = IDENTITY.
 * That maps the ROM's HEIGHT axis onto our DEPTH axis and stands the plate on its edge — half of
 * it buried below the floor. The ROM says so twice, and both were in this file's reach:
 *
 *   • `.MACRO .PGND .A,.B,.C ;OFFSET HITE TO MID OF PLAYERS HITE` applies the HEIGHT offset
 *     GD$MDT to the THIRD component. Third = height.
 *   • WSBASE.MAC `BSVPORT` seats the object: `LDD #-1000 / STD M.GD+4 ;Z HITE ON BOTTOM OF
 *     TRENCH`, `LDD #0 / STD M.GD+2 ;Y WIDTH IN CENTER`.
 *
 * render.ts's own TOWER_ORIENT already stated the convention in English ("The ROM's up-axis is Z
 * (x is fore/aft, y lateral); ours is Y") — the port simply was not given the same bridge. It is
 * now: PORT_ORIENT = rotationX(-90°). THE VERTICES BELOW ARE UNCHANGED and must stay 1:1 with the
 * ROM (romCompare deep-compares them, and PORT_HIT_RADIUS is bound to the porthole in these
 * units). Orientation is the SHELL's job — never re-seat this table to suit a viewing angle.
 *
 * The `.PH` rows are HEX under `.RADIX 16`, at `.S=8`:
 *
 *   .PH 0C,0C,0   ;0-3 INNER CIRCLE   0x0C * 8 =  96   the PORTHOLE — the hole
 *   .PH 14,14,0   ;4-7 SUPPORT BERM   0x14 * 8 = 160   the raised lip around it
 *   .PH 20,20,0   ;8-15 BASE          0x20 * 8 = 256   Death Star surface
 *
 * Read those as decimal and the base row lands on 160 — exactly the true berm —
 * collapsing three squares into two. (tests/core/exhaust-port-rom.test.ts refutes
 * the decimal reading arithmetically.)
 *
 * `.WGD PORT` strokes the plate in THREE PENS, and the pen changes are the ROM
 * telling us which part is which: VGCGRN the outer base, VGCTRQ the inner berm,
 * and VGCRED — commented ";PORTHOLE" — closing points 0-3 and nothing else. So the
 * HOLE is the ±96 inner square; the berm and base are structure around it. That is
 * what state.ts's PORT_HIT_RADIUS is tuned to, NOT the full 512-wide plate.
 *
 * Canvas strokes one colour per drawWireframe call, so the three pens collapse to
 * one here — the same limitation that split SURFACE_TOWER from TOWER_CAP. Left as
 * one model: no AC asks for the colours, and unlike the tower the port's draw
 * routine has no white/base split to reconcile.
 */
export const EXHAUST_PORT: Model3D = {
  name: 'Exhaust Port',
  // `.WP PORT`, in ROM order — the edge indices below are indices into THIS array.
  vertices: [
    [96, 96, 0], [96, -96, 0], [-96, 96, 0], [-96, -96, 0], //      0-3   porthole
    [160, 160, 0], [160, -160, 0], [-160, 160, 0], [-160, -160, 0], // 4-7   berm
    [256, 256, 0], [256, -256, 0], [-256, 256, 0], [-256, -256, 0], // 8-11  base
  ],
  // `.WGD PORT`, hand-walked: PLOT 5 / DRAWTO 9,8,4 / BDRAWTO 6,10,11,7 (green) /
  // DRAWTO 6,2 / BDRAWTO 6,4,0 / BDRAWTO 4,5,1 / BDRAWTO 5,7,3 (turquoise) /
  // DRAWTO 2,0,1,3 (red — the porthole).
  edges: [
    [5, 9], [9, 8], [8, 4], [6, 10], [10, 11], [11, 7], // outer base + its skirt
    [7, 6], [6, 2], [6, 4], [4, 0], [4, 5], [5, 1], [5, 7], [7, 3], // inner berm
    [3, 2], [2, 0], [0, 1], [1, 3], // the porthole, closed
  ],
}

/**
 * Trench wall turret — a squat wall-mounted emplacement (fidelity epic task 3;
 * findings ## Trench catwalks, turrets & wall squares — `sub_6FD9` "Draws
 * trench turrets"). No authentic vertex table is directly portable: the ROM's
 * `off_7CC0` → `off_7Bxx` shape blobs are confirmed (type-byte,dx,dy) draw
 * scripts where type 2 = "turret housing", but the extraction notes flag it
 * uncertain whether those blobs are placement or silhouette data, and there is
 * no recovered ROM↔world-unit scale to turn either into exact vertices (Open
 * follow-ups #1/#3). Authored here as a simple box-housing + barrel silhouette
 * consistent with that "housing" description; PROVISIONAL pending a dedicated
 * shape-decode pass.
 */
export const TRENCH_TURRET: Model3D = {
  name: 'Trench Turret',
  vertices: [
    [-30, 0, -30], [30, 0, -30], [30, 0, 30], [-30, 0, 30], // base
    [-16, 44, -16], [16, 44, -16], [16, 44, 16], [-16, 44, 16], // cap
    [0, 44, 0], [0, 72, 0], // barrel
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
    [8, 9],
  ],
}

/**
 * Trench wall square — the shootable wall panel (fidelity epic task 3;
 * findings ## Trench catwalks, turrets & wall squares — `sub_720B` "Draws
 * trench green squares"; scored via `byte_9850`). Authored as a flat panel
 * rectangle; PROVISIONAL for the same reason as TRENCH_TURRET — no recovered
 * exact ROM shape data (Open follow-ups #1/#3).
 */
export const TRENCH_SQUARE: Model3D = {
  name: 'Trench Square',
  vertices: [[-40, -40, 0], [40, -40, 0], [40, 40, 0], [-40, 40, 0]],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
}

/**
 * Trench catwalk — a girder spanning the channel, pure hazard (fidelity epic
 * task 3; findings ## Trench catwalks, turrets & wall squares — `sub_72D5`
 * "Draws trench catwalks"; type 1 = "catwalk cross-brace" in the ROM's shape
 * encoding, echoed here as the end-cap struts). PROVISIONAL for the same
 * reason as TRENCH_TURRET/TRENCH_SQUARE (Open follow-ups #1/#3).
 */
export const TRENCH_CATWALK: Model3D = {
  name: 'Trench Catwalk',
  vertices: [
    [-256, -12, 0], [256, -12, 0], [256, 12, 0], [-256, 12, 0],
    [-256, -12, -24], [256, -12, -24], [256, 12, -24], [-256, 12, -24],
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ],
}

/**
 * The Death Star BODY — the thing the space phase is attacking (story 11-7, ADR
 * 0002 part C). Unlike the disassembly-ported models, no authentic vertex table
 * exists for it, so it is generated procedurally in the pure core (the same
 * approach Tempest uses for its tube): a deterministic UV wireframe sphere —
 * latitude rings (one EXACTLY on the equator, since STACKS is even — that ring is
 * the iconic equatorial trench line) joined by longitude meridians and capped at
 * the poles — plus a recessed SUPERLASER DISH (an inset rim ring + a focus point,
 * stitched into the shell) seated on the +Z axis (facing the player in the space
 * phase), i.e. on the x=0 and y=0 planes, so the body keeps its bilateral
 * symmetry. Origin-centred in object space; the
 * shell seats and scales it (render.ts `deathStarPlacement`). PURE: trig only, no
 * DOM/time/random — deterministic.
 *
 * Display orientation and the exact dish placement are RENDER concerns to be
 * eyeballed in the dev server (repo convention — see render.ts SURFACE_ORIENT
 * note and the 11-7 session findings); this builder pins the structure only.
 */
export function buildDeathStar(): Model3D {
  const R = 520
  const STACKS = 8 // even ⇒ an exact equatorial ring (the trench line)
  const SLICES = 12
  const vertices: Vec3[] = []
  const edges: [number, number][] = []

  // Poles on the Y axis.
  const south = vertices.push([0, -R, 0]) - 1
  const north = vertices.push([0, R, 0]) - 1
  // Non-pole latitude rings j = 1..STACKS-1, each SLICES vertices.
  const ringStart: number[] = []
  for (let j = 1; j < STACKS; j++) {
    ringStart[j] = vertices.length
    const phi = -Math.PI / 2 + (Math.PI * j) / STACKS
    const y = R * Math.sin(phi)
    const rho = R * Math.cos(phi)
    for (let k = 0; k < SLICES; k++) {
      const theta = (2 * Math.PI * k) / SLICES
      vertices.push([rho * Math.cos(theta), y, rho * Math.sin(theta)])
    }
  }
  // Latitude ring loops.
  for (let j = 1; j < STACKS; j++) {
    for (let k = 0; k < SLICES; k++) edges.push([ringStart[j] + k, ringStart[j] + ((k + 1) % SLICES)])
  }
  // Longitude meridians between adjacent rings.
  for (let j = 1; j < STACKS - 1; j++) {
    for (let k = 0; k < SLICES; k++) edges.push([ringStart[j] + k, ringStart[j + 1] + k])
  }
  // Pole spokes.
  for (let k = 0; k < SLICES; k++) {
    edges.push([south, ringStart[1] + k])
    edges.push([north, ringStart[STACKS - 1] + k])
  }

  // Superlaser dish, centred on +Z — the camera-facing hemisphere in the space
  // phase (the body is drawn with IDENTITY orientation seated down −Z, so its +Z
  // face is the one the player sees; render.ts deathStarPlacement/cameraView). The
  // rim ring sits ON the shell; the focus is recessed toward the centre, giving the
  // concave dish. Stitched to the nearest shell vertices so the dish is part of one
  // connected wireframe, not a floater. (sw3-10: the pre-fix +X seat faced sideways,
  // so the dish was seen edge-on and rendered as an anomalous crossed spike.)
  const sphereCount = vertices.length
  const DISH = 8
  const rd = R * 0.42
  const zRim = Math.sqrt(R * R - rd * rd)
  const dishStart = vertices.length
  for (let m = 0; m < DISH; m++) {
    const psi = (2 * Math.PI * m) / DISH
    vertices.push([rd * Math.cos(psi), rd * Math.sin(psi), zRim])
  }
  const focus = vertices.push([0, 0, R * 0.6]) - 1
  for (let m = 0; m < DISH; m++) {
    const rim = dishStart + m
    edges.push([rim, dishStart + ((m + 1) % DISH)]) // rim loop
    edges.push([rim, focus]) // spoke to the recessed focus
    // Stitch the rim into the shell at its nearest sphere vertex.
    let best = 0
    let bestD = Infinity
    for (let si = 0; si < sphereCount; si++) {
      const dx = vertices[si][0] - vertices[rim][0]
      const dy = vertices[si][1] - vertices[rim][1]
      const dz = vertices[si][2] - vertices[rim][2]
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestD) {
        bestD = d
        best = si
      }
    }
    edges.push([rim, best])
  }

  return { name: 'Death Star', vertices, edges }
}

/** The procedural Death Star body (story 11-7). See `buildDeathStar`. */
export const DEATH_STAR: Model3D = buildDeathStar()

/**
 * The authentic model registry — the single source consumed by Wave 1+
 * (space combat, Death Star surface, trench run). The Wave 0 placeholder
 * CUBE is intentionally excluded; this registry is authentic geometry only.
 */
export const MODELS: readonly Model3D[] = [
  TIE_FIGHTER,
  DARTH_TIE,
  TIE_WING_FRAG_1,
  TIE_WING_FRAG_2,
  TIE_WING_FRAG_3,
  DEATH_STAR_SURFACE,
  SURFACE_TOWER,
  TOWER_CAP,
  SURFACE_BUNKER,
  TRENCH,
  EXHAUST_PORT,
  DEATH_STAR,
  TRENCH_TURRET,
  TRENCH_SQUARE,
  TRENCH_CATWALK,
]
