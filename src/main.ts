// src/main.ts
//
// Bootstrap: own the canvas, wire the shell (input + loop + render) to the pure
// core (initialState + stepGame). Wave 0 skeleton — a glowing wireframe spins
// in the dark, proving the math box → projection → glow pipeline end to end.

import { initialState, type GameState, type Phase } from './core/state'
import { stepGame, enterPhase, beginNameEntry, enterInitial } from './core/sim'
import {
  qualifiesForHighScore,
  insertHighScore,
  makeHighScoreStorage,
  makeHighScoreRowGuard,
} from '@arcade/shared/highscore'
import { createInputController } from './shell/input'
import { createLoop } from '@arcade/shared/loop'
import { INITIAL_PAUSED, isPauseKey, togglePaused, stepUnlessPaused } from '@arcade/shared/pause'
import { drawEscOverlay } from '@arcade/shared/esc-overlay'
import { createAudioEngine } from './shell/audio'
import { render } from './shell/render'
import { drawDebugOverlay } from './shell/debug-overlay'
import { resizeToDisplay } from '@arcade/shared/view'

// star-wars records the `wave` reached; the shared factory binds load/save to the
// 'star-wars-high-scores' localStorage key and validates each row's finite score +
// wave (the lobby reads the same key + shape — SH-4).
// (SH2-5: no font boot needed — HUD text is stroked from the shared ROM vector
// font, a synchronous glyph table with no async asset to load.)
const highScoreStorage = makeHighScoreStorage('star-wars', makeHighScoreRowGuard('wave'))

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

// The DPR-resize + CSS-box sizing is @arcade/shared/view's resizeToDisplay (SH2-10),
// which owns the Math.min(2, devicePixelRatio||1) cap+guard every cabinet hand-rolled.
let W = window.innerWidth
let H = window.innerHeight
let dpr = 1 // real value set by resize() below, from the resolved ViewportSize

function resize(): void {
  const vp = resizeToDisplay(canvas, window.innerWidth, window.innerHeight, window.devicePixelRatio)
  W = vp.cssWidth
  H = vp.cssHeight
  dpr = vp.dpr
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
let highScores = highScoreStorage.load()

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

// Initials entry (SH2-13): typed letters and Backspace are edge events, not
// held state, so they bypass the per-frame Input sample and feed the core's
// pure event function. enterInitial is inert without an armed entry, so no
// mode guard is needed here.
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (/^[a-zA-Z]$/.test(e.key) || e.key === 'Backspace') state = enterInitial(state, e.key)
})

// SH2-14: Escape toggles pause via the shared @arcade/shared/pause gate — the
// cabinet-wide VERB. Edge, not level (guard e.repeat) so a held key can't
// machine-gun the toggle. The freeze itself is stepUnlessPaused in the loop below.
let paused = INITIAL_PAUSED
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!e.repeat && isPauseKey(e.key.toLowerCase())) paused = togglePaused(paused)
})

// Per-cabinet NUMBERS for the pause card: star-wars' yoke keybinds, its green
// cockpit-HUD chrome, and the dim alpha. Copy/colour/opacity are playtest-tunable.
const STAR_WARS_PAUSE = {
  lines: [
    'PAUSED',
    '',
    'ESC          RESUME',
    'MOUSE        AIM',
    'SPACE        FIRE',
    'ENTER        START',
  ],
  color: '#00e600',
  opacity: 0.72,
} as const

const loop = createLoop(
  (dt) => {
    const prev = state
    // SH2-14: the frozen-frame gate. When paused, the thunk never runs (no step,
    // no input sample) and stepUnlessPaused returns the prior state reference, so
    // resume is deterministic. A frozen frame skips the event pump + gameover edge
    // below (they must not re-fire against a stale, un-advanced state).
    state = stepUnlessPaused(() => stepGame(state, input.sample(), dt), state, paused)
    if (state === prev) return
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
        case 'force-bonus':
          // A clean port kill's "Use the Force" bonus fires alongside this same
          // frame's level-clear (fidelity epic task 4) — reuse the fanfare cue,
          // the same no-new-asset pattern as trench-obstacle-destroyed.
          audio.play('levelClear')
          break
        case 'tower-bonus':
          // Clearing every surface tower banks the 50,000 bonus on the same frame
          // as the surface->trench level-clear (sw3-3) — reuse the fanfare cue,
          // the same no-new-asset pattern as force-bonus. A bespoke
          // "50,000 FOR SHOOTING ALL TOWERS" banner is a HUD follow-on.
          audio.play('levelClear')
          break
        case 'death-star-destroyed':
          // The winning shot — the Death Star blows (sw2-4). Reuse the explosion
          // sample (same no-new-asset pattern as fireball/obstacle destroyed); a
          // bespoke Death-Star boom can swap in later without touching the core.
          // Rides alongside this frame's level-clear fanfare: boom + fanfare.
          audio.play('enemyDeath')
          break
        case 'exhaust-port-missed':
          // The port slipped past un-destroyed (sw2-4). Reuse the player-explosion
          // cue for a "you blew the run" tell — deliberately DIFFERENT from the
          // co-emitted terrain-crash sound so the miss reads distinctly, not as a
          // generic scrape.
          audio.play('playerDeath')
          break
        case 'speech':
          // A voice line the core cued this frame (sw2-5). One generic arm speaks
          // every current AND future line — the core owns WHEN, the shell owns HOW.
          // speak() lazily loads the line and is a no-op until the gesture unlocks.
          audio.speak(event.line)
          break
        case 'music':
          // The core swapped the phase music this frame (sw3-5). One generic arm
          // starts the cued track on the looping `music` channel — voice-stealing
          // means the previous loop stops and this one rings. The core owns WHEN
          // (phase edges only), the shell owns HOW (the @arcade/shared loop).
          audio.startLoop(event.track)
          break
        case 'name-entered':
          // The player confirmed their initials on the entry screen (SH2-13) —
          // the core announces the commit; this shell owns the table and the
          // persistence seam, so the insert + save happen here. The name is
          // exactly what was typed: the old constant auto-tag is retired.
          highScores = insertHighScore(highScores, {
            name: event.name,
            score: state.score,
            wave: state.wave,
          })
          highScoreStorage.save(highScores)
          break
        default: {
          // Exhaustiveness guard: a new GameEvent variant added without an arm
          // above fails to type-check here instead of being silently dropped.
          const _exhaustive: never = event
          void _exhaustive
        }
      }
    }
    // Speech is now core-driven (sw2-5): the pump's `case 'speech'` above speaks
    // each cued line — including "Use the Force, Luke" on the trench edge — so no
    // line is hard-wired here any more.
    // On the playing -> gameover edge, a qualifying score ARMS the typed
    // initials entry (SH2-13, the auto-tag retired): qualification is computed
    // here because this shell owns the table; the core owns the machine from
    // there and announces the commit as the 'name-entered' event above.
    if (prev.mode === 'playing' && state.mode === 'gameover') {
      if (qualifiesForHighScore(highScores, state.score)) {
        state = beginNameEntry(state)
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
    // SH2-14: the pause overlay dims the frozen cockpit and draws the keybind card
    // over it — inside the dpr-scaled block so it shares render()'s CSS-pixel space.
    if (paused) drawEscOverlay(ctx, W, H, STAR_WARS_PAUSE)
    ctx.restore()
  },
)
loop.start()
