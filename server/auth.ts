import { verifyToken, createClerkClient } from "@clerk/backend";
import { db, demo, first, uid, time, demand } from "./store";
export async function authenticate(req: Request) {
  if (demo) return first(db`select * from gather_people where id='demo_alex'`);
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  demand(bearer && process.env.CLERK_SECRET_KEY, 401, "Sign in to continue.");
  const claims = await verifyToken(bearer, {
    secretKey: process.env.CLERK_SECRET_KEY,
    authorizedParties: [
      new URL(process.env.PUBLIC_URL ?? "http://localhost:3100").origin,
    ],
  }).catch(() => null);
  demand(claims, 401, "Your sign-in expired.");
  const existing = await first(
    db`select * from gather_people where clerk_id=${claims.sub}`,
  );
  if (existing) return existing;
  const user = await createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  }).users.getUser(claims.sub);
  const email = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  demand(
    email?.verification?.status === "verified",
    403,
    "Verify your email first.",
  );
  const id = uid("person");
  await db`insert into gather_people(id,clerk_id,name,email,created_at) values(${id},${claims.sub},${[user.firstName, user.lastName].filter(Boolean).join(" ") || "You"},${email.emailAddress},${time()}) on conflict(clerk_id) do nothing`;
  return first(db`select * from gather_people where clerk_id=${claims.sub}`);
}
