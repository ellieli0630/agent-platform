# Running a live instance

The Dockerfile runs Bun's server and native HTML bundler, with PostgreSQL as the only required infrastructure service. `railway.json` configures a `/health` readiness check and failure restart policy. There is no Redis, Temporal or queue broker requirement.

1. Provision an independent PostgreSQL database and configure `DATABASE_URL`.
2. Set `NODE_ENV=production`, `PUBLIC_URL` to the HTTPS app origin, and a stable random `MASTER_KEY` of at least 32 bytes. Set Clerk and OpenRouter credentials. Production refuses missing required values and refuses demo mode.
3. Add the app origin to Clerk. Configure optional OAuth redirect URI exactly as `PUBLIC_URL/oauth/google`.
4. Build and run the supplied Dockerfile, or deploy this branch to a Railway project with a PostgreSQL service. The server listens on `PORT` supplied by the host.
5. Sign in and create a new agent. Teach it three memories before creating its group. Invite staging participants before enabling provider delivery.
6. Validate account read privacy, member joins, exact approval resumption, provider timeouts, and reconnect behavior using staging accounts/numbers. Then configure outbound channels deliberately.

The schema initializes idempotently at startup in a fresh `gather_*` namespace. It is not a migration from the previous application. Subsequent schema releases should add versioned migrations rather than rewrite the initial schema. Back up the database and encryption key together; changing the key renders stored connections unreadable.

One process runs the HTTP server and worker. Atomic leases and execution reservations support another worker process, but horizontal scaling and large workloads have not been load-tested. The current spending threshold is a preflight check against recorded daily model cost, not a strict reservation for concurrent requests. Configure provider-side spending limits as well. Logs and traces can contain personal task data; protect their storage and access.

Docker does not include local `.env` files, research artifacts, or credentials. The development Compose password is solely for the localhost-bound database. Use a separately generated production database credential.

Deployment files have been supplied and statically checked; this rebuild has not been published to a production host.
