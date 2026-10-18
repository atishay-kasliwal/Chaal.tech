/**
 * Optional richer summaries (docs/ANALYTICS_PHASE5.md, "Optional AI summaries"). Nothing in the product
 * needs this: recaps and insights are deterministic templates. This is only the narrow door a language
 * model could later be put behind, and it is built so the model cannot see or invent anything it should
 * not:
 *
 *   input    only statements the viewer was already allowed to read (the recap highlights' own text and
 *            counts), never cards, decks, seals, bot traces, memory, another player's private numbers
 *   output   checked before use: length limited, and every number in it must already be in the input
 *   failure  any provider error or rejected output falls back to the deterministic summary
 */

export const MAX_SUMMARY_CHARS = 600;
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** The only thing a provider ever receives. Built by whitelisting, not by deleting fields. */
export function summaryInput(recap) {
	return {
		kind: 'night-recap',
		minutes: recap.minutes,
		hands: recap.hands,
		you: { hands: recap.you.hands, units: recap.you.units },
		facts: recap.highlights.map((h) => ({ scope: h.scope, text: String(h.text) }))
	};
}

/** The default summary: the highlights themselves, in order. */
export function templateSummary(input) {
	return input.facts.map((f) => f.text).slice(0, 4).join(' ');
}

const numbersIn = (text) => new Set((String(text).match(NUMBER) ?? []).map((n) => String(Number(n.replaceAll(',', '')))));

/** A model's text is acceptable only if it is short and brings no number of its own. */
export function acceptable(text, input) {
	if (typeof text !== 'string' || !text.trim() || text.length > MAX_SUMMARY_CHARS) return false;
	const allowed = numbersIn(JSON.stringify(input));
	for (const n of numbersIn(text)) if (!allowed.has(n)) return false;
	return !/https?:|<[a-z]|—/i.test(text);
}

/**
 * @param provider { summarise(input): Promise<string> } or null
 * @returns { text, source: 'template' | 'model' }
 */
export async function summarise(recap, provider = null) {
	const input = summaryInput(recap);
	const fallback = { text: templateSummary(input), source: 'template' };
	if (!provider) return fallback;
	try {
		const text = await provider.summarise(structuredClone(input));
		return acceptable(text, input) ? { text: text.trim(), source: 'model' } : fallback;
	} catch {
		return fallback;
	}
}
