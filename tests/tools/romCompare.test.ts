import { describe, it, expect } from 'vitest'
import { edgeKey, diffEdges, pairModels, pairOne, verdictFor, inRangeEdges, ROM_TO_PORT, type ModelPair } from '../../src/tools/romCompare'
import { ROM_MODELS, type RomModel } from '../../src/tools/romModels.generated'
import { MODELS, type Model3D } from '../../src/core/models'

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

  // The 5 pairs the edge diff is actually meaningful for (hasDrawList:true +
  // mapped). Edges are INDICES into `vertices` — a length/first-vertex spot
  // check (the old version of this test) cannot catch a reorder past index 0,
  // which would silently invalidate every edge index without either array
  // looking "wrong" at a glance. Assert full deep equality, not a spot check.
  it.each(['TIE', 'TI1', 'TI2', 'TI3', 'RTH'])(
    '%s: the ROM vertices deep-equal the port vertices (only edges should drift)',
    (romName) => {
      const p = pairs.find((pair) => pair.romName === romName)!
      expect(p.rom).not.toBeNull()
      expect(p.port).not.toBeNull()
      expect(p.rom!.vertices).toEqual(p.port!.vertices)
      expect(p.verticesMatch).toBe(true)
    },
  )

  // X-Wing and Y-Wing are NOT in the ROM — their vertices and draw lists sit
  // inside `.IF NE,0` blocks (MACRO-11's `#if 0`), so they were compiled OUT of
  // the shipped cabinet. The parser omits them; the sheet must never present
  // them as "ROM objects the port is missing".
  it('does not surface the phantom X-Wing / Y-Wing', () => {
    expect(pairs.find((p) => p.romName === 'XW')).toBeUndefined()
    expect(pairs.find((p) => p.romName === 'YW')).toBeUndefined()
  })

  // Was: "declines to claim edges for every hasDrawList:false object that is
  // mapped" — pinning STB/BNK/PORT as vertices-only. sw5-1 recovers their
  // `.WGD` draw routines, so that set is now EMPTY and the old assertion has
  // become vacuous. The intent survives, inverted: every object we compare
  // against the port now has real ROM connectivity behind it.
  it('every mapped ROM object now has a recovered draw list — none is vertices-only', () => {
    const mapped = pairs.filter((p) => p.rom && ROM_TO_PORT[p.romName])
    expect(mapped.length).toBe(8)
    for (const p of mapped) {
      expect(p.rom!.hasDrawList, `${p.romName} must have ROM edges now`).toBe(true)
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

// THE PROJECT'S HEADLINE DELIVERABLE. This tool exists to produce exactly one
// thing: the punch-list of edges the port's heuristic reconstruction got
// wrong versus what WSOBJ.MAC actually draws. Every other test in this file
// guards the mechanism; this one pins the RESULT — the number a stakeholder
// would actually read off the contact sheet. If a future change to the
// parser, the taxonomy map, or the diff logic moves these counts, this test
// must fail and force that change to be deliberate, not a silent drift in the
// one artifact the whole tool is for.
describe('the punch-list (regression pin)', () => {
  const pairs = pairModels()
  const punchList = (romName: string) => {
    const p = pairs.find((pair) => pair.romName === romName)!
    return { onlyInRom: p.onlyInRom.length, onlyInPort: p.onlyInPort.length }
  }

  it('TIE -> TIE Fighter', () => {
    expect(punchList('TIE')).toEqual({ onlyInRom: 1, onlyInPort: 3 })
  })

  it('TI1 -> TIE Fragment Left Wing', () => {
    expect(punchList('TI1')).toEqual({ onlyInRom: 1, onlyInPort: 0 })
  })

  it('TI2 -> TIE Fragment Right Wing', () => {
    expect(punchList('TI2')).toEqual({ onlyInRom: 1, onlyInPort: 0 })
  })

  it('TI3 -> TIE Fragment Cabin', () => {
    expect(punchList('TI3')).toEqual({ onlyInRom: 3, onlyInPort: 0 })
  })

  it('RTH -> Darth Vader TIE', () => {
    expect(punchList('RTH')).toEqual({ onlyInRom: 12, onlyInPort: 44 })
  })

  // sw5-1 takes the pin from 5 compared pairs to 8, gaining the three suspect
  // ground objects. But it does NOT yet yield an edge drift count for them —
  // and pretending otherwise would be the exact dishonesty this tool exists to
  // prevent. Their PORT-side VERTICES are still wrong (the ROM exhaust port is
  // 12 points in three concentric squares; ours is an 8-point octagon), so
  // `pairOne`'s vertex-mismatch guard correctly refuses to diff edges: indices
  // into two different vertex arrays cannot be compared. A `{0, 0}` here would
  // read as "no drift — all good" when the truth is "not comparable yet".
  //
  // sw5-4 (PORT) and sw5-5 (STB/BNK) fix the vertices. THEY are what turn these
  // three into real edge diffs; this pin must then be updated to the drift
  // counts, and its failure at that moment is the point.
  const verdict = (romName: string) => verdictFor(pairs.find((p) => p.romName === romName)!)

  // Pin the REASON the diff is blocked, not merely the fact. `{onlyInRom: 0,
  // onlyInPort: 0}` is true BY CONSTRUCTION once verticesMatch is false (pairOne
  // hard-forces it), so asserting it proves nothing — adversarial review caught
  // that. The vertex COUNTS are the real content: they distinguish "the port's
  // octagon is still wrong" (the known defect sw5-4/sw5-5 fix) from "the ROM
  // side regressed" (a bake bug), which a bare `verticesMatch === false` cannot.
  it.each([
    { romName: 'PORT', romVerts: 12, portVerts: 8, romEdges: 18 },
    { romName: 'STB', romVerts: 15, portVerts: 12, romEdges: 13 },
    { romName: 'BNK', romVerts: 15, portVerts: 6, romEdges: 8 },
  ])(
    '$romName: has ROM edges now, but the diff stays blocked on the PORT\'s wrong vertex count',
    ({ romName, romVerts, portVerts, romEdges }) => {
      const p = pairs.find((pair) => pair.romName === romName)!

      // The ROM side: real, recovered connectivity.
      expect(p.rom!.hasDrawList, 'sw5-1 recovered its .WGD draw list').toBe(true)
      expect(p.rom!.vertices.length, 'ROM vertex count').toBe(romVerts)
      expect(p.rom!.edges.length, 'ROM edge count').toBe(romEdges)

      // The port side: still the pre-ROM authored geometry. THIS is the defect.
      expect(p.port!.vertices.length, 'port vertex count — still wrong').toBe(portVerts)

      // ...so the edge diff is refused, honestly.
      expect(p.verticesMatch).toBe(false)
      expect(verdict(romName).text).toBe('vertices differ — edge diff not meaningful')
    },
  )

  it('pins 8 compared pairs, not 5', () => {
    const compared = pairs.filter((p) => p.rom?.hasDrawList && p.port)
    expect(compared.map((p) => p.romName).sort()).toEqual(
      ['BNK', 'PORT', 'RTH', 'STB', 'TI1', 'TI2', 'TI3', 'TIE'],
    )
  })
})

// The ROM's own out-of-bounds stroke. WSOBJ.MAC:1844 has WFG `DRAWTO 6,3` into
// a SIX-point table (0..5) — the 1983 code reads a stale slot of the transform
// scratch page. The bake transcribes it faithfully (it is the audit record), so
// the artifact now contains an edge index that is not a valid vertex. Anything
// that walks edges into `vertices[i]` must therefore guard, exactly as it
// already guards degenerate self-edges.
describe('the ROM\'s out-of-range edge (WFG)', () => {
  const outOfRange = (m: RomModel) =>
    m.edges.filter(([a, b]) => [a, b].some((i) => i < 0 || i >= m.vertices.length))

  it('is confined to WFG — any other offender is an off-by-one, not a ROM quirk', () => {
    const offenders = ROM_MODELS.filter((m) => outOfRange(m).length > 0).map((m) => m.name)
    expect(offenders).toEqual(['WFG'])
    expect(outOfRange(ROM_MODELS.find((m) => m.name === 'WFG')!)).toEqual([[5, 6], [6, 3]])
  })

  it('never touches a MAPPED pair, so the punch-list diff can never be poisoned by one', () => {
    for (const m of ROM_MODELS) {
      if (ROM_TO_PORT[m.name]) expect(outOfRange(m), m.name).toEqual([])
    }
  })

  // `inRangeEdges` had no direct unit test — adversarial review showed that
  // dropping the `i >= 0` half of its predicate left the whole suite green.
  describe('inRangeEdges', () => {
    it('keeps edges whose endpoints both index a real vertex', () => {
      expect(inRangeEdges([[0, 1], [1, 2]], 3)).toEqual([[0, 1], [1, 2]])
    })

    it('drops an edge at the boundary — index === vertexCount is one past the end', () => {
      expect(inRangeEdges([[0, 1], [1, 3]], 3)).toEqual([[0, 1]])
      expect(inRangeEdges([[2, 2]], 3)).toEqual([[2, 2]]) // len-1 is still valid
    })

    it('drops a NEGATIVE index (the other half of the predicate)', () => {
      expect(inRangeEdges([[-1, 1], [0, 1]], 3)).toEqual([[0, 1]])
    })

    it('drops everything when the model has no vertices, and handles no edges', () => {
      expect(inRangeEdges([[0, 1]], 0)).toEqual([])
      expect(inRangeEdges([], 3)).toEqual([])
    })
  })

  // The self-edge filter has a port-side mirror test; this one did not, and the
  // mutant that stopped filtering the PORT side survived the whole suite.
  it('pairOne never reports an out-of-range PORT edge as drift either', () => {
    const rom: RomModel = {
      name: 'X', scale: 1, hasDrawList: true,
      vertices: [[0, 0, 0], [1, 1, 1], [2, 2, 2]],
      edges: [[0, 1]],
    }
    const port: Model3D = {
      name: 'Y',
      vertices: [[0, 0, 0], [1, 1, 1], [2, 2, 2]],
      edges: [[0, 1], [1, 9]], // 9 does not exist
    }
    const p = pairOne(rom, 'Y', port)
    expect(p.verticesMatch).toBe(true)
    expect(p.onlyInPort).toEqual([])
    expect(p.onlyInRom).toEqual([])
  })

  it('pairOne never reports an out-of-range ROM edge as drift', () => {
    // A fixture, not real data — WFG is unmapped today. But if a future story
    // maps an object that has one, an edge indexing a vertex that does not
    // exist is not connectivity and must never surface as "the ROM draws an
    // edge you are missing". Same class of lie as a degenerate self-edge.
    const rom: RomModel = {
      name: 'X', scale: 1, hasDrawList: true,
      vertices: [[0, 0, 0], [1, 1, 1], [2, 2, 2]],
      edges: [[0, 1], [1, 5]], // 5 does not exist
    }
    const port: Model3D = { name: 'Y', vertices: [[0, 0, 0], [1, 1, 1], [2, 2, 2]], edges: [[0, 1]] }
    const p = pairOne(rom, 'Y', port)
    expect(p.verticesMatch).toBe(true)
    expect(p.onlyInRom).toEqual([])
    expect(p.onlyInPort).toEqual([])
  })
})

// Finding 2: edges are INDICES into `vertices`. If the ROM and port vertex
// arrays were ever to disagree (reordered, different length), every edge
// index would point at a different vertex and an edge diff would report
// FABRICATED drift while looking completely normal. `pairOne` must refuse to
// diff edges in that case. These fixtures are fabricated, not real data —
// the real pairs are proven to agree by the deep-equal test above.
describe('pairOne: the vertex-mismatch guard', () => {
  const romWith = (vertices: RomModel['vertices']): RomModel => ({
    name: 'X', scale: 1, hasDrawList: true,
    vertices,
    edges: [[0, 1], [1, 2]],
  })
  const portWith = (vertices: Model3D['vertices']): Model3D => ({
    name: 'Y',
    vertices,
    edges: [[0, 1], [1, 2]],
  })

  it('refuses to diff edges when vertices are reordered past index 0 (same length, same first vertex)', () => {
    // A length/first-vertex spot check would pass this fixture; deep equality
    // must not.
    const rom = romWith([[0, 0, 0], [1, 1, 1], [2, 2, 2]])
    const port = portWith([[0, 0, 0], [2, 2, 2], [1, 1, 1]])
    const p = pairOne(rom, 'Y', port)
    expect(p.verticesMatch).toBe(false)
    expect(p.onlyInRom).toEqual([])
    expect(p.onlyInPort).toEqual([])
  })

  it('refuses to diff edges when the vertex arrays differ in length', () => {
    const rom = romWith([[0, 0, 0], [1, 1, 1], [2, 2, 2]])
    const port = portWith([[0, 0, 0], [1, 1, 1]])
    const p = pairOne(rom, 'Y', port)
    expect(p.verticesMatch).toBe(false)
    expect(p.onlyInRom).toEqual([])
    expect(p.onlyInPort).toEqual([])
  })

  it('diffs edges normally when vertices are deep-equal', () => {
    const rom = romWith([[0, 0, 0], [1, 1, 1], [2, 2, 2]])
    const port = portWith([[0, 0, 0], [1, 1, 1], [2, 2, 2]])
    const p = pairOne(rom, 'Y', port)
    expect(p.verticesMatch).toBe(true)
    expect(p.onlyInRom).toEqual([])
    expect(p.onlyInPort).toEqual([])
  })

  it('surfaces the mismatch honestly through verdictFor instead of a nonsense drift count', () => {
    const rom = romWith([[0, 0, 0], [1, 1, 1], [2, 2, 2]])
    const port = portWith([[0, 0, 0], [2, 2, 2], [1, 1, 1]])
    const p = pairOne(rom, 'Y', port)
    const v = verdictFor(p)
    expect(v.text).toBe('vertices differ — edge diff not meaningful')
    expect(v.text).not.toMatch(/^⚠/)
    expect(v.text).not.toBe('✓ edges match')
  })
})

describe('verdictFor', () => {
  const rom = (hasDrawList: boolean) => ({ name: 'X', scale: 1, hasDrawList, vertices: [], edges: [] })
  const port = { name: 'Y', vertices: [], edges: [] }

  it('shows the warning + exact counts when edges drift', () => {
    const p: ModelPair = {
      romName: 'X', portName: 'Y', rom: rom(true), port, verticesMatch: true,
      onlyInRom: ['1-2'], onlyInPort: ['3-4', '5-6'],
    }
    const v = verdictFor(p)
    expect(v.drift).toBe(true)
    expect(v.text).toBe('⚠ 1 in ROM not in port · 2 in port not in ROM')
  })

  it('claims edges match when a hasDrawList:true pair has zero drift', () => {
    const p: ModelPair = {
      romName: 'X', portName: 'Y', rom: rom(true), port, verticesMatch: true,
      onlyInRom: [], onlyInPort: [],
    }
    expect(verdictFor(p).text).toBe('✓ edges match')
    expect(verdictFor(p).drift).toBe(false)
  })

  it('NEVER claims edges match for a hasDrawList:false pair, even with zero drift', () => {
    const p: ModelPair = {
      romName: 'X', portName: 'Y', rom: rom(false), port, verticesMatch: true,
      onlyInRom: [], onlyInPort: [],
    }
    const v = verdictFor(p)
    expect(v.text).not.toBe('✓ edges match')
    expect(v.drift).toBe(false)
  })

  it('reports "vertices differ" instead of a match/drift verdict when a hasDrawList:true pair has mismatched vertices', () => {
    const p: ModelPair = {
      romName: 'X', portName: 'Y', rom: rom(true), port, verticesMatch: false,
      onlyInRom: [], onlyInPort: [],
    }
    const v = verdictFor(p)
    expect(v.text).toBe('vertices differ — edge diff not meaningful')
  })

  it('shows a neutral dash when the ROM object has no port mapping', () => {
    const p: ModelPair = {
      romName: 'X', portName: null, rom: rom(true), port: null, verticesMatch: false,
      onlyInRom: [], onlyInPort: [],
    }
    expect(verdictFor(p).text).toBe('—')
  })
})
