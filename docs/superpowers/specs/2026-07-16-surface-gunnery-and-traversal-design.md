# Surface gunnery & traversal — design (2026-07-16)

**Trigger:** live play report (wave-1 surface): "towers are way too far away, it is
nearly impossible to hit them — I shoot way lower than the crosshairs indicate.
Also, the wave never ends."

**Diagnosis:** three compounding defects. The maze data is innocent — tower
positions are byte-authentic (D-001..D-012 all CONFIRMED). What diverges is how
the clone closes with the field, how the gun resolves, and how the phase ends.
Ruled by the Jedi 2026-07-16: fix all three; drop the invented wave-1 surface.

Findings referenced: `docs/audit/findings/pair-surface.json` (D-015, D-018,
D-019, D-022), `pair-guns.json` (G-004 — **re-ruled wont_fix → fix**, G-012).
ROM cites verified against `~/Projects/star-wars-1983-source-text` (LF copy);
`.RADIX 16` throughout — bare immediates below are HEX. Timebase 20.508 Hz.

---

## Defect 1 — the surface gun is not on the ship (new bug, no audit finding)

- Bolts spawn at `COCKPIT` (origin): `sim.ts:173` — the sw5-6 muzzle fix covered
  only the trench (`state.phase === 'trench' ? trenchView : COCKPIT`).
- The surface **camera** flies at `[0, state.altitude, 0]` (`render.ts:284
  cameraView`), altitude ∈ [40..238], nominal `SKIM_ALTITUDE` 128.
- `aimDirection` is a camera-space direction, so sight-line and bolt run on
  **parallel rays separated by `altitude`**: every impact lands 40–238 units
  below the reticle, against `TURRET_HIT_RADIUS` 200 centred at the tower base.
- The sw5-6 comment "Other phases keep the fixed cockpit: their camera and
  collision world already share the origin" is **stale — false for the surface**
  since the camera-lift (story 11-2/11-5). Same class of incoherence: enemy
  fireballs target `COCKPIT` (origin) and the cockpit hit-test is at origin
  while the eye flies at altitude.
- ROM: the shot leaves the ship — `WSGUNS.MAC FRPTGN`: `LDD M$TX / ADDD #100
  ;JUST A BIT IN FRONT`, `LDD M$TY`, `LDD M$TZ`.

**Design (R11a):** one ship-point for the surface phase, `[0, altitude, 0]`,
used by (a) the player muzzle, (b) the fireball target (`toCockpit`), (c) the
cockpit hit-test centre — exactly the trench's `trenchView` pattern. Fix the
stale comment. Pure-core change; TDD directly (muzzle == camera eye on surface).

## Defect 2 — the projectile gun model collapses off-axis (G-004 re-ruled)

The ROM laser is **hitscan**: beams are drawn gun-ports → site each frame
(`VWLAZ`) and collision resolves instantly against the nearest object under the
site — `CLSLZ` (space, min of CL.GDS/CL.ADS), `CLGLZ` (ground), `CLBLZ` (trench,
clipped to `#7000` = 28,672 forward, `WSLAZR.MAC:418`). No travelling shot, no
lifetime. The trigger starts an 8-game-frame sweep: `LDB #8 / STB LZ.EDG`
(`WSLAZR.MAC:106-113`), retriggerable (G-012, ≈0.39 s).

Ours flies a 12,000 u/s projectile. While it flies, the field closes on the
cockpit, so bolt and target meet at fraction `bolt/(bolt+closing)` of the ray —
the bolt passes the target's plane at that fraction of its lateral offset:

| closing speed | lead fraction | dead-on aim misses towers beyond |
|---|---|---|
| 600 u/s (today) | 4.8 % | \|x\| ≈ 4,100 (24 of SQUARE's 28 objects) |
| 5,250 u/s (ROM seed) | 30 % | everything off-centre |
| 21,000 u/s (ROM cap) | 64 % | everything |

So the pacing fix (Defect 3) is **impossible under the projectile model** — and
sw7-6's trench rebuild (B-008: scroll ≈15,750 u/s) out-runs the 12,000 u/s bolt
entirely. That coupling is why G-004's audit-time `wont_fix` is re-ruled.

**Design (R11b):** port the ROM model. Player fire = 8-frame sweep window;
during the sweep, resolve per frame against the nearest hittable object whose
projected position lies under the site (within the object's hit radius at its
depth), instantly. Beam origin = the ship point (R11a); trench beam clipped to
28,672 ahead. Draw the beam gun→site (also more authentic than the tracer).
Enemy **fireballs stay projectiles** — they are real travelling objects in the
ROM. `PROJECTILE_SPEED`/`TTL` survive only where a real projectile remains
(fireballs; the trench torpedo latch is untouched here). Blocks sw7-6.

## Defect 3 — pacing, end condition, awakening (D-022 + D-019 + D-018 → fix)

Verified at source, `WSMAIN.MAC` PHIGD/PHEGD:

- `LDD #100 ;INITIAL PLAYER SPEED / STD M$VX+M.S1` — seed 256 u/frame ≈ 5,250 u/s.
- `ADDD #1 / CMPD #400 / IFLS / STD` — +1 u/frame per frame (≈ +420 u/s²),
  cap 1024 u/frame ≈ 21,000 u/s.
- `LDA GD.SEQ / CMPA #5 ;ONLY GO SO FAR INTO GROUND SEQUENCES` and
  `CMPA #80 ;SEQUENCE RUNS 80 TO 80` — the phase ends **by traversal only**:
  five sequences, one per $8000 wrap of forward travel (~371 frames ≈ 18.1 s;
  the cap is never reached in-phase). Killing all towers sets `Q.ATP` (banks the
  50,000 banner) but does **not** shorten the phase.
- Ground objects carry an awakening byte (`.BYTE .C ;AWAKENING SEQUENCE NUMBER`,
  `WSGRND.MAC:115`, values 0..3) and only activate once `GD.SEQ >=` it
  (`WSGRND.MAC:740-742`) — the maze field repeats each pass with successive
  subsets awake.

Ours: **one** pass of the field at a flat `TURRET_SCROLL_SPEED` 600 u/s —
`surfaceFieldDepth` (deepest y 32,768 + 1,200) / 600 ≈ **57 s** — with the
all-towers early-exit unreachable in practice (Defects 1–2 + off-frustum
towers), on a wave the ROM doesn't even give a surface (D-015).

**Design (R11c):**
- Keep the world-scroll inversion (camera fixed — STRUCTURAL, accepted); make
  the scroll rate a sim-integrated accelerating value: seed 5,250 u/s,
  +420 u/s², cap 21,000 u/s (frame-true `0x100`/`0x400`/+1 over `TICK_HZ`).
- Traversal = five wrapped passes of the maze field ($8000 each); phase ends at
  `GD.SEQ >= 5` **only** — drop the `allTowersKilled` arm from `phaseCleared`;
  the 50,000 clear bonus still banks once, decoupled from phase length.
- Re-transcribe the dropped 4th operand (`.C`) into `surfaceMazes.ts` for all
  19 mazes; activate objects when `GD.SEQ >= entry.seq` (fire-gate AND staged
  reveal; `TOWER_FIRE_GRACE` no longer carries that weight alone).
- **D-015 ruled — drop the wave-1 surface:** wave 1 runs space → trench; the
  first surface is wave 2 (BUNK). Remove the `mazeForWave(1) → SQUARE` special
  case and route wave-1 phase progression past 'surface'.
- Music rider: `PH.TIM == 14.` pseudo-seconds → `PMREB` "FINISH GROUND WITH
  REBEL" (sw7-8's audio hooks are live).

## Order & dependencies

`R11a (2 pt) → R11b (5 pt) → R11c (8 pt)`; **sw7-6 must gain
`depends_on: R11b's id`** — the trench rebuild's B-008 speed is unplayable
under the projectile gun. Audit bookkeeping per story: stamp `remediated_by`
(G-004+G-012 by R11b; D-018/D-019/D-022 + D-015 by R11c), reanchor citations,
keep the citations suite green. Remediated citations stay frozen as history
(the reanchor tool's contract — do not launder them onto live lines).
