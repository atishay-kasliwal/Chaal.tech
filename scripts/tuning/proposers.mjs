/**
 * Tuning loop: proposers (docs/bots/TUNING_LOOP.md). A proposer gets the character context, the
 * measured baseline, the round and the feedback on earlier drafts, and returns DNA drafts (the shape
 * in scripts/tuning/bounds.mjs). Two kinds:
 *
 *  - `mock`: deterministic and offline. Small seeded perturbations inside the bounds; on request,
 *    one deliberately out-of-bounds draft in the first round so the loop-back path runs too.
 *  - `claude`: one Claude API call per round with a JSON-schema structured output. Offline tooling
 *    only: the SDK is a devDependency, loaded lazily, never imported by the game server or the site.
 */
import { stream } from '../../server/sim/seeds.mjs';

const round3 = (x) => Math.round(x * 1000) / 1000;

/** The deterministic local proposer. */
export function mockProposer({ seed = 1, invalid = 1 } = {}) {
	return {
		name: 'mock',
		model: null,
		async propose({ context, round, want }) {
			const random = stream(seed, 'tuning-mock', context.character, round).random;
			const genes = Object.entries(context.bounds.genes).filter(([, g]) => g.max - g.min > 0.02);
			const quirks = Object.entries(context.bounds.quirks);
			const drafts = [];
			for (let i = 0; i < want; i++) {
				const dna = [];
				const count = 1 + Math.floor(random() * 3);
				const pool = genes.slice();
				for (let k = 0; k < count && pool.length; k++) {
					const [gene, g] = pool.splice(Math.floor(random() * pool.length), 1)[0];
					const step = (0.02 + 0.06 * random()) * (random() < 0.5 ? -1 : 1);
					let value = round3(Math.min(g.max, Math.max(g.min, g.value + step)));
					if (Math.abs(value - g.value) < 0.01)
						value = round3(Math.min(g.max, Math.max(g.min, g.value - step)));
					dna.push({ gene, value });
				}
				const q =
					quirks.length && random() < 0.3 ? quirks[Math.floor(random() * quirks.length)] : null;
				const quirkList = [];
				if (q) {
					const [id, b] = q;
					const s = round3(
						Math.min(b.max, Math.max(b.min, b.strength + (random() < 0.5 ? -0.1 : 0.1)))
					);
					if (Math.abs(s - b.strength) >= 0.01) quirkList.push({ id, strength: s });
				}
				drafts.push({
					id: `m${round}-${i + 1}`,
					rationale: `Mock proposal (seed ${seed}, round ${round}): a small seeded step in ${dna.map((d) => d.gene).join(', ')}${quirkList.length ? ` and quirk ${quirkList[0].id}` : ''}, inside the bounds.`,
					weakness:
						context.weaknesses.tune[Math.floor(random() * context.weaknesses.tune.length)] ?? null,
					dna,
					quirks: quirkList,
					exploitTarget: null
				});
			}
			// Exercise the validator: one draft far out of bounds in the first round.
			if (round === 1 && invalid > 0 && drafts.length) {
				const [gene, g] = genes[0];
				drafts[0] = {
					...drafts[0],
					id: `m${round}-bad`,
					rationale: `Mock proposal (round ${round}): deliberately out of bounds to exercise validation and the loop back.`,
					dna: [{ gene, value: round3(Math.min(1, g.max + 0.25)) }]
				};
			}
			return { drafts, usage: null };
		}
	};
}

/* ------------------------------------------- Claude ------------------------------------------- */

/** Draft list schema for structured output (bounds are checked after, by bounds.mjs). */
export const DRAFTS_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['drafts'],
	properties: {
		drafts: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'rationale', 'weakness', 'dna', 'quirks', 'exploitTarget'],
				properties: {
					id: { type: 'string', description: 'short lowercase tag, e.g. "c1-monster-raise"' },
					rationale: {
						type: 'string',
						description: 'why these changes, what behaviour should move, and what must not'
					},
					weakness: { type: 'string', description: 'the tunable weakness this targets' },
					dna: {
						type: 'array',
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['gene', 'value'],
							properties: { gene: { type: 'string' }, value: { type: 'number' } }
						}
					},
					quirks: {
						type: 'array',
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['id', 'strength'],
							properties: { id: { type: 'string' }, strength: { type: 'number' } }
						}
					},
					exploitTarget: {
						anyOf: [{ type: 'string' }, { type: 'null' }],
						description: 'a fixed exploit this draft should clearly improve against, or null'
					}
				}
			}
		}
	}
});

const SYSTEM = `You tune the personality DNA of a Teen Patti bot character in a private friends' card club.
Each character is a style config (genes in [0, 1] and named quirks with a strength) on a shared
brain. You propose small, explained edits of the canonical config; an offline simulator then plays
them on matched tables and gates them against canonical. A human reviews every result; nothing you
propose is published automatically.

Rules:
- Change at most the allowed number of values, each inside its stated [min, max]; only genes and
  quirks that exist. You cannot change the policy, tempo or games.
- The character must stay recognizable: respect the identity regions and never trade away a
  weakness listed under "keep" (those are the character).
- Prefer the smallest change that plausibly moves the targeted behaviour. Explain the mechanism
  you expect and the risk (which gate it might fail).
- Drafts should differ from each other, so the simulation learns something from each.
- If earlier drafts were rejected, fix exactly what the feedback says.`;

/** The user message: the context, the measured baseline and the feedback, as data. */
export function proposalPrompt({ context, baselineSummary, round, want, feedback, accepted }) {
	return [
		`Character: ${context.name} (${context.character}). Round ${round}. Propose ${want} draft(s).`,
		'',
		'Canonical config, allowed bounds and limits, target bands and known weaknesses (JSON):',
		JSON.stringify(
			{
				canonical: context.canonical,
				bounds: context.bounds,
				bands: context.bands,
				weaknesses: context.weaknesses
			},
			null,
			1
		),
		'',
		'Latest measured fingerprint of the canonical config in this run (JSON):',
		JSON.stringify(baselineSummary, null, 1),
		accepted.length
			? `\nDrafts already accepted for simulation (do not repeat them):\n${JSON.stringify(accepted, null, 1)}`
			: '',
		feedback.length
			? `\nRejected drafts and why (fix these problems):\n${JSON.stringify(feedback, null, 1)}`
			: ''
	].join('\n');
}

/**
 * The Claude proposer. Needs ANTHROPIC_API_KEY. One request per round, structured output, adaptive
 * thinking (always on for this model family) at the given effort, server-side refusal fallback.
 */
export function claudeProposer({
	model = 'claude-opus-5-5',
	effort = 'high',
	maxTokens = 32000
} = {}) {
	return {
		name: 'claude',
		model,
		async propose(input) {
			if (!process.env.ANTHROPIC_API_KEY)
				throw new Error(
					'ANTHROPIC_API_KEY is not set (environment or .env). Use --mock to run offline.'
				);
			const { default: Anthropic } = await import('@anthropic-ai/sdk');
			const client = new Anthropic();
			const stream = client.beta.messages.stream({
				model,
				max_tokens: maxTokens,
				betas: ['server-side-fallback-2026-07-01'],
				fallbacks: 'default',
				thinking: { type: 'adaptive' },
				output_config: { effort, format: { type: 'json_schema', schema: DRAFTS_SCHEMA } },
				system: SYSTEM,
				messages: [{ role: 'user', content: proposalPrompt(input) }]
			});
			const message = await stream.finalMessage();
			if (message.stop_reason === 'refusal')
				throw new Error(
					`Claude declined (${message.stop_details?.category ?? 'no category'}): ${message.stop_details?.explanation ?? ''}`
				);
			if (message.stop_reason === 'max_tokens')
				throw new Error('Claude ran out of output tokens; raise --max-tokens');
			const text = message.content
				.filter((b) => b.type === 'text')
				.map((b) => b.text)
				.join('');
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				throw new Error('Claude returned output that is not JSON');
			}
			return {
				drafts: Array.isArray(parsed?.drafts) ? parsed.drafts : [],
				usage: {
					model: message.model,
					input: message.usage?.input_tokens ?? null,
					output: message.usage?.output_tokens ?? null
				}
			};
		}
	};
}
