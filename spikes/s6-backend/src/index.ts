import { TEST_PAGE } from './testpage';

export { Room } from './room';

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const t0 = Date.now();
    const url = new URL(request.url);
    const colo = (request as Request & { cf?: { colo?: string } }).cf?.colo ?? null;

    if (url.pathname === '/test') return new Response(TEST_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

    if (url.pathname === '/ping') {
      const workerMs = Date.now() - t0;
      return Response.json({ srv: { workerMs }, colo }, { headers: { 'cache-control': 'no-store', 'server-timing': `worker;dur=${workerMs}` } });
    }

    const ping = url.pathname.match(/^\/room\/([^/]+)\/ping$/);
    if (ping) {
      const stub = env.ROOM.get(env.ROOM.idFromName(ping[1]!));
      const d0 = Date.now();
      const res = await stub.fetch(request);
      const hopMs = Date.now() - d0; // Worker -> Durable Object -> back, as seen by the Worker
      const body = (await res.json()) as { srv: Record<string, number> };
      const workerMs = Date.now() - t0;
      const srv: Record<string, number> = { ...body.srv, workerToDoRoundTripMs: hopMs, routingMs: Math.max(0, hopMs - (body.srv.doMs ?? 0)), workerMs };
      return Response.json({ srv, colo }, { headers: { 'cache-control': 'no-store', 'server-timing': `worker;dur=${workerMs}, do;dur=${srv.doMs}, route;dur=${srv.routingMs}` } });
    }

    const match = url.pathname.match(/^\/room\/([^/]+)\/ws$/);
    if (!match) return new Response('not found', { status: 404 });
    const stub = env.ROOM.get(env.ROOM.idFromName(match[1]!));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
