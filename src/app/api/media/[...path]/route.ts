import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { safeResolveMedia } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".srt": "text/plain; charset=utf-8",
  ".json": "application/json",
};

function nodeToWeb(stream: fs.ReadStream, signal?: AbortSignal): ReadableStream {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: string | Buffer) => {
        controller.enqueue(chunk);
      });
      stream.on("end", () => {
        try { controller.close(); } catch { /* already closed */ }
      });
      stream.on("error", (err) => {
        try { controller.error(err); } catch { /* already closed */ }
      });
      if (signal) {
        signal.addEventListener("abort", () => {
          stream.destroy();
          try { controller.close(); } catch { /* already closed */ }
        });
      }
    },
    cancel() {
      stream.destroy();
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  const rel = parts.map(decodeURIComponent).join("/");
  const abs = safeResolveMedia(rel);
  if (!abs) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stat = fs.statSync(abs);
  const ext = (abs.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? parseInt(m[1]) : 0;
    let end = m?.[2] ? parseInt(m[2]) : stat.size - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    const chunk = fs.createReadStream(abs, { start, end });
    return new NextResponse(nodeToWeb(chunk, req.signal), {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const stream = fs.createReadStream(abs);
  return new NextResponse(nodeToWeb(stream, req.signal), {
    status: 200,
    headers: {
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
