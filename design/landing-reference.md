# Landing page reference (owner-provided screenshot, 2026-10-11)

Source: screenshot shared by the owner in the build session. The image file itself is not stored in the repo; this note records what it sets. Ask the owner for the original file if pixel-level work is needed.

## What it shows

- **Brand:** "chaal" wordmark in a rounded geometric sans, lowercase, bright royal blue, with a small icon of two overlapping cards (blue spade card in front, yellow card behind).
- **Palette:** off-white page, pale blue panels, one saturated royal blue for primary actions and the accent word, near-black for headlines, yellow and red used only as small accents (hearts, diamonds, game pieces).
- **Header:** brand left; centre links "Discover games" (active, blue), "How to play", "Our brand"; right: "Join a table" (text) and "Create a table" (solid blue button with arrow).
- **Hero:** rounded large panel, text on the left, a 3D-style render on the right (fan of cards A, Q, Q, K, A in blue/white with red hearts, blue and yellow game pawns on a soft blue backdrop). Eyebrow line in small uppercase blue: "A LITTLE COMPETITION. A LOT OF CONNECTION." Headline in three lines: "Your table. / Your people. / Your next chaal." with the last line in blue. Sub-copy: "Old-school card nights. New-school way to play. Bring your friends. We'll bring the deck." Two buttons: "Create a table" (solid blue, plus icon) and "Join a table" (white, key icon). Footnote with shield icon: "Just cards, good company, and one more round."
- **Trust strip below:** "Made for playing with friends", "Your own private table", "A seat on any screen" (small line icons).
- **Tone:** warm, friendly, plain language. "Table" instead of "room".

## How it fits our spec

- **Matches:** midnight/royal blue card identity, restrained layout, no casino gold or felt, friendly copy. This is consistent with the Project UI Constitution.
- **Scope:** this is the marketing/landing and entry screen only. The in-game room is still the video-first screen defined in the specs: it is not a hero illustration page.
- **Vocabulary:** use "table" in user-facing copy for what the docs call a room ("Create a table", "Join a table"). Code and docs may keep `room`.
- **Access model conflict to resolve:** the app is allowlist-only. "Join a table" must lead to sign-in for approved people first; unapproved visitors see a plain "invite only" message. "Discover games", "How to play" and "Our brand" need an owner decision on whether they exist in V1 (public pages vs a signed-in-only app).
- **Hero image:** the 3D card render is an illustration asset we do not have. Needs an owner decision: commission or generate, or use our blue card component rendered large.
- **Typography and exact colours:** not extracted. Define tokens in Phase 0 from the original file.
