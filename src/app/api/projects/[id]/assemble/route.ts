import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getProject, updateProject } from "@/lib/projects";
import { createJob, runJob, claimRender, setRenderJob, releaseRender } from "@/lib/jobs";
import { runAssembly } from "@/lib/pipeline/assemble";
import { buildOutputTimeline } from "@/lib/pipeline/polish";
import { mediaUrlFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1200;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // one render per project: a duplicate request follows the render already running
  const lock = claimRender(id);
  if (!lock.ok) {
    if (lock.jobId) return NextResponse.json({ jobId: lock.jobId, alreadyRunning: true });
    return NextResponse.json({ error: "A render for this project is already starting." }, { status: 409 });
  }
  let started = false;
  try {
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!project.segments.length) {
      return NextResponse.json({ error: "Run analysis first" }, { status: 400 });
    }
    const keeps = project.segments.filter((s) => s.type === "keep");
    if (!keeps.length) {
      return NextResponse.json({ error: "No keep segments — nothing to assemble" }, { status: 400 });
    }

    const job = await createJob(id, "assemble");
    setRenderJob(id, job._id);
    await updateProject(id, { status: "assembling" });

    started = true;
    runJob(job._id, async (report) => {
      try {
        if (!project.polish?.applied) {
          // auto-run polish pre-pass so captions/transitions exist
          const { runPolishPipeline } = await import("@/lib/pipeline/polish");
          const { polish, segments } = await runPolishPipeline(project, (p, stage) =>
            report(p * 0.15, `Polish: ${stage}`)
          );
          await updateProject(id, { segments, polish: { ...project.polish, ...polish } as any });
        }
        const fresh = await getProject(id);
        if (!fresh) throw new Error("Project disappeared");
        const { outputPath, highlights } = await runAssembly(fresh, report);
        const { entries } = buildOutputTimeline(fresh.segments);
        await updateProject(id, {
          status: "assembled",
          currentStep: 5,
          highlights,
          export: {
            url: mediaUrlFor(outputPath),
            filename: path.basename(outputPath),
            sizeBytes: fs.statSync(outputPath).size,
          },
        });
        return {
          url: mediaUrlFor(outputPath),
          segments: entries.length,
          duration: highlights?.totalDuration,
        };
      } finally {
        releaseRender(id);
      }
    });
    return NextResponse.json({ jobId: job._id });
  } finally {
    if (!started) releaseRender(id);
  }
}
