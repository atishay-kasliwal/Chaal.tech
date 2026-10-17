# Personal table mascots

Five signature characters: Atishay, Adityaraj, Mradul, Divyansh and Adarsh. Each has seven transparent 3×3 WebP atlases: directions, reactions, game, food, snacks, moods and fun. Each cell is 360×360. Seats default to a 100px cell, half over the right video border with its bottom 32% of the size below the tile. Head width is normalized to 45.3% of a cell and shoulder baseline to 73.9%, matching the approved Adityaraj reference.

## Link accounts

An owner selects a mascot for each person in **Admin → Members → Mascot**. “None” removes the link. The server validates known IDs and keeps this out of member-editable profile fields. Alternatively, `npm run club -- add <existing-email> --mascot <id>` links an account from the CLI. No nicknames are guessed or automatically mapped to a face.

A profile/roster refresh loads the saved link. The table loads the manifest on mount, looks toward the active player before falling back to the pot, and plays short expressions for gameplay events. Poking is a local visual reaction, including the food and fun faces; it is not a message broadcast to other players. Core gameplay sheets preload; other categories load when used. A missing expression falls back to an existing face or the directional sprite. Missing mascot art leaves the usual seat avatar intact.

## Resize without redeploying artwork

Under **Admin → Look → Mascot size**, an owner can preview every friend at a size from 60 to 160px in 5px steps, reset to 100px, and save the look. The size is persisted with the club settings in MongoDB and only owners may change it. Open tables refresh the saved settings every 15 seconds while visible and immediately when returning to the tab. Offsets and protection at the right screen edge scale with the chosen size. Failed refreshes keep the last confirmed setting. Older clients that save defaults without a size preserve the saved value.

This control requires the code update to be deployed once. Subsequent size changes require neither another deployment nor regenerating the images.

## Art and build

Production assets and their manifest are tracked under `static/mascots/`; normal builds and Cloudflare deployments include them. The 25 new expression sheets were produced using the built-in image generation tool against the approved directional sheets. Full prompts are in `scripts/mascots/generated-sources.json`. Source PNGs are archived locally under `design/mascots/generated/<id>/<sheet>.png`; they are not needed to build the app.

With those source PNGs present, install image-build dependencies from `scripts/mascots/requirements.txt`, then run:

```sh
python3 scripts/mascots/install_generated.py
```

The installer preserves transparency, packs strict cell boundaries, normalizes head size and shoulder baseline, discards debris below that baseline, exports optimized WebP and rewrites the manifest. Approved directions and original reactions remain unchanged. `install_sheets.py` supports the earlier raw WebP build format.

Preview all characters, head tracking, expressions and a simulated hand at `/test-mascots`. Game expressions are ordered exactly as `src/lib/mascots/catalog.ts`; each atlas must keep nine cells in that order. Only signature outfits are included in this release; additional outfits require their own aligned directional sheets.


## Bot artwork and seat support

Five approved transparent direction atlases ship under `bot-rohit-sharma`, `bot-virat-kohli`,
`bot-ms-dhoni`, `bot-gg`, and `bot-samay-raina`. `/test-mascots` separates member and bot art,
and offers only expressions present in the manifest. The runtime-independent art catalogue
lives in `shared/bot-characters.mjs`; the frontend compatibility export has no policy logic.

Table seats can display the animated bot mascot as their primary portrait when the server
provides its asset ID, using 2.1 times the owner-selected cell size. Existing anonymous bots
keep their fallback avatar until the permanent character integration supplies those IDs.
Human corner peeks keep their original layout. Both honor the saved size and reduced motion.

The 30 unfinished bot expression sheets and their original prompts remain listed in
`scripts/mascots/bot-generation-plan.json`. Image generation hit its usage limit; no missing
expression has been represented as generated art. Member expression art is complete.
