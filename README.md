# Star Wars

A faithful, browser-based clone of Atari's 1983 vector arcade game *Star Wars* —
the first-person cockpit shooter where you fly the trench run and "use the Force."

**▶ Play it live: [star-wars.slabgorb.com](https://star-wars.slabgorb.com)**

![Star Wars gameplay — the Death Star trench run, laser turrets flanking the crosshair, "EXHAUST PORT AHEAD"](https://arcade-assets.slabgorb.com/star-wars/screenshot.png)

Glowing 3D vector lines on black, rendered with HTML5 Canvas 2D. No 3D engine,
no physics engine, no backend. The game is a **deterministic pure simulation
core** (its own little "Math Box") wrapped by a thin input/render/audio shell —
the same architecture as its sibling, [tempest](../tempest).

> **Status:** Wave 0 skeleton. The math box (vec3/mat4 + perspective), the
> core/shell boundary, and a glowing wireframe render-loop are in place. The
> game proper — TIE waves, the Death Star surface, the trench — lands wave by
> wave.

---

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5274**. (Tempest runs next door on 5273.)

---

## Controls

| Action | Control |
|--------|---------|
| Aim the crosshair | **Mouse** (stands in for the cabinet's two-axis yoke) |
| Fire | **Hold left mouse button**, or **hold Space** |

The original cabinet used an analog flight yoke with triggers; the mouse maps
onto its two axes.

---

## The three phases of an attack run

Faithful to the arcade, each wave escalates through three distinct sequences:

1. **Space** — Darth Vader's TIE squadron; dodge and shoot green fireballs.
2. **Death Star surface** — skim the towers, shoot or weave past the laser turrets.
3. **Trench run** — down the trench to the exhaust port. *"Use the Force, Luke."*

---

## Architecture

Split into a **pure simulation core** and a thin **IO shell**. This boundary is
the most important rule in the codebase.

```
src/
├── core/              # PURE, deterministic, unit-tested — no DOM/canvas
│   ├── math3d.ts      # the "Math Box": vec3 / mat4 / perspective projection
│   ├── models.ts      # 3D wireframe model registry (ported from the disassembly)
│   ├── state.ts       # GameState type
│   ├── sim.ts         # stepGame(state, input, dt) → state
│   ├── input.ts       # Input type (the yoke, abstracted)
│   └── rng.ts         # seeded PRNG (deterministic)
├── shell/             # IO: render.ts, input.ts, loop.ts (audio.ts to come)
└── main.ts            # bootstrap: canvas + wire shell ↔ core
```

**The core is pure and deterministic.** It never imports from `shell/`, never
touches the DOM/`window`/`canvas`, and never calls `Date.now()`,
`performance.now()`, `Math.random()`, or `requestAnimationFrame`. All time
enters as `dt`; all randomness comes from a seeded RNG carried in the state.
`stepGame(state, input, dt)` produces identical output for identical input.

Where Tempest's core was 2.5D "tube space," Star Wars' core is genuinely 3D:
`math3d.ts` is a real model→view→projection pipeline — the software stand-in for
the cabinet's hardware Math Box.

---

## Reference material

Authentic data (vector models, game constants, POKEY SFX, TMS5220 speech) is
ported from the commented disassembly of the original cabinet, kept locally
under `reference/` (gitignored — see [reference/README.md](reference/README.md)).

---

## Tech stack

- **Language:** TypeScript (ES modules, strict mode)
- **Build tool:** [Vite](https://vitejs.dev/)
- **Tests:** [Vitest](https://vitest.dev/) — TDD on the pure core
- **Rendering:** HTML5 Canvas 2D (`shadowBlur` for the vector-CRT glow)

---

## Development

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server on port 5274 |
| `npm run build` | Type-check (`tsc --noEmit`) and build to `dist/` |
| `npm run preview` | Serve the production build locally on port 5274 |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

---

## License

Private project, for personal/educational use. *Star Wars* and *Atari* are
trademarks of their respective owners; this is an educational clone built to
learn how the original worked.

## Releasing

This repo ships from the [arcade orchestrator](https://github.com/slabgorb/arcade):
`just release star-wars` gates on tests + build, merges `develop` → `main`, tags
`vX.Y.Z`, and pushes. Every push to `main` auto-deploys to Cloudflare R2 via
GitHub Actions (`.github/workflows/deploy.yml`) — **`main` is production; never
push it by hand.** A red CI run deploys nothing.
