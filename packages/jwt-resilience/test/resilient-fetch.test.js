import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthHttpError,
  ResilientAuthClient,
} from "../src/index.js";

function tokenManager() {
  return {
    canRefresh: true,
    invalidated: 0,
    calls: [],
    async getToken(options = {}) {
      this.calls.push(
        Boolean(options.forceRefresh)
      );
      return options.forceRefresh
        ? "fresh-token"
        : "cached-token";
    },
    invalidate() {
      this.invalidated += 1;
    },
  };
}

test("403 refreshes once and replays once", async () => {
  const tokens = tokenManager();
  let requests = 0;

  const client = new ResilientAuthClient({
    tokenManager: tokens,
    fetchImpl: async (_url, init) => {
      requests += 1;
      const auth =
        new Headers(init.headers).get(
          "Authorization"
        );

      if (requests === 1) {
        assert.equal(
          auth,
          "Bearer cached-token"
        );
        return new Response("forbidden", {
          status: 403,
        });
      }

      assert.equal(
        auth,
        "Bearer fresh-token"
      );
      return new Response("ok", {
        status: 200,
      });
    },
  });

  const response = await client.request(
    "https://example.test"
  );

  assert.equal(response.status, 200);
  assert.equal(requests, 2);
  assert.deepEqual(tokens.calls, [false, true]);
  assert.equal(tokens.invalidated, 0);
  assert.equal(
    client.recoveryStatus().recovered,
    1
  );
});

test("persistent 403 stops after one recovery", async () => {
  const tokens = tokenManager();
  let requests = 0;

  const client = new ResilientAuthClient({
    tokenManager: tokens,
    fetchImpl: async () => {
      requests += 1;
      return new Response("forbidden", {
        status: 403,
      });
    },
  });

  await assert.rejects(
    () => client.request("https://example.test"),
    error =>
      error instanceof AuthHttpError &&
      error.status === 403 &&
      error.recoveryAttempted === true
  );

  assert.equal(requests, 2);
  assert.equal(tokens.invalidated, 0);
});

test("401 invalidates cache before forced refresh", async () => {
  const tokens = tokenManager();
  let requests = 0;

  const client = new ResilientAuthClient({
    tokenManager: tokens,
    fetchImpl: async () => {
      requests += 1;
      return new Response(
        requests === 1 ? "unauthorized" : "ok",
        { status: requests === 1 ? 401 : 200 }
      );
    },
  });

  await client.request("https://example.test");
  assert.equal(tokens.invalidated, 1);
  assert.equal(requests, 2);
});
