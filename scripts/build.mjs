#!/usr/bin/env node
/**
 * Cross-platform production build for ClipCraft AI.
 * Runs `next build` (output: "standalone"), then copies static assets + public/
 * into .next/standalone so `npm start` (node .next/standalone/server.js) works
 * on every platform — no unix `cp -r` required.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Resolve the Next.js CLI through node directly — avoids PATH/.cmd issues on Windows
const nextBin = path.join("node_modules", "next", "dist", "bin", "next");
if (!fs.existsSync(nextBin)) {
  console.error("[build.mjs] Next.js is not installed. Run `npm install` first.");
  process.exit(1);
}

function run(args) {
  const r = spawnSync(process.execPath, [nextBin, ...args], { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`[build.mjs] next ${args.join(" ")} failed`);
    process.exit(r.status ?? 1);
  }
}

console.log("[build.mjs] running next build...");
run(["build"]);

const standalone = path.join(".next", "standalone");
const targets = [
  [path.join(".next", "static"), path.join(standalone, ".next", "static")],
  ["public", path.join(standalone, "public")],
];
for (const [src, dest] of targets) {
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`[build.mjs] copied ${src} -> ${dest}`);
  }
}
console.log("[build.mjs] build complete. Start with: npm start (runs .next/standalone/server.js)");
