// tests/audit/sw7-7-remediation.test.ts — RED for sw7-7 (R7a) bookkeeping AC.
//
// The epic's standing rule: fixing a finding means marking it
// `remediated_by: "sw7-7"` in docs/audit/findings/ and keeping the citations
// suite (tests/audit/citations.test.ts) green. sw7-7 (R7a) closes exactly TWO
// explosion findings (pair-explosions.json):
//
//   X-002  TIE piece lifetimes — the 24f/16f wing-vs-globe split (was a flat 0.7 s).
//   X-003  age-keyed colour ramp — TIE pieces NEVER white-flash (was static green).
//
// The ORIGINAL 12-pt sw7-7 also carried three more explosion findings and one
// model finding; those were SPLIT OUT on 2026-07-16 into their own stories:
//
//   X-005  ground tower/bunker ballistic debris + shadow  -> sw7-14 (R7b)
//   X-006  4-phase red/blue/white ring finale             -> sw7-15 (R7c)
//   X-007  looming-station prelim                         -> sw7-15 (R7c)
//   M-010  authentic 2D-picture Death Star                -> sw7-15 (R7c)
//
// A finish that forgets the bookkeeping half re-opens the epic's ledger; a zealous
// sweep that stamps the split-out findings under sw7-7 hides their real owners.
// Both directions are pinned.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = (file: string): Array<{ id: string; remediated_by?: string | null }> =>
  JSON.parse(readFileSync(join(here, '..', '..', 'docs', 'audit', 'findings', file), 'utf8'))
const explosions = load('pair-explosions.json')
const models = load('pair-models.json')
const find = (arr: ReturnType<typeof load>, id: string) => arr.find((f) => f.id === id)

describe('sw7-7 (R7a) — the audit ledger records the TIE-piece fixes, and only those', () => {
  it('X-002 (per-piece lifetimes, 24f/16f) is remediated_by sw7-7', () => {
    const f = find(explosions, 'X-002')
    expect(f, 'X-002 exists in pair-explosions.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-7')
  })

  it('X-003 (age-keyed colour ramp, never white) is remediated_by sw7-7', () => {
    const f = find(explosions, 'X-003')
    expect(f, 'X-003 exists in pair-explosions.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-7')
  })

  it.each(['X-005', 'X-006', 'X-007'])(
    '%s stays OUT of sw7-7 — split to sw7-14/sw7-15, not this story',
    (id) => {
      const f = find(explosions, id)
      expect(f, `${id} exists in pair-explosions.json`).toBeTruthy()
      expect(f!.remediated_by ?? undefined, `a sweep must not stamp ${id} under sw7-7`).not.toBe('sw7-7')
    },
  )

  it('M-010 (authentic Death Star picture) stays OUT of sw7-7 — split to sw7-15', () => {
    const f = find(models, 'M-010')
    expect(f, 'M-010 exists in pair-models.json').toBeTruthy()
    expect(f!.remediated_by ?? undefined, 'a sweep must not stamp M-010 under sw7-7').not.toBe('sw7-7')
  })
})
