import { CHARACTER_STYLES, LEGACY_STYLES, STYLES } from '../bots/dna-styles.mjs';
import { seatDecider } from '../bots/runner.mjs';
import { deciderFor } from '../bots/policies.mjs';
import { CHARACTER_IDS, castMember } from '../../src/lib/bots/cast.js';
import { BASELINES } from './baselines.mjs';
import { ARCHETYPES, ARCHETYPE_STYLES, ARCHETYPE_STACKS, ARCHETYPE_IDS } from './archetypes.mjs';
import { adversary } from './adversary.mjs';
import { P4_ARCHETYPES, p4Decider } from './archetypes-p4.mjs';

/**
 * Who can sit at a simulated table. A member is either a published style (played by the real
 * production decider, exactly as in a room) or a sim-only baseline. Baselines sit in the engine
 * as ordinary practice seats; the simulator decides for them.
 */
export const REFERENCE_IDS = Object.freeze([
	'legacy-easy',
	'legacy-normal',
	'legacy-hard',
	...Object.keys(BASELINES)
]);
export { CHARACTER_IDS, ARCHETYPE_IDS };
/** Member ids for one published version of every character, e.g. versioned(1) -> ['gg@1', ...]. */
export const versioned = (version) => CHARACTER_IDS.map((id) => `${id}@${version}`);

/** `id` is a member id, or { id, style } for an unpublished style under test (decided in the sim). */
export function member(id) {
	// Phase 4 adversary: { id, adversary: genome, target: seat index or null }, its own memory per seat.
	if (typeof id === 'object' && id.adversary)
		return {
			id: id.id,
			styleId: null,
			seat: (room, botId) => ({ botId, name: id.id.slice(0, 24), level: 'normal' }),
			decide: adversary(id.adversary, id.target == null ? null : `bot-seat-${id.target}`)
		};
	if (typeof id === 'string' && P4_ARCHETYPES[id])
		return {
			id,
			styleId: null,
			seat: (room, botId) => ({ botId, name: id.slice(0, 24), level: 'normal' }),
			decide: p4Decider(id)
		};
	if (typeof id === 'object')
		return {
			id: id.id,
			styleId: null,
			seat: (room, botId) => ({ botId, name: id.id.slice(0, 24), level: 'normal' }),
			decide: deciderFor(id.style),
			style: id.style
		};
	if (id.startsWith('legacy-')) {
		const level = id.slice('legacy-'.length);
		if (!LEGACY_STYLES[level]) throw new Error(`Unknown member ${id}`);
		return {
			id,
			styleId: LEGACY_STYLES[level]._id,
			seat: (room, botId) => ({ botId, name: id, level }),
			decide: null
		};
	}
	if (ARCHETYPE_STYLES[id]) return { ...member({ id, style: ARCHETYPE_STYLES[id] }), id };
	if (ARCHETYPES[id])
		return {
			id,
			styleId: null,
			seat: (room, botId) => ({ botId, name: id.slice(0, 24), level: 'normal' }),
			decide: ARCHETYPES[id],
			stack: ARCHETYPE_STACKS[id] ?? null
		};
	if (BASELINES[id])
		return {
			id,
			styleId: null,
			seat: (room, botId) => ({ botId, name: id, level: 'normal' }),
			decide: BASELINES[id]
		};
	// A character on its current style ('gg'), or on a specific published version ('gg@1').
	const [characterId, version] = id.split('@');
	if (CHARACTER_STYLES[characterId]) {
		const styleId = version ? `${characterId}@${version}` : CHARACTER_STYLES[characterId]._id;
		if (!STYLES[styleId]) throw new Error(`Unknown member ${id}`);
		return {
			id,
			styleId,
			// Seated exactly as the engine seats a published style: the whole style travels with the seat.
			seat: (room, botId) => ({
				botId,
				name: castMember(characterId).name,
				level: 'normal',
				style: STYLES[styleId]
			}),
			decide: null
		};
	}
	throw new Error(`Unknown member ${id}`);
}

/** The decider for a seat: a baseline's rule, otherwise exactly what a live room would run. */
export function deciderForMember(m) {
	return m.decide ?? null;
}

export { seatDecider };
