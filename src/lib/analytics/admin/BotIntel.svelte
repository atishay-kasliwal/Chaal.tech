<script lang="ts">
	/**
	 * Bot intelligence for owners: how each character is used, how it does against people, how
	 * predictable and exploitable it is, every published version, and the workflow that turns a finding
	 * into a new version. Nothing here changes a bot until an owner publishes a reviewed proposal.
	 */
	import { club } from '#lib/club/club.svelte.js';
	import { day, percent, plural, signed } from '../format.js';
	import type { BotIntel, BotsResponse, Evolution } from './types.js';

	let data = $state<BotsResponse | null>(null);
	let evolutions = $state<Evolution[]>([]);
	let selected = $state<string | null>(null);
	let error = $state('');
	let busy = $state(false);
	let notice = $state('');
	let note = $state('');
	let acknowledge = $state(false);

	$effect(() => {
		club.request('/admin/intel/bots').then(({ response, body }) => {
			if (!response.ok) throw new Error(body.error ?? 'Bot analytics are unavailable');
			data = body;
			evolutions = body.evolutions;
			selected = selected ?? body.bots[0]?.botId ?? null;
		}).catch((e) => (error = e.message));
	});
	const bot = $derived<BotIntel | null>(data?.bots.find((b) => b.botId === selected) ?? null);
	const mine = $derived(evolutions.filter((e) => e.botId === selected));

	async function step(payload: Record<string, unknown>) {
		busy = true;
		error = '';
		notice = '';
		try {
			const { response, body } = await club.request('/admin/bots/evolution', { method: 'POST', body: JSON.stringify(payload) });
			if (!response.ok) throw new Error(body.error ?? 'That step did not work');
			evolutions = body.evolutions;
			notice = 'Saved. Nothing is live until a reviewed proposal is published.';
			note = '';
			acknowledge = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'That step did not work';
		} finally {
			busy = false;
		}
	}
	const NEXT: Record<string, [string, string] | null> = {
		observed: ['propose', 'Create a draft style'],
		proposed: ['simulate', 'Simulate against the current style'],
		simulated: ['validate', 'Validate the draft'],
		validated: null,
		approved: ['publish', 'Publish as a new version'],
		rejected: null,
		published: null
	};
	const STAGES = ['observed', 'proposed', 'simulated', 'validated', 'approved', 'published'];
	const diff = (changes: { key: string; from: unknown; to: unknown }[] | null) => (changes ?? []).map((c) => `${c.key.replace('tendencies.', '')}: ${c.from} → ${c.to}`).join(', ');
</script>

{#if error}<p class="notice" role="alert">{error}</p>{/if}
{#if notice}<p class="private-note" role="status">{notice}</p>{/if}
{#if !data}<p class="muted">Reading the bots’ history…</p>
{:else}
	<nav class="bots" aria-label="Bots">
		{#each data.bots as b (b.botId)}<button class:on={b.botId === selected} onclick={() => (selected = b.botId)}>{b.name}</button>{/each}
	</nav>
	{#if bot}
		<section class="panel">
			<div class="row-head"><h2>{bot.name}</h2><span class="muted tiny">{plural(bot.usage.hands, 'hand')} in {plural(bot.usage.nights, 'night')}{bot.usage.share !== null ? ` · ${percent(bot.usage.share)} of the club's hands` : ''}</span></div>
			<ul class="facts">
				<li><strong>{signed(bot.performance.humansAgainst.perHand, 2)}</strong><span>boots a hand for people against it{#if bot.performance.humansAgainst.low !== null} ({signed(bot.performance.humansAgainst.low, 2)} to {signed(bot.performance.humansAgainst.high, 2)}){/if}</span></li>
				<li><strong>{signed(bot.performance.bot.perHand, 2)}</strong><span>boots a hand for the bot itself</span></li>
				<li><strong>{bot.predictability.accuracy === null ? 'Not enough' : percent(bot.predictability.accuracy)}</strong><span>of its moves guessed from the table alone{#if bot.predictability.baseline !== null} (a coin would manage {percent(bot.predictability.baseline)}){/if}</span></li>
				<li><strong>{bot.familiarity.models}</strong><span>player histories it remembers · {bot.familiarity.changedPlayers} changed how they play lately</span></li>
			</ul>
			<p class="muted tiny">People’s results include luck; nothing is rated until the range excludes zero.</p>
		</section>

		<section class="panel two">
			<div>
				<h2>What it does</h2>
				<table class="data-table"><tbody>
					<tr><td>Folds</td><td>{bot.decisions.fold.k} of {bot.decisions.fold.n}</td></tr>
					<tr><td>Raises</td><td>{bot.decisions.raise.k} of {bot.decisions.raise.n}</td></tr>
					<tr><td>Calls</td><td>{bot.decisions.call.k} of {bot.decisions.call.n}</td></tr>
				</tbody></table>
				{#if bot.adaptation}<p class="small">Adapted {bot.adaptation.adapted} of {bot.adaptation.decisions} decisions; {bot.adaptation.redirected} actually changed. {bot.adaptation.effectiveness}</p>{/if}
				{#if bot.reasons.length}<p class="muted small">Common reasons: {bot.reasons.map((r) => `${r.code} (${r.count})`).join(', ')}</p>{/if}
			</div>
			<div>
				<h2>By game and variant</h2>
				<ul class="plain">
					{#each bot.byGame as g (g.game)}<li><span>{g.game}</span><span class="muted">{g.hands} hands</span><span></span></li>{/each}
					{#each bot.byVariant.slice(0, 5) as v (v.variant)}<li><span>{v.variant}</span><span class="muted">{v.hands} hands</span><span>{signed(v.perHand, 2)}</span></li>{/each}
				</ul>
			</div>
		</section>

		<section class="panel">
			<h2>Weaknesses worth a look</h2>
			{#if !bot.exploitability.length}<p class="muted">Nothing stands out. A finding needs at least 50 decisions and evidence that excludes chance.</p>{/if}
			{#each bot.exploitability as f (f.id)}
				{@const open = mine.find((e) => e.finding?.id === f.id && !['published', 'rejected'].includes(e.status))}
				<article class="finding">
					<h3>{f.title}</h3>
					<p class="small">{f.why}</p>
					<p class="muted tiny">{Object.entries(f.evidence).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
					{#if !open}<button class="btn" disabled={busy} onclick={() => step({ action: 'observe', botId: bot.botId, findingId: f.id })}>Start a proposal</button>{/if}
				</article>
			{/each}
		</section>

		{#if mine.length}
			<section class="panel">
				<h2>Proposals</h2>
				{#each mine as e (e.id)}
					<article class="finding">
						<h3>{e.finding?.title}</h3>
						<ol class="stages">{#each STAGES as st (st)}<li class:done={STAGES.indexOf(st) <= STAGES.indexOf(e.status === 'rejected' ? 'validated' : e.status)} class:now={st === e.status}>{st}</li>{/each}</ol>
						{#if e.changes}<p class="small">Proposed: {diff(e.changes)} <span class="muted">(draft {e.draftStyleId})</span></p>{/if}
						{#if e.comparison}
							<p class="small">Simulation on identical deals: {e.comparison.verdict.replaceAll('-', ' ')}.</p>
							<table class="data-table"><thead><tr><th>Exploiter</th><th>Now</th><th>Proposed</th></tr></thead><tbody>
								{#each e.comparison.rows as r (r.strategy)}<tr class:dim={!r.distinguishable}><td>{r.strategy}</td><td>{signed(r.base, 1)}</td><td>{signed(r.candidate, 1)}</td></tr>{/each}
							</tbody></table>
							<p class="muted tiny">{e.comparison.limitations} Faded rows are within noise.</p>
						{/if}
						{#if e.review}<p class="small">Reviewed ({e.review.decision}): {e.review.note}</p>{/if}
						{#if NEXT[e.status]}{@const n = NEXT[e.status]}<button class="btn" disabled={busy} onclick={() => step({ action: n?.[0], id: e.id })}>{n?.[1]}</button>{/if}
						{#if e.status === 'validated'}
							<label class="note">Why this change? It becomes the reason shown in the bot’s history.<textarea bind:value={note} maxlength="400" rows="2"></textarea></label>
							{#if e.comparison?.regressions.length}<label class="check"><input type="checkbox" bind:checked={acknowledge} /> I have seen it is easier to exploit with {e.comparison.regressions.join(', ')}</label>{/if}
							<span class="actions">
								<button class="btn" disabled={busy || note.trim().length < 5} onclick={() => step({ action: 'review', id: e.id, decision: 'approve', note, acceptRegressions: acknowledge })}>Approve</button>
								<button class="btn quiet" disabled={busy || note.trim().length < 5} onclick={() => step({ action: 'review', id: e.id, decision: 'reject', note })}>Reject</button>
							</span>
						{/if}
					</article>
				{/each}
			</section>
		{/if}

		<section class="panel">
			<h2>Versions</h2>
			<p class="muted small">Each published version is permanent. Old hands always point at the version that played them.</p>
			<ol class="lineage">
				{#each bot.versions as v (v.styleId)}
					<li class:current={v.current}>
						<header><strong>v{v.version}</strong>{#if v.current}<span class="tag">current</span>{/if}<span class="muted tiny">{v.publishedAt ? `published ${day(v.publishedAt)}` : v.status}</span></header>
						<p class="small">{plural(v.hands, 'hand')} · {signed(v.performance.humansAgainst.perHand, 2)} boots a hand for people · {v.predictability.accuracy === null ? 'predictability not measured' : `${percent(v.predictability.accuracy)} guessable`} · declared {v.difficulty?.declared ?? 'n/a'}</p>
						{#if v.changes.length}<p class="small">Changed: {diff(v.changes)}</p>{/if}
						{#if v.reason}<p class="small muted">Why: {v.reason.finding ?? ''}{v.reason.note ? ` ${v.reason.note}` : ''}</p>{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/if}
{/if}

<style>
	.bots {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
	}
	.bots button {
		flex-shrink: 0;
		border-radius: 999px;
		padding: 0.45rem 0.95rem;
		color: rgb(241 235 220 / 70%);
	}
	.bots button.on {
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.facts li {
		display: grid;
		gap: 0.15rem;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.7rem 0.8rem;
	}
	.facts strong {
		font-size: 1.3rem;
	}
	.facts span {
		color: #b1b9ae;
		font-size: 0.75rem;
	}
	.finding {
		display: grid;
		gap: 0.4rem;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.8rem 0.9rem;
	}
	.stages {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.7rem;
	}
	.stages li {
		border-radius: 999px;
		background: rgb(255 255 255 / 5%);
		padding: 0.15rem 0.6rem;
		color: #b1b9ae;
	}
	.stages li.done {
		background: rgb(143 224 173 / 14%);
		color: #8fe0ad;
	}
	.stages li.now {
		outline: 1px solid #e7c784;
	}
	.btn {
		justify-self: start;
		border-radius: 999px;
		background: #e7c784;
		padding: 0.4rem 1rem;
		color: #1d1405;
		font-size: 0.82rem;
		font-weight: 700;
	}
	.btn.quiet {
		background: rgb(255 255 255 / 8%);
		color: #f1ebdc;
	}
	.btn:disabled {
		opacity: 0.5;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.note,
	.check {
		display: grid;
		gap: 0.3rem;
		color: #b1b9ae;
		font-size: 0.78rem;
	}
	textarea {
		border: 1px solid rgb(240 209 140 / 22%);
		border-radius: 0.6rem;
		background: #0b1411;
		padding: 0.4rem 0.6rem;
		color: #f1ebdc;
	}
	.lineage {
		display: grid;
		gap: 0.6rem;
		margin: 0;
		padding: 0 0 0 0.4rem;
		list-style: none;
		border-left: 2px solid rgb(231 199 132 / 25%);
	}
	.lineage li {
		display: grid;
		gap: 0.2rem;
		padding-left: 0.8rem;
	}
	.lineage li.current {
		border-left: 3px solid #e7c784;
		margin-left: -0.15rem;
	}
	.lineage header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.tag {
		border-radius: 999px;
		background: rgb(231 199 132 / 14%);
		padding: 0.1rem 0.5rem;
		color: #e7c784;
		font-size: 0.68rem;
	}
</style>
