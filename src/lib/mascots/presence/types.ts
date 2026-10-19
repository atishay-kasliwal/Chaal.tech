/** Cosmetic contract. No RoomData, engine, cards, equity, policy or memory dependency. */
export type Point = Readonly<{ x: number; y: number }>;
export type PresenceEventType =
	| 'PLAYER_RAISED'
	| 'PLAYER_CALLED'
	| 'PLAYER_FOLDED'
	| 'BOT_TURN'
	| 'BOT_WON'
	| 'BOT_LOST'
	| 'IDLE'
	| 'NEUTRAL';
export interface PresenceEvent {
	id: string;
	type: PresenceEventType;
	actor?: string;
}
export interface Reaction {
	variations: readonly string[];
	target?: Point;
	attentionScale?: number;
	roll: number;
	lean: number;
	brow: number;
	mouth: number; // -1 composed closed lips, 0 original, +1 gentle closed-lip smile
}
export interface IdleReaction extends Reaction {
	target: Point;
}
export interface Personality {
	id: string;
	noticeMs: readonly [number, number];
	eyeMs: readonly [number, number];
	headLagMs: readonly [number, number];
	headMs: readonly [number, number];
	mouthLagMs: readonly [number, number];
	mouthMs: readonly [number, number];
	holdMs: readonly [number, number];
	returnMs: readonly [number, number];
	blinkGapMs: readonly [number, number];
	blinkDurationMs: readonly [number, number];
	doubleBlinkChance: number;
	idleGapMs: readonly [number, number];
	breathPeriodMs: readonly [number, number];
	headDegrees: number;
	portraitTravel: number;
	breathScale: number;
	nodStrength: number;
	browStrength: number;
	mouthStrength: number;
	reactions: Readonly<Record<Exclude<PresenceEventType, 'IDLE'>, Readonly<Reaction>>>;
	idles: readonly Readonly<IdleReaction>[];
}
export type Phase = 'still' | 'notice' | 'eyes' | 'head' | 'hold' | 'return';
export interface MotionChannels {
	eyes: Point;
	head: Point;
	roll: number;
	brow: number;
	lean: number;
	blink: number;
	breath: number;
	mouth: number;
}
export interface PresenceFrame extends MotionChannels {
	phase: Phase;
	event: PresenceEventType;
	variation: string;
	blinks: number;
	interrupted: number;
}
export interface AnimationCommand {
	event: PresenceEvent;
	variation: string;
	target: Point;
	from: MotionChannels;
	at: number;
	eyesAt: number;
	headAt: number;
	eyeMs: number;
	headMs: number;
	mouthAt: number;
	mouthMs: number;
	holdUntil: number;
	returnMs: number;
	roll: number;
	lean: number;
	brow: number;
	mouth: number;
}

/** All textures share an aligned square canvas. Faces must be clean under moving features.
 * Artist-supplied neutral sclera/pupils and lids use full-canvas transparent textures; eye
 * bounds mask lid travel. A flat portrait is never represented as a completed facial rig. */
export interface RigEye {
	bounds: readonly [number, number, number, number]; // x,y,width,height in 0..1 canvas space
	sclera: string;
	pupil: string;
	upperLid: string;
	lowerLid: string;
	pupilTravel: Point;
	upperTravel: number;
	lowerTravel: number;
}
export interface RigAssets {
	version: 1;
	id: string;
	body: string;
	neck: string;
	head: string;
	hairBack?: string;
	hairFront?: string;
	mouth: string;
	browLeft: string;
	browRight: string;
	eyes: { left: RigEye; right: RigEye };
}
