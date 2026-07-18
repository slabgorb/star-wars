# Wire the TIE Choreography VM + Authentic Fire Cadence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the tested-but-unwired choreography VM into live space-phase TIE flight, and replace the invented per-TIE fire cooldown with the ROM's global frame-mask + PRNG-threshold fire gate — all within the existing dt-independent-seconds core.

**Architecture:** A local frame accumulator in `stepSpace` runs discrete decision ticks at `TICK_HZ` (VM step + fire check), while the twist/move bits those decisions select are applied as continuous, `dt`-integrated rates (`°/frame × TICK_HZ`). Discreteness where the ROM is discrete (bytecode, `FRAME & mask`); smooth dt-independent motion everywhere else.

**Tech Stack:** TypeScript (strict, ES modules), Vitest, `@arcade/shared/math3d`, `@arcade/shared/rng`. Pure `src/core` — no DOM, no wall-clock, no `Math.random`.

## Global Constraints

- **Core purity:** `src/core` must not import `shell/`, touch DOM/`window`/`document`, call `Date.now()`/`performance.now()`/`Math.random()`/`requestAnimationFrame`. Time enters only as `dt`; randomness only via the seeded RNG in `GameState`.
- **Determinism:** `stepGame(state, input, dt)` yields identical output for identical input. Frame-rate independence is a sacred boundary (swept-port-collision discipline).
- **Tick source of truth:** `TICK_HZ = 246.094 / 12` (state.ts:281, audit T-007). Never hardcode 20 or 20.508 — derive from `TICK_HZ`.
- **Source authority:** ROM facts come from `~/Projects/star-wars-1983-source-text` (`historicalsource/star-wars @ 5355b76`); cite file:line in comments.
- **Branch:** feature branch off `develop` (gitflow); `feat/{story}-{desc}`.

---

## File Structure

- `src/core/tie-status.ts` — **new.** `computeStatus(enemy, state, rng) → number`: the 6-bit status word (pure). One responsibility: geometry/RNG/events → `Status.*` bits.
- `src/core/state.ts` — **modify.** Add `frame`/`frameAcc` to `GameState` + initial values; add `TGPROB` fire table (mask/threshold), keep `FIRE_CONCURRENCY` as the guns column source.
- `src/core/gameRules.ts` — **modify.** `waveParams` returns `fireMask`/`fireThreshold` alongside `maxConcurrentShots`; fix stale `:170` comment.
- `src/core/sim.ts` — **modify.** `stepSpace` gains the accumulator loop; `spawnTie` seats a VM; VM-driven flight replaces `moveEnemy` for space; fire gate replaces per-TIE cooldown.
- `src/core/tie-vm.ts` — **read-only** (consumed; already exports `tickChoreo`, `initVm`, `program`, `Status`, `Twist`, `Move`, `choreoPc` is in `tie-waves.ts`).
- `docs/tie-flight-ai-model.md` — **modify.** Patch §5.3 caveat.
- Tests: `tests/core/tie-status.test.ts`, `tests/core/space-frame-accumulator.test.ts`, `tests/core/tie-vm-flight.test.ts`, `tests/core/tie-fire-cadence.test.ts` — **new.**

---

## Task 1: Status-word computer (`computeStatus`)

**Files:**
- Create: `src/core/tie-status.ts`
- Test: `tests/core/tie-status.test.ts`

**Interfaces:**
- Consumes: `Status` from `./tie-vm`; `Enemy`, `GameState` from `./state`; `Rng`, `nextInt` from `@arcade/shared/rng`; `length`, `normalize`, `dot`, `sub` from `@arcade/shared/math3d`.
- Produces: `export function computeStatus(e: Enemy, state: GameState, rng: Rng): number` — OR-ed `Status.*` bits. `export const FIRE_CONE_COS: number` (the INFERRED `C_AS` half-angle, as a cosine threshold). `export const PLAYER_NEAR_RANGE: number`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/tie-status.test.ts
import { describe, it, expect } from 'vitest'
import { computeStatus, FIRE_CONE_COS, PLAYER_NEAR_RANGE } from '../../src/core/tie-status'
import { Status } from '../../src/core/tie-vm'
import { makeSpaceState, makeTie } from './helpers/space' // reuse existing space fixtures

describe('computeStatus — the 6 gated bits', () => {
  it('sets C_AS when the cockpit (origin) is inside the TIE fire-cone', () => {
    // TIE on -Z looking at the origin: player dead ahead → in sights.
    const e = makeTie({ pos: [0, 0, -5000], orient: /* looking +Z toward origin */ lookAtOrigin([0,0,-5000]) })
    expect(computeStatus(e, makeSpaceState(), rngSeed(1)) & Status.C_AS).toBe(Status.C_AS)
  })

  it('clears C_AS when the player is outside the cone (TIE aimed away)', () => {
    const e = makeTie({ pos: [0, 0, -5000], orient: lookAway([0,0,-5000]) })
    expect(computeStatus(e, makeSpaceState(), rngSeed(1)) & Status.C_AS).toBe(0)
  })

  it('sets C_PN only within PLAYER_NEAR_RANGE', () => {
    const near = makeTie({ pos: [0, 0, -(PLAYER_NEAR_RANGE - 1)] })
    const far = makeTie({ pos: [0, 0, -(PLAYER_NEAR_RANGE + 1)] })
    expect(computeStatus(near, makeSpaceState(), rngSeed(1)) & Status.C_PN).toBe(Status.C_PN)
    expect(computeStatus(far, makeSpaceState(), rngSeed(1)) & Status.C_PN).toBe(0)
  })

  it('derives C_R1/C_R2 deterministically from the seeded RNG', () => {
    const e = makeTie({ pos: [0, 0, -9000] })
    const a = computeStatus(e, makeSpaceState(), rngSeed(42)) & (Status.C_R1 | Status.C_R2)
    const b = computeStatus(e, makeSpaceState(), rngSeed(42)) & (Status.C_R1 | Status.C_R2)
    expect(a).toBe(b) // same seed → same random bits
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tie-status`
Expected: FAIL — `computeStatus` not exported.

- [ ] **Step 3: Implement `computeStatus`**

Guidance (Architect-specified behavior; keep it pure):
- `C_AS`: forward axis of `e.orient` (the TIE's nose) dotted with the unit vector from the TIE to the cockpit (origin) `≥ FIRE_CONE_COS`. `FIRE_CONE_COS` is the one INFERRED value — start with `Math.cos(deg2rad(12))` and mark it TODO(playtest).
- `C_PN`: `length(e.pos) <= PLAYER_NEAR_RANGE` (seed `PLAYER_NEAR_RANGE` from the ROM "middlin-near"/near bands if enumerated; else a defensible fraction of `TIE_SPAWN_DISTANCE`, TODO(playtest)).
- `C_AG`: read from the enemy's own flag (`e.firedGun ?? false`) — set by the fire step (Task 5), consumed here.
- `C_AH`: `true` if any enemy was hit this step within a "nearby" radius — thread from the hit resolver via `state` or a per-step arg; for S1 wire the field and default `false` (populated in S2/S3).
- `C_R1`/`C_R2`: two independent bits from `nextInt(rng, 2)` calls. Cite `WSGLOB C$R1/C$R2 "random bit"`.

Every branch cites its `Status.*` bit and WSCPU/WSGLOB source line in a comment.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tie-status`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tie-status.ts tests/core/tie-status.test.ts
git commit -m "feat(sw7): computeStatus — the 6-bit TIE status word (unwired)"
```

---

## Task 2: Frame accumulator scaffolding

**Files:**
- Modify: `src/core/state.ts` (GameState fields + initial state)
- Modify: `src/core/sim.ts` (`stepSpace` accumulator loop; no behavior change yet)
- Test: `tests/core/space-frame-accumulator.test.ts`

**Interfaces:**
- Produces on `GameState`: `readonly frame: number` (monotonic game-frame counter), `readonly frameAcc: number` (carried remainder seconds). Fresh runs start both at `0`.
- Internal: `stepSpace` runs `while (frameAcc >= 1/TICK_HZ) { …decisionTick…; frame++; frameAcc -= 1/TICK_HZ }`.

- [ ] **Step 1: Write the failing test (dt-independence of the frame count)**

```ts
// tests/core/space-frame-accumulator.test.ts
import { describe, it, expect } from 'vitest'
import { stepGame } from '../../src/core/sim'
import { TICK_HZ } from '../../src/core/state'
import { makeSpaceState } from './helpers/space'

const runFor = (seconds: number, dt: number) => {
  let s = makeSpaceState()
  for (let acc = 0; acc + 1e-9 < seconds; acc += dt) s = stepGame(s, NO_INPUT, dt)
  return s
}

describe('space frame accumulator', () => {
  it('advances state.frame at TICK_HZ, independent of dt chunking', () => {
    const coarse = runFor(1.0, 1 / 15)
    const fine = runFor(1.0, 1 / 120)
    // ~TICK_HZ frames in one second, and the SAME count regardless of render fps
    expect(coarse.frame).toBe(fine.frame)
    expect(Math.abs(coarse.frame - Math.round(TICK_HZ))).toBeLessThanOrEqual(1)
  })

  it('carries the remainder (no frames dropped or doubled across calls)', () => {
    const oneBig = runFor(0.5, 0.5)
    const manySmall = runFor(0.5, 1 / 240)
    expect(oneBig.frame).toBe(manySmall.frame)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- space-frame-accumulator`
Expected: FAIL — `state.frame` is `undefined`.

- [ ] **Step 3: Add fields + accumulator (no decision logic yet)**

- In `state.ts`: add `frame: number` and `frameAcc: number` to `interface GameState`; initialize both to `0` in the initial/space-entry state constructors.
- In `sim.ts` `stepSpace`: accumulate `dt` into a local `frameAcc = state.frameAcc + dt`; loop `const step = 1 / TICK_HZ; while (frameAcc >= step) { /* decision tick — empty for now */ frame++; frameAcc -= step }`; return `{ ...next, frame, frameAcc }`. Keep the existing continuous motion path untouched so behavior is unchanged this task.

Cite `WSINT.MAC:145-149` (GMTIMR ÷12) and `WSMAIN.MAC:271` (WAITFRAME) in a comment.

- [ ] **Step 4: Run to verify pass + full suite still green**

Run: `npm test -- space-frame-accumulator && npm test`
Expected: new tests PASS; existing suite unchanged (no behavior wired yet).

- [ ] **Step 5: Commit**

```bash
git add src/core/state.ts src/core/sim.ts tests/core/space-frame-accumulator.test.ts
git commit -m "feat(sw7): space-phase frame accumulator (frame/frameAcc), dt-independent"
```

---

## Task 3: Seat a VM on each spawned TIE

**Files:**
- Modify: `src/core/state.ts` (`Enemy` gains `vm?: ChoreoVm`, `firedGun?: boolean`)
- Modify: `src/core/sim.ts` (`spawnTie`)
- Test: `tests/core/tie-vm-flight.test.ts` (spawn portion)

**Interfaces:**
- Consumes: `initVm` from `./tie-vm`; `choreoPc`, `waveSpawnPlan` from `./tie-waves`.
- Produces on `Enemy`: `vm?: ChoreoVm`, `firedGun?: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/tie-vm-flight.test.ts
import { describe, it, expect } from 'vitest'
import { spawnTieForTest } from './helpers/space' // thin wrapper exporting spawnTie output
import { choreoPc, waveSpawnPlan } from '../../src/core/tie-waves'

describe('spawnTie seats a choreography VM', () => {
  it('initialises vm.pc from the plan entry choreography ref', () => {
    const wave = 1, slot = 0
    const e = spawnTieForTest({ wave, slot })
    const expectedPc = choreoPc(waveSpawnPlan(wave)[slot].choreography)
    expect(e.vm?.pc).toBe(expectedPc)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tie-vm-flight`
Expected: FAIL — `e.vm` is `undefined`.

- [ ] **Step 3: Implement**

In `spawnTie` (sim.ts:1673): after resolving `shape`, also read `choreography` from the same plan entry and set `vm: initVm(choreoPc(entry.choreography))`. Add `firedGun: false`. Guard the past-plan-end fallback (`?? initVm(choreoPc('1A1'))` or the mook default entry).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tie-vm-flight`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/state.ts src/core/sim.ts tests/core/tie-vm-flight.test.ts
git commit -m "feat(sw7): seat a choreography VM on each spawned TIE (choreoPc wiring)"
```

---

## Task 4: VM-driven flight (retire `moveEnemy` for space)

**Files:**
- Modify: `src/core/sim.ts` (decision tick in `stepSpace`; new `applyManeuver`; retire `moveEnemy` call in space)
- Modify: `src/core/state.ts` (§5.3 rate constants: `TIE_ROLL_RATE`, `TIE_YAW_RATE`, `TIE_PITCH_RATE`, `TIE_THRUST_RATE`, `TIE_THRUST_RATE_SLOW`)
- Test: `tests/core/tie-vm-flight.test.ts` (flight portion)

**Interfaces:**
- Consumes: `tickChoreo`, `program`, `Twist`, `Move` from `./tie-vm`; `computeStatus` from `./tie-status`.
- Produces (state.ts, all rad/units per SECOND, derived from §5.3 `°/frame × TICK_HZ`):
  `TIE_ROLL_RATE = deg2rad(20.3) * TICK_HZ`, `TIE_YAW_RATE = TIE_PITCH_RATE = deg2rad(4.48) * TICK_HZ`, thrust rates from basis `÷32`/`÷64` × `TICK_HZ`.
- Produces (sim.ts): `applyManeuver(e: Enemy, twist: number, move: number, dt: number): Enemy` — integrates the active bits into `orient`/`pos` for one `dt`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/tie-vm-flight.test.ts (append)
import { stepGame } from '../../src/core/sim'
import { TIE_ROLL_RATE } from '../../src/core/state'

describe('VM-driven TIE flight', () => {
  it('total roll over a fixed-frame ROLL_L maneuver = frames × per-frame rate, at any dt', () => {
    // Drive a TIE whose current script segment is a known ROLL_L for N frames.
    // Integrate at two dt values; the accumulated bank angle must match to within FP tolerance.
    const bankCoarse = accumulatedBank(runScript('ROLL_L', 8, 1 / 15))
    const bankFine   = accumulatedBank(runScript('ROLL_L', 8, 1 / 120))
    expect(Math.abs(bankCoarse - bankFine)).toBeLessThan(1e-3)
    expect(Math.abs(bankCoarse - 8 * (TIE_ROLL_RATE / /*≈*/ (246.094 / 12)))).toBeLessThan(1e-2)
  })

  it('AIM_PLAYER steers the nose toward the cockpit (homing), not a fixed rate', () => {
    const before = noseErrorToCockpit(tieRunning('AIM_PLAYER', /*offset*/ [3000, 0, -8000]))
    const after = noseErrorToCockpit(stepManyFrames(before.state, 5))
    expect(after.err).toBeLessThan(before.err) // error shrinks toward zero
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tie-vm-flight`
Expected: FAIL — flight still uses `moveEnemy`; no maneuver integration.

- [ ] **Step 3: Implement the decision tick + `applyManeuver`**

In `stepSpace`, inside the accumulator loop's decision tick (Task 2), for each live enemy:
1. `status = computeStatus(e, state, rng)`.
2. `e = { ...e, vm: tickChoreo(e.vm!, program, status) }`.

Then, **every** `stepSpace` (continuous, `dt`-integrated), replace the `moveEnemy(e, dt)` call with `applyManeuver(e, e.vm!.twist, e.vm!.move, dt)`:
- Roll: if `twist & Twist.ROLL_L` rotate `orient` about nose by `-TIE_ROLL_RATE * dt`; `ROLL_R` positive. Yaw/pitch likewise with `TIE_YAW_RATE`/`TIE_PITCH_RATE`.
- `AIM_PLAYER`/`AIM_AHEAD`: rotate the nose toward the target (reuse `moveEnemy`'s homing rotation, extracted into a helper) — a bounded slew, not a fixed rate.
- Thrust: `pos += forward(orient) * (move & FWD2 ? TIE_THRUST_RATE : TIE_THRUST_RATE_SLOW) * dt`; add `UP/DOWN` vertical components.

Delete the space-path `moveEnemy` usage; keep `moveEnemy` only if another phase still calls it (grep first — if not, remove it and its `bank`/swoop constants, logging the removal).

- [ ] **Step 4: Run to verify pass + expect fixture churn**

Run: `npm test -- tie-vm-flight && npm test`
Expected: new tests PASS. The broader space-combat suite will show churn — re-baseline deliberately, confirming each change is the authentic behavior (not a regression). Trust mutation over green.

- [ ] **Step 5: Commit**

```bash
git add src/core/sim.ts src/core/state.ts tests/core/tie-vm-flight.test.ts
git commit -m "feat(sw7): VM-driven TIE flight — twist/move × §5.3 rates, retire moveEnemy for space"
```

---

## Task 5: Authentic fire cadence (§6 gate + TGPROB)

**Files:**
- Modify: `src/core/state.ts` (`TGPROB` mask/threshold columns)
- Modify: `src/core/gameRules.ts` (`waveParams` returns `fireMask`/`fireThreshold`; fix `:170` comment)
- Modify: `src/core/sim.ts` (replace per-TIE `fireCooldown` gate with the §6 gate)
- Test: `tests/core/tie-fire-cadence.test.ts`

**Interfaces:**
- Produces (state.ts): `export const FIRE_MASK: readonly number[]` = `[0x0F,0x0F,0x0F,0x0F,0x07,0x07,0x07,0x03, …saturating]`; `export const FIRE_THRESHOLD: readonly number[]` = `[0x80,0x80,0x80,0x40,0x80,0x20,0x20,0x80, …]`. Same length/index as `FIRE_CONCURRENCY`.
- Produces (gameRules.ts): `WaveParams` gains `fireMask: number`, `fireThreshold: number`; `waveParams` fills them from the fire-index (`min(wave-1, len-1)`).
- Consumes: `state.frame`, `Status.C_AS`, `nextInt(rng, 256)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/tie-fire-cadence.test.ts
import { describe, it, expect } from 'vitest'
import { stepGame } from '../../src/core/sim'
import { waveParams } from '../../src/core/gameRules'

describe('TIE fire cadence — §6 frame-mask + PRNG gate', () => {
  it('never fires on a frame where (frame & mask) != 0', () => {
    // Hold one TIE dead in-sights, wave 1 (mask 0x0F). Collect enemy-fire event frames.
    const fireFrames = collectFireFrames(oneInSightsTie({ wave: 1 }), 400)
    for (const f of fireFrames) expect(f & 0x0F).toBe(0)
  })

  it('fire probability tracks (255 - threshold)/256 over many windows (fixed seed)', () => {
    // wave 1 threshold 0x80 → ~50% of open windows fire.
    const rate = windowFireRate(oneInSightsTie({ wave: 1, seed: 7 }), 2000)
    expect(rate).toBeGreaterThan(0.35)
    expect(rate).toBeLessThan(0.65)
  })

  it('respects the concurrency cap (maxConcurrentShots)', () => {
    const cap = waveParams(1).maxConcurrentShots // 1 at wave 1
    expect(maxSimultaneousFireballs(manyInSightsTies({ wave: 1 }), 500)).toBeLessThanOrEqual(cap)
  })

  it('MUTATION: perturbing the mask changes fire timing', () => {
    // Guards vacuous tests — swapping mask 0x0F→0x03 must move the fire-frame set.
    expect(collectFireFrames(oneInSightsTie({ wave: 1 }), 200))
      .not.toEqual(collectFireFrames(oneInSightsTie({ wave: 1, maskOverride: 0x03 }), 200))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tie-fire-cadence`
Expected: FAIL — fire still runs on the per-TIE cooldown.

- [ ] **Step 3: Implement the §6 gate**

- Add `FIRE_MASK`/`FIRE_THRESHOLD` (state.ts), verbatim from `WSCPU.MAC` `TGPROB` (cite `:736`). Extend `waveParams` to return `fireMask`/`fireThreshold`.
- In `stepSpace`'s decision tick, replace the `cooldown`/`fireCooldown` block (sim.ts:317-330) with the §6 conjunction: `C_AS` set · not in maneuver lockout · `length(e.pos) > 0x800` · not exploding · `(state.frame & params.fireMask) === 0` · `nextInt(rng, 256) > params.fireThreshold` · `enemyShots.length < params.maxConcurrentShots`. On success: push the fireball (existing launch/`homeShots` path), `events.push({type:'enemy-fire', …})`, set `e.firedGun = true` (feeds `C_AG` for the roll-away script).
- Remove `ENEMY_FIRE_INTERVAL`/per-TIE `fireCooldown` from the space path (grep for other users first — surface fire keeps its own timer).
- Fix `gameRules.ts:170` stale "(unrecovered)" comment → reference `TICK_HZ`/T-007.

- [ ] **Step 4: Run to verify pass + suite**

Run: `npm test -- tie-fire-cadence && npm test`
Expected: new tests PASS; re-baseline any space-fire fixtures deliberately.

- [ ] **Step 5: Commit**

```bash
git add src/core/state.ts src/core/gameRules.ts src/core/sim.ts tests/core/tie-fire-cadence.test.ts
git commit -m "feat(sw7): authentic TIE fire — §6 frame-mask + PRNG gate + TGPROB, retire cooldown"
```

---

## Task 6: Documentation patches

**Files:**
- Modify: `docs/tie-flight-ai-model.md` (§5.3)

- [ ] **Step 1: Patch §5.3**

Replace the "Porting caveat (9-2): … which we have **not** pinned here" block with: the tick **is** pinned — `TICK_HZ = 246.094 / 12 = 20.508 Hz` (audit T-007, `WSINT.MAC:147`), and per-frame rates port as `°/frame × TICK_HZ` per second (the dt-independent-seconds idiom). Cross-reference this spec.

- [ ] **Step 2: Verify no stale "not pinned" language remains**

Run: `grep -rn "not pinned\|unrecovered\|guess of 30" docs/tie-flight-ai-model.md src/core/gameRules.ts`
Expected: no matches (or only historical notes clearly marked as superseded).

- [ ] **Step 3: Commit**

```bash
git add docs/tie-flight-ai-model.md
git commit -m "docs(sw7): §5.3 — tick pinned via TICK_HZ/T-007, per-frame→rate idiom"
```

---

## Self-Review

**Spec coverage:** §3 accumulator → Task 2; §4 status word → Task 1; §5 flight → Tasks 3-4; §6 fire → Task 5; §7 testing → tests in every task; §8 staging → Tasks map 1:1 to stories S1(T1-2)/S2(T3-4)/S3(T5)/docs(T6); §9 risks flagged inline (fixture churn in T4/T5, INFERRED `FIRE_CONE_COS` in T1). No gaps.

**Placeholder scan:** test bodies use named helpers (`makeTie`, `oneInSightsTie`, `runScript`) that the implementer creates in `tests/core/helpers/space.ts` following existing space-fixture patterns — these are fixtures to build, not placeholders in the plan's logic. All formulas (rates, TGPROB values, gate conjunction) are concrete.

**Type consistency:** `frame`/`frameAcc` (Task 2) consumed by Tasks 4-5; `vm`/`firedGun` on `Enemy` (Task 3) consumed by 4-5; `fireMask`/`fireThreshold` (Task 5) named identically in state.ts, gameRules.ts, and the fire gate; `computeStatus` signature (Task 1) matches its call site (Task 4). Consistent.
