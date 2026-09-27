"use client";

import { create } from "zustand";
import { api, type PublicProject } from "@/lib/client/api";
import type { JobDoc } from "@/lib/types";

export type NavView =
  | "home"
  | "new"
  | "projects"
  | "templates"
  | "media"
  | "help"
  | "wizard";

interface JobState {
  id: string;
  status: JobDoc["status"];
  progress: number;
  stage: string;
  error?: string;
}

interface ClipCraftState {
  nav: NavView;
  step: number; // wizard step 1..6
  project: PublicProject | null;
  job: JobState | null;
  toast: string | null;
  // actions
  setNav: (nav: NavView) => void;
  setStep: (step: number) => void;
  setProject: (p: PublicProject | null) => void;
  refreshProject: () => Promise<void>;
  startJob: (jobId: string, onDone?: () => void) => void;
  cancelJobPolling: () => void;
  showToast: (msg: string) => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollCount = 0;

export const useCC = create<ClipCraftState>((set, get) => ({
  nav: "home",
  step: 1,
  project: null,
  job: null,
  toast: null,

  setNav: (nav) => {
    if (nav === "new") {
      set({ nav: "wizard", project: null, step: 1, job: null });
    } else if (nav === "home") {
      set({ nav: "home" });
    } else if (nav === "wizard") {
      set({ nav: "wizard" });
    } else {
      set({ nav });
    }
  },

  setStep: (step) => set({ step: Math.max(1, Math.min(6, step)) }),

  setProject: (p) => {
    set({ project: p });
    if (p) {
      set({ step: Math.max(1, Math.min(6, p.currentStep || 1)) });
    }
  },

  refreshProject: async () => {
    const { project } = get();
    if (!project) return;
    try {
      const fresh = await api.getProject(project._id);
      set({ project: fresh });
    } catch {
      /* ignore */
    }
  },

  startJob: (jobId, onDone) => {
    if (pollTimer) clearInterval(pollTimer);
    pollCount = 0;
    set({ job: { id: jobId, status: "running", progress: 0, stage: "Starting..." } });
    pollTimer = setInterval(async () => {
      pollCount++;
      try {
        const job = await api.getJob(jobId);
        set({ job: { id: jobId, status: job.status, progress: job.progress, stage: job.stage, error: job.error } });
        if (job.status === "completed" || job.status === "failed") {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          await get().refreshProject();
          if (job.status === "completed") {
            onDone?.();
          }
          // keep the completed state visible briefly, then clear so
          // follow-up steps can auto-start their own jobs
          setTimeout(() => {
            const cur = get().job;
            if (cur && cur.id === jobId && cur.status === job.status) {
              set({ job: null });
            }
          }, 2500);
        }
      } catch (e: any) {
        if (pollCount > 200) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          set({
            job: {
              id: jobId,
              status: "failed",
              progress: 0,
              stage: "Lost connection to job",
              error: "Job polling failed",
            },
          });
        }
      }
    }, 1500);
  },

  cancelJobPolling: () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    set({ job: null });
  },

  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => set({ toast: null }), 3200);
  },
}));
