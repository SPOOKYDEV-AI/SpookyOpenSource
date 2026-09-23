import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileTokenStore,
  JwtTokenManager,
} from "../src/index.js";

function jwtWithExp(expSeconds) {
  const encode = value =>
    Buffer.from(JSON.stringify(value))
      .toString("base64url");
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({ exp: expSeconds }),
    "signature",
  ].join(".");
}

test("concurrent callers share one refresh", async () => {
  let refreshes = 0;
  const token = jwtWithExp(
    Math.floor(Date.now() / 1000) + 3600
  );

  const manager = new JwtTokenManager({
    refresh: async () => {
      refreshes += 1;
      await new Promise(resolve =>
        setTimeout(resolve, 20)
      );
      return token;
    },
  });

  const values = await Promise.all([
    manager.getToken({ forceRefresh: true }),
    manager.getToken({ forceRefresh: true }),
    manager.getToken({ forceRefresh: true }),
  ]);

  assert.equal(refreshes, 1);
  assert.deepEqual(values, [token, token, token]);
});

test("atomic file store survives manager recreation", async () => {
  const dir = mkdtempSync(
    join(tmpdir(), "jwt-resilience-")
  );
  const file = join(dir, "auth.json");
  const token = jwtWithExp(
    Math.floor(Date.now() / 1000) + 3600
  );

  try {
    const store = new FileTokenStore({ file });
    const manager = new JwtTokenManager({
      store,
      refresh: async () => ({
        token,
        source: "test",
      }),
    });

    await manager.getToken({
      forceRefresh: true,
    });

    const restored = new JwtTokenManager({
      store,
    });

    assert.equal(
      await restored.getToken(),
      token
    );
    assert.equal(restored.status().valid, true);
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true,
    });
  }
});
