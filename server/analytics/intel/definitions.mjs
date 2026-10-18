/**
 * The metric registry: one place that says what each number means and which function is its single
 * definition. Surfaces (player page, rivalry page, bot page, recap, records, insights, owner views)
 * must call these functions rather than recompute; a test imports every entry to prove it still exists.
 * Documented in docs/ANALYTICS_METRICS.md.
 */
export const METRICS = Object.freeze([
	{ id: 'units', label: 'Boots, big blinds, bets', module: 'compute/facts.mjs', fn: 'handFacts', meaning: 'A hand’s net chips divided by that game’s stake unit, so stakes compare fairly.' },
	{ id: 'fair-share', label: 'Wins against a fair share', module: 'compute/performance.mjs', fn: 'fairShare', meaning: 'Wins against 1 divided by players dealt in, with a normal-approximation interval.' },
	{ id: 'results', label: 'Boots a hand', module: 'compute/performance.mjs', fn: 'results', meaning: 'Mean units per hand with nights as clusters; the verdict needs the interval to exclude zero.' },
	{ id: 'head-to-head', label: 'Rivalry', module: 'compute/rivals.mjs', fn: 'rivalries', meaning: 'Chips that moved directly between two seats, in the viewer’s units, by permanent identity.' },
	{ id: 'patterns', label: 'Behaviour rates', module: 'compute/patterns.mjs', fn: 'coreRates', meaning: 'Rates over decisions where the action was legal, voluntary choices only.' },
	{ id: 'cards-value', label: 'What the cards were worth', module: 'intel/skill-luck.mjs', fn: 'skillLuck', meaning: 'Pot times (win chance − fair share), if everyone stayed to the end. Exact variance over the deck for Teen Patti.' },
	{ id: 'play-value', label: 'What you did beyond the cards', module: 'intel/skill-luck.mjs', fn: 'playRows', meaning: 'Actual units minus cards value, per hand, with the Bernoulli variance of the pot.' },
	{ id: 'blackjack-ev', label: 'Blackjack expected value', module: 'intel/strength.mjs', fn: 'blackjackEv', meaning: 'Exact infinite-deck EV of hit, stand, double for this table’s rules.' },
	{ id: 'improvement', label: 'Improvement', module: 'intel/improvement.mjs', fn: 'improvement', meaning: 'Recent 30 days against the same player’s earlier history, headline from luck-free dimensions only.' },
	{ id: 'rivalry-titles', label: 'Rivalry titles', module: 'intel/rivalry.mjs', fn: 'rivalryBoard', meaning: 'Plain-fact selection over the canonical rivalry list; no composite score.' },
	{ id: 'personal-records', label: 'Personal records', module: 'intel/records.mjs', fn: 'personalRecords', meaning: 'Pure function of a slice of history, so before and after a night can be compared.' },
	{ id: 'club-records', label: 'Club records', module: 'intel/records.mjs', fn: 'clubRecords', meaning: 'Celebratory records over public hand summaries.' },
	{ id: 'achievements', label: 'Achievements', module: 'intel/achievements.mjs', fn: 'achievements', meaning: 'Derived on demand from history; never stored.' },
	{ id: 'surprise', label: 'Surprises', module: 'intel/surprise.mjs', fn: 'nightSurprises', meaning: 'A night against the same player’s own earlier baseline, with significance and effect-size gates.' },
	{ id: 'ranking', label: 'Insight ranking', module: 'intel/ranking.mjs', fn: 'rankInsights', meaning: 'Fixed weighted sum of confidence, magnitude, novelty, relevance, recency, social and actionability.' },
	{ id: 'recap', label: 'Night recap', module: 'intel/recap.mjs', fn: 'buildRecap', meaning: 'Three to six ranked highlights over shared facts plus the viewer’s own.' },
	{ id: 'fairness', label: 'Deck fairness', module: 'intel/fairness.mjs', fn: 'fairnessCenter', meaning: 'Chi-square and per-card tests on the viewer’s own cards, corrected for multiple comparisons.' },
	{ id: 'club-overview', label: 'Club overview', module: 'intel/club.mjs', fn: 'clubOverview', meaning: 'Counts and durations from public hand summaries.' },
	{ id: 'variant-health', label: 'Variant health', module: 'intel/club.mjs', fn: 'variantHealth', meaning: 'Independent signals per variant with sample sizes; no combined score.' },
	{ id: 'bot-analysis', label: 'Bot intelligence', module: '../bots/intel.mjs', fn: 'analyzeBots', meaning: 'Usage, results, predictability, exploitability and lineage per character.' },
	{ id: 'quality', label: 'Data quality', module: 'intel/quality.mjs', fn: 'recordProblems', meaning: 'Per-hand integrity checks, plus operational checks over recorder, replay and memory.' },
	{ id: 'export', label: 'Warehouse rows', module: 'intel/export.mjs', fn: 'exportRows', meaning: 'One canonical row per seat per completed hand.' }
]);
