# Minimal avatar artwork

Sunny, Lila, Miko, and Maya were restyled with the built-in imagegen tool using
their original portraits as edit targets. The selected Sunny edit supplied the
shared style reference for the other three. Final assets replace the existing
352 × 352 opaque WebP files in `public/assets/avatars/`, preserving avatar IDs.

The final prompt set used this shared direction:

> Simplify the same character into a minimal flat cartoon profile icon. Preserve
> the character's hairstyle, skin tone, accessories, shirt color, pastel
> background, and centered head-and-shoulders framing. Use dark oval dot eyes,
> a tiny curved nose, a simple closed curved-line smile, chunky hair silhouettes,
> broad color shapes, and thick rounded dark outlines. Remove fine hair strands,
> detailed eyes, glossy rendering, fabric folds, textures, and detailed shading.
> Allow only a small neck shadow. No text, frame, or extra objects. Keep the
> whole hairstyle visible and make the face readable at small sizes.

Character-specific prompt constraints:

| File | Details to preserve |
| --- | --- |
| sunny.webp | Smiling tan boy, short tousled dark hair, yellow crew-neck shirt, pale yellow background; hair as a few large tufts |
| lila.webp | Tan girl, high dark ponytail falling to the viewer's left, pink hair tie, side fringe, purple shirt, lavender background |
| miko.webp | Tan boy, dark curly hair as simple scallops, round teal glasses over dot eyes, turquoise shirt, mint background |
| maya.webp | Tan girl, chin-length dark bob and side fringe, yellow flower clip on the viewer's left, coral shirt, peach background |

Sunny was simplified further after the initial edit to establish the dot-eye,
closed-smile style. The other edits used their own originals as identity targets
and the accepted Sunny result solely as a style reference. All four selected
outputs were resized to 352 × 352 and encoded as WebP at 90% quality.
