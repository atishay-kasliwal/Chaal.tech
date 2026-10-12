export { Room } from './room';

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([^/]+)\/ws$/);
    if (!match) return new Response('not found', { status: 404 });
    const stub = env.ROOM.get(env.ROOM.idFromName(match[1]!));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
