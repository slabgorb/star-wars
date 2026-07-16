// tests/audit/sw7-17-remediation.test.ts — RED for sw7-17 (bookkeeping AC).
//
// The epic's standing rule: fixing a finding means marking it `remediated_by: "sw7-17"` in
// docs/audit/findings/ and keeping the citations suite green. sw7-17 ports the ROM's hitscan
// player laser, which closes two findings in pair-guns.json:
//
//   G-004  The player laser is a hitscan beam (gun→site), not a travelling projectile with
//          speed/lifetime.  ** Recorded at audit time as `recommendation: "wont_fix"` — "a
//          deliberate, playable modernization: recommend keeping it". RE-RULED wont_fix → FIX
//          by the Jedi on 2026-07-16, because the finding was decided in isolation: the lead
//          fraction closing/(bolt+closing) makes sw7-18's authentic surface speeds (30-64 %)
//          and sw7-6's ~15,750 u/s trench scroll (which out-runs the 12,000 u/s bolt outright)
//          unreachable. The `recommendation` field stays "wont_fix" as the audit's own record;
//          `remediated_by` is what records that the ruling changed. **
//
//   G-012  Player fire is edge-triggered with an 8-frame laser sweep; ours is a fixed 0.25 s
//          auto-fire cooldown.  ** Stamped per the story's "+G-012 if the sweep lands". Read
//          the Delivery Finding on the session before trusting this stamp: G-012 is TWO
//          divergences and this story lands ONE of them (the sweep). The edge-triggered
//          semi-auto half is untouched. **
//
// == THE SWEEP THIS MUST NOT BECOME ===========================================
//
// Every finding below shares a ROM module — several share the very eighteen lines this story
// ports — and each is a SEPARATE, still-open divergence. Marking any of them fixed because the
// laser was rewritten in their neighbourhood hides a real gap behind a green ledger, which is
// precisely what the citation guardrails exist to prevent. The two most tempting:
//
//   G-007  Four-gun alternating fire — `INC LZ.ALT ;EDGED ALTERNATION` sits two lines above
//          `LDB #8 / STB LZ.EDG`. This story reads that block and ports the counter beside it,
//          and still does not port the alternation.
//   G-008  Laser splash / hit-picture FX — `LZ.HIT` is cleared by the same trigger block
//          (`CLR LZ.HIT ;STOP THE HIT PICTURE, ALLOW SWEEPING LAZARS`) and set to 4 by the very
//          collision routine this story ports (`HTSG:/HTSA: LDA #4 / STA LZ.HIT ;DISPLAY HIT FOR
//          A WHILE`). The hit RESOLVES here; the hit PICTURE is still unported.
//
// Both directions pinned, per the r8 / sw7-7 / sw7-13 template.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = (file: string): Array<{ id: string; remediated_by?: string | null }> =>
  JSON.parse(readFileSync(join(here, '..', '..', 'docs', 'audit', 'findings', file), 'utf8'))
const guns = load('pair-guns.json')
const find = (id: string) => guns.find((f) => f.id === id)

describe('sw7-17 — the audit ledger records the hitscan laser', () => {
  it('G-004 (hitscan beam, not a travelling projectile) is remediated_by sw7-17', () => {
    const f = find('G-004')
    expect(f, 'G-004 exists in pair-guns.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-17')
  })

  it('G-012 (the 8-frame LZ.EDG sweep) is remediated_by sw7-17', () => {
    const f = find('G-012')
    expect(f, 'G-012 exists in pair-guns.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-17')
  })
})

describe('sw7-17 — the neighbours in WSLAZR.MAC stay OPEN', () => {
  // Each row: the finding, and what it would be a lie to claim this story shipped.
  const untouched: ReadonlyArray<readonly [string, string]> = [
    ['G-005', 'the ±$200 proton-torpedo arming box — the trench latch is untouched here'],
    ['G-006', 'the proton torpedo as a distinct animated homing projectile'],
    ['G-007', 'four-gun alternating fire (LZ.ALT toggles left-pair vs right-pair each shot)'],
    ['G-008', 'the laser splash / LZ.HIT hit-picture FX on impact'],
    ['G-009', 'the fireball→player forward-depth closing sweep'],
  ]

  it.each(untouched)('%s stays open — this story does not port %s', (id, what) => {
    const f = find(id)
    expect(f, `${id} exists in pair-guns.json`).toBeTruthy()
    expect(
      f!.remediated_by ?? undefined,
      `a sweep must not stamp ${id} under sw7-17: ${what}`,
    ).toBeUndefined()
  })

  it('G-003 keeps sw7-1 — a re-stamp would rewrite another story onto this one', () => {
    // The one already-remediated finding in this file. It is here because the mechanical way to
    // "fix the bookkeeping" is a find-and-replace over the file, and that would silently take
    // sw7-1's credit with it.
    const f = find('G-003')
    expect(f, 'G-003 exists in pair-guns.json').toBeTruthy()
    expect(f!.remediated_by).toBe('sw7-1')
  })
})
