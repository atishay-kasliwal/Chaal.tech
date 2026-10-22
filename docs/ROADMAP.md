# Chaal: what's left and ideas

The one current planning page, started 2026-10-22. Everything older (phase reports, rule locks, specs,
plans) is in [archive/](archive/) and kept as history; it is not rewritten. When the archive disagrees
with this page, this page wins.

## Where things stand

Live on chaal.tech (main `325b2a76`, deployed 2026-10-22):

- Teen Patti (26 variants), Hold'em, Blackjack, Rummy, **3 2 5**, **10 Pakad** and **29**, all
  playable with friends or with bots (practice from the create screen).
- The trick games use the Teen Patti table look: felt and rail, mascot seat tiles, a bottom dock with
  your hand and the score board.
- Five canonical bot characters (Rohit, Virat, GG, Samay, Dhoni) published to the bot directory, with
  long-term memory of returning players in Teen Patti.
- Analytics recording, `/stats`, the admin page ("the host's ledger"), the landing page with trick
  tiles and card-style hand rankings.

Rules that are locked (canonical, in the archive): 3 2 5 in `archive/games/325_RULE_LOCK.md`, 10 Pakad
in `archive/games/10PAKAD_PLAN.md`, 29 in `archive/games/29_RULES.md`.

## Left over

### Decisions for the owner

- [ ] **CI minutes.** The GitHub Actions allowance (2,000 min a month, private repo) ran out on
      2026-10-22. Each PR costs about 16 minutes because CI runs on the PR and again on the push to
      main, and the deploy job always skips. Options:
  1. self-hosted runner on the Mac (free, unlimited; runs only while the Mac is awake);
  2. drop the `push: main` trigger, cancel superseded runs, skip docs-only changes (about half the
     minutes);
  3. a spending limit (about $0.06 per run).

  Until then, lint, type check and both test suites are run locally before every merge.

### Owner actions

- [ ] **Owner role check.** The Admin link shows only for the `owner` role. Turn the VPN off so Atlas
      is reachable, then confirm the role on the owner's member record.
- [ ] **Analytics validation night.** Recording is live and passes all 13 checks on practice data,
      but every recorded hand so far is one person with bots. One real night is needed: 4+ people, 20+
      hands, with a Show, a pot-limit forced show, a timeout, a disconnect and reconnect, a late reveal,
      a chip loan, a hidden balance, two variants (one with a joker or table cards), and one Hold'em,
      Rummy or 3 2 5 table. Then run `npm run analytics:health` and
      `npm run analytics:validate -- --since <night start>`, and do the two manual steps in
      `archive/ANALYTICS_OPERATIONS.md` (inspect one hand's public, private and sealed records; compare
      Durable Object rows written with the volume table).
- [ ] **Mascot art source.** The Blender pipeline works (branch `blender-pilot`) but its stand-in bust
      is not usable art. It needs one base model: image to 3D from the approved 2D art, a commissioned
      modeller, or a licensed base head restyled per character. Nothing else waits on it.

### Housekeeping

- [ ] Remove the leftover worktrees `.claude/worktrees/deploy-p5` and `.claude/worktrees/ten-pakad`.
- [ ] `mascot-rollout` is a local-only branch with one unpushed commit: push it or drop it.

## Ideas (not started; each needs a go-ahead)

### Table-card games

Agreed rules; the UI must be agreed before building. UI direction: a woven mat in the middle of the
felt for table cards, pot chips to its left, a joker tray on the right. Players build their hand
themselves: no auto-best, no hints.

- **Chatai 3x3.** 9 cards face down in a grid. On your turn, after paying, you open one (blind players
  too). Every open card is a joker; at a Show only open cards count. When all 9 are open, each player
  picks a line (row, column or diagonal) and confirms it; its 3 cards become that player's only jokers.
- **Rotating Joker.** 3 jokers start face up. When someone packs, their 3 cards become the new
  jokers. At a Show or the pot limit, the latest 3 count.
- **Running** (house rule). 3 face-down table cards open when the pot reaches ₹200, ₹400 and ₹600.
  Card 1: the ranks above and below it become jokers. Card 2: its own rank and the ranks either side
  become jokers. Jokers stay; ranks wrap (an A gives K and 2). Card 3's suit kills: a seen player
  holding that suit is packed automatically; a blind player can still Show but cannot win holding it.
  Ties: suit order ♠ > ♥ > ♣ > ♦ on the highest card.
  **Open question:** if both players at a Show are blind and both hold the killing suit, "the person
  who opens it last wins": which player does that mean?

### Friend mascots

A personal cartoon for each club friend (Atishay, Adityaraj, Divyansh, Mradul, Adarsh), in the
koboyo page-mascot style: chibi sticker busts drawn as aligned 3x3 sheets (9 head directions, 9
expressions per sheet), peeking over the top edge of the seat tile and watching the active seat or
pot.

Uses agreed: seat poses (idle, thinking, fold), win and lose reactions, big-moment reactions (trail,
pure sequence, huge pot, bad beat), blind and bluff poses, tap-to-emote, a clubhouse round table
(online awake, offline asleep), end-of-night replay, leaderboard crown and dunce cap, personal titles,
a shareable WhatsApp result card, loading and invite mascots, and **quick lines**: preset lines and
personal catchphrases as speech bubbles, with suggestions in context (low on chips suggests asking
for a loan, tied to the chip-ask flow).

Needs: one photo per friend, and the first friend's art approved before the rest.

### Bots

Known limits from the cross-game evaluation (`archive/bots/CROSS_GAME_EVAL.md`):

- Rohit and Dhoni feel faint in 3 2 5 (too close to the others).
- Bots adapt little to a player within one session in the trick games.
- 29 card play stays close to the shared brain; characters differ mostly in bidding.
- Long-term memory covers Teen Patti only; the trick games need their own observation extractor.
- Samay's passivity is by design; making him take the initiative would need memory across nights,
  not tuning.

Intentional weaknesses that stay (they are the characters): Rohit's blind pride, GG reading by style,
Samay calling too much, Virat's tilt after a painful loss.

## How we work

- Deploys are manual from the owner's Mac, from `origin/main` only: Worker (`npm run deploy:backend`)
  first when the server changed, then Pages. Setup and secrets: `archive/cloudflare-deployment.md`.
- No em dashes in anything players see.
- Each new phase starts only after the owner says go.
