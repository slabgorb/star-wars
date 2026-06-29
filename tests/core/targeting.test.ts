// tests/core/targeting.test.ts
//
// Story 8-14 — Cabinet-style targeting reticle, RED phase. (Wave 1)
//
// The reticle's VISUALS (converging cyan chevrons, the green glow circle) are
// shell rendering, validated by eyeball on the dev server. What the core owns —
// and what this suite pins — is the one piece of real logic behind it:
// LOCK-ON DETECTION. The green circle lights up over a TIE exactly when the
// player's reticle is on it, i.e. when a shot would connect.
//
// The project's hard rule (CLAUDE.md): hit-tests are computed in 3D / NDC via the
// Math Box, NEVER in screen pixels. So lock-on is the DUAL of the firing aim
// (gameRules.aimDirection / crosshairNdc, story 8-16): a TIE is locked when its
// projected NDC sits within LOCK_RADIUS_NDC of the crosshair NDC [aimX, aimY].
// Because aimDirection was built so a point down the bolt's path projects back
// onto crosshairNdc, "locked" ⟺ "the next shot hits" — the circle never lies.
//
// New pure surface this suite drives (all in src/core/gameRules.ts), RED until it
// exists (mirrors the 8-3 aiming suite, which imported gameRules before it did):
//
//   LOCK_RADIUS_NDC: number
//     Reticle lock radius in normalised-device units (NOT pixels). Also the
//     green circle's on-screen radius.
//
//   isLocked(enemyPos: Vec3, aimX: number, aimY: number, aspect?: number): boolean
//     True when the enemy projects in FRONT of the camera and its NDC is within
//     LOCK_RADIUS_NDC of [aimX, aimY]. Pure: no DOM/time/randomness.
//
//   lockedEnemy(state: GameState, aspect?: number): Enemy | null
//     The single enemy under the reticle the circle should ring — the NEAREST
//     one in front when several overlap — or null when nothing is locked.
//
// Boundary intact: no DOM, no time except via the projection, no randomness.
// Aspect only scales the X axis (a shell value the core defaults to 1), so the
// vertical-axis boundary tests keep the target on x = 0 — the aspect-independent
// discipline the 8-16 kill-loop suite uses — while one dedicated test pins the
// X-axis/aspect coupling so a dev can't quietly ignore the parameter.

import { describe, it, expect } from 'vitest'
import { isLocked, lockedEnemy, LOCK_RADIUS_NDC, FOV_Y } from '../../src/core/gameRules'
import { perspective, transform, IDENTITY, type Vec3 } from '../../src/core/math3d'
import { initialState, type GameState, type Enemy } from '../../src/core/state'

// The projection the renderer paints the scene with (render.ts: 60° vertical FOV).
// near/far don't affect the x/y NDC a point maps to, only its depth.
const proj = (aspect = 1): ReturnType<typeof perspective> => perspective(FOV_Y, aspect, 1, 5000)

// The crosshair NDC that sits dead on a world point — the yoke that centres the
// reticle on it (crosshairNdc is identity, so aiming at a point = its NDC).
const aimAt = (pos: Vec3, aspect = 1): { aimX: number; aimY: number } => {
  const ndc = transform(proj(aspect), pos)
  return { aimX: ndc[0], aimY: ndc[1] }
}

const tie = (pos: Vec3): Enemy => ({ pos, vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })

// A lone-TIE state with the aim parked, spawns/fire suppressed — the reticle and
// `enemies` are the only things in play.
const lockState = (enemies: Enemy[], aimX: number, aimY: number): GameState => ({
  ...initialState(1983),
  enemies,
  aimX,
  aimY,
  spawnTimer: 999,
  enemyFireCooldown: 999,
})

// ── isLocked: the pure detection ─────────────────────────────────────────────

describe('Story 8-14 — lock-on detection (isLocked)', () => {
  it('locks a TIE dead ahead when the reticle is on it', () => {
    const pos: Vec3 = [0, 0, -1200]
    const { aimX, aimY } = aimAt(pos) // ≈ (0, 0)
    expect(isLocked(pos, aimX, aimY)).toBe(true)
  })

  it('does NOT lock when the reticle is nowhere near the TIE', () => {
    const pos: Vec3 = [0, 0, -1200] // renders dead centre
    expect(isLocked(pos, 0, 0.9)).toBe(false) // reticle parked near the top of the screen
  })

  it('locks an OFF-CENTRE TIE only when the reticle tracks onto it', () => {
    const pos: Vec3 = [0, 660, -1200] // high on the screen
    const c = aimAt(pos)
    expect(isLocked(pos, c.aimX, c.aimY)).toBe(true)
    expect(isLocked(pos, 0, 0)).toBe(false) // reticle at centre, TIE is high → no lock
  })

  it('never locks a target BEHIND the camera (it is not on screen)', () => {
    // +Z is behind the cockpit; the perspective divide flips its NDC, which must
    // NOT be mistaken for an on-screen position near the reticle.
    expect(isLocked([0, 0, 1200], 0, 0)).toBe(false)
    expect(isLocked([0, 0, 0], 0, 0)).toBe(false) // on the camera plane — also not lockable
  })

  it('locks just inside and releases just outside the lock radius (vertical axis)', () => {
    // Mid-screen, well clear of the edge: the ±radius offsets below stay inside
    // [-1, 1] for any in-range LOCK_RADIUS_NDC, so this pins the radius alone and
    // never depends on whether the reticle position is clamped at the screen edge.
    const pos: Vec3 = [0, 300, -1200] // x = 0 → NDC X is 0 regardless of aspect
    const centre = aimAt(pos) // the reticle position dead on the TIE
    const eps = LOCK_RADIUS_NDC * 0.25
    // Offset the reticle along Y by just under / just over the radius.
    expect(isLocked(pos, centre.aimX, centre.aimY + (LOCK_RADIUS_NDC - eps))).toBe(true)
    expect(isLocked(pos, centre.aimX, centre.aimY + (LOCK_RADIUS_NDC + eps))).toBe(false)
  })

  it('respects the viewport aspect on the horizontal axis', () => {
    // Off to the right, on the horizon (y = 0): its NDC X depends on aspect, so a
    // dev who drops the aspect arg projects it to the wrong column and the reticle
    // misses. x is large enough that the wrong-aspect shift exceeds any in-range
    // LOCK_RADIUS_NDC.
    const pos: Vec3 = [600, 0, -1200]
    const wide = aimAt(pos, 2) // reticle placed on it under a 2:1 viewport
    expect(isLocked(pos, wide.aimX, wide.aimY, 2)).toBe(true)
    // Same reticle, but tell isLocked the viewport is square — the target's NDC X
    // shifts away from the reticle and the lock releases.
    expect(isLocked(pos, wide.aimX, wide.aimY, 1)).toBe(false)
  })

  it('locks at a screen CORNER — high AND off to the side — when the reticle tracks there', () => {
    // Both NDC axes non-zero: a true corner, not an axis edge (AC-4: "edges and
    // corners"). A 2D screen distance, not a per-axis test, is what catches it.
    const pos: Vec3 = [500, 500, -1500]
    const corner = aimAt(pos)
    expect(isLocked(pos, corner.aimX, corner.aimY)).toBe(true)
    expect(isLocked(pos, 0, 0)).toBe(false) // a centred reticle can't reach the corner
  })

  it('uses a sane lock radius — neither zero (unlockable) nor the whole screen', () => {
    expect(LOCK_RADIUS_NDC).toBeGreaterThan(0.02)
    expect(LOCK_RADIUS_NDC).toBeLessThan(0.3)
  })

  it('is a pure function — identical inputs give identical results', () => {
    const pos: Vec3 = [120, 80, -900]
    const a = isLocked(pos, 0.1, 0.1)
    const b = isLocked(pos, 0.1, 0.1)
    expect(a).toBe(b)
  })
})

// ── lockedEnemy: the render-facing selector over state.enemies ───────────────

describe('Story 8-14 — locked target selection (lockedEnemy)', () => {
  it('returns the TIE under the reticle', () => {
    const high = tie([0, 660, -1200])
    const low = tie([0, -660, -1200])
    const onHigh = aimAt(high.pos)
    const locked = lockedEnemy(lockState([high, low], onHigh.aimX, onHigh.aimY))
    expect(locked).not.toBeNull()
    expect(locked!.pos).toEqual(high.pos)
  })

  it('returns null when nothing is under the reticle', () => {
    const high = tie([0, 660, -1200])
    // Reticle in the opposite corner from the only TIE.
    expect(lockedEnemy(lockState([high], 0, -0.9))).toBeNull()
    expect(lockedEnemy(lockState([], 0, 0))).toBeNull() // empty sky
  })

  it('rings the NEAREST TIE when two overlap the reticle', () => {
    // Both dead ahead under a centred reticle; the near one is the one a shot
    // reaches first, so it is the one the circle must ring.
    const near = tie([0, 0, -600])
    const far = tie([0, 0, -1800])
    const locked = lockedEnemy(lockState([far, near], 0, 0)) // far listed first on purpose
    expect(locked).not.toBeNull()
    expect(locked!.pos).toEqual(near.pos) // nearest (largest z), not list order
  })

  it('does not lock a TIE that has flown behind the cockpit', () => {
    const behind = tie([0, 0, 800])
    expect(lockedEnemy(lockState([behind], 0, 0))).toBeNull()
  })

  it('is deterministic — the same seeded state always rings the same TIE (AC-4)', () => {
    // Two TIEs, reticle parked on the high one. A pure query of a fixed, seeded
    // state must pick the same target every frame — the lock never flickers.
    const high = tie([0, 660, -1200])
    const low = tie([0, -660, -1200])
    const on = aimAt(high.pos)
    const a = lockedEnemy(lockState([high, low], on.aimX, on.aimY))
    const b = lockedEnemy(lockState([high, low], on.aimX, on.aimY))
    expect(a).not.toBeNull()
    expect(a!.pos).toEqual(b!.pos)
    expect(a!.pos).toEqual(high.pos)
  })
})
