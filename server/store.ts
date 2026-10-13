import { SQL } from "bun";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export const demo = process.env.DEMO_MODE === "1";
if (demo && process.env.NODE_ENV === "production")
  throw new Error("Demo mode is local-only.");
export const db = new SQL(
  process.env.DATABASE_URL ??
    `postgres://gather:gather@localhost:5434/${demo ? "gather_demo" : "gather"}`,
  { max: 12 },
);
export const clock = { now: () => Date.now() };
export const time = () => clock.now();
export const uid = (type = "id") =>
  `${type}_${randomBytes(10).toString("base64url")}`;
export const first = async (query: Promise<any[]>): Promise<any | null> =>
  (await query)[0] ?? null;
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const canonical = (x: any): string =>
  Array.isArray(x)
    ? `[${x.map(canonical)}]`
    : x && typeof x === "object"
      ? `{${Object.keys(x)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`)}}`
      : JSON.stringify(x);
export const fingerprint = (run: string, tool: string, input: any) =>
  digest(`${run}:${tool}:${canonical(input)}`);
export const json = (v: any) => JSON.stringify(v);
export async function migrate() {
  await db.unsafe(
    await Bun.file(
      new URL("../migrations/001_gather.sql", import.meta.url),
    ).text(),
  );
}
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function demand(ok: any, status: number, message: string): asserts ok {
  if (!ok) throw new DomainError(status, message);
}
export async function spaceFor(personId: string, spaceId: string) {
  const s = await first(
    db`select s.*, a.name agent_name, a.purpose, a.instructions agent_instructions from gather_spaces s join gather_members m on m.space_id=s.id and m.person_id=${personId} join gather_agents a on a.id=s.agent_id where s.id=${spaceId}`,
  );
  demand(s, 404, "This space is not available to you.");
  return s;
}
export const personById = (id: string) =>
  first(db`select * from gather_people where id=${id}`);
export async function event(
  spaceId: string,
  runId: string | null,
  type: string,
  payload: any = {},
) {
  await db`insert into gather_events(space_id,run_id,type,payload,created_at) values(${spaceId},${runId},${type},${json(payload)}::text::jsonb,${time()})`;
}
export async function sendMessage(
  spaceId: string,
  text: string,
  runId: string | null = null,
  role = "assistant",
  personId: string | null = null,
) {
  const id = uid("msg");
  await db.begin(async (tx) => {
    await tx`insert into gather_messages(id,space_id,person_id,role,text,run_id,created_at) values(${id},${spaceId},${personId},${role},${text},${runId},${time()})`;
    const s = (
      await tx`select channel,audience_version from gather_spaces where id=${spaceId}`
    )[0];
    if (role === "assistant" && s?.channel === "imessage")
      await tx`insert into gather_outbox(id,space_id,message_id,text,audience_version,created_at) values(${uid("out")},${spaceId},${id},${text},${s.audience_version},${time()})`;
  });
  await event(spaceId, runId, "message", { messageId: id });
  return id;
}
function key() {
  demand(
    process.env.MASTER_KEY || demo || process.env.NODE_ENV === "test",
    503,
    "Credential encryption is not configured.",
  );
  return createHash("sha256")
    .update(process.env.MASTER_KEY ?? "local-test-only")
    .digest();
}
export function seal(value: any) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(json(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function unseal(value: string) {
  const buf = Buffer.from(value, "base64"),
    cipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  cipher.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(buf.subarray(28)), cipher.final()]).toString(),
  );
}
