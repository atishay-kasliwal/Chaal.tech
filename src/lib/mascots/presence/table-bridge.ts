import { fromPublicFeed, publicEvent } from './public-events.ts';
import type { Point, PresenceEvent } from './types.js';

export interface PublicPresenceTurn {
	key: string;
	playerId: string;
}
export interface PublicPresenceGeometry {
	seats: readonly { id: string; x: number; y: number }[];
	pot: Point;
}
export interface TablePresenceView {
	feed: readonly unknown[];
	turn: PublicPresenceTurn | null;
	handKey: string | null;
	geometry: PublicPresenceGeometry;
}
export interface PublicAttention {
	event: PresenceEvent;
	attention: Point;
	at: number;
}
const valid = (v: unknown): v is string => typeof v === 'string' && /^[\w:-]{1,80}$/.test(v);
const feedId = (v: unknown) => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	const id = (v as { id?: unknown }).id;
	return typeof id === 'number' && Number.isSafeInteger(id) ? `feed:${id}` : valid(id) ? id : null;
};
const priority = (event: PresenceEvent) =>
	event.type === 'BOT_WON' || event.type === 'BOT_LOST'
		? 3
		: event.type === 'PLAYER_RAISED'
			? 2
			: 1;
const bounded = (n: number) => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);

/** Receives a deliberately small PUBLIC view, never RoomData/User/cards/policy.
 * First mount primes feed IDs so old events do not replay. A turn notice follows a
 * public player reaction after a cosmetic pause; newer results cancel that notice. */
export class TablePresenceBridge {
	private seen: string[] = [];
	private primed = false;
	private hand: string | null = null;
	private turnKey: string | null = null;
	private deliveredTurn: string | null = null;
	private pending: PublicAttention | null = null;
	private botSeatId: string;
	private random: () => number;
	private turnDelay: readonly [number, number];
	constructor(
		botSeatId: string,
		random: () => number,
		turnDelay: readonly [number, number] = [1000, 1450]
	) {
		this.botSeatId = botSeatId;
		this.random = random;
		this.turnDelay = turnDelay;
	}
	private attention(actor: string | undefined, geometry: PublicPresenceGeometry): Point {
		const from = geometry.seats.find((s) => s.id === this.botSeatId) ?? { x: 50, y: 20 };
		const to = geometry.seats.find((s) => s.id === actor) ?? geometry.pot;
		return { x: bounded((to.x - from.x) / 45), y: bounded((to.y - from.y) / 60) };
	}
	observe(view: TablePresenceView, now: number): PublicAttention[] {
		const entries = Array.isArray(view.feed) ? view.feed.slice(-64) : [];
		const fresh = entries.filter((entry) => {
			const id = feedId(entry);
			return id && !this.seen.includes(id);
		});
		this.seen = [...this.seen, ...entries.map(feedId).filter((v): v is string => !!v)].slice(-128);
		const hand = valid(view.handKey) ? view.handKey : null,
			changed = this.primed && hand !== this.hand;
		const events = this.primed ? fromPublicFeed(fresh, this.botSeatId) : [];
		this.primed = true;
		this.hand = hand;
		const key =
			view.turn && valid(view.turn.key) && valid(view.turn.playerId) ? view.turn.key : null;
		if (changed) this.deliveredTurn = null;
		if (key !== this.turnKey || changed) {
			this.turnKey = key;
			this.pending = null;
			if (key && view.turn?.playerId === this.botSeatId && key !== this.deliveredTurn) {
				const event = publicEvent({ id: `turn:${key}`, type: 'BOT_TURN' });
				if (event)
					this.pending = {
						event,
						attention: { x: 0, y: 0.45 },
						at: now + this.turnDelay[0] + (this.turnDelay[1] - this.turnDelay[0]) * this.random()
					};
			}
		}
		const latest = events.reduce<PresenceEvent | null>(
			(best, event) => (!best || priority(event) >= priority(best) ? event : best),
			null
		);
		const plans: PublicAttention[] = [];
		if (latest) {
			plans.push({
				event: latest,
				attention: this.attention(latest.actor, view.geometry),
				at: now
			});
			if (priority(latest) === 3) this.pending = null;
		} else if (changed && hand) {
			const event = publicEvent({ id: `hand:${hand}`, type: 'NEUTRAL' });
			if (event) plans.push({ event, attention: { x: 0, y: 0 }, at: now });
		}
		if (this.pending && this.turnKey !== this.deliveredTurn) plans.push(this.pending);
		return plans;
	}
	delivered(event: PresenceEvent) {
		if (this.pending?.event.id === event.id) {
			this.deliveredTurn = this.turnKey;
			this.pending = null;
		}
	}
}
