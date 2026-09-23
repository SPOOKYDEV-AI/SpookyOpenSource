import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicJsonStateStore } from "../src/index.js";

test("atomic state store replaces state cleanly", () => {
  const dir = mkdtempSync(
    join(tmpdir(), "service-supervisor-")
  );
  const file = join(dir, "state.json");

  try {
    const store = new AtomicJsonStateStore({ file });
    store.write({ bootId: "one", value: 1 });
    store.write({ bootId: "two", value: 2 });

    assert.deepEqual(store.read(), {
      bootId: "two",
      value: 2,
    });

    store.clear();
    assert.equal(store.read(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
