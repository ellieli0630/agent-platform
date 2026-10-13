import {
  db,
  first,
  demand,
  json,
  uid,
  time,
  fingerprint,
  event,
  demo,
  sendMessage,
} from "./store";
import { contextMemories, saveMemory } from "./memory";
import { setPlan, stepFor, markStep } from "./plans";
import { createTask, updateTask, addCandidate, scheduleJob } from "./tasks";
import { invoke, type ProviderResult, providerHooks } from "./providers";
export type Tool = {
  name: string;
  description: string;
  parameters: any;
  external?: boolean;
  write?: boolean;
  private?: boolean;
  outreach?: boolean;
  channel?: string;
  execute?: (input: any, ctx: any) => Promise<any>;
};
const text = { type: "string" },
  number = { type: "number" },
  strings = { type: "array", items: text };
const object = (properties: any, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const tools: Tool[] = [
  {
    name: "plan_save",
    description:
      "Create or revise a durable plan for dependent work, waiting or multi-channel research. Each step specifies a channel, dependencies, measurable success and a different fallback. Use the latest returned revision when revising; omit status/evidence from input steps. Preserve completed steps. No extra planning turn is needed for a simple answer.",
    parameters: object(
      {
        goal: text,
        revision: number,
        steps: {
          type: "array",
          items: object(
            {
              id: text,
              title: text,
              channel: {
                type: "string",
                enum: [
                  "search",
                  "api",
                  "browser",
                  "call",
                  "community",
                  "member",
                  "local",
                ],
              },
              dependsOn: strings,
              success: text,
              fallback: text,
            },
            ["id", "title", "channel", "dependsOn", "success", "fallback"],
          ),
        },
      },
      ["goal", "steps"],
    ),
    execute: (i, c) => setPlan(c.run.id, i),
  },
  {
    name: "plan_step",
    description:
      "Mark a step blocked with a reason, cancelled, or complete with verified execution IDs from that step. Never mark simulated or unfinished work complete.",
    parameters: object(
      {
        id: text,
        status: { type: "string", enum: ["blocked", "cancelled", "complete"] },
        note: text,
        evidence: strings,
      },
      ["id", "status", "note"],
    ),
    execute: (i, c) =>
      markStep(c.run.id, i.id, i.status, i.note, i.evidence ?? []),
  },
  {
    name: "memory_search",
    description:
      "Search dated memory available in this conversation. Group searches can never access anyone’s private memory.",
    parameters: object({ query: text }, ["query"]),
    execute: (i, c) => contextMemories(c.space, c.person.id, i.query),
  },
  {
    name: "memory_save",
    description:
      "Keep one useful fact, preference, rule, relationship or procedure. Personal conversation writes privately; group conversation writes only to that group. Expire temporary plans and inventory. Never record passwords or OTPs.",
    parameters: object(
      {
        text,
        kind: {
          type: "string",
          enum: [
            "rule",
            "preference",
            "person",
            "routine",
            "inventory",
            "decision",
            "fact",
            "procedure",
          ],
        },
        aliases: strings,
        expiresAt: number,
      },
      ["text"],
    ),
    execute: (i, c) => saveMemory(c.person.id, c.space.id, i),
  },
  {
    name: "task_create",
    description:
      "Track a shared responsibility. Appointments, rides, repairs, and patient technology help. Assignment to another person is a proposal until they accept. Use known member IDs from context.",
    parameters: object(
      {
        title: text,
        category: {
          type: "string",
          enum: ["appointment", "ride", "repair", "technology", "coordination"],
        },
        assigneeId: text,
        dueAt: number,
        followupAt: number,
        note: text,
      },
      ["title"],
    ),
    execute: (i, c) => createTask(c.person.id, c.space.id, i),
  },
  {
    name: "task_update",
    description:
      "Accept, decline, block, or report your own responsibility done. Never claim someone else agreed. Only the responsible person’s message can confirm their work.",
    parameters: object(
      {
        id: text,
        status: {
          type: "string",
          enum: ["accepted", "declined", "blocked", "done", "cancelled"],
        },
        note: text,
      },
      ["id", "status"],
    ),
    execute: (i, c) => updateTask(c.person.id, i.id, i),
  },
  {
    name: "task_list",
    description:
      "Read the shared responsibility board for this group, including owners, status, due dates and options.",
    parameters: object({}),
    execute: (_i, c) =>
      db`select t.*,p.name assignee_name from gather_tasks t left join gather_people p on p.id=t.assignee_id where space_id=${c.space.id} order by created_at`,
  },
  {
    name: "option_save",
    description:
      "Save an option with a source and evidence execution ID from this run. Record language claims, quoted prices and availability separately. Recommendations are leads, not vetted qualifications. Do not invent quotes.",
    parameters: object(
      {
        taskId: text,
        name: text,
        source: text,
        language: text,
        price: text,
        availability: text,
        notes: text,
        evidenceId: text,
      },
      ["taskId", "name", "source", "evidenceId"],
    ),
    execute: (i, c) => addCandidate(c.person.id, i.taskId, i, c.run.id),
  },
  {
    name: "followup_schedule",
    description:
      "Persist a follow-up or quiet recurring check on an open responsibility. Recheck the premise later; report only a meaningful change or required decision. at is epoch milliseconds, optional intervalMs at least one hour. External outreach still needs a fresh exact action approval.",
    parameters: object(
      { prompt: text, at: number, intervalMs: number, taskId: text },
      ["prompt", "at"],
    ),
    execute: (i, c) => scheduleJob(c.person.id, c.space.id, i),
  },
  {
    name: "search_web",
    channel: "search",
    external: true,
    description:
      "Search public sources. If leads are weak, change query, read primary pages, seek recommendations with approval, or call candidates. Snippets alone do not establish qualifications.",
    parameters: object({ query: text }, ["query"]),
  },
  {
    name: "read_page",
    channel: "search",
    external: true,
    description: "Read a public text page with source attribution.",
    parameters: object({ url: text }, ["url"]),
  },
  {
    name: "calendar_read",
    channel: "api",
    external: true,
    private: true,
    description:
      "Read the requesting person’s Google calendar for a bounded ISO datetime range. In groups it requires their permission and final private review before sharing.",
    parameters: object({ from: text, to: text }, ["from", "to"]),
  },
  {
    name: "calendar_create",
    channel: "api",
    external: true,
    private: true,
    write: true,
    description:
      "Add an appointment to the authorized person’s connected calendar. Show exact title and ISO start/end before approval.",
    parameters: object({ title: text, start: text, end: text, note: text }, [
      "title",
      "start",
      "end",
    ]),
  },
  {
    name: "email_draft",
    channel: "api",
    external: true,
    private: true,
    write: true,
    description:
      "Create a real Gmail draft. Draft creation is not an email send.",
    parameters: object({ to: text, subject: text, body: text }, [
      "to",
      "subject",
      "body",
    ]),
  },
  {
    name: "email_send",
    channel: "api",
    external: true,
    private: true,
    write: true,
    outreach: true,
    description:
      "Send the exact approved email from a connected account. Requires send-as-me enabled, explicit approval, and daytime. Otherwise draft.",
    parameters: object({ to: text, subject: text, body: text }, [
      "to",
      "subject",
      "body",
    ]),
  },
  {
    name: "browser_task",
    private: true,
    channel: "browser",
    external: true,
    write: true,
    description:
      "Use a cloud browser. Every task is reviewed because clicking can disclose data or change state. complete=false stops before final submission. Stop for login and codes; use the connected phone/MCP for signed-in native apps.",
    parameters: object(
      { url: text, task: text, complete: { type: "boolean" } },
      ["url", "task"],
    ),
  },
  {
    name: "call_business",
    private: true,
    channel: "call",
    external: true,
    write: true,
    outreach: true,
    description:
      "Call a named business with an exact approved purpose and disclosed information. An initiated call is NOT a confirmed outcome. Wait for the call transcript before comparing quotes or claiming a booking. Requires configured Vapi.",
    parameters: object(
      { business: text, number: text, goal: text, disclosedInformation: text },
      ["business", "number", "goal", "disclosedInformation"],
    ),
  },
  {
    name: "community_post",
    channel: "community",
    external: true,
    write: true,
    outreach: true,
    description:
      "With explicit permission, publish exact text to a specified Reddit/Rednote community through the browser. Prefer neighborhood-level details; never include a parent’s name, address, medical details or phone without exact disclosure approval.",
    parameters: object(
      {
        community: { type: "string", enum: ["reddit", "rednote"] },
        url: text,
        title: text,
        body: text,
      },
      ["community", "url", "title", "body"],
    ),
  },
  {
    name: "mcp_call",
    external: true,
    write: true,
    private: true,
    description:
      "Use a connected device or other MCP capability belonging to the authorized person. Actions need review. Use available tool names from context; do not invent a connection. Stop for payment, password or passcode entry.",
    parameters: object(
      {
        connectionId: text,
        tool: text,
        arguments: { type: "object", additionalProperties: true },
      },
      ["connectionId", "tool", "arguments"],
    ),
  },
];
export const specs = () =>
  tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.external
      ? {
          ...t.parameters,
          properties: {
            ...t.parameters.properties,
            step_id: {
              type: "string",
              description:
                "Required when this run has a plan. The pending step this action implements.",
            },
          },
        }
      : t.parameters,
  }));
export function validate(schema: any, input: any): boolean {
  if (schema.type === "object")
    return (
      !!input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      (schema.required ?? []).every((k: string) => input[k] !== undefined) &&
      Object.entries(input).every(([k, v]) =>
        schema.properties?.[k]
          ? validate(schema.properties[k], v)
          : schema.additionalProperties !== false,
      )
    );
  if (schema.type === "array")
    return (
      Array.isArray(input) &&
      input.length <= 100 &&
      input.every((v) => validate(schema.items, v))
    );
  if (schema.type === "string")
    return (
      typeof input === "string" &&
      input.length <= 16000 &&
      (!schema.enum || schema.enum.includes(input))
    );
  if (schema.type === "number")
    return typeof input === "number" && Number.isFinite(input);
  if (schema.type === "boolean") return typeof input === "boolean";
  return true;
}
export const summary = (tool: Tool, input: any) =>
  tool.name === "call_business"
    ? `Call ${input.business} (${input.number}) about ${input.goal}`
    : tool.name === "community_post"
      ? `Post to ${input.community}: ${input.title}`
      : tool.name === "email_send"
        ? `Email ${input.to}: ${input.subject}`
        : tool.name === "calendar_create"
          ? `Add ${input.title}, ${input.start} – ${input.end}`
          : `${tool.description.split(".")[0]}: ${JSON.stringify(input).slice(0, 160)}`;
export async function ask(
  run: any,
  principal: any,
  kind: string,
  fp: string,
  label: string,
  preview: string,
  audienceVersion: number | null = null,
) {
  const id = uid("approval");
  const inserted =
    await db`insert into gather_approvals(id,run_id,approver_id,kind,fingerprint,summary,preview,audience_version,expires_at,created_at) values(${id},${run.id},${principal.id},${kind},${fp},${label},${preview},${audienceVersion},${time() + 86400000},${time()}) on conflict(run_id,fingerprint,kind) do update set status='pending',expires_at=excluded.expires_at where gather_approvals.status='superseded' or gather_approvals.expires_at<${time()} returning *`;
  await db`update gather_runs set status=${kind === "share" ? "waiting_share" : "waiting_approval"},lease_until=0,updated_at=${time()} where id=${run.id}`;
  await event(run.space_id, run.id, "waiting_input");
  if (inserted.length) {
    const { privateSpace } = await import("./channels");
    const space = await first(
      db`select * from gather_spaces where id=${run.space_id}`,
    );
    const room = await privateSpace(principal, space.agent_id);
    if (room)
      await sendMessage(
        room.id,
        `${label}\n\n${preview}\n\nReply “approve ${inserted[0].id}” or “reject ${inserted[0].id}”.`,
        run.id,
      );
    if (space.kind !== "private")
      await sendMessage(
        space.id,
        `This needs a decision from ${principal.name ?? "the responsible person"}. I’ll keep the review details private.`,
        null,
      );
  }
  return { waiting: true };
}
/** Reserve execution atomically. A crash after an outbound request leaves UNKNOWN, never a silent retry. */
export async function dispatch(run: any, space: any, person: any, call: any) {
  const tool = tools.find((t) => t.name === call.name);
  demand(tool, 400, "Unknown tool.");
  const { step_id, ...input } = call.input ?? {};
  demand(
    validate(tool.parameters, input),
    400,
    `Invalid input for ${tool.name}.`,
  );
  if (tool.external) {
    const step = await stepFor(run.id, step_id);
    if (step && tool.channel)
      demand(
        step.channel === tool.channel,
        409,
        "Use the plan’s selected channel, or revise the plan when changing approach.",
      );
  }
  const freshRun = await first(
    db`select private_result_owner from gather_runs where id=${run.id}`,
  );
  const writesShared =
    space.kind !== "private" &&
    freshRun?.private_result_owner &&
    [
      "memory_save",
      "task_create",
      "task_update",
      "option_save",
      "followup_schedule",
    ].includes(tool.name);
  const disclosureReview =
    space.kind !== "private" && freshRun?.private_result_owner && tool.external;
  const owner = await first(
    db`select * from gather_people where id=${space.owner_id}`,
  );
  let principal = space.kind !== "private" && !person.clerk_id ? owner : person;
  if (writesShared || disclosureReview)
    principal = await first(
      db`select * from gather_people where id=${freshRun.private_result_owner}`,
    );
  if (
    ["calendar_read", "calendar_create", "email_draft", "email_send"].includes(
      tool.name,
    )
  ) {
    const connected = await first(
      db`select config from gather_connections where owner_id=${principal.id} and kind='google' and status='active'`,
    );
    if (!connected && !demo && !providerHooks.invoke)
      return {
        status: "failed",
        data: {
          reason:
            "The authorized person must connect Google in Settings first.",
        },
      };
    if (
      tool.name === "email_send" &&
      connected &&
      connected.config.sendAsMe !== true
    )
      return {
        status: "failed",
        data: {
          reason: "Sending as you is off. Create a real Gmail draft instead.",
        },
      };
  }
  const fp = fingerprint(run.id, tool.name, input);
  if (
    tool.write ||
    writesShared ||
    disclosureReview ||
    (tool.private && space.kind !== "private")
  ) {
    const approval = await first(
      db`select * from gather_approvals where run_id=${run.id} and fingerprint=${fp} and kind='action' and approver_id=${principal.id} and expires_at>${time()}`,
    );
    if (approval?.status === "rejected")
      return {
        status: "rejected",
        data: {
          note: "The approver declined. Do not contact them or retry through a different channel to evade their decision.",
        },
      };
    if (approval?.status !== "approved")
      return ask(
        run,
        principal,
        "action",
        fp,
        summary(tool, input),
        json(input),
      );
  }
  if (tool.outreach) {
    const hours = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: principal.timezone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date(time())),
    );
    if (hours < 8 || hours >= 20) {
      await db`update gather_runs set status='waiting_time',lease_until=${time() + 15 * 60000},updated_at=${time()} where id=${run.id}`;
      return {
        waiting: true,
        reason: "Approved outreach is held for daytime in your timezone.",
      };
    }
  }
  if (tool.private && space.kind !== "private")
    await db`update gather_runs set private_result_owner=${principal.id} where id=${run.id}`;
  const reservation =
    await db`insert into gather_executions(id,run_id,step_id,tool,input,fingerprint,status,created_at,updated_at) values(${uid("execution")},${run.id},${step_id ?? null},${tool.name},${json(input)}::text::jsonb,${fp},'started',${time()},${time()}) on conflict(fingerprint) do nothing returning *`;
  if (!reservation.length) {
    const prior = await first(
      db`select * from gather_executions where fingerprint=${fp}`,
    );
    return {
      executionId: prior.id,
      status: prior.status === "started" ? "unknown" : prior.status,
      data: prior.output ?? {
        note: "An earlier attempt has no confirmed outcome. Check it instead of retrying.",
      },
      verified: prior.verified,
      simulated: prior.simulated,
    };
  }
  const ex = reservation[0];
  let result: ProviderResult;
  try {
    result = tool.execute
      ? {
          status: "succeeded",
          proof: ex.id,
          data: await tool.execute(input, { run, space, person, principal }),
        }
      : await invoke(tool.name, input, { run, space, person, principal });
  } catch (e: any) {
    // Explicit validation/config errors prove nothing was sent. Arbitrary provider failures may be side effects.
    const status =
      tool.write && !(e.status >= 400 && e.status < 500) && e.status !== 503
        ? "unknown"
        : "failed";
    await db`update gather_executions set status=${status},output=${json({ reason: e.message })}::text::jsonb,updated_at=${time()} where id=${ex.id}`;
    return {
      executionId: ex.id,
      status,
      data: {
        reason: e.message,
        fallback: "Change approach or ask the user; do not pretend it worked.",
      },
    };
  }
  const verified =
    result.status === "succeeded" && !!result.proof && !result.simulated;
  await db`update gather_executions set status=${result.status},output=${json(result.data)}::text::jsonb,provider_ref=${result.proof ?? null},verified=${verified},simulated=${!!result.simulated},updated_at=${time()} where id=${ex.id}`;
  await event(space.id, run.id, "step_activity", {
    tool: tool.name,
    status: result.status,
    stepId: step_id ?? null,
  });
  if (result.status === "waiting") {
    await db`update gather_runs set status='waiting_tool',lease_until=0,updated_at=${time()} where id=${run.id}`;
    return { waiting: true, executionId: ex.id };
  }
  return {
    executionId: ex.id,
    status: result.status,
    verified,
    data: result.data,
    simulated: !!result.simulated,
  };
}
