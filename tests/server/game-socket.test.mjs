import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../../src/lib/stores/game-socket.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const { GameSocket } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('timed socket requests preserve create-room arguments and command metadata', async (t) => {
	const originalFetch = globalThis.fetch;
	const requests = [];
	let token;
	globalThis.fetch = async (input, init) => {
		const url = new URL(String(input));
		if (url.pathname === '/session') {
			return Response.json({ token: 'session-token', playerId: 'a13795de-14da-482d-9a15-59c6cd4c26f5' });
		}
		if (url.pathname === '/rooms') {
			requests.push(JSON.parse(init.body));
			return Response.json({ ok: true, roomName: '0123456789abcdef0123456789abcdef' });
		}
		throw new Error(`Unexpected request: ${url}`);
	};
	t.after(() => {
		globalThis.fetch = originalFetch;
	});

	const socket = new GameSocket(
		'https://game.example',
		() => token,
		(session) => {
			token = session.token;
		}
	);
	const connected = new Promise((resolve) => socket.on('connect', resolve));
	socket.connect();
	await connected;

	const args = ['', 50, 'classic-1', 'teen-patti'];
	const meta = { commandId: '7cf843fb-6685-4b61-960c-7a5168c79735' };
	const result = await socket.timeout(8000).emitWithAck('createRoom', ...args, meta);

	assert.equal(result.ok, true);
	assert.deepEqual(requests, [{ event: 'createRoom', args, meta }]);
	socket.disconnect();
});
