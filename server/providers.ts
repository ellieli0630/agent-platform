import { lookup } from "node:dns/promises";
import {
  db,
  first,
  demand,
  seal,
  unseal,
  time,
  uid,
  json,
  demo,
  localTest,
} from "./store";
import { complete, type ChatMessage } from "./model";
export type ProviderResult = {
  status: "succeeded" | "waiting" | "unknown";
  data: any;
  proof?: string;
  simulated?: boolean;
};
export const providerHooks: {
  invoke?: (tool: string, input: any, ctx: any) => Promise<ProviderResult>;
} = {};
export async function publicUrl(raw: string) {
  const u = new URL(raw);
  demand(
    ["https:", "http:"].includes(u.protocol) && !u.username && !u.password,
    400,
    "Use a public web address.",
  );
  const records = await lookup(u.hostname, { all: true });
  const privateIp = (ip: string) =>
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80|::ffff:)/i.test(
      ip,
    );
  demand(
    records.length && !records.some((r) => privateIp(r.address)),
    400,
    "Private network addresses are not available to the agent.",
  );
  return u;
}
async function google(
  ownerId: string,
  path: string,
  options: RequestInit = {},
) {
  const c = await first(
    db`select * from gather_connections where owner_id=${ownerId} and kind='google' and status='active'`,
  );
  demand(c, 409, "Connect Google in Settings first.");
  let token = unseal(c.secret);
  if (Number(token.expiresAt) < time() + 60000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: token.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const t: any = await res.json();
    demand(
      res.ok && t.access_token,
      409,
      "Reconnect Google to refresh access.",
    );
    token = {
      ...token,
      accessToken: t.access_token,
      expiresAt: time() + t.expires_in * 1000,
    };
    await db`update gather_connections set secret=${seal(token)} where id=${c.id}`;
  }
  const res = await fetch(`https://www.googleapis.com/${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token.accessToken}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });
  demand(res.ok, 502, `Google did not confirm this request (${res.status}).`);
  return res.status === 204 ? {} : res.json();
}
export async function invoke(
  tool: string,
  input: any,
  ctx: any,
): Promise<ProviderResult> {
  if (providerHooks.invoke) return providerHooks.invoke(tool, input, ctx);
  demand(
    !demo && !localTest,
    409,
    "Outbound providers are disabled in this local preview.",
  );
  switch (tool) {
    case "search_web": {
      demand(
        process.env.BRAVE_API_KEY,
        503,
        "Web search needs a Brave Search key.",
      );
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(input.query)}&count=6`,
        {
          headers: { "X-Subscription-Token": process.env.BRAVE_API_KEY },
          signal: AbortSignal.timeout(20000),
        },
      );
      demand(res.ok, 502, "Search is unavailable.");
      const j: any = await res.json();
      return {
        status: "succeeded",
        proof: "brave-search",
        data: {
          sources: (j.web?.results ?? []).map((r: any) => ({
            title: r.title,
            url: r.url,
            description: r.description,
          })),
          note: "Search snippets are leads, not confirmed availability or qualifications.",
        },
      };
    }
    case "read_page": {
      const u = await publicUrl(input.url),
        res = await fetch(u, {
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        });
      demand(
        res.ok,
        502,
        "The page is unavailable; use the browser or another source.",
      );
      const type = res.headers.get("content-type") ?? "";
      demand(/text|json/.test(type), 400, "Read a text page.");
      // Bounded streaming read: do not buffer unbounded third-party responses.
      const reader = res.body!.getReader();
      let text = "",
        bytes = 0;
      const decoder = new TextDecoder();
      try {
        while (bytes < 200000) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          text += decoder.decode(value, { stream: true });
        }
      } finally {
        await reader.cancel();
      }
      return {
        status: "succeeded",
        proof: u.href,
        data: {
          url: u.href,
          text: text
            .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 16000),
        },
      };
    }
    case "calendar_read": {
      demand(
        Number.isFinite(Date.parse(input.from)) &&
          Number.isFinite(Date.parse(input.to)) &&
          Date.parse(input.to) > Date.parse(input.from),
        400,
        "Use a valid calendar date range.",
      );
      const q = new URLSearchParams({
        timeMin: input.from,
        timeMax: input.to,
        singleEvents: "true",
        maxResults: "40",
        orderBy: "startTime",
      });
      const j: any = await google(
        ctx.principal.id,
        `calendar/v3/calendars/primary/events?${q}`,
      );
      return {
        status: "succeeded",
        proof: "google-calendar",
        data: {
          events: (j.items ?? []).map((e: any) => ({
            id: e.id,
            title: e.summary,
            start: e.start,
            end: e.end,
          })),
        },
      };
    }
    case "calendar_create": {
      demand(
        Date.parse(input.end) > Date.parse(input.start),
        400,
        "The appointment end must follow its start.",
      );
      const event: any = await google(
        ctx.principal.id,
        "calendar/v3/calendars/primary/events",
        {
          method: "POST",
          body: json({
            summary: input.title,
            start: { dateTime: input.start },
            end: { dateTime: input.end },
            description: input.note ?? "",
          }),
        },
      );
      return {
        status: "succeeded",
        proof: event.id,
        data: {
          id: event.id,
          start: event.start,
          end: event.end,
          url: event.htmlLink,
          title: event.summary,
        },
      };
    }
    case "email_draft":
    case "email_send": {
      demand(
        /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(input.to) &&
          !/[\r\n]/.test(input.subject),
        400,
        "Use one valid email recipient and a single-line subject.",
      );
      if (tool === "email_send") {
        const c = await first(
          db`select config from gather_connections where owner_id=${ctx.principal.id} and kind='google' and status='active'`,
        );
        demand(
          c?.config?.sendAsMe === true,
          403,
          "Sending as you is off. Create a Gmail draft instead.",
        );
      }
      const raw = Buffer.from(
        `To: ${input.to}\r\nSubject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.body}`,
      ).toString("base64url");
      const result: any = await google(
        ctx.principal.id,
        tool === "email_draft"
          ? "gmail/v1/users/me/drafts"
          : "gmail/v1/users/me/messages/send",
        {
          method: "POST",
          body: json(tool === "email_draft" ? { message: { raw } } : { raw }),
        },
      );
      return {
        status: "succeeded",
        proof: result.id,
        data: {
          id: result.id,
          to: input.to,
          subject: input.subject,
          kind: tool === "email_draft" ? "draft" : "sent",
        },
      };
    }
    case "call_business": {
      demand(
        process.env.VAPI_API_KEY &&
          process.env.VAPI_ASSISTANT_ID &&
          process.env.VAPI_PHONE_NUMBER_ID,
        503,
        "Business calling is not configured.",
      );
      demand(
        /^\+[1-9]\d{7,14}$/.test(input.number),
        400,
        "Use a phone number including country code.",
      );
      const today = time() - 86400000;
      const count = (
        await db`select count(*) n from gather_usage where kind='call' and created_at>${today}`
      )[0].n;
      demand(
        Number(count) < Number(process.env.CALL_CAP_PER_DAY ?? 10),
        429,
        "The daily call limit is reached.",
      );
      const res = await fetch("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.VAPI_API_KEY}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(30000),
        body: json({
          assistantId: process.env.VAPI_ASSISTANT_ID,
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
          customer: { number: input.number, name: input.business },
          assistantOverrides: {
            variableValues: {
              task: input.goal,
              disclosedInformation:
                input.disclosedInformation ?? "No personal details authorized.",
              requesterName: ctx.principal.name,
            },
          },
        }),
      });
      // A timeout or unexpected response cannot safely be replayed: the call may already have started.
      if (!res.ok)
        return {
          status: "unknown",
          data: {
            reason: `Call provider returned ${res.status}. Check the provider before retrying.`,
          },
        };
      const call: any = await res.json();
      demand(call.id, 502, "The call provider returned no ID.");
      await db`insert into gather_usage(run_id,kind,created_at) values(${ctx.run.id},'call',${time()})`;
      return {
        status: "waiting",
        proof: call.id,
        data: {
          callId: call.id,
          business: input.business,
          note: "Call initiated; no booking, quote or availability is confirmed yet.",
        },
      };
    }
    case "browser_task": {
      const { browse } = await import("./browser");
      return browse(input, ctx);
    }
    case "community_post": {
      // The same reviewed browser adapter is used; no hidden account or API credential is invented.
      demand(
        ["reddit", "rednote"].includes(input.community),
        400,
        "Choose Reddit or Rednote.",
      );
      const host = new URL(input.url).hostname.toLowerCase(),
        expected =
          input.community === "reddit" ? "reddit.com" : "xiaohongshu.com";
      demand(
        host === expected || host.endsWith("." + expected),
        400,
        "Use the selected community website.",
      );
      const { browse } = await import("./browser");
      return browse(
        {
          url: input.url,
          task: `Post exactly this approved text in the indicated community. Do not add personal details. Title: ${input.title}\nBody: ${input.body}`,
          complete: true,
        },
        ctx,
      );
    }
    case "mcp_call": {
      const c = await first(
        db`select * from gather_connections where id=${input.connectionId} and owner_id=${ctx.principal.id} and kind='mcp' and status='active'`,
      );
      demand(c, 404, "This device is not connected.");
      const { callMcp } = await import("./mcp");
      const result = await callMcp(c, input.tool, input.arguments ?? {});
      return {
        status: result.isError ? "unknown" : "succeeded",
        proof: result.isError ? undefined : `${c.id}:${input.tool}`,
        data: result,
      };
    }
    default:
      throw new Error(`Unknown provider tool: ${tool}`);
  }
}
export async function completedCall(callId: string) {
  if (!process.env.VAPI_API_KEY) return null;
  const r = await fetch(
    `https://api.vapi.ai/call/${encodeURIComponent(callId)}`,
    {
      headers: { authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) return null;
  const call: any = await r.json();
  if (call.status !== "ended") return null;
  const transcript = call.artifact?.transcript ?? call.transcript ?? "";
  return {
    status: transcript ? "succeeded" : "failed",
    proof: call.id,
    data: {
      callId: call.id,
      endedReason: call.endedReason,
      transcript: String(transcript).slice(0, 18000),
      summary: call.analysis?.summary ?? null,
      note: "The transcript is evidence of the conversation, not a guarantee of a booking. Extract exact quotes, dates and confirmation numbers.",
    },
  };
}
