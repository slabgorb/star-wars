# Star Wars — Wire the TIE Choreography VM + Authentic Fire Cadence

**Status:** Design approved (brainstorming, 2026-07-18)
**Epic:** sw7 (R9 family — TIE authenticity)
**Author:** Architect
**Supersedes premise of:** the "unrecovered tick" framing in `gameRules.ts:170` and `tie-flight-ai-model.md` §5.3 (both stale since audit **T-007**)

---

## 1. Context

Two ROM-faithful modules were built and tested but never connected to the live
simulation:

- **`src/core/tie-vm.ts`** (sw7-11, finding A-009) — the per-fighter choreography
  bytecode VM. `tickChoreo(vm, program, status)` steps one **game frame**, emitting
  `twist` (roll/yaw/pitch) + `move` (thrust) bits. **Unwired.**
- **`src/core/tie-waves.ts`** (sw7-12, A-017) — wave composition. `waveSpawnPlan`
  is wired for *spawn slots + Darth ordering*, but each `WaveEntry.choreography`
  ref is ignored by flight. `choreoPc(ref)` (already built) resolves a ref → VM
  entry PC.

Live TIE flight is still the invented swoop/weave `moveEnemy` (9-2). Live TIE fire
(sim.ts:301-331, from 9-4) uses an **invented per-TIE reload cooldown and draws no
RNG** — which directly contradicts the source-confirmed model:

> **§6 (CONFIRMED):** "There is no per-TIE reload timer — fire rate is governed
> entirely by the global frame-mask + PRNG threshold + slot availability."

**The tick is not the gap.** `state.ts:281` already pins `TICK_HZ = 246.094 / 12`
(20.508 Hz) via audit T-007, and the core deliberately converts every ROM
per-game-frame count to *seconds* via `TICK_HZ`, applied as `rate × dt`, to stay
**dt-independent** (state.ts:299-300; `ENEMY_SHOT_TTL = 64/TICK_HZ`,
`LASER_SWEEP_SECONDS = 8/TICK_HZ`, `DARTH_GLOW_SECONDS = 0x1f/TICK_HZ`). That
architecture is committed and stays.

The fire-cadence source facts (from `historicalsource/star-wars @ 5355b76`,
`WSCPU.MAC:646-651` + the `TGPROB` table `:736`): a per-frame gate
`(FRAME & mask)==0` (cadence window) followed by `P.RND1 > threshold` (probability
roll), with per-wave `[mask, threshold, guns]` rows. The **guns** column is already
ported as `FIRE_CONCURRENCY`; the **mask** and **threshold** columns are not.

## 2. Goal & Scope

Make TIE flight and fire ROM-authentic by **wiring the choreography VM into live
space flight** and **replacing the invented fire cooldown with the §6 frame-mask +
PRNG gate** — entirely *within* the existing dt-independent-seconds architecture.

**In scope:** space-phase TIE flight + fire. **Out of scope:** surface/trench fire
(unchanged); A-019 music-timed descent (deferred, wants sw7-8 tunes); refining the
`AIM_PLAYER` homing to the exact Math Box `$67` law (follow-up).

## 3. Architecture — discreteness inside the seconds core

The VM (bytecode) and the fire-mask (`FRAME & mask`) are inherently **discrete**
(whole game frames). The core is **continuous** dt-independent seconds. The design
hosts discreteness without a fixed-step core by **splitting decisions from motion**:

- **A local frame accumulator, space-phase only.** `GameState` gains `frame: number`
  (a monotonic game-frame counter) and `frameAcc: number` (carried remainder).
  `stepSpace` adds `dt` to `frameAcc`; while `frameAcc >= 1/TICK_HZ` it runs **one
  decision tick** (VM step + fire check), does `frame++`, and subtracts `1/TICK_HZ`.
  The remainder carries, so *N* seconds of total `dt` always yields the same frame
  count regardless of render fps — the dt-independence property, preserved.

  **Scope of that guarantee (review finding, Task 4).** "Preserved" means exactly
  two things, no more: (1) **frame count is dt-independent** — any chunking of the
  same total `dt` produces the same `frame` (pinned by
  `tests/core/space-frame-accumulator.test.ts`); and (2) **same-`dt` replay is
  bit-identical** — two runs driven at one fixed `dt` produce byte-identical state,
  because the decision loop and the per-`stepGame` spawn/removal mutation replay in
  the same lockstep every time (pinned by `tests/core/space-determinism.test.ts`).
  It does **not** mean full cross-`dt` discrete-STATE independence: `computeStatus`
  draws two RNG ints per live TIE *inside* the accumulator's per-decision-tick loop,
  but spawns/removals mutate the enemy population only once per `stepGame` call,
  *after* the loop exits. Chunking the same total `dt` into a different number of
  `stepGame` calls changes how spawn/removal points interleave with decision ticks,
  which can change how many TIEs draw from the shared seeded RNG stream at a given
  tick — a different draw count diverges the stream, and downstream state, across
  dt chunkings. This is accepted, not a defect: the shell (`@arcade/shared/loop`,
  via `createLoop`) is a fixed-timestep loop that always calls `stepGame` with
  `dt = 1/60` (`main.ts`), so cross-dt chunking is never exercised in play — only
  guarantee (2), same-dt determinism, is load-bearing, and it holds.

- **Decisions are discrete (≈20 Hz); motion is continuous.** A decision tick chooses
  *which* `twist`/`move` bits are active and *for how many frames* (the VM), and runs
  the fire gate against `frame`. The *selected* bits are then applied as **continuous
  rates**, integrated by `dt` every step: §5.3's `20.3°/frame` becomes
  `20.3° × TICK_HZ` per second. A maneuver's total rotation over its frame-count
  equals `frames × 20.3°` **exactly**, at any frame rate, while motion stays smooth
  and needs no shell interpolation. This is the same "ROM-frames → seconds via
  `TICK_HZ`" idiom the core already uses for durations, applied to rates.

**Rejected alternatives:** discrete motion too (choppy at 60 fps, needs shell
interpolation); a full 20 Hz fixed-step core (reverses T-007, big-bangs the tested
laser/trench/projectile subsystems for marginal gain).

**Blast radius:** `GameState` gains two space-scoped fields; `stepSpace` gains the
accumulator loop; nothing outside the space phase changes.

## 4. The status word

`tickChoreo` reads a `status` word to gate `.CIF`/`.CUNTIL`; §6's fire conditions
read the same word. The ported scripts gate on exactly **six** bits, all computable
in-core (this dissolves §6's INFERRED render-pass origin for the in-arc bit):

| Bit (`Status.*`) | Meaning | Source in the clone |
|---|---|---|
| `C_AS` 0x04 | alien has player in its sights | **geometry** — player inside the TIE's forward fire-cone. *This is §6's in-arc bit.* |
| `C_PN` 0x400 | player near | geometry — range band |
| `C_AG` 0x40 | alien has fired a gun | self-flag, set in the fire step, cleared when its gate consumes it |
| `C_AH` 0x01 | nearby alien hit | event from the hit resolver |
| `C_R1` 0x10 / `C_R2` 0x20 | random bits | the seeded RNG (deterministic) |

`computeStatus(enemy, state, rng) → number` is a pure helper. The `C_AS` fire-cone
half-angle is the one **INFERRED** value (§6 gives only "bit $10 set"); pick a
defensible cone, confirm in playtest.

## 5. TIE flight — wiring the VM

**Spawn** (`spawnTie`): resolve the plan entry's choreography ref and seat a VM —
`vm: initVm(choreoPc(waveSpawnPlan(spaceWave)[spawnIndex].choreography))`. `Enemy`
gains `vm: ChoreoVm` (its `orient` matrix already exists).

**Per decision tick**, for each live TIE:
1. `status = computeStatus(e, state, rng)`.
2. `vm = tickChoreo(e.vm, program, status)`.
3. Translate `vm.twist` / `vm.move` → motion, applied as rates (§3):
   - `ROLL_L/R` → ±`20.3° × TICK_HZ`/s roll about the nose; `YAW_L/R`, `PITCH_U/D` →
     ±`4.48° × TICK_HZ`/s about the level/pitch axes.
   - `AIM_PLAYER` (0x80) / `AIM_AHEAD` (0x40) are **steer-toward-target**, not fixed
     rates — reuse `moveEnemy`'s existing homing rotation, gated by the VM.
   - `FWD/FWD2`, `UP/DOWN(×2)` → thrust along oriented axes (§5.3 thrust `÷32`/`÷64`
     per frame → rate).

Retires `moveEnemy`'s swoop/weave for the space phase. `spawnTie`'s ROM
starting-locations and the TSPWAV composition are kept; the VM governs the approach
behavior between spawn and exit.

## 6. Fire — the authentic cadence

Replace the per-TIE `fireCooldown` gate (sim.ts:317-330). On a decision tick a TIE
fires iff **all** hold (§6):

1. `C_AS` set · 2. not in a maneuver lockout · 3. range `> $800` (not too close) ·
4. not exploding · 5. **`(frame & mask) == 0`** (cadence window) · 6. **`rng() >
threshold`** (probability roll) · 7. a fireball slot free (existing
`maxConcurrentShots` cap).

`mask`/`threshold` come from **extending `FIRE_CONCURRENCY` into the full `TGPROB`**
(same fire-index, same rows). Verbatim from `WSCPU.MAC` `TGPROB`
(`.PROB mask, threshold, guns`):

| fire-index | mask (window) | threshold | guns *(already `FIRE_CONCURRENCY`)* |
|---|---|---|---|
| 0 | `0F` (≈0.78 s) | `80` (~50%) | 1 |
| 1 | `0F` | `80` | 1 |
| 2 | `0F` | `80` | 2 |
| 3 | `0F` | `40` (~75%) | 3 |
| 4 | `07` (≈0.39 s) | `80` | 4 |
| 5 | `07` | `20` (~87%) | 5 |
| 6 | `07` | `20` | 6 |
| 7 | `03` (≈0.20 s) | `80` | 6 |

`P(fire | window open) = (255 − threshold)/256`. Aggression ramps three ways at once
(shorter window, lower threshold, more slots). On fire, set the TIE's `C_AG` so its
script runs the authentic roll-away-after-shooting maneuver. Fireballs still launch
from the firing TIE aimed at the cockpit and home via the existing `homeShots` decay.

## 7. Testing

Pure, dt-independent, fixed-seed unit tests against `stepGame(state, input, dt)`:

- **Accumulator invariant** — same total `dt` chunked coarse vs. fine → identical
  `frame` count (the swept-port-collision discipline for the space counter). Full
  *state* is deliberately not asserted here — see the scope note above.
- **Same-dt determinism** — the guarantee §3 actually relies on: two runs at one
  fixed `dt` produce bit-identical state, spawns and all
  (`tests/core/space-determinism.test.ts`; see §3's scope note above).
- **Status word** — geometry → bits (player in/out of cone toggles `C_AS`; range
  bands toggle `C_PN`; `C_R1/R2` reproduce under a fixed seed).
- **Flight** — a TIE on a known script hits the expected trajectory; invariant
  *total roll over a maneuver = frames × rate* holds at any `dt`.
- **Fire** — TIE held in-sights + fixed seed → fire events on exactly the predicted
  frames; concurrency cap holds. **Mutation:** perturbing `mask` or `threshold` must
  move fire timing (guards vacuous tests).

Expect **fixture blast radius**: swapping the flight+fire model reddens much of the
space-combat suite (as the sw7-17 hitscan migration did). Re-baseline deliberately;
trust mutation over green.

## 8. Staged delivery

Sequenced by dependency (each an independently testable deliverable → its own story):

- **S1 — Status word + accumulator scaffolding.** `computeStatus` + `frame`/`frameAcc`
  fields + the accumulator loop + dt-independence tests. Pure, *unwired*, no behavior
  change. Foundation.
- **S2 — Wire VM flight.** Seat the VM at spawn; drive orientation/thrust from
  `tickChoreo` via §5.3 rates; retire `moveEnemy` for space. The big behavior change.
- **S3 — Authentic fire cadence.** The §6 gate + `TGPROB` extension, replacing the
  per-TIE cooldown.
- **Docs (ride S2/S3):** patch `tie-flight-ai-model.md` §5.3 and fix `gameRules.ts:170`
  — both still say "not pinned," stale since T-007. Cross-reference T-007.

## 9. Risks & inferred values

- **Fixture blast radius** (above) — expected, not a regression.
- **`C_AS` fire-cone half-angle** — the one genuinely INFERRED value; a tuning knob
  confirmed in playtest, not a source fact.
- **`AIM_PLAYER` homing** reuses `moveEnemy`'s swoop; the ROM's exact law is Math Box
  `$67` (§5). Reuse now, refine later if playtest shows drift.
- **Feel tuning** — §5.3 says "tune to match feel"; rates are source-pinned but the
  subjective result needs a playtest pass.

## 10. References

- `historicalsource/star-wars @ 5355b76` (LF copy `~/Projects/star-wars-1983-source-text`):
  `WSINT.MAC:145-155` (IRQ ÷12 → 20 Hz), `WSMAIN.MAC:271,371` (WAITFRAME/IFRAME),
  `WSCPU.MAC:646-651` (fire gate), `WSCPU.MAC:736` (`TGPROB` table).
- In-repo: `state.ts:281` (`TICK_HZ`, T-007), `tie-vm.ts` (VM, `Status`/`Twist`/`Move`,
  `choreoPc`), `tie-waves.ts` (`waveSpawnPlan`, `WaveEntry`), `sim.ts:1598` (`moveEnemy`),
  `sim.ts:301-331` (current fire), `gameRules.ts:182` (`FIRE_CONCURRENCY`),
  `docs/tie-flight-ai-model.md` §5, §6.
