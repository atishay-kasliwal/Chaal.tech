# Dhoni: requirements for a full perspective facial rig

The working prototype already has independent pupils, continuous blinking, eyebrow motion, bounded depth-mesh head turns, isolated head tilt, body breathing, painted closed-mouth expressions and public-event choreography. This document describes additional authoring needed beyond the current ±8-degree front-surface turn, for full side profiles and mesh-deformed facial expressions. It is not a claim that a compiled model exists.

## Preserve the approved character

Keep the existing dimensional chibi drawing, warm skin tone, short salt-and-pepper hair/stubble, yellow collared shirt and blue piping. Do not redraw the character into a different style. Keep the current pupil/iris footprint of **14×16.5** in the 360px registration space and preserve the slow gaze/blink timing reviewed by the user.

Author in a layered source document with consistent registration. A higher-resolution canvas can be used, but provide a mapping back to the current 360×360 square. Do not flatten the face features into the head or bake expressions into body/head layers. Extend hidden painted regions beneath adjacent layers so moving parts reveal finished art rather than transparency.

## Required layers and missing artwork

| Part                      | Available now                                                             | Additional authoring for a full rig                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body/chest                | Original jersey/shoulders isolated by a jaw mask; bounded breathing scale | Clean continuous torso and separated shoulder/chest regions for deformation rather than scaling.                                                                                |
| Neck                      | Generated headless neck overlap beneath the front jaw                     | Neck/jaw shading that supports side turns and larger overlap on both sides.                                                                                                     |
| Head/skin                 | Approved front head; eye areas have clean patches                         | Full clean head plate, including skin under brows, pupils, lids, mouth and moustache, with side-surface coverage.                                                               |
| Jaw/chin/ears             | Part of the original head cutout                                          | Independently deformable jaw/chin and both ears, with unseen edges extended.                                                                                                    |
| Hair back/front           | Hair is part of the original head                                         | Separated back hair and front hair with complete roots/hidden overlap. Preserve the same hairline and volume.                                                                   |
| Left/right sclera         | Reconstructed front eye sockets                                           | Separate whites registered to the face and shaped to angled eye sockets.                                                                                                        |
| Left/right pupils/irises  | Real transparent paintings, independently positioned                      | Keep current size and centers; supply consistent depth/occlusion under angled lids.                                                                                             |
| Left/right upper lids     | Closed-lid painting revealed by a continuous mask                         | Separate upper lid and crease with clean skin above, suitable for mesh deformation.                                                                                             |
| Left/right lower lids     | Lower shading within the painted blink patch                              | Separate lower lid with skin below, avoiding duplicate outlines during closure.                                                                                                 |
| Left/right brows          | Real transparent paintings                                                | Clean forehead underneath over the complete movement range; separate brow meshes for small asymmetric reactions.                                                                |
| Mouth/lips                | Two registered closed-mouth pose patches over the original mouth          | Clean lower-face plate, separate upper/lower lips and mouth corners, with matching moustache/stubble coverage.                                                                  |
| Cheeks/nasolabial shading | Baked into the original face                                              | Subtle matching cheek shapes/deformation for smiling, without inflating or changing the likeness.                                                                               |
| Angled head references    | Existing nine flattened direction sprites                                 | Author consistent front and small left/right perspective states for the separated layers. Flat direction sprites are reference material, not a substitute for a continuous rig. |

## Registration to retain

All coordinates are in the current 360px square:

- Head/neck pivot: `(180,209)`.
- Body lower-edge pivot: `(180,248)`; shoulder near y=195.
- Left eye aperture: `(139,121.5,33,25.5)`; pupil rectangle `(149.5,122.75,14,16.5)`.
- Right eye aperture: `(189,121.5,33,25.5)`; pupil rectangle `(199,122.75,14,16.5)`.
- Left brow rectangle: `(136,110,43,11.5)`; right: `(184,110,43,11.5)`.
- Mouth patch: `(146,161,70,34)`. Neutral must match the approved original closed mouth.

Preserve the original silhouette and jersey baseline during calibration. Wider movement requires newly painted overlap and a new registration review; do not simply increase the current transform limits.

## Animation contract

The behavior layer outputs only cosmetic channels: eyes `(x,y)`, head `(x,y)`, roll, brow, mouth, breath and blink. Public-event parsing and personality decisions stay outside the model. The authored renderer should consume those channels and provide the same pause/reduced-motion/neutral behavior. A new table UI integration should not inspect private cards, inferred strength, future actions, policy or memory to choose expressions.

Keep eyes before head, a restrained facial response after attention, long quiet holds, interruptible transitions and a smooth neutral return. Reuse independent per-instance cosmetic timing. Do not synchronize characters with a global idle animation phase.

Deliver a working neutral pose, small left/right turns, up/down attention, blink closure/reopening, asymmetric brows, closed-lip smile/composed states and subtle breathing. Validate the actual rendered eyelid/pupil/mouth motion and neck overlap at mobile seat size before increasing the range or converting another bot.
