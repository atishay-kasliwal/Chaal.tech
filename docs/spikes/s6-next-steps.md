# S6: Cloudflare Backend Validation - Next Steps

Based on the review of `docs/spikes/s6-backend-validation.md`, the spike has passed local correctness checks but latency remains unresolved. The spike is considered open until latency meets the V1 target (game action round trip p95 under 250 ms) or a fallback is decided.

## Current Status
- **Local checks pass**: All 15 tests pass in the Workers runtime (workerd) with correctness verified (ledger atomicity, chip conservation, idempotency, turn timers, hibernation and restoration, engine compatibility).
- **Live checks run**: Deployment to the owner's Cloudflare account (katishay45) showed:
  - Correctness: Ledger verification OK, balances minted = balances accounted.
  - Usage: Within free-tier limits (messages 2.5%, row writes 12.4%, row reads 1.3% of daily free limits).
  - **Latency**: p50 913 ms, p95 1,534 ms, p99 2,946 ms, max 4,308 ms per message (against 250 ms p95 target). Unresolved.
- **Latency investigation**: Delay lies between client and Cloudflare's edge (TLS handshake and time to first byte), not in the Worker or Durable Object.
  - Custom hostname (`s6.chaal.tech`) showed similar latency to `workers.dev`.
  - Plain HTTP (no TLS) to `s6.chaal.tech` still ~1.09s first request, indicating TCP/TLS not the sole cause? Actually plain HTTP still had delay, suggesting TCP connect or server processing.
  - However, server-side work (Worker to Durable Object and back) measured ~25-40 ms, indicating the delay is in network traversal to Cloudflare edge.

## Next Steps to Resolve Latency
1. **Second network test**: Run measurements from a different network (e.g., phone hotspot) to determine if latency is network-specific.
   - Test both `https://s6.chaal.tech/test` and `https://s6-backend-spike.s6-backend-spike.workers.dev/test`.
   - Record results and note the network.
2. **Clean rerun on custom host with minimal overlap**: Perform a measurement with no other traffic to isolate steady-state latency.
3. **If second network is fast**: Conclude latency issue is local to the original network; S6 can be closed with known connection setup latency (if applicable).
4. **If second network is equally slow**: Investigate further:
   - Check Cloudflare plan (free vs paid) and routing.
   - Consider that free-plan customer hostnames may be deprioritized.
   - Test with a different Cloudflare zone (if available) to isolate account-specific issues.
5. **Read Cloudflare dashboard usage**: Compare actual usage with local counters to ensure no unexpected billing or throttling.
6. **Delete throwaway deployment and DNS record** after testing to clean up.

## Gate Condition
S6 passes when either:
- Latency meets the V1 target (p95 under 250 ms) on a representative network, OR
- The owner decides to accept the latency (with mitigation) or chooses the Node.js + PostgreSQL fallback (as per STACK.md).

Only then can the complete application (Phase 0 onward) begin, provided S1-S3 are reviewed and S4 validates the Cloudflare+LiveKit architecture.

---
*This document outlines the remaining work to resolve latency and complete S6. It should be used to guide the verification process.*