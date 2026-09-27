import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  mimeType: string;
  hasAudio: boolean;
  hasVideo: boolean;
}

function run(
  cmd: string,
  args: string[],
  timeoutMs = 240000,
  opts: { cwd?: string } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd: opts.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (process.env.CC_PROFILE) {
        // CC_PROFILE=1 logs every external command's duration, to find slow steps
        const what = args.find((a) => /filter_complex|^-vf$/.test(a)) ? args[args.indexOf("-vf") + 1] || "filter_complex" : args.slice(0, 6).join(" ");
        console.log(`[profile] ${((Date.now() - started) / 1000).toFixed(1)}s ${cmd} ${String(what).slice(0, 90)}`);
      }
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export async function ffprobeJson(file: string): Promise<any> {
  const { code, stdout, stderr } = await run("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  if (code !== 0) throw new Error(`ffprobe failed: ${stderr.slice(0, 400)}`);
  return JSON.parse(stdout);
}

export async function probeMedia(file: string): Promise<ProbeResult> {
  const j = await ffprobeJson(file);
  const v = (j.streams || []).find((s: any) => s.codec_type === "video");
  const a = (j.streams || []).find((s: any) => s.codec_type === "audio");
  // phone videos store portrait footage as landscape + a rotation flag;
  // ffmpeg auto-rotates on decode, so report the displayed size
  const rotation = Math.abs(
    parseFloat(
      v?.tags?.rotate ??
        (v?.side_data_list || []).find((d: any) => d.rotation !== undefined)?.rotation ??
        "0"
    ) || 0
  ) % 180;
  const ext = path.extname(file).toLowerCase();
  const audioMime: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
  };
  const videoMime: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
  };
  return {
    duration: parseFloat(j.format?.duration || "0") || 0,
    width: v ? parseInt(rotation === 90 ? v.height : v.width || "0") : 0,
    height: v ? parseInt(rotation === 90 ? v.width : v.height || "0") : 0,
    mimeType: (v ? videoMime[ext] : audioMime[ext]) || "application/octet-stream",
    hasAudio: !!a,
    hasVideo: !!v,
  };
}

// ---- colour handling ------------------------------------------------------
// Phones (iPhone especially) record HDR: 10-bit BT.2020 with an HLG or PQ
// transfer. Our output is standard 8-bit H.264 (BT.709). Feeding HDR pixels
// through unchanged and untagged makes every player show them washed out
// and colour-shifted, so HDR is converted to BT.709 once, at decode.
// SDR sources get NO colour filter at all; their colour tags are copied to
// the output so players interpret the pixels exactly as the original.

export interface ColorInfo {
  transfer?: string;
  primaries?: string;
  space?: string;
  range?: string;
}

const colorCache = new Map<string, ColorInfo>();

export async function probeColor(file: string): Promise<ColorInfo> {
  const cached = colorCache.get(file);
  if (cached) return cached;
  let info: ColorInfo = {};
  try {
    const j = await ffprobeJson(file);
    const v = (j.streams || []).find((s: any) => s.codec_type === "video");
    const tag = (x: unknown) => (typeof x === "string" && x !== "unknown" && x !== "reserved" ? x : undefined);
    info = {
      transfer: tag(v?.color_transfer),
      primaries: tag(v?.color_primaries),
      space: tag(v?.color_space),
      range: tag(v?.color_range),
    };
  } catch {
    /* unknown colour: treated as SDR, no conversion */
  }
  colorCache.set(file, info);
  return info;
}

export function isHdr(c: ColorInfo): boolean {
  return c.transfer === "arib-std-b67" || c.transfer === "smpte2084";
}

/** Filter that converts HDR to BT.709 SDR, or null when no conversion is needed. */
export function sdrConvertFilter(c: ColorInfo): string | null {
  const rin = c.range === "pc" ? "full" : "limited";
  if (c.transfer === "arib-std-b67") {
    // HLG is designed to display correctly on SDR after a direct transfer +
    // primaries conversion; tested against tone-mapping, this keeps skin tones
    // and brightness closest to how the phone shows the clip
    return `zscale=tin=arib-std-b67:pin=bt2020:min=bt2020nc:rin=${rin}:t=bt709:p=bt709:m=bt709:r=limited:npl=203`;
  }
  if (c.transfer === "smpte2084") {
    // PQ / HDR10 has absolute brightness far above SDR, so it needs tone mapping
    return `zscale=tin=smpte2084:pin=bt2020:min=bt2020nc:rin=${rin}:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=limited`;
  }
  return null;
}

/** Colour tags for an encode of this source: BT.709 after HDR conversion, else the source's own tags. */
export function outputColorArgs(c: ColorInfo): string[] {
  if (isHdr(c)) {
    return ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
  }
  const args: string[] = [];
  if (c.space) args.push("-colorspace", c.space);
  if (c.primaries) args.push("-color_primaries", c.primaries);
  if (c.transfer) args.push("-color_trc", c.transfer);
  if (c.range) args.push("-color_range", c.range);
  return args;
}

/** Prefix `filters` with the HDR->SDR conversion this file needs (if any). */
export async function withSdr(file: string, filters: string): Promise<string> {
  const conv = sdrConvertFilter(await probeColor(file));
  return conv ? `${conv},${filters}` : filters;
}

export async function extractThumbnail(
  file: string,
  outPath: string,
  atSecond = 1
): Promise<string | null> {
  try {
    const vf = await withSdr(file, "scale=640:-2");
    const { code } = await run(
      "ffmpeg",
      ["-y", "-ss", String(Math.max(0, atSecond)), "-i", file, "-frames:v", "1", "-vf", vf, outPath],
      60000
    );
    if (code === 0 && fs.existsSync(outPath)) return outPath;
    // fallback: try at 0
    const r2 = await run("ffmpeg", ["-y", "-i", file, "-frames:v", "1", "-vf", vf, outPath], 60000);
    return r2.code === 0 && fs.existsSync(outPath) ? outPath : null;
  } catch {
    return null;
  }
}

export async function extractAudio(file: string, outPath: string): Promise<string> {
  const { code, stderr } = await run(
    "ffmpeg",
    ["-y", "-i", file, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outPath],
    180000
  );
  if (code !== 0) throw new Error(`Audio extraction failed: ${stderr.slice(0, 300)}`);
  return outPath;
}

export async function detectSilences(
  audioFile: string,
  noiseDb = -35,
  minDur = 1.2
): Promise<{ start: number; end: number; duration: number }[]> {
  const { stderr } = await run("ffmpeg", [
    "-i",
    audioFile,
    "-af",
    `silencedetect=noise=${noiseDb}dB:d=${minDur}`,
    "-f",
    "null",
    "-",
  ]);
  const silences: { start: number; end: number; duration: number }[] = [];
  const startRe = /silence_start:\s*([\d.]+)/g;
  const endRe = /silence_end:\s*([\d.]+)\s*.*silence_duration:\s*([\d.]+)/g;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(stderr))) starts.push(parseFloat(m[1]));
  const ends: { end: number; dur: number }[] = [];
  while ((m = endRe.exec(stderr))) ends.push({ end: parseFloat(m[1]), dur: parseFloat(m[2]) });
  const n = Math.min(starts.length, ends.length);
  for (let i = 0; i < n; i++) {
    const start = starts[i];
    const end = ends[i]?.end ?? start + ends[i]?.dur;
    const duration = ends[i]?.dur ?? end - start;
    silences.push({ start, end, duration });
  }
  return silences;
}

export async function detectScenes(file: string, threshold = 0.3): Promise<number[]> {
  // returns scene-change timestamps in seconds using ffmpeg scene filter
  const { stderr } = await run("ffmpeg", ["-i", file, "-filter:v", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"], 240000);
  const times: number[] = [];
  const re = /pts_time:([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) times.push(parseFloat(m[1]));
  return times;
}

export async function measureNoiseFloor(audioFile: string, seconds = 30): Promise<number> {
  // measure RMS level (lower = quieter noise). Returns dB.
  const { stdout } = await run("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    audioFile,
  ]);
  let dur = 30;
  try {
    dur = Math.min(seconds, parseFloat(JSON.parse(stdout)?.format?.duration || "30"));
  } catch {
    /* keep default */
  }
  const { stderr } = await run("ffmpeg", [
    "-t",
    String(Math.max(1, dur)),
    "-i",
    audioFile,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const m = /mean_volume:\s*(-?[\d.]+)\s*dB/.exec(stderr);
  return m ? parseFloat(m[1]) : -50;
}

export function buildSrt(
  cues: { start: number; end: number; text: string }[]
): string {
  function ts(t: number) {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const ms = Math.round((t - Math.floor(t)) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }
  return cues
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`)
    .join("\n");
}

export { run as runProc };
