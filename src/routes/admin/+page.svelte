<script lang="ts">
	import { properName } from '#lib/names.js';
	import { asset } from '$app/paths';
	import ClubGate from '#lib/club/ClubGate.svelte';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import LineupEditor from '#lib/club/LineupEditor.svelte';
	import { MASCOT_NAMES } from '#lib/mascots/catalog.js';
	import Mascot from '#lib/mascots/Mascot.svelte';
	import { MASCOT_SIZE } from '#lib/mascots/size.js';
	import { club, DEFAULT_CLUB_SETTINGS, type ClubSettings } from '#lib/club/club.svelte.js';
	import { ago, fairPhrase, gameName as gameTitle, resultsPhrase, signed } from '#lib/analytics/format.js';

	/** Owner tools: the guest list, live tables, table defaults, the table look and beta emails. */
	interface AdminMember {
		memberId: string;
		email: string;
		nickname: string;
		role: 'owner' | 'member';
		status: 'invited' | 'active' | 'suspended';
		characterId: string | null;
		mascotId: string | null;
		signedIn: boolean;
		betaOptOut: boolean;
		betaSteps: number[];
	}
	interface LobbyTable {
		name: string;
		gameType: string;
		playerCount: number;
		botCount: number;
		maxPlayers: number;
		isStarted: boolean;
		hostName: string | null;
		boot: number | null;
		table: number;
		connectedMembers: string[];
	}

	/** One member on the normalised basis (server/analytics/api.mjs adminAnalytics). */
	interface MemberStats {
		memberId: string | null;
		playerId: string;
		hands: number;
		nights: number;
		games: Record<string, number>;
		withBots: number;
		fairShare: { verdict: string; hands: number; wins: number; expected: number; ratio: number | null };
		results: { verdict: string; hands: number; perHand: number | null; perHandLow: number | null; perHandHigh: number | null; units: number };
		lastPlayedAt: number | null;
		lastSeenAt: string | null;
	}
	interface Analytics {
		totals: { hands: number; nights: number; players: number };
		variants: Record<string, number>;
		members: MemberStats[];
	}

	const TABS = [
		['members', 'Members'],
		['analytics', 'Analytics'],
		['tables', 'Live tables'],
		['lineup', 'Lineup'],
		['defaults', 'Table defaults'],
		['look', 'Look'],
		['beta', 'Game night']
	] as const;
	const BOOTS = [5, 10, 20, 50, 100];
	const LIMITS = [0, 64, 128, 256, 512];
	const FELTS = [
		['emerald', 'Emerald', '#1f7a4c'],
		['sapphire', 'Sapphire', '#22568f'],
		['crimson', 'Crimson', '#8c2633'],
		['onyx', 'Onyx', '#33403b']
	] as const;
	const BACKS = [
		['navy', 'Navy'],
		['crimson', 'Crimson'],
		['forest', 'Forest']
	] as const;
	const gameName: Record<string, string> = {
		'teen-patti': 'Teen Patti',
		'texas-holdem': 'Texas Hold’em',
		blackjack: 'Blackjack',
		rummy: 'Indian Rummy'
	};

	let tab = $state<(typeof TABS)[number][0]>('members');
	let members = $state<AdminMember[]>([]);
	let tables = $state<LobbyTable[]>([]);
	let online = $state<string[]>([]);
	let beta = $state<{ label: string } | null>(null);
	interface Poll {
		days: string[];
		openedAt: string;
		people: { memberId: string; name: string; link: string | null; slots: string[] | null }[];
		best: { slot: string; free: string[] }[];
	}
	let poll = $state<Poll | null>(null);
	let copiedFor = $state('');
	const answered = $derived(poll?.people.filter((person) => person.slots) ?? []);
	const waiting = $derived(poll?.people.filter((person) => !person.slots) ?? []);
	const inZone = (iso: string, tz: string, short: string) =>
		`${new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))}, ${new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))} ${short}`;
	const india = (iso: string) => inZone(iso, 'Asia/Kolkata', 'IST');
	const indiaDay = (day: string) =>
		new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Asia/Kolkata',
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		}).format(new Date(`${day}T12:00:00+05:30`));
	const eastern = (iso: string) => inZone(iso, 'America/New_York', 'ET');
	async function copyLink(person: Poll['people'][number]) {
		if (!person.link) return;
		try {
			await navigator.clipboard.writeText(person.link);
			copiedFor = person.memberId;
		} catch {
			notice = person.link;
		}
	}
	let analytics = $state<Analytics | null>(null);
	let analyticsWindow = $state<'all' | '30d' | 'recent-nights'>('all');
	let analyticsSort = $state<'results' | 'hands' | 'active'>('results');
	const WINDOWS = [
		['all', 'All time'],
		['30d', 'Last 30 days'],
		['recent-nights', 'Recent nights']
	] as const;
	const activeAt = (row: MemberStats) =>
		Math.max(row.lastPlayedAt ?? 0, row.lastSeenAt ? Date.parse(row.lastSeenAt) : 0);
	const statsRows = $derived(
		(analytics?.members ?? [])
			.map((row) => ({ row, member: members.find((m) => m.memberId === row.memberId) }))
			.filter(({ member }) => member && member.status !== 'invited')
			.sort((x, y) =>
				analyticsSort === 'hands'
					? y.row.hands - x.row.hands
					: analyticsSort === 'active'
						? activeAt(y.row) - activeAt(x.row)
						: (y.row.results.perHand ?? -Infinity) - (x.row.results.perHand ?? -Infinity) || y.row.hands - x.row.hands
			)
	);

	async function loadAnalytics(window = analyticsWindow) {
		analyticsWindow = window;
		const { response, body } = await club.request(`/admin?analytics=${window}`);
		if (!response.ok) {
			error = body.error || 'Can’t reach the club right now.';
			return;
		}
		apply(body);
	}
	$effect(() => {
		if (ready && tab === 'analytics' && !analytics) void loadAnalytics();
	});

	let draft = $state<ClubSettings>(structuredClone(DEFAULT_CLUB_SETTINGS));
	let loaded = $state(false);
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');

	// Add-member form.
	let newEmail = $state('');
	let newNickname = $state('');
	let newOwner = $state(false);
	let newNotify = $state(true);

	const isOwner = $derived(club.member?.role === 'owner');
	const ready = $derived(club.status === 'signedIn' && !!club.member?.onboarded && isOwner);
	const nameOf = (id: string) =>
		members.find((member) => member.memberId === id)?.nickname || 'A friend';
	const settingsChanged = $derived(JSON.stringify(draft) !== JSON.stringify(club.settings));

	function apply(body: {
		members: AdminMember[];
		tables: LobbyTable[];
		online: string[];
		settings: ClubSettings;
		beta: { label: string } | null;
		poll: Poll | null;
		notice?: string;
		analytics?: Analytics;
	}) {
		if (body.analytics) analytics = body.analytics;
		members = body.members;
		tables = body.tables;
		online = body.online;
		beta = body.beta;
		poll = body.poll;
		club.applySettings(body.settings);
		draft = structuredClone($state.snapshot(club.settings));
		notice = body.notice ?? '';
	}

	/** The live table an owner is about to end (asking after this hand or now). */
	let endingTable = $state<string | null>(null);

	async function send(payload?: Record<string, unknown>) {
		busy = true;
		error = '';
		try {
			const { response, body } = await club.request(
				'/admin',
				payload ? { method: 'POST', body: JSON.stringify(payload) } : {}
			);
			if (!response.ok) throw new Error(body.error);
			apply(body);
			return true;
		} catch (failure) {
			error =
				failure instanceof Error && failure.message
					? failure.message
					: 'Can’t reach the club right now.';
			return false;
		} finally {
			busy = false;
			loaded = true;
		}
	}

	$effect(() => {
		if (ready) void send();
	});

	async function linkMascot(member: AdminMember, select: HTMLSelectElement) {
		const mascotId = select.value || null;
		select.value = member.mascotId ?? '';
		if (await send({ action: 'mascot', memberId: member.memberId, mascotId })) await club.refresh();
	}

	async function addFriend(event: Event) {
		event.preventDefault();
		const ok = await send({
			action: 'add',
			email: newEmail,
			nickname: newNickname,
			role: newOwner ? 'owner' : 'member',
			notify: newNotify
		});
		if (ok) {
			newEmail = newNickname = '';
			newOwner = false;
		}
	}

	function saveSettings() {
		void send({ action: 'settings', settings: draft }).then((ok) => {
			if (ok) notice = 'Saved. Open tables pick up mascot size changes within 15 seconds.';
		});
	}

	const statusLabel = (member: AdminMember) =>
		member.status === 'suspended' ? 'Paused' : member.signedIn ? 'Signed in' : 'Invited';
</script>

<svelte:head><title>Admin · Chaal</title></svelte:head>

<ClubGate>
	<div class="admin">
		<header>
			<p class="eyebrow">Club owner</p>
			<h1>Admin</h1>
		</header>

		{#if !isOwner}
			<p class="note">Only club owners can open this page.</p>
		{:else}
			<nav class="tabs" aria-label="Admin sections">
				{#each TABS as [id, label] (id)}
					<button
						type="button"
						class:on={tab === id}
						aria-current={tab === id ? 'page' : undefined}
						onclick={() => (tab = id)}>{label}</button
					>
				{/each}
			</nav>

			{#if error}<p class="alert error" role="alert">{error}</p>{/if}
			{#if notice}<p class="alert" role="status">{notice}</p>{/if}

			{#if !loaded}
				<p class="note">Loading…</p>
			{:else if tab === 'members'}
				<section class="card">
					<h2>Add a friend</h2>
					<form class="add" onsubmit={addFriend}>
						<input
							bind:value={newEmail}
							type="email"
							required
							placeholder="friend@gmail.com"
							aria-label="Their Google email"
							autocomplete="off"
						/>
						<input
							bind:value={newNickname}
							maxlength="24"
							placeholder="Nickname"
							aria-label="Nickname"
						/>
						<label class="check"><input type="checkbox" bind:checked={newOwner} /> Owner</label>
						<label class="check"
							><input type="checkbox" bind:checked={newNotify} /> Email them</label
						>
						<button class="primary" disabled={busy || !newEmail}>Add</button>
					</form>
					<p class="note">
						They sign in with that Google account. “Email them” sends a short note telling them so.
					</p>
				</section>

				<section class="card">
					<h2>Guest list <small>{members.length}</small></h2>
					<ul class="rows">
						{#each members as member (member.memberId)}
							{@const self = member.memberId === club.member?.memberId}
							<li class:paused={member.status === 'suspended'}>
								<CharacterAvatar
									memberId={member.memberId}
									characterId={member.characterId ?? undefined}
									size={36}
								/>
								<div class="who">
									<strong
										>{properName(member.nickname) || member.email}{#if self}
											<span class="you">you</span>{/if}</strong
									>
									<small>{member.email}</small>
								</div>
								<span class="tag" class:owner={member.role === 'owner'}>{member.role}</span>
								<span
									class="tag"
									class:live={online.includes(member.memberId)}
									class:warn={member.status === 'suspended'}
									>{online.includes(member.memberId) ? 'Online' : statusLabel(member)}</span
								>
								<div class="actions">
									<label class="mascot-choice"
										><span>Mascot</span><select
											aria-label="Mascot for {properName(member.nickname) || member.email}"
											value={member.mascotId ?? ''}
											disabled={busy}
											onchange={(event) => linkMascot(member, event.currentTarget)}
											><option value="">None</option
											>{#each Object.entries(MASCOT_NAMES) as [id, name] (id)}<option value={id}
													>{name}</option
												>{/each}</select
										></label
									>
									{#if member.role === 'member'}
										<button
											disabled={busy}
											onclick={() =>
												send({ action: 'role', memberId: member.memberId, role: 'owner' })}
											>Make owner</button
										>
									{:else if !self}
										<button
											disabled={busy}
											onclick={() =>
												send({ action: 'role', memberId: member.memberId, role: 'member' })}
											>Make member</button
										>
									{/if}
									{#if !self}
										{#if member.status === 'suspended'}
											<button
												disabled={busy}
												onclick={() => send({ action: 'restore', memberId: member.memberId })}
												>Restore</button
											>
										{:else}
											<button
												class="danger"
												disabled={busy}
												onclick={() =>
													confirm(
														`Pause ${properName(member.nickname) || member.email}? They are signed out now.`
													) && send({ action: 'pause', memberId: member.memberId })}>Pause</button
											>
										{/if}
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{:else if tab === 'analytics'}
				<section class="card">
					<h2>
						How everyone is doing
						<small
							>{analytics
								? `${analytics.totals.hands.toLocaleString('en-IN')} hands · ${analytics.totals.nights} nights · ${analytics.totals.players} playing`
								: ''}</small
						>
					</h2>
					<div class="pills">
						{#each WINDOWS as [id, label] (id)}
							<button
								type="button"
								class:on={analyticsWindow === id}
								onclick={() => loadAnalytics(id)}>{label}</button
							>
						{/each}
						<label class="sort"
							>Sort <select bind:value={analyticsSort}
								><option value="results">Results</option><option value="hands">Hands</option><option
									value="active">Last active</option
								></select
							></label
						>
					</div>
					<p class="note">
						Results are in boots (Hold’em big blinds, Blackjack bets), so tables with different
						stakes compare fairly. Wins are judged against a fair share: one in two heads-up, one
						in six at a full table. Recorded hands only; the leaderboard keeps older history.
					</p>
					{#if !analytics}
						<p class="note">Loading…</p>
					{:else}
						<ul class="rows">
							{#each statsRows as { row, member } (row.playerId)}
								<li class="stat-row">
									<CharacterAvatar
										memberId={row.memberId ?? undefined}
										characterId={member?.characterId ?? undefined}
										size={36}
									/>
									<div class="who">
										<strong>{properName(member?.nickname ?? '') || member?.email}</strong>
										<small>Seen {ago(row.lastSeenAt)} · played {ago(row.lastPlayedAt)}</small>
									</div>
									<span
										class="net"
										class:up={row.results.verdict === 'winning'}
										class:down={row.results.verdict === 'losing'}
										>{resultsPhrase(row.results)}</span
									>
									<dl class="stats">
										<div><dt>Hands</dt><dd>{row.hands}</dd></div>
										<div><dt>Nights</dt><dd>{row.nights}</dd></div>
										<div>
											<dt>Boots a hand</dt>
											<dd>
												{signed(row.results.perHand, 2)}{#if row.results.perHandLow !== null}<span class="ci"
														>{signed(row.results.perHandLow, 1)} to {signed(row.results.perHandHigh, 1)}</span
													>{/if}
											</dd>
										</div>
										<div>
											<dt>Wins vs fair share</dt>
											<dd>{row.fairShare.wins} / {row.fairShare.expected}</dd>
										</div>
										<div><dt>With bots</dt><dd>{row.withBots}</dd></div>
									</dl>
									<small class="games">{fairPhrase(row.fairShare)}</small>
									{#if Object.keys(row.games).length}
										<small class="games"
											>{Object.entries(row.games)
												.sort((a, b) => b[1] - a[1])
												.map(([game, hands]) => `${gameTitle(game)} ${hands}`)
												.join(' · ')}</small
										>
									{/if}
								</li>
							{:else}
								<li><span class="note">No recorded hands in this period yet.</span></li>
							{/each}
						</ul>
					{/if}
				</section>
			{:else if tab === 'tables'}
				<section class="card">
					<h2>Live tables <small>{tables.length}</small></h2>
					{#if !tables.length}
						<p class="note">No tables open right now.</p>
					{:else}
						<ul class="rows">
							{#each tables as table (table.name)}
								<li>
									<div class="who">
										<strong>{gameName[table.gameType] ?? table.gameType}</strong>
										<small>
											{table.hostName
												? `Host ${table.hostName} · `
												: ''}{table.playerCount}/{table.maxPlayers}
											seated{table.botCount ? ` · ${table.botCount} bots` : ''}{table.boot
												? ` · boot ₹${table.boot}`
												: ''}
										</small>
										{#if table.connectedMembers.length}
											<small class="names">{table.connectedMembers.map(nameOf).join(', ')}</small>
										{/if}
									</div>
									<span class="tag" class:live={table.isStarted}
										>{table.isStarted ? 'Playing' : 'Waiting'}</span
									>
									<a class="open" href="/{table.name}">Open</a>
									{#if endingTable === table.name}
										<span class="end-choices">
											{#if table.isStarted}
												<button
													class="end"
													disabled={busy}
													onclick={() =>
														void send({
															action: 'end-table',
															room: table.name,
															mode: 'after-hand'
														}).then(() => (endingTable = null))}>After this hand</button
												>
												<button
													class="end ghost"
													disabled={busy}
													onclick={() =>
														void send({ action: 'end-table', room: table.name, mode: 'now' }).then(
															() => (endingTable = null)
														)}>Now, refund</button
												>
											{:else}
												<button
													class="end"
													disabled={busy}
													onclick={() =>
														void send({ action: 'end-table', room: table.name, mode: 'now' }).then(
															() => (endingTable = null)
														)}>End the night</button
												>
											{/if}
											<button class="end ghost" onclick={() => (endingTable = null)}>Cancel</button>
										</span>
									{:else}
										<button class="end ghost" onclick={() => (endingTable = table.name)}
											>End…</button
										>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{:else if tab === 'lineup'}
				<section class="card">
					<h2>Tonight’s lineup</h2>
					<p class="note">
						The games in play order. Every table follows it; whoever picks the next game can still
						choose another. Everyone sees it from the lineup button at the table.
					</p>
					<LineupEditor
						lineup={club.settings.lineup ?? []}
						hands={club.settings.lineupHands ?? 1}
						editable
						saving={busy}
						onsave={(lineup, hands) => void send({ action: 'lineup', lineup, hands })}
					/>
				</section>
			{:else if tab === 'defaults'}
				<section class="card">
					<h2>Table defaults</h2>
					<p class="note">What a new table starts with. Hosts can still change it per game.</p>
					<label class="field"
						><span>Starting chips per player</span>
						<input
							type="number"
							min="1000"
							max="1000000"
							step="100"
							bind:value={draft.table.chips}
						/></label
					>
					<div class="field">
						<span>Boot</span>
						<div class="pills">
							{#each BOOTS as value (value)}
								<button
									type="button"
									class:on={draft.table.boot === value}
									disabled={value * 20 > draft.table.chips}
									onclick={() => (draft.table.boot = value)}>₹{value}</button
								>
							{/each}
						</div>
					</div>
					<div class="field">
						<span>Pot limit</span>
						<div class="pills">
							{#each LIMITS as value (value)}
								<button
									type="button"
									class:on={draft.table.potLimit === value}
									onclick={() => (draft.table.potLimit = value)}
									>{value
										? `₹${(value * draft.table.boot).toLocaleString('en-IN')}`
										: 'Off'}</button
								>
							{/each}
						</div>
					</div>
					<button class="primary" disabled={busy || !settingsChanged} onclick={saveSettings}
						>Save defaults</button
					>
				</section>
			{:else if tab === 'look'}
				<section class="card">
					<h2>Table look</h2>
					<p class="note">Everyone at every table sees this.</p>
					<div class="field">
						<span>Felt</span>
						<div class="swatches">
							{#each FELTS as [id, label, color] (id)}
								<button
									type="button"
									class="swatch"
									class:on={draft.look.felt === id}
									style:--swatch={color}
									onclick={() => (draft.look.felt = id)}
									><span class="felt-dot"></span>{label}</button
								>
							{/each}
						</div>
					</div>
					<div class="field">
						<span>Card back</span>
						<div class="backs">
							{#each BACKS as [id, label] (id)}
								<button
									type="button"
									class="back"
									class:on={draft.look.cardBack === id}
									onclick={() => (draft.look.cardBack = id)}
								>
									<img src={asset(`cards/back-${id}.svg`)} alt="" />
									{label}
								</button>
							{/each}
						</div>
					</div>
					<div class="field mascot-sizing">
						<label for="mascot-size"
							>Mascot size <output for="mascot-size"
								>{draft.mascotSize ?? MASCOT_SIZE.default}px</output
							></label
						>
						<input
							id="mascot-size"
							type="range"
							min={MASCOT_SIZE.min}
							max={MASCOT_SIZE.max}
							step={MASCOT_SIZE.step}
							bind:value={draft.mascotSize}
							disabled={busy}
						/>
						<p class="note">
							Same size for every friend. Save to update open tables within 15 seconds.
						</p>
						<div class="mascot-size-preview" aria-label="Mascot size preview">
							{#each Object.entries(MASCOT_NAMES) as [id, name] (id)}<figure>
									<Mascot
										{id}
										label={name}
										size={draft.mascotSize ?? MASCOT_SIZE.default}
										poke={false}
									/>
									<figcaption>{name}</figcaption>
								</figure>{/each}
						</div>
						<button
							type="button"
							disabled={busy}
							onclick={() => (draft.mascotSize = MASCOT_SIZE.default)}>Reset to 100px</button
						>
					</div>
					<button class="primary" disabled={busy || !settingsChanged} onclick={saveSettings}
						>Save look</button
					>
				</section>
			{:else if tab === 'beta'}
				<section class="card">
					<h2><span class="step">1</span> Ask everyone when they're free</h2>
					{#if poll}
						<p class="note">
							Asking about {poll.days.map(indiaDay).join(' and ')}
							(India dates). Each person gets their own link, no sign-in.
						</p>
						<div class="add">
							<button
								class="primary"
								disabled={busy}
								onclick={() =>
									confirm('Email every guest their link? Anyone already emailed is skipped.') &&
									send({ action: 'beta-send-all' })}>Email everyone their link</button
							>
							<button
								disabled={busy}
								class="ghost"
								onclick={() =>
									confirm(
										'Start a new round? Old links stop working, answers and the picked time are cleared, and everyone can be emailed again.'
									) && send({ action: 'poll-open' })}>Start over</button
							>
						</div>
					{:else}
						<p class="note">
							Opens a poll for tomorrow and the day after. Friends tick the hours they're free;
							every hour shows in India time and US Eastern.
						</p>
						<button class="primary" disabled={busy} onclick={() => send({ action: 'poll-open' })}
							>Ask for availability</button
						>
					{/if}
				</section>

				{#if poll}
					<section class="card">
						<h2>
							<span class="step">2</span> Answers
							<small>{answered.length} of {poll.people.length}</small>
						</h2>
						<ul class="rows">
							{#each [...answered, ...waiting] as person (person.memberId)}
								<li>
									<div class="who">
										<strong>{properName(person.name)}</strong>
										<small>{person.slots ? `${person.slots.length} hours free` : 'Waiting'}</small>
									</div>
									<span class="tag" class:live={!!person.slots}
										>{person.slots ? 'Answered' : 'Waiting'}</span
									>
									{#if person.link}
										<button disabled={busy} onclick={() => copyLink(person)}
											>{copiedFor === person.memberId ? 'Copied' : 'Copy link'}</button
										>
									{/if}
								</li>
							{/each}
						</ul>
					</section>

					<section class="card">
						<h2><span class="step">3</span> Pick the time</h2>
						{#if beta}
							<p>Set for <strong>{beta.label}</strong>.</p>
							<button
								class="primary"
								disabled={busy}
								onclick={() =>
									confirm(`Email everyone that it's on: ${beta?.label}?`) &&
									send({ action: 'beta-send-all' })}>Email everyone the time</button
							>
						{:else if !poll.best.length}
							<p class="note">The best times show here as answers come in.</p>
						{:else}
							<p class="note">Best times first. Waiting on {waiting.length || 'nobody'}.</p>
							<ul class="rows">
								{#each poll.best as option (option.slot)}
									<li>
										<div class="who">
											<strong>{india(option.slot)}</strong>
											<small>{eastern(option.slot)}</small>
											<small class="names"
												>{option.free.length} free: {option.free.join(', ')}</small
											>
										</div>
										<button
											disabled={busy}
											onclick={() =>
												confirm(`Make it ${india(option.slot)} (${eastern(option.slot)})?`) &&
												send({ action: 'beta-night', start: option.slot })}>Pick this time</button
										>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/if}

				<section class="card">
					<h2>Who got what</h2>
					<ul class="rows">
						{#each members.filter((m) => m.status !== 'suspended') as member (member.memberId)}
							<li>
								<div class="who">
									<strong>{properName(member.nickname) || member.email}</strong>
									<small
										>{member.betaOptOut
											? 'No beta emails'
											: member.betaSteps.length
												? `Sent day ${member.betaSteps.join(', ')}`
												: 'Nothing sent yet'}</small
									>
								</div>
								{#if !member.betaOptOut}
									<button
										disabled={busy}
										onclick={() => send({ action: 'beta-send', memberId: member.memberId })}
										>Send what's due</button
									>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/if}
	</div>
</ClubGate>

<style>
	.end-choices {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.end {
		border-radius: 999px;
		background: #b8432f;
		padding: 0.3rem 0.8rem;
		color: #fff2ee;
		font-size: 0.82rem;
		font-weight: 800;
	}
	.end.ghost {
		border: 1px solid rgb(224 106 85 / 55%);
		background: transparent;
		color: #e0806e;
	}
	.admin {
		display: grid;
		gap: 1.1rem;
		margin: 0 auto;
		max-width: 46rem;
		padding: 1.5rem 0.5rem 3rem;
		color: #f1ebdc;
	}
	.eyebrow {
		color: #e2b862;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	h1 {
		font-size: 1.7rem;
		font-weight: 700;
	}
	h2 {
		margin-bottom: 0.7rem;
		font-size: 1.1rem;
		font-weight: 700;
	}
	h2 small {
		color: rgb(241 235 220 / 50%);
		font-size: 0.85rem;
	}
	.step {
		display: inline-grid;
		width: 1.4rem;
		height: 1.4rem;
		margin-right: 0.35rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(244 214 140 / 16%);
		color: #f4d68c;
		font-size: 0.75rem;
	}
	.ghost {
		border: 1px solid rgb(240 209 140 / 25%);
		border-radius: 999px;
		padding: 0.55rem 1rem;
		color: #f4d68c;
		cursor: pointer;
	}
	.tabs {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
	}
	.tabs button {
		flex-shrink: 0;
		border: 1px solid rgb(240 209 140 / 18%);
		border-radius: 999px;
		padding: 0.45rem 0.95rem;
		color: rgb(241 235 220 / 75%);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.tabs button.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.card {
		display: grid;
		gap: 0.6rem;
		border: 1px solid rgb(240 209 140 / 16%);
		border-radius: 1.2rem;
		background: #0f1a16;
		padding: 1.1rem;
	}
	.note {
		color: rgb(241 235 220 / 60%);
		font-size: 0.82rem;
	}
	.alert {
		border-radius: 0.8rem;
		background: rgb(95 211 138 / 12%);
		padding: 0.6rem 0.9rem;
		color: #a6e3bd;
		font-size: 0.85rem;
	}
	.alert.error {
		background: rgb(240 113 95 / 14%);
		color: #f3b0a5;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.add input:not([type='checkbox']),
	.field input {
		min-width: 0;
		flex: 1 1 10rem;
		border: 1px solid rgb(240 209 140 / 20%);
		border-radius: 0.7rem;
		background: rgb(0 0 0 / 25%);
		padding: 0.6rem 0.75rem;
		color: #f1ebdc;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
	}
	.primary {
		border-radius: 999px;
		background: linear-gradient(#f0d18c, #c9963d);
		padding: 0.6rem 1.2rem;
		color: #1c1406;
		font-weight: 700;
		cursor: pointer;
	}
	.primary:disabled {
		background: rgb(255 255 255 / 12%);
		color: rgb(241 235 220 / 50%);
		cursor: default;
	}
	.rows {
		display: grid;
		gap: 0.4rem;
	}
	.rows li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.55rem 0.7rem;
	}
	.rows li.paused {
		opacity: 0.6;
	}
	.who {
		display: flex;
		min-width: 9rem;
		flex: 1;
		flex-direction: column;
		line-height: 1.25;
	}
	.who small {
		color: rgb(241 235 220 / 55%);
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}
	.who .names {
		color: #a6e3bd;
	}
	.you {
		margin-left: 0.3rem;
		color: rgb(241 235 220 / 50%);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.tag {
		border-radius: 999px;
		background: rgb(255 255 255 / 6%);
		padding: 0.15rem 0.55rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.7rem;
		text-transform: capitalize;
	}
	.tag.owner {
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.tag.live {
		background: rgb(95 211 138 / 14%);
		color: #8fe0ad;
	}
	.tag.warn {
		background: rgb(240 113 95 / 14%);
		color: #f3b0a5;
	}
	.actions {
		display: flex;
		gap: 0.35rem;
	}
	.actions button,
	.rows li > button,
	.open {
		border: 1px solid rgb(240 209 140 / 22%);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		color: #f4d68c;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.actions button.danger {
		border-color: rgb(240 113 95 / 35%);
		color: #f3b0a5;
	}
	.field {
		display: grid;
		gap: 0.4rem;
	}
	.field > span {
		color: rgb(241 235 220 / 70%);
		font-size: 0.8rem;
	}
	.pills,
	.swatches,
	.backs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pills button,
	.swatch,
	.back {
		border: 1px solid rgb(240 209 140 / 20%);
		border-radius: 999px;
		padding: 0.35rem 0.8rem;
		color: #f1ebdc;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.pills button.on,
	.swatch.on,
	.back.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.pills button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.swatch {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.felt-dot {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 999px;
		background: radial-gradient(
			circle at 40% 35%,
			color-mix(in srgb, var(--swatch), white 18%),
			var(--swatch)
		);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 30%);
	}
	.back {
		display: grid;
		justify-items: center;
		gap: 0.3rem;
		border-radius: 0.9rem;
		padding: 0.5rem;
	}
	.back img {
		width: 3.6rem;
		border-radius: 0.3rem;
		box-shadow: 0 3px 8px rgb(0 0 0 / 45%);
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-left: auto;
		color: rgb(241 235 220 / 70%);
		font-size: 0.8rem;
	}
	.sort select {
		border: 1px solid rgb(240 209 140 / 20%);
		border-radius: 0.5rem;
		background: #122219;
		padding: 0.25rem 0.4rem;
		color: #f1ebdc;
	}
	.net {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.net.up {
		color: #8fe0ad;
	}
	.net.down {
		color: #f3b0a5;
	}
	.stats {
		display: grid;
		width: 100%;
		grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
		gap: 0.3rem;
	}
	.stats div {
		border-radius: 0.6rem;
		background: rgb(0 0 0 / 20%);
		padding: 0.3rem 0.5rem;
	}
	.stats dt {
		color: rgb(241 235 220 / 50%);
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.stats dd {
		font-size: 0.9rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.ci {
		display: block;
		color: rgb(241 235 220 / 45%);
		font-size: 0.65rem;
		font-weight: 500;
	}
	.games {
		width: 100%;
		color: rgb(241 235 220 / 55%);
		font-size: 0.75rem;
	}
	.mascot-choice {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		color: #cbb98f;
	}
	.mascot-choice select {
		max-width: 9rem;
		padding: 0.3rem;
		border: 1px solid #cbb98f44;
		border-radius: 0.4rem;
		background: #122219;
		color: #f1ebdc;
	}
	.mascot-sizing {
		border-top: 1px solid #d7c29125;
		padding-top: 1.25rem;
	}
	.mascot-sizing label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.mascot-sizing output {
		color: #e7c784;
		font-variant-numeric: tabular-nums;
	}
	.mascot-sizing input {
		width: min(100%, 32rem);
		accent-color: #d8b77b;
	}
	.mascot-size-preview {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-block: 0.5rem;
	}
	.mascot-size-preview figure {
		display: grid;
		justify-items: center;
		margin: 0;
	}
	.mascot-size-preview figcaption {
		color: #b5c2b2;
		font-size: 0.7rem;
	}
</style>
