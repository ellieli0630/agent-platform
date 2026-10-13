import {
  db,
  first,
  uid,
  time,
  demo,
  json,
  digest,
  demand,
  sendMessage,
} from "./store";
let spectrum: any = null,
  line: any = null;
const chats = new Map<string, any>();
export const channelState = { imessage: "not configured", lastError: "" };
export function integrationStatus() {
  return {
    model: !!process.env.OPENROUTER_API_KEY,
    search: !!process.env.BRAVE_API_KEY,
    google:
      !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    browser:
      !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID,
    calls:
      !!process.env.VAPI_API_KEY &&
      !!process.env.VAPI_ASSISTANT_ID &&
      !!process.env.VAPI_PHONE_NUMBER_ID,
    imessage: channelState.imessage,
    demo,
  };
}
export async function startChannels() {
  if (
    demo ||
    !process.env.PHOTON_PROJECT_ID ||
    !process.env.PHOTON_PROJECT_SECRET
  )
    return;
  const { Spectrum } = await import("spectrum-ts"),
    { imessage } = await import("spectrum-ts/providers/imessage");
  spectrum = await Spectrum({
    projectId: process.env.PHOTON_PROJECT_ID,
    projectSecret: process.env.PHOTON_PROJECT_SECRET,
    providers: [imessage.config()],
  });
  line = (imessage as any)(spectrum);
  channelState.imessage = "connected";
  void (async () => {
    for (;;) {
      try {
        for await (const [space, message] of spectrum.messages) {
          await inbound(space, message).catch((e: any) => {
            channelState.lastError = e.message;
          });
        }
      } catch (e: any) {
        channelState.imessage = "disconnected";
        channelState.lastError = e.message;
      }
      await Bun.sleep(5000);
      try {
        await spectrum.stop?.();
        spectrum = await Spectrum({
          projectId: process.env.PHOTON_PROJECT_ID!,
          projectSecret: process.env.PHOTON_PROJECT_SECRET!,
          providers: [imessage.config()],
        });
        line = (imessage as any)(spectrum);
        chats.clear();
        channelState.imessage = "connected";
      } catch {}
    }
  })();
}
export async function privateSpace(person: any, agentId: string) {
  const existing = await first(
    db`select * from gather_spaces where owner_id=${person.id} and agent_id=${agentId} and kind='private' order by case when channel='imessage' then 0 else 1 end limit 1`,
  );
  if (existing?.channel === "imessage" || !person.phone || !line)
    return existing;
  const chat = await line.space.create(person.phone);
  chats.set(chat.id, chat);
  const id = uid("space");
  await db.begin(async (tx) => {
    await tx`insert into gather_spaces(id,owner_id,agent_id,name,kind,channel,external_id,created_at) values(${id},${person.id},${agentId},'Private conversation','private','imessage',${chat.id},${time()})`;
    await tx`insert into gather_members(space_id,person_id,role,joined_at) values(${id},${person.id},'owner',${time()})`;
  });
  return first(db`select * from gather_spaces where id=${id}`);
}
export async function syncAudience(spaceId: string) {
  const space = await first(
    db`select * from gather_spaces where id=${spaceId}`,
  );
  if (!space || space.kind === "private" || space.channel !== "imessage")
    return space?.audience_version;
  demand(line, 503, "The group line is disconnected.");
  const chat =
    chats.get(space.external_id) ?? (await line.space.get(space.external_id));
  chats.set(space.external_id, chat);
  const participants = await chat.getMembers();
  demand(
    Array.isArray(participants),
    503,
    "Cannot verify the group’s audience.",
  );
  await db.begin(async (tx) => {
    await tx`select id from gather_spaces where id=${spaceId} for update`;
    const prior =
      await tx`select p.phone,m.person_id from gather_members m join gather_people p on p.id=m.person_id where m.space_id=${spaceId}`;
    const addresses = new Set<string>(
      participants.map((p: any) => String(p.id)),
    );
    let changed = false;
    for (const address of addresses) {
      let person = (
        await tx`select * from gather_people where phone=${address}`
      )[0];
      if (!person) {
        const id = uid("person");
        await tx`insert into gather_people(id,phone,name,created_at) values(${id},${address},${"Member …" + address.slice(-4)},${time()}) on conflict(phone) do nothing`;
        person = (
          await tx`select * from gather_people where phone=${address}`
        )[0];
      }
      const inserted =
        await tx`insert into gather_members(space_id,person_id,role,joined_at) values(${spaceId},${person.id},${person.id === space.owner_id ? "owner" : "member"},${time()}) on conflict do nothing returning person_id`;
      changed ||= inserted.length > 0;
    }
    for (const member of prior)
      if (!addresses.has(member.phone)) {
        await tx`delete from gather_members where space_id=${spaceId} and person_id=${member.person_id}`;
        changed = true;
      }
    if (changed)
      await tx`update gather_spaces set audience_version=audience_version+1 where id=${spaceId}`;
  });
  return (
    await first(
      db`select audience_version from gather_spaces where id=${spaceId}`,
    )
  ).audience_version;
}
async function inbound(chat: any, message: any) {
  if (message.direction !== "inbound" || !message.sender) return;
  chats.set(chat.id, chat);
  const phone = String(message.sender.id);
  let person = await first(
    db`select * from gather_people where phone=${phone}`,
  );
  if (!person) {
    const id = uid("person");
    await db`insert into gather_people(id,phone,name,created_at) values(${id},${phone},${"Member …" + phone.slice(-4)},${time()}) on conflict(phone) do nothing`;
    person = await first(db`select * from gather_people where phone=${phone}`);
  }
  let space = await first(
    db`select s.*,a.name agent_name from gather_spaces s join gather_agents a on a.id=s.agent_id where external_id=${chat.id}`,
  );
  if (!space) {
    if (!person.clerk_id) return;
    const agent = await first(
      db`select a.* from gather_agents a where a.owner_id=${person.id} and (select count(*) from gather_memories m where m.agent_id=a.id and m.owner_id=${person.id})>=3 order by created_at limit 1`,
    );
    if (!agent) return;
    const id = uid("space");
    await db`insert into gather_spaces(id,owner_id,agent_id,name,kind,channel,external_id,created_at) values(${id},${person.id},${agent.id},${chat.type === "group" ? "Your group" : "Private conversation"},${chat.type === "group" ? "family" : "private"},'imessage',${chat.id},${time()})`;
    space = await first(
      db`select s.*,a.name agent_name from gather_spaces s join gather_agents a on a.id=s.agent_id where s.id=${id}`,
    );
  }
  // A new participant changes the audience before any pending response can be released.
  const joined =
    await db`insert into gather_members(space_id,person_id,role,joined_at) values(${space.id},${person.id},${person.id === space.owner_id ? "owner" : "member"},${time()}) on conflict do nothing returning person_id`;
  if (joined.length && space.kind !== "private")
    await db`update gather_spaces set audience_version=audience_version+1 where id=${space.id}`;
  if (space.kind !== "private") await syncAudience(space.id);
  const { decideApproval, enqueue } = await import("./engine");
  const content = message.content;
  const text =
    content?.type === "text"
      ? content.text
      : content?.type === "richlink"
        ? content.url
        : null;
  const pending =
    await db`select * from gather_approvals where approver_id=${person.id} and status='pending' and expires_at>${time()}`;
  if (content?.type === "reaction" && content.target?.id) {
    const sent = await first(
      db`select m.run_id from gather_outbox o join gather_messages m on m.id=o.message_id where o.provider_ref=${String(content.target.id)}`,
    );
    const a = pending.filter((a: any) => a.run_id === sent?.run_id);
    if (a.length === 1 && ["👍", "👎"].includes(content.emoji))
      await decideApproval(
        person.id,
        a[0].id,
        content.emoji === "👍" ? "approve" : "reject",
      );
    return;
  }
  if (!text) return;
  const specific = text.match(/^(approve|reject)\s+(approval_[\w-]+)$/i);
  if (specific) {
    await decideApproval(person.id, specific[2], specific[1].toLowerCase());
    return;
  }
  if (space.kind === "private" && /^(yes|no|👍|👎)$/i.test(text.trim())) {
    if (pending.length === 1) {
      await decideApproval(
        person.id,
        pending[0].id,
        /^(yes|👍)$/i.test(text.trim()) ? "approve" : "reject",
      );
      return;
    }
    if (pending.length > 1) {
      await sendMessage(
        space.id,
        "There is more than one decision waiting. Reply with “approve” and the card’s ID, or open Gather to choose.",
      );
      return;
    }
  }
  const name = space.agent_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (
    space.kind !== "private" &&
    !new RegExp(`(^|\\W)@?${name}(\\W|$)`, "i").test(text)
  )
    return;
  await enqueue(person.id, space.id, text, String(message.id));
}
/** Delivery and verification are separate. A crashed started send is unknown, never resent automatically. */
export async function flushOutbox() {
  if (!line || demo) return;
  const rows =
    await db`select o.*,s.external_id from gather_outbox o join gather_spaces s on s.id=o.space_id where o.status='queued' order by created_at limit 20`;
  for (const o of rows) {
    try {
      const version = await syncAudience(o.space_id);
      if (o.audience_version != null && version !== o.audience_version) {
        await db`update gather_outbox set status='held' where id=${o.id}`;
        await db`update gather_messages set role='held' where id=${o.message_id}`;
        const run = await first(
          db`select r.* from gather_runs r join gather_messages m on m.run_id=r.id where m.id=${o.message_id}`,
        );
        if (run) {
          const { ask } = await import("./tools");
          const principal = await first(
            db`select * from gather_people where id=${run.private_result_owner ?? run.requester_id}`,
          );
          await ask(
            run,
            principal,
            "share",
            digest(`${o.text}:${version}`),
            "The group changed before delivery. Review this reply again.",
            o.text,
            version,
          );
        }
        continue;
      }
    } catch {
      continue;
    }
    const claim =
      await db`update gather_outbox set status='started',attempts=attempts+1 where id=${o.id} and status='queued' returning id`;
    if (!claim.length) continue;
    try {
      const chat =
        chats.get(o.external_id) ?? (await line.space.get(o.external_id));
      chats.set(o.external_id, chat);
      const message = await chat.send(o.text);
      demand(message?.id, 502, "No delivery ID.");
      await db`update gather_outbox set status='sent',provider_ref=${String(message.id)} where id=${o.id}`;
    } catch {
      await db`update gather_outbox set status='unknown' where id=${o.id}`;
    }
  }
}
export async function beginPhoneLink(person: any, phone: string) {
  demand(!demo && line, 503, "The iMessage line is not connected.");
  demand(
    /^\+[1-9]\d{7,14}$/.test(phone),
    400,
    "Use your phone number with country code.",
  );
  const other = await first(
    db`select clerk_id from gather_people where phone=${phone} and id!=${person.id}`,
  );
  demand(!other?.clerk_id, 409, "This phone is linked to another account.");
  const recent = await first(
    db`select 1 from gather_links where owner_id=${person.id} and purpose='phone' and expires_at>${time() + 540000}`,
  );
  demand(!recent, 429, "Wait a minute before requesting another code.");
  const code = String(
      (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000,
    ),
    token = uid("phone");
  await db`delete from gather_links where owner_id=${person.id} and purpose='phone'`;
  await db`insert into gather_links(token_hash,owner_id,purpose,state,expires_at) values(${digest(token)},${person.id},'phone',${json({ phone, codeHash: digest(code), attempts: 0 })}::text::jsonb,${time() + 600000})`;
  const chat = await line.space.create(phone);
  await chat.send(
    `Your Gather linking code is ${code}. It expires in 10 minutes. If you did not request it, ignore this message.`,
  );
  return { sent: true };
}
export async function verifyPhoneLink(person: any, code: string) {
  await db.begin(async (tx) => {
    const link = (
      await tx`select * from gather_links where owner_id=${person.id} and purpose='phone' and expires_at>${time()} for update`
    )[0];
    demand(link, 400, "This code expired.");
    // Count attempts even on a wrong code (validation is outside the transaction below).
    await tx`update gather_links set state=jsonb_set(state,'{attempts}',${json(Number(link.state.attempts) + 1)}::text::jsonb) where token_hash=${link.token_hash}`;
  });
  const link = await first(
    db`select * from gather_links where owner_id=${person.id} and purpose='phone' and expires_at>${time()}`,
  );
  demand(
    link && link.state.attempts <= 5 && digest(code) === link.state.codeHash,
    400,
    "That code is wrong or expired.",
  );
  // Don't merge histories implicitly. Existing guests can link by signing in on a fresh, verified account migration later.
  demand(
    !(await first(
      db`select 1 from gather_people where phone=${link.state.phone} and id!=${person.id}`,
    )),
    409,
    "This phone already has a group identity; contact the operator to link its history safely.",
  );
  await db`update gather_people set phone=${link.state.phone} where id=${person.id}`;
  await db`delete from gather_links where token_hash=${link.token_hash}`;
  const agent = await first(
    db`select * from gather_agents where owner_id=${person.id} order by created_at limit 1`,
  );
  if (agent) {
    const s = await privateSpace(
      { ...person, phone: link.state.phone },
      agent.id,
    );
    if (s)
      await sendMessage(
        s.id,
        `I’m ${agent.name}, now here too. Your private training stays private. Add this line to your group and address me by name to coordinate together.`,
      );
  }
  return { linked: true };
}
