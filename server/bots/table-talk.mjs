/**
 * Table talk (Phase 6, docs/archive/BOT_BRAIN.md §20): the five characters say a short line at a
 * notable moment. A presentation event only: it is worked out after a commit, from the committed
 * snapshots, and broadcast beside the room view. It never touches the room, the hand commit, the
 * recorder, the revision or any bot decision, and nothing reads it back.
 *
 * Privacy (approval A6). `publicFacts` is the only reader of a room here and it never reads a card:
 * a line depends on public play (who won what, who was blind, who raised) and, once a hand is over,
 * on the cues the bot's mind emitted for that hand (server/bots/mind.mjs). Mid-hand there is one
 * moment, BLIND_RAISE: the bot raised while still blind, so it has not even seen its own cards.
 *
 * Rarity. At most one line per moment (one speaker), at most one line per bot per hand, a gap
 * between any two lines at the table and a longer gap per bot, and each moment speaks only by
 * chance (rarer moments more often). Most hands pass in silence.
 */
import { TALK_LINES } from '../../shared/talk-lines.mjs';
import { castMember } from '../../src/lib/bots/cast.js';

/** Minimum gap between any two lines at a table. */
export const TABLE_GAP_MS = 9000;
/** Minimum gap between two lines from the same character. */
export const BOT_GAP_MS = 30000;
/** How long the bubble stays up (the client fades it out after this). */
export const HOLD_MS = 3600;
/** A hand-end line waits a moment so the result lands first. */
export const RESULT_DELAY_MS = 900;

/** Strongest moment first: a speaker says its best moment of the hand. */
export const PRIORITY = Object.freeze([
	'REVENGE_SUCCESS',
	'CAUGHT_THEIR_BLUFF',
	'GOT_BLUFFED',
	'CAUGHT_BLUFFING',
	'BLUFF_THROUGH',
	'BLIND_WIN',
	'BIG_WIN',
	'BIG_LOSS',
	'RIVAL_ON_STREAK',
	'BLIND_RAISE',
	'WIN'
]);

/** Chance a moment gets a line at all. Earned moments talk more; an ordinary win rarely does. */
export const CHANCE = Object.freeze({
	REVENGE_SUCCESS: 0.25,
	CAUGHT_THEIR_BLUFF: 0.35,
	GOT_BLUFFED: 0.45,
	CAUGHT_BLUFFING: 0.4,
	BLUFF_THROUGH: 0.25,
	BLIND_WIN: 0.25,
	BIG_WIN: 0.2,
	BIG_LOSS: 0.3,
	RIVAL_ON_STREAK: 0.2,
	BLIND_RAISE: 0.04,
	WIN: 0.1
});

/** Cues from the mind that a line may use (the rest of mind.CUES are all here too). */
const MIND_TALK = new Set(PRIORITY);
/** A pot this many boots or more is big, for a bot without a mind to say so. */
const BIG_POT_BOOTS = 20;
const TRICKS = new Set(['three-two-five', 'ten-pakad', 'twenty-nine']);

export const emptyTalk = () => ({ lastAt: -Infinity, bots: {} });

/** The character a seat plays, or null for a person or a practice bot without one. */
export function characterOf(player) {
	const id = player?.bot?.characterId ?? player?.bot?.style?.botId ?? player?.bot?.botId ?? null;
	return castMember(id) ? id : null;
}

/**
 * Everything talk may know about a room: public play only. Cards are never read, so two rooms that
 * differ only in hidden cards give the same facts (tests/server/table-talk.test.mjs).
 */
export function publicFacts(room) {
	if (!room) return null;
	const r = room.result;
	return {
		name: room.name,
		gameType: room.gameType ?? 'teen-patti',
		handId: room.handId ?? null,
		boot: Math.max(room.boot ?? 1, 1),
		maxStake: room.maxStake ?? 0,
		playing: !!room.isStarted && !room.gameShow,
		players: (room.players ?? [])
			.filter((p) => !p.departed && p.seatNumber !== null && p.seatNumber !== undefined)
			.map((p) => ({
				id: p.id,
				name: p.username,
				seat: p.seatNumber,
				character: characterOf(p),
				isBlind: !!p.isBlind,
				isPacked: !!p.isPacked,
				handBet: p.handBet ?? 0
			})),
		result: r
			? {
					handId: r.handId ?? null,
					reason: r.reason ?? null,
					amount: r.amount ?? 0,
					winners: r.winners ? r.winners.map((w) => w.id) : r.winnerId ? [r.winnerId] : [],
					// Trick games: the public score of the hand.
					diffs: r.diffs ?? null,
					winnerTeam: r.winnerTeam ?? null,
					kot: r.kot ?? null,
					bidderId: r.bidderId ?? null,
					made: r.made ?? null,
					gameOver: r.gameOver ?? null
				}
			: null
	};
}

/** The hand that just ended between two commits, or null. */
function endedHand(before, after) {
	const r = after?.result;
	if (!r || !r.handId || r.handId !== after.handId) return null;
	if (before?.result?.handId === r.handId) return null;
	if (/abandon|annulled/.test(r.reason ?? '') || r.winners.includes('none')) return null;
	return r.handId;
}

/** Public moments for one character at the end of a trick hand. */
function trickCues(facts, me) {
	const r = facts.result;
	const cues = [];
	if (facts.gameType === 'three-two-five') {
		const diff = r.diffs?.[me.id];
		if (diff === undefined || diff === null) return cues;
		if (diff >= 2) cues.push({ cue: 'BIG_WIN' });
		else if (r.winners.includes(me.id) && diff > 0) cues.push({ cue: 'WIN' });
		if (diff <= -2) cues.push({ cue: 'BIG_LOSS', who: r.winners.find((id) => id !== me.id) });
		return cues;
	}
	if (r.winnerTeam === null || r.winnerTeam === undefined) return cues;
	const won = me.seat % 2 === r.winnerTeam;
	const big =
		facts.gameType === 'ten-pakad'
			? !!r.kot
			: r.gameOver !== null || (r.bidderId === me.id && r.made !== null);
	const other = facts.players.find((p) => p.seat % 2 === r.winnerTeam && p.id !== me.id);
	if (won) cues.push({ cue: big ? 'BIG_WIN' : 'WIN' });
	else if (big) cues.push({ cue: 'BIG_LOSS', who: other?.id });
	return cues;
}

/** Public moments for one character at the end of a Teen Patti hand, plus its mind's cues. */
function teenPattiCues(facts, me, mind) {
	const r = facts.result;
	const cues = (mind?.cues ?? [])
		.filter((c) => c.hand === r.handId && MIND_TALK.has(c.cue))
		.map((c) => ({ cue: c.cue, who: c.who }));
	if (r.winners.includes(me.id)) {
		// A character without a mind still knows what everyone saw: a big pot, a blind win.
		if (r.amount >= BIG_POT_BOOTS * facts.boot) cues.push({ cue: 'BIG_WIN' });
		if (me.isBlind) cues.push({ cue: 'BLIND_WIN' });
		cues.push({ cue: 'WIN' });
	}
	return cues;
}

/** Candidates for this commit: [{ id, character, cue, who }], best moment per character. */
function moments(before, after, { actorId, minds }) {
	const handId = endedHand(before, after);
	const out = [];
	if (handId) {
		for (const me of after.players) {
			if (!me.character) continue;
			const cues = TRICKS.has(after.gameType)
				? trickCues(after, me)
				: after.gameType === 'teen-patti'
					? teenPattiCues(after, me, minds?.[me.id])
					: [];
			const best = cues
				.filter((c) => TALK_LINES[me.character]?.[c.cue]?.length)
				.sort((a, b) => PRIORITY.indexOf(a.cue) - PRIORITY.indexOf(b.cue))[0];
			if (best) out.push({ id: me.id, character: me.character, handId, ...best });
		}
		return out;
	}
	// Mid-hand, Teen Patti only: the bot that just acted raised while still blind.
	if (after.gameType !== 'teen-patti' || !after.playing || !before?.playing) return out;
	if (before.handId !== after.handId) return out;
	const was = before.players.find((p) => p.id === actorId);
	const now = after.players.find((p) => p.id === actorId);
	if (!was?.character || !now) return out;
	if (was.isBlind && now.isBlind && now.handBet > was.handBet && after.maxStake > before.maxStake)
		out.push({ id: now.id, character: now.character, handId: after.handId, cue: 'BLIND_RAISE' });
	return out;
}

/**
 * The line (if any) for one commit. Pure apart from `random`: the same talk state, snapshots, minds,
 * time and draws give the same answer. Returns `{ talk, state }`; `talk` is null most of the time.
 * `chance` overrides every moment's chance (tests and the browser check use 1).
 */
export function tableTalk(
	state,
	beforeRoom,
	afterRoom,
	{ actorId = null, minds = null, now = Date.now(), random = Math.random, chance = null } = {}
) {
	const talkState = state ?? emptyTalk();
	const before = publicFacts(beforeRoom);
	const after = publicFacts(afterRoom);
	if (!after) return { talk: null, state: talkState };
	if (now - talkState.lastAt < TABLE_GAP_MS) return { talk: null, state: talkState };
	const ready = moments(before, after, { actorId, minds }).filter((m) => {
		const mine = talkState.bots[m.id];
		return !mine || (mine.handId !== m.handId && now - mine.at >= BOT_GAP_MS);
	});
	if (!ready.length) return { talk: null, state: talkState };
	// One speaker: the strongest moment, ties broken by a draw.
	const top = Math.min(...ready.map((m) => PRIORITY.indexOf(m.cue)));
	const tied = ready.filter((m) => PRIORITY.indexOf(m.cue) === top);
	const speaker = tied[Math.floor(random() * tied.length)];
	if (random() >= (chance ?? CHANCE[speaker.cue])) return { talk: null, state: talkState };
	const who = after.players.find((p) => p.id === speaker.who && p.id !== speaker.id);
	const recent = talkState.bots[speaker.id]?.recent ?? [];
	const lines = TALK_LINES[speaker.character][speaker.cue].filter(
		(line) => (who || !line.includes('{name}')) && !recent.includes(line)
	);
	if (!lines.length) return { talk: null, state: talkState };
	const line = lines[Math.floor(random() * lines.length)];
	const hand = speaker.cue !== 'BLIND_RAISE';
	return {
		talk: {
			roomName: after.name,
			playerId: speaker.id,
			botId: speaker.character,
			handId: speaker.handId,
			cue: speaker.cue,
			text: line.replaceAll('{name}', who?.name ?? ''),
			delayMs: hand ? RESULT_DELAY_MS : 0,
			holdMs: HOLD_MS
		},
		state: {
			lastAt: now,
			bots: {
				...talkState.bots,
				[speaker.id]: { at: now, handId: speaker.handId, recent: [...recent, line].slice(-4) }
			}
		}
	};
}

/** The deployment's chance override: BOT_TALK_CHANCE=0 silences talk, 1 makes every moment talk. */
export function talkChance(env) {
	const value = Number(env?.BOT_TALK_CHANCE);
	return env?.BOT_TALK_CHANCE !== undefined && Number.isFinite(value) && value >= 0 && value <= 1
		? value
		: null;
}
