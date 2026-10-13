# Validation record — 2026-10-13

## Automated checks

- `bun run typecheck`: passed.
- `bun test test/`: **39 passed, 0 failed, 106 assertions**, using an independent local `gather_test` PostgreSQL database.
- `bun run build`: passed; native Bun frontend bundle includes the Clerk/React client.

Coverage includes private/shared prompt boundaries, private result trace access, memory corrections/expiry/aliases, concurrent forgetting, group membership, assignee acceptance/completion, dependency cycles/order, step-specific proof, completed-plan immutability, exact approval actor/input, rejection/repeated decisions, audience changes, tainted shared writes, resumable pending calls, uncertain writes, concurrent execution reservations, one-turn simple conversation, unsupported send claims, unfinished plans, job claim/cancellation, inbound deduplication, credential encryption, attachment ownership, research evidence type, single-use invitations, empty answers, expired approvals and approval before sending private results into public searches, atomic audience checks during message persistence and rejecting outsiders from private iMessage conversations.

Model and provider adapters in this suite are deterministic test doubles. These tests exercise the database, domain logic and runtime, not delivery by Google, Photon, Vapi, Browserbase or an actual phone.

## Chrome checks

The populated local demo was checked on desktop and at 390 × 844. Verified navigation, conversation submission/polling, exact call review and approval, truthful no-contact demo response, candidate counts, private versus shared memory, and saving a correction to version 2. The original learned date remains visible. A browser-side React cleanup error found during conversation testing was fixed and retested.

The separate live app at localhost:3101 successfully used the existing Clerk session, created a named Gather agent, saved three standing preferences, passed the training gate, created a clean family workspace and returned a real OpenRouter answer to a harmless practice scenario. It instructed the parent to tap Zoom once and waited for their reply. No fictional people were imported into that live workspace.

Ignored local screenshots: `artifacts/gather-overview.jpg`, `artifacts/gather-mobile.jpg`, `artifacts/gather-live-chat.jpg`. The proof files are local artifacts, not part of the Git repository.

## Bounded OpenRouter checks

The optional smoke script uses synthetic participants and provider results, with a $0.15 preflight model budget. Latest measured run:

| Scenario | Result | Time | Recorded model cost |
| --- | --- | ---: | ---: |
| Patient first instruction for joining Zoom | Finished, no plan or tools | 2,712 ms | $0.00025372 |
| Research a Mandarin-speaking handyman; no outreach permitted | Three-step plan, three synthetic searches, blocked research step, run paused | 18,519 ms | $0.01762837 |

The second reply explicitly recognized placeholder results and unconfirmed business names, pricing and availability. No real people were contacted. These numbers are samples, not a latency or cost guarantee. The model still tried three search variants despite guidance to switch after two unhelpful attempts; channel choice needs further behavioral evaluation.

An earlier run returned empty visible content. The model adapter now rejects empty content without tool calls, and the engine leaves it failed/resumable instead of marking it finished. The request uses low reasoning effort and a larger output budget; [OpenRouter documents how reasoning can consume the output budget](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). Later smoke and live app replies succeeded. This does not eliminate provider failures.

## Not yet verified live

Google OAuth reconnect/draft/send/calendar delivery; iMessage line/group lifecycle and new-member timing; Vapi calling, transcripts and assistant instructions; Browserbase action/replay behavior; live MCP phone tools; image/audio extraction. Provider credentials were not reused for outbound delivery during the rebuild. Deployment files are supplied, but production deployment, Docker build, load testing, backup/restore and deletion/export operations have not been exercised.

Cloud browser write outcomes deliberately remain unknown pending independent checking. Phone identity collisions stop rather than silently merging a guest history. Exact external delivery and fact interpretation must be staged with the chosen providers before real family use.
