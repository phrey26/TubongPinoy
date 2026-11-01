# Aldugo legendary sprite FX

Generated with the built-in image-generation tool; original transparent PNG copied
to `public/assets/tumbang-preso-skins-assets/aldugo-fx-atlas.png`.
Actual dimensions: 1254 × 1254, RGBA. The renderer calculates rounded cell boundaries
from the natural dimensions, so it does not assume the requested 1024-pixel size.

The 4 × 4 atlas contains:
- Row 1: four launch/bounce flare frames (0.36 seconds).
- Rows 2–3: eight hit-explosion frames (0.8 seconds).
- Row 4: four looping comet frames, oriented along the shot velocity.

The sprite is drawn behind the slipper during flight. A 240-pixel impact animation
plays at the can; the success overlay waits 0.88 seconds for Aldugo only.
No CSS effects, physics bonuses, additional charges, or score changes.
Reduced-motion mode uses a static frame; pauses freeze animation time.
Reset and teardown clear all transient effects. A missing atlas draws nothing.

## Generation prompt

Use case: stylized-concept. Asset type: production 2D game VFX sprite atlas, transparent PNG, square 1024x1024. Create legendary rainbow-prism impact animation for Aldugo slipper in a colorful Filipino pixel-art arcade game. Exact layout: 4 equal columns by 4 equal rows, sixteen 256x256 cells, no gutters, no labels, no grid lines. Each effect centered exactly in its own cell, full effect contained within cell with transparent margins. Row 1 is a four-frame launch flare sequence: tiny gold spark, coiled cyan/magenta/gold energy crescent, explosive colorful flare, wispy fading shards. Rows 2 and 3 together are ONE eight-frame impact explosion animation read left-to-right then next row: compressed white-gold star, sharp expanding starburst, brilliant multicolor crystalline explosion, massive ring with colorful flame petals, expanding rainbow shockwave, separated pink cyan violet gold shards, fading ember stars, sparse residual sparkles. Row 4 four frames looping magical comet head with short tapered flame tail pointing DOWN, for projectile traveling UP. A strong white-gold core surrounded by saturated cyan, hot pink, purple, emerald and gold, hand-drawn crisp chunky pixel-art shapes, powerful premium legendary collectible feel, clean transparent holes between rays, no smoke background, no scenery, no characters, no slipper, no lettering, no opaque rectangle. Real transparent alpha throughout backdrop. Do not draw checkerboard.

## Exclusive audio

Four original procedurally synthesized cues with 12 WAV takes in total in
`public/assets/tumbang-preso-skins-assets/audio/`:
- `aldugo-aim.wav`: 0.8 s three distinct struck-crystal notes with a short room tail.
- `aldugo-launch.wav`: 0.85 s sharp crystal chord and individual glass-like fragments.
- `aldugo-bounce.wav`: 0.55 s crisp glass contact with brief resonant decay.
- `aldugo-impact.wav`: 1.25 s heavy crystal strike and cascading shards with subtle reverb.

Regenerate with `python3 scripts/generate-aldugo-audio.py`.
Reference hashes: `docs/aldugo-audio-sha256.json`.
44.1 kHz mono 16-bit PCM, fixed seed, boundary fades, peak below -4 dBFS.
Fixed inharmonic resonances and millisecond contact ticks create struck-glass timbres;
there are no pitch sweeps or airy whooshes. Four damped room reflections add
16% wet reverb (20% for impact), with predelay to preserve the sharp attack.
Reverb is baked into each finite WAV and stops with the voice on mute/reset.
No external samples or music. Existing standard sounds are untouched.

Gameplay and the audio service both require server-returned ownership of
`skin_1` and that skin equipped for Tumbang Preso. Nonowners do not load these cues.
This is gameplay exclusivity, not access protection for public static audio files.
Changing accounts/equipment, muting, pausing, hiding the tab, and resetting an
attempt stop active cues. All cues use the Game effects mixer and existing limiter.
Bounce throttling and source limits still apply. The normal win jingle is quieter
and delayed until 0.5 s after an Aldugo hit to leave room for the impact.

Aldugo aim and hit each use one fixed take with no pitch variation.
Launch and bounce each have five generated takes (base and suffixes `-2` through
`-5`). Tuning offsets are -0.3, -0.15, 0, +0.15, and +0.3 semitones (at most
about 1.75%), with similarly subtle resonance and timing differences.
Playback selects launch/bounce takes without immediate repeats at their original
rate. All cues retain baked reverb and stable gain.
