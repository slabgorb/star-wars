// src/main.ts
//
// Bootstrap: own the canvas, wire the shell (input + loop + render) to the pure
// core (initialState + stepGame). Wave 0 skeleton — a glowing wireframe spins
// in the dark, proving the math box → projection → glow pipeline end to end.

import { initialState, type GameState, type Phase } from './core/state'
import { stepGame, enterPhase } from './core/sim'
import { qualifiesForHighScore, insertHighScore } from './core/highscore'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { createAudioEngine } from './shell/audio'
import { render } from './shell/render'
import { drawDebugOverlay } from './shell/debug-overlay'
import { loadHighScores, saveHighScores } from './shell/storage'
import { loadVectorFont } from './shell/font'

// Kick off the HUD vector font load. Best-effort and non-blocking: the loop
// keeps drawing with the fallback font and picks up Vector Battle once it lands.
void loadVectorFont()

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let dpr = Math.min(2, window.devicePixelRatio || 1)
let W = window.innerWidth
let H = window.innerHeight

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
}
window.addEventListener('resize', resize)
resize()

const input = createInputController(canvas)
// Wave-5 audio (story 8-7): the SFX engine consumes the core's GameEvent channel.
const audio = createAudioEngine()
// Browsers forbid starting an AudioContext before a user gesture, so the engine
// stays inert until the first click/keypress unlocks it. resume() is idempotent
// (only the first call builds the context and loads samples), so every later
// gesture is a harmless no-op.
function unlockAudio(): void {
  audio.resume()
}
canvas.addEventListener('pointerdown', unlockAudio)
window.addEventListener('keydown', unlockAudio)
// The cabinet boots on the attract/title screen, not mid-run (story 8-6). The
// pure core's initialState() is a fresh PLAYING run; the shell frames it.
let state: GameState = { ...initialState(), mode: 'attract' }
// Local high scores, loaded once and kept in the shell (IO, not simulation).
let highScores = loadHighScores()

// Dev-only phase-jump (story 11-4): jump the run straight to a phase to eyeball
// its scene — the surface grid (11-5) / the trench channel (11-6) — without
// grinding through the kill quotas that gate them in normal play. The verification
// gap this closes is what let the triangle/sliver render bug ship through 11-1/11-2
// (see docs/adr/0002-scene-geometry-surface-and-trench.md). Gated to the dev
// server: `import.meta.env.DEV` is statically false in a production build, so Vite
// tree-shakes this whole block out — the keys do not exist in a real cabinet. It
// calls the pure `enterPhase` DIRECTLY (not through stepGame), so the deterministic
// step contract is untouched; forcing mode:'playing' lets a jump from the
// attract/game-over screen drop straight into the scene. Keys 7/8/9 (top row or
// numpad) → space / surface / trench.
// Dev-only debug overlay (story 11-3): off by default; the backtick key (`) toggles
// it. Shell-only state — the overlay reads the sim but never touches it, so toggling
// never affects gameplay or determinism. Gated to the dev server like the phase-jump
// above, so Vite strips it (and the drawDebugOverlay import) from a production build.
let debugOverlay = false
if (import.meta.env.DEV) {
  const DEV_JUMP: Record<string, Phase> = {
    Digit7: 'space',
    Numpad7: 'space',
    Digit8: 'surface',
    Numpad8: 'surface',
    Digit9: 'trench',
    Numpad9: 'trench',
  }
  window.addEventListener('keydown', (e) => {
    const target = DEV_JUMP[e.code]
    if (!target) return
    state = { ...enterPhase(state, target), mode: 'playing' }
    console.log(`[dev] phase-jump → ${target}`)
  })
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote') return
    debugOverlay = !debugOverlay
    console.log(`[dev] debug overlay ${debugOverlay ? 'on' : 'off'}`)
  })
}

const loop = createLoop(
  (dt) => {
    const prev = state
    state = stepGame(state, input.sample(), dt)
    // Play one sound per gameplay event the core emitted this frame. The pump
    // lives here (not loop.ts) because the game state — and its `events` channel
    // — lives here; loop.ts is a generic, state-agnostic driver. play() is a
    // no-op until the gesture above unlocks the engine, so pre-interaction events
    // are silently skipped.
    for (const event of state.events) {
      switch (event.type) {
        case 'fire':
          audio.play('fire')
          break
        case 'enemy-fire':
          audio.play('enemyFire')
          break
        case 'enemy-death':
          audio.play('enemyDeath')
          break
        case 'player-death':
          audio.play('playerDeath')
          break
        case 'level-clear':
          audio.play('levelClear')
          break
        case 'player-spawn':
          audio.play('playerSpawn')
          break
        case 'terrain-crash':
          audio.play('terrainCrash')
          break
        case 'fireball-destroyed':
          // Shooting down a fireball reuses the explosion cue (story 8-18): an
          // existing sample, immediate feedback, no new asset. The dedicated
          // event lets a bespoke sound swap in later without touching the core.
          audio.play('enemyDeath')
          break
        case 'trench-obstacle-destroyed':
          // A trench turret/square shot down — same reuse-the-explosion-cue
          // pattern as fireball-destroyed (fidelity epic task 3): no new asset,
          // the dedicated event still lets a bespoke sound swap in later.
          audio.play('enemyDeath')
          break
        default: {
          // Exhaustiveness guard: a new GameEvent variant added without an arm
          // above fails to type-check here instead of being silently dropped.
          const _exhaustive: never = event
          void _exhaustive
        }
      }
    }
    // Wave-5 speech (story 8-7): Obi-Wan's "Use the Force, Luke" cues the trench
    // approach — the climactic moment it plays in the film and the cabinet. Fire
    // it once on the space/surface -> trench edge, during an active run. speak()
    // lazily loads the line and is a no-op until the audio gesture unlocks it.
    if (state.mode === 'playing' && prev.phase !== 'trench' && state.phase === 'trench') {
      audio.speak('useTheForceLuke')
    }
    // On the playing -> gameover edge, bank a qualifying score and persist it.
    // (Initials entry is a follow-up; runs record under a default tag for now.)
    if (prev.mode === 'playing' && state.mode === 'gameover') {
      if (qualifiesForHighScore(highScores, state.score)) {
        highScores = insertHighScore(highScores, {
          name: 'ACE',
          score: state.score,
          wave: state.wave,
        })
        saveHighScores(highScores)
      }
    }
  },
  () => {
    ctx.save()
    ctx.scale(dpr, dpr)
    render(ctx, state, W, H, highScores)
    // Dev debug overlay (story 11-3): a separate additive pass on top of the scene,
    // drawn only when toggled on. The `import.meta.env.DEV &&` guard lets Vite
    // tree-shake it (and drawDebugOverlay) out of a production build entirely.
    if (import.meta.env.DEV && debugOverlay) drawDebugOverlay(ctx, state, W, H)
    ctx.restore()
  },
)
loop.start()
