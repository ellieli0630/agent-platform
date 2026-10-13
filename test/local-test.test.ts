import { test, expect } from "bun:test";
import { validateLocalTest, requireLocalRequest } from "../server/local-test";
test("local authentication bypass requires its isolated local preview database", () => {
  expect(() =>
    validateLocalTest({
      LOCAL_TEST_MODE: "1",
      DATABASE_URL: "postgres://localhost/gather_preview",
    }),
  ).not.toThrow();
  expect(() =>
    validateLocalTest({
      LOCAL_TEST_MODE: "1",
      DATABASE_URL: "postgres://localhost/gather",
    }),
  ).toThrow();
  expect(() =>
    validateLocalTest({
      LOCAL_TEST_MODE: "1",
      DATABASE_URL: "postgres://remote.example/gather_preview",
    }),
  ).toThrow();
});
test("local authentication bypass cannot start in production", () => {
  expect(() =>
    validateLocalTest({
      LOCAL_TEST_MODE: "1",
      NODE_ENV: "production",
      DATABASE_URL: "postgres://localhost/gather_preview",
    }),
  ).toThrow("production");
  expect(() =>
    validateLocalTest({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://db.example/gather",
    }),
  ).not.toThrow();
});
test("local testing rejects a different host or cross-origin browser request", () => {
  expect(() =>
    requireLocalRequest(
      new Request("http://localhost:3102/api/bootstrap", {
        headers: {
          origin: "http://localhost:3102",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
  ).not.toThrow();
  expect(() =>
    requireLocalRequest(new Request("http://example.com/api/bootstrap")),
  ).toThrow();
  expect(() =>
    requireLocalRequest(
      new Request("http://localhost:3102/api/bootstrap", {
        headers: { origin: "https://other.example" },
      }),
    ),
  ).toThrow();
  expect(() =>
    requireLocalRequest(
      new Request("http://localhost:3102/api/bootstrap", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
    ),
  ).toThrow();
});
