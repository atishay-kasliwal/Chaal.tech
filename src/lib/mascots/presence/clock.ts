/** One 30 Hz clock shared by visible prototypes. No per-character animation timers. */
type Listener = (now: number) => void;
const clients = new Set<Listener>();
let raf = 0,
	last = 0,
	time = 0,
	frames = 0,
	attached = false;
const costs: number[] = [];
function tick(wall: number) {
	raf = 0;
	if (!clients.size || document.hidden) {
		last = 0;
		return;
	}
	if (!last) last = wall;
	if (wall - last >= 1000 / 30 - 1) {
		time += Math.min(100, wall - last);
		last = wall;
		const start = performance.now();
		for (const listener of clients) listener(time);
		costs.push(performance.now() - start);
		if (costs.length > 180) costs.shift();
		frames++;
	}
	raf = requestAnimationFrame(tick);
}
function wake() {
	if (document.hidden) {
		cancelAnimationFrame(raf);
		raf = 0;
		last = 0;
	} else if (clients.size && !raf) {
		last = 0;
		raf = requestAnimationFrame(tick);
	}
}
export const presenceClock = {
	now: () => time,
	subscribe(listener: Listener) {
		clients.add(listener);
		if (!attached) {
			document.addEventListener('visibilitychange', wake);
			attached = true;
		}
		wake();
		return () => {
			clients.delete(listener);
			if (!clients.size) {
				cancelAnimationFrame(raf);
				raf = 0;
				last = 0;
				document.removeEventListener('visibilitychange', wake);
				attached = false;
			}
		};
	},
	stats() {
		const sorted = [...costs].sort((a, b) => a - b);
		return {
			clients: clients.size,
			frames,
			rateLimit: 30,
			updateMeanMs: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
			updateP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
		};
	}
};
