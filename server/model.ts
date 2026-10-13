import { db, time, demand } from "./store";
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | any[];
  tool_calls?: any[];
  tool_call_id?: string;
};
export type FunctionTool = {
  name: string;
  description: string;
  parameters: any;
};
export type Completion = {
  text: string;
  calls: { id: string; name: string; input: any }[];
  cost: number;
};
export const modelHooks: {
  complete?: (
    messages: ChatMessage[],
    tools: FunctionTool[],
    tier: string,
  ) => Promise<Completion>;
} = {};
export async function complete(
  messages: ChatMessage[],
  tools: FunctionTool[],
  tier = "cheap",
  runId: string | null = null,
): Promise<Completion> {
  if (modelHooks.complete) return modelHooks.complete(messages, tools, tier);
  demand(
    process.env.OPENROUTER_API_KEY,
    503,
    "Connect a model provider before starting a live agent.",
  );
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const cost = Number(
    (
      await db`select coalesce(sum(cost_usd),0) n from gather_usage where kind='model' and created_at>=${since.getTime()}`
    )[0].n,
  );
  demand(
    cost < Number(process.env.MODEL_CAP_USD ?? 5),
    429,
    "Today’s model budget is used up.",
  );
  const model =
    tier === "media"
      ? (process.env.MEDIA_MODEL ?? "google/gemini-2.5-flash")
      : tier === "smart"
        ? (process.env.MODEL_SMART ?? "z-ai/glm-5.3")
        : (process.env.MODEL_CHEAP ?? "z-ai/glm-5.3-flash");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "x-title": "Gather",
    },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model,
      messages,
      max_tokens: tier === "smart" ? 6144 : 4096,
      reasoning: { effort: "low", exclude: true },
      usage: { include: true },
      ...(tools.length
        ? {
            tools: tools.map((fn) => ({ type: "function", function: fn })),
            provider: { require_parameters: true },
          }
        : {}),
    }),
  });
  demand(res.ok, 502, `The model provider could not answer (${res.status}).`);
  const data: any = await res.json(),
    message = data.choices?.[0]?.message;

  const spent = Number(data.usage?.cost ?? 0);
  await db`insert into gather_usage(run_id,kind,cost_usd,created_at) values(${runId},'model',${spent},${time()})`;
  demand(message, 502, "The model returned no answer.");
  demand(
    (typeof message.content === "string" && message.content.trim()) ||
      message.tool_calls?.length,
    502,
    "The model returned an empty answer. The request is still unfinished; try again.",
  );
  return {
    text: message.content ?? "",
    cost: spent,
    calls: (message.tool_calls ?? []).map((c: any) => ({
      id: c.id,
      name: c.function.name,
      input: JSON.parse(c.function.arguments ?? "{}"),
    })),
  };
}
