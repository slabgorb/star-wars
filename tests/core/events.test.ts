// tests/core/events.test.ts
//
// RED-phase suite for Story 8-7 — "Wave 5 audio: the pure-core game-event
// channel". O'Brien trusts NOTHING about a feature whose whole job is to feed
// the shell's SFX engine. These tests pin the contract the downstream audio
// module (shell/audio.ts) and the event->sound pump (main.ts) compile against:
//
//   - the `GameEvent` discriminated union exists with the EIGHT documented
//     variants and EXACTLY the documented payload fields (compile-time);
//   - a fresh `GameState` carries an empty `events: []` channel, and `stepGame`
//     emits a FRESH list every frame (no carry-over between frames);
//   - the real gameplay moments emit their events: fire, enemy-fire,
//     enemy-death (tie + turret), player-death (enemy + turret), level-clear,
//     player-spawn, terrain-crash;
//   - the stream is DETERMINISTIC — identical seed + inputs => identical events;
//   - the new channel smuggles NO impurity into core (no Date / random / DOM /
//     shell import / debug residue) and uses no type-safety escapes.
//
// Nothing here exists yet: `src/core/events.ts` is absent and `GameState` has no
// `events` field, so the whole file is RED today (valid RED). The contract:
//
//   interface FireEvent        { type: 'fire' }
//   interface EnemyFireEvent   { type: 'enemy-fire';  pos: Vec3 }
//   interface EnemyDeathEvent  { type: 'enemy-death'; enemyType: 'tie'|'turret'; pos: Vec3 }
//   interface PlayerDeathEvent { type: 'player-death'; cause: 'enemy'|'turret' }
//   interface LevelClearEvent  { type: 'level-clear'; next: Phase }
//   interface PlayerSpawnEvent { type: 'player-spawn' }
//   interface TerrainCrashEvent{ type: 'terrain-crash' }
//   interface FireballDestroyedEvent { type: 'fireball-destroyed'; pos: Vec3 } // story 8-18
//
// NOTE (deviation, see session): the story context lists player-death cause
// 'terrain'. A surface scrape is its own audio cue, so it is modelled as the
// distinct `terrain-crash` event (one event per shield-loss moment, no
// double-emit); player-death cause stays 'enemy'|'turret'.
import { describe, it, expect } from 'vitest'
import type { GameEvent } from '../../src/core/events'
import { stepGame } from '../../src/core/sim'
import { initialState, SPACE_WAVE_QUOTA, SKIM_ALTITUDE, MIN_SKIM_ALTITUDE } from '../../src/core/state'
import type { Enemy, Turret, Projectile, GameState } from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'
import { fireAt } from '../support/aim'
import { IDENTITY } from '@arcade/shared/math3d'
// Read core source as text via Vite's `?raw` (no Node `fs` types — the project is
// deliberately browser-pure, which is exactly the boundary this suite guards).
import eventsSrc from '../../src/core/events.ts?raw'
import simSrc from '../../src/core/sim.ts?raw'
import stateSrc from '../../src/core/state.ts?raw'

const DT = 1 / 60

/** A playing-phase state seeded deterministically, with optional overrides. */
function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...initialState(1), ...overrides }
}

// One fixture per union member, in the documented shapes. This array compiles
// ONLY if `GameEvent` declares each variant with these exact discriminants and
// field names — a renamed field or a missing member is a type error, not a
// silent pass.
const ALL_EVENTS: GameEvent[] = [
  { type: 'fire' },
  { type: 'enemy-fire', pos: [0, 0, -500] },
  { type: 'enemy-death', enemyType: 'tie', pos: [0, 0, -300] },
  { type: 'enemy-death', enemyType: 'turret', pos: [120, 0, -300] },
  { type: 'player-death', cause: 'enemy' },
  { type: 'player-death', cause: 'turret' },
  { type: 'level-clear', next: 'surface' },
  { type: 'player-spawn' },
  { type: 'terrain-crash' },
  { type: 'object-crash', kind: 'tower', pos: [0, 0, 0] }, // sw7-5: ship↔standing-object crash (D-020)
  { type: 'fireball-destroyed', pos: [0, 0, -400] },
  { type: 'trench-obstacle-destroyed', kind: 'turret' },
  { type: 'force-bonus', amount: 5000 },
  { type: 'tower-bonus', amount: 50000 }, // sw3-3: the cleared-all-towers bonus
  { type: 'shield-bonus', amount: 5000, shields: 1 }, // sw7-4/S-013: per-surviving-shield wave bonus
  { type: 'speech', line: 'useTheForceLuke' }, // sw2-5: speech is now a core event
  { type: 'death-star-destroyed', pos: [0, 0, -300] }, // sw2-4: the winning-shot explosion
  { type: 'exhaust-port-missed' }, // sw2-4: the port slipped past un-destroyed
  { type: 'name-entered', name: 'ACE' }, // SH2-13: the entry screen's commit cue
  { type: 'music', track: 'towers' }, // sw3-5: the phase music channel swapped a track
  { type: 'tune', tune: 'deathKnell' }, // sw7-8: a one-shot POKEY tune cue (U-010..U-014)
]

// Exhaustive narrowing over the union: the `never` default fails to compile if a
// further variant is ever added without updating callers (rule: enum/union
// exhaustiveness), and each arm reads the variant's payload field — pinning
// `enemyType`, `cause`, `next`, `pos` by name at type-check time.
function discriminant(e: GameEvent): string {
  switch (e.type) {
    case 'fire':          return 'fire'
    case 'enemy-fire':    return `ef@${e.pos.join(',')}`
    case 'enemy-death':   return `${e.enemyType}@${e.pos.join(',')}`
    case 'player-death':  return e.cause
    case 'level-clear':   return e.next
    case 'player-spawn':  return 'spawn'
    case 'terrain-crash': return 'crash'
    case 'object-crash': return `crash-${e.kind}@${e.pos.join(',')}`
    case 'fireball-destroyed': return `fb@${e.pos.join(',')}`
    case 'trench-obstacle-destroyed': return `obs-${e.kind}`
    case 'force-bonus': return `force@${e.amount}`
    case 'tower-bonus': return `tower@${e.amount}`
    case 'shield-bonus': return `shield@${e.amount}x${e.shields}`
    case 'speech': return `speech:${e.line}`
    case 'death-star-destroyed': return `ds@${e.pos.join(',')}`
    case 'exhaust-port-missed': return 'port-miss'
    case 'name-entered': return `name:${e.name}`
    case 'music': return `music:${e.track}`
    case 'tune': return `tune:${e.tune}`
    default: {
      const _exhaustive: never = e
      return _exhaustive
    }
  }
}

describe('GameEvent — discriminated union (AC1)', () => {
  it('covers nineteen distinct, documented event types', () => {
    // Nineteen (sw7-4/S-013 added 'shield-bonus', the per-surviving-shield wave
    // bonus banked at a won run).
    // Eighteen before it: the original eight (story 8-7/8-18), 'trench-obstacle-destroyed'
    // (fidelity epic task 3), 'force-bonus' (fidelity epic task 4 — findings
    // ## Exhaust port & run outcome), 'tower-bonus' (sw3-3 — the cleared-all-
    // towers 50,000 bonus), 'speech' (sw2-5 — voice lines are now core-cued
    // events), sw2-4's two exhaust-port outcome cues 'death-star-destroyed'
    // (the winning-shot explosion, positioned) / 'exhaust-port-missed' (the port
    // slipped past the cockpit un-destroyed), 'name-entered' (SH2-13 — the
    // initials-entry commit cue), 'music' (sw3-5 — the phase music channel
    // swaps a looping track on each phase edge; findings ## Sound hooks),
    // 'object-crash' (sw7-5 / D-020 — the ship flew into a standing surface
    // tower/bunker; the ROM's BG1GLW+AUDCR shield-spending crash), and 'tune'
    // (sw7-8 / U-010..U-014 — the one-shot POKEY tunes: knell/finale/descent).
    const kinds = ALL_EVENTS.map((e) => e.type)
    expect(new Set(kinds).size).toBe(19)
    expect(new Set(kinds)).toEqual(
      new Set([
        'fire', 'enemy-fire', 'enemy-death', 'player-death',
        'level-clear', 'player-spawn', 'terrain-crash', 'fireball-destroyed',
        'trench-obstacle-destroyed', 'force-bonus', 'tower-bonus', 'shield-bonus', 'speech',
        'death-star-destroyed', 'exhaust-port-missed', 'name-entered', 'music',
        'object-crash', 'tune',
      ]),
    )
  })

  it('narrows by its `type` discriminant to the correct payload', () => {
    for (const e of ALL_EVENTS) {
      expect(discriminant(e).length).toBeGreaterThan(0)
    }
    expect(discriminant({ type: 'player-death', cause: 'turret' })).toBe('turret')
    expect(discriminant({ type: 'level-clear', next: 'trench' })).toBe('trench')
    expect(discriminant({ type: 'enemy-death', enemyType: 'tie', pos: [1, 2, 3] })).toBe('tie@1,2,3')
  })

  it('admits both documented player-death causes', () => {
    const causes: GameEvent[] = [
      { type: 'player-death', cause: 'enemy' },
      { type: 'player-death', cause: 'turret' },
    ]
    expect(causes.map(discriminant)).toEqual(['enemy', 'turret'])
  })
})

describe('GameState event channel — initial state (AC1)', () => {
  it('a fresh game starts with an empty events array', () => {
    const s = initialState(1)
    expect(Array.isArray(s.events)).toBe(true)
    expect(s.events).toEqual([])
  })

  it('distinct seeds both initialise a separate (non-aliased) empty array', () => {
    const a = initialState(1)
    const b = initialState(2)
    expect(a.events).toEqual([])
    expect(b.events).toEqual([])
    expect(a.events).not.toBe(b.events)
  })
})

describe('event emission — a fresh list every frame (AC1)', () => {
  it('an idle frame emits no events', () => {
    expect(stepGame(playing(), NO_INPUT, DT).events).toEqual([])
  })

  it('a fire event does not persist into the next (non-firing) frame', () => {
    const fired = stepGame(playing(), { ...NO_INPUT, fire: true }, DT)
    expect(fired.events).toContainEqual({ type: 'fire' })
    const next = stepGame(fired, NO_INPUT, DT)
    expect(next.events).not.toContainEqual({ type: 'fire' })
  })
})

describe('event emission — space phase gameplay moments (AC1)', () => {
  it("emits 'fire' when the trigger is pulled", () => {
    const out = stepGame(playing(), { ...NO_INPUT, fire: true }, DT)
    expect(out.events).toContainEqual({ type: 'fire' })
  })

  it("emits 'enemy-death' (tie) carrying enemyType + death position on a laser hit", () => {
    // sw7-17: the laser is HITSCAN, so "the player shot this TIE" is no longer a bolt
    // hand-placed on top of it (nothing the player fires exists as an object any more)
    // — it is AIM AT IT AND PULL THE TRIGGER, resolved in the same frame. The event
    // under test is unchanged; only the way the kill is caused is.
    const tie: Enemy = { pos: [0, 0, -300], vel: [0, 0, 0], kind: 'tie', orient: IDENTITY }
    const s0 = playing({ enemies: [tie] })
    const out = stepGame(s0, fireAt(s0, tie.pos), DT)
    expect(out.events).toContainEqual({ type: 'enemy-death', enemyType: 'tie', pos: [0, 0, -300] })
  })

  it("emits 'enemy-fire' carrying the bolt's spawn position when the formation fires", () => {
    // In its pass window: range > TIE_NEAR_BOUND (2048, the restored fire floor,
    // sw4-1) so the fighter is "not too close" and strafes. A stationary fixture
    // (vel 0) holds station, so the shot launches from its exact spot.
    const tie: Enemy = { pos: [100, 0, -3000], vel: [0, 0, 0], kind: 'tie', orient: IDENTITY }
    const out = stepGame(playing({ enemies: [tie], enemyFireCooldown: 0 }), NO_INPUT, DT)
    const fire = out.events.find((e) => e.type === 'enemy-fire')
    expect(fire).toBeDefined()
    // pos is a world-space Vec3 (for future panning); here it is the shooter's.
    expect(fire).toMatchObject({ type: 'enemy-fire', pos: [100, 0, -3000] })
  })

  it("emits 'player-death' (cause 'enemy') and spends a shield when a TIE reaches the cockpit", () => {
    const tie: Enemy = { pos: [0, 0, 0], vel: [0, 0, 0], kind: 'tie', orient: IDENTITY } // already at the cockpit
    const out = stepGame(playing({ enemies: [tie], lives: 6 }), NO_INPUT, DT)
    expect(out.events).toContainEqual({ type: 'player-death', cause: 'enemy' })
    expect(out.lives).toBe(5)
  })

  it("emits 'level-clear' (next: surface) when the space kill quota is met", () => {
    const out = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(out.phase).toBe('surface') // the transition actually happened
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'surface' })
  })

  it("emits 'player-spawn' when a run begins from the attract screen", () => {
    const out = stepGame(playing({ mode: 'attract' }), { ...NO_INPUT, start: true }, DT)
    expect(out.mode).toBe('playing')
    expect(out.events).toContainEqual({ type: 'player-spawn' })
  })
})

describe('event emission — surface phase gameplay moments (AC1, Wave 2+)', () => {
  it("emits 'enemy-death' (turret) when the laser destroys a turret", () => {
    // sw7-17 (hitscan): aimed at from the surface ship — which flies SKIM_ALTITUDE above
    // the floor the turret stands on (sw7-16), so this is a real ~38°-down shot the yoke
    // can make, not a bolt parked on the target.
    const turret: Turret = { pos: [0, 0, -300] }
    const s0 = playing({ phase: 'surface', turrets: [turret] })
    const out = stepGame(s0, fireAt(s0, turret.pos), DT)
    expect(out.events).toContainEqual(
      expect.objectContaining({ type: 'enemy-death', enemyType: 'turret' }),
    )
  })

  it("emits 'player-death' (cause 'turret') when a turret bolt lands on the cockpit", () => {
    // "On the cockpit" means ON THE SHIP, which on the surface flies at `altitude` — NOT the
    // origin (sw7-16). This fixture sat at [0,0,0] and passed only because the hit-test used to
    // sit there too, while the eye flew SKIM_ALTITUDE above it; the origin is the floor, and a
    // shot on the floor must miss the pilot. The event under test is unchanged — only the place
    // the pilot actually is has been corrected.
    const shot: Projectile = { pos: [0, SKIM_ALTITUDE, 0], vel: [0, 0, 0], ttl: 1 }
    const out = stepGame(playing({ phase: 'surface', enemyShots: [shot] }), NO_INPUT, DT)
    expect(out.events).toContainEqual({ type: 'player-death', cause: 'turret' })
  })

  it("emits 'terrain-crash' and spends a shield when the ship scrapes the surface", () => {
    const out = stepGame(
      playing({ phase: 'surface', altitude: MIN_SKIM_ALTITUDE - 1, lives: 6 }),
      NO_INPUT,
      DT,
    )
    expect(out.events).toContainEqual({ type: 'terrain-crash' })
    expect(out.lives).toBe(5)
  })
})

describe('event stream is deterministic (AC1)', () => {
  it('produces an identical event stream for identical seed + inputs', () => {
    function run(seed: number): GameEvent[] {
      let s = initialState(seed)
      const stream: GameEvent[] = []
      for (let f = 0; f < 200; f++) {
        s = stepGame(s, { ...NO_INPUT, fire: true }, DT) // fire held — spawns + RNG-driven enemy fire
        stream.push(...s.events)
      }
      return stream
    }
    const a = run(1983)
    const b = run(1983)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0) // the run actually produced events
  })
})

// --- Pure-core boundary guard (AC1 purity / AC7) ---------------------------
//
// The event channel must remain DATA. Scan the core source the story touches for
// the forbidden non-determinism / IO tokens the CLAUDE.md boundary bans, and for
// debug residue in the new/extended files.
const CORE_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ['events.ts', eventsSrc],
  ['sim.ts', simSrc],
  ['state.ts', stateSrc],
]

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['Math.random',           /\bMath\s*\.\s*random\b/],
  ['Date.now',              /\bDate\s*\.\s*now\b/],
  ['new Date',              /\bnew\s+Date\b/],
  ['performance.now',       /\bperformance\s*\.\s*now\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['document access',       /\bdocument\s*\./],
  ['window access',         /\bwindow\s*\./],
  ['shell import',          /from\s+['"][^'"]*shell/],
]

describe('pure-core boundary — event channel stays deterministic (AC1)', () => {
  for (const [name, src] of CORE_SOURCES) {
    describe(name, () => {
      for (const [token, pattern] of FORBIDDEN) {
        it(`contains no ${token}`, () => {
          expect(src).not.toMatch(pattern)
        })
      }
    })
  }
})

describe('events.ts hygiene — type-only deps + no escapes (AC1, AC7)', () => {
  it('imports core types only (no runtime relative import → no import cycle)', () => {
    // every relative import must be `import type` — events are pure DATA shapes.
    const runtimeRelImport = /^\s*import\s+(?!type\b)[^;]*from\s+['"]\.\.?\//m
    expect(eventsSrc).not.toMatch(runtimeRelImport)
    expect(eventsSrc).toMatch(/import\s+type\b/)
  })

  it('uses no type-safety escapes (as any / ts-ignore)', () => {
    expect(eventsSrc).not.toMatch(/\bas\s+any\b/)
    expect(eventsSrc).not.toMatch(/@ts-(ignore|expect-error)/)
  })

  for (const [name, src] of [['events.ts', eventsSrc], ['state.ts', stateSrc]] as const) {
    it(`${name} has no console.log or debugger residue`, () => {
      expect(src).not.toMatch(/console\s*\.\s*log/)
      expect(src).not.toMatch(/\bdebugger\b/)
    })
  }
})
