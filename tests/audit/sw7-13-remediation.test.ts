// tests/audit/sw7-13-remediation.test.ts — RED for sw7-13 (bookkeeping AC).
//
// The epic's standing rule: fixing a finding means marking it
// `remediated_by: "sw7-13"` in docs/audit/findings/ and keeping the citations
// suite green. sw7-13 ports Darth Vader's TIE as a live enemy, which closes two
// findings:
//
//   A-016  pair-tie-ai.json       Darth's TIE: 4 lives, immortal in space,
//                                 retreats — was absent from the sim.
//   S-002  pair-score-shields.json Darth = 2,000 pts — the constant existed
//                                 (VADER_SCORE) but nothing awarded it.
//
// It must NOT sweep up the adjacent-but-separate work A-016's own text defers:
//
//   A-018  pair-tie-ai.json       the ~20.34°/frame damage ROLL-BURST animation
//                                 ("forces a glow/roll ... throws the ship for a
//                                 loop") — a render/animation behaviour, not the
//                                 survival + scoring rule this story ports.
//
// A finish that forgets the bookkeeping half re-opens the epic's ledger; a
// zealous sweep that also marks A-018 hides a real gap. Both directions pinned.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = (file: string): Array<{ id: string; remediated_by?: string | null }> =>
  JSON.parse(
    readFileSync(join(here, '..', '..', 'docs', 'audit', 'findings', file), 'utf8'),
  )
const tieAi = load('pair-tie-ai.json')
const scoreShields = load('pair-score-shields.json')
const find = (arr: ReturnType<typeof load>, id: string) => arr.find((f) => f.id === id)

describe("sw7-13 — the audit ledger records Darth Vader's TIE", () => {
  it('A-016 (Darth: 4 lives / immortal in space / retreat) is remediated_by sw7-13', () => {
    const f = find(tieAi, 'A-016')
    expect(f, 'A-016 exists in pair-tie-ai.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-13')
  })

  it('S-002 (Darth = 2,000 pts, now awarded) is remediated_by sw7-13', () => {
    const f = find(scoreShields, 'S-002')
    expect(f, 'S-002 exists in pair-score-shields.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-13')
  })

  it('A-018 (damage roll-burst animation) stays OPEN — the visual roll is out of scope', () => {
    const f = find(tieAi, 'A-018')
    expect(f, 'A-018 exists in pair-tie-ai.json').toBeTruthy()
    expect(f!.remediated_by ?? undefined, 'a sweep must not mark the roll-burst fixed').toBeUndefined()
  })
})
