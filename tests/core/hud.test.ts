// tests/core/hud.test.ts
//
// RED-phase tests for story 8-17 (cabinet HUD header). These pin the PURE,
// deterministic surface of the HUD: the string/number formatting helpers the
// shell calls before it lays glyphs and meter geometry into the canvas. The
// rendering itself (vector-font layout, the shield arc, the frame lines) is a
// shell concern verified live (`npm run dev`), never unit-tested here — see the
// SM assessment in .session/8-17-session.md.
//
// src/core/hud.ts does NOT exist pre-GREEN, so this file fails to LOAD (module
// resolution error) until Dev creates it. That import failure IS the RED signal;
// once the module ships with the five helpers, the file loads and these
// behaviour assertions take over. The contracts are deliberately unit-agnostic
// where the spec is (formatShield returns "fill or angle" — we assert invariants,
// not units) so the tests pin behaviour without dictating an arbitrary
// implementation.
//
// Data-model note (Delivery Finding in the session): GameState today carries
// `score`, `lives`, `wave` but NOT `shieldHealth` or `level`. These helpers take
// raw numbers, so they are testable now regardless of how Dev sources the shield
// percentage and level in the green phase.

import { describe, it, expect } from 'vitest'
import { formatScore, formatLives, formatWave, formatLevel, formatShield } from '../../src/core/hud'

describe('formatScore', () => {
  // findings ## HUD & framing (`sub_761D` "Display score") cites a 6-digit BCD
  // source, which read ambiguously as "no punctuation" — but a real cabinet
  // screenshot (task-5 report cites the source) settles it: the live SCORE
  // readout shows "12,066" and "60,681", comma-grouped with NO leading zeros.
  // (The zero-padded fixed-width reading was tried and rejected — see the
  // task-5 report's RED/GREEN history.)
  it('groups thousands per the 1983 HUD (findings ## HUD & framing; verified against a cabinet screenshot)', () => {
    expect(formatScore(12066)).toBe('12,066')
  })

  // Falsy-zero guard (TS checklist #4): a score of 0 must render "0", not "" —
  // a naive `points || ''` would drop it. The run starts at score 0, so this is
  // the very first thing the HUD shows.
  it('renders zero as "0"', () => {
    expect(formatScore(0)).toBe('0')
  })

  it('groups large scores past a million', () => {
    expect(formatScore(1000000)).toBe('1,000,000')
  })

  // A score must never display a decimal point. Scores are integer by
  // construction (TIE_SCORE=100, FIREBALL_SCORE=50), but a display formatter
  // must be robust to a fractional input rather than leaking "1250.9" onto the
  // cabinet.
  it('never leaks a decimal point onto the display', () => {
    expect(formatScore(1250.9)).toMatch(/^[\d,]+$/)
  })
})

describe('formatLives', () => {
  it('renders the shield/lives count as a digit string', () => {
    expect(formatLives(6)).toBe('6')
  })

  // Falsy-zero guard: out of shields renders "0", not "".
  it('renders zero shields as "0"', () => {
    expect(formatLives(0)).toBe('0')
  })

  it('renders a mid-run count', () => {
    expect(formatLives(3)).toBe('3')
  })
})

describe('formatWave', () => {
  it('renders wave 1', () => {
    expect(formatWave(1)).toBe('1')
  })

  // The epic tops out at Wave 5.
  it('renders the final wave', () => {
    expect(formatWave(5)).toBe('5')
  })
})

describe('formatLevel', () => {
  it('renders a single-digit level', () => {
    expect(formatLevel(1)).toBe('1')
  })

  // Levels run 1..10 per AC-3; the two-digit case must not be truncated.
  it('renders the two-digit max level', () => {
    expect(formatLevel(10)).toBe('10')
  })
})

describe('formatShield', () => {
  // Contract: input is a 0..100 shield percentage; output is a render quantity
  // (fill fraction or arc angle) the shell maps to meter geometry. We assert the
  // unit-agnostic invariants any sane meter must satisfy, not a specific scale.

  it('is empty (0) at 0%', () => {
    expect(formatShield(0)).toBe(0)
  })

  it('is non-zero (full) at 100%', () => {
    expect(formatShield(100)).toBeGreaterThan(0)
  })

  it('returns a finite number', () => {
    expect(Number.isFinite(formatShield(50))).toBe(true)
  })

  it('increases monotonically with shield percentage', () => {
    expect(formatShield(25)).toBeLessThan(formatShield(75))
  })

  // Linear through the origin: half charge is half the full deflection. Pins
  // the meter as linear without committing to fraction-vs-angle units.
  it('maps 50% to half of the full deflection', () => {
    expect(formatShield(50)).toBeCloseTo(formatShield(100) / 2, 5)
  })

  // Clamp: the shell must never over- or under-draw the meter if a caller hands
  // it an out-of-range percentage.
  it('clamps above 100% to the full deflection', () => {
    expect(formatShield(150)).toBe(formatShield(100))
  })

  it('clamps below 0% to empty', () => {
    expect(formatShield(-50)).toBe(formatShield(0))
  })
})
