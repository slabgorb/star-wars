// src/core/scenePresets.ts
//
// Canonical trench-run frames for the scene contact sheet (tools/sceneSheet.ts).
// Each preset is a GameState frozen at a moment of the run, reached the SAME way
// play reaches it — enterPhase(initialState(), 'trench') — then the exhaust port
// seated at a canonical downrange distance. PURE core (no DOM/time/random), so the
// presets are deterministic and double as reusable test fixtures.

import { initialState, EXHAUST_PORT_DISTANCE, type GameState } from './state'
import { enterPhase } from './sim'
import { spawnTrenchObstacles } from './trench-obstacles'
import type { Vec3 } from '@arcade/shared/math3d'

export interface ScenePreset {
  /** Stable slug, e.g. 'mid-run'. */
  id: string
  /** Shown above the cell, e.g. 'MID-RUN'. */
  label: string
  /** Optional caption under the label, e.g. 'port approaching'. */
  hint?: string
  /** The composed game state the cell renders. */
  state: GameState
}

/** A live trench-run state with the exhaust port seated at world Z `portZ`
 *  (negative = downrange). mode:'playing' so the cell shows the real in-run
 *  screen — HUD included — not the attract/game-over frame. */
function trenchAt(portZ: number): GameState {
  const s = enterPhase(initialState(), 'trench')
  return { ...s, mode: 'playing', exhaustPort: { pos: [0, 0, portZ] } }
}

export const SCENE_PRESETS: readonly ScenePreset[] = [
  { id: 'trench-entry', label: 'TRENCH-ENTRY', hint: 'port far downrange',
    state: trenchAt(-EXHAUST_PORT_DISTANCE) },
  { id: 'mid-run', label: 'MID-RUN', hint: 'port approaching',
    state: trenchAt(-1400) },
  // Fidelity epic (task 3) — the obstacle stations shifted +600 so several
  // turrets/squares/the catwalk sit in range on the walls for the contact sheet,
  // rather than the far-downrange stations a stock trenchAt(-1400) would show.
  { id: 'turret-alley', label: 'TURRET-ALLEY', hint: 'obstacles in range',
    state: { ...trenchAt(-1400), trenchObstacles: spawnTrenchObstacles().map((o) => ({ ...o, pos: [o.pos[0], o.pos[1], o.pos[2] + 600] as Vec3 })) } },
  { id: 'port-in-sight', label: 'PORT-IN-SIGHT', hint: 'in range',
    state: trenchAt(-600) },
  // Fidelity epic (task 4) — a clean port kill's "Use the Force" banner
  // (findings ## Exhaust port & run outcome), shown across the wave transition
  // exactly like `clearRun` re-stamps it (t=0 keeps FORCE_BANNER_SECONDS lit).
  { id: 'force-bonus', label: 'FORCE-BONUS', hint: 'clean run banner',
    state: { ...trenchAt(-600), forceBonusAwardedAt: 0 } },
]
