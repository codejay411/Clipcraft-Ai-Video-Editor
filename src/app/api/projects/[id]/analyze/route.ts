import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { createJob, runJob } from "@/lib/jobs";
import { runFullAnalysis } from "@/lib/pipeline/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const job = await createJob(id, "analyze");
  await updateProject(id, { status: "analyzing" });

  // fire and forget — client polls /api/jobs/:id
  runJob(job._id, async (report) => {
    const { segments, analysis, transcript, layoutRegions } = await runFullAnalysis(project, report);
    const words = transcript.words || [];
    await updateProject(id, {
      status: "analyzed",
      currentStep: 2,
      segments,
      layoutRegions,
      analysis,
      transcript: {
        text: transcript.text,
        language: transcript.language,
        words,
        engine: "whisper",
      },
    });
    return {
      segmentCount: segments.length,
      keepCount: segments.filter((s) => s.type === "keep").length,
      cutCount: segments.filter((s) => s.type === "cut").length,
      silenceCount: segments.filter((s) => s.type === "silence").length,
      llm: analysis ? analysis.provider : null,
    };
  });

  return NextResponse.json({ jobId: job._id });
}
