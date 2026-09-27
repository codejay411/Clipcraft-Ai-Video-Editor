import fs from "fs";
import path from "path";
import { runProc, ffprobeJson, buildSrt, probeColor, sdrConvertFilter, outputColorArgs, isHdr } from "../ffmpeg";
import { TMP_DIR, RENDERS_DIR, MUSIC_DIR, ensureDirs } from "../storage";
import { pythonBin } from "../python";
import { runVideoFfmpeg, videoEncodeArgs, hwDecodeArgs, activeEncoder, ENCODER_LABEL } from "../gpu";
import { buildOutputTimeline, buildCaptionCues, renderedKeeps, XFADE_DUR } from "./polish";
import type { ProjectDoc, TimelineSegment, SegmentLayout } from "../types";

const FPS = 30;

// landscape sizes; portrait/square outputs are derived in outputDims()
const RES_MAP: Record<string, { w: number; h: number }> = {
  "1080p": { w: 1920, h: 1080 },
  "720p": { w: 1280, h: 720 },
  "480p": { w: 854, h: 480 },
};

const CRF: Record<string, number> = { high: 20, medium: 23, compact: 27 };

const even = (n: number) => Math.round(n / 2) * 2;

export function outputDims(
  resolution: ProjectDoc["output"]["resolution"],
  aspect: ProjectDoc["output"]["aspectRatio"]
): { w: number; h: number } {
  const base = RES_MAP[resolution] || RES_MAP["1080p"];
  if (aspect === "9:16") return { w: even(base.h), h: even(base.w) };
  if (aspect === "1:1") return { w: even(base.h), h: even(base.h) };
  return { w: even(base.w), h: even(base.h) };
}

/**
 * Frame the source for the output shape:
 * - same shape: plain scale
 * - camera, output narrower than source (e.g. 16:9 -> 9:16): centre crop, the
 *   presenter is usually centred
 * - screen recordings (and camera into a wider frame): fit the whole picture
 *   over a blurred copy of itself — code is never cropped away
 */
function frameFilter(layout: SegmentLayout, srcW: number, srcH: number, w: number, h: number): string {
  const srcAspect = srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;
  const outAspect = w / h;
  const tail = `setsar=1,fps=${FPS},format=yuv420p`;
  if (Math.abs(srcAspect - outAspect) < 0.02) return `scale=${w}:${h},${tail}`;
  if (layout === "camera" && outAspect < srcAspect) {
    return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${tail}`;
  }
  return (
    `split[bg0][fg0];` +
    `[bg0]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=20:2[bg];` +
    `[fg0]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}`
  );
}

function absFromMediaUrl(url: string): string {
  // /api/media/renders/x.mp4 -> storage/renders/x.mp4
  const rel = url.replace(/^\/api\/media\//, "");
  return path.join(process.cwd(), "storage", rel);
}

// intermediate clips are re-encoded by the final pass, so keep them high quality
const CLIP_CRF = 18;

/** Run an encode step (GPU when available, CPU fallback) and fail loudly. */
async function encodeStep(label: string, build: Parameters<typeof runVideoFfmpeg>[0], timeoutMs: number) {
  const r = await runVideoFfmpeg(build, timeoutMs);
  if (r.code !== 0) throw new Error(`${label} failed: ${r.stderr.slice(-400)}`);
  return r;
}

// Colour context of one render: the HDR->SDR conversion for the source (null
// for SDR sources: no colour filter), the tags every encode carries, and the
// YUV matrix RGB b-roll must be converted with so it matches.
interface ColorPlan {
  convert: string | null;
  tags: string[];
  matrix: "bt709" | "bt601";
}
const ENCODE_A = ["-c:a", "aac", "-ar", "44100", "-ac", "2"];

async function cutSegmentClip(
  srcPath: string,
  cleanAudio: string | null,
  seg: TimelineSegment,
  outPath: string,
  vf: string,
  color: ColorPlan
): Promise<string> {
  const range = ["-ss", seg.start.toFixed(3), "-to", seg.end.toFixed(3)];
  await encodeStep(`Cutting segment ${seg.label}`, (enc) => [
      "-y",
      ...hwDecodeArgs(enc), // NVIDIA decodes the (often 10-bit HEVC) source
      ...range,
      "-i",
      srcPath,
      ...(cleanAudio ? [...range, "-i", cleanAudio] : []),
      "-vf",
      color.convert ? `${color.convert},${vf}` : vf,
      "-map",
      "0:v:0",
      "-map",
      cleanAudio ? "1:a:0" : "0:a:0",
      ...videoEncodeArgs(enc, CLIP_CRF),
      ...color.tags,
      ...ENCODE_A,
      outPath,
    ], 300000);
  return outPath;
}

async function makeKenBurnsClip(
  imagePath: string,
  duration: number,
  direction: "in" | "out",
  intensity: number,
  outPath: string,
  w: number,
  h: number,
  color: ColorPlan
): Promise<string> {
  const frames = Math.max(2, Math.round(duration * FPS));
  const zStart = direction === "in" ? 1.0 : intensity;
  const zEnd = direction === "in" ? intensity : 1.0;
  const zStep = (zEnd - zStart) / frames;
  // cover the output shape first so zoompan never stretches the image
  const bw = even(w * 1.6);
  const bh = even(h * 1.6);
  const filter = `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},zoompan=z='${zStart.toFixed(4)}+${zStep.toFixed(6)}*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${FPS},setsar=1,scale=out_color_matrix=${color.matrix}:out_range=tv,format=yuv420p`;
  await encodeStep("Ken Burns clip", (enc) =>
    ["-y", "-loop", "1", "-i", imagePath, "-t", duration.toFixed(3), "-vf", filter, ...videoEncodeArgs(enc, CLIP_CRF), ...color.tags, "-r", String(FPS), outPath],
    180000
  );
  return outPath;
}

async function overlayVisualOnClip(
  baseClip: string,
  visualPath: string,
  outPath: string,
  w: number,
  h: number,
  isVideo: boolean,
  color: ColorPlan
): Promise<string> {
  // b-roll covers the whole frame (cropped to fit); audio from base clip
  const inputArgs = isVideo ? ["-i", visualPath] : ["-loop", "1", "-t", "3600", "-i", visualPath];
  await encodeStep("B-roll overlay", (enc) => [
      "-y",
      "-i",
      baseClip,
      ...inputArgs,
      "-filter_complex",
      `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase:out_color_matrix=${color.matrix}:out_range=tv,crop=${w}:${h},setsar=1,fps=${FPS}[v1];[0:v][v1]overlay=0:0:shortest=1:format=auto,format=yuv420p[outv]`,
      "-map",
      "[outv]",
      "-map",
      "0:a?",
      ...videoEncodeArgs(enc, CLIP_CRF),
      ...color.tags,
      ...ENCODE_A,
      outPath,
    ], 240000);
  return outPath;
}

async function videoDuration(file: string, fallback: number): Promise<number> {
  try {
    const info = await ffprobeJson(file);
    const v = (info.streams || []).find((s: any) => s.codec_type === "video");
    const d = parseFloat(v?.duration || info.format?.duration || "");
    return Number.isFinite(d) && d > 0 ? d : fallback;
  } catch {
    return fallback;
  }
}

/** make_music.py renders the bundled tracks; generate them on first use */
async function ensureMusicTrack(name: string): Promise<string | null> {
  const musicPath = path.join(MUSIC_DIR, `${name}.wav`);
  if (fs.existsSync(musicPath)) return musicPath;
  try {
    const script = path.join(process.cwd(), "scripts", "py", "make_music.py");
    const r = await runProc(pythonBin(), [script, MUSIC_DIR], 300000);
    if (r.code !== 0) console.error("[assemble] make_music.py failed:", r.stderr.slice(-300));
  } catch (e: any) {
    console.error("[assemble] music generation failed:", e?.message);
  }
  return fs.existsSync(musicPath) ? musicPath : null;
}

function captionStyle(aspect: ProjectDoc["output"]["aspectRatio"]): string {
  // sizes are in libass script units (video height = 288), so portrait
  // output needs a smaller number to fit the narrow frame
  const size = aspect === "9:16" ? 10 : aspect === "1:1" ? 13 : 16;
  const marginV = aspect === "9:16" ? 60 : 42;
  // Nirmala UI (Windows) / Noto Sans (Linux) also cover Devanagari for Hindi captions
  const font = process.platform === "win32" ? "Nirmala UI" : process.platform === "darwin" ? "Kohinoor Devanagari" : "Noto Sans";
  return `FontName=${font},FontSize=${size},PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=${marginV},Alignment=2`;
}

interface JoinOptions {
  clips: { path: string; duration: number }[];
  crossfades: boolean[]; // crossfades[i]: fade INTO clip i
  denoise: boolean;
  music: { path: string; volume: number } | null;
  subtitles: { file: string; style: string } | null; // file relative to cwd
  crf: number;
  outPath: string;
  cwd: string;
  colorTags: string[];
}

/**
 * Join every clip, apply audio treatment, mix music and burn captions.
 * Video and audio run as two ffmpeg processes IN PARALLEL, then are muxed
 * without re-encoding: in one combined filter graph the slow audio chain
 * (loudnorm) and the video chain ran serially — measured 34% slower.
 */
async function joinAndFinish(o: JoinOptions): Promise<void> {
  const n = o.clips.length;
  const clipInputs: string[] = [];
  for (const c of o.clips) clipInputs.push("-i", c.path);

  // ---- video: trim to exact clip lengths, cut/crossfade, captions ----
  const vparts: string[] = [];
  o.clips.forEach((c, i) => {
    vparts.push(`[${i}:v]fps=${FPS},format=yuv420p,setsar=1,trim=duration=${c.duration.toFixed(3)},setpts=PTS-STARTPTS,settb=AVTB[v${i}]`);
  });
  let cv = "v0";
  let length = o.clips[0].duration;
  for (let i = 1; i < n; i++) {
    if (o.crossfades[i]) {
      const offset = Math.max(0, length - XFADE_DUR);
      vparts.push(`[${cv}][v${i}]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(3)},settb=AVTB[cv${i}]`);
      length += o.clips[i].duration - XFADE_DUR;
    } else {
      vparts.push(`[${cv}][v${i}]concat=n=2:v=1:a=0,settb=AVTB[cv${i}]`);
      length += o.clips[i].duration;
    }
    cv = `cv${i}`;
  }
  vparts.push(
    o.subtitles
      ? `[${cv}]subtitles=${o.subtitles.file}:force_style='${o.subtitles.style}'[vout]`
      : `[${cv}]null[vout]`
  );

  // ---- audio: same cuts/crossfades, cleanup, music, loudness ----
  const aparts: string[] = [];
  o.clips.forEach((c, i) => {
    // pad/trim audio to the exact video length so A/V never drift apart
    aparts.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${c.duration.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
  });
  let ca = "a0";
  for (let i = 1; i < n; i++) {
    aparts.push(
      o.crossfades[i]
        ? `[${ca}][a${i}]acrossfade=d=${XFADE_DUR}[ca${i}]`
        : `[${ca}][a${i}]concat=n=2:v=0:a=1[ca${i}]`
    );
    ca = `ca${i}`;
  }
  let speech = ca;
  if (o.denoise) {
    aparts.push(`[${ca}]afftdn=nf=-28[speech]`);
    speech = "speech";
  }
  const audioInputs = [...clipInputs];
  if (o.music) {
    audioInputs.push("-stream_loop", "-1", "-i", o.music.path);
    aparts.push(`[${n}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${o.music.volume.toFixed(2)}[mus]`);
    aparts.push(`[${speech}][mus]amix=inputs=2:duration=first:dropout_transition=3[mixed]`);
    speech = "mixed";
  }
  // loudness normalise last (loudnorm resamples internally, so resample back)
  aparts.push(`[${speech}]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[aout]`);

  const videoOut = path.join(o.cwd, "joined_video.mp4");
  const audioOut = path.join(o.cwd, "joined_audio.m4a");
  const timeout = Math.max(600000, Math.round(length * 20000));
  const [rv, ra] = await Promise.all([
    runVideoFfmpeg(
      (enc) => ["-y", ...clipInputs, "-filter_complex", vparts.join(";"), "-map", "[vout]", ...videoEncodeArgs(enc, o.crf), ...o.colorTags, "-an", videoOut],
      timeout,
      { cwd: o.cwd } // captions file is referenced relative to the work dir
    ),
    runProc(
      "ffmpeg",
      ["-y", ...audioInputs, "-filter_complex", aparts.join(";"), "-map", "[aout]", "-c:a", "aac", "-b:a", "160k", audioOut],
      timeout
    ),
  ]);
  if (rv.code !== 0 || !fs.existsSync(videoOut)) throw new Error(`Final render (video) failed: ${rv.stderr.slice(-600)}`);
  if (ra.code !== 0 || !fs.existsSync(audioOut)) throw new Error(`Final render (audio) failed: ${ra.stderr.slice(-600)}`);

  const rm = await runProc(
    "ffmpeg",
    ["-y", "-i", videoOut, "-i", audioOut, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest", "-movflags", "+faststart", o.outPath],
    120000
  );
  if (rm.code !== 0 || !fs.existsSync(o.outPath)) throw new Error(`Final mux failed: ${rm.stderr.slice(-400)}`);
}

async function toGif(src: string, out: string, duration: number, workDir: string): Promise<void> {
  // whole video; shrink frame rate and size as it gets longer to keep files sane
  const [fps, size] = duration <= 15 ? [12, 640] : duration <= 60 ? [10, 480] : [8, 360];
  const palette = path.join(workDir, "palette.png");
  // size caps the LONGER side, so portrait GIFs aren't twice as heavy
  const vf = `fps=${fps},scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos`;
  await runProc("ffmpeg", ["-y", "-i", src, "-vf", `${vf},palettegen`, palette], 300000);
  const r = await runProc(
    "ffmpeg",
    ["-y", "-i", src, "-i", palette, "-lavfi", `${vf}[x];[x][1:v]paletteuse`, out],
    Math.max(300000, Math.round(duration * 10000))
  );
  if (r.code !== 0) throw new Error(`GIF export failed: ${r.stderr.slice(-300)}`);
}

export async function runAssembly(
  project: ProjectDoc,
  report: (p: number, stage: string) => Promise<void>
): Promise<{ outputPath: string; highlights: ProjectDoc["highlights"] }> {
  const srcPath = project.source.filepath;
  const out = project.output || ({} as ProjectDoc["output"]);
  const { w, h } = outputDims(out.resolution || "1080p", out.aspectRatio || "16:9");
  const segs = renderedKeeps(project.segments);
  if (!segs.length) throw new Error("No keep segments to assemble");

  // Unique per render: a second render must never delete this one's clips or
  // write into the same output file (that produced corrupt, unplayable MP4s).
  const renderId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const workDir = path.join(TMP_DIR, `assembly_${project._id}_${renderId}`);
  fs.mkdirSync(workDir, { recursive: true });
  const outStem = `final_${project._id}_${renderId}`;
  ensureDirs();

  // Polish already produced a denoised copy of the full source audio; cut from
  // it instead of denoising the render a second time.
  const srcColor = await probeColor(srcPath);
  const color: ColorPlan = {
    convert: sdrConvertFilter(srcColor),
    tags: outputColorArgs(srcColor),
    matrix: !isHdr(srcColor) && (srcColor.space === "smpte170m" || srcColor.space === "bt470bg") ? "bt601" : "bt709",
  };
  if (color.convert) console.log(`[assemble] HDR source (${srcColor.transfer}) — converting to BT.709 SDR`);
  const encoder = await activeEncoder();
  await report(5, `Rendering with ${ENCODER_LABEL[encoder]}...`);

  const audioOff = project.polish?.audio?.method === "off";
  const cleanedAbs = project.polish?.audio?.cleanedUrl ? absFromMediaUrl(project.polish.audio.cleanedUrl) : null;
  const cleanAudio = !audioOff && cleanedAbs && fs.existsSync(cleanedAbs) ? cleanedAbs : null;

  const perClip = 62 / segs.length; // progress budget for clip building

  // 1. Build per-segment clips (with visuals where assigned)
  const clips: { path: string; duration: number }[] = [];
  const durations = new Map<string, number>();
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const layout: SegmentLayout = seg.layout || "camera";
    await report(8 + i * perClip, `Processing segment ${i + 1}/${segs.length}: ${seg.label}...`);
    let clipPath = path.join(workDir, `seg_${String(i).padStart(3, "0")}.mp4`);
    if (project.source.mediaType === "audio") {
      // generate a base clip from a solid color + audio
      await encodeStep("Audio-only base clip", (enc) => [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=#1a1a2e:s=${w}x${h}:r=${FPS}`,
          "-ss",
          seg.start.toFixed(3),
          "-to",
          seg.end.toFixed(3),
          "-i",
          cleanAudio || srcPath,
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-t",
          seg.duration.toFixed(3),
          ...videoEncodeArgs(enc, CLIP_CRF),
          ...color.tags,
          ...ENCODE_A,
          clipPath,
        ], 180000);
    } else {
      const vf = frameFilter(layout, project.source.width, project.source.height, w, h);
      await cutSegmentClip(srcPath, cleanAudio, seg, clipPath, vf, color);
    }

    // overlay visual if assigned — never over a screen recording (it would hide the code)
    if (seg.visual?.url && layout === "screen") {
      console.warn(`[assemble] skipping b-roll on screen segment ${seg.id} to keep code visible`);
    } else if (seg.visual?.url) {
      try {
        const visualAbs = absFromMediaUrl(seg.visual.url);
        if (fs.existsSync(visualAbs)) {
          const vOut = path.join(workDir, `segvis_${String(i).padStart(3, "0")}.mp4`);
          if (seg.visual.kind === "stock_video") {
            await overlayVisualOnClip(clipPath, visualAbs, vOut, w, h, true, color);
          } else if (seg.visual.kenBurns?.enabled) {
            const kb = seg.visual.kenBurns;
            const kbClip = path.join(workDir, `kb_${String(i).padStart(3, "0")}.mp4`);
            const aDur = await videoDuration(clipPath, seg.duration);
            await makeKenBurnsClip(visualAbs, aDur, kb.direction || "in", kb.intensity || 1.15, kbClip, w, h, color);
            // ken burns picture with the segment's audio
            await runProc(
              "ffmpeg",
              ["-y", "-i", kbClip, "-i", clipPath, "-map", "0:v", "-map", "1:a?", "-t", aDur.toFixed(3), "-c:v", "copy", ...ENCODE_A, vOut],
              180000
            );
          } else {
            await overlayVisualOnClip(clipPath, visualAbs, vOut, w, h, false, color);
          }
          clipPath = vOut;
        }
      } catch (e: any) {
        console.error(`[assemble] visual overlay failed for seg ${i}:`, e?.message);
        // keep talking-head clip on failure
      }
    }

    const duration = await videoDuration(clipPath, seg.duration);
    durations.set(seg.id, duration);
    clips.push({ path: clipPath, duration });
  }

  // 2. Timeline from the REAL clip lengths, so captions match the render exactly
  const { entries } = buildOutputTimeline(project.segments, durations);
  const crossfades = entries.map((e) => e.transitionIn === "crossfade");

  let subtitles: JoinOptions["subtitles"] = null;
  if (out.burnSubtitles !== false && project.polish?.captions?.enabled !== false) {
    const cues = buildCaptionCues(project.segments, entries);
    if (cues.length) {
      // relative name + cwd=workDir avoids escaping Windows drive letters in the filter
      fs.writeFileSync(path.join(workDir, "captions.srt"), buildSrt(cues), "utf-8");
      subtitles = { file: "captions.srt", style: captionStyle(out.aspectRatio || "16:9") };
    }
  }

  let music: JoinOptions["music"] = null;
  if (out.music) {
    await report(72, "Preparing background music...");
    const musicPath = await ensureMusicTrack(out.musicTrack || "inspirational");
    if (musicPath) music = { path: musicPath, volume: (Math.max(0, Math.min(100, out.musicVolume ?? 60)) / 100) * 0.5 };
  }

  // 3. One pass: join + transitions + audio cleanup/loudness + music + captions
  await report(75, "Rendering final video (joining, audio, captions)...");
  const fmt = out.format || "mp4";
  const finalMp4 = path.join(RENDERS_DIR, `${outStem}.mp4`);
  const crf = (CRF[out.quality] ?? 20) + (out.optimizeSize ? 3 : 0);
  const join: JoinOptions = {
    clips,
    crossfades,
    denoise: !cleanAudio && !audioOff,
    music,
    subtitles,
    crf,
    outPath: finalMp4,
    cwd: workDir,
    colorTags: color.tags,
  };
  try {
    await joinAndFinish(join);
  } catch (e: any) {
    if (!subtitles) throw e;
    // most common cause: ffmpeg built without libass; still deliver the video
    console.error("[assemble] render with captions failed, retrying without:", e?.message);
    await report(85, "Captions failed — rendering without burned-in captions...");
    await joinAndFinish({ ...join, subtitles: null });
    subtitles = null;
  }

  // 4. Final container
  await report(94, "Finalizing...");
  const totalDuration = await videoDuration(finalMp4, 0);
  let outputPath = finalMp4;
  if (fmt === "gif") {
    outputPath = path.join(RENDERS_DIR, `${outStem}.gif`);
    await report(95, "Converting to GIF...");
    await toGif(finalMp4, outputPath, totalDuration, workDir);
  } else if (fmt === "mov") {
    outputPath = path.join(RENDERS_DIR, `${outStem}.mov`);
    await runProc("ffmpeg", ["-y", "-i", finalMp4, "-c", "copy", "-f", "mov", outputPath], 120000);
  }

  const originalDuration = project.source.duration;
  const fillersRemoved = project.segments.filter((s) => s.type === "cut").length;
  const silencesRemoved = project.segments.filter((s) => s.type === "silence").length;
  const visualsAdded = segs.filter((s) => s.visual?.url && s.layout !== "screen").length;
  const transitionsAdded = crossfades.filter(Boolean).length;

  // cleanup workdir and this project's previous renders (best effort: a
  // browser may still be streaming an old file, which Windows won't delete)
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  for (const f of fs.readdirSync(RENDERS_DIR)) {
    if (f.startsWith(`final_${project._id}`) && !f.startsWith(outStem)) {
      try {
        fs.unlinkSync(path.join(RENDERS_DIR, f));
      } catch {
        /* in use — removed on a later render */
      }
    }
  }

  await report(100, "Assembly complete");
  return {
    outputPath,
    highlights: {
      totalDuration: +totalDuration.toFixed(1),
      originalDuration: +originalDuration.toFixed(1),
      timeSavedPct:
        originalDuration > 0
          ? Math.max(0, Math.round((1 - totalDuration / originalDuration) * 100))
          : 0,
      fillersRemoved,
      silencesRemoved,
      visualsAdded,
      transitionsAdded,
      captionsEnabled: !!subtitles,
    },
  };
}
