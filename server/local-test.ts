const loopback = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(host);
export function validateLocalTest(env: Record<string, string | undefined>) {
  if (env.LOCAL_TEST_MODE !== "1") return;
  if (env.NODE_ENV === "production")
    throw new Error("Local login bypass cannot run in production.");
  const url = new URL(env.DATABASE_URL ?? "");
  if (!loopback(url.hostname) || !url.pathname.endsWith("_preview"))
    throw new Error(
      "Local login bypass requires a separate localhost *_preview database.",
    );
}
export function requireLocalRequest(req: Request) {
  const url = new URL(req.url),
    origin = req.headers.get("origin");
  if (
    !loopback(url.hostname) ||
    (origin && origin !== url.origin) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw Object.assign(
      new Error(
        "Local testing is available only on this computer and app origin.",
      ),
      { status: 403 },
    );
}
