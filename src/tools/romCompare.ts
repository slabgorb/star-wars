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
 * draft. Two corrections worth flagging:
 *
 * - GND/TWR/BNK map to the STANDING objects (Surface Tower / Tower Cap /
 *   Surface Bunker), each cited BY NAME in its port doc comment
 *   ("WSOBJ.MAC `.WP GND` point table", "drawn by `.WGD TWR`",
 *   "WSOBJ.MAC `.WGD BNK`"). All three are `hasDrawList: false` — the ROM
 *   draws them with hand-coded PLOT/DRAWTO, not a `.WL` list — so these are
 *   vertices-only comparisons, same as PORT.
 * - TW1/TW2/TW3, BK1/BK2/BK3, WG1/WG2/WG3 are DELIBERATELY LEFT UNMAPPED.
 *   Their own WSOBJ.MAC `.WP` comments (not the abbreviated `.WL` draw-list
 *   comments) name them "TOWER TOP EXPLOSION PIECE 1/2/3", "BUNKER EXPLOSION
 *   PIECE 1/2/3", "WALL GUN EXPLOSION PIECE 1/2/3" — i.e. the shattered-on-hit
 *   fragments of a tower/bunker/wall-gun, not the intact objects. MODELS has
 *   no fragment models for these (unlike the TIE, whose TI1/TI2/TI3 fragments
 *   DO have port counterparts), so mapping TW1 -> 'Surface Tower' etc. (as an
 *   earlier draft of this map did) would diff a ~6-edge fragment against a
 *   whole object's edges and report the difference as ROM/port "drift" that
 *   isn't real — exactly the confident-lie this tool exists to avoid. STB
 *   (identical point table to GND) and WPN/WGA/WGB/WFF/WFG (wall panel / wall
 *   gun / force field) are also left unmapped: no port model's doc comment
 *   cites them, and the port's trench furniture (TRENCH_TURRET/SQUARE/
 *   CATWALK) is explicitly sourced from a *different*, disassembly-only
 *   investigation (`sub_6FD9`/`sub_720B`/`sub_72D5`) and marked PROVISIONAL —
 *   not enough evidence to assert equivalence.
 */
export const ROM_TO_PORT: Readonly<Record<string, string>> = {
  TIE: 'TIE Fighter',
  RTH: 'Darth Vader TIE',
  TI1: 'TIE Fragment Left Wing',
  TI2: 'TIE Fragment Right Wing',
  TI3: 'TIE Fragment Cabin',
  GND: 'Surface Tower',
  TWR: 'Tower Cap',
  BNK: 'Surface Bunker',
  PORT: 'Exhaust Port',
}

export type Edge = readonly [number, number]

/** Orientation-independent identity, so [1,3] and [3,1] are one edge. */
export function edgeKey([a, b]: Edge): string {
  return a <= b ? `${a}-${b}` : `${b}-${a}`
}

export function diffEdges(
  rom: readonly Edge[],
  port: readonly Edge[],
): { onlyInRom: string[]; onlyInPort: string[] } {
  const r = new Set(rom.map(edgeKey))
  const p = new Set(port.map(edgeKey))
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
