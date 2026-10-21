# Blender pipeline for bot art (pilot)

`scripts/blender/directions_atlas.py` renders a bot's 3×3 **directions** atlas (the format in
`static/mascots/bot-*/signature/directions.webp`) from a 3D bust, headless:

```
blender -b -P scripts/blender/directions_atlas.py -- --character ms-dhoni --out design/blender/out \
  --reference design/mascots/bots/ms-dhoni/directions-v1.png
```

It writes `<character>-directions.png` / `.webp` (the atlas) and, with `--reference`,
`<character>-compare.png` (the current 2D atlas beside the render).

## What the pilot proves

- **Layout contract**: nine equal cells, viewer coordinates (row 1 up-left, up, up-right; row 2 left,
  centre, right; row 3 down-left, down, down-right), transparent, the same scale and shoulder
  baseline in every cell (head width 45.3% of a cell, shoulders 73.9% down), as the approved mascot
  README asks. The head turns on a `HeadPivot`; the shoulders do not move.
- **Look**: two-tone cel shading per material and Freestyle ink outlines, close to the sticker finish.
- **Cost**: nine 384px cells render in seconds in EEVEE. A new expression or a new sheet (moods,
  reactions) is a pose change and a re-run, with the identity guaranteed identical across cells.

## What it does not do

The built-in bust is a procedural stand-in made of primitives so the pipeline can run end to end. It
is not a likeness and is far below the illustrated art (see the comparison image). The quality of
the result is the quality of the base model.

## Getting a real base model

Any of these, exported as glTF/GLB, facing -Y, neck at the origin, with the head parts parented to an
empty named `HeadPivot` (then `--model path/to/bust.glb`):

1. **Image to 3D** from the approved 2D art (the centre cell of the directions atlas): fastest; the
   mesh needs a cleanup pass and a head/body split.
2. **An artist** sculpts and rigs the five busts once: best quality and consistency.
3. **A licensed base head** restyled to each character.

With a rigged face (shape keys for brows, eyes, mouth), the same script can render the moods and
reactions sheets the friends' mascots already have.
