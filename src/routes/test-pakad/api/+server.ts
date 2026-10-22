import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	newRoom,
	transition,
	projection,
	freshPakadDeck,
	type Room
} from '../../../../server/tricks/ten-pakad.mjs';
import { botPakad, type Decider } from '../../../../server/bots/tricks/bot-pakad.mjs';
import { stream, shuffle } from '../../../../server/sim/seeds.mjs';

/**
 * Development-only practice table for 10 Pakad (src/routes/test-pakad): the real engine and the real
 * bots, run on the dev server exactly as the room server runs them. The page sends actions and gets
 * back only its own seat's view, as a client of the real room does. 404 outside `vite dev`.
 */
const ME = 'you';
const connected = new Set([ME]);
type Table = {
	room: Room;
	minds: Record<string, Record<string, unknown>>;
	bots: Record<string, Decider>;
	seed: number;
	deals: number;
	draws: number;
};
const tables = new Map<string, Table>();
const ctx = (extra = {}) => ({ now: Date.now(), turnMs: 600000, connected, ...extra });

function apply(
	t: Table,
	id: string,
	action: string,
	payload: Record<string, unknown> = {},
	extra = {}
) {
	t.room = transition(t.room, id, action, payload, ctx(extra));
	for (const p of t.room.players)
		if (p.bot && !p.departed && p.seatNumber !== null)
			t.bots[p.id]?.observe(projection(t.room, p.id, connected), p.id, t.minds[p.id]);
}
function open(key: string, seed: number, cast: string[]) {
	const t: Table = {
		room: newRoom('practice-pakad', 0, ME),
		minds: {},
		bots: {},
		seed,
		deals: 0,
		draws: 0
	};
	apply(t, ME, 'join', { username: 'you' });
	apply(t, ME, 'ready', { ready: true });
	for (const c of cast) addBot(t, c);
	tables.set(key, t);
	return t;
}
function addBot(t: Table, characterId: string) {
	const botId = `bot-${characterId}-${Object.keys(t.bots).length}`;
	t.bots[botId] = botPakad(characterId);
	t.minds[botId] = {};
	apply(t, ME, 'addBot', { botId, characterId });
}
/** One bot move, if a bot is on turn: the page calls this on a timer so bots play at human pace. */
function tick(t: Table) {
	const current = t.room.players.find((p) => p.id === t.room.currentPlayerId);
	if (!t.room.isStarted || t.room.gameShow || !current?.bot) return false;
	const move = t.bots[current.id](
		projection(t.room, current.id, connected),
		current.id,
		stream(t.seed, 'practice', t.draws++).random,
		t.minds[current.id]
	);
	apply(t, current.id, move.action, move.payload);
	return true;
}

export const POST: RequestHandler = async ({ request }) => {
	if (!import.meta.env.DEV) error(404, 'Not found');
	const body = await request.json();
	const key = String(body.table ?? 'default');
	let t = tables.get(key);
	if (!t || body.event === 'reset')
		t = open(
			key,
			Number(body.seed ?? 7),
			String(body.bots ?? 'rohit-sharma,ms-dhoni,gg')
				.split(',')
				.slice(0, 3)
		);
	let message = '';
	try {
		const args = (body.args ?? []) as unknown[];
		if (body.event === 'trickAction')
			apply(t, ME, args[0] as string, args[1] as Record<string, unknown>);
		else if (body.event === 'start')
			apply(
				t,
				ME,
				'start',
				{},
				{
					deck: shuffle(freshPakadDeck(), stream(t.seed, 'deal', t.deals++).random),
					handId: `p${t.deals}`
				}
			);
		else if (body.event === 'ready') apply(t, ME, 'ready', { ready: args[0] as boolean });
		else if (body.event === 'addBot') addBot(t, args[0] as string);
		else if (body.event === 'removeBot') apply(t, ME, 'removeBot', { botId: args[0] as string });
		else if (body.event === 'tick') tick(t);
	} catch (e) {
		message = (e as Error).message;
	}
	return json({ ok: !message, error: message, view: projection(t.room, ME, connected) });
};
