/**
 * Small synthesized table sounds. No audio files: everything is generated with
 * WebAudio so it loads instantly and stays quiet enough for a long session.
 */
export type Cue = 'chip' | 'card' | 'turn' | 'tick' | 'win' | 'pack';

const storageKey = 'chaal-sound-v1';
let context: AudioContext | null = null;
let enabled = true;

try {
	enabled = localStorage.getItem(storageKey) !== 'off';
} catch {
	/* Storage can be unavailable; default to sound on. */
}

export function soundEnabled() {
	return enabled;
}

export function setSoundEnabled(value: boolean) {
	enabled = value;
	try {
		localStorage.setItem(storageKey, value ? 'on' : 'off');
	} catch {
		/* Preference is per-tab when storage is blocked. */
	}
	if (value) play('chip');
}

function audio() {
	if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
	context ??= new AudioContext();
	if (context.state === 'suspended') void context.resume();
	return context;
}

function tone(
	ctx: AudioContext,
	frequency: number,
	start: number,
	duration: number,
	gain = 0.08,
	type: OscillatorType = 'sine'
) {
	const osc = ctx.createOscillator();
	const amp = ctx.createGain();
	osc.type = type;
	osc.frequency.value = frequency;
	amp.gain.setValueAtTime(0, start);
	amp.gain.linearRampToValueAtTime(gain, start + 0.01);
	amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
	osc.connect(amp).connect(ctx.destination);
	osc.start(start);
	osc.stop(start + duration + 0.02);
}

function noise(ctx: AudioContext, start: number, duration: number, frequency: number, gain = 0.12) {
	const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
	const source = ctx.createBufferSource();
	const filter = ctx.createBiquadFilter();
	const amp = ctx.createGain();
	source.buffer = buffer;
	filter.type = 'bandpass';
	filter.frequency.value = frequency;
	filter.Q.value = 1.2;
	amp.gain.value = gain;
	source.connect(filter).connect(amp).connect(ctx.destination);
	source.start(start);
}

export function play(cue: Cue) {
	if (!enabled) return;
	const ctx = audio();
	if (!ctx) return;
	const t = ctx.currentTime + 0.01;
	switch (cue) {
		case 'chip':
			noise(ctx, t, 0.05, 3200, 0.18);
			noise(ctx, t + 0.06, 0.04, 2600, 0.12);
			break;
		case 'card':
			noise(ctx, t, 0.09, 1800, 0.1);
			break;
		case 'pack':
			noise(ctx, t, 0.16, 700, 0.08);
			break;
		case 'turn':
			tone(ctx, 660, t, 0.25, 0.06);
			tone(ctx, 990, t + 0.12, 0.35, 0.05);
			break;
		case 'tick':
			tone(ctx, 1200, t, 0.06, 0.03, 'triangle');
			break;
		case 'win':
			[523, 659, 784, 1047].forEach((f, i) => tone(ctx, f, t + i * 0.09, 0.4, 0.05, 'triangle'));
			break;
	}
}
