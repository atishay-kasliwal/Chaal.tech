<script lang="ts">
	import { onMount } from 'svelte';
	import Mascot from '../Mascot.svelte';
	import { PresenceDirector, instanceRandom, seededCosmetics } from './director.js';
	import { presenceClock } from './clock.js';
	import { DHONI_ART, DHONI_PRESENCE } from './personality.js';
	import LayeredCharacter from './LayeredCharacter.svelte';
	import BlinkFace from './BlinkFace.svelte';
	import FacialEyes from './FacialEyes.svelte';
	import HeadCharacter from './HeadCharacter.svelte';
	import { blinkStage } from './blink-art.js';
	import type {
		AnimationCommand,
		Personality,
		Point,
		PresenceEvent,
		PresenceFrame,
		RigAssets
	} from './types.js';
	let {
		event = null,
		attention = { x: 0, y: 0 },
		paused = false,
		fallback = false,
		headFollow = true,
		breathing = true,
		perspective = false,
		seed,
		personality = DHONI_PRESENCE,
		rig = null,
		blinkRequest = null,
		onFrame,
		onCommand,
		onReducedMotion
	}: {
		event?: PresenceEvent | null;
		attention?: Point;
		paused?: boolean;
		fallback?: boolean;
		headFollow?: boolean;
		breathing?: boolean;
		perspective?: boolean;
		seed?: number;
		personality?: Readonly<Personality>;
		rig?: RigAssets | null;
		blinkRequest?: { id: number; durationMs: number } | null;
		onFrame?: (frame: PresenceFrame) => void;
		onCommand?: (command: AnimationCommand) => void;
		onReducedMotion?: (enabled: boolean) => void;
	} = $props();
	let root = $state<HTMLDivElement>();
	let director = $state.raw<PresenceDirector | null>(null);
	let visible = $state(false);
	let reduced = $state(false);
	let failed = $state(false);
	let eyesFailed = $state(false);
	let headFailed = $state(false);
	let eyeRenderer = $state<{ draw(frame: PresenceFrame): void }>();
	let lastBlinkRequest = 0;
	const showFallback = $derived(fallback || failed);
	onMount(() => {
		director = new PresenceDirector(
			personality,
			seed === undefined ? instanceRandom() : seededCosmetics(seed),
			presenceClock.now()
		);
		const query = matchMedia('(prefers-reduced-motion: reduce)');
		const preference = () => {
			reduced = query.matches || document.documentElement.hasAttribute('data-reduced-motion');
			onReducedMotion?.(reduced);
		};
		preference();
		query.addEventListener('change', preference);
		const observer = new IntersectionObserver((entries) => {
			visible = entries.some((e) => e.isIntersecting);
		});
		if (root) observer.observe(root);
		const attributes = new MutationObserver(preference);
		attributes.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-reduced-motion']
		});
		return () => {
			observer.disconnect();
			attributes.disconnect();
			query.removeEventListener('change', preference);
		};
	});
	$effect(() => {
		if (!root || !director) return;
		const target = root,
			engine = director,
			facial = eyeRenderer;
		engine.reset(presenceClock.now());
		const draw = (frame: PresenceFrame) => {
			facial?.draw(frame);
			target.style.setProperty('--eye-x', String(frame.eyes.x));
			target.style.setProperty('--eye-y', String(frame.eyes.y));
			target.style.setProperty(
				'--portrait-x',
				`${frame.head.x * personality.portraitTravel * 100}%`
			);
			target.style.setProperty(
				'--portrait-y',
				`${frame.head.y * personality.portraitTravel * 100 + frame.lean * 0.8}%`
			);
			target.style.setProperty(
				'--head-roll',
				`${(frame.head.x + frame.roll) * personality.headDegrees}deg`
			);
			target.style.setProperty('--breath-scale', String(1 + frame.breath));
			target.style.setProperty('--blink', String(frame.blink));
			target.dataset.blinkStage = blinkStage(frame.blink);
			target.style.setProperty('--brow', String(frame.brow));
			target.style.setProperty('--mouth', String(frame.mouth));
			target.dataset.phase = frame.phase;
			target.dataset.blinks = String(frame.blinks);
			target.dataset.event = frame.event;
		};
		let lastReport = -Infinity;
		if (paused || reduced || !visible || showFallback) {
			draw({
				eyes: { x: 0, y: 0 },
				head: { x: 0, y: 0 },
				roll: 0,
				brow: 0,
				lean: 0,
				blink: 0,
				breath: 0,
				mouth: 0,
				phase: 'still',
				event: 'NEUTRAL',
				variation: 'rest',
				blinks: 0,
				interrupted: 0
			});
			return;
		}
		return presenceClock.subscribe((now) => {
			const frame = engine.frame(now);
			draw(frame);
			if (now - lastReport >= 160) {
				onFrame?.(frame);
				lastReport = now;
			}
		});
	});
	$effect(() => {
		if (!event || !director || paused || reduced || !visible || showFallback) return;
		const command = director.dispatch(event, attention, presenceClock.now());
		if (command) onCommand?.(command);
	});
	$effect(() => {
		if (!blinkRequest || !director || paused || reduced || !visible || showFallback) return;
		if (blinkRequest.id === lastBlinkRequest) return;
		lastBlinkRequest = blinkRequest.id;
		director.blink(presenceClock.now(), blinkRequest.durationMs);
	});
</script>

<div
	class="character"
	bind:this={root}
	role="img"
	aria-label="MS Dhoni bot, {rig
		? 'layered character'
		: eyesFailed
			? 'eyelid animation preview'
			: headFollow && !headFailed
				? 'independent eyes, eyebrows and head'
				: 'independent eyes and eyebrows'}"
	data-testid="presence-character"
	data-renderer={showFallback
		? 'legacy'
		: rig
			? 'layered'
			: eyesFailed
				? 'blink-frames'
				: headFollow && !headFailed
					? 'head-parts'
					: 'facial-eyes'}
	data-motion={paused || reduced ? 'paused' : 'enabled'}
>
	{#if showFallback}<div class="legacy">
			<Mascot id={DHONI_ART.id} label="MS Dhoni" size={360} poke={false} />
		</div>
	{:else if rig}<LayeredCharacter {rig} />
	{:else if !eyesFailed && headFollow && !headFailed}
		<HeadCharacter
			bind:this={eyeRenderer}
			{personality}
			{breathing}
			{perspective}
			onerror={() => (headFailed = true)}
			onFaceError={() => (eyesFailed = true)}
		/>
	{:else if !eyesFailed}
		<FacialEyes bind:this={eyeRenderer} onerror={() => (eyesFailed = true)} />
	{:else}
		<BlinkFace onerror={() => (failed = true)} />
	{/if}
</div>

<style>
	.character {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		contain: layout style;
		isolation: isolate;
	}
	.legacy {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.legacy :global(.mascot) {
		width: 100%;
		height: 100%;
	}
</style>
