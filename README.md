# Gather

A shared helping hand for family, friends and neighbors. One person creates and trains an agent; everyone in the group can ask for help. Gather coordinates responsibilities, keeps a plan when work has dependencies, and asks the right person before using an account, contacting a business or sharing private results.

This is a fresh implementation of the agent-platform product specification. Server, client, schema, tools and tests were rebuilt. No previous application code or database records are required.

## Try it locally

Requires Bun 1.3.14+ and PostgreSQL 15+. The optional Compose service creates independent `gather`, `gather_demo` and `gather_test` databases on localhost port 5434.

```sh
bun install --frozen-lockfile
docker compose up -d
cp .env.example .env
bun run demo
```

Open **http://localhost:3100**. The demo uses fictional people and a scripted model; outbound providers are disabled. Responsibilities, memories, approvals and plans persist in the separate local demo database. It is an interactive product preview, not evidence that a real search, call or booking occurred.

For live mode, fill in `MASTER_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `OPENROUTER_API_KEY` and the public origin in `.env`, then run `bun run dev`. Generate the encryption key with `openssl rand -hex 32`. Keep it stable and backed up. Configure Clerk to permit the app's origin. Live mode starts empty: sign in, create an agent, teach it three private memories, create a group and invite someone. Invited members share the existing agent. Private training memories are never automatically copied into that group.

## What works

- Clerk sessions, named agents and private training; shared family, friend and neighborhood spaces.
- Chat with text/PDF attachments, or model-based image/voice extraction in live mode.
- Responsibilities with dates, acceptance, ownership, blockers, completion and follow-ups.
- Dated, typed memory with aliases, revisions, expiry, explicit sharing and forgetting; private profiles refreshed outside the reply path.
- A persisted model/tool loop through OpenRouter. Simple conversation needs one model turn. Longer work carries a dependency plan, evidence, fallbacks and a way to continue with new information.
- Exact action approval and a separate private-result review. Guests route account access and writes to the agent owner; signed-in members use their own connected accounts.
- Source-linked candidate comparisons with unconfirmed language, pricing and availability stated explicitly.
- Durable scheduled checks, run leases, event cursors and execution fingerprints; uncertain writes are held for checking rather than replayed.
- Configurable search, Google, business calls, cloud browser, MCP devices and Photon iMessage adapters. See [integration setup](docs/INTEGRATIONS.md) for prerequisites and current limits.

## Verification

```sh
bun run typecheck
bun test test/
bun run build
```

Tests refuse non-local databases or names without `_test`. They truncate only Gather's isolated test fixtures, use deterministic model/provider adapters, and make no calls to real people. Optional `bun scripts/live-smoke.ts` uses an existing `.env.live` OpenRouter key for bounded model-in-the-loop checks with synthetic provider responses; keep it separate from the test runner. Its preflight model budget is $0.15 and its output goes to ignored `artifacts/`.

Read [architecture](docs/ARCHITECTURE.md), [measured validation and limits](docs/VALIDATION.md) and [deployment](docs/DEPLOYMENT.md). The current build is a working foundation; live provider delivery, account reconnection and audience changes require staging validation before inviting real families.
