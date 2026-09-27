import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { createJob, runJob } from "@/lib/jobs";
import { runLLMAnalysis } from "@/lib/pipeline/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.segments.length) {
    return NextResponse.json({ error: "Run transcription analysis first" }, { status: 400 });
  }

  const job = await createJob(id, "llm");
  runJob(job._id, async (report) => {
    await report(10, "Sending transcript to LLM...");
    const analysis = await runLLMAnalysis(
      project.segments,
      project.transcript.text,
      project.name
    );
    await report(80, "Applying insights to segments...");
    await updateProject(id, { analysis, segments: project.segments });
    return { provider: analysis.provider, model: analysis.model };
  });
  return NextResponse.json({ jobId: job._id });
}
