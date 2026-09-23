import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { parseJwtExpiryMs } from "./jwt.js";

export class FileTokenStore {
  constructor({ file = ".runtime/auth.json" } = {}) {
    this.file = resolve(file);
  }

  load() {
    try {
      if (!existsSync(this.file)) return null;
      const parsed = JSON.parse(
        readFileSync(this.file, "utf8")
      );
      if (!parsed?.token) return null;

      return {
        token: String(parsed.token),
        expiresAt:
          Number(parsed.expiresAt) ||
          parseJwtExpiryMs(parsed.token),
        updatedAt:
          Number(parsed.updatedAt) || 0,
        source:
          String(parsed.source || "cache"),
      };
    } catch {
      return null;
    }
  }

  save(entry) {
    mkdirSync(dirname(this.file), {
      recursive: true,
    });

    const tmp = this.file + ".tmp";
    writeFileSync(
      tmp,
      JSON.stringify(
        {
          token: entry.token,
          expiresAt: entry.expiresAt,
          updatedAt: entry.updatedAt,
          source: entry.source || "refresh",
        },
        null,
        2
      ),
      {
        encoding: "utf8",
        mode: 0o600,
      }
    );

    try {
      renameSync(tmp, this.file);
    } catch (error) {
      // Windows may reject replacing an existing destination with rename().
      // Fall back to remove + rename while still never writing partial JSON.
      rmSync(this.file, { force: true });
      renameSync(tmp, this.file);
    }
  }

  clear() {
    try {
      rmSync(this.file, { force: true });
    } catch {
      // Best effort.
    }
  }
}
