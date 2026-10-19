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
	breath: 0,
	mouth: 0
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
	private breathAt: number;
	private breathPeriod: number;
	private breathDepth: number;
	private breathRandom: () => number;
	private blinkCount = 0;
	private interruptions = 0;
	private idleVariation = -1;
	private lastEvent: PresenceEvent['type'] = 'NEUTRAL';
	constructor(personality: Readonly<Personality>, random: () => number, now = 0) {
		this.personality = personality;
		this.random = random;
		this.nextIdle = now + this.range(personality.idleGapMs);
		this.nextBlink = now + this.range(personality.blinkGapMs);
		this.breathRandom = seededCosmetics(random() * 4294967296);
		this.breathAt = now + this.breathRange([180, 1250]);
		this.breathPeriod = this.breathRange(personality.breathPeriodMs);
		this.breathDepth = this.breathRange([0.78, 1]);
	}
	private range(r: readonly [number, number]) {
		return r[0] + (r[1] - r[0]) * this.random();
	}
	private choose<T>(choices: readonly T[]) {
		return choices[Math.floor(this.random() * choices.length)];
	}
	private breathRange(r: readonly [number, number]) {
		return r[0] + (r[1] - r[0]) * this.breathRandom();
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
		const mouthAt = headAt + this.range(p.mouthLagMs);
		const headMs = this.range(p.headMs),
			eyeMs = this.range(p.eyeMs),
			mouthMs = this.range(p.mouthMs);
		const intensity = this.range([0.82, 1.08]);
		let reaction;
		if (event.type === 'IDLE') {
			const count = p.idles.length;
			if (!count) return null;
			this.idleVariation =
				(this.idleVariation + 1 + Math.floor(this.random() * Math.max(1, count - 1))) % count;
			reaction = p.idles[this.idleVariation];
		} else reaction = p.reactions[event.type];
		const attended = point(attention),
			scale = reaction.attentionScale ?? 1;
		const target = reaction.target
			? point(reaction.target)
			: point({ x: attended.x * scale, y: attended.y * scale });
		const variation = this.choose(reaction.variations);
		const from: MotionChannels = {
			eyes: current.eyes,
			head: current.head,
			roll: current.roll,
			brow: current.brow,
			lean: current.lean,
			blink: 0,
			breath: 0,
			mouth: current.mouth
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
			mouthAt: event.type === 'NEUTRAL' ? now : mouthAt,
			mouthMs,
			holdUntil: Math.max(headAt + headMs, mouthAt + mouthMs) + this.range(p.holdMs),
			returnMs: this.range(p.returnMs),
			roll: reaction.roll * intensity,
			lean: reaction.lean * intensity,
			brow: reaction.brow * p.browStrength * intensity,
			mouth: clamp(reaction.mouth * p.mouthStrength * intensity, -1, 1)
		};
		if (event.type === 'NEUTRAL') {
			this.command.eyeMs = this.command.returnMs;
			this.command.headMs = this.command.returnMs;
			this.command.mouthMs = this.command.returnMs;
			this.command.holdUntil = now + this.command.returnMs;
		}
		this.lastEvent = event.type;
		return structuredClone(this.command);
	}

	/** A local review control; independent of public attention commands and game RNG. */
	blink(now: number, durationMs = this.range(this.personality.blinkDurationMs)) {
		if (this.blinkStart !== null) return;
		this.blinkStart = now;
		this.blinkMs = clamp(durationMs, 135, 1800);
		this.blinkCount++;
	}

	/** Stop active choreography on pause/offscreen; resume from neutral with fresh schedules. */
	reset(now: number) {
		this.command = null;
		this.lastEvent = 'NEUTRAL';
		this.blinkStart = null;
		this.nextBlink = now + this.range(this.personality.blinkGapMs);
		this.nextIdle = now + this.range(this.personality.idleGapMs);
		this.breathAt = now + this.breathRange([180, 1250]);
		this.breathPeriod = this.breathRange(this.personality.breathPeriodMs);
		this.breathDepth = this.breathRange([0.78, 1]);
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
		out.mouth = blend(c.from.mouth, c.mouth, ease((now - c.mouthAt) / c.mouthMs)) * returning;
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
			this.blink(now);
		}
		const out = this.sample(now);
		if (this.blinkStart !== null) {
			const t = (now - this.blinkStart) / this.blinkMs;
			out.blink = t < 0.38 ? ease(t / 0.38) : 1 - ease((t - 0.38) / 0.62);
			if (t >= 1) {
				this.blinkStart = null;
				const again = !this.doubleBlink && this.random() < this.personality.doubleBlinkChance;
				this.doubleBlink = again;
				this.nextBlink =
					now + (again ? this.range([180, 280]) : this.range(this.personality.blinkGapMs));
			}
		}
		out.blinks = this.blinkCount;
		// Quiet inhale, slower exhale, then rest. Choose timing/depth once per cycle,
		// never per frame or in response to table events. No catch-up loop after a gap.
		if (now >= this.breathAt + this.breathPeriod) {
			this.breathAt = now;
			this.breathPeriod = this.breathRange(this.personality.breathPeriodMs);
			this.breathDepth = this.breathRange([0.78, 1]);
		}
		const breathProgress = (now - this.breathAt) / this.breathPeriod;
		const envelope =
			breathProgress < 0.36
				? ease(breathProgress / 0.36)
				: 1 - ease((breathProgress - 0.36) / 0.52);
		out.breath = envelope * this.breathDepth * this.personality.breathScale;
		return out;
	}
}
