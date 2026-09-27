"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  ThumbsUp,
  AlertTriangle,
  Lightbulb,
  Check,
  Scissors,
  ArrowLeftRight,
  Trash2,
  X,
  Waves,
  Play,
  Download,
  Search,
  Loader2,
  Sparkles,
  ChevronRight,
  Video,
  Monitor,
  MonitorPlay,
} from "lucide-react";
import { Panel, SectionTitle, GradientButton, Badge, Waveform } from "../ui-bits";
import { api, fmtTime, fmtTimeMs, humanSize } from "@/lib/client/api";
import { useCC } from "../store";
import type { TimelineSegment, SegmentLayout } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StepAnalyze() {
  const { project, refreshProject, startJob, job, setStep, showToast } = useCC();
  const [filter, setFilter] = useState<"all" | "keep" | "cut" | "silence" | "filler">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"transcript" | "ai" | "insights" | "prompts">("transcript");
  const [search, setSearch] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedRef = useRef(false);

  // Auto-start analysis when landing on this step without segments
  useEffect(() => {
    if (!project || startedRef.current) return;
    if (project.segments.length === 0 && !job) {
      startedRef.current = true;
      api
        .startAnalyze(project._id)
        .then((jobId) => startJob(jobId))
        .catch((e) => showToast(e.message || "Failed to start analysis"));
    }
  }, [project, job, startJob, showToast]);

  const analyzed = (project?.segments?.length || 0) > 0;

  const counts = useMemo(() => {
    const segs = project?.segments || [];
    return {
      all: segs.length,
      keep: segs.filter((s) => s.type === "keep").length,
      cut: segs.filter((s) => s.type === "cut").length,
      silence: segs.filter((s) => s.type === "silence").length,
      filler: segs.filter((s) => s.type === "cut" && s.words.some((w) => w.filler)).length,
    };
  }, [project]);

  const filtered = useMemo(() => {
    const segs = project?.segments || [];
    if (filter === "all") return segs;
    if (filter === "filler") return segs.filter((s) => s.type === "cut" && s.words.some((w) => w.filler));
    return segs.filter((s) => s.type === filter);
  }, [project, filter]);

  async function setSegmentType(seg: TimelineSegment, type: TimelineSegment["type"]) {
    if (!project) return;
    try {
      const updated = await api.patchProject(project._id, {
        segments: [{ id: seg.id, type }],
      });
      useCC.setState({ project: updated });
    } catch (e: any) {
      showToast(e.message || "Update failed");
    }
  }

  async function patchLayouts(changes: { id: string; layout: SegmentLayout }[], msg: string) {
    if (!project || !changes.length) return;
    try {
      const updated = await api.patchProject(project._id, { segments: changes });
      useCC.setState({ project: updated });
      showToast(msg);
    } catch (e: any) {
      showToast(e.message || "Update failed");
    }
  }

  function setLayout(seg: TimelineSegment, layout: SegmentLayout) {
    patchLayouts([{ id: seg.id, layout }], layout === "screen" ? "Marked as screen recording" : "Marked as on camera");
  }

  // tutorial shape: presenter on camera first, then the laptop screen
  function screenFromHere(seg: TimelineSegment) {
    const changes = (project?.segments || []).map((s) => ({
      id: s.id,
      layout: (s.start >= seg.start ? "screen" : "camera") as SegmentLayout,
    }));
    patchLayouts(changes, `Camera before ${fmtTimeMs(seg.start)}, screen recording after`);
  }

  async function rerunLLM() {
    if (!project) return;
    try {
      const jobId = await api.startLLM(project._id);
      startJob(jobId);
    } catch (e: any) {
      showToast(e.message || "Failed to run AI analysis");
    }
  }

  function jumpTo(seg: TimelineSegment) {
    const v = videoRef.current;
    if (v) {
      v.currentTime = seg.start;
      v.play();
    }
    setSelectedId(seg.id);
  }

  // Words for transcript view
  const transcriptRows = useMemo(() => {
    const segs = project?.segments || [];
    return segs.map((seg) => ({ seg }));
  }, [project?.segments]);

  const analysis = project?.analysis;

  if (!project) return null;

  return (
    <div className="max-w-[1400px] mx-auto pb-28">
      {/* Top */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {analyzed ? "Analysis Results" : "Analyzing Your Video"}
          </h1>
          <p className="text-cc-muted mt-2 text-sm max-w-xl">
            {analyzed
              ? "Review the transcript, AI insights and detected segments below. Edit any decision before proceeding."
              : "We're transcribing, detecting filler words, finding silent moments, and getting AI insights..."}
          </p>
        </div>
        {job && job.status === "running" ? (
          <Panel className="px-4 py-3 w-full sm:w-96">
            <div className="flex items-center gap-2 text-sm text-white mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span className="truncate">{job.stage}</span>
              <span className="ml-auto text-xs text-cc-dim font-mono">{job.progress}%</span>
            </div>
            <div className="h-1.5 bg-cc-panel2 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cc-accent to-cc-accent2 rounded-full transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </Panel>
        ) : analyzed ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-start gap-3">
            <Check className="w-5 h-5 text-emerald-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Analysis Complete!</p>
              <p className="text-xs text-emerald-300/70 mt-0.5">
                Review the results below and make edits if needed.
              </p>
            </div>
          </div>
        ) : null}
        {job?.status === "failed" ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm font-semibold text-red-400">Analysis failed</p>
            <p className="text-xs text-red-300/70 mt-0.5">{job.error || job.stage}</p>
            <button
              className="text-xs text-red-300 underline mt-1"
              onClick={() => {
                startedRef.current = false;
                api
                  .startAnalyze(project._id)
                  .then((jobId) => startJob(jobId))
                  .catch((e) => showToast(e.message));
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: player + transcript */}
        <div className="xl:col-span-2 space-y-5">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-cc-border/60">
              <h3 className="font-semibold text-[15px] text-white">Video Player</h3>
              <div className="hidden sm:flex items-center gap-3 text-xs text-cc-dim">
                <span className="font-mono">{project.source.filename}</span>
                <span>·</span>
                <span className="font-mono">{fmtTime(project.source.duration)}</span>
                <span>·</span>
                <span className="font-mono">{humanSize(project.source.size)}</span>
                <span>·</span>
                <span className="font-mono">
                  {project.source.width} x {project.source.height}
                </span>
              </div>
            </div>
            <video
              ref={videoRef}
              src={project.source.url}
              controls
              className="w-full aspect-video bg-black"
              poster={project.source.thumbnail}
            />
          </Panel>

          <Panel className="overflow-hidden">
            {/* tabs */}
            <div className="flex items-center gap-1 px-3 border-b border-cc-border/60 overflow-x-auto cc-scroll">
              {[
                { id: "transcript", label: "Transcript" },
                { id: "ai", label: "AI Analysis" },
                { id: "insights", label: "Insights" },
                { id: "prompts", label: "Visual Prompts" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={cn(
                    "px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                    tab === t.id
                      ? "border-cc-accent text-white"
                      : "border-transparent text-cc-muted hover:text-white"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-3">
              {tab === "transcript" && (
                <div className="max-h-80 overflow-y-auto cc-scroll space-y-1.5">
                  {transcriptRows.map(({ seg }) => (
                    <button
                      key={seg.id}
                      onClick={() => jumpTo(seg)}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        selectedId === seg.id ? "bg-indigo-500/15" : "hover:bg-cc-panel2"
                      )}
                    >
                      <span className="font-mono text-[11px] text-cc-dim mt-0.5 shrink-0 w-14">
                        {fmtTimeMs(seg.start)}
                      </span>
                      <span className="text-sm leading-relaxed flex-1">
                        {seg.type === "silence" ? (
                          <span className="text-blue-300/80 italic text-xs">
                            ({(seg.end - seg.start).toFixed(1)}s silence)
                          </span>
                        ) : seg.words.length ? (
                          seg.words.map((w, i) => (
                            <span
                              key={i}
                              className={cn(
                                w.filler ? "text-red-400 font-semibold bg-red-500/10 rounded px-0.5" : "text-cc-muted"
                              )}
                            >
                              {w.word}{" "}
                            </span>
                          ))
                        ) : (
                          <span className="text-cc-muted">{seg.text}</span>
                        )}
                      </span>
                      {seg.type === "silence" && <Badge tone="silence">Silence</Badge>}
                      {seg.type === "cut" && <Badge tone="cut">Filler</Badge>}
                      {seg.type === "keep" && <Badge tone="keep">Normal</Badge>}
                    </button>
                  ))}
                  {!transcriptRows.length && (
                    <p className="text-xs text-cc-dim text-center py-8">
                      {job?.status === "running"
                        ? "Transcript will appear here when transcription finishes..."
                        : "No transcript yet."}
                    </p>
                  )}
                </div>
              )}

              {tab === "ai" && (
                <div className="max-h-80 overflow-y-auto cc-scroll p-2">
                  {analysis ? (
                    <div className="space-y-4 text-sm">
                      <div className="flex items-center gap-3">
                        <Badge tone="accent" className="text-xs font-mono">
                          {analysis.provider} · {analysis.model}
                        </Badge>
                        <Badge tone="success" className="text-xs font-mono">
                          Hook: {analysis.hookStrength}
                        </Badge>
                      </div>
                      <p className="text-cc-muted leading-relaxed">{analysis.assessment}</p>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-cc-dim mb-2">
                          Per-segment quality
                        </p>
                        <div className="space-y-1.5">
                          {analysis.segmentInsights.map((ins) => {
                            const seg = project.segments.find((s) => s.id === ins.segmentId);
                            if (!seg) return null;
                            return (
                              <div
                                key={ins.segmentId}
                                className="flex items-center gap-2 text-xs bg-cc-panel2/60 rounded-lg px-3 py-2"
                              >
                                <Badge
                                  tone={
                                    ins.quality === "good"
                                      ? "keep"
                                      : ins.quality === "weak"
                                        ? "cut"
                                        : "warn"
                                  }
                                >
                                  {ins.quality}
                                </Badge>
                                <span className="text-white font-medium">{seg.label}</span>
                                <span className="font-mono text-cc-dim">
                                  {fmtTimeMs(seg.start)} → {fmtTimeMs(seg.end)}
                                </span>
                                <span className="text-cc-muted truncate">{ins.note}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyAnalysis onRun={rerunLLM} busy={job?.status === "running"} />
                  )}
                </div>
              )}

              {tab === "insights" && (
                <div className="max-h-80 overflow-y-auto cc-scroll p-2">
                  {analysis ? (
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div className="bg-cc-panel2/60 rounded-lg p-3">
                        <p className="text-xs uppercase tracking-wide text-emerald-400 mb-2 font-semibold">
                          Strong Points
                        </p>
                        <ul className="space-y-1.5">
                          {analysis.strengths.map((s, i) => (
                            <li key={i} className="text-cc-muted text-xs flex gap-2">
                              <ThumbsUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-cc-panel2/60 rounded-lg p-3">
                        <p className="text-xs uppercase tracking-wide text-amber-400 mb-2 font-semibold">
                          Areas to Improve
                        </p>
                        <ul className="space-y-1.5">
                          {analysis.improvements.map((s, i) => (
                            <li key={i} className="text-cc-muted text-xs flex gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <EmptyAnalysis onRun={rerunLLM} busy={job?.status === "running"} />
                  )}
                </div>
              )}

              {tab === "prompts" && (
                <div className="max-h-80 overflow-y-auto cc-scroll p-2 space-y-2">
                  {project.segments
                    .filter((s) => s.type === "keep")
                    .map((seg) => (
                      <div
                        key={seg.id}
                        className="flex items-start gap-3 bg-cc-panel2/60 rounded-lg px-3 py-2.5"
                      >
                        <Sparkles className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white">
                            {seg.label}{" "}
                            <span className="font-mono text-cc-dim ml-1">
                              {fmtTimeMs(seg.start)} → {fmtTimeMs(seg.end)}
                            </span>
                          </p>
                          <p className="text-xs text-cc-muted mt-0.5">
                            {seg.visualPrompt || "No visual prompt yet — run AI analysis"}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* transcript toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-cc-border/60">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-cc-dim absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search in transcript..."
                  className="w-full bg-cc-input border border-cc-border rounded-md pl-8 pr-2 py-1.5 text-xs text-white placeholder:text-cc-dim outline-none focus:border-indigo-500"
                />
              </div>
              <button
                className="ml-auto text-xs text-cc-muted hover:text-white inline-flex items-center gap-1.5"
                onClick={async () => {
                  const cues = project.segments
                    .filter((s) => s.type === "keep")
                    .map((s) => ({ start: s.start, end: s.end, text: s.text }));
                  const res = await fetch("/api/srt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ cues, name: project.name }),
                  });
                  const d = await res.json();
                  if (d.url) window.open(d.url, "_blank");
                }}
              >
                <Download className="w-3.5 h-3.5" />
                Download SRT
              </button>
            </div>
          </Panel>
        </div>

        {/* Right: AI Summary */}
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-[15px] text-white">
                  AI Summary{analysis ? ` (${analysis.provider === "glm" ? "GLM" : analysis.provider[0].toUpperCase() + analysis.provider.slice(1)})` : ""}
                </h3>
              </div>
              {analysis && (
                <button
                  className="text-xs text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1"
                  onClick={rerunLLM}
                >
                  <Loader2 className={cn("w-3 h-3", job?.status === "running" && "animate-spin")} />
                  Re-run
                </button>
              )}
            </div>

            {analysis ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-cc-dim mb-2">
                    Overall Assessment
                  </p>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl font-bold text-emerald-400">
                      {analysis.score.toFixed(1)}
                      <span className="text-sm text-cc-dim font-normal">/10</span>
                    </span>
                    <div className="flex-1 h-1.5 bg-cc-panel2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${analysis.score * 10}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-cc-muted leading-relaxed">{analysis.assessment}</p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-cc-dim mb-2">
                    Key Highlights
                  </p>
                  <div className="space-y-2.5">
                    <div className="flex gap-2.5">
                      <ThumbsUp className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        {analysis.strengths.map((s, i) => (
                          <p key={i} className="text-cc-muted">
                            {s}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        {analysis.improvements.map((s, i) => (
                          <p key={i} className="text-cc-muted">
                            {s}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <Lightbulb className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-cc-muted italic">
                        &ldquo;{analysis.suggestedAngle}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyAnalysis onRun={rerunLLM} busy={job?.status === "running"} />
            )}
          </Panel>
        </div>
      </div>

      {/* Timeline & segments */}
      <Panel className="mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-[15px] text-white">Timeline &amp; Segments</h3>
            <p className="text-xs text-cc-dim mt-0.5">
              Review detected segments. You can edit, merge, or remove parts before proceeding.
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(
              [
                ["all", `All (${counts.all})`],
                ["keep", `Keep (${counts.keep})`],
                ["cut", `Cut (${counts.cut})`],
                ["silence", `Silence (${counts.silence})`],
                ["filler", `Filler (${counts.filler})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                  filter === id
                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200"
                    : "bg-cc-panel2 border-cc-border text-cc-muted hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto cc-scroll pb-2">
          <div className="flex gap-2.5 min-w-max">
            {filtered.map((seg) => {
              const tone =
                seg.type === "keep" ? "emerald" : seg.type === "silence" ? "blue" : "red";
              return (
                <button
                  key={seg.id}
                  onClick={() => jumpTo(seg)}
                  className={cn(
                    "group relative w-48 shrink-0 rounded-xl border-2 overflow-hidden text-left transition-all bg-cc-panel2",
                    selectedId === seg.id ? "border-indigo-500 shadow-lg shadow-indigo-950/60" : "",
                    tone === "emerald"
                      ? selectedId !== seg.id && "border-emerald-600/40 hover:border-emerald-500/70"
                      : "",
                    tone === "blue"
                      ? selectedId !== seg.id && "border-blue-600/40 hover:border-blue-500/70"
                      : "",
                    tone === "red"
                      ? selectedId !== seg.id && "border-red-600/40 hover:border-red-500/70"
                      : ""
                  )}
                >
                  <div className="relative aspect-video bg-cc-panel overflow-hidden">
                    {project.source.mediaType === "video" ? (
                       
                      <img
                        src={`/api/thumb?src=${encodeURIComponent(project.source.url)}&t=${(seg.start + 0.2).toFixed(2)}&w=320`}
                        alt={seg.label}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Waves className="w-6 h-6 text-cc-dim" />
                      </div>
                    )}
                    <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {fmtTimeMs(seg.start)} - {fmtTimeMs(seg.end)}
                    </span>
                    <span
                      title={seg.layout === "screen" ? "Screen recording" : "On camera"}
                      className="absolute top-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                    >
                      {seg.layout === "screen" ? <Monitor className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                      {seg.layout === "screen" ? "Screen" : "Camera"}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <Badge tone={seg.type}>{seg.type === "keep" ? "Keep" : seg.type === "silence" ? "Silence" : "Cut (Filler)"}</Badge>
                      <span className="text-[10px] text-cc-dim font-mono">
                        {(seg.end - seg.start).toFixed(1)}s
                      </span>
                    </div>
                    <p className="text-xs text-white font-medium truncate">{seg.label}</p>
                    <Waveform
                      seed={seg.id}
                      bars={30}
                      level={seg.type === "silence" ? "flat" : seg.type === "cut" ? "low" : "high"}
                      className={cn(
                        "mt-1.5",
                        seg.type === "keep"
                          ? "text-emerald-400"
                          : seg.type === "silence"
                            ? "text-blue-400"
                            : "text-red-400"
                      )}
                    />
                  </div>
                </button>
              );
            })}
            {!filtered.length && (
              <div className="w-full py-10 text-center text-xs text-cc-dim">
                {job?.status === "running"
                  ? "Segments will appear here when analysis completes..."
                  : "No segments match this filter."}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-cc-border/70 bg-cc-panel/95 backdrop-blur px-4 md:px-8 py-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          <FooterBtn icon={Scissors} label="Split" />
          <FooterBtn icon={ArrowLeftRight} label="Merge" />
          <FooterBtn icon={Trash2} label="Delete" />
          <FooterBtn
            icon={Check}
            label="Keep"
            className="text-emerald-400"
            onClick={() => {
              const sel = project.segments.find((s) => s.id === selectedId);
              if (sel) setSegmentType(sel, "keep");
            }}
          />
          <FooterBtn
            icon={X}
            label="Cut"
            className="text-red-400"
            onClick={() => {
              const sel = project.segments.find((s) => s.id === selectedId);
              if (sel) setSegmentType(sel, "cut");
            }}
          />
          <FooterBtn
            icon={Waves}
            label="Mark Silence"
            className="text-blue-400"
            onClick={() => {
              const sel = project.segments.find((s) => s.id === selectedId);
              if (sel) setSegmentType(sel, "silence");
            }}
          />
          <span className="w-px h-5 bg-cc-border mx-1" />
          <FooterBtn
            icon={Video}
            label="Camera"
            onClick={() => {
              const sel = project.segments.find((s) => s.id === selectedId);
              if (sel) setLayout(sel, "camera");
            }}
          />
          <FooterBtn
            icon={Monitor}
            label="Screen"
            onClick={() => {
              const sel = project.segments.find((s) => s.id === selectedId);
              if (sel) setLayout(sel, "screen");
            }}
          />
          <FooterBtn
            icon={MonitorPlay}
            label="Screen from here"
            className="text-indigo-300"
            onClick={() => {
              const sel = project.segments.find((s) => s.id === selectedId);
              if (sel) screenFromHere(sel);
              else showToast("Select the first segment where you switch to the laptop screen");
            }}
          />
        </div>
        <div className="flex items-center gap-2 mx-auto hidden lg:flex">
          <span className="text-xs text-cc-dim">Zoom</span>
          <Search className="w-3.5 h-3.5 text-cc-dim" />
          <input type="range" className="cc-range w-28" min={30} max={100} defaultValue={70} />
          <Search className="w-3.5 h-3.5 text-cc-dim scale-125" />
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-cc-dim hidden xl:inline">
            {counts.keep} keep · {counts.cut} cut · {counts.silence} silence
          </span>
          <GradientButton
            disabled={!analyzed}
            onClick={() => setStep(3)}
          >
            Continue to Visuals <ChevronRight className="w-4 h-4" />
          </GradientButton>
        </div>
      </div>
    </div>
  );
}

function FooterBtn({
  icon: Icon,
  label,
  className,
  onClick,
}: {
  icon: any;
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-cc-muted hover:text-white hover:bg-cc-panel2 transition-colors",
        className
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function EmptyAnalysis({ onRun, busy }: { onRun: () => void; busy: boolean }) {
  return (
    <div className="text-center py-8">
      <Brain className="w-8 h-8 mx-auto text-cc-dim mb-3" />
      <p className="text-sm text-cc-muted mb-1">
        {busy ? "AI is analyzing your content..." : "No AI analysis yet"}
      </p>
      <p className="text-xs text-cc-dim mb-4">
        The AI reviews your transcript for hook strength, pacing and visual opportunities.
      </p>
      {!busy && (
        <button
          onClick={onRun}
          className="text-xs text-indigo-300 hover:text-indigo-200 underline"
        >
          Run AI analysis
        </button>
      )}
    </div>
  );
}
