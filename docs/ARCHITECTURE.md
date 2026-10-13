# Product and execution architecture

Gather starts in existing relationships. A parent should be able to ask a shared family agent for patient help without learning an agent dashboard. The dashboard gives the person coordinating care a view of responsibilities, decisions and follow-through. Family, friends and neighborhood spaces each have their own context.

## The family workflow

A request to arrange an appointment becomes separate responsibilities for confirming the clinic, arranging a ride and checking the outcome. Assigning Daniel is a proposal until Daniel accepts. Only the responsible person can report it done. Appointment details from someone's calendar remain private; that account's owner reviews the exact minimal group update. A scheduled check rereads current task state, cancels when the linked responsibility closes, and suppresses unchanged follow-ups.

For a Mandarin-speaking handyman, the agent can search English and Chinese terms, read business pages, seek an approved call, compare candidates and ask the family for a decision. Search snippets are leads. A call being initiated does not establish price or availability. Booking or spending is not a supported automatic promise. Patient technology help gives one step, waits for what the parent sees, then adapts.

## Small runtime, explicit contracts

Bun serves a React interface and authenticated JSON API. PostgreSQL stores all durable state in `gather_*` tables. OpenRouter receives a normal chat/tool loop; there is no mandatory planner or judge call. Simple replies do not require a planner turn. Both the cheap and smart runtime tiers default to GLM 5.3 through OpenRouter; tiering still lets deployments configure different models later. Local scripts and two concise skills hold workflow guidance.

A run stores its transcript and pending tool calls before executing them. Workers claim runs with a lease and renew it while active. An execution fingerprint includes the run, tool and canonical input. Atomic reservation avoids duplicate execution by concurrent workers. A process restart reuses the pending call and its recorded outcome. A started or unknown write is not retried automatically. This is a conservative delivery strategy, not an exactly-once guarantee across arbitrary providers.

Plans define a goal and ordered dependencies with success criteria and an alternate approach. Tool execution requires the relevant step and completed dependencies. Marking a step complete requires verified, unsimulated execution records from that exact step. Completed steps cannot be rewritten. Blocked steps may be revised with an optimistic revision check. An unfinished plan leaves the run open. Continuing appends new information to the same run and preserves evidence.

## Privacy and authority

All space access requires membership. Group model context excludes private memories, private profiles and owner training instructions, including when the requester owns the agent. Memory IDs cannot bypass the private/shared boundary. A deliberate share copies just one selected fact into one group. Correcting or forgetting private memory invalidates the derived profile; generation checks the memory revision digest before committing, so a concurrent job cannot resurrect a forgotten fact. Forgetting memory leaves existing conversation history intact.

Account reads set a private-result owner before returning data. A group run that reads an account pauses for private review of its final response. Its plan, tool inputs and raw results are hidden from other members, including the guest who requested it. Shared writes and external requests after reading private results require another exact approval, including a search query. Call and browser outcomes also receive private review because they can contain personal information. New members increment the audience version; pending shared replies need a fresh review. Message persistence locks the space and checks the expected audience within that transaction. iMessage checks the provider's current participant list before sending and holds a reply if the audience has changed.

Approvals bind one actor, run, action and exact input. They expire; repeated decisions cannot trigger repeated execution. Rejection is not permission to try another channel. A grant to send one message does not authorize future calls or posts. Credentials are encrypted with AES-256-GCM; the client receives connection labels and state, never tokens. Website, email and attachment content is untrusted data rather than instructions.

## Memory research translated into implementation

Wajo Fo's observed interfaces suggested separating agent instructions, memory, workspace content, run events, scheduling and approval waiting. Those are product observations, not recovered backend source. Gather uses its own contracts and implementation.

The [Supermemory black-box study of Instinct memory](https://supermemory.ai/blog/reverse-engineering-instinct-memory/) informed compact profiles, selective recall, aliases and maintenance outside the response path. Gather adds explicit group boundaries and revision checks. Its current retrieval combines aliases, lexical matching and recency; semantic retrieval and full episodic consolidation remain future work. The study's claims are treated as observations rather than a definitive account of Instinct's implementation.

References: [Wajo Fo](https://wajo.ai/fo), [REA](https://github.com/morluto/rea), [original product specification](https://github.com/ellieli0630/agent-platform).

## Code map

| Area | Source |
| --- | --- |
| Runtime, resumption, private reviews | `server/engine.ts` |
| Tool schemas, approval gateway, execution reservation | `server/tools.ts` |
| Plan validation and evidence | `server/plans.ts` |
| Memory, profiles and revision checks | `server/memory.ts` |
| Responsibilities and follow-ups | `server/tasks.ts`, `server/jobs.ts` |
| Provider/browser/device adapters | `server/providers.ts`, `server/browser.ts`, `server/mcp.ts` |
| iMessage, linking, audience checks, outbox | `server/channels.ts` |
| Clerk, API, invitations, attachments | `server/auth.ts`, `server/api.ts`, `server/invites.ts`, `server/media.ts` |
| Interface and visual system | `client/app.tsx`, `client/styles.css` |

## Boundaries of this release

The plan is model-selected; runtime checks enforce dependency order and evidence, while the prompt guides channel switching. They cannot guarantee good judgment or factual interpretation. The completion-language guard catches several unsupported action claims but is not a general semantic proof. Browser write results remain unknown because a replay alone cannot prove an external transaction. The app currently supports web and Photon iMessage, not production WhatsApp, WeChat, Telegram or Slack delivery. Account-wide cost checks happen before each call; concurrent in-flight requests can exceed the threshold. Due-task nudges are best effort across a crash. There is no production deletion/export admin surface, spending integration, medical decision engine or automated identity-history merge.

## Original repository UI

The interface now builds on agent-platform main at `abd82c9`: `client/RepositoryLanding.tsx` adapts its sticker lettering, eyes, phone illustration and training introduction; `client/styles.css` retains its original design system and `client/icon.svg` retains its icon. `client/enhancements.css` styles the new workflow views in that language. The navigation keeps Home, Agents, Deploy, Chats, Connections, Reminders, Activity and preferences, adding shared responsibilities and memory. Home retains Need your input / On radar / Last activity. The fictional phone conversation and landing claims are updated to the implemented family workflows.
