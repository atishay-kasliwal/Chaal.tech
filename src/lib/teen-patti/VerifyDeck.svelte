<script lang="ts">
	import { CheckCircle2, XCircle, Lock } from '@lucide/svelte';
	import { cardText } from './table-cards.js';

	/**
	 * Check last hand's deck right here in the browser: every shown card's fingerprint must sit at
	 * its place in the sealed list, and the list must add up to the fingerprint published before the
	 * cut. Packed hands that were never shown stay secret.
	 */
	let {
		proof,
		names
	}: {
		proof: {
			commitment: string;
			cutAt: number;
			by: string | null;
			leaves: string[];
			cards: { pos: number; rank: number; suit: string; salt: string }[];
		};
		/** Who cut, by id. */
		names: Record<string, string>;
	} = $props();

	const sha256 = async (text: string) => {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
		return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	};
	let sealOk = $state<boolean | null>(null);
	let cardOk = $state<boolean[]>([]);
	$effect(() => {
		const current = proof;
		void (async () => {
			sealOk = (await sha256(current.leaves.join(''))) === current.commitment;
			cardOk = await Promise.all(
				current.cards.map(
					async (card) =>
						(await sha256(`${card.pos}|${card.rank}|${card.suit}|${card.salt}`)) ===
						current.leaves[card.pos]
				)
			);
		})();
	});
	const allOk = $derived(sealOk === true && cardOk.length > 0 && cardOk.every(Boolean));
</script>

<div class="verify">
	<p class="verdict" class:ok={allOk} class:bad={sealOk === false || cardOk.some((ok) => !ok)}>
		{#if sealOk === null}
			Checking…
		{:else if allOk}
			<CheckCircle2 size={20} /> Fair deck: every shown card was exactly where the sealed deck had it
		{:else if !proof.cards.length}
			Nobody showed cards this hand, so there is nothing to check.
		{:else}
			<XCircle size={20} /> Something doesn’t match. Tell the host.
		{/if}
	</p>
	<dl>
		<dt><Lock size={13} /> Sealed before the cut</dt>
		<dd class="mono">{proof.commitment}</dd>
		<dt>Cut</dt>
		<dd>After card {proof.cutAt}{proof.by && names[proof.by] ? `, by ${names[proof.by]}` : ''}</dd>
	</dl>
	{#if proof.cards.length}
		<ul>
			{#each proof.cards as card, index (card.pos)}
				<li class:ok={cardOk[index]}>
					<strong>{cardText(card)}</strong>
					<span>card {card.pos + 1} of the sealed deck</span>
					{#if cardOk[index] === true}<CheckCircle2
							size={15}
						/>{:else if cardOk[index] === false}<XCircle size={15} />{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<p class="how">
		How it works: before anyone cut, the server shuffled the deck and published one fingerprint for
		all 52 places. The cut was yours to choose. After the hand it reveals the secret of each shown
		card, and your phone checks it against that fingerprint. Packed cards stay hidden.
	</p>
</div>

<style>
	.verify {
		display: grid;
		gap: 0.9rem;
		color: #f1ebdc;
	}
	.verdict {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 5%);
		padding: 0.7rem 0.9rem;
		font-weight: 750;
	}
	.verdict.ok {
		background: rgb(111 224 160 / 12%);
		color: #8fe0a8;
	}
	.verdict.bad {
		background: rgb(224 69 90 / 14%);
		color: #ff8b98;
	}
	dl {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	dt {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: rgb(241 235 220 / 60%);
	}
	dd {
		margin: 0 0 0.4rem;
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		word-break: break-all;
		color: #f4d68c;
	}
	ul {
		display: grid;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.88rem;
	}
	li strong {
		min-width: 2.6rem;
	}
	li span {
		color: rgb(241 235 220 / 60%);
	}
	li.ok :global(svg) {
		color: #8fe0a8;
	}
	.how {
		color: rgb(241 235 220 / 55%);
		font-size: 0.8rem;
		line-height: 1.45;
	}
</style>
