# Dhoni eye and eyebrow assets

Selected artwork was created with the built-in image generation tool, using the approved MS Dhoni atlas as the edit/reference source. Production assets were not overwritten. Sources were encoded as lossless WebP without painting or drawing replacement facial features in code.

## Saved assets

- `static/prototypes/dhoni-eyes/clean-v1.webp`: clean socket/forehead plate; only registered feature regions render.
- `static/prototypes/dhoni-eyes/irises-v1.webp`: two genuinely transparent iris/pupil textures.
- `static/prototypes/dhoni-eyes/brows-v1.webp`: two genuinely transparent eyebrow textures.
- Existing `static/prototypes/dhoni-blink/closed-v1.webp`: painted closed-lid shading reused under continuous aperture masks.

Registration, neutral centers, pupil size, travel and brow limits are in `src/lib/mascots/presence/eye-rig.ts`. The final pupil/iris footprints are 14×16.5 px on the 360px portrait canvas, reduced during review while preserving their centers. Source pairs remain full-resolution for later repacking. Runtime brightness/saturation tuning matches the darker approved eye/brow inks.

These are a browser facial-parts proof, not a compiled Live2D model or a finished layered PSD. Eye whites are supplied by the registered clean plate. The eyelid proof reveals painted lid shading using continuous eye-aperture masks; separate deformable upper/lower lid meshes, head/body separation and mouth shapes remain for the full authoring pass. Keep every layer aligned to the approved center portrait and retain the approved appearance.

## Final prompt set

### Clean plate

```
Use case: precise-object-edit.
Asset type: clean underlying face plate for independently animated eyes and eyebrows in an existing game mascot.
Image 1 is the EDIT TARGET: the approved transparent 3-by-3 MS Dhoni cartoon directions atlas. Preserve exact atlas arrangement and exact head position, proportions, face likeness, hairstyle, hairline, nose, mouth, stubble, ears, jersey, shoulder baseline, inks, colors, skin shading and transparency. Do not redesign or change facial style.
Edit ONLY the front-facing portrait in the CENTER TILE (row 2 column 2). Remove both eyebrows completely, reconstructing the natural smooth warm skin shading underneath with NO remaining dark eyebrow marks. Inside each existing eye opening, remove the brown iris, black pupil and glints completely, replacing them with the matching shaded off-white sclera. Preserve each eye's original almond contour, eyelash/eyelid ink, socket shading and size exactly. Both eyes must be empty white eye sockets with no pupils or irises; forehead must have no eyebrows. This is an animation layer, not a finished character portrait. Leave the upper/lower eye outlines and all other face features intact. All other eight atlas tiles stay unchanged. Transparent background; no text, labels or extra parts.
```

### Clean-plate forehead edit

```
Use case: precise-object-edit.
Input image 1 is the EDIT TARGET, a transparent 3-by-3 cartoon MS Dhoni atlas with empty white eyes in the center tile. Keep the whole image unchanged except the forehead immediately above the two empty white eyes of the CENTER TILE ONLY.
REMOVE COMPLETELY the two thin black curved EYEBROW lines that remain above those white eyes. Remove all eyebrow hair, all dark eyebrow arcs and all eyebrow outlines. Fill those two eyebrow locations with continuous smooth warm brown forehead skin matching the neighboring forehead shading. The forehead above both eyes must be completely bare skin, with NO dark arcs or eyebrow strokes. Leave the eyelid outlines touching the white eye openings intact; those are separate from the eyebrow strokes ABOVE the eyes. Preserve the empty white eye sockets, original head, hair, nose, mouth, stubble, yellow jersey, face shape, positions, scale, transparent background, all nine tiles and exact illustration style. No new features, no text. This is a clean animation plate which intentionally has no eyebrows and no irises or pupils in the center portrait.
```

### Iris/pupil pair

```
Use case: precise-object-edit.
Asset type: isolated IRIS AND PUPIL texture pair for a layered game character rig.
Input image 1 is the reference/edit source: the approved MS Dhoni mascot atlas. Extract/recreate ONLY the two brown iris-and-black-pupil details from the front-facing CENTER portrait. Keep the same warm dark-brown iris, black center pupil, thick dark iris perimeter and tiny white reflection in the same dimensional inked cartoon style.
Output a square genuinely transparent texture containing exactly TWO isolated circular iris/pupil discs, side by side, same diameter and same lighting, centered at x=30% and x=70%, y=50%. Each disc diameter should be 24% of canvas width. Both discs show straight-ahead neutral gaze and matching small white highlights. Round complete iris discs, not cropped eye outlines. Outside the two discs everything must be fully transparent, including the gap. No eye whites, no eyelids, no eyelashes, no eyebrows, no skin or face, no head, no shirt, no background, no words or labels. These are separate parts to be moved INSIDE existing eye sockets; they must not include a complete eye or any surrounding facial pixels.
```

### Eyebrow pair

```
Use case: precise-object-edit.
Asset type: isolated eyebrow texture pair for an existing illustrated game mascot.
Input image 1 is the edit/extraction source: approved MS Dhoni cartoon atlas. Preserve the exact distinctive THICK dark eyebrows of the front-facing CENTER portrait, their neutral inward slope, slight arch, inked hair texture, dark charcoal brown color, dimensional cartoon finish and approximate relative shapes. Output ONLY the TWO EYEBROWS as separate painted parts on a genuinely transparent square canvas. Put the viewer-left brow centered at x=28%, y=50%, and the viewer-right brow at x=72%, y=50%. Each brow approximately 30% of canvas width and 8% of canvas height. Include fine antialiased hair edges; no attached skin or eye socket shadow. The shapes should match the eyebrows in the approved center face, not angry, exaggerated, surprised or generic thin arches. Everything except the two eyebrow shapes must be transparent. No eyes, eyeballs, irises, eyelids, skin, forehead, nose, face, hair, text, labels, borders or background. This is one texture pair for independently movable eyebrows.
```
