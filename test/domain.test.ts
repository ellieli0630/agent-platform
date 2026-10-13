import { beforeAll, beforeEach, afterAll, test, expect } from "bun:test";
const target = new URL(
  process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://gather:gather@localhost:5434/gather_test",
);
if (!process.env.TEST_DATABASE_URL) target.pathname = "/gather_test";
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !target.pathname.endsWith("_test")
)
  throw new Error("Tests require an isolated local *_test database.");
process.env.DATABASE_URL = target.href;
process.env.NODE_ENV = "test";
delete process.env.DEMO_MODE;
const {
  db,
  migrate,
  clock,
  time,
  uid,
  first,
  fingerprint,
  seal,
  unseal,
  spaceFor,
} = await import("../server/store");
const memory = await import("../server/memory");
const plans = await import("../server/plans");
const tasks = await import("../server/tasks");
const engine = await import("../server/engine");
const { dispatch, tools, ask } = await import("../server/tools");
const { modelHooks } = await import("../server/model");
const { providerHooks } = await import("../server/providers");
const jobs = await import("../server/jobs");
const media = await import("../server/media");
const invites = await import("../server/invites");
let calls = 0;
clock.now = () => Date.parse("2026-10-13T16:00:00Z");
beforeAll(migrate);
beforeEach(async () => {
  await db`truncate gather_people restart identity cascade`;
  await db`insert into gather_people(id,name,clerk_id,timezone,created_at) values('alex','Alex','clerk_alex','America/New_York',${time()}),('linda','Linda',null,'America/New_York',${time()}),('daniel','Daniel','clerk_daniel','America/New_York',${time()})`;
  await db`insert into gather_agents(id,owner_id,name,purpose,instructions,created_at) values('gather','alex','Gather','Family coordination','PRIVATE owner instructions',${time()})`;
  await db`insert into gather_spaces(id,owner_id,agent_id,name,kind,created_at) values('family','alex','gather','Family','family',${time()}),('private','alex','gather','Private','private',${time()}),('other','daniel','gather','Another group','friends',${time()})`;
  for (const [space, person] of [
    ["family", "alex"],
    ["family", "linda"],
    ["family", "daniel"],
    ["private", "alex"],
    ["other", "daniel"],
  ])
    await db`insert into gather_members(space_id,person_id,joined_at) values(${space},${person},${time()})`;
  calls = 0;
  providerHooks.invoke = async () => {
    calls++;
    return {
      status: "succeeded",
      proof: "provider-1",
      data: { title: "Confirmed outcome" },
    };
  };
  modelHooks.complete = async () => ({
    text: "Here is what I found.",
    calls: [],
    cost: 0,
  });
});
afterAll(async () => {
  clock.now = () => Date.now();
  delete modelHooks.complete;
  delete providerHooks.invoke;
  await db.close();
});
async function run(request = "help", space = "family", person = "alex") {
  const r = await engine.enqueue(person, space, request);
  return first(db`select * from gather_runs where id=${r.id}`);
}
async function ctx(run: any) {
  return {
    space: await spaceFor(run.requester_id, run.space_id),
    person: await first(
      db`select * from gather_people where id=${run.requester_id}`,
    ),
  };
}
const plan = (steps?: any[]) => ({
  goal: "Find a repair service",
  steps: steps ?? [
    {
      id: "search",
      title: "Search candidates",
      channel: "search",
      dependsOn: [],
      success: "Primary sources identify candidates.",
      fallback: "Ask neighbors.",
    },
    {
      id: "call",
      title: "Call candidates",
      channel: "call",
      dependsOn: ["search"],
      success: "A completed call confirms terms.",
      fallback: "Try another candidate.",
    },
  ],
});
test("JSON contracts are objects and arrays, not doubly encoded strings", async () => {
  const r = await run();
  await plans.setPlan(r.id, plan());
  const stored = await first(db`select plan from gather_runs where id=${r.id}`);
  expect(Array.isArray(stored.plan.steps)).toBe(true);
  const m = await memory.saveMemory("alex", "private", {
    text: "Prefer Mandarin",
    aliases: ["中文", "language"],
  });
  expect(Array.isArray(m.aliases)).toBe(true);
});
test("private facts and standing rules never enter a group, even for the owner", async () => {
  await memory.saveMemory("alex", "private", {
    text: "Secret medical diagnosis",
    kind: "fact",
  });
  await memory.saveMemory("alex", "private", {
    text: "My salary is private",
    kind: "rule",
  });
  await memory.saveMemory("alex", "family", {
    text: "Sunday is our check-in",
    kind: "routine",
  });
  expect(
    (
      await memory.contextMemories(
        await spaceFor("alex", "family"),
        "alex",
        "salary diagnosis",
      )
    ).map((m: any) => m.text),
  ).toEqual(["Sunday is our check-in"]);
  expect(
    (
      await memory.contextMemories(
        await spaceFor("alex", "private"),
        "alex",
        "diagnosis",
      )
    ).some((m) => m.text === "Secret medical diagnosis"),
  ).toBe(true);
});
test("the actual group model prompt excludes the owner profile and private instructions", async () => {
  await memory.saveMemory("alex", "private", {
    text: "PRIVATE personal budget $5000",
  });
  let prompt = "";
  modelHooks.complete = async (messages) => {
    prompt = JSON.stringify(messages);
    return { text: "Public answer", calls: [], cost: 0 };
  };
  const r = await run();
  await engine.processRun(r.id);
  expect(prompt).not.toContain("PRIVATE personal budget");
  expect(prompt).not.toContain("PRIVATE owner instructions");
});
test("explicit sharing copies only the selected fact into one group", async () => {
  const m = await memory.saveMemory("alex", "private", {
    text: "Prefer a Mandarin-speaking repair person",
  });
  await memory.saveMemory("alex", "private", { text: "Secret budget" });
  await memory.shareMemory("alex", m.id, "family");
  expect(
    (await memory.listMemories("linda", "gather", "family")).map(
      (m: any) => m.text,
    ),
  ).toEqual(["Prefer a Mandarin-speaking repair person"]);
  await expect(memory.shareMemory("linda", m.id, "family")).rejects.toThrow();
});
test("memory aliases support Chinese recall and temporary details expire", async () => {
  const m = await memory.saveMemory("alex", "private", {
    text: "Linda prefers one step at a time",
    aliases: ["妈妈", "mum"],
  });
  await memory.saveMemory("alex", "private", {
    text: "A temporary code-free appointment detail",
    expiresAt: time() + 1000,
  });
  clock.now = () => Date.parse("2026-10-13T16:00:02Z");
  const rows = await memory.contextMemories(
    await spaceFor("alex", "private"),
    "alex",
    "妈妈",
  );
  expect(rows[0].id).toBe(m.id);
  expect(rows.some((m) => m.text.includes("temporary"))).toBe(false);
  clock.now = () => Date.parse("2026-10-13T16:00:00Z");
});
test("a correction preserves the observed date, increments its version and invalidates profile", async () => {
  const m = await memory.saveMemory("alex", "private", {
    text: "Old preference",
  });
  await db`insert into gather_profiles values('gather','alex','Old preference','x',${time()})`;
  await memory.saveMemory("alex", "private", {
    id: m.id,
    revision: 1,
    text: "Corrected preference",
  });
  const changed = await first(
    db`select * from gather_memories where id=${m.id}`,
  );
  expect(changed.revision).toBe(2);
  expect(changed.observed_at).toBe(String(time()));
  expect((await db`select * from gather_memory_history`).length).toBe(1);
  expect((await db`select * from gather_profiles`).length).toBe(0);
  await expect(
    memory.saveMemory("alex", "private", {
      id: m.id,
      revision: 1,
      text: "Stale edit",
    }),
  ).rejects.toThrow("Refresh");
});
test("forget removes history and profile, and a concurrent profile job cannot resurrect it", async () => {
  const m = await memory.saveMemory("alex", "private", { text: "Forget this" });
  await memory.saveMemory("alex", "private", {
    id: m.id,
    revision: 1,
    text: "Still forget this",
  });
  modelHooks.complete = async () => {
    await memory.forgetMemory("alex", m.id);
    return { text: "Still forget this", calls: [], cost: 0 };
  };
  await memory.buildProfile("alex", "gather");
  expect(await db`select * from gather_memories`).toHaveLength(0);
  expect(await db`select * from gather_memory_history`).toHaveLength(0);
  expect(await db`select * from gather_profiles`).toHaveLength(0);
});
test("a non-member cannot read or write another group", async () => {
  await expect(spaceFor("linda", "other")).rejects.toThrow();
  await expect(
    tasks.createTask("linda", "other", { title: "Intrude" }),
  ).rejects.toThrow();
});
test("assigning someone else is only a proposal; only they can accept or report done", async () => {
  const t = await tasks.createTask("alex", "family", {
    title: "Drive Mum",
    assigneeId: "daniel",
    category: "ride",
  });
  expect(t.status).toBe("proposed");
  await expect(
    tasks.updateTask("alex", t.id, { status: "accepted" }),
  ).rejects.toThrow();
  await tasks.updateTask("daniel", t.id, { status: "accepted" });
  await expect(
    tasks.updateTask("alex", t.id, { status: "done" }),
  ).rejects.toThrow();
  expect(
    (await tasks.updateTask("daniel", t.id, { status: "done" })).status,
  ).toBe("done");
});
test("unassigned responsibilities can be claimed; done is impossible before acceptance", async () => {
  const t = await tasks.createTask("alex", "family", {
    title: "Help with video call",
  });
  await expect(
    tasks.updateTask("linda", t.id, { status: "done" }),
  ).rejects.toThrow();
  expect(
    (await tasks.updateTask("linda", t.id, { status: "accepted" })).assignee_id,
  ).toBe("linda");
});
test("plans reject missing dependencies and cycles", () => {
  expect(() =>
    plans.validatePlan(
      plan([
        {
          id: "a",
          title: "A",
          channel: "search",
          dependsOn: ["b"],
          success: "A",
          fallback: "x",
        },
      ]),
    ),
  ).toThrow();
  expect(() =>
    plans.validatePlan(
      plan([
        {
          id: "a",
          title: "A",
          channel: "search",
          dependsOn: ["b"],
          success: "A",
          fallback: "x",
        },
        {
          id: "b",
          title: "B",
          channel: "call",
          dependsOn: ["a"],
          success: "B",
          fallback: "x",
        },
      ]),
    ),
  ).toThrow();
});
test("the gateway enforces dependency order before asking permission or invoking a provider", async () => {
  const r = await run();
  await plans.setPlan(r.id, plan());
  const c = await ctx(r);
  await expect(
    dispatch(r, c.space, c.person, {
      name: "call_business",
      input: {
        step_id: "call",
        business: "Repair",
        number: "+15550000001",
        goal: "Ask for quote",
        disclosedInformation: "No private details",
      },
    }),
  ).rejects.toThrow("dependencies");
  expect(calls).toBe(0);
  expect(await db`select * from gather_approvals`).toHaveLength(0);
});
test("completion needs evidence from that exact step, with no simulated or unrelated execution", async () => {
  const r = await run();
  await plans.setPlan(r.id, plan());
  const c = await ctx(r);
  const result: any = await dispatch(r, c.space, c.person, {
    name: "search_web",
    input: { step_id: "search", query: "Mandarin repair" },
  });
  await expect(
    plans.markStep(r.id, "call", "complete", "ok", [result.executionId]),
  ).rejects.toThrow();
  await plans.markStep(r.id, "search", "complete", "Candidates located", [
    result.executionId,
  ]);
  expect((await plans.stepFor(r.id, "call"))?.id).toBe("call");
  await db`update gather_executions set simulated=true where id=${result.executionId}`;
  const r2 = await run();
  await plans.setPlan(r2.id, plan());
  await expect(
    plans.markStep(r2.id, "search", "complete", "made up", [
      result.executionId,
    ]),
  ).rejects.toThrow("evidence");
});
test("blocked steps can change approach, while completed steps and evidence cannot be rewritten", async () => {
  const r = await run();
  await plans.setPlan(r.id, plan());
  const c = await ctx(r);
  const e: any = await dispatch(r, c.space, c.person, {
    name: "search_web",
    input: { step_id: "search", query: "repair" },
  });
  await plans.markStep(r.id, "search", "complete", "Source checked", [
    e.executionId,
  ]);
  await plans.markStep(r.id, "call", "blocked", "No number found");
  const stored = await first(db`select plan from gather_runs where id=${r.id}`);
  const revised = structuredClone(stored.plan);
  revised.steps[1].channel = "community";
  revised.steps[1].fallback = "Ask a neighbor";
  await plans.setPlan(r.id, revised);
  expect((await plans.stepFor(r.id, "call"))?.channel).toBe("community");
  const invalid = structuredClone(
    (await first(db`select plan from gather_runs where id=${r.id}`)).plan,
  );
  invalid.steps[0].title = "Pretend something else happened";
  await expect(plans.setPlan(r.id, invalid)).rejects.toThrow("Completed");
});
test("an outbound write needs the exact actor and input approval; repeat decisions do not run it twice", async () => {
  const r = await run("Email a repair service");
  const c = await ctx(r);
  const call = {
    name: "email_send",
    input: {
      to: "repair@example.com",
      subject: "Quote",
      body: "Please quote.",
    },
  };
  expect(((await dispatch(r, c.space, c.person, call)) as any).waiting).toBe(
    true,
  );
  const a = await first(db`select * from gather_approvals`);
  await expect(
    engine.decideApproval("daniel", a.id, "approve"),
  ).rejects.toThrow();
  await engine.decideApproval("alex", a.id, "approve");
  const changed = {
    ...call,
    input: { ...call.input, to: "another@example.com" },
  };
  expect(((await dispatch(r, c.space, c.person, changed)) as any).waiting).toBe(
    true,
  );
  expect(calls).toBe(0);
  await dispatch(r, c.space, c.person, call);
  await dispatch(r, c.space, c.person, call);
  expect(calls).toBe(1);
  await expect(
    engine.decideApproval("alex", a.id, "approve"),
  ).rejects.toThrow();
});
test("a guest account request goes to the owner, but its final reply remains private until reviewed", async () => {
  const r = await run("What is on the family calendar?", "family", "linda");
  modelHooks.complete = async (messages) =>
    messages.some((m) => m.role === "tool")
      ? { text: "There is a private appointment tomorrow.", calls: [], cost: 0 }
      : {
          text: "",
          calls: [
            {
              id: "c",
              name: "calendar_read",
              input: {
                from: "2026-10-13T00:00:00Z",
                to: "2026-10-14T00:00:00Z",
              },
            },
          ],
          cost: 0,
        };
  await engine.processRun(r.id);
  const approval = await first(
    db`select * from gather_approvals where kind='action'`,
  );
  expect(approval.approver_id).toBe("alex");
  await engine.decideApproval("alex", approval.id, "approve");
  await engine.processRun(r.id);
  expect(
    (await first(db`select status from gather_runs where id=${r.id}`)).status,
  ).toBe("waiting_share");
  expect(
    (
      await db`select text from gather_messages where role='assistant' and space_id='family'`
    ).every(
      (m: any) =>
        !m.text.includes("private appointment") &&
        !m.text.includes("Reviewed group reply"),
    ),
  ).toBe(true);
});
test("a changed group audience requires a fresh private review", async () => {
  const r = await run();
  await db`update gather_runs set reply='Reviewed group reply',status='waiting_share' where id=${r.id}`;
  await ask(
    r,
    { id: "alex" },
    "share",
    "share-1",
    "Share?",
    "Reviewed group reply",
    1,
  );
  const a = await first(db`select * from gather_approvals`);
  await db`update gather_spaces set audience_version=2 where id='family'`;
  const result = await engine.decideApproval("alex", a.id, "approve");
  expect(result.changedAudience).toBe(true);
  expect(
    (
      await db`select text from gather_messages where role='assistant' and space_id='family'`
    ).every(
      (m: any) =>
        !m.text.includes("private appointment") &&
        !m.text.includes("Reviewed group reply"),
    ),
  ).toBe(true);
  expect(
    await db`select * from gather_approvals where status='pending'`,
  ).toHaveLength(1);
});
test("private provider results cannot be saved directly into shared memory without another exact approval", async () => {
  const r = await run();
  await db`update gather_runs set private_result_owner='alex' where id=${r.id}`;
  const c = await ctx(r);
  const result: any = await dispatch(r, c.space, c.person, {
    name: "memory_save",
    input: { text: "Private appointment diagnosis" },
  });
  expect(result.waiting).toBe(true);
  expect(await db`select * from gather_memories`).toHaveLength(0);
});
test("a restarted run resumes its persisted action, not the original model request", async () => {
  const r = await run("Draft a quote request");
  let turns = 0;
  modelHooks.complete = async (messages) => {
    turns++;
    return messages.some((m) => m.role === "tool")
      ? { text: "Draft created.", calls: [], cost: 0 }
      : {
          text: "",
          calls: [
            {
              id: "c1",
              name: "email_draft",
              input: {
                to: "repair@example.com",
                subject: "Quote",
                body: "Please quote.",
              },
            },
          ],
          cost: 0,
        };
  };
  await engine.processRun(r.id);
  expect(turns).toBe(1);
  const a = await first(db`select * from gather_approvals`);
  await engine.decideApproval("alex", a.id, "approve");
  await engine.processRun(r.id);
  expect(calls).toBe(1);
  expect(turns).toBe(2);
  expect(
    (await first(db`select * from gather_runs where id=${r.id}`)).pending_calls,
  ).toEqual([]);
});
test("an uncertain write is never silently replayed", async () => {
  const r = await run();
  const c = await ctx(r),
    call = {
      name: "email_draft",
      input: { to: "x@example.com", subject: "quote", body: "text" },
    };
  await dispatch(r, c.space, c.person, call);
  const a = await first(db`select * from gather_approvals`);
  await engine.decideApproval("alex", a.id, "approve");
  providerHooks.invoke = async () => {
    calls++;
    return { status: "unknown", data: { reason: "transport dropped" } };
  };
  const firstResult: any = await dispatch(r, c.space, c.person, call);
  const second: any = await dispatch(r, c.space, c.person, call);
  expect(firstResult.status).toBe("unknown");
  expect(second.status).toBe("unknown");
  expect(calls).toBe(1);
});
test("two workers racing an action only invoke it once", async () => {
  const r = await run();
  const c = await ctx(r);
  const call = { name: "search_web", input: { query: "repair" } };
  const results = await Promise.all([
    dispatch(r, c.space, c.person, call),
    dispatch(r, c.space, c.person, call),
  ]);
  expect(calls).toBe(1);
  expect(await db`select * from gather_executions`).toHaveLength(1);
});
test("a single lookup is one model call, with no compulsory planner call", async () => {
  const r = await run("Hello");
  let count = 0;
  modelHooks.complete = async () => {
    count++;
    return { text: "Hello.", calls: [], cost: 0 };
  };
  await engine.processRun(r.id);
  expect(count).toBe(1);
  expect(
    (await first(db`select * from gather_runs where id=${r.id}`)).plan,
  ).toBeNull();
});
test("the agent cannot call a draft or a different verified action a sent email", async () => {
  const r = await run("hello", "private");
  modelHooks.complete = async () => ({
    text: "Sent the email!",
    calls: [],
    cost: 0,
  });
  await engine.processRun(r.id);
  const reply = (
    await first(db`select reply from gather_runs where id=${r.id}`)
  ).reply;
  expect(reply).not.toContain("Sent the email");
  expect(reply).toContain("can’t confirm");
});
test("the run status stays open when dependent plan steps are unfinished", async () => {
  const r = await run();
  await plans.setPlan(r.id, plan());
  await engine.processRun(r.id);
  expect(
    (await first(db`select status from gather_runs where id=${r.id}`)).status,
  ).toBe("paused");
});
test("jobs are claimed once and cancelled when their responsibility has already closed", async () => {
  const t = await tasks.createTask("alex", "family", {
    title: "Drive Mum",
    assigneeId: "alex",
  });
  const j = await tasks.scheduleJob("alex", "family", {
    prompt: "Check ride",
    at: time() + 1000,
    taskId: t.id,
  });
  await tasks.updateTask("alex", t.id, { status: "done" });
  await db`update gather_jobs set next_at=${time() - 1} where id=${j.id}`;
  await Promise.all([jobs.tickJobs(), jobs.tickJobs()]);
  expect(
    (await first(db`select status from gather_jobs where id=${j.id}`)).status,
  ).toBe("cancelled");
  expect(await db`select * from gather_runs`).toHaveLength(0);
});
test("a due one-time job produces exactly one durable run despite concurrent ticks", async () => {
  const j = await tasks.scheduleJob("alex", "family", {
    prompt: "Check the repair plan",
    at: time() + 1000,
  });
  await db`update gather_jobs set next_at=${time() - 1} where id=${j.id}`;
  await Promise.all([jobs.tickJobs(), jobs.tickJobs()]);
  expect(await db`select * from gather_runs`).toHaveLength(1);
  expect(
    (await first(db`select status from gather_jobs where id=${j.id}`)).status,
  ).toBe("done");
});
test("inbound provider IDs deduplicate the run as well as the message", async () => {
  const a = await engine.enqueue("alex", "family", "Hi", "same-provider-id");
  const b = await engine.enqueue("alex", "family", "Hi", "same-provider-id");
  expect(a.id).toBe(b.id);
  expect(await db`select * from gather_runs`).toHaveLength(1);
});
test("encrypted credentials round-trip and canonical fingerprints ignore object key order", () => {
  expect(unseal(seal({ token: "secret" }))).toEqual({ token: "secret" });
  expect(fingerprint("run", "tool", { b: 2, a: 1 })).toBe(
    fingerprint("run", "tool", { a: 1, b: 2 }),
  );
});

test("continuing a plan retains its evidence and refuses a removed member", async () => {
  const r = await run();
  await plans.setPlan(r.id, plan());
  await db`update gather_runs set status='paused' where id=${r.id}`;
  await engine.continueRun("alex", r.id, "Try asking neighbors instead.");
  const saved = await first(db`select * from gather_runs where id=${r.id}`);
  expect(saved.plan.goal).toBe("Find a repair service");
  expect(saved.transcript.at(-1).content).toContain("neighbors");
  await db`update gather_runs set status='paused' where id=${r.id}`;
  await db`delete from gather_members where space_id='family' and person_id='alex'`;
  await expect(
    engine.continueRun("alex", r.id, "Another attempt"),
  ).rejects.toThrow();
  expect(
    (await first(db`select status from gather_runs where id=${r.id}`)).status,
  ).toBe("paused");
});
test("attachments are restricted to the uploader and the original conversation", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File(["A fictional repair checklist"], "checklist.txt", {
      type: "text/plain",
    }),
  );
  const uploaded = await media.uploadAttachment(
    "alex",
    "private",
    new Request("http://localhost/upload", { method: "POST", body: form }),
  );
  expect(
    await media.withAttachments("alex", "private", "Please help", [
      uploaded.id,
    ]),
  ).toContain("fictional repair checklist");
  await expect(
    media.withAttachments("alex", "family", "Read this", [uploaded.id]),
  ).rejects.toThrow();
  await expect(
    media.withAttachments("daniel", "family", "Read this", [uploaded.id]),
  ).rejects.toThrow();
  await expect(
    media.readAttachment(
      new File(["x"], "bad.exe", { type: "application/octet-stream" }),
    ),
  ).rejects.toThrow();
});
test("candidate evidence must come from research, not an unrelated verified action", async () => {
  const r = await run();
  const t = await tasks.createTask("alex", "family", { title: "Repair" });
  await db`insert into gather_executions(id,run_id,tool,fingerprint,status,input,output,verified,created_at,updated_at) values('unrelated',${r.id},'email_send','unrelated','succeeded','{}','{}',true,${time()},${time()})`;
  await expect(
    tasks.addCandidate(
      "alex",
      t.id,
      {
        name: "Candidate",
        source: "https://example.com",
        evidenceId: "unrelated",
      },
      r.id,
    ),
  ).rejects.toThrow();
});

test("a guest requester cannot inspect private account results in the execution trace", async () => {
  const r = await run("Check calendar", "family", "linda");
  await db`update gather_runs set private_result_owner='alex' where id=${r.id}`;
  await db`insert into gather_executions(id,run_id,tool,fingerprint,status,input,output,verified,created_at,updated_at) values('private-evidence',${r.id},'calendar_read','private-evidence','succeeded','{}','{"private":"appointment"}',true,${time()},${time()})`;
  await expect(engine.traceFor("linda", r.id)).rejects.toThrow();
  expect((await engine.traceFor("alex", r.id))[0].output.private).toBe(
    "appointment",
  );
  await expect(engine.traceFor("daniel", r.id)).rejects.toThrow();
});

test("private memory IDs cannot be used to edit personal facts through a shared tool", async () => {
  const m = await memory.saveMemory("alex", "private", {
    text: "Private fact",
  });
  await expect(
    memory.saveMemory("alex", "family", {
      id: m.id,
      revision: 1,
      text: "Changed",
    }),
  ).rejects.toThrow();
  expect((await memory.listMemories("alex", "gather"))[0].text).toBe(
    "Private fact",
  );
});

test("single-use invitations join the existing group and trigger a new audience review", async () => {
  await expect(invites.createInvite("daniel", "family")).rejects.toThrow();
  const link = await invites.createInvite("alex", "family");
  const token = new URLSearchParams(new URL(link.url).hash.slice(1)).get(
    "invite",
  )!;
  await db`delete from gather_members where space_id='family' and person_id='daniel'`;
  expect((await invites.inviteInfo(token)).name).toBe("Family");
  expect((await invites.joinInvite("daniel", token)).id).toBe("family");
  expect((await spaceFor("daniel", "family")).audience_version).toBe(2);
  await expect(invites.joinInvite("linda", token)).rejects.toThrow();
});

test("an empty model response cannot mark a request finished", async () => {
  const r = await run();
  modelHooks.complete = async () => ({ text: "", calls: [], cost: 0 });
  await engine.processRun(r.id);
  const stored = await first(
    db`select status,reply from gather_runs where id=${r.id}`,
  );
  expect(stored.status).toBe("failed");
  expect(stored.reply).toContain("empty answer");
});

test("an expired approval leaves a resumable plan and cannot be granted late", async () => {
  const r = await run();
  await db`update gather_runs set status='waiting_approval' where id=${r.id}`;
  await ask(r, { id: "alex" }, "action", "expired", "Review", "Exact input");
  const a = await first(db`select * from gather_approvals`);
  await db`update gather_approvals set expires_at=${time() - 1} where id=${a.id}`;
  await engine.expireApprovals();
  expect(
    (await first(db`select status from gather_runs where id=${r.id}`)).status,
  ).toBe("paused");
  await expect(
    engine.decideApproval("alex", a.id, "approve"),
  ).rejects.toThrow();
  await engine.continueRun("alex", r.id, "Review with updated information.");
  expect(
    (await first(db`select status from gather_runs where id=${r.id}`)).status,
  ).toBe("queued");
});

test("private results cannot be sent to a public search provider without exact review", async () => {
  const r = await run();
  await db`update gather_runs set private_result_owner='alex' where id=${r.id}`;
  const c = await ctx(r);
  const result: any = await dispatch(r, c.space, c.person, {
    name: "search_web",
    input: { query: "Private appointment details" },
  });
  expect(result.waiting).toBe(true);
  expect(calls).toBe(0);
  expect((await first(db`select * from gather_approvals`)).approver_id).toBe(
    "alex",
  );
});
