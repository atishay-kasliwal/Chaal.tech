# Dhoni mouth artwork

Created with the built-in image generation tool in edit mode. The approved directions atlas was the edit target; production art was not overwritten. Only small painted mouth regions are used by the prototype. Generated eyes, head outlines, clothing and outer directions are never substituted for approved art.

## Saved files

- `static/prototypes/dhoni-mouth/smile-v1.webp`: full generated source for a restrained closed-lip smile.
- `static/prototypes/dhoni-mouth/composed-v1.webp`: full generated source for a calm, nearly straight closed mouth.
- `static/prototypes/dhoni-parts/mouth-smile-v1.webp` and `mouth-composed-v1.webp`: compact runtime patches, 210×102 each.
- `src/lib/mascots/presence/mouth-rig.ts`: registration and bounded blend mapping.
- `src/lib/mascots/presence/Mouth.svelte`: loading protection, painted-pose blending and independent failure fallback.
- `scripts/presence/pack-art.mjs`: deterministic crop/resampling recipe. It performs texture packaging only, with no generated illustration or model invocation.

The mouth occupies `[146, 161, 70, 34]` on the approved 360px canvas. Source sampling is `[145, 161, 70, 34]` in normalized center-cell coordinates. Feathered edges retain the original surrounding skin/stubble. At neutral both overlays are transparent, restoring the exact original mouth. Positive values blend the smile; negative values blend the composed pose. Opposing poses are never layered together. The feature moves with the isolated head.

The director starts the expression 90–180ms after head attention begins and eases it over 650–900ms. Public wins can produce a small smile; public losses produce calm acceptance. A raise/turn can briefly compose the lips. Idle expressions stay near neutral. There is no speech, open-mouth animation, hidden-card expression or claim of a deformable mouth mesh.

Missing/delayed mouth art preserves the original mouth while the other working facial/body channels continue.

## Exact final prompts

### Smile

```text
Use case: precise-object-edit.
Asset type: additional painted mouth expression for the existing Chaal Dhoni game mascot, not a redesign.
Input image 1 is the EDIT TARGET: the approved transparent 1080x1080 three-by-three mascot directions atlas. Preserve the nine-tile arrangement, registration, proportions, warm skin palette, salt-and-pepper stubble, yellow jersey, lighting and dimensional chibi illustration style. Leave the eight outer tiles entirely unchanged.
Edit ONLY the MOUTH and directly adjacent moustache/lower-lip skin in the CENTER TILE (row 2 column 2). Keep the nose, eyes, brows, jaw silhouette, chin, head, hair, ears, shoulders and clothing exactly where they are. The mouth stays small and closed. Preserve the same moustache and stubble character. This artwork will be sampled as a small patch over the existing original face, so precise alignment and matching skin tones are critical.
Change only the center mouth to a restrained, warm, closed-lip smile after a public win. Lift the corners slightly and give the lip line a gentle, natural curve. No teeth, no open mouth, no grin, no cheek inflation, no head or eye change. Keep the lip midpoint, moustache width and lower-lip shading aligned with the original. Maintain genuinely transparent background. No text, borders, labels, logos or props.
```

### Composed

```text
Use case: precise-object-edit.
Asset type: additional painted mouth expression for the existing Chaal Dhoni game mascot, not a redesign.
Input image 1 is the EDIT TARGET: the approved transparent 1080x1080 three-by-three mascot directions atlas. Preserve the nine-tile arrangement, registration, proportions, warm skin palette, salt-and-pepper stubble, yellow jersey, lighting and dimensional chibi illustration style. Leave the eight outer tiles entirely unchanged.
Edit ONLY the MOUTH and directly adjacent moustache/lower-lip skin in the CENTER TILE (row 2 column 2). Keep the nose, eyes, brows, jaw silhouette, chin, head, hair, ears, shoulders and clothing exactly where they are. The mouth stays small and closed. Preserve the same moustache and stubble character. This artwork will be sampled as a small patch over the existing original face, so precise alignment and matching skin tones are critical.
Change only the center mouth to a calm, composed closed-lip expression: a relaxed, nearly straight lip line with corners gently released from the original small smile. It should communicate quiet acceptance or attention, not sadness, anger, pouting or clenched lips. No teeth, no open mouth, no smirk, no cheek change, no head or eye change. Keep the lip midpoint, moustache width and lower-lip shading aligned with the original. Maintain genuinely transparent background. No text, borders, labels, logos or props.
```
