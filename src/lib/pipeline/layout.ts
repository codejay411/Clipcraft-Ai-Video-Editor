import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { TMP_DIR } from "../storage";
import { pythonBin } from "../python";
import type { LayoutRegion, SegmentLayout } from "../types";

const DETECT_SCRIPT = path.join(process.cwd(), "scripts", "py", "detect_layout.py");
const SAMPLE_INTERVAL = 2; // seconds between sampled frames
const MIN_REGION = 4; // seconds — shorter flips are treated as detection noise

interface LayoutSample {
  t: number;
  layout: SegmentLayout;
  score: number;
}

function runDetect(srcPath: string): Promise<LayoutSample[]> {
  return new Promise((resolve, reject) => {
    const resultFile = path.join(TMP_DIR, `layout_${Date.now()}.json`);
    const p = spawn(pythonBin(), [DETECT_SCRIPT, srcPath, String(SAMPLE_INTERVAL), resultFile], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr = (stderr + d.toString()).slice(-4000)));
    p.on("error", (e) => reject(new Error(`Python spawn failed: ${e.message}`)));
    p.on("close", (code) => {
      try {
        const parsed = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, "utf-8")) : null;
        if (code !== 0 || !parsed || parsed.error) {
          return reject(new Error(parsed?.error || `Layout detection failed (exit ${code}): ${stderr.slice(-300)}`));
        }
        resolve(parsed.samples as LayoutSample[]);
      } catch (e: any) {
        reject(new Error(`Failed reading layout result: ${e.message}`));
      } finally {
        try {
          if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
        } catch {
          /* ignore */
        }
      }
    });
  });
}

/** Turn per-frame samples into contiguous regions, absorbing short flickers. */
export function samplesToRegions(samples: LayoutSample[], duration: number): LayoutRegion[] {
  if (!samples.length) return [{ start: 0, end: duration, layout: "camera" }];

  // majority filter over a 3-sample window
  const smoothed = samples.map((s, i) => {
    const win = samples.slice(Math.max(0, i - 1), i + 2);
    const screens = win.filter((w) => w.layout === "screen").length;
    return { t: s.t, layout: (screens * 2 > win.length ? "screen" : "camera") as SegmentLayout };
  });

  const regions: LayoutRegion[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    const start = i === 0 ? 0 : (smoothed[i - 1].t + smoothed[i].t) / 2;
    const end = i === smoothed.length - 1 ? duration : (smoothed[i].t + smoothed[i + 1].t) / 2;
    const last = regions[regions.length - 1];
    if (last && last.layout === smoothed[i].layout) last.end = end;
    else regions.push({ start, end, layout: smoothed[i].layout });
  }

  // merge regions that are too short into their neighbour
  let changed = true;
  while (changed && regions.length > 1) {
    changed = false;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      if (r.end - r.start >= MIN_REGION) continue;
      const target = i > 0 ? regions[i - 1] : regions[i + 1];
      target.start = Math.min(target.start, r.start);
      target.end = Math.max(target.end, r.end);
      regions.splice(i, 1);
      // neighbours may now share a layout
      for (let k = regions.length - 1; k > 0; k--) {
        if (regions[k].layout === regions[k - 1].layout) {
          regions[k - 1].end = regions[k].end;
          regions.splice(k, 1);
        }
      }
      changed = true;
      break;
    }
  }
  return regions.map((r) => ({ ...r, start: +r.start.toFixed(2), end: +r.end.toFixed(2) }));
}

/**
 * Detect camera vs screen-recording spans. Never throws: if detection fails
 * (python/Pillow missing), the whole video is treated as camera, which is the
 * pre-existing behaviour.
 */
export async function detectLayoutRegions(
  srcPath: string,
  duration: number,
  mediaType: "video" | "audio"
): Promise<LayoutRegion[]> {
  if (mediaType !== "video") return [{ start: 0, end: duration, layout: "camera" }];
  try {
    const samples = await runDetect(srcPath);
    return samplesToRegions(samples, duration);
  } catch (e: any) {
    console.error("[layout] detection failed, assuming camera:", e?.message);
    return [{ start: 0, end: duration, layout: "camera" }];
  }
}

export function layoutAt(regions: LayoutRegion[] | undefined, t: number): SegmentLayout {
  if (!regions?.length) return "camera";
  const r = regions.find((x) => t >= x.start && t < x.end);
  return r ? r.layout : regions[regions.length - 1].layout;
}
