# Open data for bot behaviour (research notes)

Status: notes, 2026-10-19. Nothing here is a dependency of the game, and nothing here is loaded in
production. Companion to `docs/archive/BOT_BRAIN.md`.

## Finding

There is **no public Teen Patti hand dataset** worth using. Searches turned up only other games.
Teen Patti strategy must be learned and judged inside our own engine (`server/sim/`, BOT_BRAIN §13).

Poker data can still help with **behaviour**: how people react to aggression, how often they
fold to raises, how play changes after big losses. It cannot tell us what a correct Teen Patti
action is. Hold'em has community cards, positions and more betting rounds; Teen Patti has blind
vs seen play, show requests and two bet sizes.

## Sources

| Source                                                                              | What it has                                                                                                                                                                                                                               | Possible use                                                                                                                                       | Caveats                                                                                                |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **PHH dataset** ("A Dataset of Poker Hand Histories", Zenodo, v3 Sept 2025, ~20 GB) | Hands across 11 variants in the open PHH format: ACPC competition hands (hundreds of millions, mostly bot vs bot), all 10,000 Pluribus hands, ~21.6M anonymized online no-limit hold'em hands from July 2009, WSOP 2023 final-table hands | Priors for population behaviour: fold-to-raise, aggression after losses, tilt signatures, bet-pressure response. Sanity-check our human archetypes | Hold'em only; online 2009 players are not our friends' table; bot-vs-bot hands are not human behaviour |
| **PHH format + PokerKit** (Python parser)                                           | Spec and tooling to read the above                                                                                                                                                                                                        | Offline Python notebook to extract the few statistics we want                                                                                      | Python, offline only                                                                                   |
| **OpenSpiel**, **RLCard**                                                           | Game environments and RL algorithms; no Teen Patti                                                                                                                                                                                        | Reference designs if we ever do RL (Phase 5+). Not needed for the sim                                                                              | We already have a faster path: our real engine                                                         |

## How we would use it, if at all (Phase 5 or later)

1. Extract a handful of **aggregate** numbers (e.g. fold-to-raise when facing a pot-size raise,
   change in aggression after losing ≥ 10 big blinds) from the online no-limit subset.
2. Use them only as **priors** for opponent models and as targets for the `emotional` and
   `beginner` archetypes.
3. Validate in our simulator against our own recorded club hands (aggregate, privacy-safe).

Not before the measurement infrastructure (Phases 1 to 4) exists.

## References

- PHH dataset: https://zenodo.org/doi/10.5281/zenodo.10796885
- Kim, "Recording and Describing Poker Hands" (PHH format): https://arxiv.org/abs/2312.11753
- PHH docs: https://phh.readthedocs.io/en/stable/intro.html
- OpenSpiel: https://arxiv.org/abs/1908.09453
