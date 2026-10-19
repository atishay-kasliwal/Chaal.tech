<script lang="ts">
	import { onMount } from 'svelte';
	import PresenceCharacter from './PresenceCharacter.svelte';
	import { instanceRandom } from './director.js';
	import {
		TablePresenceBridge,
		type PublicPresenceTurn,
		type PublicPresenceGeometry
	} from './table-bridge.js';
	import type { Point, PresenceEvent } from './types.js';
	let {
		seatId,
		feed,
		turn,
		handKey,
		geometry
	}: {
		seatId: string;
		feed: readonly unknown[];
		turn: PublicPresenceTurn | null;
		handKey: string | null;
		geometry: PublicPresenceGeometry;
	} = $props();
	let bridge = $state.raw<TablePresenceBridge | null>(null);
	let event = $state<PresenceEvent | null>(null),
		attention = $state<Point>({ x: 0, y: 0 });
	onMount(() => {
		bridge = new TablePresenceBridge(seatId, instanceRandom());
	});
	$effect(() => {
		if (!bridge) return;
		const active = bridge,
			now = performance.now(),
			plans = active.observe({ feed, turn, handKey, geometry }, now);
		const timers: ReturnType<typeof setTimeout>[] = [];
		for (const plan of plans) {
			const deliver = () => {
				event = plan.event;
				attention = plan.attention;
				active.delivered(plan.event);
			};
			if (plan.at <= now) deliver();
			else timers.push(setTimeout(deliver, plan.at - now));
		}
		return () => timers.forEach(clearTimeout);
	});
</script>

<PresenceCharacter {event} {attention} perspective />
