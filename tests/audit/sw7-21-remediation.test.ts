// tests/audit/sw7-21-remediation.test.ts — RED for sw7-21 (bookkeeping AC).
//
// The epic's standing rule: a ruled divergence is recorded in docs/audit/findings/
// and stamped `remediated_by` when the story lands, with the citations suite kept
// green. sw7-21 REMOVES the non-ROM predictive lock-on ring (story 8-14).
//
// This finding was NOT in the 2026-07-15 audit — it surfaced 2026-07-17 while
// reviewing sw7-17 — so this story MINTS it rather than stamping an existing row:
//
//   H-026  in pair-hud.json, the WSSITE reticle family (its neighbours are H-001
//          site colour, H-002 the site-shift box, H-003 the cockpit-hood
//          NO_COUNTERPART). class DIVERGENCE; `source` cites WSSITE.MAC — the
//          cabinet draws only the site crosshair, never a lock box (Object_12,
//          once guessed to be one, is the THERMAL EXHAUST PORT per WSOBJ.MAC,
//          SUPERSEDED sw5-4). remediated_by sw7-21.
//
// A remediated DIVERGENCE keeps its `ours` quote as frozen HISTORY and is no longer
// re-opened against the working tree (check-citations.mjs:99-110), so the deleted
// lock-on line stays a valid citation. The `source` side is still byte-checked when
// the 1983 tree is present — Dev anchors it to a real WSSITE.MAC line.
//
// == THE SWEEP THIS MUST NOT BECOME ==========================================
//
// Minting one finding must not sweep sw7-21 onto its neighbours: the mechanical way
// to "fix the bookkeeping" is a find-and-replace over the file, and that would
// rewrite the site findings the ring finding sits beside. Both directions pinned,
// per the sw7-17 / r8 / sw7-7 template.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = (
  file: string,
): Array<{ id: string; class?: string; source?: { file?: string }; remediated_by?: string | null }> =>
  JSON.parse(readFileSync(join(here, '..', '..', 'docs', 'audit', 'findings', file), 'utf8'))
const hud = load('pair-hud.json')
const find = (id: string) => hud.find((f) => f.id === id)

describe('sw7-21 — the audit ledger records the lock-on ring removal', () => {
  it('H-026 (non-ROM predictive lock-on ring) exists in pair-hud.json', () => {
    expect(find('H-026'), 'sw7-21 must mint H-026 in pair-hud.json').toBeTruthy()
  })

  it('H-026 is a DIVERGENCE citing WSSITE (the ROM draws only the site crosshair)', () => {
    const f = find('H-026')
    expect(f, 'H-026 exists in pair-hud.json').toBeTruthy()
    expect(f!.class).toBe('DIVERGENCE')
    expect(f!.source?.file, 'H-026 source must anchor to WSSITE.MAC').toMatch(/WSSITE\.MAC/i)
  })

  it('H-026 is remediated_by sw7-21', () => {
    const f = find('H-026')
    expect(f, 'H-026 exists in pair-hud.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-21')
  })
})

describe('sw7-21 — the WSSITE reticle neighbours are not swept under this story', () => {
  // Each row: a finding H-026 sits beside, and what it would be a lie to claim
  // sw7-21 shipped. `.not.toBe('sw7-21')` (not `.toBeUndefined`) so the guard stays
  // honest even if a neighbour is later remediated by some OTHER story.
  const neighbours: ReadonlyArray<readonly [string, string]> = [
    ['H-001', 'the site COLOUR (turquoise ≈ cyan) — faithful, nothing sw7-21 touched'],
    ['H-002', 'the ±grid site-shift box vs our NDC clamp — a separate divergence'],
    ['H-003', 'the cockpit hood / gun barrels NO_COUNTERPART — untouched here'],
  ]

  it.each(neighbours)('%s is not stamped remediated_by sw7-21', (id, what) => {
    const f = find(id)
    expect(f, `${id} exists in pair-hud.json`).toBeTruthy()
    expect(f!.remediated_by ?? undefined, `sw7-21 must not stamp ${id}: ${what}`).not.toBe('sw7-21')
  })
})
