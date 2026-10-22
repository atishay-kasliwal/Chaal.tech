# Cross-game character evaluation

Written 2026-10-22, after 3 2 5, 10 Pakad and 29 were built. Question: does each canonical character
keep its identity across Teen Patti and the three trick games, when its DNA is the same and its
strategy is each game's own? Script: `scripts/sim/cross-game-eval.mjs` (seed 81); data:
`docs/bots/cross-game/eval-81.json`. Nothing was tuned for this evaluation.

## Method

Two axes with the same meaning in every game, and one measure per game, fixed before running:

| Axis                                                           | Teen Patti             | 3 2 5                    | 10 Pakad                               | 29                      |
| -------------------------------------------------------------- | ---------------------- | ------------------------ | -------------------------------------- | ----------------------- |
| Boldness: taking the initiative, spending strength, committing | raise share of actions | contest rate             | early trumping + pressing one's streak | bid rate                |
| Patience: keeping strength back                                | not calling weak hands | not leading trumps early | not trumping early                     | making the bids it wins |

The DNA predicts each character's position: boldness from riskTolerance + aggression + ego −
discipline − patience; patience from patience + discipline − riskTolerance. Predicted boldness order:
Virat, Rohit, Samay, Dhoni, GG. Predicted patience order: GG, Dhoni, Rohit, Samay, Virat.

## Results

Rank agreement (Spearman, five characters) of each game with the DNA prediction:

| Axis     | Teen Patti | 3 2 5 | 10 Pakad |  29 |
| -------- | ---------: | ----: | -------: | --: |
| Boldness |   **−0.6** |   0.9 |      0.8 | 1.0 |
| Patience |        0.9 |   0.8 |      0.9 | 0.3 |

Per character, the number of games (of four) in which its rank sits on the side of the middle the DNA
predicts:

|       | Boldness | Patience |
| ----- | -------: | -------: |
| Rohit |      3/4 |      4/4 |
| Virat |      4/4 |      4/4 |
| GG    |      3/4 |      4/4 |
| Samay |      4/4 |      3/4 |
| Dhoni |      3/4 |      4/4 |

## Reading

- **Identity carries across games.** In all three trick games boldness follows the DNA (0.8 to 1.0), and
  patience does in Teen Patti, 3 2 5 and 10 Pakad (0.8 to 0.9). Virat is the clearest character
  everywhere; GG and Dhoni are the patient ones everywhere.
- **Teen Patti's boldness measure is the wrong instrument, not a broken character.** Raise share ranks
  GG first because a tight player's few actions are mostly raises: it measures selectivity, not
  initiative. Teen Patti identities are established by their own gates (Phases 2 to 4.1). This measure
  was fixed before the run and is reported as it came out; it is not replaced after the fact.
- **29's patience is weak (0.3).** In 29 the make rate depends mostly on how high a character bids, so it
  mixes boldness into patience; and card play in 29 leaves personality little room (29_REPORT.md).
- **Strength is not traded for identity.** In every trick game each character is within noise of the
  personality-free brain in the same seat.

## Known limits (carried forward, not fixed here)

| Limit                                                                                                     | Where                | Note                                               |
| --------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| Faint Rohit and Dhoni in 3 2 5 (identified 31% and 41%, chance 20%)                                       | 325_PHASE2_REPORT.md | expression strength, not direction                 |
| Weak in-session adaptation in trick games                                                                 | 3 2 5, 10 Pakad, 29  | session models only; cross-night memory is Phase 5 |
| 29 card play close to the brain                                                                           | 29_REPORT.md         | identity shows in bidding                          |
| Teen Patti weaknesses kept as character (Rohit blind pride, GG style-switch, Samay passivity, Virat tilt) | STATUS.md            | Phase 4 decision                                   |

No DNA, policy or published version changed for this evaluation. The next step on the roadmap is Phase 5
(long-term cross-session memory), now designed against four game environments rather than one.
