// tests/core/post-hit-shield-window.test.ts
//
// Story sw7-4 (R4), sub-task S-016 — RED phase. The ROM loses AT MOST ONE shield
// per gauge-redraw cycle: a hit that lands while the shield gauge is still
// animating the previous loss is DROPPED, not stacked (audit S-016: "no post-hit
// invulnerability window"). Today every colliding TIE/fireball does `damage++`
// and the sim subtracts the sum (sim.ts:422-440), so two hits in one frame cost
// two shields.
//
// PRIMARY SOURCE — Warp Speed (.RADIX 16):
//   WSGLOW.MAC:58-64  BG1GLW:: (called when the ship is hit) —
//        LDA GS.GLW / IFEQ ; ?READY FOR ANOTHER HIT?
//        ... INC GS.GLW    ; a NEW hit registers ONLY if GS.GLW was 0.
//     Hits arriving while GS.GLW != 0 are dropped entirely (not queued).
//   WSGAS.MAC:63-82   DO1GAS:: — `DEC S.GAS` (lose a shield) is gated by GS.HIT<=0,
//     then GS.HIT := 1.
//   WSGAS.MAC:254-260 GSVNEW: clears GS.HIT AND GS.GLW only once the multi-stage
//     gauge redraw finishes — closing the "one loss per cycle" window.
//   Timebase: the game-logic frame is 50 ms / 20 Hz (WSINT.MAC:145-149,
//     "12.*4.2MS==>50. MS, 20 PER SECOND"). The cycle length is DATA-DEPENDENT on
//     the shield count (GS.VTP/GS.VUP/GS.VBS stages off S.GAS + the TGDLM table
//     0,2,4,...,18) — roughly 200 ms to 1 s+. There is NO single ROM constant for
//     it, so this suite pins the CONTRACT (a finite, positive window; one loss per
//     cycle) and treats the exact length as an authentic-feel tunable.
//
// `POST_HIT_SHIELD_WINDOW` does not exist pre-GREEN; the import error is the RED
// signal until Dev adds the window and funnels the shield-loss paths through it.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  PROJECTILE_TTL,
  POST_HIT_SHIELD_WINDOW,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const wave = (seed = 1983): GameState => initialState(seed)
// Space IS the cockpit origin, so anything at [0,0,0] is inside COCKPIT_HIT_RADIUS.
const AT_COCKPIT: Vec3 = [0, 0, 0]
const shot = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
const tie = (pos: Vec3): Enemy => ({ pos }) as Enemy
const TICK = 0.001

/** A quiet space state seeded with lives and this frame's threats; spawns parked. */
const hitFrame = (over: Partial<GameState>): GameState => ({
  ...wave(),
  lives: 6,
  spawnTimer: 1e9,
  ...over,
})

describe('S-016 — at most one shield lost per gauge-redraw cycle (WSGLOW.MAC BG1GLW / WSGAS.MAC DO1GAS)', () => {
  it('TWO fireballs at the cockpit in ONE frame cost ONE shield, not two', () => {
    const s0 = hitFrame({ enemyShots: [shot(AT_COCKPIT), shot(AT_COCKPIT)] })
    expect(stepGame(s0, NO_INPUT, TICK).lives).toBe(5)
  })

  it('caps across DIFFERENT sources — a TIE and a fireball landing together cost ONE shield', () => {
    const s0 = hitFrame({ enemies: [tie(AT_COCKPIT)], enemyShots: [shot(AT_COCKPIT)] })
    expect(stepGame(s0, NO_INPUT, TICK).lives).toBe(5)
  })

  it('a single isolated hit still costs one shield (the window is not a blanket invulnerability)', () => {
    const s0 = hitFrame({ enemyShots: [shot(AT_COCKPIT)] })
    expect(stepGame(s0, NO_INPUT, TICK).lives).toBe(5)
  })

  it('a second hit WITHIN the window (the very next frame) costs no further shield', () => {
    let s = hitFrame({ enemyShots: [shot(AT_COCKPIT)] })
    s = stepGame(s, NO_INPUT, TICK) // 6 -> 5, the cycle opens
    expect(s.lives).toBe(5)
    s = stepGame({ ...s, enemyShots: [shot(AT_COCKPIT)], spawnTimer: 1e9 }, NO_INPUT, TICK)
    expect(s.lives).toBe(5) // still animating the redraw — the hit is dropped
  })

  it('a hit AFTER the window elapses costs another shield (the window is finite, not permanent invulnerability)', () => {
    let s = hitFrame({ enemyShots: [shot(AT_COCKPIT)] })
    s = stepGame(s, NO_INPUT, TICK) // 6 -> 5
    expect(s.lives).toBe(5)
    // Coast past the post-hit window with no threats (one big idle step).
    s = stepGame(
      { ...s, enemies: [], enemyShots: [], spawnTimer: 1e9 },
      NO_INPUT,
      POST_HIT_SHIELD_WINDOW + 0.5,
    )
    const hit = stepGame({ ...s, enemyShots: [shot(AT_COCKPIT)], spawnTimer: 1e9 }, NO_INPUT, TICK)
    expect(hit.lives).toBe(4) // window elapsed -> a fresh hit lands
  })

  it('the window is a real, bounded tunable — positive and finite (exact length is authentic-feel; ROM is data-dependent)', () => {
    expect(POST_HIT_SHIELD_WINDOW).toBeGreaterThan(0)
    expect(Number.isFinite(POST_HIT_SHIELD_WINDOW)).toBe(true)
  })

  it('is deterministic — identical double-hit input yields identical shields', () => {
    const mk = (): GameState => hitFrame({ enemyShots: [shot(AT_COCKPIT), shot(AT_COCKPIT)] })
    expect(stepGame(mk(), NO_INPUT, TICK).lives).toBe(stepGame(mk(), NO_INPUT, TICK).lives)
  })
})
