import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { createJob, runJob } from "@/lib/jobs";
import { runPolishPipeline } from "@/lib/pipeline/polish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.segments.length) {
    return NextResponse.json({ error: "Run analysis first" }, { status: 400 });
  }

  const job = await createJob(id, "polish");
  await updateProject(id, { status: "polishing" });
  runJob(job._id, async (report) => {
    const { polish, segments } = await runPolishPipeline(project, report);
    await updateProject(id, {
      status: "polished",
      currentStep: Math.max(project.currentStep, 4),
      segments, // carries the transition decisions
      polish: { ...project.polish, ...polish } as any,
    });
    return {
      sceneCount: polish.scenes?.length || 0,
      transitionCount: polish.transitions?.length || 0,
      captionCount: polish.captions?.cues?.length || 0,
      noiseReducedPct: polish.audio?.noiseReducedPct || 0,
    };
  });
  return NextResponse.json({ jobId: job._id });
}
