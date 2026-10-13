// Real GLM 5.3, fictional data, no Clerk or outbound providers. Bound to loopback only.
import { SQL } from "bun";
if (process.env.NODE_ENV === "production")
  throw new Error("Local testing cannot run in production.");
const target = new URL(
  process.env.DATABASE_URL ?? "postgres://gather:gather@localhost:5434/gather",
);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))
  throw new Error("Local testing requires localhost PostgreSQL.");
const adminUrl = new URL(target);
adminUrl.pathname = "/postgres";
const admin = new SQL(adminUrl.href);
try {
  if (
    !(await admin`select 1 from pg_database where datname='gather_preview'`)
      .length
  )
    await admin.unsafe("create database gather_preview");
} finally {
  await admin.close();
}
target.pathname = "/gather_preview";
process.env.DATABASE_URL = target.href;
delete process.env.DEMO_MODE;
process.env.LOCAL_TEST_MODE = "1";
process.env.PORT = process.env.LOCAL_TEST_PORT ?? "3102";
process.env.PUBLIC_URL = `http://localhost:${process.env.PORT}`;
process.env.MODEL_CHEAP = "z-ai/glm-5.3";
process.env.MODEL_SMART = "z-ai/glm-5.3";
process.env.MODEL_CAP_USD = process.env.LOCAL_TEST_BUDGET_USD ?? "0.15";
await import("../server/index");
