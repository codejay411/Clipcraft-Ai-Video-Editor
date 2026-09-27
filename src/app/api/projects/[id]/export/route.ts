import { NextRequest, NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/projects";
import { createJob, runJob, claimRender, setRenderJob, releaseRender } from "@/lib/jobs";
import { runAssembly } from "@/lib/pipeline/assemble";
import { mediaUrlFor } from "@/lib/storage";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1200;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    let output = project.output;
    try {
      const body = await req.json();
      if (body?.output) {
        output = { ...output, ...body.output };
        await updateProject(id, { output });
      }
    } catch {
      /* no body */
    }

    const job = await createJob(id, "export");
    setRenderJob(id, job._id);
    await updateProject(id, { status: "exporting" });

    started = true;
    runJob(job._id, async (report) => {
      try {
        const fresh = await getProject(id);
        if (!fresh) throw new Error("Project disappeared");

        const renderKeys: (keyof typeof output)[] = [
          "resolution",
          "format",
          "aspectRatio",
          "quality",
          "optimizeSize",
          "burnSubtitles",
          "music",
          "musicTrack",
          "musicVolume",
        ];
        const settingsChanged = renderKeys.some((k) => fresh.output[k] !== project.output[k]);
        if (!fresh.export?.url || settingsChanged) {
          // re-render with current output settings
          const { outputPath, highlights } = await runAssembly(fresh, report);
          const stat = fs.statSync(outputPath);
          await updateProject(id, {
            status: "exported",
            currentStep: 6,
            highlights,
            export: {
              url: mediaUrlFor(outputPath),
              filename: path.basename(outputPath),
              sizeBytes: stat.size,
              exportedAt: new Date().toISOString(),
              duration: highlights?.totalDuration,
              originalDuration: highlights?.originalDuration,
            },
          });
          return { url: mediaUrlFor(outputPath), highlights };
        }

        await updateProject(id, {
          status: "exported",
          currentStep: 6,
          export: {
            ...fresh.export,
            exportedAt: new Date().toISOString(),
          },
        });
        return { url: fresh.export.url, highlights: fresh.highlights };
      } finally {
        releaseRender(id);
      }
    });
    return NextResponse.json({ jobId: job._id });
  } finally {
    if (!started) releaseRender(id);
  }
}
