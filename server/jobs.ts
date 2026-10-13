import { db, first, uid, time, event, sendMessage } from "./store";
import { enqueue } from "./engine";
/** Claim a due job atomically. Its spawned run ID is saved before the job can be recovered. */
export async function tickJobs() {
  const rows =
    await db`select id from gather_jobs where status='scheduled' and next_at<=${time()} and lease_until<=${time()} order by next_at limit 20`;
  for (const row of rows)
    await db.begin(async (tx) => {
      const job = (
        await tx`select * from gather_jobs where id=${row.id} and status='scheduled' and next_at<=${time()} and lease_until<=${time()} for update skip locked`
      )[0];
      if (!job) return;
      if (job.task_id) {
        const task = (
          await tx`select status from gather_tasks where id=${job.task_id}`
        )[0];
        if (!task || ["done", "cancelled", "declined"].includes(task.status)) {
          await tx`update gather_jobs set status='cancelled' where id=${job.id}`;
          return;
        }
      }
      const space = (
        await tx`select audience_version from gather_spaces where id=${job.space_id}`
      )[0];
      const id = uid("run");
      await tx`insert into gather_runs(id,space_id,requester_id,request,audience_version,created_at,updated_at) values(${id},${job.space_id},${job.requester_id},${"[Follow-up] Recheck the current premise before doing anything. " + job.prompt},${space.audience_version},${time()},${time()})`;
      await tx`update gather_jobs set last_run_id=${id},next_at=${job.interval_ms ? time() + Number(job.interval_ms) : job.next_at},status=${job.interval_ms ? "scheduled" : "done"},attempts=attempts+1 where id=${job.id}`;
    });
}
export async function dueResponsibilities() {
  const due =
    await db`select t.*,p.name assignee_name from gather_tasks t left join gather_people p on p.id=t.assignee_id where status in ('proposed','accepted','blocked') and coalesce(followup_at,due_at)<=${time()} and notified_at is null limit 20`;
  for (const t of due) {
    const space = await first(
      db`select s.*,p.timezone from gather_spaces s join gather_people p on p.id=s.owner_id where s.id=${t.space_id}`,
    );
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: space.timezone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date(time())),
    );
    if (hour < 8 || hour >= 20) continue;
    const claim =
      await db`update gather_tasks set notified_at=${time()} where id=${t.id} and notified_at is null and status in ('proposed','accepted','blocked') returning id`;
    if (!claim.length) continue;
    await sendMessage(
      t.space_id,
      `${t.title} needs a check-in. ${t.status === "proposed" ? `${t.assignee_name ?? "Someone"} still needs to confirm responsibility.` : t.status === "blocked" ? "It is blocked. Can someone help?" : `${t.assignee_name ?? "The responsible person"}: is this on track?`}`,
    );
  }
}
