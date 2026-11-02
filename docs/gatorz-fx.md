# Gatorz epic effects

`gatorz-effects.ts` renders bright amber/gold pixel flecks with contrasting amber edges and pale centers directly on the game canvas. Flight trails last 0.38 seconds; launch/bounce/can-hit flecks last 0.46 seconds. Particles are capped at 64 and suppressed for reduced motion. Pause freezes their animation; reset and teardown clear them. No extra audio, CSS, or Tailwind effects are added.

The game checks both ownership and equipment of Gatorz's persistent ID `skin_2` before creating or drawing its effects. Removing Gatorz from the shop does not remove effects for existing owners. Future catalog releases must use new skin IDs rather than reuse `skin_2` (ownership is also stored against that ID). Effects are independent of catalog position, rarity, display name, and shop availability.

The trail emits paired flecks at up to 45 samples per second. Flecks start at 8 pixels with a contrasting border; launch/bounce bursts use 10 flecks and can hits use 16, spreading farther for clearer epic feedback.
