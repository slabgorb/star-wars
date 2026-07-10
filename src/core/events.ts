// src/core/events.ts
//
// The pure-core game-event channel (Story 8-7). `stepGame` emits a fresh list of
// these on `GameState.events` each frame, describing the gameplay moments the
// shell reacts to — the Wave-5 WebAudio SFX engine (shell/audio.ts) consumes
// them, and the event->sound pump in main.ts maps each to a sample.
//
// Events are DATA, never callbacks: they carry only the information a renderer or
// SFX engine needs (which kind died, where), so the core stays pure and
// deterministic. A fixed RNG seed + input stream yields an identical event stream.
//
// Narrow with the `type` discriminant (`switch (e.type)` / `e.type === '...'`).

// `import type` ⇒ a compile-time-only reference, so no runtime import cycle with
// state.ts (which imports `GameEvent` back for the `events` channel) or math3d.ts.
import type { Vec3 } from '@arcade/shared/math3d'
import type { Phase } from './state'

// What an `enemy-death` destroyed: a space TIE fighter or a surface laser turret.
// A literal union (not `string`) keeps downstream `switch` exhaustive and rejects
// misspelled kinds. Distinct from `Enemy.kind` because a turret is not an `Enemy`.
export type DeathKind = 'tie' | 'turret'

// The player pulled the trigger and a bolt left the cockpit this frame.
export interface FireEvent {
  type: 'fire'
}

// An enemy (TIE or turret) loosed a fireball. `pos` is the bolt's world-space
// spawn point — carried for future stereo panning; the cue itself is positionless.
export interface EnemyFireEvent {
  type: 'enemy-fire'
  pos: Vec3
}

// An enemy was destroyed by a player bolt. `enemyType` is what died; `pos` marks
// where, for particle/SFX placement.
export interface EnemyDeathEvent {
  type: 'enemy-death'
  enemyType: DeathKind
  pos: Vec3
}

// The player lost a shield to hostile fire or a collision. `cause` distinguishes
// the death channel for cue selection (a surface scrape is `terrain-crash`, not
// this — see the session deviation).
export interface PlayerDeathEvent {
  type: 'player-death'
  cause: 'enemy' | 'turret'
}

// The current phase's kill quota was met; the run advances to `next` this frame.
export interface LevelClearEvent {
  type: 'level-clear'
  next: Phase
}

// A fresh run began from the attract screen — the ship spawns into the cockpit.
export interface PlayerSpawnEvent {
  type: 'player-spawn'
}

// The ship scraped the Death Star surface (dipped below the safe skim altitude),
// costing a shield. Its own audio cue, distinct from `player-death`.
export interface TerrainCrashEvent {
  type: 'terrain-crash'
}

// A player bolt shot an enemy fireball out of the air before it reached the
// cockpit (story 8-18). `pos` is where it died, for particle/SFX placement.
// Distinct from `enemy-death` because a fireball is hostile ordnance, not an
// `Enemy` — the same reason `terrain-crash` stays separate from `player-death`.
export interface FireballDestroyedEvent {
  type: 'fireball-destroyed'
  pos: Vec3
}

// A trench wall obstacle (turret or wall square) was shot down. Distinct from
// `enemy-death` because these are wall fixtures, not `Enemy`/`Turret` entities —
// the same reason `fireball-destroyed` and `terrain-crash` stay separate
// (fidelity epic, findings ## Trench catwalks, turrets & wall squares). Catwalks
// never appear here — they are hazards, not shootable, and reuse `terrain-crash`
// on cockpit contact.
export interface TrenchObstacleDestroyedEvent {
  type: 'trench-obstacle-destroyed'
  kind: 'turret' | 'square'
}

// A clean port kill — no trench shots before the killing torpedo — awarded the
// "Use the Force" bonus on top of TRENCH_BONUS (fidelity epic, findings
// ## Exhaust port & run outcome). `amount` carries FORCE_BONUS for the SFX/HUD
// layer, mirroring how the other scoring events carry their own payload.
export interface ForceBonusEvent {
  type: 'force-bonus'
  amount: number
}

// A scripted TMS5220 voice line the CORE cues at a gameplay moment (sw2-5). A
// string-literal union — not `string` — so the shell's event->speak pump stays
// exhaustive and a typo is a type error, not a silent miss. Only lines with a
// reachable trigger in the current sim are listed; the shell's SPEECH map holds
// the full 23-line cabinet catalogue (the other 19 are deferred — they need
// mechanics the sim lacks: R2 damage, Vader-on-tail, wingmen). Each id here is a
// key in that catalogue, so `speak(event.line)` type-checks (SpeechLine ⊆ SpeechName).
export type SpeechLine =
  | 'redFiveStandingBy' // run start — Luke reports in
  | 'lookAtTheSizeOfThatThing' // entering the Death Star surface
  | 'useTheForceLuke' // entering the trench (was shell-derived before sw2-5)
  | 'greatShotKidThatWasOneInAMillion' // the exhaust-port kill — the winning shot

// A voice line was cued this frame. Speech is DATA like every other event: the
// core decides WHEN a line plays (deterministic, testable), the shell decides HOW
// (the R2 LPC bake). Before sw2-5 only "Use the Force, Luke" fired, and it was
// derived in the shell off a phase edge; now every cue is a first-class event.
export interface SpeechEvent {
  type: 'speech'
  line: SpeechLine
}

export type GameEvent =
  | FireEvent
  | EnemyFireEvent
  | EnemyDeathEvent
  | PlayerDeathEvent
  | LevelClearEvent
  | PlayerSpawnEvent
  | TerrainCrashEvent
  | FireballDestroyedEvent
  | TrenchObstacleDestroyedEvent
  | ForceBonusEvent
  | SpeechEvent
