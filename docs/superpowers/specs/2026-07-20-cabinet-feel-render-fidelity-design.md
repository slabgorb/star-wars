# Cabinet feel — render/experiential fidelity (epics sw8 + sw9)

**Date:** 2026-07-20
**Author:** Architect (Palpatine), from a live playtest report + a cabinet longplay
(`star-wars-longplay.mov`, 6:52, waves 1–4).
**Status:** design — pending user review, then story grooming.

---

## 1. The problem, stated precisely

Epic **sw7** was a 173-finding primary-source audit. Its verification method was
*"does the constant / opcode / table in `src/core` match the 1983 source?"* It largely
succeeded and it is **live** (v0.0.27 shipped 2026-07-20).

The playtest report is a **different axis**: *"does the screen look and play like the
cabinet longplay?"* A byte-perfect choreography VM can still **render** as a barrel
roll if the camera and projection are wrong; a ROM-authentic homing fireball can still
**play** as unfair if it always arrives. sw7 verified the model against the source;
nobody verified the **pixels and the feel** against the cabinet.

**This is not a regression and it is not "sw7 was wrong."** It is a coverage gap: the
render/camera/tuning layer was never held against the longplay the way the sim was held
against the ROM.

### Evidence anchor — the moving eye

Longplay ~wave 4 (score 352,171): mid space-combat, the **Death Star is entirely out
of frame**, only starfield + one TIE + the cockpit frame on screen. Our space camera is
a fixed identity matrix (eye at the world origin, looking down −Z, Death Star pinned
ahead and merely scaling up). It **cannot** put the Death Star out of frame. Therefore
the cabinet flies a **moving viewpoint** — and the starfield code already records the
mechanism: the cabinet feeds a viewer-translation vector `ST.UX` **off the frame
counter** (`WSMAIN.MAC`), sliding the whole world past a moving eye. Translation vs.
rotation is not eyeball-distinguishable and must be settled from the source, not guessed.

---

## 2. Reconciliation — the eleven observations vs. the code

Established from a full `src/core` + `src/shell` map. Three buckets.

### A. Genuinely missing (shell / front-of-house; sw7 never scoped)
| Observation | Code reality |
|---|---|
| No difficulty picker w/ bonus | `state.ts:169` — "the genuine selection bonus is a separate, **unmodelled feature**". The 400k/800k that sw7-4/S-015 *removed* were a mis-attributed "extra-shield" mechanic; the real home of those numbers is this picker. |
| No X-wing cockpit HUD frame | No `drawCockpit`/`canopy`/`strut` in `src/shell`. HUD frame is two bracket lines, a stand-in for the ROM "4-corner-dot frame". *Provenance of the red-strut/blue-bar canopy is TBD (authentic color-vector picture vs. cabinet artwork) — reads as vectors in the longplay.* |
| Fireball leaves no lingering image | A shot-down fireball is deleted with no burst drawn (`killedShot`). |
| Surfaces "different" | 19 authentic ROM mazes **are** ported — but there is **no TOWERS-remaining / "X00 POINTS NEXT TOWER" HUD**, which the cabinet shows prominently. |

### B. Sim-faithful but render / feel diverges (the audit's blind spot)
| Observation | Code reality | Likely root |
|---|---|---|
| Camera shifts, DS leaves view | Fixed identity camera; DS pinned ahead | **Moving eye** — port `ST.UX` viewer motion |
| Starfield "faked" / moves differently | 3D projected, but streams **forward** (hyperspace) | Same root — cabinet drifts **laterally**; sw7-10 R3 flagged this open |
| TIEs barrel-roll / y-axis-only | VM wired, does real roll/pitch/yaw/homing | **Feel/tuning or projection** — partly owned by backlog sw7-24 |
| Shot from offscreen, no counter | Fire gated to in-sights + not point-blank, but fireballs **home and always arrive** | **Playability/tuning** of homing + fire cadence |
| Fire red, not multicolor+lingering | Fireball authentically **red** (VGCRED sparkle); the magenta/yellow in the video are mostly **explosions** | Partly authentic; add destroy-burst + verify color |
| Trench short / no side guns | Side turrets + wall guns present; sim ~21s (327,680u) but **render cuts off at 28,672u** | **Render window / density** |
| Front-scroll / DS image wrong | Authentic 2D DS + concentric boom shipped sw7-15 | Likely resolved; verify + fold into moving-eye |

### C. Decision already taken
"X-wing on rails facing the Death Star" — confirmed authentic *and* the source of the
moving-eye story; not a separate item.

---

## 3. Approach — rule before you fix

Because bucket **B** is dominated by "the code already claims authentic," blindly
fixing risks churn (e.g. rewriting a ROM-correct VM when the culprit is the camera).
Each sw8 story therefore **opens by ruling the divergence**, then fixes:

1. **Watch** our build beside the longplay for that phase (serve locally; capture frames).
2. **Dig** the cited source (`WSMAIN`/`WSSTAR`/`WSCPU`/`WSGUNS`…) where a mechanism is in doubt.
3. **Rule** each divergence: *bug* (fix), *tuning* (adjust a constant/curve), or
   *accepted-deviation* (record as a house rule, like sw7's D-015/D-017).
4. **Fix** only what was ruled a bug or tuning; regression-test; keep `citations` green.

No separate heavyweight audit spike — the ruling lives inside each story. Reuse the
**existing** tooling: `models.html` (contact sheet), `scenes.html` (scene grid),
`src/shell/debug-overlay.ts` (axes/frustum/bounds), `romCompare.ts`. New code is a
liability; these already exist and are tested.

---

## 4. Epic sw8 — Cabinet feel: the flight & combat loop *(priority)*

Ordered by playtest pain. Each story is "rule → fix" per §3.

### sw8-1 — The moving eye *(collapses camera #7 + starfield #3 + approach #2)*
Port the cabinet's viewer motion so the space viewpoint is not bolted to the origin.
- **Investigate:** `ST.UX`/`ST.UY`/`ST.UZ` viewer-translation math in `WSSTAR.MAC` +
  its frame-counter drive in `WSMAIN.MAC`; settle **translation vs. rotation**.
- **Fix:** drive `cameraView(state)`'s space branch from the ported viewer vector so the
  world (stars, Death Star, TIEs) slides past a moving eye; the Death Star may leave
  frame; the starfield drifts with the eye instead of forward-streaming.
- **Guard purity:** the ROM's `STARNW` reads hardware RNG — keep the existing seeded
  substitute (sw7-10 deviation); the *motion* is what changes, not the layout source.
- **Acceptance:** at a cabinet-matched wave/point, the DS sits off-centre / off-screen
  as in the longplay; starfield parallax matches lateral drift, not forward zoom;
  deterministic (same seed → same path).

### sw8-2 — TIE feel + fire fairness *(#5 + #6; absorbs backlog sw7-24)*
The VM is authentic but reads wrong and plays unfair.
- **Flight feel:** tune the VM-driven maneuver rates / play-cube clamp (sw7-24 T4a) so
  TIEs sweep and arc across the field rather than zoom on Y and barrel-roll in place;
  land the Math Box aim law (sw7-24 T4d) so combined aim+roll actually spins.
- **Fire fairness:** the core complaint — fireballs **home and always arrive**. Rule
  whether the ROM homing is that strong; make an incoming shot **dodgeable or
  shootable** (reaction window), and confirm no shot originates outside the player's
  view/arc. Transcribe the deeper TGPROB fire rows 8–15 (sw7-24 T5a) so late-wave
  cadence is authentic rather than clamped.
- **Acceptance:** across a wave, every fireball that hits had an on-screen origin and a
  reaction window; TIE tracks visibly cross the field; late waves fire at ROM cadence.

### sw8-3 — Enemy-fire readability *(#8)*
- Add the **lingering destroy burst** when a fireball is shot down (today: silent delete).
- Verify incoming-fire color against `WSVROM`/`WSGUNS` (red may be correct); if the
  cabinet cycles color by age/distance, port that. Keep explosions (TIE/ground/DS)
  distinct — those are already multicolor.
- **Acceptance:** a shot-down fireball leaves the cabinet afterimage; color matches source.

### sw8-4 — Trench reads long + side guns register *(#9)*
- The sim channel is ~21s; the render cutoff is 28,672u, so it *looks* short. Rule the
  cabinet's `DOFAR` look-ahead window and extend the **visible** render window / wall
  panel density so the channel reads long and the wall guns (sw7-20) register on screen.
- **Acceptance:** trench visibly recedes far; side guns are legible and fire visibly.

### sw8-5 — Surface gameplay HUD + tower render *(#10 + #11)*
- Draw the missing **TOWERS-remaining** counter and **"X00 POINTS NEXT TOWER"**
  escalating readout (the `towerCount` helper exists at `state.ts:816`, never drawn).
- Verify tower/bunker render (shape, spacing, ground grid) against the wave-2/3 longplay.
- **Acceptance:** surface HUD matches the cabinet; tower field reads correctly per wave.

**Dependency order:** sw8-1 first (highest leverage; changes how everything reads).
sw8-2 next. 3/4/5 independent after that.

---

## 5. Epic sw9 — Cabinet front-of-house *(deferred — "the start stuff can wait")*

### sw9-1 — X-wing cockpit canopy frame *(#1)*
The persistent red-strut / blue-bar overlay that frames every gameplay view.
- **Open first:** determine provenance — is there a cockpit-frame **picture** in
  `WSVROM.MAC`/`WSOBJ.MAC` (authentic color vectors), or is it cabinet artwork? Port or
  draw accordingly; it is a static screen-space overlay (no game logic), like the
  crosshair chevrons.

### sw9-2 — SELECT-A-DEATH-STAR difficulty picker *(#4)*
- The countdown select screen: WAVE 1 EASY (no bonus) / WAVE 3 MEDIUM (400,000) /
  WAVE 5 HARD (800,000) — reinstating the real 200k/400k/600k/800k **start bonuses** in
  their correct home (sw7-4 removed them from the wrong mechanic). Sets the starting wave
  and banks the bonus. Cross-check the ROM select strings noted at `state.ts:169`.

### sw9-3 — Attract-mode parity pass
- The rotating banner→instructions→scoring→hi-score machine exists (sw7-10); hold it
  beside the longplay attract loop and close any ordering/timing/text gaps.

---

## 6. Verification, risks, open questions

- **Verification is visual.** A green vitest is necessary, not sufficient. Each story's
  real acceptance test is *"our frame beside the cabinet frame at the same phase."* Serve
  **your own checkout** on a spare port (the multi-checkout port trap in root `CLAUDE.md`).
- **Purity holds.** All fixes keep the `src/core` (pure sim) / `src/shell` (render) split.
  Camera/viewer motion is a render concern **unless** it must be deterministic sim state
  (the moving-eye path may need eye state in `core` for determinism — rule in sw8-1).
- **Don't re-break sw7.** Every touched constant keeps `npm test -- citations` green and
  re-stamps `remediated_by` where a finding is involved.
- **Open questions for grooming:**
  1. sw8-1 — translation, rotation, or both? (source dive decides.)
  2. sw8-2 — is ROM fireball homing really "always arrives," or is our decay wrong?
  3. sw9-1 — cockpit frame: authentic vector picture or decorative artwork?
  4. Does the moving eye belong in `core` (determinism) or `shell` (pure render)?

---

## 7. Decision log

- **Two epics, split on gameplay vs. front-of-house**, per user directive 2026-07-20
  ("make two — one for the game, one for the lobby stuff"; "getting the game play
  working — the start stuff can wait"). "Lobby stuff" = star-wars front-of-house, **not**
  the `lobby/` subrepo (all observations are in star-wars).
- **Rule-before-fix inside each story** rather than one audit spike — keeps momentum
  while preventing churn on already-authentic code.
- **sw7-24 is absorbed into sw8-2**, not run separately (same TIE-flight territory).
