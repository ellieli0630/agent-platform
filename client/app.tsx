import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider, SignIn, useAuth, useClerk } from "@clerk/react";
import { RepositoryLanding, Eyes } from "./RepositoryLanding";
import "./workspace.css";
import "./styles.css";
import "./enhancements.css";
let token: () => Promise<string | null> = async () => null;
async function api(path: string, data?: any, method?: string) {
  const bearer = await token();
  const r = await fetch("/api" + path, {
    method: method ?? (data ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error ?? "Something went wrong.");
  return result;
}
const date = (at: any) =>
  at
    ? new Date(Number(at)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "No date set";
const statusLabel = (s: string) =>
  (
    ({
      queued: "Starting",
      running: "Working",
      waiting_approval: "Needs a decision",
      waiting_share: "Private review",
      waiting_tool: "Waiting for a call",
      waiting_time: "Waiting for daytime",
      paused: "Still open",
      done: "Finished",
      failed: "Couldn’t finish",
      needs_check: "Needs a check",
      proposed: "Not yet confirmed",
      accepted: "Confirmed responsibility",
      blocked: "Needs help",
      declined: "Declined",
      cancelled: "Cancelled",
    }) as any
  )[s] ?? s;
const icons: Record<string, string> = {
  overview: "🏠",
  agents: "🤖",
  deploy: "📲",
  chat: "💬",
  board: "✓",
  memory: "🧠",
  connections: "🔌",
  reminders: "⏰",
  activity: "🧾",
  settings: "⚙️",
  family: "⌂",
  neighborhood: "▧",
  friends: "♡",
  private: "◇",
  appointment: "↗",
  ride: "↔",
  repair: "⌁",
  technology: "☏",
  coordination: "◎",
};
const toolNames: Record<string, string> = {
  search_web: "Searched the web",
  read_page: "Read a source",
  call_business: "Business call",
  calendar_read: "Checked a calendar",
  calendar_create: "Created an event",
  email_send: "Email",
  email_draft: "Email draft",
  browser_task: "Browsed a website",
  community_post: "Community post",
  mcp_call: "Connected device",
  memory_save: "Saved a memory",
  memory_search: "Looked up memory",
  plan_save: "Updated the plan",
  plan_step: "Updated a step",
  task_create: "Added a responsibility",
  followup_schedule: "Scheduled follow-up",
};
function Mark() {
  return (
    <span className="mark" aria-hidden>
      ✳
    </span>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Mark />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Pill({ status, children }: { status?: string; children?: ReactNode }) {
  return (
    <span className={`pill ${status ?? ""}`}>
      {children ?? statusLabel(status ?? "")}
    </span>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} className="modal">
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App({
  isDemo,
  logout,
  localTest = false,
}: {
  isDemo: boolean;
  logout?: () => void;
  localTest?: boolean;
}) {
  const [boot, setBoot] = useState<any>(null),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState("overview"),
    [homeTab, setHomeTab] = useState("input"),
    [data, setData] = useState<any>(null),
    [approvals, setApprovals] = useState<any[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(location.hash === "#/create" ? "agent" : ""),
    [busy, setBusy] = useState(false),
    [inviteLink, setInviteLink] = useState(""),
    [incomingInvite, setIncomingInvite] = useState<any>(null);
  const reload = async () => {
    try {
      const b = await api("/bootstrap");
      setBoot(b);
      setSelected((old) =>
        old && b.spaces.some((s: any) => s.id === old)
          ? old
          : (b.spaces.find((s: any) => s.kind === "family")?.id ??
            b.spaces[0]?.id ??
            ""),
      );
    } catch (e: any) {
      setError(e.message);
    }
  };
  const refresh = async () => {
    try {
      if (selected) {
        const d = await api(`/spaces/${selected}`);
        setData(d);
      }
      setApprovals(await api("/approvals"));
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    reload();
    const incoming = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (incoming)
      api(`/invites/${encodeURIComponent(incoming)}`)
        .then((info) => setIncomingInvite({ ...info, token: incoming }))
        .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setData(null);
    setError("");
    let alive = true;
    const load = async () => {
      try {
        const [d, a] = await Promise.all([
          selected ? api(`/spaces/${selected}`) : Promise.resolve(null),
          api("/approvals"),
        ]);
        if (alive) {
          setData(d);
          setApprovals(a);
        }
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selected]);
  const act = async (fn: () => Promise<any>, message?: string) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      if (message) setNotice(message);
      await refresh();
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!boot)
    return (
      <div className="loading">{error || "Getting your people together…"}</div>
    );
  const active = boot.spaces.find((s: any) => s.id === selected),
    tasks = data?.tasks ?? [],
    open = tasks.filter((t: any) => !["done", "cancelled"].includes(t.status)),
    needs = tasks.filter(
      (t: any) => t.status === "proposed" || t.status === "blocked",
    );
  return (
    <div className="app app-shell">
      {inviteLink && (
        <Modal title="Invite one person" close={() => setInviteLink("")}>
          <p>
            Anyone with this single-use link can join this group after signing
            in. They can see its conversation, responsibilities and shared
            memory. It expires in seven days. Send it only to the person you
            want to invite.
          </p>
          <label>
            Invitation link
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </Modal>
      )}
      {incomingInvite && (
        <Modal
          title={`Join ${incomingInvite.name}?`}
          close={() => setIncomingInvite(null)}
        >
          <p>
            Join this {incomingInvite.kind} space. You will see its shared
            conversation and responsibilities. Your private memories stay
            separate.
          </p>
          <button
            className="primary"
            onClick={() =>
              act(async () => {
                const joined = await api(
                  `/invites/${encodeURIComponent(incomingInvite.token)}`,
                  {},
                );
                setIncomingInvite(null);
                history.replaceState(null, "", location.pathname);
                setSelected(joined.id);
              }, "You joined the group.")
            }
          >
            Join this group
          </button>
        </Modal>
      )}
      <aside className="sidebar">
        <a href="#/" className="brand logo">
          agents
          <Eyes size={27} />
        </a>
        <div className="workspace-label">YOUR PERSONAL AGENTS</div>
        <nav className="nav">
          {[
            ["overview", "Home"],
            ["agents", "Agents"],
            ["deploy", "Deploy"],
            ["chat", "Chats"],
            ["board", "Responsibilities"],
            ["memory", "Memory"],
            ["connections", "Connections"],
            ["reminders", "Reminders"],
            ["activity", "Activity"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <span>{icons[id]}</span>
              {label}
              {id === "board" && open.length > 0 && <b>{open.length}</b>}
            </button>
          ))}
        </nav>
        <div className="side-heading">
          YOUR SPACES
          <button
            className="icon-btn"
            aria-label="New group"
            onClick={() => setModal("space")}
          >
            +
          </button>
        </div>
        <div className="space-list">
          {boot.spaces.map((s: any) => (
            <button
              key={s.id}
              className={selected === s.id ? "selected" : ""}
              onClick={() => {
                setSelected(s.id);
                setPage("overview");
              }}
            >
              <span className={`space-icon ${s.kind}`}>{icons[s.kind]}</span>
              <span>
                {s.name}
                <small>
                  {s.kind === "private"
                    ? "Private conversation"
                    : s.kind === "family"
                      ? "Family"
                      : s.kind === "friends"
                        ? "Friends"
                        : "Neighborhood"}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="side-bottom">
          <div className="small-callout">
            <span>✦</span>
            <p>
              Private things stay private.
              <br />
              <small>You choose what to share.</small>
            </p>
          </div>
          <button
            className={
              page === "settings" ? "side-settings active" : "side-settings"
            }
            onClick={() => setPage("settings")}
          >
            {icons.settings} You & preferences
          </button>
          <div className="identity">
            <span className="avatar">
              {boot.person.name
                .split(" ")
                .map((n: string) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <b>{boot.person.name}</b>
              <small>
                {localTest
                  ? "Local model test"
                  : isDemo
                    ? "Demo workspace"
                    : "Your personal workspace"}
              </small>
            </div>
            {logout && (
              <button className="icon-btn" title="Sign out" onClick={logout}>
                ↗
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="crumb">Your spaces</span>
            <span className="crumb-sep">/</span>
            <b>{active?.name ?? "Welcome"}</b>
          </div>
          <div className="top-meta">
            {data?.space.owner_id === boot.person.id &&
              active?.kind !== "private" &&
              active?.channel === "web" && (
                <button
                  className="text-button"
                  onClick={() =>
                    act(async () => {
                      const invite = await api(
                        `/spaces/${selected}/invites`,
                        {},
                      );
                      setInviteLink(invite.url);
                    })
                  }
                >
                  Invite someone ↗
                </button>
              )}
            <button
              className="mobile-settings"
              aria-label="Settings and connections"
              onClick={() => setPage("settings")}
            >
              ⚙
            </button>
            {(isDemo || localTest) && (
              <span className="demo-label">
                {localTest ? "LOCAL TEST · GLM 5.3" : "DEMO · SAMPLE DATA"}
              </span>
            )}
            <button
              className="decision-count"
              onClick={() => setPage("overview")}
            >
              Decisions <span>{approvals.length}</span>
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {notice && (
            <div role="status" className="toast">
              ✓ {notice}
            </div>
          )}
          {page === "agents" ? (
            <AgentCatalog
              boot={boot}
              create={() => setModal("agent")}
              train={(id: string) => {
                setSelected(id);
                setPage("chat");
              }}
            />
          ) : ["settings", "connections", "deploy"].includes(page) ? (
            <Settings
              boot={boot}
              act={act}
              view={page}
              newAgent={() => setModal("agent")}
            />
          ) : !active ? (
            <Empty title="Meet your new helping hand">
              <p>
                Create an agent, teach it what matters, then bring it into the
                chats you already have.
              </p>
              <button className="primary" onClick={() => setModal("agent")}>
                Create an agent
              </button>
            </Empty>
          ) : !data ? (
            <div className="loading">Opening this space…</div>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <div className="home-heading">
                    <div>
                      <h1>
                        Good{" "}
                        {new Date().getHours() < 12
                          ? "morning"
                          : new Date().getHours() < 18
                            ? "afternoon"
                            : "evening"}
                        , {boot.person.name.split(" ")[0]}.
                      </h1>
                      <p>
                        {active.kind === "private"
                          ? "Train your agent here. Personal context stays private."
                          : `One helping hand for ${active.name}. Keep decisions and follow-through in view.`}
                      </p>
                    </div>
                    <div className="home-actions">
                      <button
                        className="primary"
                        onClick={() => setPage("chat")}
                      >
                        Talk to {active.agent_name} ↗
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setModal("task")}
                        disabled={active.kind === "private"}
                      >
                        + Responsibility
                      </button>
                    </div>
                  </div>
                  <div
                    className="home-tabs"
                    role="tablist"
                    aria-label="Home views"
                  >
                    {[
                      ["input", "Need your input", approvals.length],
                      ["radar", "On radar", open.length + data.jobs.length],
                      ["activity", "Last activity", data.runs.length],
                    ].map(([id, label, count]) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={homeTab === id}
                        aria-label={`${label} (${count})`}
                        className={homeTab === id ? "on" : ""}
                        onClick={() => setHomeTab(String(id))}
                      >
                        {label}
                        <span>{count}</span>
                      </button>
                    ))}
                  </div>
                  {homeTab === "input" && (
                    <div className="home-input">
                      <ApprovalPanel
                        approvals={approvals}
                        act={act}
                        busy={busy}
                      />
                      <div className="next-actions">
                        <h2>A good place to start</h2>
                        <button
                          className="secondary"
                          onClick={() => setPage("board")}
                        >
                          Review responsibilities ↗
                        </button>
                        <button
                          className="secondary"
                          onClick={() => setPage("chat")}
                        >
                          Find help for the family ↗
                        </button>
                        <p>
                          Questions and suggestions are welcome. Outbound
                          actions wait for the right person’s permission.
                        </p>
                      </div>
                    </div>
                  )}
                  {homeTab === "radar" && (
                    <>
                      <div className="stats">
                        <div>
                          <small>OPEN RESPONSIBILITIES</small>
                          <strong>
                            {open.length.toString().padStart(2, "0")}
                          </strong>
                          <span>Small things, kept in view</span>
                        </div>
                        <div>
                          <small>NEED A LITTLE NUDGE</small>
                          <strong>
                            {needs.length.toString().padStart(2, "0")}
                          </strong>
                          <span>Waiting for a yes or some help</span>
                        </div>
                        <div>
                          <small>YOUR PEOPLE</small>
                          <strong>
                            {data.members.length.toString().padStart(2, "0")}
                          </strong>
                          <span className="member-stack">
                            {data.members
                              .slice(0, 4)
                              .map((p: any, i: number) => (
                                <i
                                  key={p.id}
                                  style={{
                                    background: [
                                      "#e4ecca",
                                      "#d9e5ed",
                                      "#f1decd",
                                      "#e0dbef",
                                    ][i],
                                  }}
                                  title={p.name}
                                >
                                  {p.name
                                    .split(" ")
                                    .map((n: string) => n[0])
                                    .join("")
                                    .slice(0, 2)}
                                </i>
                              ))}
                          </span>
                        </div>
                      </div>
                      <div className="overview-grid">
                        <div>
                          <div className="section-head">
                            <div>
                              <div className="eyebrow">KEEPING LIFE MOVING</div>
                              <h2>On our plate</h2>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => setPage("board")}
                            >
                              See the board ↗
                            </button>
                          </div>
                          <div className="task-list">
                            {open.slice(0, 4).map((t: any) => (
                              <TaskCard
                                key={t.id}
                                task={t}
                                person={boot.person}
                                act={act}
                                options={() => setModal("options:" + t.id)}
                                compact
                              />
                            ))}
                            {!open.length && (
                              <Empty title="Room to breathe">
                                Nothing on the board yet. Add a responsibility
                                when something needs follow-through.
                              </Empty>
                            )}
                          </div>
                          <div className="section-head second">
                            <h2>Ahead of us</h2>
                          </div>
                          <Followups jobs={data.jobs} act={act} />
                        </div>
                        <aside className="right-rail">
                          <ApprovalPanel
                            approvals={approvals}
                            act={act}
                            busy={busy}
                          />
                          <div className="soft-card">
                            <div className="eyebrow">A SMALL IDEA</div>
                            <h3>Something on your mind?</h3>
                            <p>
                              Start with what needs doing. Gather can help
                              figure out where to look, who to ask, and what
                              comes next.
                            </p>
                            <button
                              className="suggestion"
                              onClick={() => {
                                setPage("chat");
                                setNotice(
                                  "Try asking for a Mandarin-speaking handyman.",
                                );
                              }}
                            >
                              Find a Mandarin-speaking handyman <span>↗</span>
                            </button>
                            <button
                              className="suggestion"
                              onClick={() => setPage("chat")}
                            >
                              Help Mum join a video call <span>↗</span>
                            </button>
                          </div>
                          <div className="privacy-note">
                            ◇{" "}
                            <span>
                              {active.kind === "private"
                                ? "Only you can see this conversation."
                                : "This space has its own memory. Private conversations stay out of it."}
                            </span>
                          </div>
                        </aside>
                      </div>
                    </>
                  )}
                  {homeTab === "activity" && (
                    <Runs runs={data.runs} act={act} />
                  )}
                </>
              )}
              {page === "chat" && (
                <Conversation
                  data={data}
                  person={boot.person}
                  act={act}
                  busy={busy}
                  isDemo={isDemo}
                />
              )}
              {page === "board" && (
                <>
                  <div className="page-head">
                    <div className="eyebrow">FOLLOW THROUGH, TOGETHER</div>
                    <h1>Our responsibilities.</h1>
                    <p>
                      A clear owner. A real yes. A little help when something
                      gets stuck.
                    </p>
                    <button
                      className="primary"
                      onClick={() => setModal("task")}
                      disabled={active.kind === "private"}
                    >
                      + Add a responsibility
                    </button>
                  </div>
                  <div className="board">
                    {[
                      ["proposed", "Waiting for a yes"],
                      ["accepted", "In good hands"],
                      ["blocked", "Could use some help"],
                      ["done", "Taken care of"],
                    ].map(([status, label]) => (
                      <section key={status}>
                        <div className="board-column-head">
                          <h3>{label}</h3>
                          <span>
                            {
                              tasks.filter((t: any) => t.status === status)
                                .length
                            }
                          </span>
                        </div>
                        {tasks
                          .filter((t: any) => t.status === status)
                          .map((t: any) => (
                            <TaskCard
                              key={t.id}
                              task={t}
                              person={boot.person}
                              act={act}
                              options={() => setModal("options:" + t.id)}
                            />
                          ))}
                        {!tasks.some((t: any) => t.status === status) && (
                          <div className="board-empty">
                            Nothing here right now.
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </>
              )}
              {page === "reminders" && <Reminders data={data} act={act} />}
              {page === "activity" && <Runs runs={data.runs} act={act} />}
              {page === "memory" && (
                <Memory space={data.space} spaces={boot.spaces} act={act} />
              )}
            </>
          )}
        </main>
        <footer>
          made for the people in your life <span>✳</span>{" "}
          {localTest
            ? "Local model test · fictional data · outbound actions disabled."
            : isDemo
              ? "Local preview. No real calls, posts, messages or bookings."
              : "Private by default. Permission before action."}
        </footer>
      </div>
      {modal === "agent" && (
        <Modal title="A new helping hand" close={() => setModal("")}>
          <AgentForm
            submit={async (input: any) => {
              await act(async () => {
                const r = await api("/agents", input);
                setSelected(r.spaceId);
                setPage("chat");
                setModal("");
              });
            }}
          />
        </Modal>
      )}
      {modal === "space" && (
        <Modal title="Make room for your people" close={() => setModal("")}>
          <SpaceForm
            agents={boot.agents}
            submit={async (input: any) => {
              await act(async () => {
                const r = await api("/spaces", input);
                setSelected(r.id);
                setPage("overview");
                setModal("");
              });
            }}
          />
        </Modal>
      )}
      {modal === "task" && data && (
        <Modal title="Keep a responsibility in view" close={() => setModal("")}>
          <TaskForm
            members={data.members}
            submit={async (input: any) => {
              await act(async () => {
                await api(`/spaces/${selected}/tasks`, input);
                setModal("");
              }, "Responsibility added. The assignee still needs to accept.");
            }}
          />
        </Modal>
      )}
      {modal.startsWith("options:") && data && (
        <Modal title="Compare the options" close={() => setModal("")}>
          <Options
            task={tasks.find((t: any) => t.id === modal.slice(8))}
            act={act}
          />
        </Modal>
      )}
    </div>
  );
}
function TaskCard({ task: t, person, act, options, compact = false }: any) {
  const mine = t.assignee_id === person.id || !t.assignee_id;
  return (
    <article className={`task-card ${compact ? "compact" : ""}`}>
      <div className={`task-symbol ${t.category}`}>
        {icons[t.category] ?? "◎"}
      </div>
      <div className="task-body">
        <div className="task-title-row">
          <h3>{t.title}</h3>
          <Pill status={t.status} />
        </div>
        {!compact && <p>{t.note}</p>}
        <div className="task-meta">
          <span className="owner-dot" />
          {t.assignee_name ?? "Looking for a volunteer"}
          <span>·</span>
          {date(t.due_at)}
        </div>
        <div className="task-actions">
          {mine && t.status === "proposed" && (
            <button
              className="text-button"
              onClick={() =>
                act(
                  () => api(`/tasks/${t.id}`, { status: "accepted" }, "PUT"),
                  "Responsibility accepted.",
                )
              }
            >
              I can take this ↗
            </button>
          )}
          {mine && ["accepted", "blocked"].includes(t.status) && (
            <>
              <button
                className="text-button"
                onClick={() =>
                  act(
                    () => api(`/tasks/${t.id}`, { status: "done" }, "PUT"),
                    "Marked done by the responsible person.",
                  )
                }
              >
                Mark done ✓
              </button>
              {t.status !== "blocked" && (
                <button
                  className="text-button muted"
                  onClick={() =>
                    act(() =>
                      api(`/tasks/${t.id}`, { status: "blocked" }, "PUT"),
                    )
                  }
                >
                  I need help
                </button>
              )}
            </>
          )}
          {t.category === "repair" && (
            <button className="text-button" onClick={options}>
              {t.candidates.length
                ? `${t.candidates.length} options to compare`
                : "Add an option"}{" "}
              ↗
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
function ApprovalPanel({ approvals, act, busy }: any) {
  return (
    <div className="decisions-card">
      <div className="section-head">
        <h3>Only you can decide.</h3>
        <span className="decision-bubble">{approvals.length}</span>
      </div>
      {!approvals.length ? (
        <>
          <div className="decision-check">✓</div>
          <p className="decision-empty">Nothing needs you right now.</p>
          <p className="muted small">
            When Gather needs permission or a private review, it waits here.
          </p>
        </>
      ) : (
        approvals.map((a: any) => (
          <div key={a.id} className="approval">
            <span className="eyebrow">
              {a.kind === "share"
                ? "PRIVATE REVIEW"
                : "PERMISSION BEFORE ACTION"}
            </span>
            <h4>{a.summary}</h4>
            <p className="small muted">
              {a.space_name} · requested by {a.requester_name}
            </p>
            <details>
              <summary>Review exactly what’s approved</summary>
              <ApprovalPreview approval={a} />
            </details>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  act(
                    () => api(`/approvals/${a.id}`, { decision: "approve" }),
                    "Decision saved.",
                  )
                }
              >
                {a.kind === "share" ? "Share this reply" : "Approve"}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  act(
                    () => api(`/approvals/${a.id}`, { decision: "reject" }),
                    "Declined.",
                  )
                }
              >
                Decline
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
function ApprovalPreview({ approval: a }: any) {
  let fields: any = null;
  try {
    fields = JSON.parse(a.preview);
  } catch {}
  const labels: any = {
    business: "Business",
    number: "Phone number",
    goal: "Purpose",
    disclosedInformation: "Information to disclose",
    to: "Recipient",
    subject: "Subject",
    body: "Message",
    title: "Title",
    start: "Starts",
    end: "Ends",
    task: "Requested action",
    url: "Website",
    community: "Community",
    complete: "Submit final step",
    tool: "Device action",
    connectionId: "Connected device",
    arguments: "Action details",
  };
  return fields && typeof fields === "object" ? (
    <dl className="approval-fields">
      {Object.entries(fields).map(([k, v]) => (
        <div key={k}>
          <dt>{labels[k] ?? k}</dt>
          <dd>
            {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <div className="approval-text">{a.preview}</div>
  );
}
function Followups({ jobs, act }: any) {
  return (
    <div className="followups">
      {jobs.map((j: any) => (
        <div key={j.id}>
          <span className="followup-icon">↻</span>
          <div>
            <b>{j.prompt}</b>
            <small>
              Next check-in {date(j.next_at)}
              {j.interval_ms ? " · repeats" : ""}
            </small>
          </div>
          <button
            className="icon-btn"
            title="Cancel follow-up"
            onClick={() =>
              act(
                () => api(`/jobs/${j.id}`, undefined, "DELETE"),
                "Follow-up cancelled.",
              )
            }
          >
            ×
          </button>
        </div>
      ))}
      {!jobs.length && (
        <p className="muted small">
          No follow-ups scheduled. Ask Gather to check on something later.
        </p>
      )}
    </div>
  );
}
function Runs({ runs, act }: any) {
  const [continuing, setContinuing] = useState<any>(null),
    [newInfo, setNewInfo] = useState(""),
    [trace, setTrace] = useState<any[] | null>(null),
    [traceError, setTraceError] = useState(""),
    [editing, setEditing] = useState<any>(null);
  return (
    <section className="runs">
      <div className="section-head">
        <div>
          <div className="eyebrow">WHAT COMES NEXT</div>
          <h2>A plan that can change.</h2>
        </div>
      </div>
      {runs.length ? (
        runs.slice(0, 4).map((r: any) => (
          <article key={r.id} className="run-card">
            <div className="section-head">
              <h3>{r.plan?.goal ?? r.request}</h3>
              <Pill status={r.status} />
            </div>
            {r.status === "failed" && r.reply && (
              <p className="error">{r.reply}</p>
            )}
            {r.plan?.steps && (
              <div className="plan-steps">
                {r.plan.steps.map((s: any, i: number) => (
                  <div key={s.id} className={`plan-step ${s.status}`}>
                    <span>{s.status === "complete" ? "✓" : i + 1}</span>
                    <div>
                      <b>{s.title}</b>
                      <small>
                        {s.channel === "api"
                          ? "Connected app"
                          : s.channel === "member"
                            ? "Ask someone"
                            : s.channel === "local"
                              ? "Coordinate"
                              : s.channel === "community"
                                ? "Community recommendations"
                                : s.channel === "call"
                                  ? "Call a business"
                                  : s.channel === "browser"
                                    ? "Browse a website"
                                    : "Search"}{" "}
                        ·{" "}
                        {s.status === "pending" ? "Not yet finished" : s.status}
                      </small>
                      <p>{s.success}</p>
                      {s.fallback && (
                        <details>
                          <summary>If this gets stuck</summary>
                          <p>{s.fallback}</p>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="run-actions">
              {["paused", "needs_check", "failed"].includes(r.status) && (
                <button
                  className="text-button"
                  onClick={() => {
                    setContinuing(r);
                    setNewInfo("");
                  }}
                >
                  Continue with new information ↗
                </button>
              )}
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    setTrace(await api(`/runs/${r.id}/trace`));
                  } catch (e: any) {
                    setTraceError(e.message);
                  }
                }}
              >
                See evidence ↗
              </button>
              {r.plan &&
                !["running", "waiting_tool", "done"].includes(r.status) && (
                  <button className="text-button" onClick={() => setEditing(r)}>
                    Adjust the remaining plan
                  </button>
                )}
            </div>
          </article>
        ))
      ) : (
        <div className="plan-placeholder">
          <span>①</span> Figure out where to look <i>→</i>
          <span>②</span> Ask the right questions <i>→</i>
          <span>③</span> Follow through with you
        </div>
      )}
      {(trace || traceError) && (
        <Modal
          title="What actually happened"
          close={() => {
            setTrace(null);
            setTraceError("");
          }}
        >
          {traceError ? (
            <p>{traceError}</p>
          ) : trace?.length ? (
            trace.map((e) => (
              <div className="trace" key={e.id}>
                <div>
                  <b>{toolNames[e.tool] ?? e.tool}</b>
                  <Pill>
                    {e.simulated
                      ? "Simulated"
                      : e.status === "succeeded" && e.verified
                        ? "Provider evidence recorded"
                        : e.status}
                  </Pill>
                </div>
                <p>
                  {e.provider_ref?.startsWith("http") ? (
                    <a href={e.provider_ref} target="_blank" rel="noreferrer">
                      Open evidence ↗
                    </a>
                  ) : e.provider_ref ? (
                    `Reference: ${e.provider_ref}`
                  ) : (
                    "No confirmed provider outcome."
                  )}
                </p>
                <details>
                  <summary>Details</summary>
                  <pre>{JSON.stringify(e.output, null, 2)}</pre>
                </details>
              </div>
            ))
          ) : (
            <p className="muted">No actions recorded yet.</p>
          )}
        </Modal>
      )}
      {continuing && (
        <Modal
          title="Pick up where we left off"
          close={() => setContinuing(null)}
        >
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api(`/runs/${continuing.id}/continue`, { text: newInfo });
                setContinuing(null);
              }, "The same plan will continue with your update.");
            }}
          >
            <p>
              The existing plan, approvals and evidence stay with this request.
              Uncertain actions will not be repeated.
            </p>
            <label>
              What changed, or what should Gather try next?
              <textarea
                required
                value={newInfo}
                onChange={(e) => setNewInfo(e.target.value)}
                placeholder="e.g. The first candidate is unavailable. Ask the neighborhood group for another recommendation."
              />
            </label>
            <button className="primary">Continue this plan</button>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="Adjust what comes next" close={() => setEditing(null)}>
          <PlanEditor
            run={editing}
            save={async (plan: any) => {
              await act(
                () => api(`/runs/${editing.id}/plan`, plan, "PUT"),
                "Plan updated. Existing completions stay intact.",
              );
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </section>
  );
}
function PlanEditor({ run, save }: any) {
  const [plan, setPlan] = useState(run.plan);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(plan);
      }}
      className="form"
    >
      <p>
        Completed steps stay intact. Changes are checked for dependencies, and
        pending actions are reviewed again.
      </p>
      {plan.steps.map((s: any, i: number) => (
        <fieldset key={s.id} disabled={s.status === "complete"}>
          <legend>
            Step {i + 1}
            {s.status === "complete" ? " · complete" : ""}
          </legend>
          <label>
            What needs doing
            <input
              value={s.title}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  steps: plan.steps.map((v: any, k: number) =>
                    k === i ? { ...v, title: e.target.value } : v,
                  ),
                })
              }
            />
          </label>
          <label>
            What success looks like
            <input
              value={s.success}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  steps: plan.steps.map((v: any, k: number) =>
                    k === i ? { ...v, success: e.target.value } : v,
                  ),
                })
              }
            />
          </label>
          <label>
            Another approach
            <textarea
              value={s.fallback}
              onChange={(e) =>
                setPlan({
                  ...plan,
                  steps: plan.steps.map((v: any, k: number) =>
                    k === i ? { ...v, fallback: e.target.value } : v,
                  ),
                })
              }
            />
          </label>
        </fieldset>
      ))}
      <button className="primary">Save remaining plan</button>
    </form>
  );
}
function Conversation({ data, person, act, busy, isDemo }: any) {
  const [files, setFiles] = useState<any[]>([]),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState(""),
    [text, setText] = useState(""),
    bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data.messages.length]);
  const working = data.runs.some((r: any) =>
    ["queued", "running"].includes(r.status),
  );
  return (
    <div className="conversation">
      <div className="page-head">
        <div className="eyebrow">
          {data.space.kind === "private"
            ? "PRIVATE, JUST FOR YOU"
            : "YOUR GROUP CONVERSATION"}
        </div>
        <h1>A place to work things out.</h1>
        <p>
          {data.space.agent_name} keeps track, asks before acting, and helps you
          find another way.
        </p>
      </div>
      <div className="conversation-messages">
        {data.messages.length ? (
          data.messages.map((m: any) => (
            <div
              key={m.id}
              className={`message ${m.role === "assistant" ? "assistant" : m.person_id === person.id ? "mine" : "person"}`}
            >
              <span className="message-avatar">
                {m.role === "assistant" ? "✳" : (m.person_name?.[0] ?? "·")}
              </span>
              <div>
                <small>
                  {m.role === "assistant"
                    ? data.space.agent_name
                    : (m.person_name ?? "You")}{" "}
                  <span>· {date(m.created_at)}</span>
                </small>
                <p>{m.text}</p>
              </div>
            </div>
          ))
        ) : (
          <Empty title="What’s on your mind?">
            Start with what needs doing. You don’t need to know the steps yet.
          </Empty>
        )}
        {working && (
          <div className="working">✳ Thinking through the next step…</div>
        )}
        <div ref={bottom} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() && !files.length) return;
          const value = text.trim() || "Please help with this attachment.",
            attached = files.map((f) => f.id);
          setText("");
          setFiles([]);
          act(() =>
            api(`/spaces/${data.space.id}/messages`, {
              text: value,
              files: attached,
            }),
          );
        }}
      >
        <label
          className="attach-button"
          title="Attach text, PDF, image or voice note"
        >
          +
          <input
            type="file"
            accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav"
            disabled={uploading || files.length >= 3}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              setUploadError("");
              try {
                const form = new FormData();
                form.set("file", file);
                const bearer = await token();
                const r = await fetch(`/api/spaces/${data.space.id}/files`, {
                  method: "POST",
                  headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
                  body: form,
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j.error);
                setFiles((old) => [...old, j]);
              } catch (e: any) {
                setUploadError(e.message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            data.space.kind === "private"
              ? "Tell Gather what matters to you…"
              : "Ask Gather, or tell it what needs doing…"
          }
          aria-label="Message Gather"
          maxLength={12000}
        />
        <button
          className="send-button"
          disabled={busy || uploading || (!text.trim() && !files.length)}
          aria-label="Send message"
        >
          ↑
        </button>
      </form>
      {uploading && <p className="composer-note">Reading your attachment…</p>}
      {uploadError && <p className="error">{uploadError}</p>}
      {files.length > 0 && (
        <div className="attachment-list">
          {files.map((f) => (
            <span key={f.id}>
              {f.name}
              <button
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles(files.filter((x) => x.id !== f.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="composer-note">
        {isDemo
          ? "Scripted demo. Try finding a Mandarin-speaking handyman."
          : "Gather can make mistakes. Check confirmations and important details."}
      </p>
      <Runs runs={data.runs} act={act} />
    </div>
  );
}
function Memory({ space, spaces, act }: any) {
  const [records, setRecords] = useState<any[]>([]),
    [text, setText] = useState(""),
    [kind, setKind] = useState("fact"),
    [expiry, setExpiry] = useState(""),
    [editingMemory, setEditingMemory] = useState<any>(null),
    [correction, setCorrection] = useState(""),
    [sharing, setSharing] = useState<any>(null),
    [target, setTarget] = useState(""),
    [err, setErr] = useState("");
  const load = () =>
    api(`/spaces/${space.id}/memories`)
      .then(setRecords)
      .catch((e: any) => setErr(e.message));
  useEffect(() => {
    load();
  }, [space.id]);
  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          {space.kind === "private"
            ? "PERSONAL CONTEXT"
            : "JUST FOR THIS GROUP"}
        </div>
        <h1>Remember what matters.</h1>
        <p>
          {space.kind === "private"
            ? "Your preferences, people and ways of doing things. Nothing here enters a group until you explicitly share it."
            : "Only facts shared in this space. Nobody’s private profile is used here."}
        </p>
      </div>
      <div className="memory-boundary">
        <span>◇</span>
        <div>
          <b>
            {space.kind === "private"
              ? "Private by default"
              : "A separate memory for this group"}
          </b>
          <p>
            Facts are dated and correctable. Temporary details can expire.
            Forgetting removes stored memory versions and invalidates the
            profile; existing conversations remain in their chat history.
          </p>
        </div>
      </div>
      <form
        className="memory-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await act(async () => {
            await api(`/spaces/${space.id}/memories`, {
              text,
              kind,
              expiresAt: expiry ? new Date(expiry).getTime() : null,
            });
            setText("");
            await load();
          }, "Memory saved in this space.");
        }}
      >
        <div>
          <label>
            Something worth keeping
            <input
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Explain one step at a time, then wait for a reply"
              maxLength={2000}
            />
          </label>
          <div className="form-grid">
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {[
                  "rule",
                  "preference",
                  "person",
                  "routine",
                  "inventory",
                  "decision",
                  "fact",
                  "procedure",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Expires on (optional)
              <input
                type="datetime-local"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
          </div>
        </div>
        <button className="primary">Remember this</button>
      </form>
      {err && <p className="error">{err}</p>}
      <div className="memory-grid">
        {records.map((m: any) => (
          <article className="memory-card" key={m.id}>
            <div className="section-head">
              <span className="eyebrow">{m.kind}</span>
              <span className="small muted">version {m.revision}</span>
            </div>
            <p>{m.text}</p>
            <small>
              Learned {date(m.observed_at)} · updated {date(m.updated_at)}
              {m.expires_at ? ` · expires ${date(m.expires_at)}` : ""}
            </small>
            <div className="task-actions">
              <button
                className="text-button"
                onClick={() => {
                  setEditingMemory(m);
                  setCorrection(m.text);
                }}
              >
                Correct this
              </button>
              {space.kind === "private" && (
                <button
                  className="text-button"
                  onClick={() => {
                    setSharing(m);
                    setTarget(
                      spaces.find((s: any) => s.kind !== "private")?.id ?? "",
                    );
                  }}
                >
                  Choose a group to share with ↗
                </button>
              )}
              <button
                className="text-button muted"
                onClick={() =>
                  act(async () => {
                    await api(`/memories/${m.id}`, undefined, "DELETE");
                    await load();
                  }, "Memory and its stored revisions forgotten.")
                }
              >
                Forget
              </button>
            </div>
          </article>
        ))}
      </div>
      {!records.length && (
        <Empty title="A fresh page">
          Save what would help Gather serve you better.
        </Empty>
      )}
      {editingMemory && (
        <Modal title="Correct this memory" close={() => setEditingMemory(null)}>
          <p>
            The original learned date stays the same. This creates a new
            revision and refreshes the private profile.
          </p>
          <label>
            Corrected fact
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              maxLength={2000}
            />
          </label>
          <button
            className="primary mt"
            disabled={!correction.trim()}
            onClick={() =>
              act(async () => {
                await api(`/spaces/${space.id}/memories`, {
                  id: editingMemory.id,
                  revision: editingMemory.revision,
                  text: correction,
                  kind: editingMemory.kind,
                  aliases: editingMemory.aliases,
                  expiresAt: editingMemory.expires_at
                    ? Number(editingMemory.expires_at)
                    : null,
                });
                setEditingMemory(null);
                await load();
              }, "Memory corrected.")
            }
          >
            Save correction
          </button>
        </Modal>
      )}
      {sharing && (
        <Modal title="Share only this memory" close={() => setSharing(null)}>
          <p>
            Everyone in the selected group will be able to see this fact. Your
            other personal memories stay private.
          </p>
          <div className="share-preview">{sharing.text}</div>
          <label>
            Share with
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {spaces
                .filter((s: any) => s.kind !== "private")
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="primary mt"
            disabled={!target}
            onClick={() =>
              act(async () => {
                await api(`/memories/${sharing.id}/share`, { spaceId: target });
                setSharing(null);
              }, "This selected fact is now shared with the group.")
            }
          >
            Share this fact
          </button>
        </Modal>
      )}
    </>
  );
}
function Settings({ boot, act, newAgent, view = "settings" }: any) {
  const [connections, setConnections] = useState<any[]>([]),
    [device, setDevice] = useState({ name: "My device", url: "", token: "" }),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false);
  const load = () => api("/connections").then(setConnections);
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="page-head">
        <div className="eyebrow">YOUR AGENT, YOUR PERMISSION</div>
        <h1>
          {view === "deploy"
            ? "Deploy"
            : view === "connections"
              ? "Connections"
              : "You & preferences"}
        </h1>
        <p>
          Accounts stay personal. Every outbound action is reviewed before it
          happens.
        </p>
      </div>
      <div className={`settings-grid settings-${view}`}>
        <section className="panel settings-agents-panel">
          <div className="section-head">
            <h2>Your helping hands</h2>
            <button className="text-button" onClick={newAgent}>
              + New agent
            </button>
          </div>
          {boot.agents.map((a: any) => (
            <div className="agent-row" key={a.id}>
              <Mark />
              <div>
                <h3>{a.name}</h3>
                <p>{a.purpose}</p>
                <small>
                  {Number(a.memory_count) >= 3
                    ? "Ready to introduce to a group"
                    : `In training · ${a.memory_count}/3 memories before group setup`}
                </small>
              </div>
            </div>
          ))}
        </section>
        <section className="panel settings-phone-panel">
          <h2>iMessage</h2>
          <p>
            One trained account brings Gather in. Family and friends can ask it
            for help without signing up.
          </p>
          <Pill>
            {boot.integrations.imessage === "connected"
              ? "Line connected"
              : "Requires a Photon line"}
          </Pill>
          {!boot.demo && !boot.localTest && (
            <form
              className="form mt"
              onSubmit={(e) => {
                e.preventDefault();
                act(
                  async () => {
                    await api(
                      sent ? "/phone/verify" : "/phone/start",
                      sent ? { code } : { phone },
                    );
                    setSent(true);
                  },
                  sent ? "Phone linked." : "Linking code sent.",
                );
              }}
            >
              <label>
                {sent ? "Verification code" : "Your phone number"}
                <input
                  required
                  value={sent ? code : phone}
                  onChange={(e) =>
                    sent ? setCode(e.target.value) : setPhone(e.target.value)
                  }
                  placeholder={sent ? "6-digit code" : "+1…"}
                />
              </label>
              <button className="secondary">
                {sent ? "Verify my number" : "Text me a code"}
              </button>
            </form>
          )}
          <small>
            Group chats require a dedicated Photon Business line. The shared
            pool supports DMs only.
          </small>
        </section>
        <section className="panel settings-accounts-panel">
          <h2>Connected accounts</h2>
          <p>
            Google credentials are encrypted on the server. Sending as you is
            off until you enable it; each send still needs permission.
          </p>
          {connections.map((c: any) => (
            <div className="connection-row" key={c.id}>
              <b>{c.name}</b>
              <Pill>{c.status}</Pill>
              {c.kind === "google" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={c.send_as_me === "true"}
                    onChange={(e) =>
                      act(async () => {
                        await api(
                          `/connections/${c.id}`,
                          { sendAsMe: e.target.checked },
                          "PUT",
                        );
                        await load();
                      })
                    }
                  />
                  Send email as me
                </label>
              )}
              <button
                className="text-button muted"
                onClick={() =>
                  act(async () => {
                    await api(`/connections/${c.id}`, undefined, "DELETE");
                    await load();
                  })
                }
              >
                Disconnect
              </button>
            </div>
          ))}
          <button
            className="secondary"
            disabled={boot.demo || boot.localTest || !boot.integrations.google}
            onClick={() =>
              act(async () => {
                const r = await api("/connections/google", {});
                location.href = r.url;
              })
            }
          >
            Connect Google
          </button>
          {!boot.integrations.google && (
            <small>Google OAuth needs server configuration.</small>
          )}
        </section>
        <section className="panel settings-channels-panel">
          <h2>Hands & channels</h2>
          <p>
            When search isn’t enough, Gather can ask permission to browse, call,
            or post an exact community question.
          </p>
          <div className="integration-status">
            {[
              ["model", "GLM 5.3 · OpenRouter"],
              ["search", "Web search"],
              ["browser", "Cloud browser"],
              ["calls", "Business calls"],
            ].map(([k, label]) => (
              <div key={k}>
                <span>{label}</span>
                <Pill>
                  {boot.integrations[k] ? "Configured" : "Not configured"}
                </Pill>
              </div>
            ))}
          </div>
          <small>
            {boot.demo
              ? "Provider actions are off in this demo."
              : "Configured does not mean live-verified. Test each provider before a real family pilot."}
          </small>
        </section>
        <section className="panel settings-device-panel">
          <h2>A connected device</h2>
          <p>
            Bring your own MCP server, such as an iPhone bridge. Its actions are
            reviewed, and credentials never enter the model.
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api("/connections/mcp", device);
                setDevice({ ...device, token: "" });
                await load();
              }, "Device connected.");
            }}
          >
            <label>
              Name
              <input
                value={device.name}
                onChange={(e) => setDevice({ ...device, name: e.target.value })}
                required
              />
            </label>
            <label>
              Public HTTPS server
              <input
                type="url"
                value={device.url}
                onChange={(e) => setDevice({ ...device, url: e.target.value })}
                required
              />
            </label>
            <label>
              Token
              <input
                type="password"
                value={device.token}
                onChange={(e) =>
                  setDevice({ ...device, token: e.target.value })
                }
              />
            </label>
            <button
              className="secondary"
              disabled={boot.demo || boot.localTest}
            >
              Connect device
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
function AgentForm({ submit }: any) {
  const [f, set] = useState({ name: "", purpose: "", instructions: "" });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(f);
      }}
    >
      <label>
        Name
        <input
          required
          value={f.name}
          onChange={(e) => set({ ...f, name: e.target.value })}
          placeholder="e.g. Gather"
          maxLength={40}
        />
      </label>
      <label>
        What should it take off your plate?
        <textarea
          required
          value={f.purpose}
          onChange={(e) => set({ ...f, purpose: e.target.value })}
          placeholder="Help my family coordinate appointments, rides, repairs, and everyday technology."
        />
      </label>
      <label>
        How should it work with you?
        <textarea
          value={f.instructions}
          onChange={(e) => set({ ...f, instructions: e.target.value })}
          placeholder="Be patient. Ask before contacting someone. Keep my private details private."
        />
      </label>
      <button className="primary">Create & start training ↗</button>
    </form>
  );
}
function SpaceForm({ agents, submit }: any) {
  const [f, set] = useState({
    name: "",
    kind: "family",
    agentId: agents[0]?.id ?? "",
    instructions: "",
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(f);
      }}
    >
      <p>
        This creates a web group workspace. Link your iMessage line in Settings
        to bring the agent into an existing chat.
      </p>
      <label>
        Group name
        <input
          required
          value={f.name}
          onChange={(e) => set({ ...f, name: e.target.value })}
          placeholder="e.g. Our family"
        />
      </label>
      <label>
        For
        <select
          value={f.kind}
          onChange={(e) => set({ ...f, kind: e.target.value })}
        >
          <option value="family">Family</option>
          <option value="friends">Friends</option>
          <option value="neighborhood">Neighbors</option>
        </select>
      </label>
      <label>
        Helping hand
        <select
          required
          value={f.agentId}
          onChange={(e) => set({ ...f, agentId: e.target.value })}
        >
          {agents.map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.memory_count} memories
            </option>
          ))}
        </select>
      </label>
      <label>
        What should it help with in this group?
        <textarea
          value={f.instructions}
          onChange={(e) => set({ ...f, instructions: e.target.value })}
          placeholder="Keep track of who is helping, check before bookings, and wait when someone needs to decide."
        />
      </label>
      <button className="primary" disabled={!f.agentId}>
        Create the space
      </button>
    </form>
  );
}
function AgentCatalog({ boot, create, train }: any) {
  return (
    <>
      <div className="page-head">
        <h1>Your agents</h1>
        <p>
          Teach each one first, then bring it to the people and chats it can
          help.
        </p>
        <button className="primary" onClick={create}>
          + Create an agent
        </button>
      </div>
      <div className="agent-catalog">
        {boot.agents.map((a: any) => {
          const space = boot.spaces.find(
              (s: any) => s.agent_id === a.id && s.kind === "private",
            ),
            ready = Number(a.memory_count) >= 3;
          return (
            <article className="card" key={a.id}>
              <div className="agent-card-head">
                <span className="agent-avatar">🤖</span>
                <div>
                  <h3>{a.name}</h3>
                  <Pill>
                    {ready
                      ? "Ready for a group"
                      : `In training · ${a.memory_count}/3`}
                  </Pill>
                </div>
              </div>
              <p>{a.purpose}</p>
              <div
                className="training-meter"
                aria-label={`${a.memory_count} memories learned`}
              >
                <span
                  style={{
                    width: `${Math.min(100, (Number(a.memory_count) / 3) * 100)}%`,
                  }}
                />
              </div>
              <div className="agent-card-foot">
                <small>
                  {ready
                    ? "Private training stays separate from each group."
                    : "Teach three memories before group setup."}
                </small>
                <button
                  className="secondary"
                  disabled={!space}
                  onClick={() => train(space.id)}
                >
                  Train ↗
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!boot.agents.length && (
        <Empty title="Your first agent">
          <p>Start with a name and one job you want help with.</p>
          <button className="primary" onClick={create}>
            Create an agent
          </button>
        </Empty>
      )}
    </>
  );
}
function Reminders({ data, act }: any) {
  const [prompt, setPrompt] = useState(""),
    [at, setAt] = useState(""),
    [repeat, setRepeat] = useState(false);
  return (
    <>
      <div className="page-head">
        <h1>Reminders</h1>
        <p>
          Checks that follow through. Quiet when nothing changes; a nudge when
          it matters.
        </p>
      </div>
      <Followups jobs={data.jobs} act={act} />
      <form
        className="panel reminder-form"
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            await api(`/spaces/${data.space.id}/followups`, {
              prompt,
              at: new Date(at).getTime(),
              intervalMs: repeat ? 86400000 : null,
            });
            setPrompt("");
            setAt("");
          }, "Follow-up scheduled.");
        }}
      >
        <h2>Keep something on radar</h2>
        <label>
          What should the agent check?
          <textarea
            required
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <label>
          When
          <input
            type="datetime-local"
            required
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          Repeat daily until cancelled
        </label>
        <button className="primary">Schedule check-in</button>
      </form>
    </>
  );
}
function TaskForm({ members, submit }: any) {
  const [f, set] = useState({
    title: "",
    category: "coordination",
    assigneeId: "",
    due: "",
    note: "",
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          title: f.title,
          category: f.category,
          assigneeId: f.assigneeId,
          dueAt: f.due ? new Date(f.due).getTime() : null,
          note: f.note,
        });
      }}
    >
      <label>
        What needs doing?
        <input
          required
          value={f.title}
          onChange={(e) => set({ ...f, title: e.target.value })}
          placeholder="e.g. Arrange a ride for Wednesday"
          maxLength={200}
        />
      </label>
      <div className="form-grid">
        <label>
          Kind
          <select
            value={f.category}
            onChange={(e) => set({ ...f, category: e.target.value })}
          >
            {[
              "appointment",
              "ride",
              "repair",
              "technology",
              "coordination",
            ].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Who might take this?
          <select
            value={f.assigneeId}
            onChange={(e) => set({ ...f, assigneeId: e.target.value })}
          >
            <option value="">Ask for a volunteer</option>
            {members.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        When is it needed?
        <input
          type="datetime-local"
          value={f.due}
          onChange={(e) => set({ ...f, due: e.target.value })}
        />
      </label>
      <label>
        A useful note
        <textarea
          value={f.note}
          onChange={(e) => set({ ...f, note: e.target.value })}
          placeholder="Leave private medical or account details in a private conversation."
        />
      </label>
      <p className="small muted">
        Someone else’s responsibility stays proposed until they accept it
        themselves.
      </p>
      <button className="primary">Add to our board</button>
    </form>
  );
}
function Options({ task, act }: any) {
  const [form, set] = useState(false),
    [f, setF] = useState({
      name: "",
      source: "",
      language: "",
      price: "",
      availability: "",
      notes: "",
    });
  return (
    <>
      <p>
        {task?.title}. Recommendations are leads; compare what’s known and what
        still needs checking.
      </p>
      <div className="comparison">
        {(task?.candidates ?? []).map((c: any) => (
          <article key={c.id}>
            <Pill>{c.confidence}</Pill>
            <h3>{c.name}</h3>
            <dl>
              <dt>Language</dt>
              <dd>{c.language}</dd>
              <dt>Pricing</dt>
              <dd>{c.price}</dd>
              <dt>Availability</dt>
              <dd>{c.availability}</dd>
            </dl>
            <p>{c.notes}</p>
            <a href={c.source} target="_blank" rel="noreferrer">
              Source ↗
            </a>
          </article>
        ))}
      </div>
      <button className="secondary mt" onClick={() => set(!form)}>
        {form ? "Close form" : "+ Add a community recommendation"}
      </button>
      {form && (
        <form
          className="form mt"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await api(`/tasks/${task.id}/options`, f);
              set(false);
            }, "Recommendation added with attribution.");
          }}
        >
          {[
            ["name", "Name"],
            ["source", "Source link"],
            ["language", "Language (what was actually reported)"],
            ["price", "Price or quote"],
            ["availability", "Availability"],
            ["notes", "What still needs checking"],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                type={k === "source" ? "url" : "text"}
                required={k === "name" || k === "source"}
                value={(f as any)[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              />
            </label>
          ))}
          <button className="primary">Save recommendation</button>
        </form>
      )}
    </>
  );
}
function useLocationHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return hash;
}
function LiveApp({ clerkKey }: { clerkKey: string }) {
  const { isLoaded, isSignedIn, getToken } = useAuth(),
    clerk = useClerk();
  const hash = useLocationHash();
  token = () => getToken();
  if (!isLoaded) return <div className="loading">Opening your workspace…</div>;
  return isSignedIn &&
    (hash.startsWith("#/app") ||
      hash === "#/create" ||
      hash.startsWith("#invite=")) ? (
    <App isDemo={false} logout={() => clerk.signOut()} />
  ) : (
    <RepositoryLanding signedIn={!!isSignedIn} clerk={clerkKey} />
  );
}
function DemoApp({ localTest = false }: { localTest?: boolean }) {
  const hash = useLocationHash();
  return hash.startsWith("#/app") || hash === "#/create" ? (
    <App isDemo={!localTest} localTest={localTest} />
  ) : (
    <RepositoryLanding signedIn={false} clerk={null} demo />
  );
}
fetch("/config")
  .then((r) => r.json())
  .then((config) => {
    const root = createRoot(document.getElementById("root")!);
    root.render(
      config.demo || config.localTest ? (
        <DemoApp localTest={config.localTest} />
      ) : config.clerkKey ? (
        <ClerkProvider publishableKey={config.clerkKey}>
          <LiveApp clerkKey={config.clerkKey} />
        </ClerkProvider>
      ) : (
        <RepositoryLanding signedIn={false} clerk={null} />
      ),
    );
  });
