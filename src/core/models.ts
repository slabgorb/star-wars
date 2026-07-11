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
// DEATH_STAR_SURFACE edges were RE-AUTHORED from their own ring structure
// (story 8-4): each coplanar, equal-radius vertex set is closed into a single
// loop, then joined with radial spokes (rim → hub) and struts (between stacked
// rings). This replaces the original 8-2 nearest-neighbour heuristic, which was
// well-formed but rendered as a tangle (rims never closed). The reconstruction
// is guarded by an induced-single-cycle topology test (tests/core/models.test.ts).
// SURFACE_TOWER was later re-authored AGAIN from the original Atari source
// (story sw3-11 — see its doc comment): its vertices AND stroke order are the
// real WSOBJ.MAC ground-tower data, so its guard is connectivity, not
// ring-closure (the cabinet never closes the 3-point cross-sections). TRENCH's floor squares already closed cleanly; story
// 8-5 connected them with catwalk rails and added the ring-based EXHAUST_PORT.
// TIE_FIGHTER and DARTH_TIE were likewise RE-AUTHORED from their own ring structure
// (story 8-10), clearing the inherited 8-2 heuristic-edge debt; both are now closed
// into ring loops + symmetric struts and guarded by the same topology test.
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

/**
 * Authentic GROUND LASAR TOWER column (Story sw3-11) — the surface tower body.
 *
 * RE-AUTHORED from the original Atari source (historicalsource/star-wars @
 * 5355b76, "Warp Speed"): WSOBJ.MAC `.WP GND` point table (scale `.S=30.*4`,
 * heights recentred by GD$MDT — recentring dropped here, base on y=0). The ROM
 * profile, in .S units, is (h,r) = (0,8) (6,6) (14,5) (52,4) (58,4): a TALL
 * tapering column, 58 high on a 16-wide footprint (~3.6:1), with 3-point
 * front/left/right cross-sections — never 4-corner boxes. Ported here at ×4
 * world units per .S unit, so the composite (column + TOWER_CAP) peaks at
 * y = 232 ≈ 2× SKIM_ALTITUDE — the ROM's GD$MDT ("PART WAY UP TOWERS") puts the
 * ship's skim height at about mid-tower, and 120 ≈ 232/2 keeps that feel.
 *
 * This model is the STUB portion (WSOBJ `.WGD STB` — the yellow column, levels
 * 0..52); the white cannon/hat section (52..58) is the separate TOWER_CAP so the
 * shell can stroke it VGCWHT. EDGES follow the cabinet's `.WGD TWR/STB` draw
 * code: three vertical profile polylines (right, front, left) meeting at the
 * base front and the cannon bottom — the cross-section triangles are NEVER
 * closed (the cabinet strokes no horizontal bands; see the revised 8-4 guard).
 *
 * (The model this replaces was local-disasm `Object_10`, misidentified as the
 * tower — its base rectangle is identical to `Obj_Trench_Squares`' outer floor
 * square; it is trench furniture, the catwalk brace of the EXHAUST_PORT note.)
 */
export const SURFACE_TOWER: Model3D = {
  name: 'Surface Tower',
  vertices: [
    // base ring (y = 0, r = 32): front / left / right
    [-32, 0, 0],
    [0, 0, 32],
    [0, 0, -32],
    // near-bottom ring (y = 24, r = 24)
    [-24, 24, 0],
    [0, 24, 24],
    [0, 24, -24],
    // midline ring (y = 56, r = 20)
    [-20, 56, 0],
    [0, 56, 20],
    [0, 56, -20],
    // cannon-bottom ring (y = 208, r = 16) — the cap's seat
    [-16, 208, 0],
    [0, 208, 16],
    [0, 208, -16],
  ],
  edges: [
    // right profile: base front across to the right corner, then up
    [0, 2], [2, 5], [5, 8], [8, 11],
    // front profile: across the cannon bottom, then down the front to the base
    [11, 9], [9, 6], [6, 3], [3, 0],
    // left profile: across the base, up the left, closing at the cannon bottom
    [0, 1], [1, 4], [4, 7], [7, 10], [10, 9],
  ],
}

/**
 * The tower's WHITE CAP (Story sw3-11) — the ROM's cannon/hat section, WSOBJ.MAC
 * `.WP GND` levels 52→58 (r = 4), drawn by `.WGD TWR` in the "special" color:
 * WSGRND.MAC GDVIEW `VGCWHT` — "SO DRAW IT SPECIAL WHITE". Replaces the sw2-3
 * authored TOWER_CUBE. A separate model because Canvas strokes one color per
 * drawWireframe call; it shares the tower's placement transform and seats
 * exactly on the column's cannon-bottom ring (y = 208), peaking at
 * y = 232 = TOWER_HEIGHT — the tower's gun, where its fireballs erupt (WYSIWYG).
 * Edges follow the cabinet's white strokes: up the right and left cap sides,
 * across the top, and the partial cannon-bottom ring (front→right, front→left).
 */
export const TOWER_CAP: Model3D = {
  name: 'Tower Cap',
  vertices: [
    // cannon-bottom ring (y = 208, r = 16): front / left / right
    [-16, 208, 0],
    [0, 208, 16],
    [0, 208, -16],
    // top-of-tower ring (y = 232, r = 16)
    [-16, 232, 0],
    [0, 232, 16],
    [0, 232, -16],
  ],
  edges: [
    // right side up, across the top, down the front
    [2, 5], [5, 3], [3, 0],
    // left side up to the top front
    [1, 4], [4, 3],
    // partial cannon-bottom ring (the cabinet's BDRAWTO 7,9 / 7,8)
    [0, 2], [0, 1],
  ],
}

/**
 * Authentic GROUND BUNKER (Story sw3-11) — WSOBJ.MAC `.WGD BNK`, which draws
 * ONLY the base (r=8) and near-bottom (r=6, h=6) rings of the shared GND point
 * table: a squat truncated pyramid, the macro's own word — "SHORTY" (6 high on
 * a 16-wide footprint). Lone undamaged bunkers stroke `VGCRED` (GDVIEW).
 * Same ×4 scale as SURFACE_TOWER. Quota note for the sim: WSGRND's BUNKER maze
 * macro never increments `.TWRS` — bunkers do not count toward the tower quota.
 */
export const SURFACE_BUNKER: Model3D = {
  name: 'Surface Bunker',
  vertices: [
    // base ring (y = 0, r = 32): front / left / right
    [-32, 0, 0],
    [0, 0, 32],
    [0, 0, -32],
    // top ring (y = 24, r = 24)
    [-24, 24, 0],
    [0, 24, 24],
    [0, 24, -24],
  ],
  edges: [
    // left face: base front → left corner → up → across to the top front
    [0, 1], [1, 4], [4, 3], [3, 0],
    // right face: base front → right corner → up → across to the top front
    [0, 2], [2, 5], [5, 3],
    // the top cross-stroke (the cabinet's BDRAWTO 14,15)
    [4, 5],
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
 * The trench exhaust port — the run's target. Trued against the fidelity epic's
 * findings dump (fidelity epic task 4; findings ## Exhaust port & run outcome /
 * ## Trench geometry & limits / Open follow-ups #1): the port is a scripted
 * hit-test PLANE (the type-3 segment latches `DPbyte_92/93`, a Z-boundary, not a
 * drawn shape) — `Object_3D_Data.asm` has no vertex table named or addressed for
 * it. The nearest candidate in the vertex dump, `Object_12` @ `$6545` (12 verts,
 * Z=0, three concentric squares at corner magnitudes `$60/$A0/$100` = 96/160/256),
 * sits right after the trench's other fixtures (`Object_10` catwalk brace,
 * `Object_11` posts) — but the findings doc itself flags that identity an AGENT
 * INFERENCE ("targeting-reticle / lock-on box"), not a confirmed source name, so
 * it is not safe to claim as the port. The geometry therefore stays AUTHORED: a
 * small octagonal opening lying flat in the y=0 floor plane, ring-based from the
 * start (a single closed loop), per the epic's geometry-connectivity contract.
 * The symmetric (±64,±27)/(±27,±64) octagon keeps every vertex at one exact
 * integer radius, so it reads as a single ring and avoids floating-point drift.
 * Display orientation (recessing it into the trench floor / facing the run) is a
 * render concern applied in the shell, not baked into this object-space data.
 * PROVISIONAL(findings ## Trench geometry & limits) — no authentic vertex table
 * to port; see Open follow-ups #1.
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
 * stitched into the shell) seated on the +X axis, i.e. on the y=0 and z=0 planes,
 * so the body keeps its bilateral symmetry. Origin-centred in object space; the
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

  // Superlaser dish, centred on +X. The rim ring sits ON the shell; the focus is
  // recessed toward the centre, giving the concave dish. Stitched to the nearest
  // shell vertices so the dish is part of one connected wireframe, not a floater.
  const sphereCount = vertices.length
  const DISH = 8
  const rd = R * 0.42
  const xRim = Math.sqrt(R * R - rd * rd)
  const dishStart = vertices.length
  for (let m = 0; m < DISH; m++) {
    const psi = (2 * Math.PI * m) / DISH
    vertices.push([xRim, rd * Math.cos(psi), rd * Math.sin(psi)])
  }
  const focus = vertices.push([R * 0.6, 0, 0]) - 1
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
