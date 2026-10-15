import test from 'node:test';
import assert from 'node:assert/strict';
import {
	clearPendingJoinName,
	pendingJoinName,
	stageJoinName
} from '../../src/lib/start/player-name.ts';

test('pending player name is trimmed, limited, and scoped to its room until seated', (t) => {
	const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
	const values = new Map();
	Object.defineProperty(globalThis, 'sessionStorage', {
		configurable: true,
		value: {
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => values.set(key, String(value)),
			removeItem: (key) => values.delete(key)
		}
	});
	t.after(() => {
		if (priorStorage) Object.defineProperty(globalThis, 'sessionStorage', priorStorage);
		else delete globalThis.sessionStorage;
	});

	stageJoinName('room-a', '  Raju  ');
	assert.equal(pendingJoinName('room-a'), 'Raju');
	assert.equal(pendingJoinName('room-b'), '');

	stageJoinName('room-b', 'x'.repeat(30));
	assert.equal(pendingJoinName('room-b'), 'x'.repeat(24));
	clearPendingJoinName('room-a');
	assert.equal(pendingJoinName('room-a'), '');
	assert.equal(pendingJoinName('room-b'), 'x'.repeat(24));
});
