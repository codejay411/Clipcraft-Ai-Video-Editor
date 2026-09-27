import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getProject, updateProject } from "@/lib/projects";
import { createJob, runJob } from "@/lib/jobs";
import { callLLMJson } from "@/lib/llm";
import { ffprobeJson, withSdr } from "@/lib/ffmpeg";
import { TMP_DIR, RENDERS_DIR, mediaUrlFor } from "@/lib/storage";
import { pythonBin } from "@/lib/python";
import type { ProjectDoc } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function extractKeyframes(videoPath: string, workDir: string, atTimes?: number[]): Promise<string[]> {
  return new Promise((resolve) => {
    const outs = [0.25, 0.5, 0.75].map(
      (_, i) => path.join(workDir, `frame_${i}.jpg`)
    );
    const src = videoPath.replace(/^\/api\/media\//, path.join(process.cwd(), "storage") + path.sep);
    let done = 0;
    const results: string[] = [];
    Promise.all([ffprobeJson(src), withSdr(src, "null")])
      .then(([info, vf]: [any, string]) => {
        const dur = parseFloat(info.format?.duration || "10");
        outs.forEach((out, i) => {
          const t = atTimes?.length
            ? Math.min(Math.max(0.2, atTimes[i % atTimes.length]), Math.max(0.2, dur - 0.2))
            : Math.max(0.2, dur * [0.25, 0.5, 0.75][i]);
          const p = spawn("ffmpeg", ["-y", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", vf, "-q:v", "2", out]);
          p.on("close", () => {
            done++;
            if (fs.existsSync(out)) results[i] = out;
            if (done === outs.length) resolve(results.filter(Boolean));
          });
          p.on("error", () => {
            done++;
            if (done === outs.length) resolve(results.filter(Boolean));
          });
        });
      })
      .catch(() => resolve([]));
  });
}

function overlayHeadline(imagePath: string, headline: string, outPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(pythonBin(), [
      path.join(process.cwd(), "scripts", "py", "thumbnail.py"),
      imagePath,
      headline,
      outPath,
      "#8B5CF6",
    ]);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`thumbnail.py failed: ${err.slice(-300)}`));
    });
    p.on("error", (e) => reject(e));
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const job = await createJob(id, "thumbnails");
  runJob(job._id, async (report) => {
    await report(10, "Generating headline ideas...");
    // ask LLM for 3 short thumbnail headlines
    let headlines: string[] = [];
    try {
      const { data } = await callLLMJson<{ headlines?: string[] }>([
        {
          role: "system",
          content: "You are a YouTube thumbnail copywriter. Respond with JSON only.",
        },
        {
          role: "user",
          content: `Based on this video transcript, write 3 punchy thumbnail headlines (3-6 words each, UPPERCASE friendly, high CTR${project.transcript.language === "hi-en" ? ", Hinglish in Roman script is fine" : ""}):\n\n"${project.transcript.text.slice(0, 2500)}"\n\nRespond: {"headlines": ["...", "...", "..."]}`,
        },
      ]);
      headlines = (data.headlines || []).slice(0, 3).map((h: string) => String(h).slice(0, 60));
    } catch (e: any) {
      console.error("[thumbnails] LLM failed:", e?.message);
    }
    if (!headlines.length) {
      headlines = [
        (project.name || "WATCH THIS").toUpperCase().slice(0, 40),
        "MUST SEE TIPS",
        "DON'T MISS THIS",
      ];
    }

    await report(30, "Extracting keyframes...");
    // Faces get more clicks than code: when the video mixes camera and screen
    // recording, grab frames from on-camera parts of the (caption-free) source.
    const cameraKeeps = project.segments.filter(
      (s) => s.type === "keep" && s.status !== "rejected" && s.layout !== "screen"
    );
    const hasScreen = project.segments.some((s) => s.layout === "screen");
    let videoUrl = project.export?.url?.endsWith(".gif") ? project.source.url : project.export?.url || project.source.url;
    let atTimes: number[] | undefined;
    if (hasScreen && cameraKeeps.length && project.source.mediaType === "video") {
      videoUrl = project.source.url;
      const picks = [0, Math.floor(cameraKeeps.length / 2), cameraKeeps.length - 1].map((i) => cameraKeeps[i]);
      atTimes = picks.map((s) => (s.start + s.end) / 2);
    }
    const workDir = path.join(TMP_DIR, `thumbs_${id}`);
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });
    const frames = await extractKeyframes(videoUrl, workDir, atTimes);
    if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true });

    const thumbs: ProjectDoc["thumbnails"] = [];
    for (let i = 0; i < 3; i++) {
      await report(40 + i * 18, `Rendering thumbnail ${i + 1}/3...`);
      const frame = frames[i % Math.max(1, frames.length)];
      const out = path.join(RENDERS_DIR, `thumb_${id}_${i}.jpg`);
      try {
        if (frame) {
          await overlayHeadline(frame, headlines[i] || headlines[0], out);
        } else {
          // fallback: AI-generate a thumbnail background
          const { generateImageVisual } = await import("@/lib/pipeline/visuals");
          const v = await generateImageVisual(
            `YouTube thumbnail background about ${project.name}, bold dramatic scene, vibrant`
          );
          const bg = path.join(process.cwd(), "storage", v.url.replace("/api/media/", ""));
          await overlayHeadline(bg, headlines[i] || headlines[0], out);
        }
        thumbs.push({
          id: `thumb-${i}`,
          url: mediaUrlFor(out),
          headline: headlines[i] || headlines[0],
          selected: i === 0,
        });
      } catch (e: any) {
        console.error(`[thumbnails] thumb ${i} failed:`, e?.message);
      }
    }
    if (!thumbs.length) throw new Error("Failed to generate thumbnails");

    await updateProject(id, { thumbnails: thumbs });
    // cleanup
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { count: thumbs.length };
  });
  return NextResponse.json({ jobId: job._id });
}
