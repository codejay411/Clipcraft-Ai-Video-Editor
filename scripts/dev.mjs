#!/usr/bin/env node
/**
 * Cross-platform dev server wrapper for ClipCraft AI.
 * Replaces the unix-only `next dev -p 3000 2>&1 | tee dev.log`.
 * Works on Linux, macOS and Windows (no `tee` / shell pipes needed).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2] || "dev"; // "dev" | "start"
const port = process.env.PORT || "3000";
const logFile = mode === "start" ? "server.log" : "dev.log";
const logFd = fs.openSync(logFile, "a");

// Resolve the Next.js CLI through node directly — avoids PATH/.cmd issues on Windows
const nextBin = path.join("node_modules", "next", "dist", "bin", "next");
const standaloneServer = path.join(".next", "standalone", "server.js");

if (mode !== "start" && !fs.existsSync(nextBin)) {
  console.error("[dev.mjs] Next.js is not installed. Run `npm install` first.");
  process.exit(1);
}

const args =
  mode === "start"
    ? [standaloneServer]
    : [nextBin, "dev", "-p", port, ...process.argv.slice(3)];

const child = spawn(process.execPath, args, {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: port },
});

console.log(`[dev.mjs] ${mode} starting on port ${port} (log: ${logFile})`);

function pipe(stream) {
  stream.on("data", (d) => {
    process.stdout.write(d);
    try {
      fs.writeSync(logFd, d);
    } catch {
      /* log write failures must never crash the server */
    }
  });
}
pipe(child.stdout);
pipe(child.stderr);

child.on("error", (e) => {
  console.error(`[dev.mjs] failed to start: ${e.message}`);
  process.exit(1);
});
child.on("close", (code) => process.exit(code ?? 0));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
