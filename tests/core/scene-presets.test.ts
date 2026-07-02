// tests/core/scene-presets.test.ts
//
// Deliverable A — the scene contact sheet renders composed trench-run frames from
// these canonical GameStates. Pure core: the presets are hand-authored via the SAME
// enterPhase() play uses, so a cell shows exactly what the game screen shows.

import { describe, it, expect } from 'vitest'
import { SCENE_PRESETS } from '../../src/core/scenePresets'

describe('SCENE_PRESETS', () => {
  it('exposes at least one preset with a unique id and a non-empty label', () => {
    expect(SCENE_PRESETS.length).toBeGreaterThan(0)
    const ids = SCENE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of SCENE_PRESETS) expect(p.label.length).toBeGreaterThan(0)
  })

  it('every preset is a valid live trench frame', () => {
    for (const p of SCENE_PRESETS) {
      expect(p.state.phase).toBe('trench')
      expect(p.state.mode).toBe('playing')
      expect(p.state.exhaustPort).not.toBeNull()
    }
  })

  it('orders the exhaust port from far (entry) to near (in-sight)', () => {
    const first = SCENE_PRESETS[0].state.exhaustPort!.pos[2]
    const last = SCENE_PRESETS[SCENE_PRESETS.length - 1].state.exhaustPort!.pos[2]
    // z is negative down-range: the first frame's port is farther (more negative)
    // than the last frame's, so the run reads front-to-back across the sheet.
    expect(first).toBeLessThan(last)
  })

  it('includes the turret-alley preset with obstacles in range (fidelity epic task 3)', () => {
    expect(SCENE_PRESETS.map((p) => p.id)).toContain('turret-alley')
    const preset = SCENE_PRESETS.find((p) => p.id === 'turret-alley')!
    expect(preset.state.trenchObstacles.length).toBeGreaterThan(0)
  })
})
