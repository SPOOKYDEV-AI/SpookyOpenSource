import {
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "coverage",
  ".runtime",
]);

const textExtensions = new Set([
  "", ".js", ".mjs", ".cjs", ".ts", ".json", ".md",
  ".yml", ".yaml", ".ps1", ".cmd", ".txt", ".toml",
]);

// Split sensitive project-specific strings so the scanner does not contain
// those literals itself and cannot accidentally whitelist them.
const forbidden = [
  {
    label: "provider-specific product name",
    test: text => text.toLowerCase().includes(["france", "student"].join("")),
  },
  {
    label: "chat-platform-specific code",
    test: text => text.toLowerCase().includes(["dis", "cord"].join("")),
  },
  {
    label: "private production service name",
    test: text => text.includes(["SPOOKY", "ORACLE"].join("_")),
  },
  {
    label: "private Windows username",
    test: text => text.toLowerCase().includes(["fm", "mbo"].join("")),
  },
  {
    label: "machine-specific Windows hostname",
    test: text => /DESKTOP-[A-Z0-9]{5,}/i.test(text),
  },
  {
    label: "private Windows production path",
    test: text => text.toUpperCase().includes(
      ["C:\\", "SPOOKY", "ORACLE"].join("")
    ),
  },
  {
    label: "private key material",
    test: text => /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),
  },
  {
    label: "GitHub personal access token",
    test: text => /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/.test(text),
  },
  {
    label: "AWS access key",
    test: text => /\bAKIA[A-Z0-9]{16}\b/.test(text),
  },
];

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;

    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      walk(path);
      continue;
    }

    if (!stat.isFile() || stat.size > 2_000_000) {
      continue;
    }

    if (!textExtensions.has(extname(entry).toLowerCase())) {
      continue;
    }

    const text = readFileSync(path, "utf8");
    for (const rule of forbidden) {
      if (rule.test(text)) {
        findings.push({
          file: relative(root, path),
          rule: rule.label,
        });
      }
    }
  }
}

walk(root);

if (findings.length) {
  console.error("Public-safety scan failed:");
  for (const finding of findings) {
    console.error(
      " - " + finding.file + ": " + finding.rule
    );
  }
  process.exit(1);
}

console.log("Public-safety scan OK.");
