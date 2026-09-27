"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Video,
  ArrowLeftRight,
  Captions,
  AudioLines,
  Wand2,
  ArrowLeft,
  Save,
  Eye,
  Undo2,
  Redo2,
  RotateCcw,
  Loader2,
  ChevronRight,
  Monitor,
  FileText,
  Waves,
  Scissors,
} from "lucide-react";
import { Panel, GradientButton, GhostButton, Badge, LabeledToggle } from "../ui-bits";
import { api, fmtTime } from "@/lib/client/api";
import { useCC } from "../store";
import { cn } from "@/lib/utils";

export function StepPolish() {
  const { project, refreshProject, setStep, startJob, job, showToast } = useCC();
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [transitionType, setTransitionType] = useState("Crossfade (Default)");
  const [transitionDur, setTransitionDur] = useState(1.0);
  const [captionFormat, setCaptionFormat] = useState("SRT (Burn-in)");
  const [audioMethod, setAudioMethod] = useState("afftdn (Recommended)");
  const [selectedScene, setSelectedScene] = useState(1);

  const polish = project?.polish;
  const applied = !!polish?.applied;
  const jobRunning = job?.status === "running";

  useEffect(() => {
    if (project && !polish?.applied && project.segments.length > 0 && !jobRunning) {
      api
        .startPolish(project._id)
        .then((jobId) => startJob(jobId))
        .catch((e) => showToast(e.message || "Failed to start polish"));
    }
  }, [project?._id, jobRunning]);

  const scenes = polish?.scenes || [];
  const cues = polish?.captions?.cues || [];
  const transitions = polish?.transitions || [];

  const videoUrl = project?.export?.url || project?.source.url;

  if (!project) return null;

  const statusCards = [
    {
      title: "Scene Detection",
      tech: "PySceneDetect",
      icon: Video,
      text: applied ? `Detected ${scenes.length} scene changes` : "Waiting...",
      action: "View Details",
      done: applied,
    },
    {
      title: "Transitions",
      tech: "Rule-based + FFmpeg",
      icon: ArrowLeftRight,
      text: applied
        ? `Added ${transitions.length} transitions`
        : "Waiting...",
      action: "Edit Transitions",
      done: applied,
    },
    {
      title: "Captions",
      tech: "SRT + Burn-in",
      icon: Captions,
      text: applied ? `Generated ${cues.length} caption cues` : "Waiting...",
      action: "Preview Captions",
      done: applied,
    },
    {
      title: "Audio Cleanup",
      tech: "RNNoise / afftdn",
      icon: AudioLines,
      text: applied
        ? `Noise reduced by ${polish?.audio?.noiseReducedPct ?? 0}%`
        : "Waiting...",
      action: "Preview Audio",
      done: applied,
    },
  ];

  return (
    <div className="max-w-[1500px] mx-auto pb-28">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-6 border border-cc-border/60">
        <div className="absolute inset-0 bg-gradient-to-r from-[#101426] via-[#151d33] to-[#221739]" />
        <div className="relative px-6 md:px-10 py-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Polish Your Video</h1>
            <p className="text-cc-muted mt-2 text-sm max-w-xl">
              Detect scenes, apply transitions, add captions and clean audio for a professional
              finish.
            </p>
          </div>
          <span className="text-white/90 text-xl italic font-serif rotate-[-3deg] hidden sm:block text-right">
            &ldquo;Better Transitions, Smoother Flow&rdquo;
          </span>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {statusCards.map((c) => {
          const Icon = c.icon;
          return (
            <Panel key={c.title} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-cc-muted" />
                  <span className="text-sm font-semibold text-white">{c.title}</span>
                </span>
                {c.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                )}
              </div>
              <p className="text-[10px] uppercase tracking-wide text-cc-dim mb-1.5">{c.tech}</p>
              <p className={cn("text-xs mb-3", c.done ? "text-cc-muted" : "text-cc-dim cc-pulse")}>
                {c.text}
              </p>
              <button className="text-[11px] text-indigo-300 hover:text-indigo-200 font-medium">
                {c.action} →
              </button>
            </Panel>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Player + scene list */}
        <div className="xl:col-span-2 space-y-5">
          <Panel className="overflow-hidden">
            <video
              src={videoUrl}
              controls
              className="w-full aspect-video bg-black"
              poster={project.source.thumbnail}
            />
            {cues.length > 0 && (
              <div className="px-4 py-2 border-t border-cc-border/60 text-xs text-cc-muted italic">
                &ldquo;{cues[Math.min(selectedScene * 2, cues.length - 1)]?.text || cues[0]?.text}&rdquo;
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[15px] text-white">Scene Detection Preview</h3>
              <LabeledToggle
                label="Show boundaries"
                checked={showBoundaries}
                onChange={setShowBoundaries}
              />
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto cc-scroll pr-1">
              {scenes.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setSelectedScene(sc.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors border",
                    selectedScene === sc.id
                      ? "border-indigo-500/50 bg-indigo-500/10"
                      : "border-transparent hover:bg-cc-panel2"
                  )}
                >
                  <span className="w-9 h-9 rounded-md overflow-hidden bg-cc-panel2 border border-cc-border shrink-0 flex items-center justify-center text-xs font-mono text-cc-dim">
                    {sc.thumbnail ? (
                       
                      <img src={sc.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      sc.id
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-white">{sc.label}</span>
                    <span className="block text-[10px] font-mono text-cc-dim">
                      {fmtTime(sc.start)} - {fmtTime(sc.end)}
                    </span>
                  </span>
                  <Badge
                    tone={
                      sc.type === "Intro" || sc.type === "Conclusion"
                        ? "accent"
                        : sc.type === "Topic Change"
                          ? "warn"
                          : "info"
                    }
                  >
                    [{sc.type}]
                  </Badge>
                  <Badge tone="neutral">Scene</Badge>
                </button>
              ))}
              {!scenes.length && (
                <p className="text-xs text-cc-dim text-center py-6 cc-pulse">
                  {job?.status === "running" ? job.stage : "No scenes detected yet."}
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* Settings */}
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wand2 className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-[15px] text-white">Polish Settings</h3>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="text-xs text-cc-muted mb-1.5 block">Transitions</label>
                <Select value={transitionType} onChange={setTransitionType} options={["Crossfade (Default)", "Cut Only", "Slide", "Zoom"]} />
                <div className="flex items-center gap-3 mt-2.5">
                  <span className="text-xs text-cc-muted">Duration</span>
                  <input
                    type="range"
                    min={0.2}
                    max={2}
                    step={0.1}
                    value={transitionDur}
                    onChange={(e) => setTransitionDur(parseFloat(e.target.value))}
                    className="cc-range flex-1"
                  />
                  <span className="text-xs font-mono text-white w-8 text-right">
                    {transitionDur.toFixed(1)}s
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs text-cc-muted mb-1.5 block">Captions</label>
                <Select value={captionFormat} onChange={setCaptionFormat} options={["SRT (Burn-in)", "SRT (Sidecar file)", "OFF"]} />
                <button className="mt-2 text-[11px] text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Style
                </button>
              </div>

              <div>
                <label className="text-xs text-cc-muted mb-1.5 block">Audio Cleanup</label>
                <Select value={audioMethod} onChange={setAudioMethod} options={["afftdn (Recommended)", "RNNoise", "OFF"]} />
                {applied && polish?.audio?.noiseBeforeDb !== undefined ? (
                  <p className="text-[11px] text-cc-dim mt-2 font-mono">
                    noise floor: {polish.audio.noiseBeforeDb}dB → {polish.audio.noiseAfterDb}dB
                  </p>
                ) : null}
              </div>

              <GradientButton
                className="w-full"
                disabled={job?.status === "running"}
                onClick={async () => {
                  try {
                    const jobId = await api.startPolish(project._id);
                    startJob(jobId);
                  } catch (e: any) {
                    showToast(e.message || "Failed to apply polish");
                  }
                }}
              >
                {job?.status === "running" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                {job?.status === "running" ? "Polishing..." : "Apply Polish →"}
              </GradientButton>
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="text-[11px] text-cc-dim leading-relaxed">
              Transitions are applied automatically: switching between camera and screen recording
              crossfades, screen-recording segments are joined with hard cuts so code stays sharp,
              and on-camera parts cut on a new topic and crossfade within the same topic. Captions
              are generated from the Whisper transcript and burned into the video during assembly.
            </p>
          </Panel>
        </div>
      </div>

      {/* Timeline editor */}
      <Panel className="mt-5 p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-[15px] text-white">Timeline Editor</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-cc-dim">Zoom</span>
            <input type="range" className="cc-range w-28" min={30} max={100} defaultValue={60} />
            <GhostButton className="text-xs py-1 px-2.5">Fit</GhostButton>
          </div>
        </div>

        <div className="overflow-x-auto cc-scroll">
          <div className="min-w-[720px]">
            {/* ruler */}
            <div className="flex justify-between text-[10px] font-mono text-cc-dim mb-1.5 px-1">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i}>{fmtTime((project.source.duration / 8) * i)}</span>
              ))}
            </div>

            {/* Video track */}
            <TrackRow icon={<Video className="w-3.5 h-3.5" />} label="Video">
              {project.segments.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    "h-11 rounded-md border flex items-center px-1.5 text-[10px] font-medium overflow-hidden shrink-0",
                    s.type === "keep"
                      ? "border-emerald-600/50 bg-emerald-500/15 text-emerald-200"
                      : s.type === "silence"
                        ? "border-blue-600/50 bg-blue-500/10 text-blue-200"
                        : "border-red-600/50 bg-red-500/10 text-red-200 opacity-70"
                  )}
                  style={{ width: `${Math.max(48, (s.duration / project.source.duration) * 100 * 4)}px` }}
                >
                  <span className="truncate">{i + 1} {s.label}</span>
                </div>
              ))}
            </TrackRow>

            {/* Transitions track */}
            <TrackRow icon={<ArrowLeftRight className="w-3.5 h-3.5" />} label="Transitions">
              {transitions.map((t) => (
                <div
                  key={t.id}
                  title={t.rationale}
                  className={cn(
                    "h-6 rounded flex items-center gap-1 px-2 text-[9px] font-medium shrink-0 border",
                    t.type === "crossfade"
                      ? "border-purple-500/50 bg-purple-500/15 text-purple-200"
                      : "border-cc-border bg-cc-panel2 text-cc-muted"
                  )}
                >
                  {t.type === "crossfade" ? "✕ Crossfade" : "▶ Cut"}
                </div>
              ))}
              {!transitions.length && <span className="text-[10px] text-cc-dim">After polish...</span>}
            </TrackRow>

            {/* Captions track */}
            <TrackRow icon={<Captions className="w-3.5 h-3.5" />} label="Captions">
              {cues.slice(0, 14).map((c) => (
                <div
                  key={c.index}
                  title={c.text}
                  className="h-6 rounded bg-indigo-900/50 border border-indigo-500/40 text-indigo-200 text-[9px] flex items-center px-1.5 overflow-hidden shrink-0"
                  style={{ width: `${Math.max(50, (c.text.length / 12) * 10)}px` }}
                >
                  <span className="truncate">{c.text}</span>
                </div>
              ))}
              {!cues.length && <span className="text-[10px] text-cc-dim">After polish...</span>}
            </TrackRow>

            {/* Audio track */}
            <TrackRow icon={<Waves className="w-3.5 h-3.5" />} label="Audio">
              <div className="h-8 flex-1 rounded overflow-hidden bg-emerald-500/10 border border-emerald-600/30 flex items-center px-1 gap-[1px]">
                {Array.from({ length: 120 }, (_, i) => (
                  <div
                    key={i}
                    className="w-[2px] bg-emerald-400/70 rounded-full"
                    style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 60}%` }}
                  />
                ))}
              </div>
            </TrackRow>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <div className="flex gap-1">
            <GhostButton className="text-xs py-1.5">
              <Undo2 className="w-3.5 h-3.5" /> Undo
            </GhostButton>
            <GhostButton className="text-xs py-1.5">
              <Redo2 className="w-3.5 h-3.5" /> Redo
            </GhostButton>
            <GhostButton className="text-xs py-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </GhostButton>
          </div>
          <div className="flex items-center gap-3">
            <GhostButton onClick={() => showToast("Draft saved")}>
              <Save className="w-4 h-4" /> Save Draft
            </GhostButton>
            <GradientButton onClick={() => setStep(5)}>
              Next: Generate Final Video <ChevronRight className="w-4 h-4" />
            </GradientButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function TrackRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="w-24 shrink-0 flex items-center gap-1.5 text-[10px] text-cc-dim font-medium">
        {icon}
        {label}
      </div>
      <div className="flex-1 flex items-center gap-1.5 overflow-hidden">{children}</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-cc-input border border-cc-border rounded-lg px-3 pr-8 py-2 text-xs text-white outline-none focus:border-indigo-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronRight className="w-3.5 h-3.5 text-cc-dim absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
    </div>
  );
}
