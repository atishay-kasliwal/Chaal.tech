/** Pure cosmetic behavior -> animation commands -> continuous channels. No game state reads. */
import type {
	AnimationCommand,
	MotionChannels,
	Personality,
	Point,
	PresenceEvent,
	PresenceFrame
} from './types.js';
import { publicEvent } from './public-events.ts';
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = (n: number) => {
	const p = clamp(n);
	return p * p * p * (p * (p * 6 - 15) + 10);
};
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const point = (p: Point): Point => ({
	x: clamp(Number.isFinite(p.x) ? p.x : 0, -1, 1),
	y: clamp(Number.isFinite(p.y) ? p.y : 0, -1, 1)
});
const neutral = (): MotionChannels => ({
	eyes: { x: 0, y: 0 },
	head: { x: 0, y: 0 },
	roll: 0,
	brow: 0,
	lean: 0,
	blink: 0,
	breath: 0
});

export function seededCosmetics(seed: number) {
	let n = seed >>> 0;
	return () => {
		n = (n + 0x6d2b79f5) >>> 0;
		let t = Math.imul(n ^ (n >>> 15), n | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
/** Each rendered instance gets a separate random stream. Never use gameplay random sources. */
export function instanceRandom() {
	return seededCosmetics(crypto.getRandomValues(new Uint32Array(1))[0]);
}

export class PresenceDirector {
	readonly personality: Readonly<Personality>;
	command: AnimationCommand | null = null;
	private random: () => number;
	private seen: string[] = [];
	private nextIdle: number;
	private nextBlink: number;
	private blinkStart: number | null = null;
	private blinkMs = 160;
	private doubleBlink = false;
	private breathPhase: number;
	private breathPeriod: number;
	private blinkCount = 0;
	private interruptions = 0;
	private idleVariation = -1;
	private lastEvent: PresenceEvent['type'] = 'NEUTRAL';
	constructor(personality: Readonly<Personality>, random: () => number, now = 0) {
		this.personality = personality;
		this.random = random;
		this.nextIdle = now + this.range(personality.idleGapMs);
		this.nextBlink = now + this.range(personality.blinkGapMs);
		this.breathPhase = random() * Math.PI * 2;
		this.breathPeriod = this.range(personality.breathPeriodMs);
	}
	private range(r: readonly [number, number]) {
		return r[0] + (r[1] - r[0]) * this.random();
	}
	private choose<T>(choices: readonly T[]) {
		return choices[Math.floor(this.random() * choices.length)];
	}

	dispatch(raw: unknown, attention: Point, now: number) {
		const event = publicEvent(raw);
		if (!event || this.seen.includes(event.id)) return null;
		this.seen = [...this.seen, event.id].slice(-64);
		// Ambient idle never interrupts a table reaction.
		if (
			event.type === 'IDLE' &&
			this.command &&
			now < this.command.holdUntil + this.command.returnMs
		)
			return null;
		const current = this.sample(now);
		if (this.command && current.phase !== 'still') this.interruptions++;
		const p = this.personality;
		const eyesAt = now + this.range(p.noticeMs);
		const headAt = eyesAt + this.range(p.headLagMs);
		const headMs = this.range(p.headMs),
			eyeMs = this.range(p.eyeMs);
		const intensity = this.range([0.82, 1.08]);
		let target = point(attention),
			roll = 0,
			lean = 0,
			brow = 0,
			variation = 'attend';
		switch (event.type) {
			case 'PLAYER_RAISED':
				variation = this.choose(['notice', 'consider']);
				brow = 0.55;
				lean = 0.18;
				break;
			case 'PLAYER_CALLED':
				variation = 'acknowledge';
				target = { x: target.x * 0.65, y: target.y * 0.65 };
				lean = 0.08;
				break;
			case 'PLAYER_FOLDED':
				variation = 'release';
				lean = -0.08;
				break;
			case 'BOT_TURN':
				variation = 'settle-in';
				target = { x: 0, y: 0.45 };
				lean = 0.28;
				brow = 0.18;
				break;
			case 'BOT_WON':
				variation = this.choose(['quiet-nod', 'small-lift']);
				target = { x: 0, y: 0.12 };
				roll = 0.24;
				lean = 0.12;
				brow = 0.35;
				break;
			case 'BOT_LOST':
				variation = this.choose(['exhale', 'accept']);
				target = { x: 0.12, y: 0.28 };
				roll = -0.24;
				lean = -0.2;
				brow = -0.28;
				break;
			case 'IDLE': {
				// Pick a different variation from the previous idle; stillness dominates the schedule.
				this.idleVariation = (this.idleVariation + 1 + Math.floor(this.random() * 3)) % 4;
				variation = ['pot-glance', 'small-tilt', 'settle', 'look-away'][this.idleVariation];
				target = [
					{ x: 0, y: 0.23 },
					{ x: 0.2, y: 0 },
					{ x: 0, y: 0.08 },
					{ x: -0.26, y: -0.06 }
				][this.idleVariation];
				roll = this.idleVariation === 1 ? 0.3 : 0;
				lean = this.idleVariation === 2 ? -0.15 : 0;
				break;
			}
			case 'NEUTRAL':
				target = { x: 0, y: 0 };
				variation = 'neutral';
				break;
		}
		const from: MotionChannels = {
			eyes: current.eyes,
			head: current.head,
			roll: current.roll,
			brow: current.brow,
			lean: current.lean,
			blink: 0,
			breath: 0
		};
		this.command = {
			event,
			variation,
			target,
			from,
			at: now,
			eyesAt: event.type === 'NEUTRAL' ? now : eyesAt,
			headAt: event.type === 'NEUTRAL' ? now : headAt,
			eyeMs,
			headMs,
			holdUntil: headAt + headMs + this.range(p.holdMs),
			returnMs: this.range(p.returnMs),
			roll: roll * intensity,
			lean: lean * intensity,
			brow: brow * p.browStrength * intensity
		};
		if (event.type === 'NEUTRAL') {
			this.command.eyeMs = this.command.returnMs;
			this.command.headMs = this.command.returnMs;
			this.command.holdUntil = now + this.command.returnMs;
		}
		this.lastEvent = event.type;
		return structuredClone(this.command);
	}

	/** Stop active choreography on pause/offscreen; resume from neutral with fresh schedules. */
	reset(now: number) {
		this.command = null;
		this.lastEvent = 'NEUTRAL';
		this.blinkStart = null;
		this.nextBlink = now + this.range(this.personality.blinkGapMs);
		this.nextIdle = now + this.range(this.personality.idleGapMs);
	}
	private sample(now: number): PresenceFrame {
		const out: PresenceFrame = {
			...neutral(),
			phase: 'still',
			event: this.lastEvent,
			variation: 'rest',
			blinks: this.blinkCount,
			interrupted: this.interruptions
		};
		const c = this.command;
		if (!c) return out;
		out.variation = c.variation;
		const eye = ease((now - c.eyesAt) / c.eyeMs),
			head = ease((now - c.headAt) / c.headMs);
		const returning = now > c.holdUntil ? 1 - ease((now - c.holdUntil) / c.returnMs) : 1;
		out.eyes = {
			x: blend(c.from.eyes.x, c.target.x, eye) * returning,
			y: blend(c.from.eyes.y, c.target.y, eye) * returning
		};
		out.head = {
			x: blend(c.from.head.x, c.target.x * 0.65, head) * returning,
			y: blend(c.from.head.y, c.target.y * 0.5, head) * returning
		};
		// A visible, one-shot portrait nod. Returns to zero before the hold ends;
		// no face deformation or hidden-card-driven expression is implied.
		const gesture = clamp((now - c.headAt) / (c.headMs * 1.8));
		const pulse = Math.sin(Math.PI * gesture) ** 2;
		const nod =
			c.event.type === 'BOT_WON'
				? c.variation === 'small-lift'
					? -0.65
					: 1
				: c.event.type === 'BOT_TURN'
					? 0.7
					: c.event.type === 'BOT_LOST'
						? 0.55
						: 0;
		out.head = {
			...out.head,
			y: out.head.y + pulse * nod * this.personality.nodStrength * returning
		};
		out.roll = blend(c.from.roll, c.roll, head) * returning;
		out.lean = blend(c.from.lean, c.lean, head) * returning;
		out.brow = blend(c.from.brow, c.brow, head) * returning;
		out.phase =
			returning === 0
				? 'still'
				: now < c.eyesAt
					? 'notice'
					: now < c.headAt
						? 'eyes'
						: now < c.headAt + c.headMs
							? 'head'
							: now < c.holdUntil
								? 'hold'
								: 'return';
		return out;
	}
	frame(now: number): PresenceFrame {
		if (this.command && now >= this.command.holdUntil + this.command.returnMs) {
			this.command = null;
			this.nextIdle = now + this.range(this.personality.idleGapMs);
		}
		if (!this.command && now >= this.nextIdle)
			this.dispatch({ id: `idle:${now}`, type: 'IDLE' }, { x: 0, y: 0 }, now);
		if (this.blinkStart === null && now >= this.nextBlink) {
			this.blinkStart = now;
			this.blinkMs = this.range(this.personality.blinkDurationMs);
			this.blinkCount++;
		}
		const out = this.sample(now);
		if (this.blinkStart !== null) {
			const t = (now - this.blinkStart) / this.blinkMs;
			out.blink = t < 0.38 ? ease(t / 0.38) : 1 - ease((t - 0.38) / 0.62);
			if (t >= 1) {
				this.blinkStart = null;
				const again = !this.doubleBlink && this.random() < 0.075;
				this.doubleBlink = again;
				this.nextBlink =
					now + (again ? this.range([180, 280]) : this.range(this.personality.blinkGapMs));
			}
		}
		out.blinks = this.blinkCount;
		out.breath =
			Math.sin(this.breathPhase + (now / this.breathPeriod) * Math.PI * 2) *
			this.personality.breathScale;
		return out;
	}
}
