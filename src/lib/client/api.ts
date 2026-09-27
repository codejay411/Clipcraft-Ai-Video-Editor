"use client";

import type { ProjectDoc, JobDoc, SampleVideo } from "@/lib/types";
// type-only import: erased at build time, so no server code reaches the browser
import type { publicConfig } from "@/lib/config";

export type PublicSettings = ReturnType<typeof publicConfig>;

async function j<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}

export type PublicProject = Omit<ProjectDoc, "source"> & {
  source: Omit<ProjectDoc["source"], "filepath">;
};

export interface StockResultItem {
  id: string;
  kind: "stock_video" | "stock_image";
  source: "pexels" | "pixabay" | "web";
  title: string;
  thumbUrl: string;
  duration?: number;
  author?: string;
  downloadUrl?: string;
}

export const api = {
  async listProjects(): Promise<PublicProject[]> {
    const r = await fetch("/api/projects");
    const d = await j<{ projects: PublicProject[] }>(r);
    return d.projects;
  },

  async createProject(form: FormData): Promise<PublicProject> {
    const r = await fetch("/api/projects", { method: "POST", body: form });
    const d = await j<{ project: PublicProject }>(r);
    return d.project;
  },

  async getProject(id: string): Promise<PublicProject> {
    const r = await fetch(`/api/projects/${id}`);
    const d = await j<{ project: PublicProject }>(r);
    return d.project;
  },

  async patchProject(
    id: string,
    body: Record<string, unknown>
  ): Promise<PublicProject> {
    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await j<{ project: PublicProject }>(r);
    return d.project;
  },

  async deleteProject(id: string): Promise<void> {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
  },

  async startAnalyze(id: string): Promise<string> {
    const r = await fetch(`/api/projects/${id}/analyze`, { method: "POST" });
    const d = await j<{ jobId: string }>(r);
    return d.jobId;
  },

  async startLLM(id: string): Promise<string> {
    const r = await fetch(`/api/projects/${id}/analyze/llm`, { method: "POST" });
    const d = await j<{ jobId: string }>(r);
    return d.jobId;
  },

  async searchStock(projectId: string, query: string, perPage = 12) {
    const r = await fetch(`/api/projects/${projectId}/visuals/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, perPage }),
    });
    return j<{ results: StockResultItem[]; usedSource: string; note?: string }>(r);
  },

  async generateVisual(projectId: string, prompt: string) {
    const r = await fetch(`/api/projects/${projectId}/visuals/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    return j<{ visual: ProjectDoc["segments"][number]["visual"] }>(r);
  },

  async assignVisual(
    projectId: string,
    segmentId: string,
    payload: { stockItem?: StockResultItem; visual?: any; visualPrompt?: string }
  ) {
    const r = await fetch(`/api/projects/${projectId}/visuals/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId, ...payload }),
    });
    return j<{ segment: any }>(r);
  },

  async startPolish(id: string): Promise<string> {
    const r = await fetch(`/api/projects/${id}/polish`, { method: "POST" });
    const d = await j<{ jobId: string }>(r);
    return d.jobId;
  },

  async startAssemble(id: string): Promise<string> {
    const r = await fetch(`/api/projects/${id}/assemble`, { method: "POST" });
    const d = await j<{ jobId: string }>(r);
    return d.jobId;
  },

  async startExport(id: string, output?: any): Promise<string> {
    const r = await fetch(`/api/projects/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ output }),
    });
    const d = await j<{ jobId: string }>(r);
    return d.jobId;
  },

  async generateThumbnails(id: string): Promise<string> {
    const r = await fetch(`/api/projects/${id}/thumbnails`, { method: "POST" });
    const d = await j<{ jobId: string }>(r);
    return d.jobId;
  },

  async generateTitles(id: string) {
    const r = await fetch(`/api/projects/${id}/titles`, { method: "POST" });
    return j<{ titles: { id: string; text: string; selected?: boolean }[] }>(r);
  },

  async getJob(id: string): Promise<JobDoc> {
    const r = await fetch(`/api/jobs/${id}`);
    const d = await j<{ job: JobDoc }>(r);
    return d.job;
  },

  async getSamples(): Promise<{ samples: SampleVideo[]; generating: boolean }> {
    const r = await fetch("/api/samples");
    return j(r);
  },

  /** Read-only: settings live in the server's .env; key values are never returned. */
  async getSettings() {
    const r = await fetch("/api/settings");
    return j<{
      settings: PublicSettings;
      render: { preference: string; active: "nvenc" | "qsv" | "cpu"; label: string };
      providers: any;
    }>(r);
  },
};

/** GIF exports can't play in <video>; the renderer always keeps the MP4 next to them */
export function playableUrl(url?: string): string | undefined {
  return url?.endsWith(".gif") ? url.replace(/\.gif$/, ".mp4") : url;
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function fmtTimeMs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, "0")}.${s.toFixed(1).padStart(4, "0")}`;
}

export function humanSize(bytes?: number): string {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
