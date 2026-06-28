# speech-bake — authentic Star Wars TMS5220 speech → WAV

Bakes Atari Star Wars (1983) **speech** to `.wav` by running the cabinet's
authentic LPC speech-ROM bitstreams through an independent **TMS5220**
synthesizer, headless in Node — no MAME, no browser. Feed it the LPC bytes and
it renders the speech you can host on R2 and play through the existing sample
path (`src/shell/audio.ts`).

Sibling of [pokey-bake](../pokey-bake): same bake-once-host-on-R2 shape, but a
different chip. The Star Wars sound board pairs quad POKEYs (SFX — see
pokey-bake) with a **TMS5220** Voice Synthesis Processor for speech ("Use the
Force, Luke", "Red Five standing by", …).

## Usage

```bash
node tools/speech-bake/bake-speech.mjs [outDir] [--only <name>] [--gain N] [--normalize]
```

- `outDir` — where to write `.wav` files (default `tools/speech-bake/out`, gitignored)
- `--only <name>` — bake a single phrase (e.g. `use_the_force_luke`)
- `--gain N` — output scale (default 2.0 ≈ unity for the 14-bit lattice output)
- `--normalize` — peak-normalize each line to 0.9

The runner prints per-phrase **frame diagnostics** — frame count, voiced /
unvoiced / silent mix, whether a clean stop frame was reached, and duration — so
a decode can be sanity-checked structurally without listening (a wrong bit order
or coefficient table shows up as no stop frame, single-voicing, or an implausible
length). Output is 8 kHz 16-bit mono WAV (the TMS5220's native rate).

## How it works

`speech-data.mjs` holds the raw LPC FIFO byte streams the cabinet's 6809 sound
board clocks into the TMS5220 after a `$60` SPEAK-EXTERNAL command — transcribed
verbatim from the sound disassembly (`Speech1.asm … Speech23.asm`, labels
`spDat001 … spDat023`; phrase↔data mapping from `SpchTab` in `SW_Sound.asm`). It
is **generated** from the gitignored reference by a one-shot script (kept out of
the repo); do not hand-edit it.

`tms5220.mjs` is an **independent implementation** of the documented TMS5220 LPC
algorithm — the 10-stage lattice from TI patent 4,209,804 (Markel & Gray), the
frame/bitstream format from the TMS5220 datasheet, and the chip's published
coefficient ROM. It is **not** a port of any GPL emulator; only the numeric
coefficient tables are reproduced (chip data, identical across the TI patents,
the datasheet, and independent decaps — the chirp table's `sum = 0x3DA` matches
the documented TMS5220NL/CNL decap). The frame parser reads bits **LSB-first**
within each FIFO byte, as the chip does.

### Frame format

The LPC bitstream is a sequence of variable-length frames:

```
energy(4)            energy index; 0 = silent frame, 15 = stop frame
repeat(1)            reuse previous K coefficients
pitch(6)             pitch index; 0 = unvoiced (noise excitation)
K1..K4 (5,5,4,4)     always present (unless repeat)
K5..K10 (4,4,4,3,3,3) present only when voiced (pitch != 0)
```

Voiced frames excite the lattice with the chip's "chirp" glottal pulse at the
interpolated pitch period; unvoiced frames use pseudo-random noise. Parameters
interpolate toward each new frame over 8 sub-periods. See `tms5220.mjs`.

## Provenance / license

The speech **data** is authentic cabinet ROM (the `spDat*` LPC bitstreams from
the sound disassembly). The **synthesizer** is an original implementation from
the TI patent / datasheet, MIT-compatible with the rest of this repo (no GPL
emulator code). This tool is build-time only and is **not** part of the game's
pure `core/` simulation.
