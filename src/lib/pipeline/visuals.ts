import fs from "fs";
import path from "path";
import { getSettings } from "../llm";
import { VISUALS_DIR, mediaUrlFor, ensureDirs } from "../storage";
import { newId } from "../mongo";
import type { VisualAsset } from "../types";

export interface StockResult {
  id: string;
  kind: "stock_video" | "stock_image";
  source: "pexels" | "pixabay" | "web";
  title: string;
  thumbUrl: string; // remote preview
  previewUrl?: string;
  duration?: number;
  author?: string;
  downloadUrl: string; // direct file to download
  width?: number;
  height?: number;
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Request failed ${res.status}: ${url.slice(0, 120)}`);
  return res.json();
}

async function searchPexels(query: string, perPage: number): Promise<StockResult[]> {
  const settings = await getSettings();
  const key = settings.keys.pexels;
  if (!key) return [];
  const results: StockResult[] = [];
  try {
    const v = await fetchJson(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&size=medium`,
      { Authorization: key }
    );
    for (const item of v.videos || []) {
      const files = (item.video_files || [])
        .filter((f: any) => f.file_type === "video/mp4")
        .sort((a: any, b: any) => (a.width || 0) - (b.width || 0));
      const chosen =
        files.find((f: any) => (f.width || 0) >= 1280) ||
        files.find((f: any) => (f.width || 0) >= 960) ||
        files[files.length - 1];
      if (!chosen) continue;
      results.push({
        id: `pexels-v-${item.id}`,
        kind: "stock_video",
        source: "pexels",
        title: item.user?.name ? `Video by ${item.user.name}` : "Stock video",
        thumbUrl: item.image,
        duration: item.duration,
        author: item.user?.name,
        downloadUrl: chosen.link,
        width: chosen.width,
        height: chosen.height,
      });
    }
  } catch (e: any) {
    console.error("[pexels videos]", e?.message);
  }
  try {
    const p = await fetchJson(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
      { Authorization: key }
    );
    for (const item of p.photos || []) {
      results.push({
        id: `pexels-p-${item.id}`,
        kind: "stock_image",
        source: "pexels",
        title: item.alt || `Photo by ${item.photographer}`,
        thumbUrl: item.src?.medium,
        previewUrl: item.src?.large2x,
        author: item.photographer,
        downloadUrl: item.src?.large2x || item.src?.original,
        width: item.width,
        height: item.height,
      });
    }
  } catch (e: any) {
    console.error("[pexels photos]", e?.message);
  }
  return results;
}

async function searchPixabay(query: string, perPage: number): Promise<StockResult[]> {
  const settings = await getSettings();
  const key = settings.keys.pixabay;
  if (!key) return [];
  const results: StockResult[] = [];
  try {
    const v = await fetchJson(
      `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=${Math.min(
        perPage,
        20
      )}&video_type=film`
    );
    for (const item of v.hits || []) {
      const variants = item.videos?.large || item.videos?.medium || item.videos?.small;
      if (!variants) continue;
      results.push({
        id: `pixabay-v-${item.id}`,
        kind: "stock_video",
        source: "pixabay",
        title: item.tags?.split(",")[0] || "Stock video",
        thumbUrl: item.picture_id
          ? `https://i.vimeocdn.com/video/${item.picture_id}_640x360.jpg`
          : item.videos?.small?.thumbnail,
        duration: item.duration,
        author: item.user,
        downloadUrl: variants.url,
        width: variants.width,
        height: variants.height,
      });
    }
  } catch (e: any) {
    console.error("[pixabay videos]", e?.message);
  }
  try {
    const p = await fetchJson(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=${Math.min(
        perPage,
        20
      )}&image_type=photo&orientation=horizontal&safesearch=true`
    );
    for (const item of p.hits || []) {
      results.push({
        id: `pixabay-p-${item.id}`,
        kind: "stock_image",
        source: "pixabay",
        title: item.tags?.split(",")[0] || "Stock photo",
        thumbUrl: item.webformatURL,
        author: item.user,
        downloadUrl: item.largeImageURL,
        width: item.imageWidth,
        height: item.imageHeight,
      });
    }
  } catch (e: any) {
    console.error("[pixabay photos]", e?.message);
  }
  return results;
}

interface WebSearchItem {
  original_url?: string;
  oss_url?: string;
  image_url?: string;
  url?: string;
  caption?: string;
}

export async function searchWebImages(query: string, count: number): Promise<StockResult[]> {
  // zero-config fallback using the Openverse API (free, no key, CC-licensed images)
  const per = Math.min(Math.max(count, 1), 12);
  try {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${per}&mature=false`,
      { headers: { "User-Agent": "ClipCraftAI/1.0 (open-source video editor)" }, signal: AbortSignal.timeout(20000) }
    );
    if (res.ok) {
      const j = await res.json();
      const items = j.results || [];
      const results: StockResult[] = items
        .filter((r: any) => r.url && typeof r.url === "string")
        .map((r: any, i: number) => ({
          id: `openverse-${r.id || Date.now() + "-" + i}`,
          kind: "stock_image" as const,
          source: "web" as const,
          title: r.title || "Openverse image",
          thumbUrl: r.thumbnail || r.url,
          downloadUrl: r.url,
          author: r.creator || undefined,
          width: r.width || undefined,
          height: r.height || undefined,
        }));
      if (results.length) return results;
    }
  } catch (e: any) {
    console.error("[openverse search]", e?.message);
  }
  // second zero-key fallback: Wikimedia Commons API
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${per}` +
      `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ClipCraftAI/1.0 (open-source video editor)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const j = await res.json();
    const pages = Object.values(j?.query?.pages || {}) as any[];
    const results: StockResult[] = [];
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info?.thumburl && !info?.url) continue;
      // skip exotic formats ffmpeg cannot decode well
      const file = (info?.url || "").toLowerCase();
      if (/\.(svg|tif|tiff|djvu|pdf)$/.test(file)) continue;
      results.push({
        id: `wiki-${p.pageid}`,
        kind: "stock_image",
        source: "web",
        title: (p.title || "").replace(/^File:/, "").replace(/\.[a-z]+$/, "") || "Wikimedia image",
        thumbUrl: info.thumburl || info.url,
        downloadUrl: info.thumburl || info.url,
        author:
          info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "").trim() || undefined,
        width: info.thumbwidth || info.width,
        height: info.thumbheight || info.height,
      });
    }
    return results;
  } catch (e: any) {
    console.error("[wikimedia search]", e?.message);
    return [];
  }
}

export async function searchStockMedia(
  query: string,
  perPage = 12
): Promise<{ results: StockResult[]; usedSource: string; note?: string }> {
  const settings = await getSettings();
  const trimmed = query.trim() || "professional workspace";
  if (settings.keys.pexels) {
    const r = await searchPexels(trimmed, perPage);
    if (r.length) return { results: r.slice(0, perPage), usedSource: "pexels" };
  }
  if (settings.keys.pixabay) {
    const r = await searchPixabay(trimmed, perPage);
    if (r.length) return { results: r.slice(0, perPage), usedSource: "pixabay" };
  }
  // zero-config fallback: Openverse / Wikimedia (free, no API key)
  const r = await searchWebImages(trimmed, perPage);
  if (r.length) {
    return {
      results: r.slice(0, perPage),
      usedSource: "web",
      note: "Using the built-in free image search (Openverse/Wikimedia). Set PEXELS_API_KEY or PIXABAY_API_KEY in .env for premium stock videos.",
    };
  }
  return { results: [], usedSource: "none", note: "No stock results found. Try AI generation instead." };
}

async function downloadFile(url: string, destPath: string, timeoutMs = 120000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Download failed ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return destPath;
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadStockAsset(
  item: StockResult,
  kenBurns?: Partial<VisualAsset["kenBurns"]>
): Promise<VisualAsset> {
  ensureDirs();
  const ext = item.kind === "stock_video" ? ".mp4" : ".jpg";
  const filename = `${item.kind === "stock_video" ? "video" : "image"}_${Date.now()}_${newId().slice(0, 6)}${ext}`;
  const dest = path.join(VISUALS_DIR, filename);
  await downloadFile(item.downloadUrl, dest);
  let thumb = item.thumbUrl;
  if (item.kind === "stock_image") {
    thumb = mediaUrlFor(dest);
  }
  return {
    id: newId(),
    kind: item.kind,
    source: item.source,
    url: mediaUrlFor(dest),
    remoteUrl: item.downloadUrl,
    thumbUrl: thumb,
    author: item.author,
    prompt: item.title,
    duration: item.duration,
    kenBurns: {
      enabled: item.kind === "stock_image",
      direction: "in",
      intensity: 1.15,
      ...(kenBurns || {}),
    },
    searchQuery: item.title,
  };
}

export async function generateImageVisual(
  prompt: string,
  opts?: { provider?: "huggingface" | "pollinations" }
): Promise<VisualAsset> {
  const settings = await getSettings();
  ensureDirs();
  const filename = `gen_${Date.now()}_${newId().slice(0, 6)}.png`;
  const dest = path.join(VISUALS_DIR, filename);

  let usedProvider: "huggingface" | "pollinations" = opts?.provider || "pollinations";
  let lastError = "";

  // Premium path: Hugging Face Inference API (FLUX.1-schnell) — requires a token
  if (usedProvider === "huggingface" && settings.keys.huggingface) {
    try {
      const res = await fetch(
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.keys.huggingface}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: `${prompt}, high quality, cinematic lighting, detailed`,
          }),
          signal: AbortSignal.timeout(120000),
        }
      );
      if (!res.ok) throw new Error(`HF error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000 || buf.subarray(0, 4).toString("hex") !== "89504e47") {
        throw new Error("HF returned an invalid image");
      }
      fs.writeFileSync(dest, buf);
      return {
        id: newId(),
        kind: "ai_generated",
        source: "huggingface",
        url: mediaUrlFor(dest),
        thumbUrl: mediaUrlFor(dest),
        prompt,
        kenBurns: { enabled: true, direction: "in", intensity: 1.18 },
      };
    } catch (e: any) {
      console.error("[hf generate]", e?.message);
      lastError = e?.message || "";
      usedProvider = "pollinations"; // fallback
    }
  }

  // Zero-config path: Pollinations.ai (free, no API key, FLUX-based)
  try {
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ", high quality, cinematic lighting, professional")}` +
      `?width=1344&height=768&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e9)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error(`Pollinations error ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) throw new Error("Pollinations returned an empty image");
    fs.writeFileSync(dest, buf);
  } catch (e: any) {
    throw new Error(
      `AI image generation failed: ${e?.message}${lastError ? ` (HF: ${lastError})` : ""}. ` +
        `Set HUGGINGFACE_API_KEY in .env for the premium generator, or check your internet connection.`
    );
  }

  return {
    id: newId(),
    kind: "ai_generated",
    source: "pollinations",
    url: mediaUrlFor(dest),
    thumbUrl: mediaUrlFor(dest),
    prompt,
    kenBurns: { enabled: true, direction: "in", intensity: 1.18 },
  };
}

export async function kenBurnsClip(
  imagePath: string,
  duration: number,
  direction: "in" | "out",
  intensity: number,
  outPath: string,
  size: { w: number; h: number },
  fps = 24
): Promise<string> {
  // build a Ken Burns clip from a static image via zoompan
  const { runProc } = await import("../ffmpeg");
  const frames = Math.max(2, Math.round(duration * fps));
  const zStart = direction === "in" ? 1.0 : intensity;
  const zEnd = direction === "in" ? intensity : 1.0;
  const zStep = (zEnd - zStart) / frames;
  // zoompan expr: zoom starts at zStart increasing by zStep each frame
  const filter = `scale=${size.w * 2}:-1,zoompan=z='${zStart}+${zStep.toFixed(6)}*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${size.w}x${size.h}:fps=${fps},format=yuv420p`;
  await runProc(
    "ffmpeg",
    ["-y", "-loop", "1", "-i", imagePath, "-t", String(duration), "-vf", filter, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", outPath],
    180000
  );
  return outPath;
}
