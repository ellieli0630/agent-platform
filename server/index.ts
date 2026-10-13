import { db, migrate, demo, localTest, demand, first, time } from "./store";
import { seedDemo } from "./demo";
import { handleApi, googleCallback } from "./api";
import { worker, pollCalls } from "./engine";
import { tickJobs, dueResponsibilities } from "./jobs";
import { startChannels, flushOutbox } from "./channels";
import { buildProfile } from "./memory";
import app from "../client/index.html";
if (process.env.NODE_ENV === "production")
  for (const key of [
    "DATABASE_URL",
    "MASTER_KEY",
    "PUBLIC_URL",
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "OPENROUTER_API_KEY",
  ])
    demand(process.env[key], 503, `${key} is required in production.`);
await migrate();
await seedDemo();
const server = Bun.serve({
  hostname: demo || localTest ? "127.0.0.1" : undefined,
  maxRequestBodySize: 10 * 1024 * 1024,
  port: Number(process.env.PORT ?? 3100),
  routes: {
    "/": app,
    "/config": () =>
      Response.json({
        demo,
        localTest,
        clerkKey: localTest
          ? null
          : (process.env.CLERK_PUBLISHABLE_KEY ?? null),
      }),
    "/health": () => Response.json({ ok: true, demo, localTest }),
    "/api/*": handleApi,
    "/oauth/google": async (req) => {
      try {
        return await googleCallback(req);
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: e.status ?? 500 });
      }
    },
  },
  fetch: () => new Response("Not found", { status: 404 }),
});
await startChannels().catch(() =>
  console.warn("iMessage is not connected; the web workspace is available."),
);
let busy = false;
const tick = async () => {
  if (busy) return;
  busy = true;
  try {
    await tickJobs();
    await worker();
    await dueResponsibilities();
    await pollCalls();
    await flushOutbox();
  } catch (e) {
    console.error("[worker]", e);
  } finally {
    busy = false;
  }
};
setInterval(tick, 1500);
void tick();
// Background profile maintenance, independent of responding. No write-side model call on the chat critical path.
setInterval(async () => {
  if (demo || localTest || !process.env.OPENROUTER_API_KEY) return;
  const owners =
    await db`select distinct m.agent_id,m.owner_id from gather_memories m left join gather_profiles p on p.agent_id=m.agent_id and p.owner_id=m.owner_id where m.owner_id is not null and (p.updated_at is null or p.updated_at<${time() - 86400000}) limit 10`;
  for (const m of owners)
    try {
      const p = await first(
        db`select updated_at from gather_profiles where agent_id=${m.agent_id} and owner_id=${m.owner_id}`,
      );
      if (!p || Number(p.updated_at) < time() - 86400000)
        await buildProfile(m.owner_id, m.agent_id);
    } catch {}
}, 3600000);
console.log(
  `Gather at ${server.url}${demo ? " (local demo, fictional data)" : ""}`,
);
