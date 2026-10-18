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


## Character bots (Phase 3)

Five approved bot direction atlases ship under `bot-rohit-sharma`, `bot-virat-kohli`,
`bot-ms-dhoni`, `bot-gg`, and `bot-samay-raina`. `/test-mascots` has separate member/bot groups
and only offers expressions that actually exist. All five member atlases remain complete.

Bot seats use the animated mascot as their main portrait, at 2.1 times the owner-selected
cell size; human seats use the original corner peek. This avoids showing the same face twice
on a bot seat. Both follow the saved size without a redeploy, and respect reduced motion.
Bot reaction categories gracefully fall back to the directional face until dedicated bot
expression art exists. The 30 unfinished sheets are listed, with prompts, in
`scripts/mascots/bot-generation-plan.json`; the image service rejected those requests at its
usage limit. These are pending jobs, not generated assets.

See `docs/BOT_CHARACTERS_PHASE3.md` for permanent bot identities, publishing and migration.
