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
