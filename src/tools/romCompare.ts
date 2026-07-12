// src/tools/romCompare.ts
//
// Pairs the baked ROM geometry (romModels.generated.ts) against the shipped
// models (core/models.ts) and diffs their edges. PURE — no DOM — so the pairing
// and the diff are unit-tested; contactSheet.ts only renders the result.
//
// Dev tool. Never imported by src/core.

import { MODELS, type Model3D } from '../core/models'
import { ROM_MODELS, type RomModel } from './romModels.generated'

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
 * - PORT maps to Exhaust Port for header purposes only: PORT is
 *   `hasDrawList: false` (no recoverable `.WL` edges here) and EXHAUST_PORT
 *   is itself PROVISIONAL/authored (no confirmed ROM source), so this pair
 *   never asserts edges either — see the vertices-only handling below.
 * - TW1/TW2/TW3, BK1/BK2/BK3, WG1/WG2/WG3 are DELIBERATELY LEFT UNMAPPED.
 *   Their own WSOBJ.MAC `.WP` comments (not the abbreviated `.WL` draw-list
 *   comments) name them "TOWER TOP EXPLOSION PIECE 1/2/3", "BUNKER EXPLOSION
 *   PIECE 1/2/3", "WALL GUN EXPLOSION PIECE 1/2/3" — i.e. the shattered-on-hit
 *   fragments of a tower/bunker/wall-gun, not the intact objects. MODELS has
 *   no fragment models for these (unlike the TIE, whose TI1/TI2/TI3 fragments
 *   DO have port counterparts), so mapping TW1 -> 'Surface Tower' etc. would
 *   diff a ~6-edge fragment against a whole object's edges and report the
 *   difference as ROM/port "drift" that isn't real — exactly the
 *   confident-lie this tool exists to avoid. WPN/WGA/WGB/WFF/WFG (wall panel
 *   / wall gun / force field) are also left unmapped: no port model's doc
 *   comment cites them, and the port's trench furniture (TRENCH_TURRET/
 *   SQUARE/CATWALK) is explicitly sourced from a *different*, disassembly-
 *   only investigation (`sub_6FD9`/`sub_720B`/`sub_72D5`) and marked
 *   PROVISIONAL — not enough evidence to assert equivalence.
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

export interface ModelPair {
  readonly romName: string
  readonly portName: string | null
  readonly rom: RomModel | null
  readonly port: Model3D | null
  readonly onlyInRom: string[]
  readonly onlyInPort: string[]
}

/** Every ROM object, paired with its port model where one exists. */
export function pairModels(): ModelPair[] {
  return ROM_MODELS.map((rom) => {
    const portName = ROM_TO_PORT[rom.name] ?? null
    const port = portName ? (MODELS.find((m) => m.name === portName) ?? null) : null
    // Only meaningful when the ROM actually has a draw list.
    const d = port && rom.hasDrawList
      ? diffEdges(rom.edges, port.edges)
      : { onlyInRom: [], onlyInPort: [] }
    return { romName: rom.name, portName, rom, port, ...d }
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
 */
export function verdictFor(p: ModelPair): Verdict {
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
