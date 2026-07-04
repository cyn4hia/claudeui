// One-time login helper: launches the Claude runtime bundled with the Agent
// SDK so you can sign in with your existing Claude account (the same one the
// desktop app uses). Run `npm run login`, pick "Claude account (subscription)",
// finish in the browser, then exit with /exit or Ctrl+C.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scope = path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules", "@anthropic-ai");

let bin = null;
try {
  const pkg = fs.readdirSync(scope).find((n) => n.startsWith("claude-agent-sdk-"));
  if (pkg) {
    const candidate = path.join(scope, pkg, "claude");
    if (fs.existsSync(candidate)) bin = candidate;
  }
} catch {}

if (!bin) {
  console.error("bundled claude binary not found — run `npm install` first");
  process.exit(1);
}

console.log("♥ opening claude — sign in with your Claude account, then type /exit to come back\n");
spawnSync(bin, [], { stdio: "inherit" });
console.log("\n♥ all set (if login succeeded) — now run: npm start");
