"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Brain,
  Volume2,
  Layout,
  Image as ImageIcon,
  Captions,
  Download,
  Share2,
  Copy,
  Code2,
  ArrowLeft,
  Plus,
  Loader2,
  Check,
  Youtube,
  Linkedin,
  Twitter,
  Instagram,
  Music2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Panel, GradientButton, GhostButton, Badge } from "../ui-bits";
import { api, fmtTime, humanSize, playableUrl } from "@/lib/client/api";
import { useCC } from "../store";
import { cn } from "@/lib/utils";

export function StepReview() {
  const { project, refreshProject, setNav, setStep, startJob, job, showToast } = useCC();
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [selectedThumb, setSelectedThumb] = useState<string | null>(null);
  const [thumbIdx, setThumbIdx] = useState(0);
  const titlesStarted = useRef(false);
  const [exportStarting, setExportStarting] = useState(false); // blocks double-clicks

  useEffect(() => {
    if (!project || !project.segments.length || project.titles.length || titlesStarted.current)
      return;
    titlesStarted.current = true;
    api
      .generateTitles(project._id)
      .then((d) => {
        if (d.titles?.length) useCC.setState({ project: { ...project, titles: d.titles } });
      })
      .catch(() => {
        titlesStarted.current = false;
      });
  }, [project, project?.segments.length, project?.titles.length]);

  if (!project) return null;

  const hl = project.highlights || {};
  const exportInfo = project.export || {};
  const thumbs = project.thumbnails || [];
  const titles = project.titles || [];

  async function downloadTimeline() {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timeline_${project.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const highlights = [
    { icon: Clock, label: "Total Duration", value: fmtTime(hl.totalDuration || exportInfo.duration || 0), tone: "" },
    { icon: Clock, label: "Original Duration", value: fmtTime(hl.originalDuration || project.source.duration), tone: "" },
    {
      icon: Clock,
      label: "Time Saved",
      value: hl.timeSavedPct != null ? `~${hl.timeSavedPct}%` : "—",
      tone: "text-emerald-400",
    },
    { icon: Brain, label: "Filler Words Removed", value: String(hl.fillersRemoved ?? "—") },
    { icon: Volume2, label: "Silent Segments Removed", value: String(hl.silencesRemoved ?? "—") },
    { icon: Layout, label: "Visuals Added", value: String(hl.visualsAdded ?? "—") },
    { icon: ImageIcon, label: "Transitions Added", value: String(hl.transitionsAdded ?? "—") },
    {
      icon: Captions,
      label: "Captions",
      value: hl.captionsEnabled ? "Enabled" : "Off",
      tone: hl.captionsEnabled ? "text-emerald-400" : "",
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto pb-28">
      {/* Top */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Review &amp; Export</h1>
          <p className="text-cc-muted mt-2 text-sm max-w-xl">
            Preview your final video, make last-minute changes, and export it in the perfect
            format.
          </p>
        </div>
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 flex items-start gap-3">
          <Check className="w-5 h-5 text-indigo-300 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">Your video is ready!</p>
            <p className="text-xs text-cc-muted mt-0.5">Review, customize, and export.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: player + thumbnail/title */}
        <div className="xl:col-span-2 space-y-5">
          <Panel className="overflow-hidden">
            <video
              src={playableUrl(exportInfo.url) || project.source.url}
              controls
              className="w-full aspect-video bg-black"
              poster={project.source.thumbnail}
            />
          </Panel>

          {/* Thumbnail & Title */}
          <Panel className="p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-semibold text-[15px] text-white">Thumbnail &amp; Title</h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-cc-muted">AI Suggested Thumbnails</span>
                <button
                  className="text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1"
                  onClick={async () => {
                    try {
                      const jobId = await api.generateThumbnails(project._id);
                      startJob(jobId);
                      showToast("Generating new thumbnails...");
                    } catch (e: any) {
                      showToast(e.message || "Failed");
                    }
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                <span className="border-l border-cc-border pl-3 text-cc-muted">Custom Thumbnail</span>
              </div>
            </div>

            {job?.status === "running" && job.stage?.includes("humbnail") ? (
              <div className="flex items-center gap-3 text-sm text-cc-muted py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                {job.stage}
              </div>
            ) : thumbs.length ? (
              <>
                <div className="flex items-center gap-3">
                  <button
                    className="p-1.5 rounded-full border border-cc-border text-cc-muted hover:text-white shrink-0"
                    onClick={() => setThumbIdx((i) => Math.max(0, i - 1))}
                  >
                    ‹
                  </button>
                  <div className="flex gap-3 overflow-x-auto cc-scroll flex-1 py-1">
                    {thumbs.map((t, i) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedThumb(t.id);
                          setThumbIdx(i);
                        }}
                        className={cn(
                          "relative rounded-lg overflow-hidden border-2 shrink-0",
                          (selectedThumb || thumbs[0].id) === t.id
                            ? "border-indigo-500 shadow-lg shadow-indigo-950/50"
                            : "border-cc-border hover:border-cc-dim"
                        )}
                      >
                        { }
                        <img
                          src={t.url}
                          alt={t.headline}
                          className="w-48 aspect-video object-cover"
                        />
                        <span className="absolute bottom-1 left-1 bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded">
                          Edit
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="p-1.5 rounded-full border border-cc-border text-cc-muted hover:text-white shrink-0"
                    onClick={() => setThumbIdx((i) => Math.min(thumbs.length - 1, i + 1))}
                  >
                    ›
                  </button>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-medium text-cc-muted">Suggested Titles</p>
                    <button
                      className="text-xs text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1"
                      onClick={async () => {
                        try {
                          const d = await api.generateTitles(project._id);
                          if (d.titles?.length)
                            useCC.setState({ project: { ...project, titles: d.titles } });
                        } catch (e: any) {
                          showToast(e.message || "Failed");
                        }
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Regenerate
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(titles.length
                      ? titles
                      : [{ id: "t0", text: project.titles.length ? project.titles[0].text : project.name }]
                    ).map((t, i) => (
                      <button
                        key={t.id}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                          (selectedTitle || titles[0]?.id) === t.id
                            ? "border-indigo-500/60 bg-indigo-500/10 text-white"
                            : "border-cc-border bg-cc-panel2/50 text-cc-muted hover:text-white"
                        )}
                        onClick={() => setSelectedTitle(t.id)}
                      >
                        <span
                          className={cn(
                            "w-3.5 h-3.5 rounded-full border-2 shrink-0",
                            (selectedTitle || titles[0]?.id) === t.id
                              ? "border-indigo-400 bg-indigo-500"
                              : "border-cc-dim"
                          )}
                        />
                        {t.text}
                        {i === 0 && (
                          <Badge tone="accent" className="ml-auto">
                            Recommended
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <ImageIcon className="w-8 h-8 mx-auto text-cc-dim mb-3" />
                <p className="text-sm text-cc-muted mb-3">
                  Generate AI thumbnails with headlines for your video
                </p>
                <GradientButton
                  onClick={async () => {
                    try {
                      const jobId = await api.generateThumbnails(project._id);
                      startJob(jobId);
                    } catch (e: any) {
                      showToast(e.message || "Failed");
                    }
                  }}
                >
                  <Sparkles className="w-4 h-4" /> Generate Thumbnails
                </GradientButton>
              </div>
            )}
          </Panel>
        </div>

        {/* Right: highlights + export + share */}
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[15px] text-white">Key Highlights</h3>
              <PencilIcon />
            </div>
            <div className="space-y-3">
              {highlights.map((h) => {
                const Icon = h.icon;
                return (
                  <div key={h.label} className="flex items-center gap-3 text-sm">
                    <Icon className="w-4 h-4 text-cc-dim shrink-0" />
                    <span className="text-cc-muted flex-1">{h.label}</span>
                    <span className={cn("font-medium", h.tone || "text-white")}>{h.value}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-5 space-y-4">
            <h3 className="font-semibold text-[15px] text-white">Export Video</h3>
            <div className="flex gap-2">
              {["MP4", "MOV", "GIF"].map((f) => (
                <button
                  key={f}
                  onClick={() =>
                    api
                      .patchProject(project._id, { output: { format: f.toLowerCase() } })
                      .then((p) => useCC.setState({ project: p }))
                  }
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
                    (project.output.format || "mp4").toUpperCase() === f
                      ? "bg-cc-accent text-white"
                      : "bg-cc-panel2 text-cc-muted hover:text-white border border-cc-border"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="text-xs space-y-1.5 text-cc-muted">
              <p>
                Resolution:{" "}
                <span className="text-white font-medium">
                  {project.output.resolution === "1080p"
                    ? "1080p (Full HD)"
                    : project.output.resolution === "720p"
                      ? "720p (HD)"
                      : "480p (SD)"}
                </span>
              </p>
              <p>
                Aspect: <span className="text-white font-medium">{project.output.aspectRatio}</span>
                <span className="text-cc-dim">
                  {project.output.aspectRatio === "16:9" ? " (YouTube)" : ""}
                </span>
              </p>
              <p>
                Quality: <span className="text-white font-medium capitalize">{project.output.quality || "high"}</span>
              </p>
              {exportInfo.sizeBytes ? (
                <p>
                  Size: <span className="text-white font-medium">{humanSize(exportInfo.sizeBytes)}</span>
                </p>
              ) : null}
            </div>
            <GradientButton
              className="w-full py-3"
              onClick={async () => {
                if (exportStarting) return;
                setExportStarting(true);
                try {
                  const jobId = await api.startExport(project._id, {
                    format: project.output.format,
                  });
                  useCC.setState({ job: { id: jobId, status: "running", progress: 0, stage: "Preparing export..." } });
                  const poll = setInterval(async () => {
                    const j = await api.getJob(jobId);
                    useCC.setState({ job: { id: jobId, status: j.status, progress: j.progress, stage: j.stage, error: j.error } });
                    if (j.status === "completed" || j.status === "failed") {
                      clearInterval(poll);
                      await useCC.getState().refreshProject();
                      if (j.status === "completed") {
                        // trigger download
                        const fresh = useCC.getState().project;
                        if (fresh?.export?.url) {
                          const a = document.createElement("a");
                          a.href = fresh.export.url;
                          a.download = `clipcraft_${fresh.name.replace(/\s+/g, "_")}.${fresh.output.format || "mp4"}`;
                          a.click();
                        }
                        showToast("Export complete — download started");
                      } else {
                        showToast(j.error || "Export failed");
                      }
                    }
                  }, 1500);
                } catch (e: any) {
                  showToast(e.message || "Export failed");
                } finally {
                  setExportStarting(false);
                }
              }}
              disabled={exportStarting || job?.status === "running"}
            >
              {exportStarting || job?.status === "running" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {job?.status === "running" ? "Exporting..." : "Export Video"}
            </GradientButton>
            <GhostButton className="w-full">
              <Share2 className="w-4 h-4" />
              Export for Social Media ▾
            </GhostButton>
          </Panel>

          <Panel className="p-5">
            <h3 className="font-semibold text-[15px] text-white mb-1">Share or Publish</h3>
            <p className="text-xs text-cc-dim mb-4">Publish directly or schedule for later.</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "YouTube", icon: Youtube, bg: "bg-red-600" },
                { label: "LinkedIn", icon: Linkedin, bg: "bg-blue-700" },
                { label: "X (Twitter)", icon: Twitter, bg: "bg-black border border-cc-border" },
                { label: "Instagram", icon: Instagram, bg: "bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600" },
                { label: "TikTok", icon: Music2, bg: "bg-neutral-900 border border-cc-border" },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg hover:bg-cc-panel2 transition-colors"
                    onClick={() => showToast(`${s.label} publishing requires account connection`)}
                  >
                    <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center", s.bg)}>
                      <Icon className="w-4 h-4 text-white" />
                    </span>
                    <span className="text-[10px] text-cc-muted">{s.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-cc-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cc-dim" />
                <div>
                  <p className="text-xs font-medium text-white">Schedule for Later</p>
                  <p className="text-[10px] text-cc-dim">Choose a date and time to publish.</p>
                </div>
              </div>
              <button className="text-[11px] text-indigo-300 hover:text-indigo-200 border border-indigo-500/40 rounded-md px-2.5 py-1.5">
                Select Date &amp; Time
              </button>
            </div>
          </Panel>

          <Panel className="p-5">
            <h3 className="font-semibold text-[15px] text-white mb-3">Project Actions</h3>
            <div className="grid grid-cols-3 gap-2">
              <GhostButton className="text-[11px] flex-col gap-1 py-2.5" onClick={() => showToast("Project saved")}>
                <Download className="w-4 h-4" /> Save
              </GhostButton>
              <GhostButton
                className="text-[11px] flex-col gap-1 py-2.5"
                onClick={() => showToast("Project duplicated")}
              >
                <Copy className="w-4 h-4" /> Duplicate
              </GhostButton>
              <GhostButton className="text-[11px] flex-col gap-1 py-2.5" onClick={downloadTimeline}>
                <Code2 className="w-4 h-4" /> Timeline (JSON)
              </GhostButton>
            </div>
          </Panel>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-cc-border/70 bg-cc-panel/95 backdrop-blur px-4 md:px-8 py-3 flex items-center justify-between">
        <button
          className="text-sm text-cc-muted hover:text-white inline-flex items-center gap-1.5"
          onClick={() => setStep(5)}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Assembly
        </button>
        <GradientButton
          onClick={() => {
            setProjectNull();
            setNav("home");
          }}
        >
          <Plus className="w-4 h-4" /> Start New Project
        </GradientButton>
      </div>
    </div>
  );
}

function setProjectNull() {
  useCC.setState({ project: null, step: 1 });
}

function PencilIcon() {
  return (
    <button className="text-cc-dim hover:text-white">
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </button>
  );
}
