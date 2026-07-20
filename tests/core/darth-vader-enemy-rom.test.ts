// tests/core/darth-vader-enemy-rom.test.ts
//
// Story sw7-13 — RED phase (Han Solo / TEA): wire Darth Vader's TIE (ROM shape
// RTH) into the sim as a live enemy with its survival + scoring rule. This is
// finding A-016 ("Darth Vader's TIE: 4 lives, immortal in space, retreats —
// absent from our sim") and S-002 ("Darth = 2,000 points; value matches, not yet
// awarded").
//
// GROUND TRUTH — WSCPU.MAC CPHTSA "SPACE LAZAR HIT ALIEN SHIP" (WSCPU.MAC:341-373,
// ~/Projects/star-wars-1983-source-text), transcribed here:
//
//     CPHTSA:: ...
//       LDA A$GLW(X)        ;?OR IS IT GLOWING FROM A HIT?
//       IFNE
//     5$: RTS               ;LEAVE ALONE FOR A WHILE   <- NO DOUBLE JEOPARDY
//       ...
//       DEC A$HTA(X)        ;DECREASE HITS LEFT
//       LBLE XPSA           ;NO HITS LEFT - EXPLODE SPACE ALIEN
//       LDA #05
//       STA A$HTA(X)        ;KEEP DARTH ALIVE          <- reset to 5, never dies
//       JSR SCRDARTH        ;ADD SCORE FOR HITTING DARTH (TSCA2D = 002000 = 2,000)
//       LDA #01F            ;TWO OR SO SECONDS
//       STA A$ROL(X)        ;force a roll (A-018, deferred) ...
//       STA A$GLW(X)        ;... and a glow (the double-jeopardy gate)
//
// A regular TIE has `.WS TIE,1` (HTA=1): DEC → 0 → LBLE explodes it on the first
// hit. Darth has `.WS RTH,4` (HTA=4): DEC → 3 (> 0), so he FALLS THROUGH to
// KEEP-DARTH-ALIVE, which pins HTA back to 5 after every scoring hit. So Darth is
// effectively IMMORTAL in space, scores 2,000 on each (non-glowing) hit, and
// leaves by retreating at wave end rather than by dying.
//
// WHY THESE FAIL TODAY: `Enemy.kind` is the literal `'tie'` only (state.ts:46) and
// the player-bolt loop (sim.ts:266-278) is a flat one-hit kill that always adds
// TIE_SCORE and removes the enemy — there is no Darth, no survival rule, and
// VADER_SCORE (state.ts:153) is awarded by nothing. GREEN must:
//   1. widen `Enemy.kind` to include the Darth enemy (these fixtures name it
//      `'darth'` — that string is the contract this suite pins; see the sw7-13
//      session's TEA design-deviation note if a different label is preferred),
//   2. make a hit on a Darth SURVIVE and award VADER_SCORE (gated by a short
//      post-hit glow so a burst of fire scores once), and
//   3. wire the sw7-12 wave plan's RTH shape (tie-waves.ts) into spawning.
//
// RETREAT ("flees at wave end", A-016): our space wave already clears on a KILL
// QUOTA (phaseKills >= SPACE_WAVE_QUOTA) and `enterPhase` wipes every surviving
// enemy — so an immortal Darth cannot deadlock the wave and "leaves at wave end"
// is architecturally automatic. A dedicated retreat test would be VACUOUS (green
// on today's code). It is intentionally omitted; the survival tests below pin the
// only non-automatic half (Darth is never destroyed by fire). See the session
// TEA design-deviation log.

// == sw7-17 — MIGRATED OFF THE PROJECTILE MODEL ==============================
//
// Every hit below used to be staged by parking a `playerBolt` on top of Darth and stepping
// with the trigger UP. The gun is HITSCAN now (R11b, G-004): it spawns nothing, so that
// fixture cannot occur in play and no longer hits anything. Each hit is now what it always
// meant — AIM AT HIM AND PULL (`fireAt`) — which routes through the real eye, aim and resolve.
//
// Two of CPHTSA's facts now cost real time to observe, and the tests pay it rather than
// fake it:
//   * A hit is gated on the trigger's rising EDGE and on FIRE_INTERVAL (0.25 s), so repeated
//     hits must let go of the trigger and wait, not restack bolts in one frame.
//   * A SCORING hit is gated on the A$GLW window (0x1F ≈ 1.51 s), so the "per hit" tests must
//     out-wait the glow — which is exactly what the ROM makes the pilot do.
//
// The one place the model genuinely changed shape is the double-jeopardy test; it says so
// itself, at length.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  DARTH_GLOW_SECONDS,
  TIE_SCORE,
  VADER_SCORE,
  LASER_SWEEP_SECONDS,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { SHAPE_LIVES } from '../../src/core/tie-waves'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { fireAt, release } from '../support/aim'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

// --- fixtures (the rom-score-values.test.ts pattern) ------------------------
// stepGame reads `.pos` for hit-tests; the beam aimed at an enemy's exact pos passes dead
// through it, well inside TIE_HIT_RADIUS. DOWNRANGE keeps enemies outside the cockpit hit
// sphere so the cockpit-damage pass never removes them out from under a test — and, since
// sw7-17, in FRONT of the gun, which is where a beam can reach them at all.
const TINY = 0.001 // one hit-test, negligible movement
const TICK = 1 / 60
const DOWNRANGE: Vec3 = [0, 0, -400]
const tie = (pos: Vec3): Enemy => ({ pos, kind: 'tie', orient: IDENTITY })
// `kind: 'darth'` does not typecheck until GREEN widens the Enemy.kind union —
// that widening is part of this story. Vitest (esbuild) runs it regardless; the
// assertions, not the compiler, are what carry the RED signal.
const darth = (pos: Vec3): Enemy => ({ pos, kind: 'darth', orient: IDENTITY })

/** A fresh space wave with spawns + enemy fire suppressed, so a test sees only
 *  the enemies it places. The gun is ready and the trigger is up (`initialState` gives
 *  `fireCooldown: 0` / `firePrev: false`), so the first `fireAt` always lands. */
const arena = (enemies: Enemy[]): GameState => ({
  ...initialState(1983),
  enemies,
  spawnTimer: 999,
  enemyFireCooldown: 999,
})

/** Fire ONE aimed shot at `target` and return the state on the resolving frame. The beam is
 *  hitscan, so the hit is on this frame — there is nothing to wait for. */
const shootAt = (s: GameState, target: Vec3, dt = TINY): GameState => stepGame(s, fireAt(s, target), dt)

/** Coast `seconds` with the trigger UP and the aim parked where it was — long enough to clear
 *  both gates on a repeat hit: the re-fire interval (0.25 s) and, the binding one, Darth's
 *  post-hit glow (DARTH_GLOW_SECONDS ≈ 1.51 s). Nothing may score while coasting. */
function coast(s: GameState, seconds: number): GameState {
  const frames = Math.ceil(seconds / TICK)
  const idle = release(fireAt(s, s.enemies[0]?.pos ?? DOWNRANGE))
  for (let i = 0; i < frames; i++) s = stepGame(s, idle, TICK)
  return s
}

/** Comfortably longer than the glow window, so the next pull is a fresh scoring hit. */
const GLOW_LAPSE = DARTH_GLOW_SECONDS * 2

// ---------------------------------------------------------------------------
// Identity — Darth is the RTH shape with 4 lives; a plain TIE has 1.
// ---------------------------------------------------------------------------
describe("sw7-13 — Darth's TIE is a distinct ROM enemy (`.WS RTH,4`)", () => {
  it('SHAPE_LIVES pins Darth (RTH) at 4 hits and a plain TIE at 1 (WSCPU.MAC:1165-1166)', () => {
    // The "4 lives" datum, anchored to sw7-12's table. It is the DIFFERENCE (4 vs
    // 1) that routes Darth through KEEP-DARTH-ALIVE and a mook through XPSA.
    expect(SHAPE_LIVES.RTH).toBe(4)
    expect(SHAPE_LIVES.TIE).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// A-016 — immortal in space. The single variable is the enemy KIND.
// ---------------------------------------------------------------------------
describe('sw7-13 A-016 — Darth is immortal in space (KEEP DARTH ALIVE)', () => {
  it('one laser hit REMOVES a plain TIE but Darth SURVIVES — only the kind differs', () => {
    // Same arena, same aimed shot; vary ONLY kind, so neither half can pass for the wrong
    // reason. The TIE half is a regression guard (mooks must stay one-hit-kill); the Darth
    // half is the RED (he must not die).
    const mook = shootAt(arena([tie(DOWNRANGE)]), DOWNRANGE)
    expect(mook.enemies, 'a plain TIE still explodes on the first hit').toHaveLength(0)

    const vader = shootAt(arena([darth(DOWNRANGE)]), DOWNRANGE)
    expect(vader.enemies, 'Darth is kept alive on a hit (HTA resets to 5)').toHaveLength(1)
  })

  it('Darth cannot be killed by repeated fire — no enemy-death event ever fires for him', () => {
    // Fire six separated shots at wherever Darth currently is. HTA never reaches 0, so he is
    // never removed and no 'enemy-death' cue is ever emitted.
    //
    // sw7-17: this was passing VACUOUSLY between the hitscan change and this migration — the
    // hand-placed bolts hit nothing, so "Darth survives six hits" was really "Darth survives
    // six non-events". The score assertion at the end is what fixes that: +6 × VADER_SCORE is
    // only reachable if all six shots actually connected AND each was a fresh scoring hit, so
    // the immortality claim now rests on six hits that provably landed. It is also why the
    // coast between shots is a real GLOW_LAPSE rather than the four 0.001 s frames this loop
    // used to take — those never out-waited the 1.51 s glow, whatever the comment claimed.
    const base = arena([darth(DOWNRANGE)])
    let s = base
    const deaths: unknown[] = []
    for (let hit = 0; hit < 6; hit++) {
      expect(s.enemies, `Darth alive before hit ${hit + 1}`).toHaveLength(1)
      s = shootAt(s, s.enemies[0].pos, TICK)
      deaths.push(...s.events.filter((e) => e.type === 'enemy-death'))
      s = coast(s, GLOW_LAPSE)
    }
    expect(s.enemies, 'still flying after six hits — immortal in space').toHaveLength(1)
    expect(deaths, 'Darth is never destroyed, so he never emits a death cue').toEqual([])
    expect(s.score - base.score, 'all six shots really hit him — the survival is not vacuous').toBe(
      6 * VADER_SCORE,
    )
  })
})

// ---------------------------------------------------------------------------
// S-002 — 2,000 points PER HIT (TSCA2D = 002000), via SCRDARTH.
// ---------------------------------------------------------------------------
describe('sw7-13 S-002 — hitting Darth scores 2,000 (VADER_SCORE)', () => {
  it('one hit on Darth scores 2,000; one hit on a TIE scores 1,000 — same setup, kind differs', () => {
    const base = arena([])
    const vader = shootAt(arena([darth(DOWNRANGE)]), DOWNRANGE)
    expect(vader.score - base.score, 'Darth is worth VADER_SCORE, not TIE_SCORE').toBe(VADER_SCORE)

    const mook = shootAt(arena([tie(DOWNRANGE)]), DOWNRANGE)
    expect(mook.score - base.score, 'a mook TIE stays 1,000 (regression guard)').toBe(TIE_SCORE)
  })

  it('PER HIT, not per kill: two hits on the surviving Darth score 2,000 twice = 4,000', () => {
    // The heart of S-002: 2,000 is "awarded on EACH hit that damages Darth ... not
    // once per kill" — he is never killed. Wait out the post-hit glow (ROM $1F ≈
    // 1.5s; GLOW_LAPSE doubles it) between the two hits, re-aiming at his current
    // position so he stays hittable.
    const base = arena([darth(DOWNRANGE)])
    let s = shootAt(base, DOWNRANGE, TICK)
    expect(s.enemies, 'alive after hit 1').toHaveLength(1)
    expect(s.score - base.score, 'hit 1 scored').toBe(VADER_SCORE)

    s = coast(s, GLOW_LAPSE) // glow lapses; the trigger is up the whole way
    expect(s.enemies, 'still on station after the glow lapses (loiters until wave end)').toHaveLength(1)

    s = shootAt(s, s.enemies[0].pos, TICK)
    expect(s.enemies, 'alive after hit 2').toHaveLength(1)
    expect(s.score - base.score, 'both hits scored: 2 × 2,000').toBe(2 * VADER_SCORE)
  })

  it('no double jeopardy: a whole sweep held on Darth scores 2,000 ONCE, not once a frame', () => {
    // CPHTSA leaves a glowing Darth alone (WSCPU.MAC:346-348) — a hit inside the A$GLW window
    // does not score again. This is that gate, and it is the same gate the old test guarded;
    // what changed is the only way to put two hits on him in quick succession.
    //
    // THE OLD FIXTURE IS UNREACHABLE. It stacked two bolts on him in ONE frame and asserted a
    // single 2,000 ("a naive award-per-colliding-bolt over-scores to 4,000"). Under hitscan
    // there are no bolts to stack, and CLSLZ resolves exactly ONE object per frame, so no frame
    // can ever land two hits on anything — that shape of bug cannot be written any more, and a
    // test for it would be a test for nothing.
    //
    // THE REAL PATH IS THE SWEEP, and it is a stronger version of the same question. One pull
    // opens LZ.EDG for ~8 game frames, and the beam RE-RESOLVES against the site every frame it
    // is on. So a pilot who pulls once and holds his aim on Darth genuinely hits him on every
    // frame of the window — the burst the old test was imitating with two bolts, except this one
    // really happens. The glow gate must turn all of it into a single 2,000. A resolver that
    // scored per hit now over-scores not to 4,000 but to ~23 × 2,000, and this catches it.
    //
    // Coasting with `release` keeps the trigger up, so nothing here is a second shot: the only
    // thing still firing is the window opened by the one pull.
    const base = arena([darth(DOWNRANGE)])
    let s = stepGame(base, fireAt(base, DOWNRANGE), TICK)
    expect(s.score - base.score, 'the pull itself scored once').toBe(VADER_SCORE)

    const held = release(fireAt(base, DOWNRANGE)) // same aim, trigger up
    let sweptFrames = 0
    for (let f = 0; f < Math.floor(LASER_SWEEP_SECONDS / TICK) - 1; f++) {
      s = stepGame(s, held, TICK)
      expect(s.laserEdge, 'fixture: the sweep is still on, so the beam is still hitting him').toBeGreaterThan(0)
      sweptFrames++
    }
    // The fixture is honest only if the beam really did keep resolving on him: the window has to
    // have covered several frames, and it has to have stayed well inside the glow window (or the
    // glow would have lapsed and a second 2,000 would be correct).
    expect(sweptFrames, 'fixture: the beam re-resolved on him over many frames, not one').toBeGreaterThan(10)
    expect(LASER_SWEEP_SECONDS, 'fixture: the whole sweep fits inside one glow window').toBeLessThan(
      DARTH_GLOW_SECONDS,
    )

    expect(s.enemies, 'Darth still alive').toHaveLength(1)
    expect(s.score - base.score, 'a single scoring hit for the whole sweep, not one per frame').toBe(
      VADER_SCORE,
    )
  })
})

// ---------------------------------------------------------------------------
// A-016 — the sw7-12 wave plan (tie-waves.ts) is finally wired into spawning.
// ---------------------------------------------------------------------------
describe('sw7-13 A-016 — the RTH wave slot spawns a live Darth', () => {
  it('a non-TIE fighter is spawned across the Darth-scheduled space waves', () => {
    // SET A1 (the first space wave) carries no RTH; every later set does
    // (tie-waves.ts TSPWAV, WSCPU.MAC:1230-1235). Today spawnTie() hard-codes
    // kind:'tie' (sim.ts:1299), so no Darth ever appears. Force a spawn every
    // frame (empty slot + spawnTimer 0) across waves 1-6 so spawnCount walks the
    // whole plan, and assert a non-'tie' fighter reaches the field.
    const kindsSeen = new Set<string>()
    for (let wave = 1; wave <= 6; wave++) {
      let s: GameState = {
        ...initialState(1983),
        wave,
        phase: 'space',
        enemies: [],
        spawnTimer: 0,
        enemyFireCooldown: 999,
      }
      for (let f = 0; f < 40; f++) {
        s = stepGame(s, NO_INPUT, TICK)
        for (const e of s.enemies) kindsSeen.add(e.kind)
        s = { ...s, enemies: [], spawnTimer: 0 } // free the slot; force the next spawn
      }
    }
    expect([...kindsSeen], 'the mook TIEs still spawn').toContain('tie')
    expect(
      [...kindsSeen].some((k) => k !== 'tie'),
      'a wired plan spawns a Darth (RTH) among the TIEs, not only TIEs',
    ).toBe(true)
  })
})
