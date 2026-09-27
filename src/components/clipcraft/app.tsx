"use client";

import { useEffect, useState } from "react";
import { Sidebar, Header } from "./shell";
import { useCC } from "./store";
import { api } from "@/lib/client/api";
import { StepInput } from "./wizard/step-input";
import { StepAnalyze } from "./wizard/step-analyze";
import { StepVisuals } from "./wizard/step-visuals";
import { StepPolish } from "./wizard/step-polish";
import { StepAssemble } from "./wizard/step-assemble";
import { StepReview } from "./wizard/step-review";
import {
  ProjectsView,
  MediaView,
  TemplatesView,
  HelpView,
} from "./views/views";
import { SettingsDialog } from "./settings-dialog";
import { AlertCircle, X, Database } from "lucide-react";

export function ClipCraftApp() {
  const { nav, step, job, toast } = useCC();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mongoDown, setMongoDown] = useState<string | null>(null);

  // check backend + MongoDB connectivity once on load
  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => {
        if (!r.ok) {
          try {
            const j = await r.json();
            setMongoDown(j.error || "Cannot reach MongoDB.");
          } catch {
            setMongoDown("Backend health check failed.");
          }
        }
      })
      .catch(() => setMongoDown("Backend not reachable — is the dev server running?"));
  }, []);

  // restore last session project on first load
  useEffect(() => {
    try {
      const lastId = localStorage.getItem("cc_last_project");
      if (lastId) {
        api
          .getProject(lastId)
          .then((p) => {
            if (p && p.segments !== undefined) {
              useCC.setState({
                project: p,
                step: Math.max(1, Math.min(6, p.currentStep || 1)),
                nav: "wizard",
              });
            }
          })
          .catch(() => {
            localStorage.removeItem("cc_last_project");
          });
      }
    } catch {
      /* no storage */
    }
  }, []);

  // persist current project id
  const projectId = useCC((s) => s.project?._id);
  useEffect(() => {
    try {
      if (projectId) localStorage.setItem("cc_last_project", projectId);
      else localStorage.removeItem("cc_last_project");
    } catch {
      /* ignore */
    }
  }, [projectId]);

  // refresh project periodically while a job runs (backup for the poller)
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(() => {
      useCC.getState().refreshProject();
    }, 4000);
    return () => clearInterval(t);
  }, [job]);

  return (
    <div className="h-screen flex bg-cc-bg overflow-hidden">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} onOpenHelp={() => setHelpOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onOpenSettings={() => setSettingsOpen(true)} />

        <main className="flex-1 overflow-y-auto cc-scroll">
          {mongoDown ? (
            <div className="mx-4 mt-4 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 flex items-start gap-2.5">
              <Database className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">MongoDB is not connected</p>
                <p className="text-xs text-amber-200/80 mt-0.5">{mongoDown}</p>
              </div>
              <button
                className="ml-auto text-amber-300 hover:text-white shrink-0"
                onClick={() => setMongoDown(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : null}
          <div className="px-4 md:px-8 py-6">
            {nav === "home" || nav === "new" ? <StepInput /> : null}

            {nav === "wizard" ? (
              <>
                {step === 1 && <StepInput />}
                {step === 2 && <StepAnalyze />}
                {step === 3 && <StepVisuals />}
                {step === 4 && <StepPolish />}
                {step === 5 && <StepAssemble />}
                {step === 6 && <StepReview />}
              </>
            ) : null}

            {nav === "projects" && <ProjectsView />}
            {nav === "media" && <MediaView />}
            {nav === "templates" && <TemplatesView />}
            {nav === "help" && <HelpView />}
          </div>
        </main>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {helpOpen && <HelpView />}

      {/* toast */}
      {toast ? (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 cc-fade-up">
          <div className="bg-cc-panel border border-cc-border rounded-xl px-4 py-3 shadow-2xl flex items-center gap-2.5 max-w-md">
            <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0" />
            <p className="text-sm text-white">{toast}</p>
          </div>
        </div>
      ) : null}

      {/* job failed banner */}
      {job?.status === "failed" ? (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 cc-fade-up w-full max-w-md px-4">
          <div className="bg-red-950/90 border border-red-500/40 rounded-xl px-4 py-3 shadow-2xl flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium">Job failed</p>
              <p className="text-xs text-red-300/80 mt-0.5 break-words">{job.error}</p>
            </div>
            <button
              className="text-red-300 hover:text-white shrink-0"
              onClick={() => useCC.setState({ job: null })}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
