# The Chaal League

## Brief

Redesign /bots from scratch as one scrolling, members-only page. Let club members follow five characters, compare real competition results, see historical champions, and understand bot development. Keep existing individual profile routes compatible, but make the new page self-contained. The accepted daily schedule is 07:00 America/New_York, including DST.

## Concept selection

- League broadcast: five mascot competitors, championship table, scoreboard, trophy history. Originality 4, fit 5, feasibility 5, portability 2.
- Workshop dossiers: experiment notes and version ancestry. Originality 4, fit 4, feasibility 5, portability 3.
- Morning paper: daily headline and result archive. Originality 4, fit 4, feasibility 5, portability 3.
  Choose the league, borrowing the paper's match-report voice for the journal.

Idea: Five personalities, one table, a new championship every morning.
Metaphor: A private card club's sports broadcast.
Signature: Select a historical competition and the trophy, lineup and scoreboard change together.
Emotion: Familiar rivals with something at stake.
Motion verb: Settle into position, like cards dealt onto felt.
Screenshot: Oversized CH AAL LEAGUE masthead above five mascots around an oval table and a clear champion.

## System

Existing SvelteKit, CSS and locally hosted Bricolage Grotesque. Ground #101f1b (club felt), ink #f7f1df (scoreboard ivory), muted #b5c2b9, line #385047, accent #edc76c (trophy brass), curtain #0a1512. Bricolage for display and prose, system monospace for scores. Max content width 1440px, 6% side gutters, 12-column desktop composition, single-column phone composition. Circular controls and portraits, 4px scoreboards, no generic card grid. Masthead, championship scene, ruled standings, expanding player bench, square matchup matrix, horizontal archive and editorial journal each use different arrangements.

No fake live play, invented trophies, inflated training claims, automatic policy promotions, or real-money labels. Competition chips are simulation units. Idle scene deliberately still; meaningful motion comes from selection and pointer/focus feedback. Reduced motion keeps all data visible. One h1. All controls work by keyboard and tap.

## Competition contract

Classic Teen Patti, canonical frozen style hashes, 100 starting bets and automatic rebuys excluded from net profit. One million shared table hands gives each of five bots one million participations. Every 100-hand shuffled-deck block is repeated through five cyclic seat rotations. Fresh session minds per table, no club-member memory, no policy changes. Rank on net profit, show wins and per-100-bet returns as supporting measures. Uncertainty comes from paired independent rotation blocks. A trophy requires the leader's paired 95% gap to exclude zero against every rival; otherwise report a provisional leader without awarding a title. Pairwise matrix means relative earnings at the same five-player tables, not heads-up results.

## Operations

Background local simulation publishes immutable completed records to MongoDB; authenticated Worker endpoint returns history. Build snapshot provides the inaugural result if history is not yet populated. Daily scheduler checks the New York calendar, locks against concurrent runs, retries a missing daily run and writes completed results only. Hourly play remains disabled until there is a measured reason to add it. Mac scheduling depends on machine availability and connectivity; page shows last completed result rather than a fake running state.
