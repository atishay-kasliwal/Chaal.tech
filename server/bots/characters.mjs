import { CHARACTER_POLICY, characterHash } from './config.mjs';
import { BOT_CHARACTERS } from '../../shared/bot-characters.mjs';

const base = {
	blindRounds: 1,
	call: 0.33,
	raise: 0.72,
	show: 0.5,
	bluff: 0.03,
	randomness: 0.08,
	mistake: 0.02,
	pressureRead: 0.1,
	shortStackCall: 0.08,
	largePotCaution: 0.06,
	strongRaiseChance: 0.7,
	blindShowChance: 0.25,
	stackRisk: 0.25
};

// Club characters inspired by the approved artwork, not claims about real people's play.
const designs = [
	{
		id: 'rohit-sharma',
		title: 'The big-hitter',
		description: 'Happy to stay blind. When he finds his hand, he makes some noise.',
		traits: ['bold', 'unhurried'],
		difficulty: 'balanced',
		tendencies: {
			blindRounds: 4,
			raise: 0.59,
			bluff: 0.11,
			strongRaiseChance: 0.88,
			stackRisk: 0.4
		}
	},
	{
		id: 'virat-kohli',
		title: 'The pressure player',
		description: 'Looks early, pushes good hands and respects a serious raise.',
		traits: ['intense', 'decisive'],
		difficulty: 'challenging',
		tendencies: {
			blindRounds: 0,
			call: 0.31,
			raise: 0.61,
			pressureRead: 0.22,
			randomness: 0.03,
			mistake: 0,
			strongRaiseChance: 0.94
		}
	},
	{
		id: 'ms-dhoni',
		title: 'The patient finisher',
		description: 'Keeps the pot manageable, protects his stack and waits for the right Show.',
		traits: ['patient', 'composed'],
		difficulty: 'challenging',
		tendencies: {
			blindRounds: 2,
			call: 0.28,
			raise: 0.8,
			show: 0.44,
			bluff: 0.015,
			largePotCaution: 0.15,
			shortStackCall: 0.16,
			strongRaiseChance: 0.45,
			stackRisk: 0.14,
			mistake: 0
		}
	},
	{
		id: 'gg',
		title: 'The watchful one',
		description: 'Choosy about his cards. Big pots and seen raises make him more cautious.',
		traits: ['watchful', 'disciplined'],
		difficulty: 'balanced',
		tendencies: {
			blindRounds: 0,
			call: 0.45,
			raise: 0.77,
			show: 0.62,
			pressureRead: 0.3,
			largePotCaution: 0.24,
			bluff: 0.01,
			shortStackCall: 0.22,
			stackRisk: 0.1
		}
	},
	{
		id: 'samay-raina',
		title: 'The wildcard',
		description: 'Lingers blind, throws in the odd bluff and enjoys an early Show.',
		traits: ['playful', 'unpredictable'],
		difficulty: 'balanced',
		tendencies: {
			blindRounds: 6,
			call: 0.23,
			raise: 0.68,
			show: 0.37,
			bluff: 0.24,
			randomness: 0.2,
			mistake: 0.06,
			blindShowChance: 0.65,
			stackRisk: 0.55,
			largePotCaution: 0,
			strongRaiseChance: 0.6
		}
	}
];

export const CHARACTER_SEEDS = designs.map((design, order) => {
	const art = BOT_CHARACTERS.find((character) => character.id === design.id);
	const style = {
		_id: `${design.id}@1`,
		botId: design.id,
		version: 1,
		parent: null,
		status: 'draft',
		policy: CHARACTER_POLICY,
		supportedGames: ['teen-patti'],
		supportedVariants: ['*'],
		tendencies: { ...base, ...design.tendencies },
		difficulty: { declared: design.difficulty, measured: null },
		source: 'manual',
		notes: 'Initial club character. No adaptive memory.'
	};
	style.configHash = characterHash(style);
	return {
		bot: {
			_id: design.id,
			slug: design.id,
			order,
			name: art.name,
			avatar: { mascotId: art.mascotId },
			description: design.description,
			personality: { title: design.title, traits: design.traits },
			status: 'active',
			currentStyle: style._id,
			currentVersion: 1,
			nextVersion: 1
		},
		style
	};
});
