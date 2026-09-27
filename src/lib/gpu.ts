// GPU acceleration for rendering: hardware H.264 encoding (NVIDIA NVENC or
// Intel Quick Sync) and NVIDIA hardware decoding, with automatic fallback to
// the CPU (libx264). Detection runs a tiny real encode once per server
// process, because an encoder being compiled into ffmpeg doesn't mean the
// machine has the GPU/driver for it.
//
// Colour conversion (HDR -> SDR) intentionally stays on the CPU (zscale):
// the GPU paths tested (OpenCL tonemap, Vulkan libplacebo) either shifted skin
// tones or were slower because of frame copies.
import { runProc } from "./ffmpeg";

export type VideoEncoder = "nvenc" | "qsv" | "cpu";

const PREFERENCES = ["auto", "nvenc", "qsv", "cpu"] as const;
type Preference = (typeof PREFERENCES)[number];

const ENCODER_NAME: Record<VideoEncoder, string> = { nvenc: "h264_nvenc", qsv: "h264_qsv", cpu: "libx264" };
export const ENCODER_LABEL: Record<VideoEncoder, string> = {
  nvenc: "NVIDIA GPU (NVENC) + CUDA decode",
  qsv: "Intel GPU (Quick Sync)",
  cpu: "CPU (libx264)",
};

// shared across separately bundled route modules
const g = globalThis as unknown as { __ccEncoder?: Promise<VideoEncoder>; __ccGpuBroken?: boolean };

export function encoderPreference(): Preference {
  const v = process.env.VIDEO_ENCODER?.trim().toLowerCase();
  return (PREFERENCES as readonly string[]).includes(v || "") ? (v as Preference) : "auto";
}

async function encoderWorks(enc: VideoEncoder): Promise<boolean> {
  try {
    const r = await runProc(
      "ffmpeg",
      ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30", "-t", "0.5", "-c:v", ENCODER_NAME[enc], "-pix_fmt", "yuv420p", "-f", "null", "-"],
      20000
    );
    return r.code === 0;
  } catch {
    return false;
  }
}

async function detect(): Promise<VideoEncoder> {
  const pref = encoderPreference();
  if (pref === "cpu") return "cpu";
  const order: VideoEncoder[] = pref === "auto" ? ["nvenc", "qsv"] : [pref];
  for (const enc of order) {
    if (await encoderWorks(enc)) {
      console.log(`[gpu] video encoding: ${ENCODER_LABEL[enc]}`);
      return enc;
    }
    if (pref !== "auto") console.warn(`[gpu] VIDEO_ENCODER=${pref} is not usable on this machine — using CPU`);
  }
  console.log("[gpu] no usable GPU encoder — using CPU (libx264)");
  return "cpu";
}

/** The encoder renders should use (detected once, cached). */
export async function activeEncoder(): Promise<VideoEncoder> {
  if (g.__ccGpuBroken) return "cpu";
  g.__ccEncoder ??= detect();
  return g.__ccEncoder;
}

/**
 * H.264 encode args at a given quality. `crf` is on the x264 scale; the GPU
 * encoders' constant-quality values are offset to land at similar quality.
 * NVENC tuning measured on real footage vs x264 crf20 (SSIM 0.9752, 7 Mbps):
 * cq=crf+4 with spatial AQ + B-frames gives SSIM 0.9778 at 10 Mbps, 2x faster.
 */
export function videoEncodeArgs(enc: VideoEncoder, crf: number): string[] {
  if (enc === "nvenc") {
    return [
      "-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", String(crf + 4), "-b:v", "0",
      "-spatial-aq", "1", "-bf", "3", "-pix_fmt", "yuv420p",
    ];
  }
  if (enc === "qsv") {
    return ["-c:v", "h264_qsv", "-preset", "medium", "-global_quality", String(crf + 2), "-pix_fmt", "nv12"];
  }
  return ["-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-pix_fmt", "yuv420p"];
}

/** Input args for hardware decoding (NVIDIA only; frames return to system memory for our CPU filters). */
export function hwDecodeArgs(enc: VideoEncoder): string[] {
  return enc === "nvenc" ? ["-hwaccel", "cuda"] : [];
}

/**
 * Run an ffmpeg command built for the active encoder; if a GPU run fails,
 * retry the same step on the CPU and stop using the GPU for this process.
 */
export async function runVideoFfmpeg(
  build: (enc: VideoEncoder) => string[],
  timeoutMs: number,
  opts: { cwd?: string } = {}
): Promise<{ code: number; stdout: string; stderr: string; encoder: VideoEncoder }> {
  const enc = await activeEncoder();
  const r = await runProc("ffmpeg", build(enc), timeoutMs, opts);
  if (r.code === 0 || enc === "cpu") return { ...r, encoder: enc };
  console.warn(`[gpu] ${ENCODER_LABEL[enc]} failed, retrying on CPU: ${r.stderr.slice(-300)}`);
  const r2 = await runProc("ffmpeg", build("cpu"), timeoutMs, opts);
  // only blame the GPU if the CPU succeeded (a bad input fails both ways)
  if (r2.code === 0) g.__ccGpuBroken = true;
  return { ...r2, encoder: "cpu" };
}
