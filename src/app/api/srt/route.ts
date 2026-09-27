import { NextRequest, NextResponse } from "next/server";
import { buildSrt } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cues = Array.isArray(body.cues) ? body.cues : [];
  const name = String(body.name || "transcript").replace(/[^a-z0-9_\- ]/gi, "").slice(0, 40) || "transcript";
  const srt = buildSrt(cues);
  return new NextResponse(srt, {
    status: 200,
    headers: {
      "Content-Type": "application/x-subrip; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.srt"`,
    },
  });
}
