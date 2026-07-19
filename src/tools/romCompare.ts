// src/tools/romCompare.ts
//
// Pairs the baked ROM geometry (romModels.generated.ts) against the shipped
// models (core/models.ts) and diffs their edges. PURE — no DOM — so the pairing
// and the diff are unit-tested; contactSheet.ts only renders the result.
//
// Dev tool. Never imported by src/core.

import { MODELS, type Model3D } from '../core/models'
import { ROM_MODELS, type RomModel } from './romModels.generated'
import type { Vec3 } from '@arcade/shared/math3d'

/**
 * ROM object name (WSOBJ.MAC) -> the `name` of its counterpart in MODELS.
 *
 * Verified against src/core/models.ts's own doc comments and against
 * WSOBJ.MAC (~/Projects/star-wars-1983-source-text) — NOT copied blind from a
 * draft.
 *
 * - GND, TWR, and STB all alias the SAME 15-vertex point table (`.WP GND`,
 *   `.WPZ2 TWR`, `.WPZ2 STB`), so vertex identity alone can't tell them
 *   apart — the DRAW LISTS do. `.WGD TWR` is immediately followed by
 *   `.WGD2 GND` (WSOBJ.MAC:1729-1730), which sets `LN = .-1` — the same type
 *   byte as TWR. GND and TWR are therefore NOT two objects; they are ONE
 *   object (two names for one draw routine), and that routine strokes the
 *   WHOLE tower: base column AND the white cannon cap, in a single PLOT.
 *   `.WGD STB` (WSOBJ.MAC:1761) is a SEPARATE, shorter routine that stops at
 *   the cannon-bottom ring (levels 0..52) — no cap. `models.ts`'s own
 *   SURFACE_TOWER doc comment names exactly this: "the STUB portion (WSOBJ
 *   `.WGD STB` — the yellow column, levels 0..52)". That is the decisive
 *   citation, so the map is `STB -> Surface Tower`.
 *   GND and TWR are left UNMAPPED. An earlier draft of this map paired GND
 *   with the column (Surface Tower) and TWR with the cap (Tower Cap), as if
 *   they were two distinct ROM objects — WSOBJ.MAC says otherwise (one draw
 *   routine, two names), and there is no ROM object that corresponds 1:1 to
 *   TOWER_CAP alone: the cap only ever exists as the top portion of TWR/GND's
 *   combined draw, split into its own port model purely because Canvas
 *   strokes one colour per drawWireframe call (see TOWER_CAP's own comment).
 *   For a `hasDrawList: false` object the map's only functional effect is a
 *   header label — no edges are ever asserted — so an honest omission beats
 *   a false pairing.
 * - BNK maps to Surface Bunker: `.WGD BNK` (WSOBJ.MAC:1711) is its OWN draw
 *   routine, distinct from TWR/GND/STB, that strokes only the bunker's top
 *   cross-section — matching SURFACE_BUNKER's own citation of `.WGD BNK`.
 * - PORT maps to Exhaust Port: `.WGD PORT` (WSOBJ.MAC:1855) is PORT's own draw
 *   routine — `;THERMAL EXHAUST PORT` — distinct from TWR/GND/STB/BNK. sw5-4
 *   re-ported EXHAUST_PORT from `.WP PORT`'s 12-point table verbatim, so this
 *   pair is NOT header-only like the ones above: vertices AND edges are
 *   compared for real, and come out clean — 0/0 drift (romCompare.test.ts).
 * - TW1/TW2/TW3, BK1/BK2/BK3, WG1/WG2/WG3 are DELIBERATELY LEFT UNMAPPED.
 *   Their own WSOBJ.MAC `.WP` comments (not the abbreviated `.WL` draw-list
 *   comments) name them "TOWER TOP EXPLOSION PIECE 1/2/3", "BUNKER EXPLOSION
 *   PIECE 1/2/3", "WALL GUN EXPLOSION PIECE 1/2/3" — i.e. the shattered-on-hit
 *   fragments of a tower/bunker/wall-gun, not the intact objects. MODELS has
 *   no fragment models for these (unlike the TIE, whose TI1/TI2/TI3 fragments
 *   DO have port counterparts), so mapping TW1 -> 'Surface Tower' etc. would
 *   diff a ~6-edge fragment against a whole object's edges and report the
 *   difference as ROM/port "drift" that isn't real — exactly the
 *   confident-lie this tool exists to avoid. WPN/WGA/WGB (wall panel / wall
 *   gun) remain unmapped: no port model cites them yet.
 * - WFF maps to Trench Catwalk (sw7-19, finding M-012): TRENCH_CATWALK was
 *   re-ported from `.WP WFF` ("WALL FORCE FIELD") verbatim — the 6-point table
 *   AND `.WGD WFF`'s draw list — so, like PORT, this pair compares vertices AND
 *   edges for real and comes out clean (0/0 drift). WFG (the collided-colour
 *   twin) stays unmapped: it is a render-only colour variant carrying a 1983
 *   out-of-range `DRAWTO 6,3`, with no `Model3D` counterpart.
 */
export const ROM_TO_PORT: Readonly<Record<string, string>> = {
  TIE: 'TIE Fighter',
  RTH: 'Darth Vader TIE',
  TI1: 'TIE Fragment Left Wing',
  TI2: 'TIE Fragment Right Wing',
  TI3: 'TIE Fragment Cabin',
  STB: 'Surface Tower',
  BNK: 'Surface Bunker',
  PORT: 'Exhaust Port',
  WFF: 'Trench Catwalk',
  WGA: 'Trench Turret',
}

export type Edge = readonly [number, number]

/** Orientation-independent identity, so [1,3] and [3,1] are one edge. */
export function edgeKey([a, b]: Edge): string {
  return a <= b ? `${a}-${b}` : `${b}-${a}`
}

/** A degenerate edge whose two endpoints are the same vertex — draws nothing,
 * so it is never real connectivity and must never be reported as drift. */
function isSelfEdge([a, b]: Edge): boolean {
  return a === b
}

/**
 * Edges that actually index a vertex the model HAS.
 *
 * The ROM contains one that does not: WFG's `.WGD` routine (WSOBJ.MAC:1844) is
 * `DRAWTO 6,3` against a six-point table (0..5), so the baked artifact carries
 * edges [5,6] and [6,3] whose index 6 is not a valid subscript. That is an
 * out-of-bounds read in the 1983 ROM itself — on the cabinet it strokes to a
 * stale slot of the transform scratch page. romModels.generated.ts transcribes
 * it verbatim (it is the audit record), so every consumer must filter it here:
 * it is undefined geometry, never real connectivity. Diffing it would fabricate
 * drift; STROKING it would read `vertices[6] === undefined` and draw to NaN.
 *
 * Same contract as `isSelfEdge`, one rung more dangerous.
 */
export function inRangeEdges(edges: readonly Edge[], vertexCount: number): Edge[] {
  return edges.filter(([a, b]) => [a, b].every((i) => i >= 0 && i < vertexCount))
}

export function diffEdges(
  rom: readonly Edge[],
  port: readonly Edge[],
): { onlyInRom: string[]; onlyInPort: string[] } {
  // WSOBJ.MAC's `.BD` lists occasionally contain a literal repeated index
  // (e.g. RTH's `.BD 31,23,22,21,21,24,23`), which the parser faithfully
  // emits as edge [20,20]. That draws a zero-length line, not a missing
  // segment — filter self-edges out of BOTH sides before diffing so one
  // never shows up as "the ROM draws an edge you're missing" (or vice versa).
  const r = new Set(rom.filter((e) => !isSelfEdge(e)).map(edgeKey))
  const p = new Set(port.filter((e) => !isSelfEdge(e)).map(edgeKey))
  return {
    onlyInRom: [...r].filter((k) => !p.has(k)),
    onlyInPort: [...p].filter((k) => !r.has(k)),
  }
}

/** Element-wise deep equality over two vertex arrays — same length AND every
 * [x,y,z] triple identical at every index. Edges are indices into `vertices`,
 * so a reorder (same length, same first vertex, different order past that)
 * would silently shift what every edge index points at and make an edge diff
 * meaningless even though it would still "run" without error. Deliberately
 * NOT a length/first-vertex spot check — that is exactly the weak guard this
 * replaces. */
function verticesEqual(a: readonly Vec3[], b: readonly Vec3[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v[0] === b[i][0] && v[1] === b[i][1] && v[2] === b[i][2])
}

export interface ModelPair {
  readonly romName: string
  readonly portName: string | null
  readonly rom: RomModel | null
  readonly port: Model3D | null
  /** Whether the ROM and port vertex arrays are deep-equal. Only meaningful
   * when `port` is non-null; false (not "unknown") otherwise. Edge diffing is
   * gated on this — see `pairOne`. */
  readonly verticesMatch: boolean
  readonly onlyInRom: string[]
  readonly onlyInPort: string[]
}

/** Pure per-pair logic, split out of `pairModels` so it is unit-testable
 * against fabricated fixtures without touching the real ROM_MODELS/MODELS
 * data (see romCompare.test.ts's mismatched-vertices coverage). */
export function pairOne(rom: RomModel, portName: string | null, port: Model3D | null): ModelPair {
  const verticesMatch = port ? verticesEqual(rom.vertices, port.vertices) : false
  // Edges are indices into `vertices` — an edge diff is only meaningful when
  // the ROM actually has a draw list AND the two vertex arrays agree. If they
  // don't, refuse to diff: reporting edge drift over mismatched vertex arrays
  // would be a fabricated result (see verdictFor's "vertices differ" case).
  // Filter each side's edges against its OWN vertex count before diffing: an
  // edge that indexes a vertex the model does not have is undefined geometry,
  // not connectivity, and reporting it as drift would be a fabricated finding.
  // (`verticesMatch` already guarantees the two counts agree here — filtering
  // per-side is just the honest way to say it.)
  const d = port && rom.hasDrawList && verticesMatch
    ? diffEdges(
        inRangeEdges(rom.edges, rom.vertices.length),
        inRangeEdges(port.edges, port.vertices.length),
      )
    : { onlyInRom: [], onlyInPort: [] }
  return { romName: rom.name, portName, rom, port, verticesMatch, ...d }
}

/** Every ROM object, paired with its port model where one exists. */
export function pairModels(): ModelPair[] {
  return ROM_MODELS.map((rom) => {
    const portName = ROM_TO_PORT[rom.name] ?? null
    const port = portName ? (MODELS.find((m) => m.name === portName) ?? null) : null
    return pairOne(rom, portName, port)
  })
}

export interface Verdict {
  readonly text: string
  /** Whether this verdict represents real ROM/port disagreement (drives the
   * contact sheet's warning colour). */
  readonly drift: boolean
}

/**
 * The contact sheet cell's verdict line — extracted from contactSheet.ts's
 * drawPair so the decision logic is unit-testable without a canvas. Must
 * NEVER return "✓ edges match" for a `hasDrawList: false` pair:
 * those objects have no recoverable `.WL` edge list, so `pairModels` never
 * actually compared edges for them (diffEdges is skipped entirely — see
 * above), and claiming a match would assert a comparison that never ran.
 *
 * Must ALSO never print a drift count when the ROM and port vertex arrays
 * disagree: edges are indices into `vertices`, so a mismatch (reorder,
 * length change) invalidates any edge diff `pairOne` might otherwise have
 * computed. `pairOne` already refuses to compute one in that case (its `d` is
 * forced empty), so this checks `verticesMatch` FIRST and reports that state
 * honestly instead of falling through to "✓ edges match" on the resulting
 * zero drift.
 */
export function verdictFor(p: ModelPair): Verdict {
  if (p.port && p.rom?.hasDrawList && !p.verticesMatch) {
    return { text: 'vertices differ — edge diff not meaningful', drift: true }
  }
  const drift = p.onlyInRom.length + p.onlyInPort.length
  if (drift > 0) {
    return {
      text: `⚠ ${p.onlyInRom.length} in ROM not in port · ${p.onlyInPort.length} in port not in ROM`,
      drift: true,
    }
  }
  if (p.port && p.rom?.hasDrawList) {
    return { text: '✓ edges match', drift: false }
  }
  if (p.port && p.rom && !p.rom.hasDrawList) {
    return { text: 'no edge claim (vertices only)', drift: false }
  }
  return { text: '—', drift: false }
}
