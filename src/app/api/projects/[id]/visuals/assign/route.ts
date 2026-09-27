import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { downloadStockAsset } from "@/lib/pipeline/visuals";
import type { StockResult } from "@/lib/pipeline/visuals";
import { getCollection, newId } from "@/lib/mongo";
import type { MediaAssetDoc } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const body = await req.json();
  const segmentId = String(body.segmentId || "");
  const seg = project.segments.find((s) => s.id === segmentId);
  if (!seg) return NextResponse.json({ error: "Segment not found" }, { status: 404 });

  try {
    let visual = body.visual || null;
    if (body.stockItem) {
      // download remote stock item to local storage
      visual = await downloadStockAsset(body.stockItem as StockResult, body.kenBurns);
    }
    if (visual) {
      visual.id = visual.id || newId();
      // record in media library
      const mediaCol = await getCollection<MediaAssetDoc>("media");
      await mediaCol.insertOne({
        _id: newId(),
        projectId: id,
        kind: visual.kind === "ai_generated" ? "generated" : "stock",
        filename: visual.url.split("/").pop() || "",
        filepath: "",
        url: visual.url,
        meta: { prompt: visual.prompt, source: visual.source },
        createdAt: new Date().toISOString(),
      } as any);
    }
    seg.visual = visual || null;
    if (body.visualPrompt && typeof body.visualPrompt === "string") {
      seg.visualPrompt = body.visualPrompt.slice(0, 200);
    }
    const updated = await updateProject(id, { segments: project.segments });
    return NextResponse.json({ project: updated, segment: seg });
  } catch (e: any) {
    console.error("[visuals assign]", e);
    return NextResponse.json({ error: e?.message || "Assign failed" }, { status: 500 });
  }
}
