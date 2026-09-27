"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Upload,
  Save,
  Loader2,
  ArrowLeft,
  ChevronRight,
  Music,
  Settings2,
  Monitor,
  Smartphone,
  Square,
  Scissors,
  Captions,
  Sparkles,
  Film,
  Waves,
  Layers,
  Search,
  X,
} from "lucide-react";
import { Panel, GradientButton, GhostButton, Badge, LabeledToggle } from "../ui-bits";
import { api, fmtTime, playableUrl } from "@/lib/client/api";
import { useCC } from "../store";
import { cn } from "@/lib/utils";

function buildOutEntries(
  segs: { id: string; duration: number; transitionIn: string }[]
): { outStart: number; outEnd: number }[] {
  let t = 0;
  return segs.map((s) => {
    const crossfade = s.transitionIn === "crossfade";
    const start = Math.max(0, t - (crossfade ? 1 : 0));
    t = start + s.duration;
    return { outStart: start, outEnd: t };
  });
}

export function StepAssemble() {
  const { project, refreshProject, setStep, startJob, job, showToast } = useCC();
  const [timelineTab, setTimelineTab] = useState<"timeline" | "captions" | "transitions" | "audio" | "layers">("timeline");
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [tabIdx, setTabIdx] = useState(0);
  // true from the click until the server answers — the first request can take
  // seconds while the route compiles, and a second click used to start a
  // second render that corrupted the output
  const [starting, setStarting] = useState(false);

  const keeps = useMemo(
    () => (project?.segments || []).filter((s) => s.type === "keep"),
    [project]
  );
  const selected = keeps.find((s) => s.id === selectedSegId) || keeps[0] || null;

  const output = project?.output || {
    resolution: "1080p",
    format: "mp4",
    aspectRatio: "16:9",
    quality: "high",
    music: false,
    musicVolume: 60,
    burnSubtitles: true,
  } as any;

  const assembled = project?.status === "assembled" || project?.status === "exported" || !!project?.export?.url;

  // compute output timeline positions
  const outEntries = useMemo(
    () =>
      buildOutEntries(
        keeps.map((s) => ({ id: s.id, duration: s.duration, transitionIn: s.transitionIn }))
      ).map((e, i) => ({ ...e, seg: keeps[i] })),
    [keeps]
  );
  const totalDuration = outEntries.length ? outEntries[outEntries.length - 1].outEnd : 0;

  const cues = project?.polish?.captions?.cues || [];

  if (!project) return null;

  async function saveOutput(patch: any) {
    try {
      const updated = await api.patchProject(project!._id, { output: { ...output, ...patch } });
      useCC.setState({ project: updated });
    } catch (e: any) {
      showToast(e.message || "Failed to save settings");
    }
  }

  async function assemble() {
    if (starting) return;
    setStarting(true);
    try {
      const jobId = await api.startAssemble(project!._id);
      startJob(jobId, () => showToast("Assembly complete!"));
    } catch (e: any) {
      showToast(e.message || "Failed to start assembly");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="max-w-[1500px] mx-auto pb-28">
      {/* Top */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Timeline &amp; Assembly</h1>
          <p className="text-cc-muted mt-2 text-sm max-w-xl">
            We are combining your visuals, audio, captions and effects into a final video.
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl border px-4 py-3 flex items-start gap-3",
            assembled
              ? "border-indigo-500/40 bg-indigo-500/10"
              : "border-cc-border bg-cc-panel"
          )}
        >
          {job?.status === "running" ? (
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin mt-0.5" />
          ) : (
            <CheckCircle2 className={cn("w-5 h-5 mt-0.5", assembled ? "text-indigo-300" : "text-cc-dim")} />
          )}
          <div>
            <p className="text-sm font-semibold text-white">
              {job?.status === "running" ? "Assembling..." : assembled ? "Timeline Ready" : "Ready to Assemble"}
            </p>
            <p className="text-xs text-cc-muted mt-0.5">
              {keeps.length} segments · {fmtTime(totalDuration || project.source.duration)} duration
            </p>
            {job?.status === "running" && (
              <div className="w-48 h-1.5 bg-cc-panel2 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-gradient-to-r from-cc-accent to-cc-accent2 rounded-full transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Main: player + timeline */}
        <div className="xl:col-span-2 space-y-5">
          <Panel className="overflow-hidden relative">
            <video
              src={playableUrl(project.export?.url) || project.source.url}
              controls
              className="w-full aspect-video bg-black"
              poster={project.source.thumbnail}
            />
            {project.export?.url && (
              <span className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded font-mono">
                Scene 1 / {keeps.length}
              </span>
            )}
          </Panel>

          {/* Timeline */}
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex gap-1">
                {(
                  [
                    ["timeline", "Timeline", Scissors],
                    ["captions", "Captions", Captions],
                    ["transitions", "Transitions", Sparkles],
                    ["audio", "Audio", Music],
                    ["layers", "Layers", Layers],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setTimelineTab(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                      timelineTab === id
                        ? "bg-indigo-600/80 text-white"
                        : "text-cc-muted hover:text-white hover:bg-cc-panel2"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-cc-dim">Zoom:</span>
                <input type="range" className="cc-range w-24" min={30} max={100} defaultValue={60} />
                <Search className="w-3.5 h-3.5 text-cc-dim" />
                <GhostButton className="text-[11px] py-1 px-2.5">Fit</GhostButton>
              </div>
            </div>

            <div className="overflow-x-auto cc-scroll">
              <div className="min-w-[760px]">
                {/* ruler */}
                <div className="relative h-5 mb-2">
                  <div className="flex justify-between text-[10px] font-mono text-cc-dim">
                    {Array.from({ length: 10 }, (_, i) => (
                      <span key={i}>{fmtTime((totalDuration / 9) * i)}</span>
                    ))}
                  </div>
                  <div className="absolute top-0 bottom-0 left-[15%] w-px bg-white/80" />
                  <div className="absolute -top-0.5 left-[15%] -translate-x-1/2 text-white text-[8px]">▼</div>
                </div>

                {/* Visuals track */}
                <TrackRow icon={<Film className="w-3.5 h-3.5" />} label="Visuals">
                  {outEntries.map(({ seg, outStart }) => (
                    <div
                      key={seg.id}
                      className={cn(
                        "relative h-10 rounded border shrink-0 overflow-hidden cursor-pointer group",
                        seg.visual?.url
                          ? "border-blue-500/50"
                          : "border-cc-border opacity-80",
                        selected?.id === seg.id && "ring-2 ring-indigo-400"
                      )}
                      style={{ width: `${Math.max(64, (seg.duration / Math.max(totalDuration, 1)) * 760)}px` }}
                      onClick={() => setSelectedSegId(seg.id)}
                      title={`${seg.label} — output ${fmtTime(outStart)}`}
                    >
                      {seg.visual?.thumbUrl || seg.visual?.url ? (
                         
                        <img
                          src={seg.visual!.thumbUrl || seg.visual!.url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-[9px] text-cc-dim truncate px-1">{seg.label}</span>
                        </div>
                      )}
                      <span className="absolute top-0.5 right-0.5 hidden group-hover:flex w-3.5 h-3.5 bg-red-500/80 rounded-sm items-center justify-center text-white text-[8px]">
                        <X className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  ))}
                </TrackRow>

                {/* Audio track */}
                <TrackRow icon={<Waves className="w-3.5 h-3.5" />} label="Audio">
                  <div className="h-9 flex-1 rounded overflow-hidden bg-gradient-to-r from-emerald-500/15 to-cyan-500/15 border border-emerald-600/30 flex items-center px-1 gap-[1px]">
                    {Array.from({ length: 140 }, (_, i) => (
                      <div
                        key={i}
                        className="w-[2px] bg-emerald-400/70 rounded-full"
                        style={{ height: `${15 + Math.abs(Math.sin(i * 0.5 + tabIdx)) * 70}%` }}
                      />
                    ))}
                  </div>
                </TrackRow>

                {/* Captions track */}
                {timelineTab === "captions" && (
                  <TrackRow icon={<Captions className="w-3.5 h-3.5" />} label="Captions">
                    {cues.slice(0, 12).map((c) => (
                      <div
                        key={c.index}
                        className="h-7 rounded bg-indigo-900/60 border border-indigo-500/40 text-indigo-200 text-[9px] flex items-center px-2 overflow-hidden shrink-0"
                        style={{ width: `${Math.max(56, (totalDuration ? 5 : 5) * 14)}px` }}
                        title={c.text}
                      >
                        <span className="truncate">{c.text}</span>
                      </div>
                    ))}
                  </TrackRow>
                )}

                {/* Transitions track */}
                <TrackRow icon={<Sparkles className="w-3.5 h-3.5" />} label="Transitions">
                  {outEntries.slice(1).map(({ seg, outStart }) => (
                    <div
                      key={seg.id}
                      className={cn(
                        "h-6 rounded flex items-center gap-1 px-2 text-[9px] font-medium shrink-0 border",
                        seg.transitionIn === "crossfade"
                          ? "border-purple-500/50 bg-purple-500/15 text-purple-200"
                          : "border-cc-border bg-cc-panel2 text-cc-muted"
                      )}
                      style={{ marginLeft: 0 }}
                    >
                      {seg.transitionIn === "crossfade" ? "✕ Crossfade" : "▶ Cut"}
                    </div>
                  ))}
                </TrackRow>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right: segment details + output settings */}
        <div className="space-y-5">
          {selected ? (
            <Panel className="p-5">
              <h3 className="font-semibold text-[15px] text-white mb-4">Segment Details</h3>
              <div className="flex gap-3 mb-4">
                <div className="w-28 h-16 rounded-lg overflow-hidden border border-cc-border shrink-0 relative">
                  {project.source.mediaType === "video" ? (
                     
                    <img
                      src={`/api/thumb?src=${encodeURIComponent(project.source.url)}&t=${(selected.start + 0.2).toFixed(2)}&w=320`}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <span className="absolute top-1 right-1">
                    <Badge tone="accent" className="text-[9px]">{selected.label}</Badge>
                  </span>
                </div>
                <div className="text-xs">
                  <p className="font-mono text-cc-muted">
                    {fmtTime(selected.start)} - {fmtTime(selected.end)} ({selected.duration.toFixed(0)}s)
                  </p>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-cc-dim mb-1">Transcript</p>
                  <p className="text-white leading-relaxed">{selected.text.slice(0, 220)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-cc-dim mb-1.5">Visual Prompt</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.visualKeywords?.length
                      ? selected.visualKeywords
                      : (selected.visualPrompt || "auto").split(/\s+/).slice(0, 4)
                    ).map((k, i) => (
                      <Badge key={i} tone="neutral" className="text-[10px]">{k}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-cc-dim">Source</p>
                  <span className="flex items-center gap-1.5 text-white">
                    <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] font-bold text-white">
                      {selected.visual?.source?.[0]?.toUpperCase() || "T"}
                    </span>
                    {selected.visual
                      ? selected.visual.kind === "stock_video"
                        ? "Stock Video (Pexels)"
                        : selected.visual.kind === "ai_generated"
                          ? "AI Generated"
                          : "Stock Image"
                      : "Talking Head"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-cc-dim">Status</p>
                  <Badge tone={selected.status === "rejected" ? "cut" : "keep"}>
                    {selected.status === "rejected" ? "Rejected" : "Approved"}
                  </Badge>
                </div>
                <div className="flex gap-2 pt-1">
                  <GhostButton
                    className="text-xs flex-1 py-2"
                    onClick={async () => {
                      const updated = await api.patchProject(project._id, {
                        segments: [{ id: selected.id, status: "rejected" }],
                      });
                      useCC.setState({ project: updated });
                    }}
                  >
                    Reject
                  </GhostButton>
                  <GradientButton
                    className="text-xs flex-1 py-2"
                    onClick={() => setStep(3)}
                  >
                    Replace Visual
                  </GradientButton>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-[15px] text-white">Final Output Settings</h3>
            </div>

            <div>
              <label className="text-xs text-cc-muted mb-1.5 block">Video Resolution</label>
              <SettingsSelect
                value={output.resolution}
                onChange={(v) => saveOutput({ resolution: v })}
                options={["480p", "720p", "1080p"]}
                labels={["480p (SD)", "720p (HD)", "1080p (Full HD)"]}
              />
            </div>
            <div>
              <label className="text-xs text-cc-muted mb-1.5 block">Format</label>
              <SettingsSelect
                value={output.format}
                onChange={(v) => saveOutput({ format: v })}
                options={["mp4", "mov", "gif"]}
                labels={["MP4 (H.264)", "MOV (QuickTime)", "GIF (10s preview)"]}
              />
            </div>
            <div>
              <label className="text-xs text-cc-muted mb-1.5 block">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "16:9", icon: Monitor, label: "16:9" },
                  { id: "9:16", icon: Smartphone, label: "9:16" },
                  { id: "1:1", icon: Square, label: "1:1" },
                ].map((r) => {
                  const Icon = r.icon;
                  const active = output.aspectRatio === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => saveOutput({ aspectRatio: r.id })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-xs font-medium transition-all",
                        active
                          ? "border-cc-accent bg-indigo-500/15 text-indigo-200"
                          : "border-cc-border bg-cc-panel2 text-cc-muted hover:text-white"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-cc-border/60 pt-3">
              <div className="flex items-center gap-2 mb-2">
                <Music className="w-4 h-4 text-indigo-400" />
                <h4 className="text-sm font-semibold text-white">Audio Settings</h4>
              </div>
              <LabeledToggle
                label="Background Music"
                checked={output.music}
                onChange={(v) => saveOutput({ music: v })}
              />
              {output.music && (
                <div className="mt-2 space-y-2.5 pl-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-cc-muted w-14">Volume</span>
                    <input
                      type="range"
                      className="cc-range flex-1"
                      min={0}
                      max={100}
                      value={output.musicVolume ?? 60}
                      onChange={(e) => saveOutput({ musicVolume: parseInt(e.target.value) })}
                    />
                    <span className="text-xs font-mono text-white w-8 text-right">
                      {output.musicVolume ?? 60}%
                    </span>
                  </div>
                  <SettingsSelect
                    value={output.musicTrack || "inspirational"}
                    onChange={(v) => saveOutput({ musicTrack: v })}
                    options={["inspirational", "calm", "upbeat"]}
                    labels={["🎵 Inspirational Corporate", "🌙 Calm Ambient", "⚡ Upbeat Energy"]}
                  />
                </div>
              )}
            </div>

            <div className="border-t border-cc-border/60 pt-3">
              <h4 className="text-sm font-semibold text-white mb-2">Export Options</h4>
              <LabeledToggle
                label="Add Subtitles (Burn-in)"
                checked={output.burnSubtitles}
                onChange={(v) => saveOutput({ burnSubtitles: v })}
              />
              <LabeledToggle
                label="Optimize File Size"
                checked={!!output.optimizeSize}
                onChange={(v) => saveOutput({ optimizeSize: v })}
              />
            </div>

            <GradientButton
              className="w-full py-3"
              onClick={assemble}
              disabled={starting || job?.status === "running"}
            >
              {starting || job?.status === "running" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {starting ? "Starting..." : job?.status === "running" ? "Rendering..." : "Export Final Video"}
            </GradientButton>
          </Panel>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-cc-border/70 bg-cc-panel/95 backdrop-blur px-4 md:px-8 py-3 flex items-center justify-between">
        <button
          className="text-sm text-cc-muted hover:text-white inline-flex items-center gap-1.5"
          onClick={() => setStep(4)}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Polish
        </button>
        <div className="flex items-center gap-3">
          <GhostButton onClick={() => showToast("Project saved")}>
            <Save className="w-4 h-4" /> Save Project
          </GhostButton>
          <GradientButton
            onClick={async () => {
              if (!assembled) {
                showToast("Export the video first");
                return;
              }
              setStep(6);
            }}
          >
            Continue to Review <ChevronRight className="w-4 h-4" />
          </GradientButton>
        </div>
      </div>
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
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-24 shrink-0 flex items-center gap-1.5 text-[10px] text-cc-dim font-medium">
        {icon}
        {label}
      </div>
      <div className="flex-1 flex items-center gap-1.5 overflow-hidden">{children}</div>
    </div>
  );
}

function SettingsSelect({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-cc-input border border-cc-border rounded-lg px-3 pr-8 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
      >
        {options.map((o, i) => (
          <option key={o} value={o}>
            {labels?.[i] || o}
          </option>
        ))}
      </select>
      <ChevronRight className="w-3.5 h-3.5 text-cc-dim absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
    </div>
  );
}
