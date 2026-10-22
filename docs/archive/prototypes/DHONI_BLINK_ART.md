# Dhoni blink artwork

Generated using the built-in image generation tool (edit mode). The approved production atlas was the edit target; no production file was overwritten. Full generated originals remain in the default generated_images folder. Only the eye regions of the new paintings are rendered over the unchanged original center portrait. Asset encoding used lossless WebP; CSS registration accounts for generated atlas layout differences.

Saved project assets:

- `static/prototypes/dhoni-blink/closed-v1.webp`
- `static/prototypes/dhoni-blink/half-v1.webp`

These are prototype sources, pending an artist's seam/registration review and a compact eyelid-only atlas before production use. Eyelid motion is frame animation; it is not a deformable facial rig or independent pupil/brow motion.

## Closed-eye prompt

```
Use case: precise-object-edit.
Asset type: matching eyelid animation frame for an existing game mascot atlas.
Input image 1 is the EDIT TARGET: a transparent 1080x1080 3-by-3 atlas of the approved MS Dhoni cartoon mascot. Preserve this exact atlas layout, dimensions, transparency, drawing style, lighting, colors, all nine face positions, hair, eyebrows, noses, mouths, beards, ears, necks, jerseys, shoulders and scale. Do not redesign or redraw the character.
Change ONLY the two eyes inside the CENTER tile (row 2 column 2, front-facing portrait). Close both eyes naturally for a blink: upper eyelids fully lowered, gently curved relaxed closed lash lines following the existing eye positions and face perspective, matching the existing skin shading. Eyebrows stay in exactly the same place, mouth keeps the same small smile, head and body stay perfectly still. Both eyes must be completely shut, with no visible white or pupils. All other eight tiles remain unchanged. Keep exact registration to the original so this edited center frame can be swapped with the original center frame without movement. Transparent background. No captions, borders, labels, extra objects or text.
```

## Half-closed-eye prompt

```
Use case: precise-object-edit.
Asset type: matching HALF-CLOSED eyelid animation frame for an existing cartoon mascot atlas.
Image 1 is the original edit target and registration reference, a transparent 3-by-3 atlas of the approved MS Dhoni mascot. Image 2 is a supporting eyelid-style reference showing the desired fully closed eyes in its center tile. Preserve image 1's exact nine tile layout, face positions, scale, outlines, head angle, hair, eyebrows, nose, mouth, facial hair, jersey, shoulder line, colors and shading. Do not redesign any part of the face.
Change ONLY the two eyes in the CENTER TILE (row 2 column 2, straight-on Dhoni). For a blink in progress, lower BOTH upper eyelids halfway over the pupils. Eyes genuinely HALF CLOSED: the top halves of each pupil and sclera are hidden by the skin-colored upper lids; a narrow lower portion of each dark iris and eye white remains visible. Lower eyelids remain at their original position. Brows stay fixed. Mouth and expression remain unchanged. No wink. Do not merely change gaze downward; the eyelids must visibly cover the upper half of both eyes.
All other 8 tiles must remain unchanged. Transparent background, same dimensional cartoon ink and skin shading, no text/labels/borders. Keep exact registration for frame animation.
```
