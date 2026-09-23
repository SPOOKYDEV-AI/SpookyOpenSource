import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export class AtomicJsonStateStore {
  constructor({ file }) {
    if (!file) {
      throw new Error("state file is required");
    }
    this.file = resolve(file);
  }

  read() {
    try {
      if (!existsSync(this.file)) return null;
      return JSON.parse(
        readFileSync(this.file, "utf8")
      );
    } catch {
      return null;
    }
  }

  write(value) {
    mkdirSync(dirname(this.file), {
      recursive: true,
    });

    const tmp =
      this.file +
      ".tmp-" +
      process.pid +
      "-" +
      Date.now();

    writeFileSync(
      tmp,
      JSON.stringify(value, null, 2),
      { encoding: "utf8", mode: 0o600 }
    );

    try {
      renameSync(tmp, this.file);
    } catch {
      rmSync(this.file, { force: true });
      renameSync(tmp, this.file);
    }
  }

  clear() {
    rmSync(this.file, { force: true });
  }
}
