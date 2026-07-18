// tests/core/surface-awakening.test.ts
//
// Story sw7-18 — R11c surface traversal rebuild, Defect D-018 (per-object
// AWAKENING SEQUENCE gating). RED phase (O'Brien / TEA). EXPECTED TO FAIL.
//
// THE DEFECT. Every ROM ground object carries an awakening byte — the third
// TOWER/BISHOP/BUNKER operand, `.BYTE .C ;AWAKENING SEQUENCE NUMBER`
// (WSGRND.MAC:115), values 0..3. VWGRND activates an object ONLY once GD.SEQ
// reaches it: `CMPA TGD$SQ(X) / LBLT 90$` (WSGRND.MAC:740-742). So the maze
// wakes in staged subsets as the ship flies the traversal — seq-0 up front,
// seq-3 not until the fourth pass. Ours drops the byte entirely: MazeEntry is
// only {x,y,kind,typeDigit}, the whole field is laid awake at once, and a flat
// TOWER_FIRE_GRACE age is the only "don't fire the instant you appear" gate.
//
// THE FIX (design §Defect 3 / R11c): re-transcribe the byte into surfaceMazes.ts
// (the DATA checksum lives in surface-mazes.test.ts), carry it through mazeField
// onto each Turret, and GATE activation on `gdSeq >= seq` — an object neither
// fires nor is "awake" until the traversal has reached its sequence.
//
// This suite pins the GATE MECHANISM (the data is surface-mazes.test.ts's job):
//   Turret gains:  seq?: number   // 0..3; UNDEFINED means awake-from-the-start
//                                 // (seq 0) so pre-D-018 hand-placed fixtures
//                                 // and saves keep firing — `?? 0`, like age/kind.
//   Behaviour:
//     - a ground object may fire only when gdSeq >= (seq ?? 0). Below that it is
//       dormant: no fireball, even past TOWER_FIRE_GRACE.
//     - mazeField carries each MazeEntry.seq onto the laid Turret.
//
// Sacred boundary: pure core, no DOM, no time except dt, no RNG except state's.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TOWER_FIRE_GRACE,
  SURFACE_SEQ_SPAN,
  type GameState,
  type Turret,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

/** An armed ground object (past its fire grace) at a lateral x / depth z, with an
 *  awakening sequence. Placed near enough that it survives the frame's scroll. */
const armed = (x: number, z: number, seq?: number): Turret => ({
  pos: [x, 0, z],
  age: TOWER_FIRE_GRACE + 1,
  kind: 'tower',
  ...(seq === undefined ? {} : { seq }),
})

/** A surface fixed at a given gdSeq: surfaceScrollZ is set consistently so the
 *  gate reads the same value whether Dev stores gdSeq or derives it from scroll.
 *  Cooldown 0 + a free fireball slot means an eligible turret fires THIS frame. */
function surfaceAt(gdSeq: number, turrets: Turret[]): GameState {
  return {
    ...enterPhase(initialState(1983), 'surface'),
    gdSeq,
    surfaceScrollZ: gdSeq * SURFACE_SEQ_SPAN,
    turrets,
    surfaceMazeLaid: true, // respect the hand-placed field; don't lay the wave maze over it
    enemyFireCooldown: 0,
    enemyShots: [],
    lives: 9999,
  }
}

const firedThisFrame = (s: GameState): boolean => s.events.some((e) => e.type === 'enemy-fire')
const fireMuzzles = (s: GameState): number[] =>
  s.events.filter((e) => e.type === 'enemy-fire').map((e) => (e as { pos: readonly [number, number, number] }).pos[0])

// --- AC: an object stays dormant until gdSeq reaches its awakening seq --------

describe('sw7-18 / D-018 — a ground object fires only once gdSeq >= its seq', () => {
  it('a seq-2 object does NOT fire at gdSeq 0 (dormant, even past its fire grace)', () => {
    const s = stepGame(surfaceAt(0, [armed(0, -3000, 2)]), NO_INPUT, 0.02)
    expect(firedThisFrame(s)).toBe(false)
  })

  it('a seq-2 object still does NOT fire at gdSeq 1 (below its sequence)', () => {
    const s = stepGame(surfaceAt(1, [armed(0, -3000, 2)]), NO_INPUT, 0.02)
    expect(firedThisFrame(s)).toBe(false)
  })

  it('a seq-2 object DOES fire at gdSeq 2 (its sequence has come up)', () => {
    const s = stepGame(surfaceAt(2, [armed(0, -3000, 2)]), NO_INPUT, 0.02)
    expect(firedThisFrame(s)).toBe(true)
  })

  it('a seq-2 object keeps firing on the later passes (gdSeq 3), once awake', () => {
    const s = stepGame(surfaceAt(3, [armed(0, -3000, 2)]), NO_INPUT, 0.02)
    expect(firedThisFrame(s)).toBe(true)
  })

  it('a seq-0 object is awake from the opening pass (fires at gdSeq 0)', () => {
    const s = stepGame(surfaceAt(0, [armed(0, -3000, 0)]), NO_INPUT, 0.02)
    expect(firedThisFrame(s)).toBe(true)
  })
})

// --- AC: staged reveal — early passes wake only the low-seq subset -----------

describe('sw7-18 / D-018 — the field wakes in staged subsets, not all at once', () => {
  it('at gdSeq 0 only the seq-0 object fires; the seq-3 neighbour is still dormant', () => {
    // Two armed guns: seq-0 on the left (x < 0), seq-3 on the right (x > 0). With
    // only the seq-0 gun eligible, every fireball this frame leaves the LEFT gun.
    const s = stepGame(surfaceAt(0, [armed(-1000, -3000, 0), armed(1000, -3000, 3)]), NO_INPUT, 0.02)
    const muzzles = fireMuzzles(s)
    expect(muzzles.length).toBeGreaterThan(0) // the seq-0 gun did fire
    expect(muzzles.every((x) => x < 0)).toBe(true) // ...and NOTHING came from the seq-3 gun
  })
})

// --- AC: back-compat — an object with no seq is awake from the start ----------

describe('sw7-18 / D-018 — undefined seq is treated as awake (seq 0)', () => {
  it('a hand-placed turret with no seq fires at gdSeq 0 (pre-D-018 fixtures survive)', () => {
    const s = stepGame(surfaceAt(0, [armed(0, -3000, undefined)]), NO_INPUT, 0.02)
    expect(firedThisFrame(s)).toBe(true)
  })
})

// --- AC: mazeField carries the awakening byte onto each laid object -----------

describe('sw7-18 / D-018 — the laid maze field carries each object its awakening seq', () => {
  it('every object the wave maze lays exposes a numeric seq in 0..3', () => {
    // Fresh auto-laid surface (no hand-placed turrets): the first frame lays
    // mazeForWave(wave), which must now stamp each Turret with its MazeEntry.seq.
    const fresh: GameState = { ...enterPhase({ ...initialState(1983), wave: 3 }, 'surface'), lives: 9999 }
    const s = stepGame(fresh, NO_INPUT, 0.001) // tiny dt — lay the field, barely scroll
    expect(s.turrets.length).toBeGreaterThan(0)
    for (const t of s.turrets) {
      expect(typeof t.seq).toBe('number')
      expect(t.seq).toBeGreaterThanOrEqual(0)
      expect(t.seq).toBeLessThanOrEqual(3)
    }
  })

  it('the laid field really spans more than one sequence (not a constant fill)', () => {
    const fresh: GameState = { ...enterPhase({ ...initialState(1983), wave: 3 }, 'surface'), lives: 9999 }
    const s = stepGame(fresh, NO_INPUT, 0.001)
    const seqs = new Set(s.turrets.map((t) => t.seq))
    expect(seqs.size).toBeGreaterThan(1) // SQUARE spans seq 0..3, not all-zero
  })
})
