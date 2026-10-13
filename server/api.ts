import {
  db,
  first,
  uid,
  time,
  demand,
  json,
  spaceFor,
  sendMessage,
  seal,
  digest,
  demo,
  event,
} from "./store";
import { authenticate } from "./auth";
import { enqueue, decideApproval, traceFor } from "./engine";
import { createTask, updateTask, addCandidate, scheduleJob } from "./tasks";
import {
  saveMemory,
  forgetMemory,
  shareMemory,
  listMemories,
  buildProfile,
  memoryKinds,
} from "./memory";
import { setPlan } from "./plans";
import { addMcp } from "./mcp";
import { integrationStatus, beginPhoneLink, verifyPhoneLink } from "./channels";
import { uploadAttachment, withAttachments } from "./media";
import { continueRun } from "./engine";
import { createInvite, inviteInfo, joinInvite } from "./invites";
const body = async (req: Request) => {
  const text = await req.text();
  demand(text.length <= 30000, 413, "The request is too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
  }
};
export async function handleApi(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url),
      path = url.pathname;
    const person = await authenticate(req);
    demand(person, 401, "Sign in first.");
    const isPost = req.method === "POST",
      isPut = req.method === "PUT";
    const input =
      (isPost || isPut) &&
      !req.headers.get("content-type")?.startsWith("multipart/form-data")
        ? await body(req)
        : {};
    const match = (pattern: RegExp) => path.match(pattern);
    let m: RegExpMatchArray | null;
    let result: any;
    if (path === "/api/bootstrap") {
      const agents =
        await db`select a.*, (select count(*) from gather_memories where agent_id=a.id and owner_id=${person.id}) memory_count from gather_agents a where owner_id=${person.id} order by created_at`;
      const spaces =
        await db`select s.id,s.name,s.kind,s.channel,s.agent_id,a.name agent_name from gather_spaces s join gather_members m on m.space_id=s.id and m.person_id=${person.id} join gather_agents a on a.id=s.agent_id order by s.created_at`;
      result = {
        person,
        agents,
        spaces,
        demo,
        integrations: integrationStatus(),
      };
    } else if ((m = match(/^\/api\/spaces\/([^/]+)\/invites$/)) && isPost) {
      result = await createInvite(person.id, m[1]);
    } else if ((m = match(/^\/api\/invites\/([^/]+)$/))) {
      result = isPost
        ? await joinInvite(person.id, m[1])
        : await inviteInfo(m[1]);
    } else if (path === "/api/agents" && isPost) {
      demand(
        typeof input.name === "string" &&
          input.name.trim() &&
          String(input.purpose ?? "").trim(),
        400,
        "Give your agent a name and purpose.",
      );
      const id = uid("agent"),
        spaceId = uid("space");
      await db.begin(async (tx) => {
        await tx`insert into gather_agents(id,owner_id,name,purpose,instructions,created_at) values(${id},${person.id},${input.name.trim().slice(0, 40)},${String(input.purpose).slice(0, 1000)},${String(input.instructions ?? "").slice(0, 2000)},${time()})`;
        await tx`insert into gather_spaces(id,owner_id,agent_id,name,kind,created_at) values(${spaceId},${person.id},${id},${"Just you & " + input.name.trim().slice(0, 40)},'private',${time()})`;
        await tx`insert into gather_members(space_id,person_id,role,joined_at) values(${spaceId},${person.id},'owner',${time()})`;
      });
      await sendMessage(
        spaceId,
        `I’m ${input.name}. What would you like to hand off first, and what should I keep in mind? This conversation stays private.`,
      );
      result = { id, spaceId };
    } else if (path === "/api/spaces" && isPost) {
      demand(
        ["family", "friends", "neighborhood"].includes(input.kind) &&
          String(input.name ?? "").trim(),
        400,
        "Choose a group name and type.",
      );
      const agent = await first(
        db`select * from gather_agents where id=${input.agentId} and owner_id=${person.id}`,
      );
      demand(agent, 404, "Choose your agent.");
      const count = Number(
        (
          await db`select count(*) n from gather_memories where agent_id=${agent.id} and owner_id=${person.id}`
        )[0].n,
      );
      demand(
        count >= 3,
        409,
        "Train this agent with at least three memories first.",
      );
      const id = uid("space");
      await db.begin(async (tx) => {
        await tx`insert into gather_spaces(id,owner_id,agent_id,name,kind,instructions,created_at) values(${id},${person.id},${agent.id},${input.name.slice(0, 80)},${input.kind},${String(input.instructions ?? "").slice(0, 1500)},${time()})`;
        await tx`insert into gather_members(space_id,person_id,role,joined_at) values(${id},${person.id},'owner',${time()})`;
      });
      result = { id };
    } else if ((m = match(/^\/api\/spaces\/([^/]+)$/))) {
      const s = await spaceFor(person.id, m[1]);
      const members =
        await db`select p.id,p.name,m.role from gather_members m join gather_people p on p.id=m.person_id where m.space_id=${s.id}`;
      const tasks =
        await db`select t.*,p.name assignee_name from gather_tasks t left join gather_people p on p.id=t.assignee_id where t.space_id=${s.id} order by t.created_at`;
      const messages =
        await db`select m.id,m.role,m.person_id,m.text,m.run_id,m.created_at,p.name person_name from gather_messages m left join gather_people p on p.id=m.person_id where m.role in ('user','assistant') and space_id=${s.id} order by m.created_at limit 250`;
      const runs =
        await db`select id,request,status,case when private_result_owner is null or private_result_owner=${person.id} then plan else null end plan,tier,created_at,updated_at,case when private_result_owner is null or private_result_owner=${person.id} then reply else null end reply from gather_runs where space_id=${s.id} order by created_at desc limit 20`;
      const jobs =
        await db`select id,prompt,kind,next_at,interval_ms,status from gather_jobs where space_id=${s.id} and status='scheduled' order by next_at`;
      result = {
        space: {
          id: s.id,
          name: s.name,
          kind: s.kind,
          channel: s.channel,
          owner_id: s.owner_id,
          agent_id: s.agent_id,
          agent_name: s.agent_name,
          instructions: s.instructions,
        },
        members,
        tasks,
        messages,
        runs,
        jobs,
      };
    } else if ((m = match(/^\/api\/spaces\/([^/]+)\/messages$/)) && isPost)
      result = await enqueue(
        person.id,
        m[1],
        await withAttachments(
          person.id,
          m[1],
          String(input.text ?? ""),
          input.files ?? [],
        ),
      );
    else if ((m = match(/^\/api\/spaces\/([^/]+)\/files$/)) && isPost)
      result = await uploadAttachment(person.id, m[1], req);
    else if ((m = match(/^\/api\/runs\/([^/]+)\/continue$/)) && isPost)
      result = await continueRun(person.id, m[1], String(input.text ?? ""));
    else if ((m = match(/^\/api\/spaces\/([^/]+)\/tasks$/)) && isPost)
      result = await createTask(person.id, m[1], input);
    else if ((m = match(/^\/api\/tasks\/([^/]+)$/)) && isPut)
      result = await updateTask(person.id, m[1], input);
    else if ((m = match(/^\/api\/tasks\/([^/]+)\/options$/)) && isPost)
      result = await addCandidate(person.id, m[1], input);
    else if ((m = match(/^\/api\/spaces\/([^/]+)\/followups$/)) && isPost)
      result = await scheduleJob(person.id, m[1], input);
    else if ((m = match(/^\/api\/jobs\/([^/]+)$/)) && req.method === "DELETE") {
      await db`update gather_jobs set status='cancelled' where id=${m[1]} and requester_id=${person.id}`;
      result = { ok: true };
    } else if (path === "/api/approvals")
      result =
        await db`select a.*,s.name space_name,p.name requester_name from gather_approvals a join gather_runs r on r.id=a.run_id join gather_spaces s on s.id=r.space_id join gather_people p on p.id=r.requester_id where approver_id=${person.id} and a.status='pending' and expires_at>${time()} order by created_at`;
    else if ((m = match(/^\/api\/approvals\/([^/]+)$/)) && isPost)
      result = await decideApproval(person.id, m[1], input.decision);
    else if ((m = match(/^\/api\/runs\/([^/]+)\/plan$/)) && isPut) {
      const run = await first(
        db`select * from gather_runs where id=${m[1]} and requester_id=${person.id}`,
      );
      demand(
        run && !["running", "waiting_tool", "done"].includes(run.status),
        409,
        "Pause or wait for the current action before editing the plan.",
      );
      await spaceFor(person.id, run.space_id);
      demand(
        !run.private_result_owner || run.private_result_owner === person.id,
        403,
        "This plan contains private results.",
      );
      result = await setPlan(run.id, input);
      await db`update gather_runs set status='queued',lease_until=0 where id=${run.id}`;
    } else if ((m = match(/^\/api\/runs\/([^/]+)\/trace$/))) {
      result = await traceFor(person.id, m[1]);
    } else if ((m = match(/^\/api\/spaces\/([^/]+)\/memories$/))) {
      const s = await spaceFor(person.id, m[1]);
      result = isPost
        ? await saveMemory(person.id, s.id, input)
        : await listMemories(
            person.id,
            s.agent_id,
            s.kind === "private" ? undefined : s.id,
          );
    } else if (
      (m = match(/^\/api\/memories\/([^/]+)$/)) &&
      req.method === "DELETE"
    ) {
      await forgetMemory(person.id, m[1]);
      result = { ok: true };
    } else if ((m = match(/^\/api\/memories\/([^/]+)\/share$/)) && isPost)
      result = await shareMemory(person.id, m[1], input.spaceId);
    else if ((m = match(/^\/api\/spaces\/([^/]+)\/profile$/)) && isPost) {
      const s = await spaceFor(person.id, m[1]);
      demand(s.kind === "private", 403, "Profiles are private.");
      demand(!demo, 409, "Profile generation uses a live model, not the demo.");
      await buildProfile(person.id, s.agent_id);
      result = { ok: true };
    } else if (path === "/api/phone/start" && isPost)
      result = await beginPhoneLink(person, String(input.phone ?? ""));
    else if (path === "/api/phone/verify" && isPost)
      result = await verifyPhoneLink(person, String(input.code ?? ""));
    else if (path === "/api/connections")
      result =
        await db`select id,kind,name,status,config->>'sendAsMe' send_as_me from gather_connections where owner_id=${person.id} order by kind`;
    else if (path === "/api/connections/mcp" && isPost) {
      demand(!demo, 409, "Connect devices in a live workspace.");
      result = await addMcp(person.id, input);
    } else if ((m = match(/^\/api\/connections\/([^/]+)$/)) && isPut) {
      await db`update gather_connections set config=jsonb_set(config,'{sendAsMe}',${json(input.sendAsMe === true)}::text::jsonb) where id=${m[1]} and owner_id=${person.id} and kind='google'`;
      result = { ok: true };
    } else if (
      (m = match(/^\/api\/connections\/([^/]+)$/)) &&
      req.method === "DELETE"
    ) {
      await db`update gather_connections set status='revoked',secret=null where id=${m[1]} and owner_id=${person.id}`;
      result = { ok: true };
    } else if (path === "/api/connections/google" && isPost) {
      demand(
        !demo &&
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET,
        503,
        "Google OAuth is not configured.",
      );
      const state = uid("oauth");
      await db`insert into gather_links(token_hash,owner_id,purpose,state,expires_at) values(${digest(state)},${person.id},'google','{}',${time() + 600000})`;
      const q = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: `${process.env.PUBLIC_URL}/oauth/google`,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        state,
        scope:
          "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.compose",
      });
      result = { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
    } else if (path === "/api/events") {
      const spaceId = url.searchParams.get("space") ?? "";
      await spaceFor(person.id, spaceId);
      const after = Number(url.searchParams.get("after") ?? 0);
      demand(
        Number.isFinite(after) && after >= 0,
        400,
        "Invalid event cursor.",
      );
      result =
        await db`select seq,type,payload,created_at from gather_events where space_id=${spaceId} and seq>${after} order by seq limit 100`;
    } else throw Object.assign(new Error("No such endpoint."), { status: 404 });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e: any) {
    return Response.json(
      { error: e.message ?? "Something went wrong." },
      { status: e.status ?? 500, headers: { "cache-control": "no-store" } },
    );
  }
}
export async function googleCallback(req: Request) {
  const q = new URL(req.url).searchParams,
    hash = digest(q.get("state") ?? "");
  const used =
    await db`delete from gather_links where token_hash=${hash} and purpose='google' and expires_at>${time()} returning *`;
  demand(used.length, 400, "This connection link expired.");
  demand(q.get("code"), 400, "Google access was not granted.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code: q.get("code")!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.PUBLIC_URL}/oauth/google`,
      grant_type: "authorization_code",
    }),
  });
  const t: any = await r.json();
  demand(
    r.ok && t.access_token && t.refresh_token,
    502,
    "Google did not issue an offline credential.",
  );
  await db`insert into gather_connections(id,owner_id,kind,name,secret,config) values(${uid("connection")},${used[0].owner_id},'google','Google',${seal({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: time() + t.expires_in * 1000 })},'{"sendAsMe":false}') on conflict(owner_id,kind,name) do update set secret=excluded.secret,status='active'`;
  return Response.redirect(`${process.env.PUBLIC_URL}/#/settings`, 302);
}
