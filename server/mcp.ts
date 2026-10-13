import { publicUrl } from "./providers";
import { db, demand, json, seal, unseal, uid } from "./store";
const sessions = new Map<string, string>();
let seq = 1;
async function rpc(connection: any, method: string, params: any): Promise<any> {
  const cfg = connection.config,
    secret = connection.secret ? unseal(connection.secret) : {};
  await publicUrl(cfg.url);
  const request = async (
    method: string,
    params: any,
    id: number | undefined,
  ) => {
    const r = await fetch(cfg.url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(secret.token ? { authorization: `Bearer ${secret.token}` } : {}),
        ...(sessions.get(connection.id)
          ? { "mcp-session-id": sessions.get(connection.id)! }
          : {}),
      },
      body: json({ jsonrpc: "2.0", ...(id ? { id } : {}), method, params }),
      signal: AbortSignal.timeout(45000),
    });
    demand(r.ok, 502, "The connected tool server did not answer.");
    if (r.headers.get("mcp-session-id"))
      sessions.set(connection.id, r.headers.get("mcp-session-id")!);
    if (!id || r.status === 202) return {};
    const body = await r.text();
    let result: any;
    if (r.headers.get("content-type")?.includes("text/event-stream")) {
      for (const l of body.split("\n"))
        if (l.startsWith("data:")) {
          try {
            const j = JSON.parse(l.slice(5));
            if (j.id === id) result = j;
          } catch {}
        }
    } else result = JSON.parse(body);
    demand(result && !result.error, 502, "The tool server returned an error.");
    return result.result;
  };
  if (!sessions.has(connection.id)) {
    await request(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "gather", version: "0.1" },
      },
      seq++,
    );
    sessions.set(connection.id, sessions.get(connection.id) ?? "");
    await request("notifications/initialized", {}, undefined);
  }
  return request(method, params, seq++);
}
export async function addMcp(ownerId: string, input: any) {
  const id = uid("connection");
  const temporary = {
    id,
    config: { url: input.url },
    secret: seal({ token: input.token ?? "" }),
  };
  const result = await rpc(temporary, "tools/list", {});
  demand(Array.isArray(result.tools), 502, "The server returned no tool list.");
  await db`insert into gather_connections(id,owner_id,kind,name,secret,config) values(${id},${ownerId},'mcp',${String(input.name ?? "My device").slice(0, 80)},${temporary.secret},${json({ url: input.url, tools: result.tools.slice(0, 100) })}::text::jsonb)`;
  return { id, tools: result.tools.length };
}
export async function callMcp(connection: any, tool: string, args: any) {
  demand(
    connection.config.tools?.some((t: any) => t.name === tool),
    404,
    "No such connected tool.",
  );
  return rpc(connection, "tools/call", { name: tool, arguments: args });
}
