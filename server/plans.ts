import { db, first, demand, json, time, event } from "./store";
export const channels = [
  "search",
  "api",
  "browser",
  "call",
  "community",
  "member",
  "local",
];
export type PlanStep = {
  id: string;
  title: string;
  channel: string;
  dependsOn: string[];
  success: string;
  fallback: string;
  status: "pending" | "complete" | "blocked" | "cancelled";
  note?: string;
  evidence?: string[];
};
export type Plan = { goal: string; steps: PlanStep[]; revision: number };
export function validatePlan(input: any): Plan {
  demand(
    typeof input?.goal === "string" &&
      input.goal.trim() &&
      Array.isArray(input.steps) &&
      input.steps.length > 0 &&
      input.steps.length <= 16,
    400,
    "A plan needs a goal and 1–16 steps.",
  );
  const ids = new Set<string>();
  const steps: PlanStep[] = input.steps.map((s: any) => {
    demand(
      typeof s.id === "string" &&
        /^[a-z0-9_-]{1,40}$/i.test(s.id) &&
        !ids.has(s.id),
      400,
      "Use unique short step IDs.",
    );
    ids.add(s.id);
    demand(
      typeof s.title === "string" &&
        s.title.trim() &&
        channels.includes(s.channel) &&
        typeof s.success === "string" &&
        s.success.trim() &&
        typeof s.fallback === "string",
      400,
      "Each step needs a channel, success criterion and fallback.",
    );
    demand(
      Array.isArray(s.dependsOn) &&
        s.dependsOn.every((d: any) => typeof d === "string"),
      400,
      "Step dependencies must be IDs.",
    );
    return {
      id: s.id,
      title: s.title.slice(0, 160),
      channel: s.channel,
      success: s.success.slice(0, 350),
      fallback: s.fallback.slice(0, 350),
      dependsOn: s.dependsOn,
      status: "pending",
    };
  });
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    demand(!visiting.has(id), 400, "Plan dependencies form a cycle.");
    if (visited.has(id)) return;
    const s = steps.find((s) => s.id === id);
    demand(s, 400, "A dependency points to a missing step.");
    visiting.add(id);
    s.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  steps.forEach((s) => visit(s.id));
  return { goal: input.goal.slice(0, 500), steps, revision: 1 };
}
export async function setPlan(runId: string, input: any) {
  const next = validatePlan(input);
  await db.begin(async (tx) => {
    const run = (
      await tx`select plan from gather_runs where id=${runId} for update`
    )[0];
    demand(run, 404, "No such run.");
    const old: Plan | null = run.plan;
    if (old) {
      demand(
        input.revision === old.revision,
        409,
        "Refresh the plan before changing it.",
      );
      for (const step of old.steps.filter((s) => s.status === "complete")) {
        const candidate = next.steps.find((s) => s.id === step.id);
        demand(
          candidate &&
            candidate.title === step.title &&
            candidate.channel === step.channel &&
            candidate.success === step.success &&
            json(candidate.dependsOn) === json(step.dependsOn),
          409,
          "Completed steps and their evidence cannot be rewritten.",
        );
        Object.assign(candidate, step);
      }
      next.revision = old.revision + 1;
    }
    await tx`update gather_runs set plan=${json(next)}::text::jsonb,updated_at=${time()} where id=${runId}`;
    await tx`update gather_approvals set status='superseded' where run_id=${runId} and status='pending' and kind='action'`;
  });
  const run = await first(
    db`select space_id from gather_runs where id=${runId}`,
  );
  await event(run.space_id, runId, "plan_changed");
  return next;
}
export async function stepFor(runId: string, stepId?: string) {
  const run = await first(db`select plan from gather_runs where id=${runId}`);
  const plan: Plan | null = run?.plan;
  if (!plan) return null;
  const step = plan.steps.find((s) => s.id === stepId);
  demand(step, 409, "Bind this action to a plan step with step_id.");
  demand(
    step.status === "pending",
    409,
    `Step ${step.id} is ${step.status}. Replan a blocked step before acting.`,
  );
  demand(
    step.dependsOn.every(
      (id) => plan.steps.find((s) => s.id === id)?.status === "complete",
    ),
    409,
    "Finish this step’s dependencies first.",
  );
  return step;
}
export async function markStep(
  runId: string,
  stepId: string,
  status: "complete" | "blocked" | "cancelled",
  note: string,
  evidence: string[] = [],
) {
  await db.begin(async (tx) => {
    const run = (
      await tx`select * from gather_runs where id=${runId} for update`
    )[0];
    const plan: Plan = run?.plan;
    demand(plan, 404, "No plan yet.");
    const step = plan.steps.find((s) => s.id === stepId);
    demand(
      step && step.status !== "complete",
      409,
      "This step is missing or already complete.",
    );
    if (status === "complete") {
      demand(
        step.dependsOn.every(
          (id) => plan.steps.find((s) => s.id === id)?.status === "complete",
        ),
        409,
        "Dependencies are unfinished.",
      );
      const executions =
        await tx`select * from gather_executions where run_id=${runId} and step_id=${stepId} and status='succeeded' and verified=true and simulated=false`;
      demand(
        evidence.length > 0 &&
          evidence.every((id) => executions.some((e: any) => e.id === id)),
        409,
        "Completion needs verified evidence from this step.",
      );
    }
    Object.assign(step, { status, note: String(note).slice(0, 500), evidence });
    plan.revision++;
    await tx`update gather_runs set plan=${json(plan)}::text::jsonb,updated_at=${time()} where id=${runId}`;
  });
  return first(db`select plan from gather_runs where id=${runId}`);
}
export function unfinished(plan: Plan | null): boolean {
  return (
    !!plan &&
    plan.steps.some((s) => s.status !== "complete" && s.status !== "cancelled")
  );
}
