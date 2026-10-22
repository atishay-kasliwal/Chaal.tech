# Dhoni head/neck artwork

Mode: built-in image generation tool, edit of the approved MS Dhoni directions atlas. Production artwork was not overwritten.

## Saved asset and source registration

- `static/prototypes/dhoni-head/neck-v1.webp`: lossless WebP containing clean neck/shoulder underpainting in the center tile.
- `src/lib/mascots/presence/head-rig.ts`: jaw cutout, pivot, neck sampling coordinates, travel and safety limits.
- Existing `static/mascots/bot-ms-dhoni/signature/directions.webp`: original hair, head, beard, face and shirt pixels remain the visible source.

The generated headless neck painting fills only the small region underneath the separated jaw. The original shirt and shoulders remain a stationary plane above the neck underpainting. The original head/hair are clipped from the approved portrait using a measured jaw boundary; the eye/brow renderer sits within that moving head. There is no generated replacement head or character redesign. The pupil footprints remain 14×16.5 px.

This is a restrained 2D head tilt/translation around a neck pivot, not perspective yaw, an independently deforming neck mesh, or a compiled Live2D model. The neck has enough overlap for the configured small movement; head rotation is capped at 2.5 degrees. Larger turns require further artwork and authoring.

## Final prompt

```
Use case: precise-object-edit.
Asset type: clean neck/shoulder underpainting for a layered game mascot.
Input image 1 is the EDIT TARGET: approved transparent 1080x1080 3-by-3 MS Dhoni cartoon directions atlas. Preserve the exact nine-tile arrangement, scale, positions, transparent background, and illustration style. Leave the eight outer tiles entirely unchanged.
In ONLY the CENTER TILE (row 2 column 2, front facing), remove the entire head, hair, face, ears, jaw and beard, leaving ONLY the neck and yellow collared jersey/shoulders. Keep the center jersey, blue piping, shirt outline, shoulder width and baseline in exactly the original positions. Reconstruct and EXTEND the warm brown neck upward behind where the jaw used to be: a natural smooth neck column, broad enough to overlap the chin on both sides, beginning at about 47% of this tile's height and connecting smoothly to the existing neckline. This extended neck will sit underneath a separately moving head, so it needs clean shaded skin with no beard, no stray head pixels, no facial features and no dark jaw outline. Do not make a long skinny neck or add a new collar. Everything above the clean neck column in the center tile should be transparent. Keep the original warm medium-brown skin palette and soft dimensional cartoon shading. No new character, no hands, no text, no labels.
```
