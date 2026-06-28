// src/main.ts
//
// Bootstrap: own the canvas, wire the shell (input + loop + render) to the pure
// core (initialState + stepGame). Wave 0 skeleton — a glowing wireframe spins
// in the dark, proving the math box → projection → glow pipeline end to end.

import { initialState, type GameState } from './core/state'
import { stepGame } from './core/sim'
import { qualifiesForHighScore, insertHighScore } from './core/highscore'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { render } from './shell/render'
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
// The cabinet boots on the attract/title screen, not mid-run (story 8-6). The
// pure core's initialState() is a fresh PLAYING run; the shell frames it.
let state: GameState = { ...initialState(), mode: 'attract' }
// Local high scores, loaded once and kept in the shell (IO, not simulation).
let highScores = loadHighScores()

const loop = createLoop(
  (dt) => {
    const prev = state
    state = stepGame(state, input.sample(), dt)
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
    ctx.restore()
  },
)
loop.start()
