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
import type { Vec3 } from './math3d'
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

export type GameEvent =
  | FireEvent
  | EnemyFireEvent
  | EnemyDeathEvent
  | PlayerDeathEvent
  | LevelClearEvent
  | PlayerSpawnEvent
  | TerrainCrashEvent
