# TIE-fighter flight-AI model — recovered from the 1983 cabinet ROM

**Story:** epic-9 / 9-1 (bounded RE spike). **Status:** ✅ **DECISION GATE = (a)
RECOVERABLE** — the real flight model is decoded from the disassembly with
addresses and constants. Stories **9-2…9-5 should port it faithfully** (not fall
back to a feel-approximation). Confidence rationale and caveats in §10.

This is the **written model** the story asked for. It is our own re-expression of
behaviour traced out of the (gitignored) disassembly — no ROM code is reproduced
beyond the short instruction quotes needed as evidence. The Math Box it leans on
is documented separately in [`mathbox.md`](./mathbox.md).

---

## 0. TL;DR — what the real TIE does vs. what we do now

| | **Cabinet (1983, recovered)** | **Our clone today** (`src/core/sim.ts`) |
|---|---|---|
| Spawn position | **Fixed ROM tables**, far edge of the play cube, on/near the cockpit centerline | Random `x,y` in ±350, `z = −1200` |
| Initial velocity | **Zero** — it accelerates along its own facing | Full speed straight at the cockpit |
| Per-frame motion | **Carries its own orientation matrix; thrusts forward along it; banks (roll) and steers (yaw/pitch) to chase the player** → weaving pursuit arcs | `pos += vel`, dead straight at origin |
| Choreography | **Per-TIE bytecode "behavior script"** (roll/turn/dive/fire sequences) | none |
| Attack | Fires only when in-arc & in range; cadence = per-wave **frame-mask + PRNG**; fireball aimed at ship | A single random TIE fires on a global `ENEMY_FIRE_INTERVAL` timer |
| Lifecycle | **Loiters & keeps firing; never rams.** All TIEs peel off & fly past at the wave-end transition; a slot refills only when its TIE is **shot** | Flies into the cockpit; collision with the TIE body costs a life |
| Damage to player | **Only fireballs hit the player** (no TIE-body collision exists) | TIE body *and* fireballs can hit |
| Difficulty | Real 4-byte/entry **fire table** indexed by `min(mission + DIP, 15)`; wave composition from data tables | Scalar `1 + 0.15·(wave−1)` ramp |

The single biggest correction: **TIEs do not ram you and do not fly straight.**
They are homing, banking pursuers that loiter and shoot, choreographed by a small
per-fighter script, and only their *fireballs* are lethal.

---

## 1. Source & method

- **Primary:** `reference/disasm/StarWars_annotated.lst` — a full-program
  ($0000–$FFFF) IDA listing with ~4000 hand comments (e.g. *"3x Tie fighter data
  structure ($19 bytes per Tie)"*, *"Initialise tie fighters and fireballs"*,
  *"Space wave"*). Gitignored; never committed.
- **Math Box semantics:** Palazzolo's microcode disassembly + Margolin's notes,
  written up in [`mathbox.md`](./mathbox.md).
- **Method:** three independent traces (spawn/struct, per-frame motion,
  attack/difficulty), cross-checked against each other and spot-verified against
  the bytes. Every load-bearing claim below carries a `ROM:addr` citation and a
  confidence tag: **CONFIRMED** (the instructions prove it), **INFERRED**
  (reasoned from context), **UNKNOWN** (not recovered).
- **Fixed-point:** `$4000` = 1.0 (signed, Q1.14-ish). `$C000` = −1.0. Convert ROM
  values to clone units by dividing by `16384`, then scale to our world.

---

## 2. Coordinate frame (read this before porting — AC-relevant)

The cabinet's **world-X is depth/range** (it is the perspective divisor `DVSRH`,
with near/far clips `cmpd #$10` / `cmpd #$7F00`, ROM:790C–7918). World-Y and
world-Z are the lateral/screen axes. **Our clone uses −Z as depth.** So when
porting, the cabinet's **(X, Y, Z) = (depth, lateral, lateral)** maps to our
**(Z, X, Y)**-ish frame — do the axis swap deliberately; do not copy raw triples.
*(CONFIRMED)*

The whole simulation lives inside a **play cube** clamped each frame to
`[$8300 … $7CFF]` per axis (≈ ±1.95 units) by `sub_8DE3` (ROM:8DE3). *(CONFIRMED)*

---

## 3. Data structures (AC#1)

Three live TIE slots, six fireball slots — matching the authentic "3 TIE / 6
fireball" limits the clone already cites.

### 3.1 TIE record — `byte_4900`, **3 slots × `$19` (25) bytes** (base reg `x`)
Wired at init by `sub_6161`; activated/positioned by `sub_8F34`. Field map
(CONFIRMED unless noted):

| Off | Meaning |
|----|----|
| `0–1` | Pointer to this TIE's **Math Box matrix** (`word_50F0` slot) — position & orientation live *there*, not here |
| `2` | Math Box BIC/matrix index (`$1C/$20/$24`) used to address the matrix in math runs |
| `3` | **State**: 0 = free slot, 1 = active (despawn writes 0) |
| `4` | 3D model/object index (vector model selector) |
| `6` | **Hit/explosion timer**: 0 = alive & may fire; set `$1F` when killed |
| `7` | Object type / (reused as explosion countdown in the death path) |
| `9` | Roll-burst counter |
| `$D–$E` | **Behavior-script pointer** (the per-TIE flight-AI bytecode) |
| `$F` | Current script opcode/state |
| `$10` | Script wait/delay counter |
| `$11–$12` | Maneuver parameter & flag bits (e.g. bit `$40` = pitch/lockout) |
| `$13–$14` | Script trigger mask (AND-compared with the status word) |
| `$15–$16` | Per-frame **status flags** (bit `$10` = "in firing arc"; the flight code only *reads* it — the origin write is *believed* to be the render pass `sub_7881`, **INFERRED**, not re-verified) |
| `$17–$18` | Saved script pointer (one-deep gosub) |

### 3.2 Math Box matrix — `word_50F0`, **3 slots × `$20` (32) bytes** (base reg `u`)
A 3×4 orientation matrix + translation, in Math-Box "Matrix 2" layout. The stored
pointer targets **row C** (i.e. +$10 into the real block). Offsets relative to the
pointer `u` (CONFIRMED via identity-init `sub_CDC3` and the integrator
`sub_8AB6`):

| Off | Field | | Off | Field |
|----|----|----|----|----|
| `-$10/-$E/-$C` | orientation row A (Ax,Ay,Az) | | `-$A` | **velocity X** |
| `-8/-6/-4` | orientation row B (Bx,By,Bz) | | `-2` | **velocity Y** |
| `0/2/4` | orientation row C (Cx,Cy,Cz) | | `6` | **velocity Z** |
| `8` | **position XT (depth)** | | `$A` | **position YT** |
| `$C` | **position ZT** | | | |

The **4th column of each orientation row is the velocity component** for that
axis. Identity orientation = `$4000` on the diagonal.

### 3.3 Fireball record — `byte_494B`, **6 slots × `$6` bytes**
`0–1` math-record pointer (`word_5160`); `3` active/flags (bit0 = aimed-at-player);
`4` movement type (→ `JumpTableA675`); `5` **lifetime countdown** (frames).
*(CONFIRMED)*

---

## 4. Spawn model (AC#2 — initial state)

**Spawn is deterministic, from fixed ROM tables — NOT PRNG-driven.** (`sub_6161`'s
PRNG reads only reseed the hardware generator and the star-field; TIE geometry is
wave-scripted.) *(CONFIRMED)*

- **Chain:** `sub_6161` wires matrix pointers/indices → `sub_8ED6`/`sub_8F34`
  activate & position all 3 slots at wave start; `sub_8F7B`/`loc_8FB1` top up one
  slot mid-wave (only a slot freed by a kill).
- **Selection:** the wave list `off_9070[byte_4B14]` yields per-TIE entries of 3
  pointers — `model`, `behavior-script`, and `XYZ-position` (ROM:8FD0–8FD8).
- **Position tables** (ROM:9028–906A), each entry `X,Y,Z` words. Every entry has
  **depth `XT = $7C00`** (≈1.94, far edge of the cube) and a **small discrete
  lateral offset** `Y/Z ∈ {0, ±$0400, ±$0800}` (≈ 0, ±0.06, ±0.125). So TIEs
  appear as distant dots essentially dead ahead on the centerline. *(CONFIRMED)*
- **Orientation at spawn:** identity with `Ax,By` flipped to `$C000` (−1.0)
  (ROM:8FEB) → the model is **turned to face the player**. *(CONFIRMED)*
- **Initial velocity = 0** (the velocity columns are zeroed). The TIE then
  accelerates along its heading as its script rotates it. *(CONFIRMED)*

> **Porting note:** replace the clone's `spawnTie` random spread + immediate
> full-speed-at-origin with table-driven centerline spawns at max depth, facing
> the player, with zero starting velocity.

---

## 5. Per-frame flight model (AC#2 — motion)

Per frame the space-wave loop (`loc_6859`) calls `sub_8B6D`, which walks the 3
slots and runs **`sub_8BE1`** for each active TIE (ROM:8B6D→8BE1). `sub_8BE1`
does, in order *(CONFIRMED)*:

1. **Run the behavior script** (`sub_8E23`/`loc_8E3A`) — advances this TIE's
   choreography (§5.1).
2. **Roll** — if the roll-burst counter `9,x > 0`, apply a fixed-angle bank
   (§5.2a).
3. **Build velocity from orientation** (`sub_8D9D`): zero the velocity columns,
   then add a chosen orientation **basis vector** (scaled ÷32 or ÷64) per the
   maneuver bits → the TIE **thrusts along its own facing**. (ROM:8D9D; primitives
   `sub_89E9`…`sub_8A7E`.) *(CONFIRMED)*
4. **Integrate position** — `sub_8AB6`: `pos += vel` on all three axes, with
   overflow guards (`ldd -$A,u; addd 8,u; std 8,u`, …). *(CONFIRMED — verified)*
5. **Clamp** to the play cube (`sub_8DE3`). *(CONFIRMED)*
6. **Steer & maybe fire** (§5.2c, §6).

So velocity is **not** a fixed vector — it is rebuilt every frame from the
continuously-rotated orientation, which is exactly what makes the path curve.

### 5.1 The behavior-script VM (the choreography)
Each TIE runs a tiny **bytecode interpreter** (`sub_8E23` + `JumpTable8E68`,
ROM:8E23–8ED5) whose program pointer is `$D,x`. Opcodes: conditional branch on
status-flag masks, jump/call/return (one-deep), and **"set maneuver"**
(`sub_8EBA`: load a duration into `$10,x` and a 16-bit flag word into
`$11,x/$12,x`). The per-frame motion code (§5) executes whatever maneuver the
script currently has loaded. This is how Atari authored each fighter's
roll→turn→dive→fire routine. *(CONFIRMED structurally; the exact opcode table and
per-wave scripts — `byte_91E1` etc. — are not exhaustively decoded; see §10.)*

### 5.2 The three rotational drivers
All rebuild the TIE's orientation matrix via Math Box Roll/Pitch/Yaw on the TIE's
own matrix (`sub_89C8/89D3/89DE`, "Space wave roll/pitch/yaw"). *(CONFIRMED)*

- **(a) Roll burst** (ROM:8BFC–8C0F): while `9,x > 0`, roll by a fixed angle —
  `Sine=$1640, Cosine=$3C02` → **≈ 20.3°/frame** (a sharp bank). *(CONFIRMED)*
- **(b) Scripted pitch/yaw/roll** (when the burst is done): the maneuver bits pick
  pitch/yaw/roll using a **small** sine/cosine from table `word_89A8` at fixed
  index `#$14` → **≈ 4.5°/frame** (gentle turn). *(CONFIRMED)*
- **(c) Homing / steering** (ROM:8C44–8D66): each frame it transforms the player
  into the TIE's local frame with **Math Box program `$67`** (`(P − T2)·Matrix2` +
  distance² terms; `P` = ship pos `MReg4C/4D/4E`, `T2` = TIE pos, `Matrix2` = TIE
  orientation). The result `MReg00/01/02` is the **TIE→player vector in the TIE's
  own frame** (forward/range, plus lateral error). It then yaws on the Y error and
  pitches on the Z error to null them → **the TIE steers to face and chase the
  player.** "Lined up" when `MReg39+MReg3A ≤ $20`. *(CONFIRMED)*

### 5.3 Recovered motion constants

| Quantity | Value | Source |
|---|---|---|
| Thrust per frame | basis ÷32 (`$200`, fast) or ÷64 (`$100`, slow) per axis | `sub_8D9D` + `sub_8AB6` |
| Steering turn rate | sin `$4FF/$4000` ≈ **4.48°/frame** | `word_89A8[#$14]` |
| Roll-burst rate | sin `$1640/$4000` ≈ **20.3°/frame** | ROM:8C03 |
| Position clamp | each axis `[$8300, $7CFF]` (≈ ±1.95) | `sub_8DE3` |
| Spawn depth | `XT = $7C00` (≈ 1.94) | ROM:9028+ |
| Spawn lateral | `{0, ±$0400, ±$0800}` (≈ 0, ±0.06, ±0.125) | ROM:9028+ |

> **Porting note (9-2, updated):** the `°/frame` rates above are *per cabinet
> game-tick*, and the tick **is pinned**: `TICK_HZ = 246.094 / 12 ≈ 20.508 Hz`
> (audit **T-007**, from `WSINT.MAC:147` `LDA #11. ;12.*4.2MS==>50. MS, 20 PER
> SECOND` — GMTIMR reloads 11+1 = 12 IRQs/game-frame; IRQ = 12.096 MHz / 4096 /
> 12). Do **not** apply "20.3°/frame" once per wall-clock frame at an arbitrary
> 60 fps — port each rate as `°/frame × TICK_HZ` to get **degrees/second**, the
> same dt-independent-seconds idiom the core already uses elsewhere (e.g.
> `ENEMY_SHOT_TTL = 64/TICK_HZ`). This is now **live**: `state.ts`'s
> `TIE_ROLL_RATE`/`TIE_YAW_RATE`/`TIE_PITCH_RATE`/`TIE_THRUST_RATE(_SLOW)`
> convert these constants exactly this way, and `applyManeuver` (`sim.ts`)
> applies them continuously each frame from the choreography VM's current
> twist/move bits — see the sw7 TIE-VM/fire design, §3 (discreteness inside the
> seconds core) and §5 (TIE flight — wiring the VM):
> `docs/superpowers/specs/2026-07-18-star-wars-tie-vm-fire-wiring-design.md`.

---

## 6. Attack lifecycle — firing (AC#3a)

Fire decision inside `sub_8BE1` at ROM:8CAE–8CFB. A TIE fires only when **all** of
these pass *(CONFIRMED)*:

1. `$15,x` bit `$10` set — TIE is **in the firing arc** (the flight code reads this flag; its origin write is *believed* to be the render pass `sub_7881` — **INFERRED**).
2. `$11,x` bit `$40` clear — not in a maneuver lockout.
3. Range `MReg00 > $800` — **not too close**.
4. `6,x == 0` — not exploding.
5. `(DPbyte_43 & mask) == 0` — a **cadence window** (`DPbyte_43` is a free-running
   frame counter; `mask` from the per-wave fire table).
6. `PRNG > threshold` — a **probability roll** (threshold from the fire table).
7. A fireball slot is free (and within the per-wave concurrency cap).

**There is no per-TIE reload timer** — fire rate is governed entirely by the
global frame-mask + PRNG threshold + slot availability. *(CONFIRMED)*

**Fireball spawn** — `sub_A68B` ("Emit fireballs from tie fighters", ROM:A68B):
set lifetime `5,u = $40` (64 frames), active `3,u = 1`, movement type `4,u = 1`,
then **launch vector = TIE world position − ship translation** (`MReg4C/4D/4E`) →
aimed straight at the player; play fire SFX via `Sound_36`. *(CONFIRMED; the literal
`SOUNDIO=$4400` write is inside the `Sound_*` helper — INFERRED, not chased down.)*

**Fireball travel** — `sub_A849` dispatches per slot to `sub_A875` (type 1): the
relative coordinates shrink ~7/8 per frame (`vel −= vel>>3`) so it homes along the
launch line toward the ship, and **self-despawns when lifetime `5,x` hits 0**.
*(CONFIRMED)*

---

## 7. Peel-away / fly-past / exit (AC#3b)

**Mid-wave, TIEs neither ram nor fly past.** `sub_8BE1` never clears `3,x`; the
fighters loiter inside the clamped play cube, banking and steering and firing. A
slot is freed **only when its TIE is shot**, and the spawner refills exactly that
freed slot → the familiar *"shoot one, another appears."* *(CONFIRMED)*

**The fly-past happens at the wave-end transition.** When the space-wave timer
`word_4B0E` reaches `$1A4`, the main loop sets `DPbyte_41 = $21` (ROM:68BC–68C4),
which dispatches to `sub_68D0` ("Entering Death Star") and swaps the per-TIE
routine to **`sub_8B86`** (ROM:8B86): every remaining TIE eases its lateral
position back toward center and **drives its forward/depth translation `+$400`/frame**
until it overruns the far plane, then frees the slot (`3,x = 0`). So all survivors
peel off and fly past the camera together as the Death Star looms. *(CONFIRMED)*

**Ram vs fly-past — verdict:** there is **no TIE-body ↔ ship collision anywhere**
in the pipeline. Player shots hit TIEs (crosshair targeting `sub_B32B`, kill sets
`6,x=$1F` + score); **fireballs** hit the player (box test `sub_AAE4` vs ship
position; a hit decrements shield `DPbyte_60` and sets the fireball-hit timer
`DPbyte_62`). `sub_B98B` ("Check if tie/bunker/tower been hit") iterates the
**explosion-effect** pool, not a TIE-vs-ship collider. **Only fireballs damage the
player.** *(CONFIRMED)*

> **Porting note (9-3):** drop TIE-body collision with the cockpit; un-shot TIEs
> should loiter & fire, then peel away at wave end — not deliver damage by
> arriving.

---

## 8. Per-wave difficulty (AC#4)

**Fire-parameter table `byte_8D71`** (ROM:8D71), 4 bytes/entry, indexed by
`byte_4B19`; entry = `[cadence-mask, PRNG-threshold, fireball-slot-cap-pointer-hi,
-lo]`. Verified bytes:

| idx | mask | thr | slot cap | fire window | ~P(fire) | max concurrent |
|----|----|----|----|----|----|----|
| 0–1 | `$0F` | `$80` | `$4969` | 1/16 | ~50% | 1 |
| 2 | `$0F` | `$80` | `$4963` | 1/16 | ~50% | 2 |
| 3 | `$0F` | `$40` | `$495D` | 1/16 | ~75% | 3 |
| 4 | `$07` | `$80` | `$4957` | 1/8 | ~50% | 4 |
| 5 | `$07` | `$20` | `$4951` | 1/8 | ~87% | 5 |
| 6 | `$07` | `$20` | `$494B` | 1/8 | ~87% | 6 |
| 7 | `$03` | `$80` | `$494B` | 1/4 | ~50% | 6 |
| 8 | `$03` | `$60` | `$494B` | 1/4 | ~62% | 6 |
| 9 | `$03` | `$40` | `$494B` | 1/4 | ~75% | 6 |
| ≥10 | `$03` | `$30` | `$494B` | 1/4 | ~81% | 6 (`byte_8D99`) |

Higher index ⇒ tighter cadence + higher fire probability + more simultaneous
fireballs. *(table bytes CONFIRMED & verified; the % column is arithmetic assuming
a uniform PRNG — INFERRED.)*

**How the index scales** *(CONFIRMED)*:
- `byte_4B15` = **mission/level counter** (0 at start, +1 per completed Death Star
  run, cap `$62`).
- `byte_4B18` = **base difficulty** from the DIP/option byte (`byte_4593 >> ... & 3`,
  0–3), growing after mission 5+.
- `byte_4B14` = **space-wave index** `= min(byte_4B15, $1F)` — selects the **wave
  composition** (TIE count + flight scripts) via `off_9070[byte_4B14]`.
- **Fire-aggression index:** `byte_4B19 = min(byte_4B14 + byte_4B18, $F)`
  (saturates at 15); bumped again by `byte_4B17` entering the trench.

**Wave composition (count & flight paths)** is data-driven, not a formula:
`off_9070[byte_4B14]` → a group list (e.g. 6 groups) → per-group spawn descriptors
+ maneuver scripts (`byte_9024`, `byte_91E1`, …). Counts grow with the wave.
*(CONFIRMED that it's table-driven; the tables themselves are not fully
enumerated — see §10.)*

> **Porting note (9-5):** replace the scalar `1 + 0.15·(wave−1)` ramp with this
> two-axis model: a fire-aggression index (cadence/probability/concurrency from a
> small table) plus a per-wave composition (count + which flight scripts).

---

## 9. Mapping to the clone (for 9-2…9-5)

| Cabinet concept | Clone target |
|---|---|
| TIE matrix (orientation + position) | `Enemy.orient` + `Enemy.pos`, but **orientation becomes sim state that evolves**, not a recomputed look-at |
| `pos += vel`, `vel` rebuilt from orientation basis (§5) | replace `moveEnemy`'s straight `pos += vel` |
| Roll burst / scripted turns / homing steer (§5.2) | the core of 9-2: bank + steer-toward-player each step |
| Behavior-script VM (§5.1) | 9-2/9-5: a small per-TIE state machine (maneuver + duration), even if we hand-author scripts rather than port bytes |
| Fire gates + cadence table (§6, §8) | 9-4: in-arc + range gate + per-wave cadence/PRNG instead of a fixed interval |
| Loiter + wave-end peel-away; no body collision (§7) | 9-3: remove cockpit-ram damage; add fly-past |
| Fire table + index formula (§8) | 9-5: difficulty ramp |
| `$4000` = 1.0 fixed point; X=depth | normalize on import; swap axes to our −Z depth |

---

## 10. Decision gate, confidence & open questions

**GATE = (a) RECOVERABLE.** The structures, the spawn tables, the per-frame
integration, the rotation drivers, the homing transform, the fire gating, the
fly-past, and the difficulty index are all **CONFIRMED** with addresses and
constants, and were cross-checked by three independent traces plus a byte-level
spot-check. 9-2…9-5 have a real model to port; no feel-fallback is needed.

**Solidly recovered (CONFIRMED):** §3 structures, §4 spawn, §5 per-frame motion
(`sub_8BE1`/`sub_8D9D`/`sub_8AB6`/`sub_8DE3`), §5.2 rotation drivers + constants,
§6 fire gates + fireball spawn/travel, §7 loiter + wave-end peel-away + "only
fireballs damage", §8 fire table + index formula.

**Inferred (reasoned, not byte-proven):** the fire-probability percentages (assume
uniform PRNG); the exact `Sound_36 → $4400` write; a few minor struct offsets
(`5`, `8`, `$A`, `$B`).

**Not yet decoded (UNKNOWN — out of scope for this bounded spike, flag for 9-2/9-5):**
1. The **behavior-script opcode table** in detail and the **per-wave script data**
   (`byte_91E1` and friends) — we know the VM shape and that scripts choreograph
   roll/turn/dive/fire, but not every opcode or each wave's exact routine.
2. The full **wave-composition tables** (`off_9070`/`off_9078`) — TIE counts and
   which scripts per wave index — enumerated only for the first entries.
3. Exact **thrust-axis selection** per maneuver bit (`$12,x`) across all script
   states.

These are not blockers: 9-2 can port the confirmed kinematics (spawn → thrust
along orientation → bank + homing-steer → loiter → peel away) and approximate the
script choreography with a small hand-authored maneuver state machine, refining
against the tables in 9-5 if desired.

---

*All `ROM:addr` references point into `reference/disasm/StarWars_annotated.lst`
(gitignored). This document reproduces no ROM code beyond short evidentiary
quotes; it is our own analysis and is safe to commit.*
