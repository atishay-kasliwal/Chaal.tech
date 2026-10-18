import { hand, decide, T0 } from './records.mjs';
import { observeHand } from '../../../server/bots/memory/observations.mjs';
import { accumulate, emptyMemory, DAY } from '../../../server/bots/memory/model.mjs';
import { CHARACTER_SEEDS } from '../../../server/bots/characters.mjs';
import { ADAPTIVE_POLICY, defaultMemory } from '../../../server/bots/memory/adaptive.mjs';
import { characterHash } from '../../../server/bots/config.mjs';

export function adaptiveStyle(index = 0) {
	const style = structuredClone(CHARACTER_SEEDS[index].style);
	style.version = 2; style._id = `${style.botId}@2`; style.status = 'published';
	style.policy = ADAPTIVE_POLICY; style.memory = defaultMemory(style.tendencies);
	style.configHash = characterHash(style);
	return style;
}
export function observedFixture(index, { botId = 'rohit-sharma', action = 'fold', at = T0 + index * 60000, night = `night-${Math.floor(index/10)}`, blind = false, variant = 'classic-1' } = {}) {
	const record = hand({ id: `memory-${index}`, at, night, handNo: index % 10 + 1, rulesVersion: variant,
		seats: [{ p: 'a', net: -20, exit: 'fold' }, { p: 'bot-seat', bot: botId, net: 20 }],
		events: [decide(0, 'bot-seat', 'raise', { kind: 'bot', blind: true, amount: 20, potBefore: 20 }),
			decide(1, 'a', action, { facing: 'raise', amount: action === 'raise' ? 40 : 20, blind, potBefore: 40 }),
			{ i: 2, t: 50000, p: 'system', a: 'result', kind: 'system' }]
	});
	record.complete = true;
	return record;
}
export function learnedMemory({ hands = 200, botId = 'rohit-sharma', action = 'fold', start = T0, interval = 60000, blind = false } = {}) {
	let memory = emptyMemory(botId, 'teen-patti', 'classic-1');
	for (let i = 0; i < hands; i++) memory = accumulate(memory, observeHand(observedFixture(i, { botId, action, at: start+i*interval, blind }), botId));
	return memory;
}
export { T0, DAY };
