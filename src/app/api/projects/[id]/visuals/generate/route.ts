import { NextRequest, NextResponse } from "next/server";
import { generateImageVisual } from "@/lib/pipeline/visuals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt || "").slice(0, 400);
    if (!prompt.trim()) {
      return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    }
    const provider = body.provider === "huggingface" ? "huggingface" : "pollinations";
    const visual = await generateImageVisual(prompt, { provider });
    return NextResponse.json({ visual });
  } catch (e: any) {
    console.error("[visuals generate]", e);
    return NextResponse.json({ error: e?.message || "Generation failed" }, { status: 500 });
  }
}
