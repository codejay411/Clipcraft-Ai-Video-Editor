import fs from "fs";
import path from "path";
import { detectScenes, measureNoiseFloor, buildSrt, extractThumbnail, runProc } from "../ffmpeg";
import { TMP_DIR, RENDERS_DIR, mediaUrlFor, ensureDirs } from "../storage";
import type { ProjectDoc, TimelineSegment, SceneInfo, TransitionInfo, CaptionCue } from "../types";

export const XFADE_DUR = 1.0;
// both sides of a crossfade must be long enough to give up XFADE_DUR of overlap
const MIN_XFADE_SEG = 2 * XFADE_DUR;

export interface OutputMapEntry {
  segmentId: string;
  outStart: number;
  outEnd: number;
  transitionIn: "cut" | "crossfade";
}

export function renderedKeeps(segments: TimelineSegment[]): TimelineSegment[] {
  return segments.filter((s) => s.type === "keep" && s.status !== "rejected");
}

/**
 * Map kept segments onto the OUTPUT timeline. `durations` lets the renderer
 * pass the real encoded clip lengths so captions line up exactly with the
 * final video; otherwise the nominal segment durations are used.
 */
export function buildOutputTimeline(
  segments: TimelineSegment[],
  durations?: Map<string, number>
): {
  entries: OutputMapEntry[];
  totalDuration: number;
} {
  const keeps = renderedKeeps(segments);
  const entries: OutputMapEntry[] = [];
  let t = 0;
  let prevDur = 0;
  keeps.forEach((seg, i) => {
    const dur = durations?.get(seg.id) ?? seg.duration;
    const crossfade =
      i > 0 && seg.transitionIn === "crossfade" && prevDur >= MIN_XFADE_SEG && dur >= MIN_XFADE_SEG;
    const outStart = Math.max(0, t - (crossfade ? XFADE_DUR : 0));
    const outEnd = outStart + dur;
    entries.push({ segmentId: seg.id, outStart, outEnd, transitionIn: crossfade ? "crossfade" : "cut" });
    t = outEnd;
    prevDur = dur;
  });
  return { entries, totalDuration: t };
}

function sceneTypeFor(segIndex: number, keeps: TimelineSegment[], sceneStarts: number[]): SceneInfo["type"] {
  if (segIndex === 0) return "Intro";
  if (segIndex === keeps.length - 1) return "Conclusion";
  const seg = keeps[segIndex];
  const prev = keeps[segIndex - 1];
  if ((prev.layout || "camera") !== (seg.layout || "camera")) return "Topic Change";
  // a scene change within the segment boundary
  const hasSceneChange = sceneStarts.some((t) => t > seg.start - 0.3 && t < seg.start + 1.0);
  const topicChanged = prev.label !== seg.label || hasSceneChange || seg.start - prev.end > 2.5;
  return topicChanged ? "Topic Change" : "Same Topic";
}

/**
 * Transition rules for talking-head + screen-recording tutorials:
 * - camera <-> screen switch: crossfade (smooth hand-off from intro to demo)
 * - screen -> screen: hard cut (a crossfade would blur the code)
 * - camera -> camera: same topic = crossfade, new topic = hard cut
 */
function transitionFor(prev: TimelineSegment, seg: TimelineSegment, sceneType: SceneInfo["type"]): "cut" | "crossfade" {
  const a = prev.layout || "camera";
  const b = seg.layout || "camera";
  if (a !== b) return "crossfade";
  if (b === "screen") return "cut";
  return sceneType === "Same Topic" ? "crossfade" : "cut";
}

/** Split kept segments into ~8-word caption cues, placed on the OUTPUT timeline. */
export function buildCaptionCues(segments: TimelineSegment[], entries: OutputMapEntry[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const chunkSize = 8;
  for (const seg of renderedKeeps(segments)) {
    const entry = entries.find((e) => e.segmentId === seg.id);
    if (!entry) continue;
    const offset = entry.outStart - seg.start;
    const words = seg.words.length
      ? seg.words
      : seg.text
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => ({ word: w, start: seg.start, end: seg.end }));
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize);
      const text = chunk.map((w) => w.word).join(" ").trim();
      if (!text) continue;
      const start = Math.max(seg.start, chunk[0].start);
      const end = Math.min(chunk[chunk.length - 1].end, start + 5, seg.end);
      if (end <= start) continue;
      cues.push({
        index: cues.length + 1,
        start: +(start + offset).toFixed(3),
        end: +(end + offset).toFixed(3),
        text,
      });
    }
  }
  return cues;
}

export async function runPolishPipeline(
  project: ProjectDoc,
  report: (p: number, stage: string) => Promise<void>
): Promise<{ polish: Partial<ProjectDoc["polish"]>; segments: TimelineSegment[] }> {
  ensureDirs();
  const srcPath = project.source.filepath;
  const segments = project.segments.map((s) => ({ ...s }));
  const keeps = renderedKeeps(segments);

  await report(8, "Detecting scene changes...");
  let sceneStarts: number[] = [];
  if (project.source.mediaType === "video") {
    try {
      sceneStarts = await detectScenes(srcPath, 0.3);
    } catch (e: any) {
      console.error("[polish] scene detect failed", e?.message);
      sceneStarts = [];
    }
  }

  await report(28, "Mapping scenes to segments...");
  const scenes: SceneInfo[] = keeps.map((seg, i) => ({
    id: i + 1,
    start: seg.start,
    end: seg.end,
    label: seg.label,
    type: sceneTypeFor(i, keeps, sceneStarts),
  }));

  // scene thumbnails for the first ~6 scenes
  for (const scene of scenes.slice(0, 6)) {
    try {
      const thumbPath = path.join(TMP_DIR, `scene_${project._id}_${scene.id}.jpg`);
      const ok = project.source.mediaType === "video"
        ? await extractThumbnail(srcPath, thumbPath, Math.min(scene.start + 0.5, Math.max(0, scene.end - 0.2)))
        : null;
      if (ok) scene.thumbnail = mediaUrlFor(ok);
    } catch {
      /* ignore */
    }
  }

  await report(46, "Applying transition logic...");
  keeps.forEach((seg, i) => {
    seg.transitionIn = i === 0 ? "cut" : transitionFor(keeps[i - 1], seg, scenes[i].type);
  });
  const { entries } = buildOutputTimeline(segments);
  const transitions: TransitionInfo[] = [];
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    const seg = keeps[i];
    const prevSeg = keeps[i - 1];
    const isCrossfade = entry.transitionIn === "crossfade";
    const layoutChange = (prevSeg.layout || "camera") !== (seg.layout || "camera");
    transitions.push({
      id: `tr-${entry.segmentId}`,
      type: isCrossfade ? "crossfade" : "cut",
      at: entry.outStart,
      duration: isCrossfade ? XFADE_DUR : 0,
      rationale: layoutChange
        ? `${prevSeg.layout === "screen" ? "Screen → camera" : "Camera → screen"} — ${isCrossfade ? "smooth crossfade" : "hard cut (segment too short to fade)"}`
        : isCrossfade
          ? "Same topic continues — smooth crossfade"
          : seg.layout === "screen"
            ? "Screen recording — hard cut keeps code sharp"
            : `New topic (${prevSeg.label} → ${seg.label}) — hard cut`,
    });
  }

  await report(64, "Generating captions (SRT)...");
  const outCues = buildCaptionCues(segments, entries);
  const srtPath = path.join(RENDERS_DIR, `captions_${project._id}.srt`);
  fs.writeFileSync(srtPath, buildSrt(outCues), "utf-8");

  const method = project.polish?.audio?.method === "off" ? "off" : "afftdn";
  let noiseBeforeDb = -50;
  let noiseAfterDb = -50;
  let cleanedUrl: string | undefined;
  if (method !== "off") {
    await report(78, "Cleaning audio (afftdn)...");
    const audioPath = path.join(TMP_DIR, `polish_audio_${project._id}.wav`);
    try {
      await runProc(
        "ffmpeg",
        ["-y", "-i", srcPath, "-vn", "-ar", "44100", "-ac", "2", audioPath],
        180000
      );
      noiseBeforeDb = await measureNoiseFloor(audioPath);
      const cleanedPath = path.join(RENDERS_DIR, `audio_clean_${project._id}.wav`);
      await runProc(
        "ffmpeg",
        ["-y", "-i", audioPath, "-af", "afftdn=nf=-28", "-ar", "44100", "-ac", "2", cleanedPath],
        240000
      );
      noiseAfterDb = await measureNoiseFloor(cleanedPath);
      cleanedUrl = mediaUrlFor(cleanedPath);
    } catch (e: any) {
      console.error("[polish] audio cleanup failed", e?.message);
    } finally {
      try {
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch {
        /* ignore */
      }
    }
  }
  const noiseReducedPct =
    noiseBeforeDb > -49 && noiseAfterDb < noiseBeforeDb
      ? Math.min(95, Math.round(Math.abs(noiseBeforeDb - noiseAfterDb) * 3.5))
      : 0;

  await report(100, "Polish complete");
  return {
    segments,
    polish: {
      applied: true,
      scenes,
      transitions,
      captions: {
        enabled: project.polish?.captions?.enabled ?? true,
        style: project.polish?.captions?.style || "clean",
        srtUrl: mediaUrlFor(srtPath),
        cues: outCues,
      },
      audio: {
        cleanup: method !== "off",
        method,
        noiseBeforeDb,
        noiseAfterDb,
        noiseReducedPct,
        cleanedUrl,
      },
      appliedAt: new Date().toISOString(),
    },
  };
}
