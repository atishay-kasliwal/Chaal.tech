<script lang="ts">
	/**
	 * One hand as you were entitled to see it: your cards, what happened while you were there,
	 * and only the cards that were shown to you. Shaped for a visual replay later.
	 */
	import { fetchAnalytics } from '../api.js';
	import { cardLabel, day, gameName, redSuit, time, variantName } from '../format.js';
	import { properName } from '#lib/names.js';
	import type { Actor, HandEvent, HandView } from '../types.js';

	let { handId, onClose }: { handId: string; onClose: () => void } = $props();
	let hand = $state<HandView | null>(null);
	let error = $state('');
	$effect(() => {
		hand = null;
		error = '';
		fetchAnalytics<{ hand: HandView }>('hand', { id: handId })
			.then((b) => (hand = b.hand))
			.catch((e) => (error = e.message));
	});
	const who = (by: Actor) =>
		by.you ? 'You' : by.subject === 'system' ? 'The table' : properName(by.name);
	const ACTION: Record<string, string> = {
		deal: 'dealt',
		see: 'looked at their cards',
		call: 'called',
		raise: 'raised',
		fold: 'packed',
		check: 'checked',
		show: 'asked for a Show',
		timeout: 'ran out of time',
		leave: 'left',
		discard: 'discarded',
		table: 'played a table card',
		draw: 'drew',
		hit: 'hit',
		stand: 'stood',
		double: 'doubled',
		reveal: 'showed their cards',
		'knock-out': 'knocked out',
		result: 'settled the hand',
		other: 'acted'
	};
	const line = (e: HandEvent) => {
		if (e.action === 'knock-out') return `Knocked out: ${(e.players ?? []).map(who).join(', ')}`;
		if (e.action === 'result') return 'Hand settled';
		if (e.action === 'deal') return 'Cards dealt';
		const verb = ACTION[e.action] ?? e.action;
		return `${who(e.by)} ${e.by.you ? verb.replace('their', 'your') : verb}${e.amount ? ` ${e.amount} (${e.amountUnits} ${e.amountUnits === 1 ? hand?.unit : `${hand?.unit}s`})` : ''}`;
	};
</script>

<div class="stats-overlay" role="presentation" onclick={onClose}></div>
<div class="stats-sheet" role="dialog" aria-modal="true" aria-label="Hand detail">
	<button class="close" onclick={onClose} aria-label="Close">×</button>
	{#if error}<p class="notice" role="alert">{error}</p>
	{:else if !hand}<p class="muted">Loading the hand…</p>
	{:else}
		<p class="eyebrow">
			{gameName(hand.gameType)}{hand.gameType === 'teen-patti'
				? ` · ${variantName(hand.rulesVersion)}`
				: ''} · {day(hand.completedAt)}
			{time(hand.completedAt)}
		</p>
		<h2>Hand {hand.handNo ?? ''}</h2>
		{#if hand.yourCards}
			<div class="cards-row">
				<span class="muted small">Your cards</span>
				{#each hand.yourCards.final as c, k (k)}<span class="pcard" class:red={redSuit(c)}
						>{cardLabel(c)}</span
					>{/each}
				{#if hand.yourCards.hand}<span class="muted small">{hand.yourCards.hand}</span>{/if}
			</div>
		{/if}
		<table class="data-table seats">
			<thead><tr><th>Player</th><th>Result</th><th>Net ({hand.unit}s)</th></tr></thead>
			<tbody>
				{#each hand.seats as s (s.subject + s.seat)}
					<tr class:you={s.you}
						><td>{s.you ? 'You' : properName(s.name)}</td><td class="muted">{s.exit}</td><td
							class:up={(s.units ?? 0) > 0}
							class:down={(s.units ?? 0) < 0}>{(s.units ?? 0) > 0 ? '+' : ''}{s.units ?? '–'}</td
						></tr
					>
				{/each}
			</tbody>
		</table>
		{#if hand.shown.length}
			<h3>Cards shown to you</h3>
			{#each hand.shown as s, k (k)}
				<div class="cards-row">
					<span class="small"
						>{s.you ? 'You' : properName(s.name)}{s.late ? ' (after the hand)' : ''}</span
					>
					{#each s.cards as c, j (j)}<span class="pcard" class:red={redSuit(c)}>{cardLabel(c)}</span
						>{/each}
					{#if s.hand}<span class="muted small">{s.hand}</span>{/if}
				</div>
			{/each}
		{/if}
		<h3>What happened</h3>
		<ol class="steps-list">
			{#each hand.events as e (e.i + '-' + (e.sub ?? ''))}
				<li class:auto={e.automatic} class:mine={e.by?.you}>
					{line(e)}{#if e.yours?.blind}
						<span class="muted small">(blind)</span>{/if}
				</li>
			{/each}
		</ol>
		{#if hand.youLeftAt !== null}<p class="muted small">
				You left the table before the end, so the rest is not shown.
			</p>{/if}
		<p class="muted small">
			Pot {hand.outcome.pot ?? '–'} ({hand.outcome.potUnits ?? '–'}
			{hand.unit}s){hand.outcome.winners.length
				? ` · won by ${hand.outcome.winners.map(who).join(' & ')}`
				: ''}.
		</p>
	{/if}
</div>
