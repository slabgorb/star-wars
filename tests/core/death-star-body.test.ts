// tests/core/death-star-body.test.ts
//
// Story 11-7 — Death Star body: the distant object in the space phase.
//
// ⚠ RE-SEATED BY sw7-15 / M-010 (TEA, Han Solo). The original suite pinned the
// body as a procedurally-generated 3D UV SPHERE — a single connected lat/long
// wireframe with >=3 closed rings, 90% of vertices on one spherical shell, and a
// recessed +Z superlaser dish. M-010 (pair-models.json, CONFIRMED) REPLACES that
// with the authentic 2D vector PICTURE the ROM actually draws (WSVROM.MAC:2449
// "DEATH STAR PICS"): a flat green disc (BSHEM/BSCIR), a white equatorial trench
// CHORD (BSTRN), a red OFFSET superlaser dish (BSDSH/BSNSD) and green farmland
// (BSFRM), scaled by the AVG factor M.=32 as the player closes.
//
// A faithful M-010 port therefore CANNOT satisfy the old sphere assertions — it is
// flat (not on one shell), built from SEVERAL disconnected sub-pictures (not one
// connected wireframe), and the offset dish breaks bilateral symmetry. Those
// assertions contradicted the story, so leaving them would strand Dev between
// M-010 and a suite demanding a sphere. They are RETIRED here; the Death Star
// picture's geometry + palette contract now lives in
// `tests/shell/render.death-star-picture.test.ts` (seam-agnostic, through the
// public render path — the model FORM is Dev's open design choice).
//
// WHAT SURVIVES: the SHELL PLACEMENT — `deathStarPlacement(state)` seats the object
// far in −Z and grows its apparent size as `phaseKills` rises. M-010 swaps the
// MODEL, not the space-approach placement (the X-007 finale LOOM is a separate
// finale beat, tests/shell/render.death-star-finale.test.ts), so this block is a
// keep-behaviour guard and stays green across the model swap.

import { describe, it, expect } from 'vitest'
import * as RenderModule from '../../src/shell/render'
import { initialState, SPACE_WAVE_QUOTA, type GameState } from '../../src/core/state'

interface Placement {
  pos: readonly [number, number, number]
  scale?: number
}

/** Locate the shell's pure placement function under any of the conventional names. */
function placementFn(): ((s: GameState) => Placement) | undefined {
  // safe: dynamic probe — the placement export name is intentionally not pinned here.
  const mod = RenderModule as unknown as Record<string, unknown>
  for (const key of ['deathStarPlacement', 'deathStarSeat', 'deathStarBodyPlacement']) {
    if (typeof mod[key] === 'function') return mod[key] as (s: GameState) => Placement
  }
  return undefined
}

const spaceState = (phaseKills: number): GameState => ({
  ...initialState(1983),
  phase: 'space',
  phaseKills,
})

describe('11-7 — Death Star body placement grows on approach (pure, from sim state)', () => {
  it('the shell exposes a pure deathStarPlacement(state) seat (like surface/trenchPlacement)', () => {
    expect(placementFn()).toBeDefined()
  })

  it('seats the body far ahead in −Z at the start of the space phase (0 kills)', () => {
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const p = fn(spaceState(0))
    expect(Number.isFinite(p.pos[2])).toBe(true)
    expect(p.pos[2]).toBeLessThan(0) // down −Z, in front of the cockpit
    expect(Math.abs(p.pos[2])).toBeGreaterThanOrEqual(3000) // genuinely distant
  })

  it('grows on approach — apparent size increases monotonically as phaseKills rises', () => {
    // Mechanism-agnostic: apparent angular size ∝ size / distance, so we track
    // (scale / |z|). Whether DEV grows the body by moving it closer (|z| ↓),
    // scaling it up (scale ↑), or both, this metric must rise across the phase.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const apparent = (k: number): number => {
      const p = fn(spaceState(k))
      const z = Math.abs(p.pos[2])
      expect(z).toBeGreaterThan(0)
      return (p.scale ?? 1) / z
    }
    let prev = apparent(0)
    for (let k = 1; k <= SPACE_WAVE_QUOTA; k++) {
      const cur = apparent(k)
      expect(cur).toBeGreaterThanOrEqual(prev) // never shrinks while approaching
      prev = cur
    }
    expect(apparent(SPACE_WAVE_QUOTA)).toBeGreaterThan(apparent(0)) // strictly bigger by the dive
  })

  it('keeps the body in front of the camera (−Z) the whole approach', () => {
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    for (let k = 0; k <= SPACE_WAVE_QUOTA; k++) {
      expect(fn(spaceState(k)).pos[2]).toBeLessThan(0)
    }
  })

  it('returns a concrete, grown scale at full approach (not a silent default)', () => {
    // Pins the scale contribution explicitly: at the quota the body must report a
    // real scale > 1 (it has grown). `?? 1` defaults elsewhere would mask a
    // missing scale; here we require the field to be present and > 1.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const atQuota = fn(spaceState(SPACE_WAVE_QUOTA))
    const atStart = fn(spaceState(0))
    expect(atQuota.scale).toBeDefined()
    expect(atStart.scale).toBeDefined()
    // `?? 0` defaults to a value that FAILS these checks if scale is ever absent,
    // so it cannot mask a missing field (unlike `?? 1`).
    expect(atQuota.scale ?? 0).toBeGreaterThan(1)
    expect(atQuota.scale ?? 0).toBeGreaterThan(atStart.scale ?? 0) // scale itself grows
  })

  it('clamps growth at the quota — no overshoot past full approach', () => {
    // phaseKills can momentarily sit at/over the quota; the seat must saturate at
    // the full-approach value, never flying nearer or larger than at the quota.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const atQuota = fn(spaceState(SPACE_WAVE_QUOTA))
    const beyond = fn(spaceState(SPACE_WAVE_QUOTA + 5))
    expect(beyond).toEqual(atQuota) // identical seat (pos + scale) once clamped
  })

  it('is pure — placement does not mutate the game state', () => {
    // The body is render-only; deriving its seat must not touch sim state, so it
    // cannot perturb determinism or enemy hit-tests (AC2). Snapshot the whole
    // state and confirm it is unchanged after the read.
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const s = spaceState(3)
    const before = JSON.parse(JSON.stringify({ ...s, rng: undefined }))
    fn(s)
    const after = JSON.parse(JSON.stringify({ ...s, rng: undefined }))
    expect(after).toEqual(before)
  })

  it('is deterministic — equal sim state yields an identical seat', () => {
    const fn = placementFn()
    expect(fn).toBeDefined()
    if (!fn) return
    const a = fn(spaceState(4))
    const b = fn(spaceState(4))
    expect(b).toEqual(a)
  })
})
