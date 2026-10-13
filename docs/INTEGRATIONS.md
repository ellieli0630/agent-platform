# Connections

Only Clerk and OpenRouter are required for the live web product. Missing optional connections fail with a concrete setup message. Demo mode disables all live providers, even if keys happen to exist.

| Connection | Configuration | Behavior and limits |
| --- | --- | --- |
| Clerk | `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, allowed app origin | Backend verifies token and authorized origin. A verified primary email creates a person. Secrets stay server-side. |
| OpenRouter | `OPENROUTER_API_KEY`, optional model IDs | All chat and planning turns default to `z-ai/glm-5.3`, as requested; configurable without code changes. `MODEL_CAP_USD` checks daily recorded model spending before requests. Image/audio extraction uses `MEDIA_MODEL`, default Gemini 2.5 Flash. |
| Public search | `BRAVE_API_KEY` | Returns linked leads, not vetted providers. Read-page checks public DNS addresses, limits response size and does not follow redirects. |
| Google | OAuth client ID/secret; redirect `PUBLIC_URL/oauth/google` | Owner connects calendar events and Gmail compose permissions in Settings. Refresh credentials are encrypted. Each read/write has runtime approval. Sending as the owner requires the separate Settings toggle, off by default; drafts are available instead. |
| Business calls | Vapi key, saved assistant ID, outbound phone number ID | Approved exact number, business, purpose and disclosed information. Initiation pauses the run; polling resumes it after the call ends. Transcript is evidence of a conversation, not a confirmed booking. Unconfirmed calls time out into an unknown outcome after 30 minutes. |
| Cloud browser | Browserbase key and project ID | Fresh remote browser and bounded task loop. Stops at login/CAPTCHA/payment. Does not inherit the user's local Chrome session. Tasks with complete=false stop at buttons that may submit or change state. Read-only tasks may return replay evidence; write tasks require manual outcome checking. Persistent signed-in browser contexts are not yet provided. |
| Reddit/Rednote | Cloud browser or a connected device; exact post approval | Restricts community host and approved text. The cloud adapter cannot magically authenticate; use a connected authenticated device or complete the post manually. Posts are not labeled verified from a browser completion claim. |
| MCP device | Settings: public streamable-HTTP MCP URL and optional token | Connects an owner-controlled device service, enumerates tools, encrypts its credential. Every tool invocation requires exact approval. Native iPhone operation requires an independently configured phone MCP service. |
| iMessage | Photon project ID/secret; provider support for groups | Shared line SDK reconnects and deduplicates inbound IDs. Named requests invoke the agent in groups. Phone linking sends an expiring verification code. Group support needs the appropriate Photon service. A group first created via iMessage has its own workspace; it does not automatically bind an existing web group. |

## Vapi saved assistant

Configure the assistant on the provider side with variables `{{task}}`, `{{disclosedInformation}}` and `{{requesterName}}`. Its instruction should state that it represents an AI assistant, ask only the authorized questions, disclose only those details, and avoid commitments, bookings or payment. Keep provider recording/consent behavior appropriate for the deployment. Gather polls the provider API, so no inbound webhook credential is needed. Validate the saved assistant with staging numbers before connecting a family.

## Joining and identity

A web group owner creates a single-use invitation valid for seven days. The recipient signs in with Clerk and explicitly joins the same space. Its shared history is visible to members; private memories remain separate. A phone number already attached to a guest identity is not silently merged into a new Clerk identity. Resolve that identity intentionally before moving private data or history. No automatic imported contacts, scraped credentials or shared user browser sessions are used.

## Attachment handling

Text and PDF extraction happens locally. Images and voice notes go to the configured OpenRouter model when uploaded. Only extracted text is stored in PostgreSQL; original bytes are not retained. An attachment is bound to its uploader and space and is added to model conversation when the message is submitted. Limits: 8 MB per file, three files per message. Attachment instructions are treated as untrusted content.
