<script lang="ts">
	/**
	 * A card face in the classic casino-deck style: warm white stock, card-red and near-black
	 * inks, and the four-colour court palette, drawn by Cardmeister. PlayingCard stays the
	 * original rendering; this is the deck the tables use.
	 */
	let {
		rank,
		suit,
		class: className = ''
	}: { rank: number | string; suit: string; class?: string } = $props();

	const s = $derived(suit.toString().toLowerCase());
	const displaySuit = $derived(
		s.includes('spade') || s === 's'
			? 'spades'
			: s.includes('heart') || s === 'h'
				? 'hearts'
				: s.includes('diamond') || s === 'd'
					? 'diamonds'
					: 'clubs'
	);
	const displayRank = $derived(
		({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<string, string>)[String(rank)] ??
			String(rank).toUpperCase()
	);
	const ink = $derived(
		displaySuit === 'hearts' || displaySuit === 'diamonds' ? '#c8102e' : '#111111'
	);

	/**
	 * Cardmeister hard-codes a violet frame (#44f) round the court figures, and the vendored
	 * script stays byte-identical, so the rendered image is recoloured to the deck's navy here.
	 */
	let host: HTMLElement | undefined = $state();
	const COURT_FRAME = /(#|%23)44f(?![0-9a-f])/gi;
	function recolor() {
		const img = host?.querySelector('img');
		if (img && COURT_FRAME.test(img.src)) img.src = img.src.replace(COURT_FRAME, '%231e4ea1');
		COURT_FRAME.lastIndex = 0;
	}
	$effect(() => {
		if (!host) return;
		recolor();
		const watcher = new MutationObserver(recolor);
		watcher.observe(host, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['src']
		});
		return () => watcher.disconnect();
	});
</script>

<svelte:head>
	<script src="/vendor/cardmeister.js"></script>
</svelte:head>

<playing-card
	bind:this={host}
	class="block shrink-0 {className}"
	rank={displayRank}
	suit={displaySuit}
	cardcolor="#fffdf7"
	suitcolor={ink}
	rankcolor={ink}
	courtcolors="#f3c02c,#d1202f,#1e4ea1,#0d0d0d,#0d0d0d,4"
	bordercolor="#e6dfcf"
	borderline="1"
	borderradius="0.5rem"
	opacity="1"
></playing-card>
