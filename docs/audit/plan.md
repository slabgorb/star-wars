# Star Wars primary-source audit — pairing plan (Phase 2)

Ten paired auditors, one per source↔ours subsystem. Every auditor receives
[`preflight.md`](./preflight.md) verbatim as ground truth. Findings land in
`docs/audit/findings/pair-<name>.json`; the citation gate (`npm test -- citations`)
must be green after every phase. Scopes define **claim ownership** — auditors may
read any file, but file findings only inside their scope.

| Pair | Prefix | Source (LF, `~/Projects/star-wars-1983-source-text`) | Ours | Scope |
|---|---|---|---|---|
| pair-timing | T | WSINT.MAC, WSMAIN.MAC, WSGLOB.MAC (timer/sync vars) | `src/main.ts`, `src/core/sim.ts` (phase machine), `src/core/state.ts` | IRQ cadences; game-frame pacing (GMTIMR/GMSYNC/WAITFRAME); TPHASE order + transitions; PH.TIM phase timers; FRAME counters; attract/demo flow; sim tick-rate structure |
| pair-tie-ai | A | WSCPU.MAC | `src/core/sim.ts` (TIE logic), `src/core/state.ts` | spawn tables (TBG*), wave data (TSPWAV, Darth ordering), choreography scripts, TIE motion/speeds/turns, attack cadence, collision rules |
| pair-guns | G | WSGUNS.MAC, WSLAZR.MAC, TCSPLS.MAC | `src/core/sim.ts` (firing/projectiles), `src/core/gameRules.ts` | player laser speed/lifetime/cooldown/convergence; enemy fireball speed/spawn/behavior; shootable-fireball rules; hit detection radii; shot splash FX |
| pair-score-shields | S | WSGAS.MAC, WSGLOW.MAC | `src/core/gameRules.ts`, `src/core/sim.ts` (scoring/shield paths) | per-object score values (**BCD trap**), bonuses (all-towers, exhaust port), shield count/loss/gain, wave bonus arithmetic |
| pair-surface | D | WSGRND.MAC | `src/core/surface-grid.ts`, `src/core/surfaceMazes.ts`, `src/core/sim.ts` (surface phase) | tower-maze coordinates, TTWRS quotas, TOWER/BUNKER/BISHOP behavior, turret return fire, surface pacing |
| pair-trench | B | WSBASE.MAC, WSPANL.MAC | `src/core/trench-channel.ts`, `src/core/trench-detail.ts`, `src/core/trench-obstacles.ts`, `src/core/sim.ts` (trench phase) | trench geometry/length/speed, catwalk panel patterns + chain construction, exhaust-port window, wall detail |
| pair-explosions | X | WSXPLD.MAC | `src/core/sim.ts` (explosions, DX1–DX3), `src/shell/render.ts` (explosion draw) | explosion types/timing/debris, Death Star finale sequence |
| pair-models | M | WSOBJ.MAC, WSVROM.MAC, WSSTAR.MAC | `src/core/models.ts`, `src/core/modelView.ts`, `src/core/scenePresets.ts`, `src/shell/wireframe.ts` | vertex/edge tables vs models.ts (ROM units 1:1), per-object scale factors, 2D pictures (GNB/GNT sparkles), starfield generator, color/intensity. **WSVROM radix flips mid-file — see preflight** |
| pair-audio | U | WSXMT.MAC, SNDPBX, SNDAUX.MAC, SNDAUD.MAC, SNDPM.MAC, SWMUS.MAC, SWVOC3.MAC, SNDSPK.MAC, SNDGLB.MAC | `src/core/events.ts`, `src/main.ts` (event pump), `src/shell/audio.ts`, `tools/music-bake/`, `tools/pokey-bake/`, `tools/speech-bake/` | event→sound-code mapping (XMT), sound priorities, tune→moment mapping (PMTH5/PMBEN/PMRRP/PMDAR), speech-line wiring, SFX envelopes. **Derive the sound board's own timebase first — do not assume main-board rates** |
| pair-hud | H | WSSITE.MAC, TCMES.MAC, TCHSCR.MAC, WSVGAN (**RADIX 10**), WSGAS.MAC (display parts) | `src/core/hud.ts`, `src/shell/font.ts`, `src/main.ts` (overlays), high-score usage sites | crosshair/site behavior, message text + triggers, hi-score entry flow, alphanumerics if ported |

## Deliberately out of scope (record, do not audit)

| Module | Reason |
|---|---|
| WSCOIN, DPCOIN, COIN69, TCEROM | coin door / EAROM — no cabinet counterpart in a browser clone |
| TCTEST, WSCKSM, WSSTUB, WSPROG, WSROOT, WSOVLY | self-test, checksums, stubs, bank-switching plumbing |
| WSFIL0–4, WSFIL9, SNFILL, SNDSUM | ROM fill / checksum padding |
| SWMP.MAC, WSMATH.MAC internals | Math Box microcode ↔ `@arcade/shared/math3d` is an **arcade-shared** audit; here we only check star-wars usage sites |
| AVGROM.MAC | AVG hardware state PROM — emulating the beam engine is out of scope |
| Operator option switches (SWOPTS.DOC) | no operator panel; defaults assumed — limitation |

## Secondary sources — treat as CLAIMS, not authority

- `docs/star-wars-1983-source-findings.md` (our ROM-extract doc)
- `docs/sw2-6-disassembly-fidelity-audit.md` (prior audit, disasm-based)
- `docs/tie-flight-ai-model.md`
- `reference/disasm/` (the third-party disassembly)

On Tempest the internal extract doc was wrong in places and the code cited it as
authority. Where the primary MAC source contradicts one of these, that is a
`BOOK_WAS_WRONG` finding.
