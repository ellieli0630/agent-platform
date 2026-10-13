import {
  db,
  first,
  uid,
  time,
  digest,
  demand,
  json,
  spaceFor,
  event,
} from "./store";
export async function createInvite(personId: string, spaceId: string) {
  const s = await spaceFor(personId, spaceId);
  demand(
    s.owner_id === personId && s.kind !== "private" && s.channel === "web",
    403,
    "Only the group owner can invite someone to this web space.",
  );
  const token = uid("invite");
  await db`insert into gather_links(token_hash,owner_id,purpose,state,expires_at) values(${digest(token)},${personId},'group_invite',${json({ spaceId })}::text::jsonb,${time() + 7 * 86400000})`;
  return {
    url: `${process.env.PUBLIC_URL ?? "http://localhost:3100"}/#invite=${encodeURIComponent(token)}`,
    name: s.name,
  };
}
export async function inviteInfo(token: string) {
  const link = await first(
    db`select s.name,s.kind from gather_links l join gather_spaces s on s.id=l.state->>'spaceId' where token_hash=${digest(token)} and purpose='group_invite' and expires_at>${time()}`,
  );
  demand(link, 404, "This invitation expired or was used.");
  return link;
}
export async function joinInvite(personId: string, token: string) {
  const result = await db.begin(async (tx) => {
    const links =
      await tx`delete from gather_links where token_hash=${digest(token)} and purpose='group_invite' and expires_at>${time()} returning state`;
    demand(links.length, 404, "This invitation expired or was used.");
    const spaceId = links[0].state.spaceId;
    const inserted =
      await tx`insert into gather_members(space_id,person_id,joined_at) values(${spaceId},${personId},${time()}) on conflict do nothing returning person_id`;
    if (inserted.length)
      await tx`update gather_spaces set audience_version=audience_version+1 where id=${spaceId}`;
    return { id: spaceId };
  });
  await event(result.id, null, "member_joined");
  return result;
}
