# pokey-bake — authentic Star Wars SFX → WAV

Bakes Atari Star Wars (1983) sound effects to `.wav` by driving a real **POKEY**
chip emulator headlessly in Node — no browser, no MAME. Feed it POKEY register
envelopes and it renders audio you can host on R2 and play through the existing
sample-based SFX path (`src/shell/audio.ts`).

Ported from [tempest/tools/pokey-bake](../../../tempest/tools/pokey-bake) for
story 8-7 (Wave 5 audio), the story's stated reuse target.

## Why this exists

The Star Wars cabinet drives its SFX from a quad-**POKEY** sound board (plus a
TMS5220 for speech). Like Tempest, the effects are **live POKEY synthesis, not
PCM samples**, so we reconstruct each effect from its register writes. We bake
once to `.wav` (rather than synthesize live in the browser) to keep the existing
sampler pipeline; this tool does the baking.

## Usage

```bash
node tools/pokey-bake/bake-sfx.mjs [outDir] [--rate 48000|44100|56000] [--normalize]
```

- `outDir` — where to write `.wav` files (default `tools/pokey-bake/out`, gitignored)
- `--rate` — sample rate; web-pokey supports 48000 (default), 44100, 56000
- `--normalize` — peak-normalize each SFX to 0.9 (off by default, to preserve the
  relative loudness set via each channel's volume nibble)

Requires Node ≥ 16 (uses ES modules + `node:vm`). No npm install needed.

## Defining sounds — `sfx-data.mjs`

Sounds use Tempest's **ALSOUN** envelope format. Each SFX is two 6-byte envelope
records — one for AUDF1 (pitch), one for AUDC1 (distortion + volume):

```js
{
  name: 'enemy_fire',
  alsoun: {                                     // [value, beats, delta, count, restart, stop]
    audf: [0x06, 0x02, 0x03, 0x10, 0x00, 0x00],
    audc: [0xa6, 0x02, 0xff, 0x0a, 0x00, 0x00],
  },
  gain: 0.8,
}
```

`bake-sfx.mjs` walks each record at the **~250 Hz sound IRQ** (one beat ≈ 4 ms):
write `value`, hold `beats` ticks, add `delta`, repeat `count` times (`count=1` =
write once); `restart`≠0 loops; `stop`=0 terminates. `AUDCn` =
`[distortion:3][volume-only:1][volume:4]` (A0=pure tone, 80=white noise); `AUDFn`
is a frequency divider (lower → higher pitch). The runner warns `⚠ SILENT` for any
entry that produces no output.

> **Raw escape hatch:** a spec may instead provide a `pokey1` (and optional
> `pokey2`) array of `[regIndex, value, timeSeconds, …]` writes fed straight to
> `feed()`, bypassing the ALSOUN expander. Register map: `0/1`=AUDF1/AUDC1,
> `2/3`=AUDF2/AUDC2, `4/5`, `6/7`, `8`=AUDCTL, `9`=console.

> **Provenance note:** the authentic register tables live in the cabinet's sound
> disassembly under `reference/disasm/sound/` (gitignored; not present in every
> checkout). The shipped envelopes are **authentic-feel** — hand-tuned to the
> game's iconic cues — pending recovery of the real ROM tables. See the 8-7
> session for the decision record.

## Attribution / license

The POKEY emulator core in `vendor/pokey.js` is **web-pokey** by **Mariusz
Kryński**, MIT-licensed — see `vendor/LICENSE`.
Source: https://github.com/mrk-its/web-pokey (commit `0c6327b`).
Vendored unmodified; loaded via a small Node VM shim in `bake-sfx.mjs`.

This tool is build-time only and is **not** part of the game's pure `core/`
simulation.
