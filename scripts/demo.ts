// A demo always uses a separate, local database; never seed a live workspace.
const target = new URL(
  process.env.DATABASE_URL ??
    "postgres://gather:gather@localhost:5434/gather_demo",
);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))
  throw new Error("The demo requires a local database.");
target.pathname = "/gather_demo";
process.env.DATABASE_URL = target.href;
process.env.DEMO_MODE = "1";
process.env.PORT ??= "3100";
await import("../server/index");

export {};
