import { db, time, json, first, demo } from "./store";
import type { Completion, ChatMessage } from "./model";
export async function seedDemo() {
  if (
    !demo ||
    (await first(db`select 1 from gather_people where id='demo_alex'`))
  )
    return;
  const at = time(),
    day = 86400000;
  await db.begin(async (tx) => {
    for (const [id, name] of [
      ["alex", "Alex Chen"],
      ["linda", "Linda Chen"],
      ["daniel", "Daniel Chen"],
      ["mei", "Mei Zhang"],
    ])
      await tx`insert into gather_people(id,name,clerk_id,created_at) values(${"demo_" + id},${name},${id === "alex" ? "demo" : null},${at})`;
    await tx`insert into gather_agents(id,owner_id,name,purpose,instructions,created_at) values('demo_agent','demo_alex','Gather','Help our people coordinate everyday life and follow through.','Be patient, concise, and keep one person’s private details out of group conversations.',${at})`;
    for (const [id, name, kind] of [
      ["family", "Chen family", "family"],
      ["neighbors", "Maple Street", "neighborhood"],
      ["friends", "Weekend people", "friends"],
      ["private", "Just you & Gather", "private"],
    ]) {
      await tx`insert into gather_spaces(id,owner_id,agent_id,name,kind,created_at) values(${"demo_" + id},'demo_alex','demo_agent',${name},${kind},${at})`;
      const people =
        kind === "private"
          ? ["alex"]
          : id === "family"
            ? ["alex", "linda", "daniel"]
            : ["alex", "mei"];
      for (const p of people)
        await tx`insert into gather_members(space_id,person_id,role,joined_at) values(${"demo_" + id},${"demo_" + p},${p === "alex" ? "owner" : "member"},${at})`;
    }
    const tasks = [
      [
        "appointment",
        "Confirm Mum’s eye appointment",
        "appointment",
        "demo_alex",
        "accepted",
        at + day,
        "The clinic still needs to confirm the time.",
      ],
      [
        "ride",
        "A ride for Wednesday’s appointment",
        "ride",
        "demo_daniel",
        "proposed",
        at + day,
        "Daniel has been asked; he hasn’t confirmed yet.",
      ],
      [
        "repair",
        "Find a Mandarin-speaking handyman",
        "repair",
        "demo_alex",
        "accepted",
        at + 3 * day,
        "Compare language, availability and pricing before anyone books.",
      ],
      [
        "technology",
        "Help Mum join a video call",
        "technology",
        "demo_linda",
        "accepted",
        at + 2 * day,
        "One step at a time. Ask what she sees on the screen.",
      ],
    ];
    for (const [id, title, category, assignee, status, due, note] of tasks)
      await tx`insert into gather_tasks(id,space_id,created_by,assignee_id,title,category,status,due_at,note,created_at,updated_at) values(${"demo_" + id},'demo_family','demo_alex',${assignee as string},${title as string},${category as string},${status as string},${due as number},${note as string},${at},${at})`;
    await tx`update gather_tasks set candidates=${json([
      {
        id: "sample_1",
        name: "A community recommendation",
        source: "https://www.reddit.com/",
        language: "Mandarin mentioned by a neighbor",
        price: "Quote needed",
        availability: "Call to check",
        notes: "Sample lead. Not vetted or contacted.",
        confidence: "sample data",
        addedBy: "demo_mei",
        updatedAt: at,
      },
      {
        id: "sample_2",
        name: "A local repair service",
        source: "https://www.google.com/maps",
        language: "Not checked",
        price: "Estimate needed",
        availability: "Not confirmed",
        notes: "Sample comparison. Check primary evidence.",
        confidence: "sample data",
        addedBy: "demo_alex",
        updatedAt: at,
      },
    ])}::text::jsonb where id='demo_repair'`;
    await tx`insert into gather_memories(id,agent_id,space_id,kind,text,aliases,observed_at,updated_at) values('demo_shared','demo_agent','demo_family','preference','Linda prefers Mandarin and one instruction at a time.','["mum","mom","妈妈","technology"]',${at},${at})`;
    for (const [id, text, kind] of [
      ["tone", "Keep replies short and patient.", "rule"],
      [
        "personal",
        "My personal repair budget is private until I choose to share it.",
        "fact",
      ],
      ["rhythm", "I review family responsibilities every Sunday.", "routine"],
    ])
      await tx`insert into gather_memories(id,agent_id,owner_id,kind,text,observed_at,updated_at) values(${"demo_" + id},'demo_agent','demo_alex',${kind},${text},${at},${at})`;
    for (const [role, person, text] of [
      ["user", "demo_linda", "Can someone help me join the family video call?"],
      [
        "assistant",
        null,
        "Of course. We’ll go one step at a time. First, which device are you using?",
      ],
      [
        "user",
        "demo_alex",
        "Gather, we also need someone to take Mum on Wednesday.",
      ],
      [
        "assistant",
        null,
        "I’ve put the ride on our board as a proposal for Daniel. It’s still unconfirmed. We’ll keep the appointment details separate until Mum chooses what to share.",
      ],
    ])
      await tx`insert into gather_messages(id,space_id,person_id,role,text,created_at) values(${crypto.randomUUID()},'demo_family',${person},${role!},${text!},${at})`;
    await tx`insert into gather_jobs(id,space_id,requester_id,task_id,prompt,next_at,created_at) values('demo_followup','demo_family','demo_alex','demo_ride','Check whether the ride is confirmed. If still unconfirmed when it is due, ask the family who can help.',${at + day},${at})`;
  });
}
export function demoCompletion(run: any, messages: ChatMessage[]): Completion {
  const results = messages.filter((m) => m.role === "tool");
  const initial = run.request.toLocaleLowerCase();
  const call = (name: string, input: any): Completion => ({
    text: "",
    cost: 0,
    calls: [{ id: crypto.randomUUID(), name, input }],
  });
  if (!results.length && /handyman|repair|mandarin|维修/.test(initial))
    return call("plan_save", {
      goal: "Find a suitable Mandarin-speaking handyman with the family’s permission.",
      steps: [
        {
          id: "leads",
          title: "Gather community leads",
          channel: "search",
          dependsOn: [],
          success:
            "Find source-backed local candidates and their contact details.",
          fallback:
            "Ask the neighborhood group, then draft a community post for review.",
        },
        {
          id: "check",
          title: "Call a candidate to compare details",
          channel: "call",
          dependsOn: [],
          success:
            "Obtain language, availability and pricing from a completed call transcript.",
          fallback:
            "If unavailable, approach another candidate or ask a family member.",
        },
        {
          id: "choose",
          title: "Bring the family a comparison",
          channel: "local",
          dependsOn: ["check"],
          success:
            "Present sourced options and ask for a decision before booking.",
          fallback: "Explain which details remain unconfirmed.",
        },
      ],
    });
  if (
    results.length === 1 &&
    run.plan &&
    /handyman|repair|mandarin|维修/.test(initial)
  )
    return call("call_business", {
      step_id: "check",
      business: "Sample repair business",
      number: "+15550000123",
      goal: "Ask whether a Mandarin-speaking handyman is available this week, their service area, call-out fee and estimate. Do not book or pay.",
      disclosedInformation:
        "A family is comparing local repair options. No names, exact address or medical details.",
    });
  if (/handyman|repair|mandarin|维修/.test(initial))
    return {
      text: "The plan and a review card are ready. In a live workspace I would research leads, call the approved candidate, and compare their actual answers. Here the provider step is simulated; nobody has been contacted and no quote is confirmed.",
      calls: [],
      cost: 0,
    };
  if (!results.length && /remember|记住/.test(initial))
    return call("memory_save", {
      text: run.request.replace(/^remember\s*/i, ""),
      kind: "fact",
    });
  if (results.length && /remember|记住/.test(initial))
    return {
      text: "Saved here. A group fact stays in this group; a private fact stays with you.",
      calls: [],
      cost: 0,
    };
  return {
    text: "This is a scripted preview of Gather. Try “find a Mandarin-speaking handyman” to review a plan and an approval, or “remember…” to save a scoped fact. The responsibility board and privacy controls use the real local database.",
    calls: [],
    cost: 0,
  };
}
