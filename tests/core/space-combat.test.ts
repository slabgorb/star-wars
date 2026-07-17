// tests/core/space-combat.test.ts
//
// Wave 1 — space combat (story 8-3), RED phase.
//
// These tests define the gameplay contract for the first playable wave and are
// EXPECTED TO FAIL until the GREEN phase implements it. They drive behaviour
// through the existing pure surface — `stepGame(state, input, dt)` and the
// `GameState` it returns — so they assert observable gameplay, not internal
// shape. Everything here obeys the sacred boundary: no DOM, no time except `dt`,
// no randomness except the seeded RNG carried in state.
//
// Contract this suite asks DEV to implement (per context-story-8-3.md, which
// says to express constants/mechanics as typed TS in src/core/state.ts):
//
//   GameState gains:
//     projectiles: Projectile[]   // player bolts in flight  <- SUPERSEDED, see below
//     enemies:     Enemy[]         // live TIE fighters
//     enemyShots:  Projectile[]    // enemy fireballs in flight
//     gameOver:    boolean         // wave over (last life lost)
//   interface Projectile { pos: Vec3; vel: Vec3; ttl: number }
//   interface Enemy      { pos: Vec3; ... }   // pos is what collision reads
//
//   Constants (real values recovered from StarWars.asm in GREEN):
//     STARTING_LIVES, TIE_SCORE, PROJECTILE_TTL, FIRE_INTERVAL,
//     SPAWN_INTERVAL, WAVE_SIZE
//
// Tests reference those constants by name rather than hard-coding numbers, so
// they remain correct whatever authentic values the disassembly yields.
//
// SUPERSEDED BY sw7-17 (R11b): "player bolts in flight" is no longer a thing 8-3's contract
// can ask for. The player's gun is a ROM HITSCAN beam — it resolves instantly against the
// nearest object under the site and spawns NOTHING — so `projectiles` now carries only the
// proton torpedo, and PROJECTILE_TTL survives in this file for ENEMY fire alone. The firing
// block below records what that cost and what replaced it.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  TIE_SCORE,
  PROJECTILE_TTL,
  FIRE_INTERVAL,
  SPAWN_INTERVAL,
  WAVE_SIZE,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { length, type Vec3 } from '@arcade/shared/math3d'

/** Trigger held, yoke centred — in the space phase the eye is the cockpit at the origin, so
 *  this points dead down −Z and any target on that axis is under the site. */
const FIRE: Input = { aimX: 0, aimY: 0, fire: true }

/** The SAME aim with the trigger up. Load-bearing since sw7-17: the gun is edge-triggered, so
 *  a second shot needs the trigger to go up in between — `FIRE, FIRE` is one shot, not two. */
const RELEASE: Input = { aimX: 0, aimY: 0, fire: false }

/** How many shots the pilot got off on this frame. The `fire` event is the pull's own record —
 *  the observable that replaced "count the bolts in `projectiles`" when the gun stopped
 *  spawning bolts (sw7-17). */
const shotsFired = (s: GameState): number => s.events.filter((e) => e.type === 'fire').length

/** A fresh wave: initialState already starts in the 'space' phase. */
const wave = (seed = 1983): GameState => initialState(seed)

// == sw7-17 — THE FIRING SYSTEM IS NO LONGER A PROJECTILE SYSTEM ==============
//
// This block used to describe the player's shot as an OBJECT: it had a position, a velocity
// and a lifetime; it advanced down −Z each step; it expired after PROJECTILE_TTL. The gun is
// HITSCAN now (R11b, audit G-004) — the ROM has no travelling player shot and no lifetime in
// WSLAZR.MAC at all — so those three tests do not describe a changed thing, they describe a
// thing that no longer exists, and there is no honest way to keep asking after it.
//
// They are retired here rather than reworded, and what replaced them is pinned elsewhere:
//   * that the shot resolves instantly, at any range, with no bolt left in flight —
//     `hitscan-laser.test.ts` (a);
//   * that a pull opens a bounded ~8-game-frame window — `laser-sweep.test.ts` (a).
// `advance()` itself, which "a bolt advances / expires" was really exercising, is still live
// for ENEMY fire and still covered: `hitscan-laser.test.ts` (e) and `shootable-fireballs.ts`.
//
// What stays here is the half that survives the model change and that no other suite owns:
// THE TRIGGER CADENCE. It gained a test, because the old "rate-limits firing" case can no
// longer tell its two mechanisms apart: it held `FIRE` down across two sub-interval steps and
// asked for one shot, which is now true for two independent reasons — the trigger is
// edge-triggered (one pull, one shot) AND the cooldown is running. Those are separate gates
// and a regression in either would hide behind the other, so each is now pulled on its own.

describe('Wave 1 — firing system', () => {
  it('pulling the trigger fires exactly one shot — and spawns nothing that flies', () => {
    const s = stepGame(wave(), FIRE, 0.016)
    expect(shotsFired(s), 'one pull, one shot').toBe(1)
    expect(s.projectiles, 'the hitscan gun puts no object in the world').toHaveLength(0)
  })

  it('holding nothing fires nothing', () => {
    const s = stepGame(wave(), NO_INPUT, 0.016)
    expect(shotsFired(s)).toBe(0)
    expect(s.projectiles).toHaveLength(0)
  })

  it('holding the trigger DOWN fires once, not repeatedly — one pull is one shot', () => {
    // EDGE-TRIGGERED SEMI-AUTO (G-012). The cabinet's fire button runs through the IRQ's VG.LON
    // latch, consumed once per game frame by TSTLAZ, so leaning on the trigger fires a single
    // shot. Ours used to auto-fire ~4/s while held — an invented cadence.
    //
    // Held for a full second, well past several FIRE_INTERVALs, so a level-triggered gun would
    // be caught here rather than merely rate-limited: it would get off four shots.
    let s = wave()
    let total = 0
    for (let i = 0; i < 60; i++) {
      s = stepGame(s, FIRE, 1 / 60)
      total += shotsFired(s)
    }
    expect(total, 'the trigger must be released and pulled again to fire twice').toBe(1)
  })

  it('rate-limits firing: a fresh pull INSIDE the fire interval is refused', () => {
    // The cooldown gate, isolated from the edge gate above — the trigger genuinely goes up and
    // comes back down, so the only thing that can refuse the second pull is FIRE_INTERVAL.
    let s = stepGame(wave(), FIRE, FIRE_INTERVAL * 0.25)
    expect(shotsFired(s), 'the first pull fires').toBe(1)
    s = stepGame(s, RELEASE, FIRE_INTERVAL * 0.25) // let go — the edge is armed again
    s = stepGame(s, FIRE, FIRE_INTERVAL * 0.25) // …and pull, 0.75 of an interval in
    expect(shotsFired(s), 'still inside FIRE_INTERVAL — the gun is not ready').toBe(0)
  })

  it('fires again once the fire interval elapses', () => {
    let s = stepGame(wave(), FIRE, FIRE_INTERVAL * 1.1)
    expect(shotsFired(s), 'the first pull fires').toBe(1)
    s = stepGame(s, RELEASE, FIRE_INTERVAL * 1.1) // the interval lapses with the trigger up
    s = stepGame(s, FIRE, FIRE_INTERVAL * 1.1)
    expect(shotsFired(s), 'the gun is ready and the trigger was pulled afresh').toBe(1)
  })
})

describe('Wave 1 — enemy spawning & movement', () => {
  it('the wave opens with an empty sky', () => {
    expect(wave().enemies).toHaveLength(0)
  })

  it('TIE fighters spawn on a timed schedule', () => {
    let s = wave()
    for (let i = 0; i < 16; i++) s = stepGame(s, NO_INPUT, (SPAWN_INTERVAL * 2) / 16)
    expect(s.enemies.length).toBeGreaterThan(0)
  })

  it('TIEs spawn ahead of the cockpit (down -Z)', () => {
    let s = wave()
    for (let i = 0; i < 16 && s.enemies.length === 0; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
    }
    expect(s.enemies.length).toBeGreaterThan(0)
    for (const e of s.enemies) expect(e.pos[2]).toBeLessThan(0)
  })

  it('never puts more than a wave of TIEs on screen at once', () => {
    let s = wave()
    for (let i = 0; i < 80; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 2)
      expect(s.enemies.length).toBeLessThanOrEqual(WAVE_SIZE)
    }
  })

  it('spawns identically for a fixed seed (determinism)', () => {
    let a = wave(7)
    let b = wave(7)
    for (let i = 0; i < 20; i++) {
      a = stepGame(a, NO_INPUT, SPAWN_INTERVAL / 2)
      b = stepGame(b, NO_INPUT, SPAWN_INTERVAL / 2)
    }
    expect(a.enemies).toEqual(b.enemies)
  })

  it('TIEs close on the cockpit over time', () => {
    let s = wave()
    for (let i = 0; i < 16 && s.enemies.length === 0; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
    }
    expect(s.enemies.length).toBeGreaterThan(0)
    const frontBefore = Math.max(...s.enemies.map((e) => e.pos[2]))
    // Net approach over a short window. Story 9-2 gives TIEs curved/weaving paths,
    // so a single sub-step can arc laterally; the cabinet invariant is that they
    // CLOSE IN over time — asserted here across ~1s rather than a single tick.
    for (let i = 0; i < 8; i++) s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 8)
    const frontAfter = Math.max(...s.enemies.map((e) => e.pos[2]))
    expect(frontAfter).toBeGreaterThan(frontBefore)
  })

  it('enemies fire fireballs aimed at the cockpit', () => {
    let s = wave()
    let armed = false
    for (let i = 0; i < 400 && !armed; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
      if (s.enemyShots && s.enemyShots.length > 0) armed = true
    }
    expect(armed).toBe(true)
    // Every fireball homes at the cockpit: isolate each and confirm a step pulls
    // it inward toward the origin (the sw4-2 ROM homing law replaced the old
    // straight-line velocity this once read off `shot.vel`). Green under either
    // law — both move the shot toward the cockpit; homing just decays it there.
    for (const shot of s.enemyShots) {
      const isolated: GameState = {
        ...wave(),
        enemies: [],
        enemyShots: [{ ...shot, pos: [...shot.pos] as Vec3 }],
        spawnTimer: 1e9,
      }
      const homed = stepGame(isolated, NO_INPUT, 0.02).enemyShots[0]
      expect(length(homed.pos)).toBeLessThan(length(shot.pos))
    }
  })
})

describe('Wave 1 — collisions, scoring & lives', () => {
  // Minimal literals; stepGame reads `.pos` for hit-tests (and an enemy shot's vel/ttl). The
  // player's `bolt` fixture is gone (sw7-17 — the gun spawns nothing); `shot` is ENEMY fire,
  // which really is a travelling projectile and keeps its literal.
  const shot = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
  const tie = (pos: Vec3): Enemy => ({ pos } as Enemy)

  /** Dead ahead of the cockpit eye, so the centred `FIRE` is a dead-on shot. */
  const AHEAD: Vec3 = [0, 0, -100]

  it('a shot on a TIE destroys it, leaves nothing in flight, and scores', () => {
    const base = wave()
    const s0: GameState = { ...base, enemies: [tie(AHEAD)], spawnTimer: 1e9 }
    const s1 = stepGame(s0, FIRE, 0.001)
    expect(s1.enemies).toHaveLength(0)
    expect(s1.projectiles).toHaveLength(0)
    expect(s1.score).toBe(base.score + TIE_SCORE)
  })

  it('a shot that misses leaves the TIE alive and the score untouched', () => {
    // The TIE MOVED OUT for this one, and it had to. The old fixture parked the bolt at
    // x = 9,999 — a miss by five figures. A beam cannot be aimed there: the yoke stops at
    // |aimX| = 1, which is the 30° edge of the 60° FOV, so at the 100 units the hit fixture
    // uses the crosshair's whole reach is ±58 — entirely INSIDE the TIE's 250-unit hit sphere.
    // At that range there is no such thing as a miss, and a "miss" test staged there would be
    // asserting the opposite of what happens.
    //
    // At 1,000 the same hard-over yoke passes 500 units wide at closest approach — clear of the
    // 250 radius with the radius to spare again. Same question ("a shot not on it does not kill
    // it"), asked where the pilot can actually get it wrong.
    const base = wave()
    const OUT: Vec3 = [0, 0, -1000]
    const HARD_OVER: Input = { aimX: -1, aimY: 0, fire: true }
    const s0: GameState = { ...base, enemies: [tie(OUT)], spawnTimer: 1e9 }
    const s1 = stepGame(s0, HARD_OVER, 0.001)
    expect(shotsFired(s1), 'he really did pull the trigger — he just missed').toBe(1)
    expect(s1.enemies).toHaveLength(1)
    expect(s1.score).toBe(base.score)
  })

  it('an enemy fireball reaching the cockpit costs a life and is consumed', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [shot([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
    expect(s1.enemyShots).toHaveLength(0)
    expect(s1.score).toBe(base.score) // taking a hit never scores
  })

  it('a TIE reaching the cockpit costs a life and is removed', () => {
    const base = wave()
    const s0: GameState = { ...base, enemies: [tie([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
    expect(s1.enemies).toHaveLength(0)
  })

  it('starts with the disassembly-defined number of lives', () => {
    expect(wave().lives).toBe(STARTING_LIVES)
  })

  it('ends the wave (game over) when the last life is lost', () => {
    const base = wave()
    const s0: GameState = { ...base, lives: 1, enemyShots: [shot([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(0)
    expect(s1.gameOver).toBe(true)
  })

  it('never lets lives fall below zero', () => {
    const base = wave()
    const s0: GameState = { ...base, lives: 1, enemyShots: [shot([0, 0, 0]), shot([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBeGreaterThanOrEqual(0)
  })
})

describe('Wave 1 — determinism & purity', () => {
  it('the crosshair tracks the yoke (aim is copied into state)', () => {
    const s = stepGame(wave(), { aimX: 0.4, aimY: -0.7, fire: false }, 0.016)
    expect(s.aimX).toBeCloseTo(0.4)
    expect(s.aimY).toBeCloseTo(-0.7)
  })

  it('identical inputs from identical seeds yield identical states', () => {
    let a = wave(42)
    let b = wave(42)
    const script: Input[] = [FIRE, NO_INPUT, FIRE, FIRE, NO_INPUT]
    for (let i = 0; i < 25; i++) {
      const inp = script[i % script.length]
      a = stepGame(a, inp, 0.02)
      b = stepGame(b, inp, 0.02)
    }
    expect(a).toEqual(b)
  })

  it('does not mutate the input state in place', () => {
    const s = wave()
    const projectilesBefore = s.projectiles
    const scoreBefore = s.score
    stepGame(s, FIRE, 0.016)
    expect(s.projectiles).toBe(projectilesBefore) // same array reference, untouched
    expect(s.projectiles).toHaveLength(0)
    expect(s.score).toBe(scoreBefore)
  })
})
