import fs from "fs";
import path from "path";
import crypto from "crypto";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
export const SAMPLES_DIR = path.join(STORAGE_ROOT, "samples");
export const VISUALS_DIR = path.join(STORAGE_ROOT, "visuals");
export const RENDERS_DIR = path.join(STORAGE_ROOT, "renders");
export const TMP_DIR = path.join(STORAGE_ROOT, "tmp");
export const MUSIC_DIR = path.join(STORAGE_ROOT, "music");

export function ensureDirs() {
  for (const dir of [STORAGE_ROOT, UPLOADS_DIR, SAMPLES_DIR, VISUALS_DIR, RENDERS_DIR, TMP_DIR, MUSIC_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export function mediaUrlFor(absPath: string): string {
  const rel = path.relative(STORAGE_ROOT, absPath).split(path.sep).join("/");
  return `/api/media/${rel}`;
}

export function safeResolveMedia(relPath: string): string | null {
  const abs = path.resolve(STORAGE_ROOT, relPath);
  if (!abs.startsWith(STORAGE_ROOT)) return null;
  if (!fs.existsSync(abs)) return null;
  return abs;
}

export function uniqueFilename(original: string): string {
  const ext = path.extname(original) || "";
  const base = path
    .basename(original, ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40);
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString("hex");
  return `${base || "file"}_${stamp}${rand}${ext}`;
}

export function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtTimecode(seconds: number, withMs = false): string {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const base = `${h > 0 ? String(h).padStart(2, "0") + ":" : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return withMs ? `${base}.${String(ms).padStart(3, "0")}` : base;
}
