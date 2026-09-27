import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import crypto from "crypto";
import { safeResolveMedia, TMP_DIR } from "@/lib/storage";
import { runProc, withSdr } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THUMB_CACHE_DIR = path.join(TMP_DIR, "thumbs");

function nodeToWeb(stream: Readable): ReadableStream {
  return Readable.toWeb(stream) as ReadableStream;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const src = url.searchParams.get("src") || "";
  const t = Math.max(0, parseFloat(url.searchParams.get("t") || "0") || 0);
  const w = Math.min(1280, Math.max(64, parseInt(url.searchParams.get("w") || "320") || 320));
  if (!src) return NextResponse.json({ error: "src required" }, { status: 400 });

  const abs = safeResolveMedia(src.replace(/^\/api\/media\//, ""));
  if (!abs) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    if (!fs.existsSync(THUMB_CACHE_DIR)) fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
    const hash = crypto
      .createHash("md5")
      .update(`${abs}|${t}|${w}|sdr1`)
      .digest("hex");
    const cachePath = path.join(THUMB_CACHE_DIR, `${hash}.jpg`);
    if (!fs.existsSync(cachePath)) {
      await runProc(
        "ffmpeg",
        ["-y", "-ss", t.toFixed(2), "-i", abs, "-frames:v", "1", "-vf", await withSdr(abs, `scale=${w}:-2`), "-q:v", "3", cachePath],
        45000
      );
    }
    if (!fs.existsSync(cachePath)) {
      return NextResponse.json({ error: "frame extract failed" }, { status: 500 });
    }
    const stat = fs.statSync(cachePath);
    const stream = fs.createReadStream(cachePath);
    return new NextResponse(nodeToWeb(stream) as any, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "thumb failed" }, { status: 500 });
  }
}
