// Optional, bounded model-in-the-loop check. Synthetic participants and fake provider outputs; never calls real people.
import { SQL } from "bun";
import { randomBytes } from "node:crypto";
const input = await Bun.file(process.env.SMOKE_ENV_FILE ?? ".env.live").text();
const values = Object.fromEntries(
  input
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i),
        l
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ];
    }),
);
if (!values.OPENROUTER_API_KEY)
  throw new Error("No existing OpenRouter key; skip this optional check.");
process.env.OPENROUTER_API_KEY = values.OPENROUTER_API_KEY;
process.env.MODEL_CAP_USD = "0.15";
process.env.NODE_ENV = "test";
delete process.env.DEMO_MODE;
const url = new URL(values.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Use a local isolated test database.");
url.pathname = "/gather_test";
process.env.DATABASE_URL = url.href;
const { db, migrate, uid, time, json } = await import("../server/store");
const { enqueue, processRun } = await import("../server/engine");
const { providerHooks } = await import("../server/providers");
await migrate();
const person = "smoke_" + uid(),
  agent = "agent_" + uid(),
  group = "group_" + uid();
await db`insert into gather_people(id,name,clerk_id,created_at) values(${person},'Synthetic Alex',${person},${time()})`;
await db`insert into gather_agents(id,owner_id,name,purpose,created_at) values(${agent},${person},'Gather','Coordinate a synthetic family’s responsibilities.',${time()})`;
await db`insert into gather_spaces(id,owner_id,agent_id,name,kind,created_at) values(${group},${person},${agent},'Synthetic family','family',${time()})`;
await db`insert into gather_members(space_id,person_id,role,joined_at) values(${group},${person},'owner',${time()})`;
providerHooks.invoke = async (tool) => ({
  status: "succeeded",
  simulated: true,
  data: {
    note: "Synthetic provider response. No people were contacted.",
    sources:
      tool === "search_web"
        ? [
            {
              title: "Synthetic repair lead",
              url: "https://example.com/repair",
              description:
                "Language, prices and availability remain unconfirmed.",
            },
          ]
        : [],
  },
});
const scenarios = [
  "Mum is holding an iPhone and sees the Zoom icon. Help her join a video call, patiently, one step at a time.",
  "Gather, find a Mandarin-speaking handyman in Cambridge. Research candidates and compare availability and pricing. Do not contact anyone or book yet.",
];
const results = [];
for (const request of scenarios) {
  const start = Date.now();
  const r = await enqueue(person, group, request);
  await processRun(r.id);
  const run = (await db`select * from gather_runs where id=${r.id}`)[0];
  results.push({
    scenario: request,
    status: run.status,
    elapsedMs: Date.now() - start,
    costUsd: Number(run.cost_usd),
    planSteps: run.plan?.steps.length ?? 0,
    reply: run.reply,
    tools:
      await db`select tool,status,simulated from gather_executions where run_id=${r.id}`,
  });
}
await Bun.write(
  "artifacts/live-smoke.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      modelCheap: process.env.MODEL_CHEAP ?? "z-ai/glm-5.3-flash",
      modelSmart: process.env.MODEL_SMART ?? "z-ai/glm-5.3",
      syntheticOnly: true,
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    results.map(({ reply, ...r }) => ({
      ...r,
      replyPreview: reply?.slice(0, 250),
    })),
    null,
    2,
  ),
);
await db.close();
