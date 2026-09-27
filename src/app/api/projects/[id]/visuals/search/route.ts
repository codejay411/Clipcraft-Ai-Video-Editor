import { NextRequest, NextResponse } from "next/server";
import { searchStockMedia } from "@/lib/pipeline/visuals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = String(body.query || "").slice(0, 200);
    const perPage = Math.min(24, Math.max(4, Number(body.perPage) || 12));
    const { results, usedSource, note } = await searchStockMedia(query, perPage);
    return NextResponse.json({ results, usedSource, note });
  } catch (e: any) {
    console.error("[visuals search]", e);
    return NextResponse.json({ error: e?.message || "Search failed" }, { status: 500 });
  }
}
