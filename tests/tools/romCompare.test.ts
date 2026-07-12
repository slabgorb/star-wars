import { describe, it, expect } from 'vitest'
import { edgeKey, diffEdges, pairModels, ROM_TO_PORT } from '../../src/tools/romCompare'

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

  it('declines to claim edges for objects the ROM draws procedurally', () => {
    // PORT/WPN/WFF are `.WGD` ground-type objects — direct-executing
    // PLOT/DRAWTO assembly, not an interpretable point list. Vertices are
    // authoritative; edges are not ours to assert.
    const port = pairs.find((p) => p.romName === 'PORT')!
    expect(port.rom!.hasDrawList).toBe(false)
    expect(port.onlyInRom).toEqual([])
    expect(port.onlyInPort).toEqual([])
  })

  it('every ROM_TO_PORT target names a real port model', () => {
    for (const p of pairs) {
      if (ROM_TO_PORT[p.romName]) expect(p.port, `${p.romName}`).not.toBeNull()
    }
  })
})
