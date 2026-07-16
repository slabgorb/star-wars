// tests/shell/render.tie-explosion-fidelity.test.ts
//
// sw7-7 (R7a) — RED phase (Han Solo / TEA). Findings X-002 + X-003
// (pair-explosions.json), the RENDER half.
//
// X-002 (lifetimes). The two wings (0x18 = 24 frames = 1.170 s) must OUTLIVE the
//   centre globe (0x10 = 16 frames = 0.780 s). Today all three share one flat
//   TIE_DEATH_SECONDS = 0.7 s (sim.ts:309 cull, render.ts:389-397), so the globe
//   never pops first and the whole cue is gone by 0.7 s.
//
// X-003 (colour). Each piece colours itself from its own countdown timer
//   (VWTIN: colour = TVWCLE[2*timer], WSXPLD.MAC:761-770), so it walks a colour /
//   intensity ramp as it ages. Because every TIE piece is born BELOW the 0x1F
//   flash threshold (24 and 16 are both <= 31) and the timer only ever DECs
//   (DOXPLD), it NEVER takes the VJFLS "REALLY FLASH" white branch — that path
//   belongs only to ground objects, whose timer is 0x20 = 32 (finding X-005 /
//   sw7-14). Today all three fragments draw one static TIE_GLOW green with no age
//   keying (render.ts:394-396). The exact TVWCLE hues are AVG-hardware bitfields
//   the finding leaves undecoded, so we pin the STRUCTURE (age-keyed, never white),
//   never specific hexes.
//
// We drive the REAL kill path (fire a bolt, let stepGame destroy the TIE) and age
// the returned state with stepGame(dt), reading only the public render(ctx, state,
// w, h). Fragments are ISOLATED with a self-baseline: render the frame, then render
// the SAME frame with the existing `dyingTies` array emptied, and diff. Everything
// else (muzzle flash, HUD digits, the phaseKills-scaled Death Star) is byte-for-byte
// identical between the two, so the difference is exactly the dying-fragment burst —
// no fresh-baseline drift. `dyingTies` is the established death representation
// (sw3-8); this story modifies its lifetimes and colour, so reading it is in scope.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { stepGame } from '../../src/core/sim'
import {
  initialState,
  TIE_SCORE,
  STARTING_LIVES,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { NO_INPUT, type Input } from '../../src/core/input'
import { perspective, transform, IDENTITY, type Vec3 } from '@arcade/shared/math3d'

const W = 800
const H = 600
const DT = 1 / 60

// Authentic per-piece lifetimes (seconds), decoded from RADIX-16 WSXPLD.MAC at the
// 20.508 Hz game frame. Local literals so this suite does not depend on the
// (not-yet-existing) constants pinned by tie-piece-lifetimes.test.ts.
const TICK = 246.094 / 12 // = 20.508 Hz (state.ts TICK_HZ, sw7-1)
const GLOBE_LIFE = 0x10 / TICK // 16 frames ≈ 0.780 s
const WING_LIFE = 0x18 / TICK // 24 frames ≈ 1.170 s

// --- canvas stub: counts stroked segments (one lineTo = one edge) AND records the
//     strokeStyle in force at each stroke() (withGlow sets ctx.strokeStyle to the
//     body's colour before the path is stroked). Extends the proven sw3-8 stub;
//     strokeStyle stays a plain property (no accessor), so there is no TS2300. ---
function makeRec() {
  let segs = 0
  const colors: string[] = []
  const ctx = {
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    fillStyle: '',
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {
      segs++
    },
    arc() {},
    stroke() {
      colors.push(String(ctx.strokeStyle).toLowerCase())
    },
    fill() {},
    save() {},
    restore() {},
    fillText() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segs: () => segs, colors: () => colors }
}
const segCount = (state: GameState): number => {
  const rec = makeRec()
  render(rec.ctx, state, W, H)
  return rec.segs()
}
const colorsUsed = (state: GameState): Set<string> => {
  const rec = makeRec()
  render(rec.ctx, state, W, H)
  return new Set(rec.colors())
}

// Self-baseline isolation: the same frame minus its dying fragments.
const noDeath = (s: GameState): GameState => ({ ...s, dyingTies: [] })
/** Stroked segments contributed ONLY by the dying fragments in this frame. */
const fragSegs = (s: GameState): number => segCount(s) - segCount(noDeath(s))
/** Colours used ONLY by the dying fragments in this frame. */
const fragColors = (s: GameState): Set<string> => {
  const backdrop = colorsUsed(noDeath(s))
  return new Set([...colorsUsed(s)].filter((c) => !backdrop.has(c)))
}

// --- the lone-TIE kill fixture (mirrors sw3-8 / the combat-kill-loop suite) ------
const FOV_Y = Math.PI / 3
const proj = perspective(FOV_Y, 16 / 9, 1, 5000)
const aimAt = (pos: Vec3): { aimX: number; aimY: number } => {
  const ndc = transform(proj, pos)
  return { aimX: ndc[0], aimY: ndc[1] }
}
const tieStill = (pos: Vec3): Enemy => ({ pos, vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })
const loneWave = (enemy: Enemy, over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [enemy],
  projectiles: [],
  enemyShots: [],
  spawnTimer: 999,
  enemyFireCooldown: 999,
  ...over,
})

/** Fire on a dead-ahead TIE and return the FIRST state in which it is destroyed by
 *  fire (its own kill frame). Guards the fixture: killed by a bolt, not a ram. */
function destroyTie(): GameState {
  const P: Vec3 = [0, 0, -1200]
  let s = loneWave(tieStill(P))
  const fire: Input = { ...aimAt(P), fire: true }
  let postKill: GameState | null = null
  for (let i = 0; i < 240 && postKill === null; i++) {
    const before = s.enemies.length
    s = stepGame(s, fire, DT)
    if (before > 0 && s.enemies.length === 0) postKill = s
  }
  if (postKill === null) throw new Error('fixture: the TIE was never destroyed by fire')
  expect(postKill.score).toBe(TIE_SCORE)
  expect(postKill.lives).toBe(STARTING_LIVES)
  return { ...postKill, projectiles: [], enemyShots: [] }
}

/** Step forward with the sky forced empty, so only the death animation ages. */
const advanceEmpty = (s: GameState): GameState => ({
  ...stepGame(s, NO_INPUT, DT),
  enemies: [],
  projectiles: [],
  enemyShots: [],
  spawnTimer: 999,
  enemyFireCooldown: 999,
})

/** Post-kill state aged to `seconds` (age accrues dt per frame from the kill). */
const stateAtAge = (seconds: number): GameState => {
  let s = destroyTie()
  const frames = Math.round(seconds / DT)
  for (let i = 0; i < frames; i++) s = advanceEmpty(s)
  return s
}

// A fragment body is 18–28 vertices / dozens of edges; 8 is a floor the isolated
// fragment burst (~35 edges per piece) clears with room, and empty sky (0) cannot.
const BURST_MIN = 8

const isWhite = (c: string): boolean => {
  const s = c.replace(/\s+/g, '')
  return s === '#fff' || s === '#ffffff' || s === '#ffffffff' || s === 'white' || s === 'rgb(255,255,255)'
}

// The sampled ages sit cleanly inside/outside the two ROM lifetimes:
//   0.780 s = globe life, 1.170 s = wing life.
describe('sw7-7 X-002 — the wings outlive the centre globe (render)', () => {
  it('sanity: the decoded lifetime windows and the fixture are as expected', () => {
    expect(GLOBE_LIFE).toBeCloseTo(0.7802, 3)
    expect(WING_LIFE).toBeCloseTo(1.1703, 3)
    expect(fragSegs(stateAtAge(0.4))).toBeGreaterThan(BURST_MIN) // all three alive early
  })

  it('at 0.9 s the globe has popped but the wings still fly — fewer fragment segments than at 0.5 s, but not empty', () => {
    const all = fragSegs(stateAtAge(0.5)) // 0.5 < globe life -> all three
    const wings = fragSegs(stateAtAge(0.9)) // globe life < 0.9 < wing life -> wings only
    // RED today: the flat 0.7 s cull removed everything by 0.9 s -> 0 fragment segments.
    expect(wings).toBeGreaterThan(BURST_MIN)
    // GREEN adds the split: the globe is gone, so 0.9 s draws strictly fewer than 0.5 s.
    expect(wings).toBeLessThan(all)
  })

  it('the wings persist to near their 1.170 s life (still on screen at 1.1 s)', () => {
    // RED today: gone by 0.7 s. GREEN: wings live until ~1.170 s.
    expect(fragSegs(stateAtAge(1.1))).toBeGreaterThan(BURST_MIN)
  })

  it('the cue is cleared shortly after the wing life (empty sky by 1.3 s)', () => {
    // A death animation must be transient — no permanent fragment cloud.
    expect(fragSegs(stateAtAge(1.3))).toBeLessThanOrEqual(BURST_MIN)
  })
})

describe('sw7-7 X-003 — TIE pieces colour-ramp by age and NEVER white-flash (render)', () => {
  it('the fragment colour is age-keyed — it changes as the pieces cool, not one static hue', () => {
    // Both ages sit BEFORE the old flat 0.7 s cull, so under current code all three
    // pieces are alive at each — the pieces' PRESENCE is identical and only their
    // COLOUR can differ. (Sampling past 0.7 s would pass vacuously: the flat cull
    // empties one set, so they'd differ on presence, not on any age ramp.)
    const young = fragColors(stateAtAge(0.15))
    const older = fragColors(stateAtAge(0.6))
    // RED today: static TIE_GLOW -> both isolate to the same single colour -> equal.
    expect(older).not.toEqual(young)
  })

  it('the ramp spans at least two distinct fragment colours over a piece lifetime', () => {
    const seen = new Set<string>()
    for (const secs of [0.05, 0.2, 0.35, 0.5, 0.65]) for (const c of fragColors(stateAtAge(secs))) seen.add(c)
    // RED today: one static green at every age -> size 1.
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })

  it('no TIE piece is EVER drawn white — the VJFLS flash path belongs to ground objects (X-003 correction)', () => {
    // Guards a Dev who reads the pre-correction "flash white then colour-cycle"
    // finding text and reaches for VJFLS. Today the static green is never white, so
    // this passes; it bites the instant any age introduces a white fragment.
    let sampled = 0
    for (const secs of [0.02, 0.3, 0.6, 0.9, 1.1]) {
      for (const c of fragColors(stateAtAge(secs))) {
        sampled++
        expect(isWhite(c), `a TIE fragment rendered white at age ${secs}s (${c})`).toBe(false)
      }
    }
    expect(sampled, 'the sweep must actually observe fragment colours').toBeGreaterThan(0)
  })
})
