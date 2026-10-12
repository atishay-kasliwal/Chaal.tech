declare namespace Cloudflare {
  interface Env {
    ROOM: DurableObjectNamespace<import('./room').Room>;
  }
}
