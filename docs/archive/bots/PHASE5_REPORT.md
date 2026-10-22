# Bot Brain Phase 5: long-term cross-session memory

Written 2026-10-22. Code: PR #31. The five canonical characters now carry what they have seen of a
returning person from earlier nights into a new session, as a small prior that the night's own play
soon overrides.

## Direction (kept as set)

public observations only → bounded summary → confidence → decay → returning-player prior → new
evidence overrides stale memory. No live retraining, no hidden cards, no automatic DNA changes, no neural
or RL system.

## Design

**Built on what exists.** Production already keeps `bot_memory`: per character, per game and variant,
per person, the public decisions they made (folding under pressure, folding, calling, raising, seeing),
with a 14-day half-life and a confidence (hands seen, opportunities, a 60-day fade). It was read only by
the older `tp-adaptive@1` line; the published DNA characters did not use it. It keeps accumulating for
the DNA characters (it records every seated character's hands, whatever its policy).

| Step | Where | What |
|---|---|---|
| Summary | `server/bots/memory/prior.mjs` `teenPattiPrior` | one person's memory across all Teen Patti variants: fold to a raise, giving up, raise share; the recent rate when their behaviour has clearly changed, else the long-term rate |
| Bound and confidence | `priorFromRates` | at most `SEED_CAP` = 10 pseudo-observations per belief, scaled by the memory's confidence (a night is about 30 observations) |
| Seeding | `server/bots/mind.mjs` `seedPrior` | once per session, into the mind's model of that person; nothing else in the mind changes |
| Overriding | the mind's own per-hand decay | the seed decays with every hand like any count; the session's own evidence soon outweighs it |
| Loading | `server/cloudflare/room-object.mjs` `refreshPriors` | in the background when the people or characters at a Teen Patti table change; one indexed read, capped at 2 s; a failure leaves no prior |
| Replay | the deal's commit | priors are folded in before the deal records the minds, so a seeded hand replays exactly (test) |

The policy code, the DNA and the published versions are unchanged: a character decides from the same
beliefs as before, only now those beliefs about a returning person start from what it remembers.

**Not in this phase:** the trick games (3 2 5, 10 Pakad, 29). Their hands are recorded, but the memory
extractor reads Teen Patti decisions; a trick-game extractor (follow and beat, void and trump, and in
29 bids made) plugs into the same prior and seeding path.

## Gates

Script: `scripts/sim/phase5-memory.mjs`. Night 1 builds the memory (the simulator's stand-in for
`bot_memory`: the same rates and the same confidence formula, from the character's last session mind);
night 2 is played twice on the same cards and draws, with and without the priors. 40 tables per case,
100 hands a night, 15 opponent strategies plus a neutral field.

### One night of memory (seed 101; `docs/bots/phase5/results/memory-101.json`)

| | Same opponents (mean of 15, boots/100) | Opponents changed style | Neutral field strength | Style (fold rate, aggression, blind play, show rate, bad actions) |
|---|---:|---:|---:|---|
| Rohit | +8 | +14 | −1 ± 6 | unchanged (within 0.01) |
| Virat | +8 | −1 | +39 ± 61 | unchanged |
| GG | +4 | −9 | −19 ± 27 | unchanged (aggression 1.66 vs 1.71) |
| Samay | −17 | +7 | 0 ± 0 | unchanged |
| Dhoni | −48 | −48 | −53 ± 312 | unchanged (aggression 0.74 vs 0.78) |

Every per-strategy difference is within its noise. One night gives the prior two or three
pseudo-observations, so it barely moves a decision: **safe, and no measurable effect yet.**

### A regular: about five nights of memory

Night 1 played 500 hands (about five nights with the same people), so the priors carry more weight;
night 2 as before (`docs/bots/phase5/results/memory-101-regular.json`).

| | Same opponents (mean of 15, boots/100) | Opponents changed style | Neutral field strength | Style |
|---|---:|---:|---:|---|
| Rohit | +11 | +13 | −1 ± 6 | unchanged |
| Virat | +13 | +11 | −52 ± 166 | unchanged (aggression 1.79 vs 1.77) |
| GG | +4 | −14 | −17 ± 27 | unchanged (aggression 1.66 vs 1.71) |
| Samay | −16 | +8 | 0 ± 0 | unchanged |
| Dhoni | −33 | −30 | −166 ± 308 | unchanged (aggression 0.75 vs 0.78) |

Of 150 per-strategy comparisons, two are outside their noise, both small and both when the opponents
had changed style: Rohit against `loose-then-value` (−38 ± 30) and Dhoni against `value-then-bluff`
(−8 ± 5), the stale-memory case the cap exists for. No comparison with the same opponents is clearly
better or worse.

## Verdict

**Shipped (PR #31, Worker `59b5bdd58a20`): safe, live, and small by design.**

- Every gate that guards identity and safety passes: style is unchanged, strength on a neutral field is
  within noise, decisions replay exactly, no hidden cards, no change to DNA or policy.
- No measurable gain yet. With at most 10 pseudo-observations per belief against a session's ~30, and
  confidence that grows only with many hands, memory nudges a returning player's first hands and then
  the night takes over: the "new evidence overrides" rule working as asked. The benefit grows with real
  play; production memory today holds at most 24 hands per person.
- Stale memory costs little and briefly (the two small cases above).

**Next, if wanted (not started):** a trick-game extractor so 3 2 5, 10 Pakad and 29 remember too; and,
after a few weeks of real nights, re-run the gates on production-shaped memory before considering a
larger cap.
