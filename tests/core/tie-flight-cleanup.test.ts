// tests/core/tie-flight-cleanup.test.ts
//
// sw7-23 RED (Han Solo / TEA) — Cleanup after the TIE choreography-VM + authentic
// §6 fire wiring (PR #110, merged 2026-07-19). `applyManeuver` now drives every TIE
// from its VM at fixed §5.3 rates, which left three dead paths this story retires:
//
//   L1  Vestigial `Enemy` fields the VM made unreachable:
//        - `Enemy.bank`    — set/read NOWHERE (spawnTie stopped seeding it in PR #110).
//        - `Enemy.peeling` — never assigned, so the sim.ts cull `!(peeling && range >
//                            TIE_EXIT_RANGE)` is permanently false: a dead filter.
//        - `Enemy.vel`     — written by `spawnTie`, read by NO space path (motion is
//                            VM-driven; a station-holding TIE never integrates it).
//   L2  The `RAMP_PER_WAVE`-scaled `ENEMY_SPEED` now only seeds that unread `vel`, so
//        later-wave TIEs do NOT actually approach faster — the ramp is a LIE. The story
//        RETIRES it (title: "retire … inert ENEMY_SPEED ramp"); difficulty already
//        escalates honestly through spawn + fire cadence. (Re-deriving an explicit
//        approach-speed target is the story's declined alternative — it needs ROM
//        authority + playtest tuning, out of a 2pt cleanup's scope. See session deviation.)
//   T4c `toCockpit(pos) = normalize(sub(COCKPIT, pos))` is duplicated: a named function
//        in sim.ts and an INLINE copy in tie-status.ts (computeStatus). Extract ONE shared
//        core helper. ⚠ SPACE-ONLY semantics: the cockpit IS the world origin here;
//        retargeting it breaks space (sim.ts:1888-1902) — the C_AS guard below pins that.
//
// These are the RED drivers (they FAIL against today's tree and pass once Dev applies
// the cleanup) plus preservation guards (green both before and after — they prove the
// removal is behaviour-neutral). Pure core: no DOM, no wall clock, no Math.random.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { initialState } from '../../src/core/state'
import { waveParams } from '../../src/core/gameRules'
import { stepGame } from '../../src/core/sim'
import { computeStatus } from '../../src/core/tie-status'
import { Status } from '../../src/core/tie-vm'
import { NO_INPUT } from '../../src/core/input'
import { makeTie, spawnTieForTest } from './helpers/space'
import { createRng } from '@arcade/shared/rng'
import { normalize, sub, scale, lookRotation, type Vec3 } from '@arcade/shared/math3d'

// --- source helpers ---------------------------------------------------------
//
// Some of these facts are only observable in the SOURCE (a retired TYPE field never
// appears on a runtime object; an inlined expression has no runtime handle). We read
// src/core off disk — the same discipline as darth-tie-rom.test.ts / name-entry.test.ts
// (default vitest env is `node`, vite.config.ts:33). Comments are stripped FIRST so a
// docstring mentioning "BANK"/"peel-away" can never mask a real declaration.

const readSrc = (rel: string): string =>
  readFileSync(new URL(`../../src/core/${rel}`, import.meta.url), 'utf8')

const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** The field body of `export interface <name> { … }`, comments removed. */
function interfaceBody(src: string, name: string): string {
  const stripped = stripComments(src)
  const open = `export interface ${name} {`
  const at = stripped.indexOf(open)
  if (at < 0) return ''
  const after = stripped.slice(at + open.length)
  const close = after.indexOf('\n}')
  return close < 0 ? after : after.slice(0, close)
}

describe('sw7-23 L1 — vestigial TIE-flight fields are retired from the Enemy type', () => {
  const body = interfaceBody(readSrc('state.ts'), 'Enemy')

  it('actually located the Enemy interface (guards the checks below from vacuity)', () => {
    // If the extraction ever returns '', every `not.toMatch` below passes for free.
    // Anchor on a field that MUST survive so a broken extraction fails loudly.
    expect(body).toMatch(/\bpos\b\s*:/)
  })

  it('no `bank` field — the invented swoop bias, unset since the VM took over flight', () => {
    expect(body).not.toMatch(/\bbank\b\s*\??\s*:/)
  })

  it('no `peeling` field — the peel latch was never assigned, so nothing read it', () => {
    expect(body).not.toMatch(/\bpeeling\b\s*\??\s*:/)
  })

  it('no `vel` field — TIE motion is VM-driven; no space path ever read a velocity', () => {
    expect(body).not.toMatch(/\bvel\b\s*:/)
  })

  it('spawnTie no longer seeds a velocity on the fighters it creates', () => {
    // Runtime companion to the type check: the sole writer stopped writing it.
    // `spawnTieForTest` wraps the real spawnTie, so it stays stable across the
    // signature change (the `speed` arg goes away in GREEN).
    const tie = spawnTieForTest({ wave: 0, slot: 0 })
    expect('vel' in tie).toBe(false)
  })
})

describe('sw7-23 L1 — the dead peel-away cull is gone from the sim', () => {
  it('sim.ts no longer references `peeling` (the permanently-false cull filter is removed)', () => {
    expect(stripComments(readSrc('sim.ts'))).not.toMatch(/\bpeeling\b/)
  })

  it('a distant TIE is not culled — the old range filter never fired, and still must not', () => {
    // A station-holding TIE (no VM) far beyond the old TIE_EXIT_RANGE (8000). Production
    // never set the peel latch, so `!(peeling && range > EXIT)` kept it every frame;
    // deleting the filter must not change that. Distance hardcoded (14000 ≫ 8000) so the
    // guard survives even if TIE_EXIT_RANGE is retired alongside the filter.
    const distant = makeTie({ pos: [0, 0, -14000] })
    let s = { ...initialState(1983), enemies: [distant], spawnTimer: 1e9 }
    for (let i = 0; i < 5; i++) s = stepGame(s, NO_INPUT, 0.05)
    expect(s.enemies).toHaveLength(1)
  })
})

describe('sw7-23 L2 — the inert ENEMY_SPEED wave ramp is retired', () => {
  it('waveParams no longer returns an `enemySpeed` — it only ever seeded the dead vel', () => {
    expect('enemySpeed' in waveParams(1)).toBe(false)
    expect('enemySpeed' in waveParams(9)).toBe(false)
  })

  it('the ENEMY_SPEED constant is gone from state.ts (its only consumer was the ramp)', () => {
    expect(stripComments(readSrc('state.ts'))).not.toMatch(/export const ENEMY_SPEED\b/)
  })

  it('difficulty STILL escalates with the wave — via spawn + fire cadence, not approach speed', () => {
    // The honest difficulty axes survive the retirement (preservation guard: green before
    // AND after). If a botched removal flattened the ramp, this fails.
    const w1 = waveParams(1)
    const w5 = waveParams(5)
    expect(w5.spawnInterval).toBeLessThan(w1.spawnInterval) //    TIEs arrive sooner
    expect(w5.enemyFireInterval).toBeLessThan(w1.enemyFireInterval) // fireballs come faster
    expect(w5.maxConcurrentShots).toBeGreaterThan(w1.maxConcurrentShots) // more fire aloft
  })
})

describe('sw7-23 T4c — toCockpit is a single shared helper, not two copies', () => {
  const tieStatusSrc = stripComments(readSrc('tie-status.ts'))

  it('tie-status.ts no longer inlines `normalize(sub(COCKPIT, …))` — the copy is gone', () => {
    expect(tieStatusSrc).not.toMatch(/normalize\s*\(\s*sub\s*\(\s*COCKPIT/)
  })

  it('tie-status.ts imports the shared `toCockpit` helper instead of hand-rolling it', () => {
    // Match a real `import { … toCockpit … } from '…'` statement — NOT the inline
    // `const toCockpit = …` (this repo omits semicolons, so a loose `import[^;]*toCockpit`
    // would span the whole file and match that const vacuously).
    expect(tieStatusSrc).toMatch(/import\s*\{[^}]*\btoCockpit\b[^}]*\}\s*from/)
  })

  it('the shared helper keeps the SPACE-ONLY origin semantics (C_AS geometry unchanged)', () => {
    // computeStatus derives C_AS from the direction to the cockpit. The extracted helper
    // must still treat the cockpit as the ORIGIN (the documented hazard: retargeting it
    // silently breaks space). A TIE dead ahead with its nose ON the cockpit is in the
    // fire cone; the same TIE turned 180° away is not. Green before and after — a
    // regression net around the refactor.
    const st = initialState(1)
    const pos: Vec3 = [0, 0, -5000]
    const towardCockpit = normalize(sub([0, 0, 0], pos)) // ROM/ref math, independent of the helper
    const facing = makeTie({ pos, orient: lookRotation(towardCockpit) })
    const facingAway = makeTie({ pos, orient: lookRotation(scale(towardCockpit, -1)) })
    expect(computeStatus(facing, st, createRng(1)) & Status.C_AS).toBeTruthy()
    expect(computeStatus(facingAway, st, createRng(1)) & Status.C_AS).toBeFalsy()
  })
})
