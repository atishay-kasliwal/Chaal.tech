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
	import {
		ago,
		fairPhrase,
		gameName as gameTitle,
		resultsPhrase,
		signed
	} from '#lib/analytics/format.js';

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
		fairShare: {
			verdict: string;
			hands: number;
			wins: number;
			expected: number;
			ratio: number | null;
		};
		results: {
			verdict: string;
			hands: number;
			perHand: number | null;
			perHandLow: number | null;
			perHandHigh: number | null;
			units: number;
		};
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
		rummy: 'Indian Rummy',
		'three-two-five': '3 2 5',
		'ten-pakad': '10 Pakad',
		'twenty-nine': '29'
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
	// Lead with who is playing, not with a league table of results.
	let analyticsSort = $state<'results' | 'hands' | 'active'>('active');
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
						: (y.row.results.perHand ?? -Infinity) - (x.row.results.perHand ?? -Infinity) ||
							y.row.hands - x.row.hands
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

	/** What each section holds right now, shown beside it on the spine. */
	const sectionMeta = (id: (typeof TABS)[number][0]) =>
		id === 'members'
			? `${members.length}`
			: id === 'analytics'
				? analytics
					? `${analytics.totals.hands.toLocaleString('en-IN')} hands`
					: ''
				: id === 'tables'
					? `${tables.length}`
					: id === 'lineup'
						? `${(club.settings.lineup ?? []).length} games`
						: id === 'defaults'
							? `₹${draft.table.boot} boot`
							: id === 'look'
								? (FELTS.find(([felt]) => felt === draft.look.felt)?.[1] ?? '')
								: poll
									? `${answered.length} of ${poll.people.length}`
									: '';
	const tabIndex = $derived(TABS.findIndex(([id]) => id === tab));

	const statusLabel = (member: AdminMember) =>
		member.status === 'suspended' ? 'Paused' : member.signedIn ? 'Signed in' : 'Invited';
</script>

<svelte:head><title>Admin · Chaal</title></svelte:head>

<ClubGate>
	<div class="admin">
		<header class="masthead">
			<div class="title">
				<p class="kicker">Club owner</p>
				<h1>Behind the club.</h1>
			</div>
			{#if isOwner && loaded}
				<dl class="tonight" aria-label="Right now">
					<div>
						<dt>Members</dt>
						<dd>{members.filter((m) => m.status !== 'suspended').length}</dd>
					</div>
					<div>
						<dt><span class="dot" class:live={online.length > 0}></span>Online now</dt>
						<dd>{online.length}</dd>
					</div>
					<div>
						<dt>Tables open</dt>
						<dd>{tables.length}</dd>
					</div>
				</dl>
			{/if}
			<nav class="out" aria-label="More owner tools">
				<a href="/admin/bots">Manage characters <span aria-hidden="true">↗</span></a>
				<a href="/admin/intel">Club intelligence <span aria-hidden="true">↗</span></a>
			</nav>
		</header>

		{#if !isOwner}
			<p class="note">Only club owners can open this page.</p>
		{:else}
			<div class="desk">
				<nav class="spine" aria-label="Admin sections" style:--at={tabIndex}>
					<span class="marker" aria-hidden="true"></span>
					{#each TABS as [id, label] (id)}
						<button
							type="button"
							class:on={tab === id}
							aria-current={tab === id ? 'page' : undefined}
							onclick={() => (tab = id)}
							><span class="tab-name">{label}</span><span class="meta">{sectionMeta(id)}</span
							></button
						>
					{/each}
				</nav>

				<div class="ledger">
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
								They sign in with that Google account. “Email them” sends a short note telling them
								so.
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
															) && send({ action: 'pause', memberId: member.memberId })}
														>Pause</button
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
										><option value="results">Results</option><option value="hands">Hands</option
										><option value="active">Last active</option></select
									></label
								>
							</div>
							<p class="note">
								Results are in boots (Hold’em big blinds, Blackjack bets), so tables with different
								stakes compare fairly. Wins are judged against a fair share: one in two heads-up,
								one in six at a full table. Recorded hands only; the leaderboard keeps older
								history.
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
												<div>
													<dt>Hands</dt>
													<dd>{row.hands}</dd>
												</div>
												<div>
													<dt>Nights</dt>
													<dd>{row.nights}</dd>
												</div>
												<div>
													<dt>Boots a hand</dt>
													<dd>
														{signed(
															row.results.perHand,
															2
														)}{#if row.results.perHandLow !== null}<span class="ci"
																>{signed(row.results.perHandLow, 1)} to {signed(
																	row.results.perHandHigh,
																	1
																)}</span
															>{/if}
													</dd>
												</div>
												<div>
													<dt>Wins vs fair share</dt>
													<dd>{row.fairShare.wins} / {row.fairShare.expected}</dd>
												</div>
												<div>
													<dt>With bots</dt>
													<dd>{row.withBots}</dd>
												</div>
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
													<small class="names"
														>{table.connectedMembers.map(nameOf).join(', ')}</small
													>
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
																void send({
																	action: 'end-table',
																	room: table.name,
																	mode: 'now'
																}).then(() => (endingTable = null))}>Now, refund</button
														>
													{:else}
														<button
															class="end"
															disabled={busy}
															onclick={() =>
																void send({
																	action: 'end-table',
																	room: table.name,
																	mode: 'now'
																}).then(() => (endingTable = null))}>End the night</button
														>
													{/if}
													<button class="end ghost" onclick={() => (endingTable = null)}
														>Cancel</button
													>
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
								The games in play order. Every table follows it; whoever picks the next game can
								still choose another. Everyone sees it from the lineup button at the table.
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
								<button
									class="primary"
									disabled={busy}
									onclick={() => send({ action: 'poll-open' })}>Ask for availability</button
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
												<small
													>{person.slots ? `${person.slots.length} hours free` : 'Waiting'}</small
												>
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
														send({ action: 'beta-night', start: option.slot })}
													>Pick this time</button
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
				</div>
			</div>
		{/if}
	</div>
</ClubGate>

<style>
	/* The host's ledger (docs/design/ADMIN.md): a masthead with tonight's numbers, the sections on a
	   spine with what each holds, and ruled panels. Site tokens only. */
	.admin {
		--live: #8fe0ad;
		--alarm: #f3b0a5;
		display: grid;
		gap: 32px;
		max-width: var(--page-max, 1200px);
		margin: 0 auto;
		/* The site's main already sets the side gutter. */
		padding: 48px 0 64px;
		color: var(--paper);
	}

	/* ------------------------------ masthead ------------------------------ */
	.masthead {
		display: grid;
		grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
		align-items: end;
		gap: 16px 32px;
		padding-bottom: 28px;
		border-bottom: 1px solid var(--line);
	}
	.kicker {
		margin-bottom: 12px;
		color: var(--muted);
		font-size: 13px;
	}
	h1 {
		margin-left: -0.04em;
		font-family: var(--font-display);
		font-size: clamp(48px, 6.4vw, 92px);
		font-weight: 800;
		line-height: 0.92;
		letter-spacing: -0.06em;
	}
	.tonight {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-left: 1px solid var(--line);
	}
	.tonight div {
		padding: 4px 0 4px 20px;
		border-right: 1px solid var(--line);
	}
	.tonight div:last-child {
		border-right: 0;
	}
	.tonight dt {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-size: 12px;
	}
	.tonight dd {
		font-family: var(--font-display);
		font-size: clamp(34px, 3.6vw, 52px);
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--muted);
		opacity: 0.5;
	}
	.dot.live {
		background: var(--live);
		opacity: 1;
		animation: breathe 2.6s ease-in-out infinite;
	}
	@keyframes breathe {
		50% {
			box-shadow: 0 0 0 5px #8fe0ad22;
		}
	}
	.out {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 8px 28px;
	}
	.out a {
		display: inline-flex;
		gap: 8px;
		padding-bottom: 3px;
		border-bottom: 1px solid currentColor;
		font-size: 14px;
		font-weight: 650;
	}
	.out a span {
		transition: translate 0.2s;
	}
	.out a:hover span,
	.out a:focus-visible span {
		translate: 2px -2px;
	}
	.out a:hover,
	.out a:focus-visible {
		color: var(--butter);
	}

	/* -------------------------- spine and ledger -------------------------- */
	.desk {
		display: grid;
		grid-template-columns: 232px minmax(0, 1fr);
		align-items: start;
		gap: 40px;
	}
	.spine {
		--row: 52px;
		position: sticky;
		top: calc(var(--header-h, 64px) + 24px);
		display: grid;
		border-top: 1px solid var(--line);
	}
	.spine button {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		height: var(--row);
		padding: 0 14px;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
		font-size: 15px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
		transition: color 0.2s;
	}
	.spine button:hover {
		color: var(--paper);
	}
	.spine button.on {
		color: var(--night);
	}
	.meta {
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		opacity: 0.75;
		white-space: nowrap;
	}
	/* The index marker: one butter tab that slides to the chosen section. */
	.marker {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: calc(var(--row) - 1px);
		border-radius: 0 10px 10px 0;
		background: var(--butter);
		translate: 0 calc(var(--at, 0) * var(--row));
		transition: translate 0.35s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.ledger {
		display: grid;
		gap: 20px;
		min-width: 0;
	}

	/* ------------------------------- panels ------------------------------- */
	.card {
		display: grid;
		gap: 14px;
		padding: 26px 28px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}
	h2 {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.035em;
	}
	h2 small {
		color: var(--muted);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0;
	}
	.step {
		display: inline-grid;
		width: 26px;
		height: 26px;
		place-items: center;
		border-radius: 50%;
		background: #f2dc9124;
		color: var(--butter);
		font-size: 13px;
		align-self: center;
	}
	.note {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.5;
	}
	.alert {
		padding: 12px 16px;
		border-left: 3px solid var(--live);
		border-radius: 8px;
		background: #8fe0ad14;
		color: #c5efd4;
		font-size: 14px;
	}
	.alert.error {
		border-left-color: var(--red);
		background: #ee715b17;
		color: var(--alarm);
	}

	/* -------------------------------- forms ------------------------------- */
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.add input:not([type='checkbox']),
	.field input:not([type='range']) {
		min-width: 0;
		flex: 1 1 11rem;
		height: 46px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: #0000002e;
		color: var(--paper);
		transition: border-color 0.2s;
	}
	.add input:focus,
	.field input:focus {
		border-color: var(--butter);
		outline: none;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
	}
	.check input,
	.mascot-sizing input {
		accent-color: var(--butter);
	}
	.field {
		display: grid;
		gap: 8px;
	}
	.field > span,
	.mascot-sizing label {
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
	}
	button:focus-visible,
	a:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--butter);
		outline-offset: 2px;
	}

	/* ------------------------------- buttons ------------------------------ */
	.primary {
		justify-self: start;
		min-height: 46px;
		padding: 0 22px;
		border-radius: 100px;
		background: var(--butter);
		color: var(--night);
		font-weight: 750;
		cursor: pointer;
		transition:
			translate 0.2s,
			box-shadow 0.2s;
	}
	.primary:hover:not(:disabled),
	.primary:focus-visible {
		translate: 0 -2px;
		box-shadow: 0 4px 0 #0000004d;
	}
	.primary:active:not(:disabled) {
		translate: 0 1px;
		box-shadow: none;
	}
	.primary:disabled {
		background: #ffffff14;
		color: var(--muted);
		cursor: default;
	}
	.ghost,
	.actions button,
	.rows li > button,
	.open,
	.mascot-sizing > button {
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		padding: 0 14px;
		border: 1px solid #f2dc9142;
		border-radius: 100px;
		color: var(--butter);
		font-size: 13px;
		font-weight: 650;
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.ghost:hover,
	.actions button:hover:not(:disabled),
	.rows li > button:hover:not(:disabled),
	.open:hover,
	.mascot-sizing > button:hover {
		background: var(--butter);
		color: var(--night);
	}
	.actions button.danger {
		border-color: #ee715b66;
		color: var(--alarm);
	}
	.actions button.danger:hover:not(:disabled) {
		background: var(--red);
		color: var(--night);
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.end-choices {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.end {
		min-height: 34px;
		padding: 0 14px;
		border-radius: 100px;
		background: var(--red);
		color: var(--night);
		font-size: 13px;
		font-weight: 750;
		cursor: pointer;
	}
	.end.ghost {
		border: 1px solid #ee715b66;
		background: transparent;
		color: var(--alarm);
	}
	.end.ghost:hover {
		background: var(--red);
		color: var(--night);
	}

	/* ------------------------------ ruled rows ----------------------------- */
	.rows {
		display: grid;
		border-top: 1px solid var(--line);
	}
	.rows li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 14px;
		padding: 14px 4px;
		border-bottom: 1px solid var(--line);
	}
	.rows li:last-child {
		border-bottom: 0;
	}
	.rows li.paused {
		opacity: 0.55;
	}
	.who {
		display: flex;
		min-width: 10rem;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		line-height: 1.3;
	}
	.who strong {
		font-size: 15px;
	}
	.who small {
		color: var(--muted);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.who .names {
		color: var(--live);
	}
	.you {
		margin-left: 6px;
		color: var(--muted);
		font-size: 12px;
		font-weight: 500;
	}
	.tag {
		padding: 3px 10px;
		border-radius: 100px;
		background: #ffffff10;
		color: var(--muted);
		font-size: 12px;
		font-weight: 650;
		display: inline-block;
	}
	/* Sentence case: only the first letter ('owner' reads Owner, 'Signed in' stays as written). */
	.tag::first-letter {
		text-transform: uppercase;
	}
	.tag.owner {
		background: #f2dc911f;
		color: var(--butter);
	}
	.tag.live {
		background: #8fe0ad1c;
		color: var(--live);
	}
	.tag.warn {
		background: #ee715b1c;
		color: var(--alarm);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.mascot-choice {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
		font-size: 12px;
	}
	.mascot-choice select,
	.sort select {
		min-height: 34px;
		max-width: 9rem;
		padding: 0 8px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--night);
		color: var(--paper);
	}

	/* ------------------------------ analytics ------------------------------ */
	.pills,
	.swatches,
	.backs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.pills button,
	.swatch,
	.back {
		min-height: 36px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 100px;
		color: var(--paper);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}
	.pills button:hover:not(:disabled),
	.swatch:hover,
	.back:hover {
		border-color: #f2dc9180;
	}
	.pills button.on,
	.swatch.on,
	.back.on {
		border-color: var(--butter);
		background: var(--butter);
		color: var(--night);
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
		color: var(--muted);
		font-size: 13px;
	}
	.net {
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.net.up {
		color: var(--live);
	}
	.net.down {
		color: var(--alarm);
	}
	.stats {
		display: grid;
		width: 100%;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		border: 1px solid var(--line);
		border-radius: 10px;
	}
	.stats div {
		padding: 8px 12px;
		border-right: 1px solid var(--line);
	}
	.stats div:last-child {
		border-right: 0;
	}
	.stats dt {
		color: var(--muted);
		font-size: 11px;
		font-weight: 600;
	}
	.stats dd {
		font-size: 16px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.ci {
		display: block;
		color: var(--muted);
		font-size: 11px;
		font-weight: 500;
	}
	.games {
		width: 100%;
		color: var(--muted);
		font-size: 13px;
	}

	/* -------------------------------- look -------------------------------- */
	.swatch {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.felt-dot {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: radial-gradient(
			circle at 40% 35%,
			color-mix(in srgb, var(--swatch), white 18%),
			var(--swatch)
		);
		box-shadow: inset 0 0 0 1px #0000004d;
	}
	.back {
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 10px 14px;
		border-radius: 12px;
	}
	.back img {
		width: 58px;
		border-radius: 5px;
		box-shadow: 0 4px 10px #00000073;
		transition: translate 0.2s;
	}
	.back:hover img {
		translate: 0 -3px;
	}
	.mascot-sizing {
		gap: 10px;
		padding-top: 18px;
		border-top: 1px solid var(--line);
	}
	.mascot-sizing label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.mascot-sizing output {
		color: var(--butter);
		font-variant-numeric: tabular-nums;
	}
	.mascot-sizing input {
		width: min(100%, 32rem);
	}
	.mascot-sizing > button {
		justify-self: start;
	}
	.mascot-size-preview {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-block: 6px;
	}
	.mascot-size-preview figure {
		display: grid;
		justify-items: center;
		margin: 0;
	}
	.mascot-size-preview figcaption {
		color: var(--muted);
		font-size: 12px;
	}

	/* -------------------------------- phone -------------------------------- */
	@media (max-width: 860px) {
		.masthead {
			grid-template-columns: 1fr;
		}
		.tonight {
			border-left: 0;
			border-top: 1px solid var(--line);
			padding-top: 12px;
		}
		.tonight div:first-child {
			padding-left: 0;
		}
		.desk {
			grid-template-columns: 1fr;
			gap: 20px;
		}
		/* The spine becomes a horizontal index; the marker gives way to a filled tab. */
		.spine {
			position: sticky;
			top: var(--header-h, 56px);
			z-index: 2;
			display: flex;
			gap: 6px;
			margin-inline: calc(var(--gutter) * -1);
			padding: 10px var(--gutter);
			overflow-x: auto;
			border-top: 0;
			background: var(--night);
			scrollbar-width: none;
		}
		.marker {
			display: none;
		}
		.spine button {
			flex: none;
			height: 40px;
			gap: 8px;
			border: 1px solid var(--line);
			border-radius: 100px;
			font-size: 14px;
		}
		.spine button.on {
			border-color: var(--butter);
			background: var(--butter);
		}
	}
	@media (max-width: 600px) {
		.admin {
			gap: 24px;
			padding-top: 28px;
		}
		.card {
			padding: 20px 18px;
		}
		h2 {
			font-size: 22px;
		}
		.sort {
			margin-left: 0;
		}
		/* One line of controls per guest: the select keeps its accessible name, the label goes. */
		.rows li .actions {
			width: 100%;
			flex-wrap: nowrap;
		}
		.mascot-choice span {
			display: none;
		}
		.mascot-choice select {
			max-width: 6.5rem;
		}
		.rows li .actions button {
			padding: 0 11px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.marker,
		.primary,
		.out a span,
		.back img {
			transition: none;
		}
		.dot.live {
			animation: none;
		}
	}
</style>
