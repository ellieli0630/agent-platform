import { db, first, uid, time, json, demand, spaceFor, event } from "./store";
export const categories = [
  "appointment",
  "ride",
  "repair",
  "technology",
  "coordination",
];
export async function createTask(
  personId: string,
  spaceId: string,
  input: any,
) {
  const space = await spaceFor(personId, spaceId);
  demand(space.kind !== "private", 400, "Responsibilities belong to a group.");
  demand(
    typeof input.title === "string" &&
      input.title.trim() &&
      input.title.length <= 200,
    400,
    "Give this responsibility a short title.",
  );
  const assignee = input.assigneeId || null;
  if (assignee)
    demand(
      await first(
        db`select 1 from gather_members where space_id=${spaceId} and person_id=${assignee}`,
      ),
      400,
      "Choose someone in this group.",
    );
  for (const field of ["dueAt", "followupAt"])
    demand(
      input[field] == null || Number.isFinite(input[field]),
      400,
      "Use a valid date.",
    );
  const id = uid("task");
  await db`insert into gather_tasks(id,space_id,created_by,assignee_id,title,category,status,due_at,followup_at,note,created_at,updated_at) values(${id},${spaceId},${personId},${assignee},${input.title.trim()},${categories.includes(input.category) ? input.category : "coordination"},${assignee === personId ? "accepted" : "proposed"},${input.dueAt ?? null},${input.followupAt ?? null},${String(input.note ?? "").slice(0, 1000)},${time()},${time()})`;
  await event(spaceId, null, "task_changed", { taskId: id });
  return first(db`select * from gather_tasks where id=${id}`);
}
export async function updateTask(personId: string, id: string, input: any) {
  const task = await first(db`select * from gather_tasks where id=${id}`);
  demand(task, 404, "No such responsibility.");
  const space = await spaceFor(personId, task.space_id);
  const status = input.status;
  demand(
    ["accepted", "declined", "blocked", "done", "cancelled"].includes(status),
    400,
    "Choose a responsibility status.",
  );
  const canCancel = personId === task.created_by || personId === space.owner_id;
  demand(
    status === "cancelled"
      ? canCancel
      : task.assignee_id === personId ||
          (!task.assignee_id && status === "accepted"),
    403,
    "Only the responsible person can accept or report progress.",
  );
  demand(
    !["done", "cancelled"].includes(task.status),
    409,
    "This responsibility is already closed.",
  );
  demand(
    status !== "done" ||
      task.status === "accepted" ||
      task.status === "blocked",
    409,
    "Accept the responsibility first.",
  );
  await db`update gather_tasks set status=${status},assignee_id=coalesce(assignee_id,${personId}),note=${String(input.note ?? task.note).slice(0, 1000)},notified_at=null,updated_at=${time()} where id=${id}`;
  await event(task.space_id, null, "task_changed", { taskId: id });
  return first(db`select * from gather_tasks where id=${id}`);
}
export async function addCandidate(
  personId: string,
  taskId: string,
  input: any,
  runId?: string,
) {
  const t = await first(db`select * from gather_tasks where id=${taskId}`);
  demand(t, 404, "No such task.");
  await spaceFor(personId, t.space_id);
  demand(
    typeof input.name === "string" &&
      input.name.trim() &&
      typeof input.source === "string" &&
      /^https?:\/\//.test(input.source),
    400,
    "An option needs a name and a source link.",
  );
  if (runId) {
    const evidence = await first(
      db`select e.id from gather_executions e join gather_runs r on r.id=e.run_id where e.id=${input.evidenceId ?? ""} and r.space_id=${t.space_id} and r.id=${runId} and e.tool in ('search_web','read_page','call_business','browser_task') and e.status='succeeded' and e.verified=true and e.simulated=false`,
    );
    demand(
      evidence,
      409,
      "Cite a verified search, page or completed call in this run.",
    );
  }
  const option = {
    id: uid("option"),
    name: input.name.slice(0, 120),
    source: input.source,
    language: String(input.language ?? "Not checked").slice(0, 120),
    price: String(input.price ?? "Not quoted").slice(0, 120),
    availability: String(input.availability ?? "Not confirmed").slice(0, 160),
    notes: String(input.notes ?? "").slice(0, 500),
    evidenceId: input.evidenceId ?? null,
    addedBy: personId,
    updatedAt: time(),
    confidence: runId ? "source-backed" : "member recommendation",
  };
  await db`update gather_tasks set candidates=candidates||${json([option])}::text::jsonb,updated_at=${time()} where id=${taskId}`;
  await event(t.space_id, null, "task_changed", { taskId });
  return option;
}
export async function scheduleJob(
  personId: string,
  spaceId: string,
  input: any,
) {
  await spaceFor(personId, spaceId);
  demand(
    typeof input.prompt === "string" &&
      input.prompt.trim() &&
      input.prompt.length <= 2000,
    400,
    "Describe the follow-up.",
  );
  demand(
    Number.isFinite(input.at) && input.at > time(),
    400,
    "Choose a future time.",
  );
  demand(
    !input.intervalMs ||
      (Number.isFinite(input.intervalMs) && input.intervalMs >= 3600000),
    400,
    "Repeat no more than once an hour.",
  );
  if (input.taskId)
    demand(
      await first(
        db`select 1 from gather_tasks where id=${input.taskId} and space_id=${spaceId}`,
      ),
      404,
      "No task in this space.",
    );
  const id = uid("job");
  await db`insert into gather_jobs(id,space_id,requester_id,task_id,prompt,next_at,interval_ms,created_at) values(${id},${spaceId},${personId},${input.taskId ?? null},${input.prompt},${input.at},${input.intervalMs ?? null},${time()})`;
  return { id, at: input.at };
}
