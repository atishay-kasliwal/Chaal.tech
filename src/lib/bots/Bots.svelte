<script lang="ts">
	import { club } from '#lib/club/club.svelte.js';
	import ClubGate from '#lib/club/ClubGate.svelte';
	import BotPortrait from './BotPortrait.svelte';
	import { METERS, STYLE_METERS, BOT_LOOK } from './style-meters.js';
	import type { ClubBot } from './types.js';
	let { id }: { id?: string } = $props();
	let bots = $state<ClubBot[]>([]);
	let loaded = $state(false);
	let error = $state('');
	let retry = $state(0);
	const date = (at: number) =>
		new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(at);
	const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('en-IN')}`;
	const FALLBACK = [
		{ suit: '♠', tone: '#263b2a', accent: '#7fc48e' },
		{ suit: '♦', tone: '#243243', accent: '#79a7e6' },
		{ suit: '♣', tone: '#494026', accent: '#f2dc91' },
		{ suit: '♠', tone: '#263a40', accent: '#79d1d6' },
		{ suit: '♥', tone: '#422b34', accent: '#ee9a8b' }
	];
	const look = (bot: ClubBot, index = 0) =>
		(BOT_LOOK as Record<string, (typeof FALLBACK)[number]>)[bot.botId] ??
		FALLBACK[index % FALLBACK.length];
	const meters = (bot: ClubBot) =>
		(STYLE_METERS as Record<string, Record<string, number>>)[bot.botId] ?? null;
	const verdictText: Record<string, string> = {
		ahead: 'You have the edge',
		behind: 'They have the edge',
		even: 'Even so far',
		'too-few': 'Too early to call'
	};
	$effect(() => {
		const token = club.token;
		const route = id;
		void retry;
		if (!club.member || !token) return;
		let cancelled = false;
		loaded = false;
		error = '';
		void club
			.request(route ? `/bots/${encodeURIComponent(route)}` : '/bots')
			.then(({ response, body }) => {
				if (cancelled || token !== club.token) return;
				if (!response.ok) throw new Error(body.error ?? 'Could not open the bot room');
				bots = route ? [body.bot] : body.bots;
				loaded = true;
			})
			.catch((e) => {
				if (!cancelled) {
					error = e.message;
					loaded = true;
				}
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#snippet meterBars(bot: ClubBot, accent: string, big = false)}
	{@const m = meters(bot)}
	{#if m}
		<ul class="meters" class:big style:--accent={accent} aria-label="How {bot.name} plays">
			{#each METERS as meter (meter.key)}
				<li>
					<span>{meter.label}</span>
					<span class="track"
						><span class="fill" style:width={`${Math.round(m[meter.key] * 100)}%`}></span></span
					>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<svelte:head><title>{id ? 'Meet your opponent' : 'The bot room'} · Chaal</title></svelte:head>
<ClubGate>
	<div class="bot-room">
		{#if error}
			<div class="state">
				<p role="alert">{error}</p>
				<button class="cta" onclick={() => retry++}>Try again</button>
			</div>
		{:else if !loaded}<div class="state"><p role="status">Pulling up a chair…</p></div>
		{:else if id && bots[0]}
			{@const bot = bots[0]}
			{@const l = look(bot)}
			{@const record = bot.record}
			<div class="bar">
				<a class="back" href="/bots">← All bots</a>
			</div>
			<div class="profile" style:--tone={l.tone} style:--accent={l.accent}>
				<section class="tile hero" aria-labelledby="bot-name">
					<span class="watermark" aria-hidden="true">{l.suit}</span>
					<div class="art">
						<BotPortrait mascotId={bot.avatar?.mascotId} name={bot.name} size={420} />
					</div>
					<div class="hero-copy">
						<p class="title">{bot.personality?.title ?? 'Club character'}</p>
						<h1 id="bot-name">{bot.name}<span>.</span></h1>
						<div class="chips">
							{#each bot.personality?.traits ?? [] as trait (trait)}<span>{trait}</span>{/each}
						</div>
						{#if bot.available}<a
								class="cta"
								href={`/create-room?bot=${encodeURIComponent(bot.botId)}`}
								><span aria-hidden="true">♠</span> Pull up a table</a
							>{:else}<p class="muted">
								{bot.status === 'retired' ? 'Retired from new tables.' : 'Sitting out for now.'}
							</p>{/if}
					</div>
				</section>

				<section class="tile style" aria-labelledby="style-title">
					<h2 id="style-title"><span aria-hidden="true">✦</span> How {bot.name} plays</h2>
					{@render meterBars(bot, l.accent, true)}
					<p class="desc">{bot.description}</p>
					{#if bot.style}<p class="fine">
							Teen Patti · style {bot.style.version} · {bot.style.difficulty.declared}
						</p>{/if}
				</section>

				<section class="tile memory" aria-labelledby="memory-title">
					<h2 id="memory-title"><span aria-hidden="true">☾</span> Remembers</h2>
					{#if bot.memory?.status === 'remembered' && bot.memory.moment}
						<blockquote>
							{bot.memory.moment.replace(/^Remembers/, '').trim()}
						</blockquote>
						<div class="chips small">
							<span>{bot.memory.familiarity}</span>
							{#if bot.memory.firstPlayed}<span>since {date(bot.memory.firstPlayed)}</span>{/if}
							{#if bot.memory.lastPlayed}<span>last {date(bot.memory.lastPlayed)}</span>{/if}
						</div>
					{:else}
						<p class="quiet">Nothing yet. Every rivalry starts with a first hand.</p>
					{/if}
				</section>

				<section class="tile record" aria-labelledby="record-title">
					<h2 id="record-title"><span aria-hidden="true">⚔</span> You two</h2>
					{#if !record}
						<div class="first">
							<span aria-hidden="true">{l.suit}</span>
							<p>No hands together yet.</p>
						</div>
					{:else}
						<div class="net" class:negative={record.units < 0} class:positive={record.units > 0}>
							<strong>{signed(record.units)}</strong>
							<span>boots to you</span>
						</div>
						<div class="chips small">
							<span><b>{record.hands}</b> hands</span>
							<span><b>{record.nights}</b> nights</span>
							<span class="verdict">{verdictText[record.verdict] ?? 'Even so far'}</span>
						</div>
						{#if record.recentNights.length}
							{@const top = Math.max(...record.recentNights.map((n) => Math.abs(n.units)), 1)}
							<div class="nights" aria-label="Recent nights">
								{#each record.recentNights as night (night.nightId)}
									<div
										class="night"
										title="{date(night.at)} · {night.hands} hands · {signed(night.units)} boots"
									>
										<span
											class="barv"
											class:down={night.units < 0}
											style:height={`${Math.max(4, (Math.abs(night.units) / top) * 100)}%`}
										></span>
										<small>{date(night.at)}</small>
									</div>
								{/each}
							</div>
						{/if}
						{@const c = record.contests}
						{@const total = Math.max(c.won + c.lost + c.split, 1)}
						<div class="show" aria-label="At the show: {c.won} won, {c.lost} lost, {c.split} split">
							<span class="label">At the show</span>
							<div class="seg">
								<span class="won" style:flex={c.won / total}></span><span
									class="split"
									style:flex={c.split / total}
								></span><span class="lost" style:flex={c.lost / total}></span>
							</div>
							<span class="counts"
								><b>{c.won}</b> won · <b>{c.lost}</b> lost{c.split
									? ` · ${c.split} split`
									: ''}</span
							>
						</div>
						{#if record.biggestWin || record.biggestLoss}<div class="chips small">
								{#if record.biggestWin}<span class="up">best {signed(record.biggestWin.units)}</span
									>{/if}
								{#if record.biggestLoss}<span class="downc"
										>worst {signed(record.biggestLoss.units)}</span
									>{/if}
							</div>{/if}
					{/if}
				</section>
			</div>
		{:else}
			<div class="bar">
				<h1>Bots <span>{bots.length}</span></h1>
				<a class="cta" href="/create-room"><span aria-hidden="true">♠</span> Pull up a table</a>
			</div>
			{#if !bots.length}<div class="state">
					<p>The bot room is quiet tonight.</p>
				</div>{/if}
			<div class="lineup">
				{#each bots as bot, index (bot.botId)}
					{@const l = look(bot, index)}
					<a
						class="tile character"
						href={`/bots/${bot.slug}`}
						style:--tone={l.tone}
						style:--accent={l.accent}
						aria-label="{bot.name}, {bot.personality?.title ?? 'club character'}"
					>
						<div class="stage">
							<span class="number">0{index + 1}</span>
							<span class="watermark" aria-hidden="true">{l.suit}</span>
							<div class="art">
								<BotPortrait mascotId={bot.avatar?.mascotId} name={bot.name} size={300} />
							</div>
						</div>
						<div class="who">
							<p class="title">{bot.personality?.title ?? 'Club character'}</p>
							<h2>{bot.name}</h2>
						</div>
						{@render meterBars(bot, l.accent)}
						<p class="with">
							{#if bot.record}<span
									class:negative={bot.record.units < 0}
									class:positive={bot.record.units > 0}>{signed(bot.record.units)}</span
								>
								· {bot.record.hands} hands{:else}New face{/if}
						</p>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</ClubGate>

<style>
	/* One screen, like Club and Stats. */
	.bot-room {
		--tile: var(--surface);
		--tile-line: #ffffff1a;
		--green: #8fd19e;
		display: flex;
		flex-direction: column;
		gap: 14px;
		height: calc(100dvh - var(--header-h, 64px));
		overflow: hidden;
		padding: 16px max(var(--gutter), calc((100vw - var(--page-max)) / 2 + var(--gutter))) 18px;
		color: var(--paper);
		background: radial-gradient(ellipse at 70% 0%, #3a2b4a66, transparent 45%), var(--night);
		color-scheme: dark;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		flex: none;
		min-height: 44px;
	}
	.bar h1 {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.04em;
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.bar h1 span {
		font-size: 14px;
		color: var(--butter);
	}
	.back {
		font-size: 13px;
		font-weight: 700;
		color: var(--muted);
		padding: 10px 16px;
		border-radius: 100px;
		background: #ffffff10;
		transition: background 0.2s;
	}
	.back:hover {
		background: #ffffff1c;
		color: var(--paper);
	}
	.cta {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 11px 20px;
		border-radius: 100px;
		background: var(--butter);
		color: var(--night);
		font-weight: 800;
		font-size: 14px;
		transition:
			translate 0.2s,
			box-shadow 0.2s;
	}
	.cta span {
		color: #c0392b;
	}
	.cta:hover,
	.cta:focus-visible {
		translate: 0 -2px;
		box-shadow: 0 8px 18px #0006;
	}
	.state {
		flex: 1;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 12px;
		color: var(--muted);
	}
	.tile {
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		border-radius: 18px;
		background: var(--tile);
		border: 1px solid var(--tile-line);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: -0.02em;
		font-size: 15px;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	h2 > span {
		color: var(--butter);
	}
	.title {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent, var(--butter));
	}
	.watermark {
		position: absolute;
		font-size: 220px;
		line-height: 1;
		color: #ffffff0c;
		right: -18px;
		bottom: -40px;
		pointer-events: none;
	}
	.art {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
	}
	.art :global(.portrait) {
		width: min(100%, 100cqh) !important;
		height: auto !important;
		aspect-ratio: 1;
	}
	.positive {
		color: var(--green);
	}
	.negative {
		color: var(--red);
	}

	/* Meters: six bars, the character's DNA. */
	.meters {
		display: grid;
		gap: 6px;
	}
	.meters li {
		display: grid;
		grid-template-columns: 74px 1fr;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
	}
	.track {
		height: 6px;
		border-radius: 6px;
		background: #ffffff14;
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: 6px;
		background: var(--accent);
		transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.meters.big {
		gap: 12px;
	}
	.meters.big li {
		grid-template-columns: 96px 1fr;
		font-size: 13px;
	}
	.meters.big .track {
		height: 10px;
	}

	/* The lineup: five tall characters filling the screen. */
	.lineup {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 14px;
	}
	.character {
		padding: 10px 10px 14px;
		gap: 12px;
		transition:
			translate 0.25s,
			box-shadow 0.25s,
			border-color 0.25s;
	}
	.character:hover,
	.character:focus-visible {
		translate: 0 -4px;
		box-shadow: 0 14px 30px #0007;
		border-color: color-mix(in srgb, var(--accent) 60%, transparent);
	}
	.stage {
		position: relative;
		flex: 1;
		min-height: 140px;
		border-radius: 12px;
		overflow: hidden;
		background: radial-gradient(ellipse at 50% 40%, #ffffff14, transparent 65%), var(--tone);
		container-type: size;
	}
	/* The sprite cell has room around the face: fill the stage with it. */
	.stage .art :global(.portrait) {
		scale: 1.5;
		transition: scale 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.character:hover .stage .art :global(.portrait) {
		scale: 1.6;
	}
	.number {
		position: absolute;
		top: 10px;
		left: 12px;
		font-size: 11px;
		font-weight: 800;
		color: #ffffff90;
		z-index: 1;
	}
	.who {
		padding: 0 6px;
	}
	.who h2 {
		font-size: clamp(22px, 2vw, 30px);
		font-weight: 800;
		letter-spacing: -0.04em;
	}
	.character .meters {
		padding: 0 6px;
	}
	.with {
		margin: 0 6px;
		padding-top: 10px;
		border-top: 1px solid var(--tile-line);
		font-size: 12px;
		color: var(--muted);
	}
	.with span {
		font-weight: 800;
	}

	/* Profile: the character, how they play, what they remember, and you two. */
	.profile {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
		grid-template-rows: minmax(0, 1.25fr) minmax(0, 1fr);
		gap: 14px;
	}
	.hero {
		grid-row: 1 / 3;
		position: relative;
		padding: 0;
		background: radial-gradient(ellipse at 50% 35%, #ffffff16, transparent 60%), var(--tone);
	}
	.hero .art {
		flex: 1;
		min-height: 0;
		container-type: size;
	}
	.hero-copy {
		position: relative;
		display: grid;
		gap: 10px;
		justify-items: start;
		padding: 0 24px 22px;
	}
	.hero h1 {
		font-family: var(--font-display);
		font-size: clamp(44px, 5vw, 84px);
		font-weight: 800;
		letter-spacing: -0.055em;
		line-height: 0.9;
	}
	.hero h1 span {
		color: var(--butter);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chips span {
		padding: 6px 12px;
		border-radius: 100px;
		background: #00000030;
		font-size: 12px;
		font-weight: 700;
	}
	.chips.small span {
		background: #ffffff10;
		color: var(--muted);
		font-size: 12px;
	}
	.chips b {
		color: var(--paper);
	}
	.chips .verdict {
		color: var(--butter);
	}
	.chips .up {
		color: var(--green);
	}
	.chips .downc {
		color: var(--red);
	}
	.style {
		grid-row: 1 / 3;
		gap: 16px;
	}
	.desc {
		font-size: 14px;
		line-height: 1.5;
		color: #e8e0f0;
		margin-top: auto;
	}
	.fine {
		font-size: 12px;
		color: var(--muted);
	}
	blockquote {
		font-family: var(--font-display);
		font-size: clamp(18px, 1.5vw, 24px);
		font-weight: 700;
		line-height: 1.25;
		letter-spacing: -0.015em;
		color: var(--butter);
		padding-left: 14px;
		border-left: 3px solid var(--accent);
	}
	blockquote::first-letter {
		text-transform: uppercase;
	}
	.quiet {
		color: var(--muted);
		font-size: 14px;
	}
	.memory {
		justify-content: flex-start;
	}
	.record {
		grid-row: 1 / 3;
		grid-column: 3;
	}
	.memory {
		grid-column: 2;
		grid-row: 2;
	}
	.style {
		grid-column: 2;
		grid-row: 1;
	}
	.net {
		display: grid;
		gap: 2px;
	}
	.net strong {
		font-family: var(--font-display);
		font-size: clamp(48px, 4.6vw, 76px);
		font-weight: 800;
		letter-spacing: -0.05em;
		line-height: 0.95;
	}
	.net span {
		font-size: 12px;
		color: var(--muted);
	}
	.nights {
		flex: 1;
		min-height: 60px;
		display: flex;
		align-items: stretch;
		gap: 8px;
	}
	.night {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		gap: 4px;
	}
	.barv {
		width: 100%;
		max-width: 34px;
		border-radius: 6px 6px 2px 2px;
		background: var(--green);
	}
	.barv.down {
		background: var(--red);
		border-radius: 2px 2px 6px 6px;
	}
	.night small {
		font-size: 10px;
		color: var(--muted);
	}
	.show {
		display: grid;
		gap: 6px;
	}
	.show .label {
		font-size: 12px;
		font-weight: 700;
		color: var(--muted);
	}
	.seg {
		display: flex;
		height: 10px;
		border-radius: 10px;
		overflow: hidden;
		background: #ffffff10;
	}
	.won {
		background: var(--green);
	}
	.lost {
		background: var(--red);
	}
	.split {
		background: var(--muted);
	}
	.counts {
		font-size: 12px;
		color: var(--muted);
	}
	.counts b {
		color: var(--paper);
	}
	.first {
		flex: 1;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: var(--muted);
	}
	.first span {
		font-size: 64px;
		color: #ffffff22;
	}

	/* Narrower screens: scroll the page; the lineup becomes a row you swipe. */
	@media (max-width: 1100px) {
		.bot-room {
			height: auto;
			overflow: visible;
		}
		.lineup {
			display: flex;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			padding-bottom: 6px;
		}
		.character {
			flex: none;
			width: min(300px, 78vw);
			min-height: 520px;
			scroll-snap-align: start;
		}
		.profile {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: auto;
		}
		.hero {
			grid-column: 1 / -1;
			grid-row: auto;
			min-height: 480px;
		}
		.style,
		.memory,
		.record {
			grid-column: auto;
			grid-row: auto;
		}
		.record {
			min-height: 360px;
		}
	}
	@media (max-width: 640px) {
		.lineup {
			flex-direction: column;
			overflow: visible;
		}
		.character {
			width: auto;
			min-height: 0;
		}
		.stage {
			flex: none;
			height: 240px;
		}
		.stage .art :global(.portrait),
		.character:hover .stage .art :global(.portrait) {
			scale: 1.1;
		}
		.profile {
			grid-template-columns: 1fr;
		}
		.hero {
			min-height: 440px;
		}
	}
</style>
