import { describe, it, expect } from 'vitest'
import { edgeKey, diffEdges, pairModels, verdictFor, ROM_TO_PORT, type ModelPair } from '../../src/tools/romCompare'
import { ROM_MODELS } from '../../src/tools/romModels.generated'
import { MODELS } from '../../src/core/models'

describe('edgeKey', () => {
  it('is orientation-independent', () => {
    expect(edgeKey([3, 1])).toBe(edgeKey([1, 3]))
  })
})

describe('diffEdges', () => {
  it('reports each side exclusively', () => {
    const d = diffEdges([[0, 1], [1, 2]], [[1, 0], [2, 3]])
    expect(d.onlyInRom).toEqual(['1-2'])
    expect(d.onlyInPort).toEqual(['2-3'])
  })

  it('finds no drift between identical sets', () => {
    const d = diffEdges([[0, 1]], [[1, 0]])
    expect(d.onlyInRom).toEqual([])
    expect(d.onlyInPort).toEqual([])
  })

  it('never reports a degenerate self-edge (a === b) as drift', () => {
    // WSOBJ.MAC's `.BD` lists occasionally contain a literal repeated index
    // (RTH's `.BD 31,23,22,21,21,24,23`), which the parser faithfully emits
    // as edge [20,20]. A self-edge draws nothing and is not real
    // connectivity — it must never surface as "the ROM draws an edge you're
    // missing" (or the port equivalent).
    const d = diffEdges([[0, 1], [5, 5]], [[1, 0]])
    expect(d.onlyInRom).toEqual([])
    expect(d.onlyInPort).toEqual([])
  })

  it('filters self-edges from the port side too', () => {
    const d = diffEdges([[0, 1]], [[1, 0], [7, 7]])
    expect(d.onlyInRom).toEqual([])
    expect(d.onlyInPort).toEqual([])
  })
})

describe('ROM_TO_PORT', () => {
  it('every key names a real ROM object and every value names a real port model', () => {
    // Iterate the map's OWN entries, not `pairs` — a key that is not a real
    // ROM_MODELS name (a typo) never appears in pairs and would be silently
    // unchecked if this test iterated pairs instead.
    const romNames = new Set(ROM_MODELS.map((m) => m.name))
    const portNames = new Set(MODELS.map((m) => m.name))
    for (const [romName, portName] of Object.entries(ROM_TO_PORT)) {
      expect(romNames.has(romName), `ROM_TO_PORT key '${romName}' is not a real ROM_MODELS name`).toBe(true)
      expect(portNames.has(portName), `ROM_TO_PORT['${romName}'] = '${portName}' is not a real MODELS name`).toBe(true)
    }
  })

  it('does not map the tower/bunker/wall-gun explosion fragments', () => {
    // TW1-3, BK1-3, WG1-3 are shattered-on-hit pieces ("TOWER TOP EXPLOSION
    // PIECE 1", "BUNKER EXPLOSION PIECE 1", "WALL GUN EXPLOSION PIECE 1", per
    // their own WSOBJ.MAC .WP comments) — not intact objects. MODELS has no
    // fragment models for the tower/bunker/wall-gun (unlike the TIE's
    // TI1-3), so mapping a fragment to the whole object would diff a ~6-edge
    // fragment against a whole object's edges and report fake drift. Pin the
    // omission so a future editor doesn't "helpfully" restore it.
    for (const fragment of ['TW1', 'TW2', 'TW3', 'BK1', 'BK2', 'BK3', 'WG1', 'WG2', 'WG3']) {
      expect(ROM_TO_PORT[fragment], fragment).toBeUndefined()
    }
  })

  it('maps STB (not GND/TWR) to Surface Tower', () => {
    // GND and TWR are the SAME ROM object: WSOBJ.MAC's `.WGD TWR` is
    // immediately followed by `.WGD2 GND` (same LN, same draw routine), and
    // that routine strokes the WHOLE tower (column + white cap). STB is a
    // separate, shorter routine that stops at the cannon-bottom ring — the
    // column only — matching SURFACE_TOWER's own doc comment ("the STUB
    // portion (WSOBJ `.WGD STB`)"). Mapping GND/TWR as if they were two
    // distinct objects (column vs cap) would be a false taxonomy claim.
    expect(ROM_TO_PORT.STB).toBe('Surface Tower')
    expect(ROM_TO_PORT.GND).toBeUndefined()
    expect(ROM_TO_PORT.TWR).toBeUndefined()
  })
})

describe('pairModels', () => {
  const pairs = pairModels()

  it('pairs every mapped ROM object with its port model', () => {
    const tie = pairs.find((p) => p.romName === 'TIE')
    expect(tie).toBeDefined()
    expect(tie!.port?.name).toBe('TIE Fighter')
    expect(tie!.rom).not.toBeNull()
  })

  it('the ROM vertices for TIE agree with the port (only edges should drift)', () => {
    const tie = pairs.find((p) => p.romName === 'TIE')!
    expect(tie.rom!.vertices.length).toBe(tie.port!.vertices.length)
    expect(tie.rom!.vertices[0]).toEqual(tie.port!.vertices[0])
  })

  // X-Wing and Y-Wing are NOT in the ROM — their vertices and draw lists sit
  // inside `.IF NE,0` blocks (MACRO-11's `#if 0`), so they were compiled OUT of
  // the shipped cabinet. The parser omits them; the sheet must never present
  // them as "ROM objects the port is missing".
  it('does not surface the phantom X-Wing / Y-Wing', () => {
    expect(pairs.find((p) => p.romName === 'XW')).toBeUndefined()
    expect(pairs.find((p) => p.romName === 'YW')).toBeUndefined()
  })

  it('declines to claim edges for every hasDrawList:false object that is mapped', () => {
    // STB/BNK/PORT are `.WGD`-style ground objects — direct-executing
    // PLOT/DRAWTO assembly, not an interpretable point list. Vertices are
    // authoritative; edges are not ours to assert, for ANY of them, not just
    // PORT.
    const mappedVerticesOnly = pairs.filter((p) => p.rom && !p.rom.hasDrawList && ROM_TO_PORT[p.romName])
    expect(mappedVerticesOnly.map((p) => p.romName).sort()).toEqual(['BNK', 'PORT', 'STB'])
    for (const p of mappedVerticesOnly) {
      expect(p.onlyInRom, p.romName).toEqual([])
      expect(p.onlyInPort, p.romName).toEqual([])
    }
  })

  it('every ROM_TO_PORT target names a real port model', () => {
    for (const p of pairs) {
      if (ROM_TO_PORT[p.romName]) expect(p.port, `${p.romName}`).not.toBeNull()
    }
  })

  it('RTH (which has a self-edge in its ROM draw list) drops it from onlyInRom', () => {
    const rth = pairs.find((p) => p.romName === 'RTH')!
    expect(rth.rom!.edges.some(([a, b]) => a === b)).toBe(true) // the baked self-edge is still there...
    expect(rth.onlyInRom.every((k) => {
      const [a, b] = k.split('-')
      return a !== b
    })).toBe(true) // ...but never reported as drift
  })
})

describe('verdictFor', () => {
  const rom = (hasDrawList: boolean) => ({ name: 'X', scale: 1, hasDrawList, vertices: [], edges: [] })
  const port = { name: 'Y', vertices: [], edges: [] }

  it('shows the warning + exact counts when edges drift', () => {
    const p: ModelPair = {
      romName: 'X', portName: 'Y', rom: rom(true), port,
      onlyInRom: ['1-2'], onlyInPort: ['3-4', '5-6'],
    }
    const v = verdictFor(p)
    expect(v.drift).toBe(true)
    expect(v.text).toBe('⚠ 1 in ROM not in port · 2 in port not in ROM')
  })

  it('claims edges match when a hasDrawList:true pair has zero drift', () => {
    const p: ModelPair = {
      romName: 'X', portName: 'Y', rom: rom(true), port,
      onlyInRom: [], onlyInPort: [],
    }
    expect(verdictFor(p).text).toBe('✓ edges match')
    expect(verdictFor(p).drift).toBe(false)
  })

  it('NEVER claims edges match for a hasDrawList:false pair, even with zero drift', () => {
    const p: ModelPair = {
      romName: 'X', portName: 'Y', rom: rom(false), port,
      onlyInRom: [], onlyInPort: [],
    }
    const v = verdictFor(p)
    expect(v.text).not.toBe('✓ edges match')
    expect(v.drift).toBe(false)
  })

  it('shows a neutral dash when the ROM object has no port mapping', () => {
    const p: ModelPair = {
      romName: 'X', portName: null, rom: rom(true), port: null,
      onlyInRom: [], onlyInPort: [],
    }
    expect(verdictFor(p).text).toBe('—')
  })
})
