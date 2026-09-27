import { NextRequest, NextResponse } from "next/server";
import { getCollection, toId } from "@/lib/mongo";
import { getProject, updateProject, publicProject } from "@/lib/projects";
import type { ProjectDoc, TimelineSegment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project: publicProject(project) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getProject(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();

  const patch: Partial<ProjectDoc> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 500);
  if (typeof body.currentStep === "number") patch.currentStep = Math.max(1, Math.min(6, body.currentStep));
  if (typeof body.status === "string") patch.status = body.status;

  if (Array.isArray(body.segments)) {
    // segments patch: allow type/label/transitionIn/status/visualPrompt/layout updates
    const segs: TimelineSegment[] = existing.segments;
    const byId = new Map(segs.map((s) => [s.id, s]));
    let timelineChanged = false;
    for (const s of body.segments) {
      const cur = byId.get(s.id);
      if (!cur) continue;
      if (["keep", "cut", "silence"].includes(s.type) && cur.type !== s.type) {
        cur.type = s.type;
        timelineChanged = true;
      }
      if (["camera", "screen"].includes(s.layout) && (cur.layout || "camera") !== s.layout) {
        cur.layout = s.layout;
        if (s.layout === "screen" && cur.visual) cur.visual = null; // b-roll never covers code
        timelineChanged = true;
      }
      if (["approved", "rejected", "pending"].includes(s.status) && cur.status !== s.status) {
        timelineChanged = timelineChanged || s.status === "rejected" || cur.status === "rejected";
      }
      if (typeof s.label === "string") cur.label = s.label.slice(0, 80);
      if (["cut", "crossfade", "none"].includes(s.transitionIn)) cur.transitionIn = s.transitionIn;
      if (["approved", "rejected", "pending"].includes(s.status)) cur.status = s.status;
      if (typeof s.visualPrompt === "string") cur.visualPrompt = s.visualPrompt.slice(0, 200);
    }
    patch.segments = segs;
    // transitions + captions were computed for the old cut list: re-run Polish
    if (timelineChanged && existing.polish?.applied) {
      patch.polish = { ...existing.polish, applied: false };
    }
  }

  if (body.output && typeof body.output === "object") {
    patch.output = { ...existing.output, ...body.output };
  }
  if (body.polish && typeof body.polish === "object") {
    patch.polish = { ...(patch.polish || existing.polish), ...body.polish };
  }
  if (Array.isArray(body.titles)) patch.titles = body.titles;
  if (Array.isArray(body.thumbnails)) patch.thumbnails = body.thumbnails;

  const updated = await updateProject(id, patch);
  return NextResponse.json({ project: updated ? publicProject(updated) : null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const col = await getCollection("projects");
  const oid = toId(id);
  const filter = oid ? ({ $or: [{ _id: oid as any }, { _id: id }] } as any) : ({ _id: id } as any);
  await col.deleteOne(filter);
  const media = await getCollection("media");
  await media.deleteMany({ projectId: id });
  return NextResponse.json({ ok: true });
}
