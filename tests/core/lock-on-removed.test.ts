// tests/core/lock-on-removed.test.ts
//
// sw7-21 (R-LOCK) — RED. The green predictive LOCK-ON ring (story 8-14:
// isLocked / lockedEnemy / LOCK_RADIUS_NDC, drawn by render.ts drawLockOn) is a
// NON-ROM aim-assist. The 1983 cabinet draws only the site crosshair (WSSITE.MAC)
// plus a POST-hit flash (LZ.HIT, the still-unported G-008); it never rings a
// target the player has not yet hit. The Jedi ruled REMOVE for authenticity
// (2026-07-17). This suite pins two halves at once:
//
//   AC-1  the ring's pure core machinery is DELETED — not merely left unused. A
//         namespace import asserts the exports are ABSENT at runtime; a named
//         import would make removal a COMPILE error and could never go green.
//
//   AC-2  the authentic CLSLZ hitscan (`beamHit`, sw7-17) is a SEPARATE code path
//         and MUST survive. The ring's test is an NDC-circle around the reticle;
//         CLSLZ = min(CL.GDS, CL.ADS) is a 3D ray cast down the site (sim.ts:326).
//         The cabinet computes "nearest under the site" — it just never draws a
//         circle around it. These guards pass today and must STAY green: they are
//         the "preserve" contract in one place, so a dev cannot mistake beamHit
//         for ring machinery and delete it as collateral.

import { describe, it, expect } from 'vitest'
import * as gameRules from '../../src/core/gameRules'
import type { Vec3 } from '@arcade/shared/math3d'

describe('sw7-21 — the non-ROM lock-on machinery is removed from the core', () => {
  it('gameRules no longer exports LOCK_RADIUS_NDC', () => {
    expect('LOCK_RADIUS_NDC' in gameRules).toBe(false)
  })

  it('gameRules no longer exports isLocked', () => {
    expect('isLocked' in gameRules).toBe(false)
  })

  it('gameRules no longer exports lockedEnemy', () => {
    expect('lockedEnemy' in gameRules).toBe(false)
  })
})

describe('sw7-21 — the authentic hitscan targeting (CLSLZ) survives the ring removal', () => {
  it('still exports beamHit — the ROM CLSLZ ray, untouched by the ring removal', () => {
    expect(typeof gameRules.beamHit).toBe('function')
  })

  it('ranks the NEARER of two objects under the site first (what CLSLZ keeps min of)', () => {
    const eye: Vec3 = [0, 0, 0]
    const dir: Vec3 = [0, 0, -1] // sighting straight down the -Z site
    const near: Vec3 = [0, 0, -600]
    const far: Vec3 = [0, 0, -1800]
    const radius = 200
    const dNear = gameRules.beamHit(eye, dir, near, radius)
    const dFar = gameRules.beamHit(eye, dir, far, radius)
    expect(dNear).not.toBeNull()
    expect(dFar).not.toBeNull()
    // Both sit under the site, but the nearer is reached first — CLSLZ keeps min.
    expect(dNear!).toBeLessThan(dFar!)
    expect(dNear!).toBeCloseTo(600, 5)
  })

  it('reports no hit for an object the site is not pointed at', () => {
    // Off to the side, its distance from the beam (900) exceeds the radius (200):
    // not under the site, no hit.
    expect(gameRules.beamHit([0, 0, 0], [0, 0, -1], [900, 0, -600], 200)).toBeNull()
  })
})
