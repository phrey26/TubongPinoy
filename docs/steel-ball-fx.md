# Steel Ball magnetic chain FX

Generated using built-in image generation. Active asset:
`public/assets/jolens-blast-skin-assets/steel-ball-chain-fx-atlas.png`.
The unused first-version atlas has been removed.

The 4 × 4 transparent atlas contains magnetic cages, forked launch bolts,
branching discharges, and horizontal lightning bridges—one four-frame row each.
Steel Ball uses its own renderer; Aldugo is unchanged.

Only an owned, equipped Steel Ball starts a charge chain. Shooter contact charges
the struck marble. Subsequent contacts charge other marbles, including those
outside the ring. Cages follow marble positions; bright lightning bolts directly connect each
charged source to the marble it collides with. No bolts descend from above. A bright connected lightning trail follows
the shooter for 0.65 seconds, with up to 40 samples.
Unconnected collisions never initiate a charge. Charges last for the shot and
clear on respawn/reset, equipment loss, or teardown. Physics, scoring, and audio
remain unchanged. Reduced motion uses static charge markers; pauses freeze
animations. Burst and bridge counts are capped.

## Generation prompt

Use case: stylized-concept. Original transparent RGBA sprite atlas for magnetic chain-lightning steel marble, pixel art game. EXACT 4x4 equal square cells, 16 effects, generous transparent margins, no text or grid. Distinct industrial electromagnetic visual identity: sharp zigzag electricity, broken hexagonal circuitry, silver rectangular iron filings, lime green with dark emerald edges and pale mint highlights. NO flames, NO comet tails, NO flower explosions, NO rainbow, NO circular shockwaves, NO swirling vortex. Row1 four animation frames of a hollow broken hexagonal magnetic cage, silver chips at six corners connected by jagged green electric segments, center hole transparent for visible marble. Row2 four frames launch recoil: twin angular forked lightning prongs with silver filings erupting upward, progressively fragmenting into small luminous dashes. Row3 four frames collision discharge: asymmetric branching lightning tree shooting left and right from a tiny mint contact flash, metallic square fragments, expands then fades; not radial starburst. Row4 four frames chain bridge: horizontal jagged green lightning connection spanning middle of cell left to right, two thin subsidiary branches and bright endpoint nodes, evolving shapes. Every effect in its own equal cell, no touching adjacent cells. Crisp readable hand-drawn pixel sprite artwork with sparse negative space, steel and green electricity only. Truly transparent background, do not draw a checkerboard.

Visibility tuning: trail sprites are 64–96 pixels thick, direct lightning links
are 76 pixels thick and persist for 0.56 seconds. Additive blending brightens
the green-white cores; receiving-marble discharges are 140 × 112 pixels.
