# S4: LiveKit Spike - Next Steps and Verification

Based on the review of `docs/spikes/s4.md`, the spike implementation has been successfully built and deployed, but the acceptance criteria are only 2/13 fully implemented, with 11/13 ready for testing with an actual LiveKit server.

## Current Status
- **Implementation**: Frontend (React + Vite with LiveKit client SDK) and backend (Cloudflare Workers + Durable Objects for signaling) are in place.
- **Deployment**: Frontend deployed to Cloudflare Pages, backend deployed as a Worker with Durable Object.
- **Environment Variables**: Placeholders for `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` are set in `wrangler.toml`.
- **Acceptance Criteria**: 
  - ✅ Custom video tiles render inside React interface (Criteria 4)
  - ✅ Video grid stays inside 100dvh with no scrolling (Criteria 11)
  - 🔧 Implementation ready for the remaining 11 criteria (requires actual LiveKit server)

## Next Steps to Complete the Spike
To move from "implementation ready" to fully demonstrated and recorded acceptance, the following steps are required:

1. **Configure actual LiveKit server credentials**
   - Obtain LiveKit URL, API key, and API secret (from LiveKit Cloud or self-hosted).
   - Update `wrangler.toml` with these values.

2. **Implement proper JWT token generation**
   - Replace the placeholder token generation in the backend with LiveKit server SDK to create valid JWTs for room access.

3. **Replace placeholder video elements with actual track attachments**
   - Modify the frontend to attach `video` and `audio` elements to the actual `MediaStreamTrack` objects obtained from the LiveKit SDK.

4. **Test all acceptance criteria with real participants using actual LiveKit server**
   - Criteria 1: Eight participants can join one room.
   - Criteria 2: Every participant publishes camera and microphone.
   - Criteria 3: Every participant receives the other seven.
   - Criteria 5: Active speaker detection works.
   - Criteria 6: Participant join and leave work.
   - Criteria 7: Temporary network interruption reconnects correctly.
   - Criteria 8: Camera/microphone interruption does not corrupt game state.
   - Criteria 9: Video quality adapts for an eight-tile layout.
   - Criteria 10: Laptop and mobile browsers both work (desktop browser, iOS Safari, Android Chrome).
   - Criteria 12: Cards, balances, player states and game overlays render over the video tiles.
   - Criteria 13: Actual LiveKit usage (egress, requests) is measured during the test.

5. **Measure actual LiveKit bandwidth and resource usage during testing**
   - Use LiveKit server metrics or client-side monitoring to record egress, requests, and bandwidth.

6. **Document results and determine if LiveKit meets V1 requirements**
   - Record whether each acceptance criterion is met.
   - Compare observed latency and quality against V1 targets (media glass-to-glass p95 under 400 ms).
   - If LiveKit fails any criteria, evaluate Daily as the fallback behind `MediaProvider`.

## Risks and Mitigations
- **Risk**: LiveKit pricing/usage costs unclear.
  - **Mitigation**: Monitor usage during testing, check LiveKit pricing page.
- **Risk**: Complexity of self-hosting LiveKit.
  - **Mitigation**: Start with LiveKit Cloud for spike, evaluate self-hosting later.
- **Risk**: Browser compatibility issues with LiveKit SDK.
  - **Mitigation**: Test target browsers early (Chrome, Firefox, Safari).

## Gate Condition
The spike is considered complete and passes when all 13 acceptance criteria are demonstrated and recorded with evidence in `docs/spikes/s4.md`. Only then can the complete application (Phase 0 onward) begin, provided S1-S3 are also reviewed and S6 validates the Cloudflare+LiveKit architecture.

---
*This document outlines the remaining work to complete S4. It should be used to guide the verification process.*