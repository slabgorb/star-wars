// tests/core/name-entry.test.ts
//
// SH2-13 RED — star-wars gains a REAL high-score name-entry screen: today a
// qualifying run is silently auto-tagged 'ACE' in the shell (src/main.ts), the
// player is never asked. This suite pins the typed-initials machine (asteroids'
// flow is the cabinet-wide reference; the shared reducer @arcade/shared/name-entry
// owns the buffer arithmetic).
//
// TEA decisions pinned here (star-wars' NUMBERS, logged as deviations in
// .session/SH2-13-session.md):
//  - The high-score TABLE stays where it lives today: in the SHELL (main.ts owns
//    load/insert/save). The core owns the entry MACHINE and announces the commit
//    through the existing GameEvent channel — "the core owns WHEN, the shell owns
//    HOW" (the repo's own speech-cue ruling). Pinned GREEN surface:
//      * GameState.entry: { initials: string } | null   (null outside entry)
//      * beginNameEntry(state): GameState — arms the entry on the gameover
//        screen (the SHELL calls it on the qualifying playing->gameover edge,
//        where qualification is computable); inert outside gameover.
//      * enterInitial(state, key): GameState — the typed-entry event function
//        (asteroids pattern): A-Z appends UPPERCASED up to 3, 'Backspace'
//        deletes (never past empty), other keys inert; inert without an armed
//        entry. Delegates to the shared reducer.
//      * While the entry is armed, `start` with an INCOMPLETE buffer is inert
//        (the run's score must not be lost to a stray press); with all 3 typed,
//        a start RISING edge commits: events carry { type: 'name-entered',
//        name }, mode -> 'attract', entry -> null. The rising edge is tracked
//        core-side (a startPrev shift register, the asteroids precedent) so a
//        press HELD across the transition can never commit (AC-4).
//  - Without an armed entry, gameover + start -> attract exactly as today
//    (non-qualifying runs keep the current behaviour, pinned in framing.test.ts).
//
// Pre-GREEN this file is RED on assertions: beginNameEntry/enterInitial do not
// exist (read through a loose module view), and gameover + start bounces to
// attract regardless of any armed entry.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initialState, type GameState } from '../../src/core/state'
import * as simModule from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'

const { stepGame } = simModule
// Loose views: the two event functions this story adds. Absent pre-GREEN.
const looseSim = simModule as unknown as {
  beginNameEntry?: (s: GameState) => GameState
  enterInitial?: (s: GameState, key: string) => GameState
}
const beginNameEntry = looseSim.beginNameEntry
const enterInitial = looseSim.enterInitial

const DT = 1 / 60
const START: Input = { ...NO_INPUT, start: true }

interface EntryView { initials: string }
interface EventView { type: string; name?: string }

const modeOf = (s: GameState): string => (s as unknown as { mode: string }).mode
const entryOf = (s: GameState): EntryView | null =>
  (s as unknown as { entry: EntryView | null }).entry
const eventsOf = (s: GameState): EventView[] =>
  (s as unknown as { events: EventView[] }).events

/** A qualifying run parked on the game-over screen, entry not yet armed. */
function gameoverState(seed = 7): GameState {
  const s = { ...initialState(seed), score: 4200, wave: 3, lives: 0, gameOver: true }
  ;(s as unknown as { mode: string }).mode = 'gameover'
  ;(s as unknown as { entry: EntryView | null }).entry = null
  return s
}

/** Game-over with the entry armed (what the shell produces via beginNameEntry). */
const armed = (seed = 7): GameState => beginNameEntry!(gameoverState(seed))

const typeAll = (s: GameState, keys: string[]): GameState =>
  keys.reduce((acc, k) => enterInitial!(acc, k), s)

// ---- the new surface exists ----------------------------------------------------

describe('typed entry — the core surface exists', () => {
  it('sim.ts exports beginNameEntry(state) and enterInitial(state, key)', () => {
    expect(typeof beginNameEntry).toBe('function')
    expect(typeof enterInitial).toBe('function')
  })
})

// ---- arming the entry ------------------------------------------------------------

describe('beginNameEntry — arms the entry screen on gameover only', () => {
  it('arms an empty buffer on the gameover screen', () => {
    const s = armed()
    expect(modeOf(s)).toBe('gameover')
    expect(entryOf(s)).toEqual({ initials: '' })
  })

  it('is inert in attract and playing (no phantom entry screens)', () => {
    for (const mode of ['attract', 'playing']) {
      const base = initialState(3)
      ;(base as unknown as { mode: string }).mode = mode
      const out = beginNameEntry!(base)
      expect(modeOf(out), mode).toBe(mode)
      expect(entryOf(out), mode).toBeNull()
    }
  })
})

// ---- typing (the shared verb, star-wars numbers) -----------------------------------

describe('enterInitial — typing fills the buffer (uppercased, capped at 3)', () => {
  it('appends lowercase keydowns UPPERCASED, in typing order', () => {
    const s = typeAll(armed(), ['a', 'c', 'e'])
    expect(entryOf(s)?.initials).toBe('ACE')
  })

  it('ignores a 4th letter (3-char arcade convention)', () => {
    const s = typeAll(armed(), ['a', 'c', 'e', 'x'])
    expect(entryOf(s)?.initials).toBe('ACE')
  })

  it('ignores non-letter keys', () => {
    const s = armed()
    for (const key of ['5', ' ', 'Enter', 'ArrowUp', 'Escape', 'ab', '']) {
      expect(entryOf(enterInitial!(s, key)), `key ${JSON.stringify(key)}`).toEqual({ initials: '' })
    }
  })

  it('is inert without an armed entry (gameover pre-arm, attract, playing)', () => {
    const bare = gameoverState()
    expect(enterInitial!(bare, 'a')).toEqual(bare)
  })
})

describe('enterInitial — Backspace (AC-2)', () => {
  it('deletes the last typed initial', () => {
    const s = enterInitial!(typeAll(armed(), ['a', 'c']), 'Backspace')
    expect(entryOf(s)?.initials).toBe('A')
  })

  it('cannot delete past an empty buffer', () => {
    const s = enterInitial!(armed(), 'Backspace')
    expect(entryOf(s)?.initials).toBe('')
  })

  it('corrects a full-buffer typo: delete then retype', () => {
    const typo = typeAll(armed(), ['a', 'c', 'x'])
    const fixed = enterInitial!(enterInitial!(typo, 'Backspace'), 'e')
    expect(entryOf(fixed)?.initials).toBe('ACE')
  })
})

// ---- confirm: start edge commits the COMPLETED buffer -------------------------------

describe('stepGame — the armed entry gates the gameover exit', () => {
  it('start with an INCOMPLETE buffer neither exits nor commits (the score is not lost)', () => {
    let s = typeAll(armed(), ['a', 'c'])
    for (let i = 0; i < 10; i++) s = stepGame(s, START, DT)
    expect(modeOf(s)).toBe('gameover')
    expect(entryOf(s)?.initials).toBe('AC')
    expect(eventsOf(s).some((e) => e.type === 'name-entered')).toBe(false)
  })

  it('start with all 3 typed commits: name-entered event, attract, entry cleared', () => {
    const ready = typeAll(armed(), ['a', 'c', 'e'])
    const idle = stepGame(ready, NO_INPUT, DT) // establish start=false, then edge
    const s = stepGame(idle, START, DT)
    expect(modeOf(s)).toBe('attract')
    expect(entryOf(s)).toBeNull()
    const committed = eventsOf(s).filter((e) => e.type === 'name-entered')
    expect(committed).toHaveLength(1)
    expect(committed[0].name).toBe('ACE')
  })

  it('the commit event is emitted exactly once (events are per-frame, not accumulated)', () => {
    const ready = typeAll(armed(), ['a', 'c', 'e'])
    const idle = stepGame(ready, NO_INPUT, DT)
    const commit = stepGame(idle, START, DT)
    const after = stepGame(commit, NO_INPUT, DT)
    expect(eventsOf(after).some((e) => e.type === 'name-entered')).toBe(false)
  })

  it('a start HELD across the transition cannot commit — a fresh press is required (AC-4)', () => {
    // Ride start=true continuously from BEFORE the buffer completes: the core's
    // rising-edge register must swallow it. (The shell's latch re-arms on OS
    // key-repeat, so the core-side register is the real guard.)
    let s = stepGame(typeAll(armed(), ['a', 'c']), START, DT) // held with 2 typed — inert
    s = enterInitial!(s, 'e') // 3rd letter typed while start is still down
    for (let i = 0; i < 10; i++) s = stepGame(s, START, DT) // still held — must not commit
    expect(modeOf(s)).toBe('gameover')
    expect(eventsOf(s).some((e) => e.type === 'name-entered')).toBe(false)
    s = stepGame(s, NO_INPUT, DT) // released
    s = stepGame(s, START, DT) // fresh press — commits
    expect(modeOf(s)).toBe('attract')
  })

  it('without an armed entry, gameover + start -> attract exactly as today', () => {
    const s = stepGame(gameoverState(), START, DT)
    expect(modeOf(s)).toBe('attract')
    expect(eventsOf(s).some((e) => e.type === 'name-entered')).toBe(false)
  })
})

// ---- determinism -------------------------------------------------------------------

describe('typed entry — determinism and non-mutation', () => {
  it('identical calls give identical results and never mutate the caller', () => {
    const base = armed()
    const snapshot = JSON.parse(JSON.stringify(entryOf(base)))
    const a = enterInitial!(base, 'q')
    const b = enterInitial!(base, 'q')
    expect(entryOf(a)).toEqual(entryOf(b))
    expect(entryOf(base)).toEqual(snapshot)
  })
})

// ---- the auto-tag dies + the shared VERB + wiring (AC-1 / AC-3 / AC-2) --------------

describe("the 'ACE' auto-tag is retired and the mechanism is shared", () => {
  const srcPath = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
  const mainSrc = () => readFileSync(srcPath('../../src/main.ts'), 'utf8')
  const coreSources = (): string => {
    const dir = srcPath('../../src/core')
    return readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
      .join('\n')
  }

  it("src/main.ts no longer contains the 'ACE' constant (comment-inclusive scan)", () => {
    expect(mainSrc()).not.toMatch(/(['"`])ACE\1/)
  })

  it('src/main.ts arms the entry, forwards Backspace, and persists on name-entered', () => {
    const main = mainSrc()
    expect(main).toContain('beginNameEntry')
    expect(main).toContain('Backspace')
    expect(main).toContain('name-entered')
  })

  it('some core module imports @arcade/shared/name-entry (AC-3)', () => {
    expect(coreSources()).toContain('@arcade/shared/name-entry')
  })

  it('the shell start latch is key-repeat-proof (OS repeat must not machine-gun edges)', () => {
    // battlezone's latch guards `!e.repeat`; star-wars' predates that. With a
    // typed entry screen behind the same key, the guard becomes load-bearing.
    const shellInput = readFileSync(srcPath('../../src/shell/input.ts'), 'utf8')
    expect(shellInput).toMatch(/\brepeat\b/)
  })
})
