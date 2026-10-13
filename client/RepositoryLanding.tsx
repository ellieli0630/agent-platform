// Adapted from agent-platform main (abd82c9): preserve its original sticker hero, eyes, phone and training layout.
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { SignIn } from "@clerk/react";
type Kind =
  | "imsg"
  | "stamp"
  | "tag"
  | "receipt"
  | "poll"
  | "note"
  | "app"
  | "tape"
  | "rosette"
  | "ticket";
function Sticker({ kind, ch }: { kind: Kind; ch: string }) {
  const L = (
    x: number,
    y: number,
    fill: string,
    font = "Arial Black, Arial, sans-serif",
    size = 62,
    extra: any = {},
  ) => (
    <text
      x={x}
      y={y}
      fill={fill}
      fontFamily={font}
      fontSize={size}
      fontWeight={900}
      textAnchor="middle"
      dominantBaseline="central"
      {...extra}
    >
      {ch}
    </text>
  );
  const body: Record<Kind, ReactNode> = {
    imsg: (
      <>
        <path
          d="M16 10h68a12 12 0 0 1 12 12v52a12 12 0 0 1-12 12H40l-16 14 2-14h-10A12 12 0 0 1 4 74V22a12 12 0 0 1 12-12z"
          fill="#0a84ff"
        />
        {L(50, 48, "#fff")}
      </>
    ),
    stamp: (
      <>
        <rect
          x="8"
          y="8"
          width="84"
          height="94"
          fill="#fff8ec"
          stroke="#fff8ec"
          strokeWidth="10"
          strokeDasharray="0.1 7.9"
          strokeLinecap="round"
        />
        <rect
          x="16"
          y="16"
          width="68"
          height="78"
          fill="#f6d6c9"
          stroke="#c2412d"
          strokeWidth="2.5"
        />
        {L(50, 52, "#c2412d", "Georgia, serif", 60)}
      </>
    ),
    tag: (
      <>
        <path
          d="M50 4c-6 0-6 10 0 14"
          stroke="#8a6a3c"
          strokeWidth="2.5"
          fill="none"
        />
        <path
          d="M24 22h52l12 14v60a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6V36z"
          fill="#d9b48a"
          stroke="#9b7448"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        <circle
          cx="50"
          cy="32"
          r="4.5"
          fill="#e8ece8"
          stroke="#8a6a3c"
          strokeWidth="2"
        />
        {L(50, 68, "#3d2a14", "Georgia, serif", 52)}
      </>
    ),
    receipt: (
      <>
        <path
          d="M14 6h72v92l-6-5-6 5-6-5-6 5-6-5-6 5-6-5-6 5-6-5-6 5-6-5z"
          fill="#fffef8"
          stroke="#cfd5cc"
          strokeWidth="1.5"
        />
        {[16, 24].map((y) => (
          <line
            key={y}
            x1="22"
            x2="78"
            y1={y}
            y2={y}
            stroke="#b7bfb4"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        ))}
        {L(50, 56, "#1d2420", "Courier New, monospace", 58)}
        <text
          x="50"
          y="84"
          fontSize="8"
          textAnchor="middle"
          fill="#6b746c"
          fontFamily="Courier New"
        >
          SPLIT 4 WAYS
        </text>
      </>
    ),
    poll: (
      <>
        <rect
          x="6"
          y="10"
          width="88"
          height="88"
          rx="14"
          fill="#fff"
          stroke="#d3d8d2"
          strokeWidth="2"
        />
        {[30, 50, 70].map((y, i) => (
          <rect
            key={y}
            x="18"
            y={y - 5}
            width={[46, 64, 28][i]}
            height="10"
            rx="5"
            fill={["#c8c3ff", "#7a5cff", "#e3e0ff"][i]}
          />
        ))}
        {L(78, 30, "#4533d6", "Arial Black, Arial", 34)}
      </>
    ),
    note: (
      <>
        <g transform="rotate(-4 50 55)">
          <rect x="10" y="12" width="80" height="84" fill="#ffe86b" />
          <path d="M74 96l16-16v16z" fill="#e6c94a" />
          <rect x="38" y="6" width="26" height="12" fill="#ffffff99" />
          {L(48, 56, "#2b2a20", "Georgia, serif", 64, {
            fontStyle: "italic",
            fontWeight: 700,
          })}
        </g>
      </>
    ),
    app: (
      <>
        <rect x="8" y="12" width="84" height="84" rx="22" fill="url(#g)" />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7a5cff" />
            <stop offset="1" stopColor="#2fa8ff" />
          </linearGradient>
        </defs>
        {L(50, 56, "#fff")}
        <circle cx="86" cy="16" r="11" fill="#ff3b30" />
        <text
          x="86"
          y="17"
          fontSize="13"
          fill="#fff"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Arial"
          fontWeight="700"
        >
          1
        </text>
      </>
    ),
    tape: (
      <>
        <rect x="4" y="30" width="92" height="50" rx="6" fill="#1d1f22" />
        <rect x="4" y="30" width="92" height="6" rx="3" fill="#3a3d42" />
        {L(50, 57, "#f4f4f2", "Courier New, monospace", 50, {
          letterSpacing: 2,
        })}
      </>
    ),
    rosette: (
      <>
        <path
          d="M38 70l-12 34 14-8 8 12 6-36zM62 70l12 34-14-8-8 12-6-36z"
          fill="#2f6f5a"
        />
        <circle
          cx="50"
          cy="48"
          r="40"
          fill="#e0b84a"
          stroke="#c99a2a"
          strokeWidth="4"
          strokeDasharray="5 3"
        />
        <circle cx="50" cy="48" r="28" fill="#fffaf0" />
        {L(50, 49, "#2f6f5a", "Georgia, serif", 46)}
      </>
    ),
    ticket: (
      <>
        <path
          d="M6 24h88v20a8 8 0 0 0 0 20v20H6V64a8 8 0 0 0 0-20z"
          fill="#ff8a65"
        />
        <line
          x1="72"
          x2="72"
          y1="28"
          y2="80"
          stroke="#fff"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        {L(38, 54, "#fff", "Arial Black, Arial", 52)}
      </>
    ),
  };
  return (
    <svg viewBox="0 0 100 110" aria-hidden>
      {body[kind]}
    </svg>
  );
}
const LOOKS: [Kind, Kind][] = [
  ["imsg", "stamp"],
  ["note", "rosette"],
  ["tape", "ticket"],
  ["app", "receipt"],
  ["imsg", "tag"],
  ["poll", "note"],
  ["stamp", "app"],
  ["receipt", "imsg"],
  ["rosette", "poll"],
  ["tag", "tape"],
  ["ticket", "poll"],
];
const spring = (angle: number, y: number) =>
  Array.from({ length: 41 }, (_, i) => {
    const t = i / 40,
      v =
        i === 40
          ? 1
          : 1 -
            Math.exp(-7.2 * t) *
              (Math.cos(10.5 * t) + 0.24 * Math.sin(10.5 * t));
    return {
      offset: t,
      transform: `translate(-50%, -50%) translateY(${y + 8 * (1 - v)}px) rotate(${angle - 8 * (1 - v)}deg) scale(${0.35 + 0.65 * v})`,
    };
  });
function LetterHero({ text }: { text: string }) {
  const chars = Array.from(text),
    positions = chars.map((c, i) =>
      c === " " ? -1 : chars.slice(0, i).filter((x) => x !== " ").length,
    ),
    n = chars.filter((c) => c !== " ").length;
  const [active, setActive] = useState<Record<number, Kind>>({});
  const last = useRef<Record<number, Kind>>({}),
    hovered = useRef<number | null>(null),
    timers = useRef<Record<number, any>>({});
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const show = (i: number, ms?: number) => {
    if (reduced) return;
    const [a, b] = LOOKS[i % LOOKS.length],
      kind =
        last.current[i] === a
          ? b
          : last.current[i] === b
            ? a
            : Math.random() < 0.5
              ? a
              : b;
    last.current[i] = kind;
    clearTimeout(timers.current[i]);
    setActive((s) => ({ ...s, [i]: kind }));
    if (ms)
      timers.current[i] = setTimeout(
        () => hovered.current !== i && hide(i),
        ms,
      );
  };
  const hide = (i: number) => {
    clearTimeout(timers.current[i]);
    setActive((s) => {
      const c = { ...s };
      delete c[i];
      return c;
    });
  };
  useEffect(() => {
    if (reduced) return;
    const t: any[] = [];
    for (let i = 0; i < n; i++) t.push(setTimeout(() => show(i), i * 40));
    [...Array(n).keys()]
      .sort(() => Math.random() - 0.5)
      .forEach((i, k) =>
        t.push(setTimeout(() => hide(i), 40 * n + 700 + 45 * k)),
      );
    let auto: any;
    const loop = () => {
      auto = setTimeout(
        () => {
          if (hovered.current === null && !document.hidden)
            show(Math.floor(Math.random() * n), 1000);
          loop();
        },
        1300 + Math.random() * 1500,
      );
    };
    t.push(setTimeout(loop, 40 * n + 1500));
    return () => {
      t.forEach(clearTimeout);
      clearTimeout(auto);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);
  const point = (e: { clientX: number; clientY: number }) => {
    const el = (
      document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    )?.closest("[data-pos]") as HTMLElement | null;
    const next = el ? Number(el.dataset.pos) : null;
    if (next === hovered.current) return;
    const old = hovered.current;
    hovered.current = next;
    if (old !== null) hide(old);
    if (next !== null) show(next);
  };
  const leave = () => {
    const old = hovered.current;
    hovered.current = null;
    if (old !== null) hide(old);
  };
  return (
    <h1
      className="ed-title"
      aria-label={text}
      onPointerMove={point}
      onPointerDown={point}
      onPointerLeave={leave}
      onPointerCancel={leave}
    >
      {text.split(" ").map((w, wi, ws) => {
        const start = ws.slice(0, wi).reduce((n, x) => n + x.length + 1, 0);
        return (
          <span key={wi} className="ed-word">
            {Array.from(w).map((c, j) => (
              <Letter
                key={j}
                ch={c}
                pos={positions[start + j]}
                kind={active[positions[start + j]]}
              />
            ))}
          </span>
        );
      })}
    </h1>
  );
}
function Letter({ ch, pos, kind }: { ch: string; pos: number; kind?: Kind }) {
  const [shown, setShown] = useState<Kind | undefined>(kind),
    ref = useRef<HTMLSpanElement>(null),
    anim = useRef<Animation | null>(null);
  const angle = [-9, 7, -5, 8, -7, 6, -4][pos % 7],
    y = [3, -2, 2, -3, 1, 3, -1][pos % 7];
  useEffect(() => {
    if (kind) setShown(kind);
  }, [kind]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    anim.current?.cancel();
    if (kind && shown === kind)
      anim.current = el.animate(spring(angle, y), {
        duration: 340,
        fill: "both",
      });
    else if (!kind && shown) {
      const a = el.animate(
        [
          {
            transform: `translate(-50%, -50%) rotate(${angle}deg) scale(1)`,
            opacity: 1,
          },
          {
            transform: `translate(-50%, -50%) rotate(${angle}deg) scale(.35)`,
            opacity: 0,
          },
        ],
        {
          duration: 520,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "forwards",
        },
      );
      a.onfinish = () => setShown(undefined);
      anim.current = a;
    }
  }, [kind, shown]);
  return (
    <span
      className={`ed-letter ${kind ? "on" : shown ? "returning" : ""}`}
      data-pos={pos}
    >
      <span className="ed-char">{ch}</span>
      {shown && (
        <span className="ed-sticker" ref={ref}>
          <Sticker kind={shown} ch={ch} />
        </span>
      )}
    </span>
  );
}
const Sparkle = ({ size = 26, style }: { size?: number; style?: any }) => (
  <svg
    className="gm-doodle"
    width={size}
    height={size}
    viewBox="0 0 40 40"
    style={style}
    aria-hidden
  >
    <path
      d="M20 2c1.6 9.6 8.4 16.4 18 18-9.6 1.6-16.4 8.4-18 18-1.6-9.6-8.4-16.4-18-18 9.6-1.6 16.4-8.4 18-18z"
      fill="#c6f432"
      stroke="#111"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
  </svg>
);
export function Eyes({ size = 46 }: { size?: number }) {
  const ref = useRef<HTMLSpanElement>(null),
    [p, setP] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const a = Math.atan2(
        e.clientY - r.top - r.height / 2,
        e.clientX - r.left - r.width / 2,
      );
      setP({ x: Math.cos(a) * 4, y: Math.sin(a) * 4 });
    };
    addEventListener("pointermove", move);
    return () => removeEventListener("pointermove", move);
  }, []);
  return (
    <span ref={ref} className="gm-eyes" aria-hidden>
      {[0, 1].map((i) => (
        <svg
          key={i}
          width={size / 2}
          height={(size / 2) * 1.15}
          viewBox="0 0 24 28"
        >
          <ellipse
            cx="12"
            cy="14"
            rx="10.5"
            ry="12.5"
            fill="#fff"
            stroke="#111"
            strokeWidth="2.2"
          />
          <circle cx={12 + p.x} cy={15 + p.y} r="4.6" fill="#111" />
          <circle cx={13.6 + p.x} cy={13.4 + p.y} r="1.3" fill="#fff" />
        </svg>
      ))}
    </span>
  );
}
const Circled = ({ children }: { children: ReactNode }) => (
  <span className="gm-circled">
    {children}
    <svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden>
      <path
        d="M30 14C80 2 170 4 190 30s-40 44-110 42S6 58 10 36 50 10 100 10"
        fill="none"
        stroke="#c6f432"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  </span>
);
function Rotator() {
  const words = [
    "yourself",
    "your family",
    "your friends",
    "your neighborhood",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % words.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="gm-rot"
      aria-label="yourself, your family, your friends or your neighborhood"
    >
      <span key={i} className="gm-rot-word" style={{ background: "#c6f432" }}>
        {words[i]}
      </span>
      ,
    </span>
  );
}
const THREAD = [
  ["Mum", "Could someone take me on Wednesday?"],
  [
    "Pip",
    "Daniel, can you take the ride? It stays unconfirmed until you say yes.",
  ],
  ["me", "Pip, also find a Mandarin-speaking handyman."],
  [
    "Pip",
    "I’ll compare language, availability and prices. I’ll ask before calling anyone.",
  ],
  ["Daniel", "Yes, I can take the ride."],
  [
    "Pip",
    "Thanks, Daniel. You’re on the ride. I’ll check in before Wednesday.",
  ],
  ["Mum", "Can you help me join a video call?"],
  ["Pip", "Of course. One step at a time. Which device are you using?"],
];
function PhoneMock() {
  const lastMine = THREAD.map((m) => m[0]).lastIndexOf("me");
  return (
    <div className="phone ios" aria-hidden>
      <div className="scr">
        <div className="ios-status">
          <span>9:41</span>
          <i className="ios-island" />
          <span className="ios-icons">
            <span className="ios-batt">
              <i />
            </span>
          </span>
        </div>
        <div className="ios-hd">
          <span className="ios-back">
            <b>12</b>
          </span>
          <div className="ios-faces">
            {["M", "S", "L", "✦"].map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="ios-name">Family chat ❤️</div>
        </div>
        <div className="ios-thread">
          <div className="ios-stamp">
            <b>iMessage</b>
            <br />
            Today 7:41 PM
          </div>
          {THREAD.map(([from, text], i) => {
            const mine = from === "me",
              firstOfRun = i === 0 || THREAD[i - 1][0] !== from,
              lastOfRun =
                i === THREAD.length - 1 || THREAD[i + 1]?.[0] !== from;
            return (
              <div
                key={i}
                className={`ios-row ${mine ? "me" : "them"}${lastOfRun ? " tail" : ""}`}
                style={{ animationDelay: `${i * 0.35}s` }}
              >
                {!mine && firstOfRun && <div className="ios-who">{from}</div>}
                <div className="ios-line">
                  {!mine && (
                    <span className={`ios-av${lastOfRun ? "" : " ghost"}`}>
                      {from === "Pip" ? "✦" : from[0]}
                    </span>
                  )}
                  <div className="ios-bub">{text}</div>
                </div>
                {mine && i === lastMine && (
                  <div className="ios-receipt">Delivered</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="ios-compose">
          <span className="ios-plus">+</span>
          <span className="ios-field">iMessage</span>
        </div>
      </div>
    </div>
  );
}

export function RepositoryLanding({
  signedIn,
  clerk,
  demo = false,
}: {
  signedIn: boolean;
  clerk: string | null;
  demo?: boolean;
}) {
  const [auth, setAuth] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setAuth(false);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (signedIn && auth) {
      setAuth(false);
      if (!location.hash.startsWith("#invite=")) location.hash = "/app";
    }
  }, [signedIn]); // signed in from the modal: straight to the app
  const cta =
    signedIn || demo ? (
      <a className="gm-btn dark" href="#/app">
        {demo ? "Explore the workspace" : "Open your agent"}
      </a>
    ) : clerk ? (
      <button className="gm-btn dark" onClick={() => setAuth(true)}>
        Train your agent
      </button>
    ) : null;
  return (
    <div className="landing gm">
      <a className="skip-link" href="#how-it-works">
        Skip to how it works
      </a>
      <nav className="gm-nav">
        <div className="gm-logo">
          agents
          <Eyes size={26} />
        </div>
        <div className="gm-links" />
        <div className="row" style={{ gap: 14 }}>
          {!signedIn && clerk && (
            <button className="gm-link" onClick={() => setAuth(true)}>
              Sign in
            </button>
          )}
          {cta}
        </div>
      </nav>
      <section className="gm-hero">
        <Sparkle size={22} style={{ left: "12%", top: 70 }} />
        <p className="gm-hand">psst… hover the letters ↓</p>
        <div className="gm-title-wrap">
          <LetterHero text="train your agent" />
        </div>
        <p className="gm-for">
          <span>one for</span>
          <Rotator />
          <span className="gm-anywhere">then text them.</span>
        </p>
        <p className="gm-sub">
          One helping hand for the people you already talk to. Teach it what
          matters, invite your family or friends, and let it coordinate
          appointments, rides and the little things that need follow-through.
          Private information stays private. You decide before it reaches out.
        </p>
        <div className="gm-ctas">{cta}</div>
        <p className="gm-fine">
          One agent. Your people. A little less on your plate.
        </p>
      </section>
      <section
        id="how-it-works"
        className="gm-sec gm-split"
        style={{ paddingTop: 20 }}
      >
        <div className="gm-steps">
          {[
            [
              "1",
              "Train it.",
              "Chat with it on the web. What you'd like to hand off, how you want it to behave, the people and routines that matter. It remembers, and you can see and fix what it kept.",
              "#c6f432",
            ],
            [
              "2",
              "Bring your people in.",
              "Invite someone to a shared space, or connect an iMessage line for an existing chat. Everyone can ask for help without setting up their own agent.",
              "#ffe14d",
            ],
            [
              "3",
              "Keep things moving.",
              "A responsibility needs a real yes. Plans keep their progress, try another approach when blocked, and bring decisions back to the right person.",
              "#9be7c4",
            ],
          ].map(([n, b, p, c]) => (
            <div key={n} className="gm-card" style={{ "--c": c } as any}>
              <div className="gm-step">
                <span className="gm-num">{n}</span>
                <div>
                  <b>{b}</b>
                  <p>{p}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="phone-example">
          <PhoneMock />
          <p className="example-caption">
            Illustrative family conversation · no messages sent
          </p>
        </div>
      </section>
      <section className="gm-sec gm-end">
        <h2 className="gm-h2">
          Your group chat just got
          <br />a new <Circled>friend</Circled>
        </h2>
        <div className="gm-ctas">{cta}</div>
        <p className="gm-fine">
          Permission before outreach · Private chats stay private
        </p>
      </section>
      {auth && clerk && (
        <div
          className="modal-bg"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in to your agent"
          onClick={(e) => e.target === e.currentTarget && setAuth(false)}
        >
          <div className="modal bare">
            <button
              className="auth-close"
              aria-label="Close sign-in"
              onClick={() => setAuth(false)}
            >
              ×
            </button>
            <SignIn
              routing={"virtual" as any}
              withSignUp
              forceRedirectUrl={
                location.hash.startsWith("#invite=") ? location.href : "/#/app"
              }
              signUpForceRedirectUrl={
                location.hash.startsWith("#invite=") ? location.href : "/#/app"
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
