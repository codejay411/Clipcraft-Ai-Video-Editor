import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCollection, newId } from "@/lib/mongo";
import { UPLOADS_DIR, SAMPLES_DIR, uniqueFilename, mediaUrlFor, ensureDirs } from "@/lib/storage";
import { probeMedia, extractThumbnail } from "@/lib/ffmpeg";
import { publicProject } from "@/lib/projects";
import type { ProjectDoc, MediaAssetDoc } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const col = await getCollection<ProjectDoc>("projects");
  const docs = await col
    .find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return NextResponse.json({
    projects: docs.map((d: any) => publicProject({ ...d, _id: d._id.toString() })),
  });
}

const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

export async function POST(req: NextRequest) {
  try {
    ensureDirs();
    const form = await req.formData();
    const name = (form.get("name") as string) || "Untitled Project";
    const description = (form.get("description") as string) || "";
    const language = (form.get("language") as string) || "auto";
    const sampleId = (form.get("sampleId") as string) || "";
    const file = form.get("file") as File | null;

    let srcAbs: string;
    let filename: string;
    let isSample = false;

    if (sampleId) {
      // use pre-generated sample
      const safe = path.basename(sampleId).replace(/[^a-z0-9-]/gi, "");
      const samplePath = path.join(SAMPLES_DIR, `${safe}.mp4`);
      if (!fs.existsSync(samplePath)) {
        return NextResponse.json(
          { error: "Sample not ready yet. Try again in a minute." },
          { status: 404 }
        );
      }
      srcAbs = samplePath;
      filename = `${safe}.mp4`;
      isSample = true;
    } else if (file && typeof file === "object" && (file as any).arrayBuffer) {
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: "File too large (max 2GB)" }, { status: 400 });
      }
      filename = uniqueFilename(file.name || "upload.mp4");
      srcAbs = path.join(UPLOADS_DIR, filename);
      const buf = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(srcAbs, buf);
    } else {
      return NextResponse.json({ error: "No file or sampleId provided" }, { status: 400 });
    }

    // probe
    const probe = await probeMedia(srcAbs);
    if (!probe.hasAudio) {
      return NextResponse.json(
        { error: "The file has no audio track. A talking-head video or audio is required." },
        { status: 400 }
      );
    }

    const thumbPath = path.join(UPLOADS_DIR, `${path.parse(filename).name}_thumb.jpg`);
    const thumb = probe.hasVideo
      ? await extractThumbnail(srcAbs, thumbPath, 1)
      : null;

    const id = newId();
    const project: ProjectDoc = {
      _id: id,
      name: name || "Untitled Project",
      description,
      language,
      status: "created",
      currentStep: 1,
      source: {
        filename: file?.name || filename,
        filepath: srcAbs,
        url: mediaUrlFor(srcAbs),
        size: fs.statSync(srcAbs).size,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        mimeType: probe.mimeType,
        mediaType: probe.hasVideo ? "video" : "audio",
        thumbnail: thumb ? mediaUrlFor(thumb) : undefined,
        isSample,
        sampleId: isSample ? path.parse(filename).name : undefined,
      },
      transcript: { text: "", words: [], engine: "" },
      segments: [],
      polish: {
        applied: false,
        scenes: [],
        transitions: [],
        captions: { enabled: true, style: "clean", cues: [] },
        audio: { cleanup: true, method: "afftdn" },
      },
      output: {
        resolution: "1080p",
        format: "mp4",
        aspectRatio: "16:9",
        quality: "high",
        music: false,
        musicTrack: "inspirational",
        musicVolume: 60,
        burnSubtitles: true,
        optimizeSize: false,
      },
      export: {},
      thumbnails: [],
      titles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const col = await getCollection<ProjectDoc>("projects");
    await col.insertOne(project as any);

    // record in media library
    const mediaCol = await getCollection<MediaAssetDoc>("media");
    await mediaCol.insertOne({
      _id: newId(),
      projectId: id,
      kind: isSample ? "sample" : "upload",
      filename,
      filepath: srcAbs,
      url: mediaUrlFor(srcAbs),
      meta: { duration: probe.duration, size: fs.statSync(srcAbs).size },
      createdAt: new Date().toISOString(),
    } as any);

    return NextResponse.json({ project: publicProject(project) });
  } catch (e: any) {
    console.error("[create project]", e);
    return NextResponse.json({ error: e?.message || "Failed to create project" }, { status: 500 });
  }
}
