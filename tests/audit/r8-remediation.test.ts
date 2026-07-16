// tests/audit/r8-remediation.test.ts — RED for sw7-8 (bookkeeping AC).
//
// The epic's standing rule: fixing a finding means marking it
// `remediated_by: "sw7-8"` in docs/audit/findings/ and keeping the citations
// suite green. sw7-8's ruling (the R8 row of the 2026-07-15 audit doc) FIXES
// the core — five tunes, three speech wirings, two dedicated SFX — and
// explicitly DEFERS the two size-L sets:
//
//   fixed    U-010..U-014 (tunes)  U-015..U-017 (speech)  U-021/U-022 (SFX)
//   open     U-018 (reactive lines — the sim lacks the mechanics)
//            U-019 (fly-by doppler set — deferred by the ruling)
//            U-020 (R2 sound set — deferred by the ruling)
//
// A finish that forgets the bookkeeping half re-opens the epic's ledger; a
// zealous sweep that marks the DEFERRED findings would hide real gaps. Both
// directions are pinned.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const audio = JSON.parse(
  readFileSync(join(here, '..', '..', 'docs', 'audit', 'findings', 'pair-audio.json'), 'utf8'),
) as Array<{ id: string; remediated_by?: string }>

const byId = (id: string) => audio.find((f) => f.id === id)

const FIXED = ['U-010', 'U-011', 'U-012', 'U-013', 'U-014', 'U-015', 'U-016', 'U-017', 'U-021', 'U-022']
const STILL_OPEN = ['U-018', 'U-019', 'U-020']

describe('sw7-8 — the audit ledger records what this story fixed', () => {
  it.each(FIXED)('%s is marked remediated_by sw7-8', (id) => {
    const finding = byId(id)
    expect(finding, `${id} exists in pair-audio.json`).toBeTruthy()
    expect(finding!.remediated_by).toBe('sw7-8')
  })

  it.each(STILL_OPEN)('%s stays OPEN — deferred is not fixed', (id) => {
    const finding = byId(id)
    expect(finding, `${id} exists in pair-audio.json`).toBeTruthy()
    expect(finding!.remediated_by).toBeUndefined()
  })
})
