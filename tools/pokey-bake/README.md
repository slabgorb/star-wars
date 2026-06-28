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

Sounds use Star Wars' own **4-byte FX-record** format, transcribed verbatim from
the cabinet's sound disassembly (`FX_Tables.asm`). Each SFX is a dispatch entry
(`swfx`) with one or more channels; each channel is two record-lists — one for
its AUDF register (pitch), one for AUDC (distortion + volume):

```js
{
  name: 'enemy_fire',
  rom: { command: 0x2c, dispatch: 'byte_72FF', confidence: 'inferred …' },
  swfx: {
    channels: [
      {
        src: { freq: 'stru_6A14', vol: 'stru_6A18' },
        freq: [[8, 2, 0x56, 0xf8]],                          // [count,dur,value,delta]
        vol:  [[3, 2, 0x81, 1], [2, 2, 0x86, 4], [3, 2, 0x8c, 1], [0, 0, 0, 0]],
      },
    ],
  },
  gain: 0.8,
}
```

`bake-sfx.mjs` (`expandSwfx`) walks each list at the **4.096 ms sound IRQ**: a
record `[count, duration, value, delta]` emits `value, value+delta, …` —
`count` values, each held `duration` ticks — then advances to the next record;
a `count=0` record writes 0 to the register and ends the list (an AUDC=0 write
silences the channel, which is how the cabinet ends an effect). Channels map to
AUDF/AUDC pairs across two POKEY chips (≤4 each). `AUDCn` =
`[distortion:3][volume-only:1][volume:4]` (`$Ax`=pure tone, `$8x`=white noise,
`$Cx`=poly4 buzz, `$2x`=gravelly); `AUDFn` is a frequency divider (lower → higher
pitch). The runner warns `⚠ SILENT` for any entry that produces no output.

> **Raw escape hatch:** a spec may instead provide a `pokey1` (and optional
> `pokey2`) array of `[regIndex, value, timeSeconds, …]` writes fed straight to
> `feed()`, bypassing the expander. Register map: `0/1`=AUDF1/AUDC1,
> `2/3`=AUDF2/AUDC2, `4/5`, `6/7`, `8`=AUDCTL, `9`=console. The Tempest-style
> `alsoun` 6-byte form is also still accepted.

> **Provenance:** every byte in `sfx-data.mjs` is real cabinet ROM data, decoded
> from the Star Wars sound disassembly (ROMs `136021-107`/`136021-208`):
> `FX_Tables.asm` (the envelope structs), `FX_Functions.asm` (the engine /
> register semantics) and `SW_Sound.asm` (the `off_7F61` command table). Of the
> seven effects only `player_fire` is label-confirmed in the disassembly
> (`snd_Fire_Guns`, "Fire lasers"); the other six are mapped to the
> best-matching ROM effect by envelope-shape analysis — each carries its source
> `rom.command`/`rom.dispatch` so a mis-assignment is a one-line swap. See the
> 8-7 session for the decision record.

## Attribution / license

The POKEY emulator core in `vendor/pokey.js` is **web-pokey** by **Mariusz
Kryński**, MIT-licensed — see `vendor/LICENSE`.
Source: https://github.com/mrk-its/web-pokey (commit `0c6327b`).
Vendored unmodified; loaded via a small Node VM shim in `bake-sfx.mjs`.

This tool is build-time only and is **not** part of the game's pure `core/`
simulation.
