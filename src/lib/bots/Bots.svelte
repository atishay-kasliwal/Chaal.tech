<script lang="ts">
	import { club } from '#lib/club/club.svelte.js';
	import ClubGate from '#lib/club/ClubGate.svelte';
	import BotPortrait from './BotPortrait.svelte';
	import type { ClubBot } from './types.js';
	let { id }: { id?: string } = $props();
	let bots = $state<ClubBot[]>([]);
	let loaded = $state(false);
	let error = $state('');
	let retry = $state(0);
	const date = (at: number) =>
		new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(at);
	const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
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

<svelte:head><title>{id ? 'Meet your opponent' : 'The bot room'} · Chaal</title></svelte:head>
<ClubGate>
	<div class="bot-room">
		<a class="back" href={id ? '/bots' : '/club'}>← {id ? 'All characters' : 'Back to the adda'}</a>
		{#if error}
			<p role="alert">{error}</p>
			<button class="action" onclick={() => retry++}>Try again</button>
		{:else if !loaded}<p role="status">Pulling up a chair…</p>
		{:else if id && bots[0]}
			{@const bot = bots[0]}
			<section class="profile">
				<div class="profile-art">
					<span class="watermark" aria-hidden="true">♠</span><BotPortrait
						mascotId={bot.avatar?.mascotId}
						name={bot.name}
						size={510}
					/>
				</div>
				<div class="profile-copy">
					<p class="eyebrow">CLUB CHARACTER · BOT {bot.status === 'retired' ? '· RETIRED' : ''}</p>
					<h1>{bot.name}<span>.</span></h1>
					<p class="tagline">{bot.personality?.title ?? 'An old club opponent'}</p>
					<p class="description">{bot.description}</p>
					<div class="traits">
						{#each bot.personality?.traits ?? [] as trait (trait)}<span>{trait}</span>{/each}
					</div>
					{#if bot.available}<a
							class="action"
							href={`/create-room?bot=${encodeURIComponent(bot.botId)}`}>Pull up a table ↗</a
						>{:else}<p class="muted">
							{bot.status === 'retired'
								? 'Retired from new tables. Your shared history stays here.'
								: 'Sitting out in this club for now.'}
						</p>{/if}
					{#if bot.style}<p class="fine">
							Teen Patti · Style {bot.style.version} · {bot.style.difficulty.declared}<br
							/>Character play style; measured difficulty is still building.
						</p>{/if}
				</div>
			</section>
			<section class="rivalry" aria-labelledby="your-record">
				<p class="eyebrow">YOU TWO AT THE TABLE</p>
				<h2 id="your-record">A little history<span>.</span></h2>
				{#if bot.memory?.status === 'remembered'}
					<div class="remembered">
						<p class="eyebrow">{bot.memory.familiarity}</p>
						<p><strong>{bot.name}</strong> {bot.memory.moment?.replace(/^Remembers/, 'remembers')}</p>
						{#if bot.memory.firstPlayed && bot.memory.lastPlayed}<p class="fine">
							First table together: {date(bot.memory.firstPlayed)} · Last played: {date(bot.memory.lastPlayed)}
						</p>{/if}
						{#each bot.memory.contexts.filter(c => c.hands >= 6).slice(0, 4) as context (context.variant)}
							<p class="fine">{context.variant.replace(/-1$/, '').replaceAll('-', ' ')} · {context.familiarity}</p>
						{/each}
					</div>
				{/if}
				{#if !bot.record}
					<p class="empty">
						You haven’t played {bot.name} yet.<br /><span
							>Every rivalry starts with a first hand.</span
						>
					</p>
				{:else}
					{@const record = bot.record}
					<div class="record-strip">
						<div><strong>{record.hands}</strong><span>hands together</span></div>
						<div><strong>{record.nights}</strong><span>nights together</span></div>
						<div><strong>{signed(record.units)}</strong><span>boots · your net flow</span></div>
					</div>
					<p class="muted">
						{record.verdict === 'too-few'
							? 'A few more hands before we call this an edge.'
							: record.verdict === 'ahead'
								? 'Your record shows an edge so far.'
								: record.verdict === 'behind'
									? 'Their record shows an edge so far.'
									: 'No clear edge yet.'} Results include practice tables.
					</p>
					{#if record.evidence !== 'insufficient' && record.fair.you !== null}<p class="fine">
							Your wins / fair share: {record.fair.you.toFixed(2)}×. Fair share accounts for table
							size and split pots.
						</p>{/if}
					<div class="history-columns">
						<div>
							<h3>Games together</h3>
							{#each Object.entries(record.games) as [game, hands] (game)}<p class="history-row">
									<span>{game === 'teen-patti' ? 'Teen Patti' : game}</span><strong
										>{hands} hands</strong
									>
								</p>{/each}
							<h3>At the Show</h3>
							<p>
								{record.contests.won} won · {record.contests.lost} lost · {record.contests.split} split
							</p>
						</div>
						<div>
							<h3>Recent nights</h3>
							{#each [...record.recentNights].reverse() as night (night.nightId)}<div
									class="history-row"
								>
									<span>{date(night.at)} · {night.hands} hands</span><strong
										>{signed(night.units)} boots</strong
									>
								</div>{/each}
						</div>
					</div>
					{#if record.biggestWin || record.biggestLoss}<p class="fine">
							Biggest swing together: {record.biggestWin ? `+${record.biggestWin.units}` : '—'} / {record
								.biggestLoss?.units ?? '—'} boots.
						</p>{/if}
					<p class="fine">
						Based on your most recent 5,000 recorded hands. Shared pots use proportional chip
						attribution. Hidden cards stay hidden.
					</p>
				{/if}
			</section>
		{:else}
			<header>
				<p class="eyebrow">THE USUAL SUSPECTS</p>
				<h1>Someone’s always<br />up for a <em>chaal</em><span>.</span></h1>
				<p class="intro">
					Familiar faces. Different ways to play.<br />Pick your company for the next hand.
				</p>
			</header>
			{#if !bots.length}<p class="empty">
					The bot room is quiet tonight.<br /><span
						>Your club owner can invite characters from Admin → Bots.</span
					>
				</p>{/if}
			<div class="lineup">
				{#each bots as bot, index (bot.botId)}
					<a
						class="character"
						href={`/bots/${bot.slug}`}
						style:--tone={['#263b2a', '#243243', '#494026', '#263a40', '#422b34'][index % 5]}
					>
						<div class="stage">
							<span class="number">0{index + 1}</span><span class="suit" aria-hidden="true"
								>{['♠', '♦', '♣', '♠', '♥'][index % 5]}</span
							><BotPortrait mascotId={bot.avatar?.mascotId} name={bot.name} size={300} /><span
								class="meet">Meet your opponent ↗</span
							>
						</div>
						<p class="eyebrow">{bot.personality?.title ?? 'CLUB BOT'}</p>
						<h2>{bot.name}</h2>
						<p class="bio">{bot.description}</p>
						<p class="fine">Teen Patti · {bot.style?.difficulty.declared}</p>
						<p class="connection">
							{bot.memory?.status === 'remembered' ? `${bot.memory.familiarity} · ${bot.memory.hands} hands together` : bot.record
								? `${bot.record.hands} hands together`
								: 'Your first hand is still to come'}
						</p>
					</a>
				{/each}
			</div>
			<p class="footnote">
				Club characters inspired by familiar faces. Automated opponents, each with their own playing
				style.
			</p>
		{/if}
	</div>
</ClubGate>

<style>
	.remembered { border-left: 2px solid #d6b467; padding: .25rem 1.25rem; margin: 1.5rem 0 2rem; color: #ded9c9; }
	.bot-room {
		max-width: 1360px;
		margin: 0 auto;
		padding: 2rem 1.2rem 5rem;
		color: #f1ebdc;
	}
	.back {
		color: #aaa999;
		font-size: 0.82rem;
	}
	header {
		margin: 3rem 0;
	}
	.eyebrow {
		color: #b9b7a5;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	h1 {
		font-size: clamp(2.8rem, 6vw, 5.5rem);
		font-weight: 800;
		line-height: 1.02;
		letter-spacing: -0.055em;
		margin: 0.8rem 0 1.2rem;
	}
	h1 em {
		font-family: Georgia, serif;
		font-weight: 400;
	}
	h1 span,
	h2 span {
		color: #d6b467;
	}
	.intro,
	.description {
		color: #b8b9aa;
		font-size: 1rem;
		line-height: 1.7;
	}
	.lineup {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 1.1rem;
	}
	.character {
		min-width: 0;
	}
	.stage {
		position: relative;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: var(--tone);
		border-radius: 0.45rem;
		border: 1px solid #ffffff12;
		padding: 1rem 0 0.8rem;
	}
	.stage :global(.portrait) {
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
		z-index: 1;
	}
	.character:hover .stage :global(.portrait) {
		transform: translateY(-0.5rem) rotate(-3deg);
	}
	.number {
		position: absolute;
		left: 1rem;
		top: 0.8rem;
		color: #d4cbb4;
		text-decoration: underline;
		font-size: 0.75rem;
	}
	.suit {
		position: absolute;
		font-size: 12rem;
		opacity: 0.055;
		top: -0.8rem;
		right: -0.2rem;
	}
	.meet {
		color: #f0e4c1;
		font-size: 0.65rem;
		z-index: 2;
	}
	.character .eyebrow {
		margin: 1.3rem 0 0.5rem;
	}
	h2 {
		font-size: 1.25rem;
		font-weight: 750;
		letter-spacing: -0.03em;
	}
	.bio {
		color: #b9bbad;
		font-size: 0.8rem;
		line-height: 1.6;
		margin: 0.65rem 0;
	}
	.fine {
		color: #929b8d;
		font-size: 0.72rem;
		line-height: 1.6;
		margin: 0.8rem 0;
	}
	.connection {
		color: #c5b27d;
		font-size: 0.72rem;
		border-top: 1px solid #ffffff18;
		padding-top: 0.9rem;
		margin-top: 1rem;
	}
	.footnote {
		color: #7f8e7d;
		font-size: 0.7rem;
		margin-top: 3rem;
	}
	.action {
		display: inline-block;
		border-radius: 999px;
		background: #d7ba75;
		color: #151d15;
		padding: 0.8rem 1.4rem;
		font-weight: 750;
		margin: 1.2rem 0 0.4rem;
		cursor: pointer;
	}
	.profile {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4rem;
		align-items: center;
		padding: 2rem 0 4rem;
	}
	.profile-art {
		position: relative;
		display: grid;
		place-items: center;
		background: radial-gradient(ellipse at 50% 60%, #304331, transparent 70%);
		overflow: hidden;
	}
	.profile-art :global(.portrait) {
		z-index: 1;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
	}
	.watermark {
		position: absolute;
		font-size: 30rem;
		color: #bfa15b09;
	}
	.profile h1 {
		font-size: clamp(3rem, 6vw, 5.4rem);
	}
	.tagline {
		font-size: 1.4rem;
		font-family: Georgia, serif;
		font-style: italic;
		color: #d7c49b;
		margin-bottom: 1.2rem;
	}
	.traits {
		display: flex;
		gap: 0.8rem;
		color: #b9b7a5;
		font-size: 0.75rem;
		margin-top: 1rem;
	}
	.traits span + span::before {
		content: '·';
		margin-right: 0.8rem;
	}
	.rivalry {
		border-top: 1px solid #ffffff20;
		padding-top: 2.5rem;
	}
	.rivalry h2 {
		font-size: 2.3rem;
		margin: 0.6rem 0 1.5rem;
	}
	.empty {
		font-size: 1.2rem;
		color: #e2d9bf;
		padding: 1rem 0 3rem;
		line-height: 1.8;
	}
	.empty span {
		font-size: 0.9rem;
		color: #929b8d;
	}
	.record-strip {
		display: flex;
		gap: 4rem;
		margin: 2rem 0;
		flex-wrap: wrap;
	}
	.record-strip strong {
		display: block;
		font-size: 2.5rem;
	}
	.record-strip span {
		color: #a5af9f;
		font-size: 0.8rem;
	}
	.muted {
		color: #a5af9f;
		font-size: 0.9rem;
	}
	.history-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4rem;
		margin: 2rem 0;
	}
	h3 {
		font-size: 1.1rem;
		margin: 1rem 0;
	}
	.history-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid #ffffff12;
		font-size: 0.8rem;
		color: #a5af9f;
	}
	.history-row strong {
		color: #ded2af;
	}
	@media (max-width: 1000px) {
		.lineup {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 2rem 1rem;
		}
		.profile {
			gap: 1.5rem;
		}
	}
	@media (max-width: 600px) {
		.bot-room {
			padding: 1.2rem 0.8rem 3rem;
		}
		header {
			margin: 2rem 0;
		}
		.lineup {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.profile {
			grid-template-columns: 1fr;
			gap: 0;
			padding-bottom: 2rem;
		}
		.profile-art {
			max-width: 320px;
			margin: 0 auto;
		}
		.profile h1 {
			font-size: 3.1rem;
		}
		.history-columns {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
		.record-strip {
			gap: 1.8rem;
		}
		.record-strip strong {
			font-size: 2rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.stage :global(.portrait) {
			transition: none;
		}
	}
	:global([data-reduced-motion]) .stage :global(.portrait) {
		transition: none;
	}
</style>
