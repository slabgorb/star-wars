// tests/core/trench-traversal-speed.test.ts
//
// Story sw7-6 (R6a) — B-008: the trench scrolls 31× too slow (500 vs ~15,750 u/s).  RED phase.
//
// THE DEFECT (finding B-008): the whole trench (channel ribs, port, obstacles)
// scrolls at TRENCH_SCROLL_SPEED = 500 u/s inside a channel whose geometry is 1:1
// ROM units (RIB_Z 2048, TRENCH_FAR 28672). The ROM's forward speed is set once
// at trench entry — PHIBS `LDD #300 ;INITIAL PLAYER SPEED` (WSMAIN.MAC:1834),
// $300 = 768 — and integrated ONCE PER GAME-FRAME by S1MVBS (`ADDD M$TX+M.S1`,
// WSMAIN.MAC:2654). At the sw7-1 game-frame rate (TICK_HZ = 246.094/12 = 20.508 Hz)
// that is 768 × 20.508 = 15,750 units/sec — 31.5× our 500.
//
// So the fix is FRAME-TRUE, exactly like the other sw7 speed constants
// (ENEMY_SHOT_TTL, DARTH_GLOW_SECONDS …): TRENCH_SCROLL_SPEED must be 0x300 × TICK_HZ,
// NOT a re-tuned magic number. length ÷ speed is ONE traversal system, so every
// trench element must move at this single rate (finding: "single caller S1MVBS").
//
// Entangled with B-009 (length): raising the speed WITHOUT lengthening the trench
// flashes it past in a fraction of a second — see trench-length.test.ts.

import { describe, it, expect } from 'vitest'
import { initialState, TICK_HZ, TRENCH_SCROLL_SPEED } from '../../src/core/state'
import { enterPhase, stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

/** The ROM's $300 = 768 units advanced per 20.508 Hz game frame. */
const ROM_UNITS_PER_GAME_FRAME = 0x300 // 768

describe('sw7-6 B-008 — trench scroll speed is $300 per game frame (frame-true, ≈15,750 u/s)', () => {
  it('TRENCH_SCROLL_SPEED is 0x300 × TICK_HZ — derived from the timebase, not a magic number', () => {
    expect(TRENCH_SCROLL_SPEED).toBe(ROM_UNITS_PER_GAME_FRAME * TICK_HZ)
  })

  it('is exactly one $300 step per game frame (the ROM S1MVBS integration)', () => {
    // Invert the frame rate: units/sec ÷ frames/sec = units/frame = 768.
    expect(TRENCH_SCROLL_SPEED / TICK_HZ).toBeCloseTo(768, 6)
  })

  it('lands at the ROM ~15,750 u/s and is 31.5× the old 500 (finding headline)', () => {
    expect(TRENCH_SCROLL_SPEED).toBeCloseTo(15750, 0) // 768 × 20.508 = 15,750.5
    expect(TRENCH_SCROLL_SPEED).not.toBe(500) // regression: the old constant
    expect(TRENCH_SCROLL_SPEED / 500).toBeCloseTo(31.5, 1)
  })

  it('decodes to a whole ROM immediate per frame (768) — the invented 500 did not', () => {
    // The new constant must be an integer ROM immediate ($300 = 768) per game frame.
    expect(TRENCH_SCROLL_SPEED / TICK_HZ).toBeCloseTo(Math.round(TRENCH_SCROLL_SPEED / TICK_HZ), 4)
    expect(Math.round(TRENCH_SCROLL_SPEED / TICK_HZ)).toBe(768)
    // Contrast: 500 / 20.508 = 24.4 — not a round ROM value, which is the tell it was invented.
    expect(Number.isInteger(500 / TICK_HZ)).toBe(false)
  })

  it('BEHAVIOUR: one game frame advances the channel scroll by exactly $300 (768)', () => {
    const s0 = enterPhase(initialState(1), 'trench')
    expect(s0.trenchScrollZ).toBe(0) // reset on phase entry
    const dt = 1 / TICK_HZ // one game frame
    const s1 = stepGame(s0, NO_INPUT, dt)
    expect(s1.trenchScrollZ - s0.trenchScrollZ).toBeCloseTo(768, 6)
  })

  it('BEHAVIOUR: the integrated scroll RATE is ~15,750 units/second', () => {
    const s0 = enterPhase(initialState(1), 'trench')
    const dt = 1 / TICK_HZ
    // Integrate a whole number of game frames and divide by the elapsed time, so the
    // measured rate is independent of TICK_HZ not being an integer (a fixed frame
    // COUNT × dt would overshoot one second and read high).
    const frames = 40
    let s = s0
    let scroll = 0
    for (let i = 0; i < frames; i++) {
      const next = stepGame(s, NO_INPUT, dt)
      scroll += next.trenchScrollZ - s.trenchScrollZ
      s = next
    }
    const ratePerSecond = scroll / (frames * dt)
    expect(ratePerSecond).toBeCloseTo(15750, -2) // within ~50 units of 15,750
  })

  it('the WHOLE trench moves at this single rate — the port scrolls the same amount as the channel', () => {
    // "length ÷ speed is ONE traversal system": the exhaust port and the channel
    // ribs advance by the SAME per-frame delta. Seam-tolerant — only checked when a
    // port is present.
    const s0 = enterPhase(initialState(1), 'trench')
    const dt = 1 / TICK_HZ
    const s1 = stepGame(s0, NO_INPUT, dt)
    if (s0.exhaustPort && s1.exhaustPort) {
      const portDelta = s1.exhaustPort.pos[2] - s0.exhaustPort.pos[2]
      const scrollDelta = s1.trenchScrollZ - s0.trenchScrollZ
      expect(Math.abs(portDelta)).toBeCloseTo(scrollDelta, 3)
    }
  })
})
