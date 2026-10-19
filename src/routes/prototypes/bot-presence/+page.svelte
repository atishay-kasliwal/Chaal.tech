<script lang="ts">
	import { onMount } from 'svelte';
	import PresenceCharacter from '#lib/mascots/presence/PresenceCharacter.svelte';
	import { presenceClock } from '#lib/mascots/presence/clock.js';
	import { fromPublicFeed, publicEvent } from '#lib/mascots/presence/public-events.js';
	import { DHONI_ART, DHONI_PRESENCE } from '#lib/mascots/presence/personality.js';
	import type {
		AnimationCommand,
		PresenceEvent,
		PresenceEventType,
		PresenceFrame,
		Point
	} from '#lib/mascots/presence/types.js';
	let event = $state<PresenceEvent | null>(null);
	let actor = $state('guddu');
	let reducedMotion = $state(false);
	let headFollow = $state(true);
	let perspective = $state(true);
	let breathing = $state(true);
	let previewStarted = false;
	let attention = $state<Point>({ x: 0, y: 0 });
	let frame = $state<PresenceFrame | null>(null);
	let command = $state<AnimationCommand | null>(null);
	let blinkRequest = $state<{ id: number; durationMs: number } | null>(null);
	let blinkSerial = 0;
	let paused = $state(false),
		fallback = $state(false),
		stress = $state(false),
		playing = $state(false);
	let stats = $state(presenceClock.stats());
	let serial = 0,
		hand = 0;
	let timers: ReturnType<typeof setTimeout>[] = [];
	let log = $state<{ id: string; type: PresenceEventType; label: string }[]>([]);
	const labels: Record<PresenceEventType, string> = {
		PLAYER_RAISED: 'Guddu raises',
		PLAYER_CALLED: 'A player calls',
		PLAYER_FOLDED: 'A player packs',
		BOT_TURN: 'Dhoni’s turn',
		BOT_WON: 'Dhoni wins',
		BOT_LOST: 'Dhoni loses',
		IDLE: 'A moment between hands',
		NEUTRAL: 'Back to the table'
	};
	const phases = {
		still: 'At ease',
		notice: 'Noticing',
		eyes: 'Gaze leads',
		head: 'Head follows',
		hold: 'Holding attention',
		return: 'Settling back'
	};
	const buttons: { label: string; type: PresenceEventType; kind?: string }[] = [
		{ label: 'Raise', type: 'PLAYER_RAISED', kind: 'raise' },
		{ label: 'Call', type: 'PLAYER_CALLED', kind: 'chaal' },
		{ label: 'Pack', type: 'PLAYER_FOLDED', kind: 'pack' },
		{ label: 'Bot’s turn', type: 'BOT_TURN' },
		{ label: 'Win', type: 'BOT_WON', kind: 'win' },
		{ label: 'Lose', type: 'BOT_LOST', kind: 'win' },
		{ label: 'Idle', type: 'IDLE' },
		{ label: 'Neutral', type: 'NEUTRAL' }
	];
	function stopHand() {
		previewStarted = true;
		timers.forEach(clearTimeout);
		timers = [];
		playing = false;
	}
	function emit(type: PresenceEventType, kind?: string) {
		const id = ++serial;
		const dto = kind
			? fromPublicFeed(
					[
						{
							id,
							kind,
							playerId: type === 'BOT_WON' ? 'dhoni' : actor,
							text: 'Ignored public narration'
						}
					],
					'dhoni'
				)[0]
			: publicEvent({ id: `demo:${id}`, type });
		if (!dto) return;
		attention =
			dto.actor === 'you'
				? { x: -0.85, y: -0.16 }
				: dto.actor === 'guddu'
					? { x: 0.85, y: -0.16 }
					: { x: 0, y: 0.3 };
		event = dto;
		log = [
			{
				id: dto.id,
				type: dto.type,
				label:
					dto.type === 'PLAYER_RAISED'
						? `${actor === 'you' ? 'You raise' : 'Guddu raises'}`
						: labels[dto.type]
			},
			...log
		].slice(0, 8);
	}
	function playHand() {
		stopHand();
		paused = false;
		fallback = false;
		playing = true;
		hand++;
		const beats: [number, () => void][] = [
			[0, () => emit('NEUTRAL')],
			[1200, () => emit('PLAYER_CALLED', 'chaal')],
			[4300, () => emit('PLAYER_RAISED', 'raise')],
			[7500, () => emit('BOT_TURN')],
			[10600, () => emit('PLAYER_FOLDED', 'pack')],
			[14200, () => emit(hand % 2 ? 'BOT_WON' : 'BOT_LOST', 'win')],
			[19300, () => emit('NEUTRAL')],
			[22000, () => (playing = false)]
		];
		for (const [at, fn] of beats) timers.push(setTimeout(fn, at));
	}
	function watchGlance() {
		stopHand();
		paused = false;
		fallback = false;
		actor = 'guddu';
		emit('PLAYER_RAISED', 'raise');
	}
	function report(f: PresenceFrame) {
		frame = f;
		// Show one real blink on arrival; ordinary randomized blinks continue afterwards.
		if (!previewStarted) {
			previewStarted = true;
			timers.push(setTimeout(() => blinkOnce(), 800));
		}
	}
	function blinkOnce(
		durationMs = (DHONI_PRESENCE.blinkDurationMs[0] + DHONI_PRESENCE.blinkDurationMs[1]) / 2
	) {
		stopHand();
		blinkRequest = { id: ++blinkSerial, durationMs };
	}
	function motionPreference(enabled: boolean) {
		reducedMotion = enabled;
	}
	function planned(c: AnimationCommand) {
		command = c;
	}
	onMount(() => {
		const tick = setInterval(() => (stats = presenceClock.stats()), 1000);
		return () => {
			clearInterval(tick);
			stopHand();
		};
	});
</script>

<svelte:head
	><title>Dhoni · Bot presence study · Chaal</title><meta
		name="robots"
		content="noindex, nofollow"
	/></svelte:head
>

<div class="study">
	<header>
		<div>
			<p class="eyebrow">CHAAL / MOTION STUDIES / 01</p>
			<h1>Eyes that <em>notice.</em></h1>
			<p class="intro">A glance first. A small reaction. A quiet breath between moments.</p>
		</div>
		<span class="local"><span></span> DHONI PREVIEW</span>
	</header>
	<div class="study-grid">
		<section class="stage" aria-label="Dhoni motion preview">
			<div class="stage-heading">
				<span class="eyebrow">THE CALM ONE</span><span class="phase" data-testid="phase"
					>{paused
						? 'Paused'
						: reducedMotion
							? 'Reduced motion enabled'
							: fallback
								? 'Original mascot'
								: phases[frame?.phase ?? 'still']}</span
				>
			</div>
			<div class="scene">
				<div class="halo"></div>
				<div class="table-line"></div>
				<button
					class="other-seat left"
					class:chosen={actor === 'you'}
					onclick={() => (actor = 'you')}
					aria-pressed={actor === 'you'}><span>Y</span>You</button
				>
				<button
					class="other-seat right"
					class:chosen={actor === 'guddu'}
					onclick={() => (actor = 'guddu')}
					aria-pressed={actor === 'guddu'}><span>G</span>Guddu</button
				>
				<div class="portrait-wrap">
					<PresenceCharacter
						{event}
						{attention}
						{paused}
						{fallback}
						{headFollow}
						{perspective}
						{breathing}
						{blinkRequest}
						onFrame={report}
						onCommand={planned}
						onReducedMotion={motionPreference}
					/>
				</div>
				<div class="identity">
					<span class="tiny-bot">BOT</span>
					<h2>{DHONI_ART.name}</h2>
					<p>Unhurried. Attentive. Hard to rattle.</p>
				</div>
			</div>
			<div class="public-moment" aria-live="polite">
				<span class="moment-mark">♠</span><span
					>{log[0]?.label ?? 'Nothing to rush. Waiting for the table.'}</span
				>
			</div>
			<div class="stage-controls">
				<button
					class="quiet"
					aria-pressed={perspective}
					disabled={!headFollow || fallback}
					onclick={() => (perspective = !perspective)}
					>{perspective ? 'Compare flat head' : 'Enable depth turn'}</button
				>
				<button
					class="quiet"
					aria-pressed={!breathing}
					disabled={!headFollow || fallback || paused || reducedMotion}
					onclick={() => (breathing = !breathing)}
					>{breathing ? 'Compare still body' : 'Enable breathing'}</button
				>
				<button
					class="quiet"
					aria-pressed={!headFollow}
					onclick={() => {
						stopHand();
						headFollow = !headFollow;
					}}>{headFollow ? 'Compare face only' : 'Enable head follow'}</button
				>
				<button class="gold" disabled={reducedMotion} onclick={watchGlance}>Watch a glance</button>
				<button
					class="gold"
					disabled={paused || fallback || reducedMotion}
					onclick={() => blinkOnce()}>Blink now</button
				>
				<button
					class="quiet"
					disabled={paused || fallback || reducedMotion}
					onclick={() => blinkOnce(1600)}>Slow blink</button
				>
				<button class="gold" onclick={playHand}
					>{playing ? 'Restart hand' : 'Play a hand'} <span aria-hidden="true">↗</span></button
				><button
					class="quiet"
					onclick={() => {
						stopHand();
						paused = !paused;
					}}>{paused ? 'Resume' : 'Pause movement'}</button
				><button
					class="quiet"
					aria-pressed={fallback}
					onclick={() => {
						stopHand();
						fallback = !fallback;
					}}>Compare original</button
				>
			</div>
			{#if reducedMotion}<p class="motion-off" role="status">
					Your device has Reduce Motion enabled. This preview respects that setting.
				</p>{/if}
			<label class="mobile-events"
				>Table moment
				<select
					aria-label="Trigger public event"
					value=""
					disabled={paused || fallback}
					onchange={(e) => {
						const b = buttons.find((b) => b.type === e.currentTarget.value);
						if (b) {
							stopHand();
							emit(b.type, b.kind);
						}
					}}
					><option value="" disabled>Choose a reaction</option>{#each buttons as b (b.type)}<option
							value={b.type}>{b.label}</option
						>{/each}</select
				>
			</label>
			<p class="stage-note">
				Independent eyes, brows, head and mouth. Slow blinks. Barely visible breathing.
			</p>
		</section>
		<aside class="director">
			<p class="eyebrow">BEHAVIOR, THEN MOVEMENT</p>
			<h2>The face moves.<br /><em> The portrait stays.</em></h2>
			<p class="explainer">
				Watch a glance, or choose a player and trigger a raise. His eyes move first, his head
				follows with a restrained turn, then his attention returns quietly to the table.
			</p>
			<div class="event-controls" aria-label="Public table events">
				{#each buttons as b (b.type)}<button
						class:current={event?.type === b.type}
						disabled={paused || fallback}
						onclick={() => {
							stopHand();
							emit(b.type, b.kind);
						}}>{b.label}</button
					>{/each}
			</div>
			<div class="channels">
				<div class="channel-label">
					<h3>Animation channels</h3>
					<span>LIVE INTENT</span>
				</div>
				<div class="channel">
					<div><span>Eye gaze</span><small>Visible</small></div>
					<div class="gaze-meter" aria-hidden="true">
						<i style:left="{50 + (frame?.eyes.x ?? 0) * 42}%"></i>
					</div>
				</div>
				<div class="channel">
					<div><span>Head follow</span><small>Visible</small></div>
					<div class="gaze-meter" aria-hidden="true">
						<i style:left="{50 + (frame?.head.x ?? 0) * 42}%"></i>
					</div>
				</div>
				<div class="channel">
					<div><span>Eyelids</span><small>Visible</small></div>
					<div class="blink-meter" aria-hidden="true">
						<i style:width="{(frame?.blink ?? 0) * 100}%"></i>
					</div>
				</div>
				<div class="channel">
					<div>
						<span>Body breathing</span><small>{breathing && headFollow ? 'Subtle' : 'Off'}</small>
					</div>
					<div class="blink-meter" aria-hidden="true">
						<i
							style:width="{breathing && headFollow
								? ((frame?.breath ?? 0) / DHONI_PRESENCE.breathScale) * 100
								: 0}%"
						></i>
					</div>
				</div>
				<div class="channel">
					<div>
						<span>Mouth</span><small
							>{(frame?.mouth ?? 0) > 0.08
								? 'Soft smile'
								: (frame?.mouth ?? 0) < -0.08
									? 'Composed'
									: 'At ease'}</small
						>
					</div>
					<div class="gaze-meter" aria-hidden="true">
						<i style:left="{50 + (frame?.mouth ?? 0) * 42}%"></i>
					</div>
				</div>
			</div>
			<p class="timing" data-testid="gaze-timing">
				{command
					? `Gaze command leads the head command by ${Math.round(command.headAt - command.eyesAt)} ms.`
					: 'Eyes and head have separate motion channels.'}
			</p>
			<div class="honest-note">
				<span>ARTWORK CHECK</span>
				<p>
					The approved head and face move together over a clean neck underpainting. Only the shirt
					and shoulders expand slightly with breathing; the head does not bob. Mouth expressions
					blend two painted closed-lip poses. The depth mesh turns the painted face within a small
					range. Full side profiles still need additional artwork.
				</p>
			</div>
			<details class="ledger">
				<summary>Public event log <span>{log.length}</span></summary
				>{#each log as entry (entry.id)}<div>
						<span>{entry.label}</span><code>{entry.type}</code>
					</div>{/each}
				<p>
					No cards, hand strength, private decisions or learned player models enter this animation.
				</p>
			</details>
		</aside>
	</div>
	<section class="lower">
		<div>
			<p class="eyebrow">A REUSABLE DIRECTOR</p>
			<h2>One personality.<br />Independent rhythms.</h2>
			<p>
				Random blink spacing, quiet breaths and a pause after each exhale. Each copy keeps its own
				rhythm.
			</p>
			<p class="fine">
				{DHONI_PRESENCE.id} · Gaze first · interruptible transitions · automatic return to neutral
			</p>
		</div>
		<div class="performance">
			<label
				><input type="checkbox" bind:checked={stress} /> Test six copies of this prototype</label
			>
			<p>
				Separate cosmetic random streams. One shared animation clock. Hidden and offscreen
				characters stop updating.
			</p>
			<dl
				data-testid="clock-stats"
				data-clients={stats.clients}
				data-frames={stats.frames}
				data-update-p95={stats.updateP95Ms}
				data-update-mean={stats.updateMeanMs}
			>
				<div>
					<dt>Visible subscribers</dt>
					<dd data-testid="subscriber-count">{stats.clients}</dd>
				</div>
				<div>
					<dt>Update cap</dt>
					<dd>{stats.rateLimit} Hz</dd>
				</div>
				<div>
					<dt>JS update p95</dt>
					<dd data-testid="update-cost">{stats.updateP95Ms.toFixed(2)} ms</dd>
				</div>
			</dl>
			<p class="fine">
				Update time covers animation callbacks, excluding browser paint and GPU work.
			</p>
		</div>
	</section>
	{#if stress}<div class="copies" aria-label="Five additional copies for performance testing">
			{#each [1, 2, 3, 4, 5] as n (n)}<div>
					<PresenceCharacter
						{event}
						{attention}
						{paused}
						{headFollow}
						{breathing}
						{perspective}
					/><span>Dhoni · instance {n + 1}</span>
				</div>{/each}
		</div>{/if}
	<details class="asset-plan">
		<summary>What the finished facial rig needs</summary>
		<div>
			<p>
				A clean face underneath the moving features. Separate registered layers for head, hair,
				brows, eyes, lids, mouth, neck and shoulders. No change to the approved drawing style.
			</p>
			<p>
				This preview uses separate painted irises and brows, clean sockets and painted eyelids. The
				approved head is separated from breathing shoulders with clean neck overlap. The mouth
				blends real painted poses. A complete Live2D model has not been authored yet.
			</p>
			<p>
				Required: body, neck, clean head, hair, left/right brows, mouth; left/right sclera, pupils,
				upper lids and lower lids. Eye apertures, pupil limits and lid travel must be calibrated
				against the approved face.
			</p>
		</div>
	</details>
	<footer>LOCAL REVIEW ONLY · No live table changes · Public events only</footer>
</div>

<style>
	.motion-off {
		max-width: 28rem;
		margin: 1rem auto;
		font-size: 0.75rem;
		line-height: 1.6;
		color: #d6b467;
		text-align: center;
	}
	.mobile-events {
		display: none;
	}
	.study {
		max-width: 1280px;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 4rem;
		color: #f1ebdc;
		font-family: inherit;
	}
	header {
		display: flex;
		justify-content: space-between;
		gap: 1.5rem;
		align-items: flex-start;
		margin-bottom: 2.5rem;
	}
	.eyebrow {
		color: #b2b6a1;
		font-size: 0.62rem;
		letter-spacing: 0.19em;
		font-weight: 650;
	}
	h1 {
		font-size: clamp(2rem, 4.1vw, 3.5rem);
		font-weight: 650;
		letter-spacing: -0.055em;
		line-height: 1.1;
		margin: 0.75rem 0;
	}
	h1 em,
	h2 em {
		font-family: Georgia, serif;
		font-weight: 400;
		color: #d6b467;
	}
	.intro,
	.explainer {
		color: #a9b2a5;
		font-size: 0.9rem;
		line-height: 1.7;
	}
	.local {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
		font-size: 0.57rem;
		letter-spacing: 0.14em;
		color: #b9bda9;
		margin-top: 0.35rem;
	}
	.local > span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #a7be8c;
	}
	.study-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr);
		border-top: 1px solid #d6b46728;
		border-bottom: 1px solid #d6b46728;
	}
	.stage {
		position: relative;
		min-width: 0;
		padding: 1.3rem 2rem 1rem;
		background: radial-gradient(ellipse at 50% 46%, #19372a88, transparent 65%);
	}
	.stage-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
	}
	.phase {
		font-size: 0.7rem;
		color: #bdc7b8;
	}
	.scene {
		position: relative;
		height: 420px;
		overflow: hidden;
	}
	.halo {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 320px;
		height: 320px;
		border: 1px solid #c4bc8f0c;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		background: radial-gradient(ellipse, #b6c69b0b, transparent 65%);
	}
	.table-line {
		position: absolute;
		left: -20%;
		right: -20%;
		bottom: 30px;
		height: 95px;
		border: 1px solid #ccba7b23;
		border-radius: 50%;
	}
	.portrait-wrap {
		position: absolute;
		width: 450px;
		max-width: 100%;
		left: 50%;
		top: -3px;
		transform: translateX(-50%);
	}
	.identity {
		position: absolute;
		bottom: 28px;
		left: 0;
		right: 0;
		text-align: center;
		pointer-events: none;
	}
	.identity h2 {
		font-size: 1.5rem;
		font-weight: 650;
		letter-spacing: -0.04em;
		margin: 0.35rem 0 0.2rem;
	}
	.identity p {
		font-size: 0.73rem;
		color: #9eae9a;
	}
	.tiny-bot {
		font-size: 0.47rem;
		color: #bdc89d;
		border: 1px solid #bdc89d42;
		border-radius: 3px;
		padding: 0.12rem 0.35rem;
		letter-spacing: 0.16em;
	}
	.other-seat {
		position: absolute;
		top: 90px;
		font-size: 0.68rem;
		color: #7c8e7d;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		align-items: center;
		background: none;
		border: 0;
		cursor: pointer;
		padding: 0.5rem;
		z-index: 1;
	}
	.other-seat > span {
		display: grid;
		place-items: center;
		border: 1px solid #a3b5902b;
		border-radius: 50%;
		width: 32px;
		height: 32px;
		font-size: 0.7rem;
	}
	.other-seat.left {
		left: 0;
	}
	.other-seat.right {
		right: 0;
	}
	.other-seat.chosen {
		color: #cbbc8d;
	}
	.other-seat.chosen > span {
		border-color: #cbbc8d65;
	}
	.public-moment {
		min-height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		font-size: 0.8rem;
		color: #d1d4c0;
		margin: 0.15rem 0 1rem;
	}
	.moment-mark {
		color: #d6b467;
		font-size: 0.75rem;
	}
	.stage-controls {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	button {
		font-family: inherit;
	}
	.gold {
		display: flex;
		align-items: center;
		gap: 1.3rem;
		background: #d6b467;
		color: #172115;
		border: 0;
		padding: 0.7rem 1rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 650;
		cursor: pointer;
	}
	.quiet {
		padding: 0.65rem 0.6rem;
		border: 0;
		background: none;
		color: #a9b2a5;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.quiet[aria-pressed='true'] {
		color: #d6b467;
		text-decoration: underline;
	}
	.stage-note {
		text-align: center;
		font-size: 0.6rem;
		color: #7e907b;
		margin: 1rem 0 0.25rem;
		line-height: 1.6;
	}
	.director {
		border-left: 1px solid #d6b46728;
		padding: 1.5rem 0 1.5rem 2rem;
		min-width: 0;
	}
	.director h2 {
		font-size: 2.35rem;
		line-height: 1.12;
		letter-spacing: -0.04em;
		margin: 1rem 0;
	}
	.explainer {
		font-size: 0.76rem;
		max-width: 28rem;
	}
	.event-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 1.25rem 0 1.5rem;
	}
	.event-controls button {
		border: 1px solid #c5cdae29;
		border-radius: 5px;
		background: #18281b;
		color: #b8c1ae;
		padding: 0.45rem 0.7rem;
		font-size: 0.69rem;
		cursor: pointer;
	}
	.event-controls button.current {
		border-color: #cbb77380;
		color: #ebdfb3;
		background: #d6b4670c;
	}
	.event-controls button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.channels {
		border-top: 1px solid #d6b46725;
		padding-top: 1.1rem;
	}
	.channel-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.channel-label h3 {
		font-size: 0.75rem;
		font-weight: 600;
	}
	.channel-label > span {
		font-size: 0.5rem;
		letter-spacing: 0.14em;
		color: #809578;
	}
	.channel {
		margin: 1rem 0;
	}
	.channel > div:first-child {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: center;
		font-size: 0.7rem;
		color: #bbc4b3;
	}
	.channel small {
		font-size: 0.57rem;
		color: #879881;
	}
	.gaze-meter,
	.blink-meter {
		position: relative;
		height: 3px;
		background: #c4cfa51c;
		margin-top: 0.6rem;
		border-radius: 2px;
	}
	.gaze-meter::after {
		content: '';
		position: absolute;
		left: 50%;
		height: 7px;
		width: 1px;
		top: -2px;
		background: #c4cfa528;
	}
	.gaze-meter i {
		position: absolute;
		top: -2px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #d6b467;
		transform: translateX(-50%);
		transition: left 160ms linear;
	}
	.blink-meter i {
		height: 3px;
		display: block;
		background: #a9b18d;
	}
	.timing {
		font-size: 0.6rem;
		line-height: 1.6;
		color: #9caf95;
		margin: 1rem 0;
	}
	.honest-note {
		border-left: 1px solid #c6ac6850;
		padding: 0.1rem 0 0.1rem 0.85rem;
		margin: 1.5rem 0 1rem;
	}
	.honest-note > span {
		font-size: 0.5rem;
		letter-spacing: 0.16em;
		color: #c6ad79;
	}
	.honest-note p {
		font-size: 0.65rem;
		line-height: 1.75;
		color: #969f8e;
		margin: 0.4rem 0;
	}
	summary {
		cursor: pointer;
		color: #a6b199;
		font-size: 0.68rem;
	}
	.ledger {
		margin-top: 1.3rem;
	}
	.ledger summary {
		display: flex;
		justify-content: space-between;
	}
	.ledger > div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.8rem;
		font-size: 0.65rem;
		color: #b8c1ae;
	}
	.ledger code {
		font-size: 0.52rem;
		color: #7f9477;
	}
	.ledger p {
		font-size: 0.61rem;
		line-height: 1.7;
		color: #809578;
		margin: 0.7rem 0 0;
	}
	.lower {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 4rem;
		padding: 2.5rem 0;
	}
	.lower h2 {
		font-size: 1.65rem;
		letter-spacing: -0.04em;
		line-height: 1.2;
		margin: 1rem 0;
	}
	.lower p {
		font-size: 0.76rem;
		color: #9eaf97;
		line-height: 1.8;
		max-width: 31rem;
	}
	.lower .eyebrow {
		font-size: 0.57rem;
	}
	.fine {
		font-size: 0.6rem !important;
		color: #809578 !important;
		margin-top: 1rem;
	}
	.performance {
		padding-top: 0.25rem;
	}
	.performance label {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		font-size: 0.8rem;
		color: #d6dcc8;
		cursor: pointer;
	}
	.performance input {
		accent-color: #d6b467;
	}
	.performance > p {
		margin: 0.75rem 0;
	}
	.performance dl {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		margin-top: 1.3rem;
	}
	.performance dt {
		font-size: 0.57rem;
		color: #869b7e;
	}
	.performance dd {
		font-size: 1.1rem;
		margin-top: 0.5rem;
		font-variant-numeric: tabular-nums;
	}
	.copies {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0 0 1.5rem;
	}
	.copies > div {
		border-top: 1px solid #d6b46720;
		min-width: 0;
	}
	.copies span {
		display: block;
		text-align: center;
		font-size: 0.55rem;
		color: #9eaf97;
		margin: -2rem 0 0.5rem;
		position: relative;
	}
	.asset-plan {
		border-top: 1px solid #d6b46728;
		padding-top: 1.2rem;
	}
	.asset-plan div {
		max-width: 48rem;
	}
	.asset-plan p {
		font-size: 0.75rem;
		line-height: 1.8;
		color: #a0ae96;
		margin-top: 0.8rem;
	}
	footer {
		margin-top: 2rem;
		font-size: 0.5rem;
		letter-spacing: 0.13em;
		color: #738a6d;
	}
	@media (max-width: 850px) {
		.mobile-events {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.65rem;
			margin: 1rem auto;
			font-size: 0.65rem;
			color: #9eaf97;
		}
		.mobile-events select {
			border: 1px solid #c5cdae29;
			border-radius: 5px;
			background: #18281b;
			color: #b8c1ae;
			padding: 0.4rem;
			font: inherit;
		}
		.study-grid {
			grid-template-columns: 1fr;
		}
		.director {
			border-left: 0;
			border-top: 1px solid #d6b46728;
			padding: 1.5rem 0;
		}
		.lower {
			gap: 2rem;
		}
		.scene {
			height: 400px;
		}
		.portrait-wrap {
			top: -15px;
		}
		.stage {
			padding-inline: 1.25rem;
		}
		.director h2 br {
			display: none;
		}
		.copies {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 500px) {
		.study {
			padding: 1.75rem 1rem 3rem;
		}
		header {
			flex-direction: column;
			gap: 0.7rem;
			margin-bottom: 1.5rem;
		}
		h1 {
			font-size: 2.3rem;
		}
		.local {
			font-size: 0.5rem;
		}
		.stage {
			padding-inline: 0.1rem;
		}
		.scene {
			height: 330px;
		}
		.portrait-wrap {
			width: 360px;
			top: 0;
		}
		.identity {
			bottom: 18px;
		}
		.identity h2 {
			font-size: 1.3rem;
		}
		.identity p {
			font-size: 0.62rem;
		}
		.other-seat {
			top: 68px;
			font-size: 0.6rem;
		}
		.other-seat > span {
			width: 27px;
			height: 27px;
		}
		.other-seat.left {
			left: -0.3rem;
		}
		.other-seat.right {
			right: -0.3rem;
		}
		.halo {
			width: 240px;
			height: 240px;
		}
		.lower {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
		.stage-note {
			max-width: 17rem;
			margin: 1rem auto 0.25rem;
		}
		.gold {
			font-size: 0.7rem;
		}
		.quiet {
			font-size: 0.6rem;
			padding-inline: 0.45rem;
		}
		.copies {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.copies span {
			margin-top: -1.25rem;
		}
		.performance dl {
			gap: 0.75rem;
		}
		.performance dt {
			font-size: 0.53rem;
		}
	}
</style>
