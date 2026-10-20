<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { Moon, Copy, Check, ArrowRight } from '@lucide/svelte';
	import { properName } from '#lib/names.js';
	import { VARIANT_BY_VERSION, type RulesVersion } from '#lib/variant-catalog.js';
	import { money, signedMoney } from './format.js';

	/**
	 * The end of the night: who settles with whom first (that's what everyone needs), then how the
	 * night went. Copy makes a WhatsApp-ready text.
	 */
	let {
		ended,
		selfId,
		onleave
	}: {
		ended: NonNullable<RoomData['ended']>;
		selfId: string;
		onleave: () => void;
	} = $props();

	const gameName = (version: string) =>
		VARIANT_BY_VERSION[version as RulesVersion]?.selectionLabel.split(': ')[0] ?? version;
	const length = $derived.by(() => {
		if (!ended.startedAt || ended.at <= ended.startedAt) return '';
		const minutes = Math.round((ended.at - ended.startedAt) / 60000);
		return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
	});
	const favourite = $derived(Object.entries(ended.games ?? {}).sort((a, b) => b[1] - a[1])[0]);
	const people = $derived([...ended.realNet].sort((a, b) => b.net - a.net));
	const who = (id: string, name: string) => (id === selfId ? 'You' : properName(name));

	const shareText = $derived(
		[
			'Chaal night 🌙',
			...(ended.settleUp.length
				? ended.settleUp.map(
						(p) => `${properName(p.fromName)} pays ${properName(p.toName)} ${money(p.amount)}`
					)
				: ['Everyone is square.']),
			'',
			people.map((p) => `${properName(p.name)} ${signedMoney(p.net)}`).join(' · ')
		].join('\n')
	);
	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(shareText);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* Clipboard blocked: nothing to do. */
		}
	}
</script>

<div class="veil" transition:fade={{ duration: 300 }}></div>
<div
	class="night-over"
	role="dialog"
	aria-modal="true"
	aria-labelledby="night-title"
	in:fly={{ y: 24, duration: 450 }}
	data-testid="night-over"
>
	<span class="moon" aria-hidden="true"><Moon size={30} /></span>
	<h2 id="night-title">That’s the night</h2>
	<p class="facts">
		{[
			length,
			`${ended.hands} hand${ended.hands === 1 ? '' : 's'}`,
			`${Object.keys(ended.games ?? {}).length} game${Object.keys(ended.games ?? {}).length === 1 ? '' : 's'}`
		]
			.filter(Boolean)
			.join(' · ')}
	</p>

	<h3>Settle up</h3>
	{#if ended.settleUp.length}
		<ul class="payments">
			{#each ended.settleUp as payment, index (`${payment.from}-${payment.to}`)}
				<li class:mine={payment.from === selfId || payment.to === selfId} style:--i={index}>
					<strong>{who(payment.from, payment.fromName)}</strong>
					<span class="arrow">pay{payment.from === selfId ? '' : 's'} →</span>
					<strong>{payment.to === selfId ? 'you' : properName(payment.toName)}</strong>
					<span class="amount">{money(payment.amount)}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="square">Everyone is square. Nobody pays anybody.</p>
	{/if}

	{#if people.length}
		<ul class="people">
			{#each people as person (person.id)}
				<li class:me={person.id === selfId}>
					{who(person.id, person.name)}
					<strong class:up={person.net > 0} class:down={person.net < 0}
						>{signedMoney(person.net)}</strong
					>
				</li>
			{/each}
		</ul>
	{/if}

	<dl class="highlights">
		{#if ended.biggest}
			<div>
				<dt>Biggest pot</dt>
				<dd>
					{money(ended.biggest.amount)} to {properName(ended.biggest.winner)}
					<small>({gameName(ended.biggest.rulesVersion)})</small>
				</dd>
			</div>
		{/if}
		{#if favourite}
			<div>
				<dt>Most played</dt>
				<dd>{gameName(favourite[0])} <small>×{favourite[1]}</small></dd>
			</div>
		{/if}
	</dl>
	<p class="thanks">
		Thanks for playing. A thank-you note with this summary is on its way to everyone’s email.
	</p>

	<div class="actions">
		<button class="ghost" onclick={copy}>
			{#if copied}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy for WhatsApp{/if}
		</button>
		<button class="primary" onclick={onleave}>Back to the club <ArrowRight size={16} /></button>
	</div>
</div>

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: radial-gradient(ellipse at 50% 30%, rgb(8 20 14 / 80%), rgb(2 6 4 / 94%));
		backdrop-filter: blur(4px);
	}
	.night-over {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 91;
		display: grid;
		gap: 0.7rem;
		width: min(30rem, calc(100% - 2rem));
		max-height: calc(100% - 2rem);
		overflow: auto;
		translate: -50% -50%;
		border-radius: 1.6rem;
		background:
			radial-gradient(ellipse 80% 45% at 50% 0%, rgb(242 220 145 / 18%), transparent 70%),
			linear-gradient(180deg, rgb(14 36 25 / 98%), rgb(6 16 11 / 98%));
		padding: 1.6rem 1.6rem 1.3rem;
		box-shadow:
			inset 0 0 0 1px rgb(240 200 120 / 45%),
			0 30px 80px rgb(0 0 0 / 65%);
		color: #f8f2e5;
		text-align: center;
	}
	.moon {
		justify-self: center;
		display: grid;
		width: 3.4rem;
		height: 3.4rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(242 220 145 / 14%);
		color: #f2dc91;
		animation: glow 3s ease-in-out infinite;
	}
	h2 {
		color: #f2dc91;
		font-size: clamp(1.8rem, 4vw, 2.3rem);
		font-weight: 850;
	}
	.facts {
		color: rgb(248 242 229 / 65%);
		font-size: 0.9rem;
	}
	h3 {
		margin-top: 0.4rem;
		color: #f2dc91;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.18em;
		text-align: left;
		text-transform: uppercase;
	}
	ul {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.payments li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 0.8rem;
		background: linear-gradient(90deg, rgb(242 220 145 / 10%), rgb(255 255 255 / 3%));
		padding: 0.7rem 0.9rem;
		animation: rise 420ms calc(300ms + var(--i) * 120ms) both ease-out;
	}
	.payments li.mine {
		box-shadow: inset 0 0 0 1px rgb(242 220 145 / 55%);
	}
	.arrow {
		color: rgb(248 242 229 / 55%);
		font-size: 0.85rem;
	}
	.amount {
		margin-left: auto;
		color: #f2dc91;
		font-size: 1.15rem;
		font-weight: 850;
		font-variant-numeric: tabular-nums;
	}
	.square {
		color: rgb(248 242 229 / 75%);
	}
	.people {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
	}
	.people li {
		border-radius: 999px;
		background: rgb(255 255 255 / 5%);
		padding: 0.25rem 0.7rem;
		font-size: 0.85rem;
	}
	.people li.me {
		box-shadow: inset 0 0 0 1px rgb(242 220 145 / 40%);
	}
	.people strong {
		margin-left: 0.3rem;
	}
	.up {
		color: #8fe0a8;
	}
	.down {
		color: #ee9a8c;
	}
	.highlights {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem;
		margin: 0.3rem 0 0;
	}
	.highlights div {
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.6rem 0.8rem;
		text-align: left;
	}
	.highlights dt {
		color: rgb(248 242 229 / 55%);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.highlights dd {
		margin: 0.15rem 0 0;
		font-weight: 700;
	}
	.highlights small {
		color: rgb(248 242 229 / 55%);
		font-weight: 500;
	}
	.thanks {
		color: rgb(248 242 229 / 60%);
		font-size: 0.82rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
		margin-top: 0.3rem;
	}
	.actions button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border-radius: 999px;
		padding: 0.65rem 1.3rem;
		font-weight: 800;
		cursor: pointer;
	}
	.ghost {
		border: 1px solid rgb(242 220 145 / 45%);
		color: #f2dc91;
	}
	.primary {
		background: linear-gradient(180deg, #f2dc91, #e1ca89);
		color: #211c2e;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@keyframes glow {
		50% {
			box-shadow: 0 0 26px rgb(242 220 145 / 40%);
		}
	}
</style>
