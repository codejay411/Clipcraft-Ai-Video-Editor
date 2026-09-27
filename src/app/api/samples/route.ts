import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { SAMPLES_DIR } from "@/lib/storage";
import { pythonBin } from "@/lib/python";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCK_FILE = path.join(SAMPLES_DIR, ".generating");
const LOG_FILE = path.join(SAMPLES_DIR, "generation.log");

function isGenerating(): boolean {
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim());
    // check process alive
    process.kill(pid, 0);
    return true;
  } catch {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {
      /* ignore */
    }
    return false;
  }
}

function startGeneration() {
  if (isGenerating()) return;
  if (!fs.existsSync(SAMPLES_DIR)) fs.mkdirSync(SAMPLES_DIR, { recursive: true });
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  const logStream = fs.openSync(LOG_FILE, "a");
  const child = spawn(
    pythonBin(),
    [path.join(process.cwd(), "scripts", "py", "make_samples.py")],
    {
      detached: true,
      stdio: ["ignore", logStream, logStream],
      env: { ...process.env },
    }
  );
  child.unref();
  fs.writeFileSync(LOCK_FILE, String(child.pid));
}

export async function GET() {
  const metaPath = path.join(SAMPLES_DIR, "samples.json");
  const samples: any[] = [];
  if (fs.existsSync(metaPath)) {
    try {
      samples.push(...JSON.parse(fs.readFileSync(metaPath, "utf-8")));
    } catch {
      /* ignore */
    }
  }
  const allReady = samples.length >= 4 && samples.every((s) => fs.existsSync(path.join(SAMPLES_DIR, `${s.id}.mp4`)));
  let generating = isGenerating();

  // auto-start generation on first load
  if (!samples.length && !generating) {
    startGeneration();
    generating = true;
  }
  // regenerate missing samples if some exist
  if (samples.length > 0 && !allReady && !generating) {
    startGeneration();
    generating = true;
  }

  const enriched = samples.map((s) => {
    const mp4 = path.join(SAMPLES_DIR, `${s.id}.mp4`);
    const thumb = path.join(SAMPLES_DIR, `${s.id}_thumb.jpg`);
    return {
      ...s,
      ready: fs.existsSync(mp4),
      url: fs.existsSync(mp4) ? `/api/media/samples/${s.id}.mp4` : undefined,
      thumbUrl: fs.existsSync(thumb) ? `/api/media/samples/${s.id}_thumb.jpg` : undefined,
    };
  });
  return NextResponse.json({ samples: enriched, generating });
}

export async function POST(_req: NextRequest) {
  startGeneration();
  return NextResponse.json({ started: true });
}
