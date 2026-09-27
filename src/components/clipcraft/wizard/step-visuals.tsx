"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Play,
  Search,
  Sparkles,
  Film,
  Image as ImageIcon,
  Zap,
  Eye,
  ZoomIn,
  ArrowLeft,
  Save,
  ChevronRight,
  Loader2,
  Plus,
  Check,
  Clapperboard,
} from "lucide-react";
import { Panel, SectionTitle, GradientButton, GhostButton, Badge, LabeledToggle } from "../ui-bits";
import { api, fmtTimeMs, type PublicProject, type StockResultItem } from "@/lib/client/api";
import { useCC } from "../store";
import type { TimelineSegment } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StepVisuals() {
  const { project, refreshProject, setStep, showToast } = useCC();
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [tab, setTab] = useState<"stock" | "ai">("stock");
  const [mediaFilter, setMediaFilter] = useState<"all" | "videos" | "images">("all");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<"all" | "stock" | "ai">("all");

  // b-roll only goes over on-camera parts; covering a screen recording would hide the code
  const keeps = useMemo(
    () => (project?.segments || []).filter((s) => s.type === "keep" && s.layout !== "screen"),
    [project]
  );
  const screenCount = useMemo(
    () => (project?.segments || []).filter((s) => s.type === "keep" && s.layout === "screen").length,
    [project]
  );

  const selected = keeps.find((s) => s.id === selectedSegId) || keeps[0] || null;

  useEffect(() => {
    if (keeps.length && !keeps.find((s) => s.id === selectedSegId)) {
      setSelectedSegId(keeps[0].id);
    }
  }, [keeps, selectedSegId]);

  // auto-search with the segment's visual prompt when selection changes
  useEffect(() => {
    if (!selected || !project) return;
    const q = selected.visualPrompt || selected.label;
    if (q && (!query || query !== q)) {
      setQuery(q);
      doSearch(q);
    }
     
  }, [selectedSegId, selected?.visualPrompt]);

  async function doSearch(q?: string) {
    if (!project) return;
    const queryText = (q ?? query).trim();
    if (!queryText) return;
    setSearching(true);
    setResults([]);
    setNote("");
    try {
      const d = await api.searchStock(project._id, queryText, 12);
      setResults(d.results);
      setNote(d.note || "");
      if (d.usedSource === "pexels") showToast("Results from Pexels");
      else if (d.usedSource === "pixabay") showToast("Results from Pixabay");
      else if (d.usedSource === "web") showToast("Results from web image search");
    } catch (e: any) {
      showToast(e.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function assignStock(item: StockResultItem) {
    if (!project || !selected) return;
    setAssigning(item.id);
    try {
      await api.assignVisual(project._id, selected.id, { stockItem: item });
      await refreshProject();
      showToast(`Visual added to "${selected.label}"`);
    } catch (e: any) {
      showToast(e.message || "Failed to assign visual");
    } finally {
      setAssigning(null);
    }
  }

  async function generate() {
    if (!project || !selected) return;
    const prompt = genPrompt.trim() || selected.visualPrompt || selected.label;
    setGenerating(true);
    try {
      const { visual } = await api.generateVisual(project._id, prompt);
      await api.assignVisual(project._id, selected.id, { visual });
      await refreshProject();
      showToast("AI visual generated & assigned");
    } catch (e: any) {
      showToast(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function updateKenBurns(seg: TimelineSegment, patch: Partial<any>) {
    if (!project) return;
    const visual = { ...(seg.visual || {}), kenBurns: { ...(seg.visual?.kenBurns || {}), ...patch } };
    try {
      await api.patchProject(project._id, {
        segments: [{ id: seg.id, ...{} }],
      });
      // visual updates go through assign
      await api.assignVisual(project._id, seg.id, { visual });
      await refreshProject();
    } catch (e: any) {
      showToast(e.message || "Failed to update");
    }
  }

  async function removeVisual(seg: TimelineSegment) {
    if (!project) return;
    try {
      await api.assignVisual(project._id, seg.id, { visual: null });
      await refreshProject();
    } catch (e: any) {
      showToast(e.message || "Failed to remove");
    }
  }

  if (!project) return null;

  const filteredResults = results.filter((r) =>
    mediaFilter === "all" ? true : mediaFilter === "videos" ? r.kind === "stock_video" : r.kind === "stock_image"
  );

  const library = project.segments.filter((s) => s.visual?.url);
  const libraryFiltered = library.filter((s) =>
    libraryTab === "all"
      ? true
      : libraryTab === "stock"
        ? s.visual!.kind !== "ai_generated"
        : s.visual!.kind === "ai_generated"
  );

  return (
    <div className="max-w-[1500px] mx-auto pb-28">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-6 border border-cc-border/60">
        <div className="absolute inset-0 bg-gradient-to-r from-[#0e1a2b] via-[#16233f] to-[#231a45]" />
        <div className="relative px-6 md:px-10 py-10 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-lg bg-cc-info/20 border border-cc-info/30 flex items-center justify-center mt-1">
              <ImageIcon className="w-5 h-5 text-blue-400" />
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Visual Generation</h1>
              <p className="text-cc-muted mt-2 text-sm max-w-xl">
                Find or generate visuals for your key segments. We&apos;ll match stock media
                first, and use AI when needed.
              </p>
            </div>
          </div>
          <span className="text-white/90 text-xl italic font-serif rotate-[-3deg] hidden sm:block text-right">
            &ldquo;Compelling Visuals = Higher Engagement&rdquo;
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Col 1: current segment */}
        <div className="space-y-5">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-cc-border/60">
              <h3 className="font-semibold text-[15px] text-white">Current Segment</h3>
              <Clapperboard className="w-4 h-4 text-cc-dim" />
            </div>
            <video
              src={project.source.url}
              controls
              className="w-full aspect-video bg-black"
              poster={project.source.thumbnail}
            />
            {selected ? (
              <div className="p-4 space-y-3">
                <Badge tone="accent">
                  Segment {selected.index + 1} · {fmtTimeMs(selected.start)} -{" "}
                  {fmtTimeMs(selected.end)}
                </Badge>
                <div>
                  <p className="text-sm font-semibold text-white">{selected.label}</p>
                  <p className="text-xs text-cc-muted mt-1 leading-relaxed line-clamp-3">
                    Transcript: {selected.text.slice(0, 160)}
                    {selected.text.length > 160 ? "..." : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <GradientButton className="flex-1 text-xs py-2" onClick={() => doSearch(selected.visualPrompt || selected.label)}>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate Visuals
                  </GradientButton>
                  <GhostButton
                    className="text-xs py-2"
                    onClick={() => {
                      const idx = keeps.findIndex((s) => s.id === selected.id);
                      const next = keeps[(idx + 1) % keeps.length];
                      if (next) setSelectedSegId(next.id);
                    }}
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </GhostButton>
                </div>
                {selected.visual?.url ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2">
                    <span className="text-xs text-emerald-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Visual assigned
                    </span>
                    <button
                      className="text-[11px] text-red-300 hover:text-red-200"
                      onClick={() => removeVisual(selected)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Panel>

          {/* Segment selector */}
          <Panel className="p-4">
            <p className="text-xs uppercase tracking-wide text-cc-dim mb-2">Segments</p>
            {screenCount > 0 && (
              <p className="text-[11px] text-cc-muted mb-2">
                {screenCount} screen-recording segment{screenCount === 1 ? "" : "s"} hidden. B-roll is
                only added to on-camera parts, so your code stays visible.
              </p>
            )}
            <div className="max-h-56 overflow-y-auto cc-scroll space-y-1.5">
              {keeps.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSegId(s.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected?.id === s.id ? "bg-indigo-500/15" : "hover:bg-cc-panel2"
                  )}
                >
                  <span
                    className={cn(
                      "w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-mono shrink-0 border",
                      s.visual?.url
                        ? "border-emerald-600/50 bg-emerald-500/15 text-emerald-300"
                        : "border-cc-border bg-cc-panel2 text-cc-dim"
                    )}
                  >
                    {s.index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-white truncate">{s.label}</span>
                    <span className="block text-[10px] text-cc-dim font-mono">
                      {fmtTimeMs(s.start)} - {fmtTimeMs(s.end)}
                    </span>
                  </span>
                  {s.visual?.url ? (
                    <Badge tone="keep">
                      <Check className="w-3 h-3" />
                    </Badge>
                  ) : (
                    <Badge tone="neutral">none</Badge>
                  )}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* Col 2: stock + timeline preview */}
        <div className="space-y-5">
          <Panel className="p-4">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setTab("stock")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                  tab === "stock"
                    ? "bg-cc-accent text-white"
                    : "bg-cc-panel2 text-cc-muted hover:text-white border border-cc-border"
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Stock Media (Pexels/Pixabay)
              </button>
              <button
                onClick={() => setTab("ai")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                  tab === "ai"
                    ? "bg-cc-accent text-white"
                    : "bg-cc-panel2 text-cc-muted hover:text-white border border-cc-border"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI Generated (Hugging Face)
              </button>
            </div>

            {tab === "stock" ? (
              <>
                <form
                  className="relative mb-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    doSearch();
                  }}
                >
                  <Search className="w-4 h-4 text-cc-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search visuals for: "${selected?.visualPrompt || selected?.label || "keywords"}"...`}
                    className="w-full bg-cc-input border border-cc-border rounded-full pl-9 pr-4 py-2 text-xs text-white placeholder:text-cc-dim outline-none focus:border-indigo-500"
                  />
                </form>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {(["all", "videos", "images"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setMediaFilter(f)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[11px] font-medium border capitalize transition-all",
                        mediaFilter === f
                          ? "bg-cc-accent/20 border-cc-accent/50 text-indigo-200"
                          : "bg-cc-panel2 border-cc-border text-cc-muted hover:text-white"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                  <span className="ml-auto text-[10px] text-cc-dim">Orientation: Any ▾ Duration: Any ▾</span>
                </div>

                {note && (
                  <p className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5 mb-3">
                    {note}
                  </p>
                )}

                {searching ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="aspect-video rounded-lg bg-cc-panel2 animate-pulse" />
                    ))}
                  </div>
                ) : filteredResults.length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-105 overflow-y-auto cc-scroll pr-1">
                    {filteredResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => assignStock(item)}
                        className="group relative rounded-lg overflow-hidden border border-cc-border hover:border-indigo-500/70 transition-all bg-cc-panel2"
                      >
                        <div className="aspect-video relative">
                          { }
                          <img
                            src={item.thumbUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {item.kind === "stock_video" && (
                            <Play className="w-3.5 h-3.5 text-white fill-white absolute bottom-1.5 left-1.5 drop-shadow" />
                          )}
                          {assigning === item.id ? (
                            <span className="absolute inset-0 bg-indigo-950/70 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                            </span>
                          ) : (
                            <span className="absolute inset-0 bg-indigo-950/0 group-hover:bg-indigo-950/40 transition-colors items-center justify-center hidden group-hover:flex">
                              <span className="text-[10px] font-semibold bg-indigo-500 text-white px-2 py-1 rounded">
                                Add to segment
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-1">
                          <Badge tone="accent" className="text-[9px]">{item.source}</Badge>
                          {item.duration ? (
                            <span className="text-[9px] font-mono text-cc-dim">
                              {String(Math.floor(item.duration / 60)).padStart(2, "0")}:
                              {String(item.duration % 60).padStart(2, "0")}
                            </span>
                          ) : (
                            <ImageIcon className="w-3 h-3 text-cc-dim" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Search className="w-6 h-6 mx-auto text-cc-dim mb-2" />
                    <p className="text-xs text-cc-muted">No results yet — search for visuals above.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 mx-auto text-indigo-400 mb-3" />
                <p className="text-sm font-semibold text-white mb-1">No matching stock found?</p>
                <p className="text-xs text-cc-muted mb-4">
                  Generate custom visuals with AI for &ldquo;{selected?.label}&rdquo;.
                </p>
                <input
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder={selected?.visualPrompt || "Describe the visual you want..."}
                  className="w-full bg-cc-input border border-cc-border rounded-lg px-3 py-2.5 text-xs text-white placeholder:text-cc-dim outline-none focus:border-indigo-500 mb-3"
                />
                <GradientButton className="w-full" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {generating ? "Generating..." : "Generate with Stable Diffusion / FLUX"}
                </GradientButton>
              </div>
            )}
          </Panel>

          {/* Timeline preview */}
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[15px] text-white">Timeline Preview</h3>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-cc-dim">
                  <span className="w-2 h-2 rounded-sm bg-blue-400" /> Video
                </span>
                <span className="flex items-center gap-1 text-[10px] text-cc-dim">
                  <span className="w-2 h-2 rounded-sm bg-purple-400" /> AI
                </span>
                <span className="flex items-center gap-1 text-[10px] text-cc-dim">
                  <span className="w-2 h-2 rounded-sm bg-emerald-400" /> Image
                </span>
              </div>
            </div>
            <div className="relative">
              <div className="flex justify-between text-[9px] font-mono text-cc-dim mb-1">
                {["00:00", "00:05", "00:10", "00:15", "00:20", "00:25", "00:30"].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <div className="flex gap-1 h-12">
                {keeps.map((s) => (
                  <div
                    key={s.id}
                    title={`${s.label} (${fmtTimeMs(s.start)}-${fmtTimeMs(s.end)})`}
                    className={cn(
                      "h-full rounded border text-[9px] flex items-center justify-center overflow-hidden cursor-pointer transition-all",
                      s.visual?.url
                        ? s.visual!.kind === "stock_video"
                          ? "border-blue-500/60 bg-blue-500/15 text-blue-200"
                          : s.visual!.kind === "ai_generated"
                            ? "border-purple-500/60 bg-purple-500/15 text-purple-200"
                            : "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                        : "border-cc-border bg-cc-panel2 text-cc-dim",
                      selected?.id === s.id && "ring-2 ring-indigo-400/70"
                    )}
                    style={{ flexGrow: Math.max(1, s.end - s.start) }}
                    onClick={() => setSelectedSegId(s.id)}
                  >
                    <span className="truncate px-1">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* Col 3: tools + library + mapping */}
        <div className="space-y-5">
          <Panel className="p-4">
            <h3 className="font-semibold text-sm text-white mb-3">AI Image Generation (Fallback)</h3>
            {selected?.visual?.kind === "ai_generated" && selected.visual.url ? (
              <div className="rounded-lg overflow-hidden border border-purple-500/40">
                { }
                <img src={selected.visual.url} alt="AI generated" className="w-full" />
                <p className="text-[10px] text-purple-300 px-2 py-1.5 bg-purple-500/10">
                  Assigned to this segment
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-dashed border-indigo-500/40 p-5 text-center mb-3">
                  <ImageIcon className="w-6 h-6 mx-auto text-indigo-400 mb-2" />
                  <p className="text-xs font-semibold text-white">No matching stock found?</p>
                  <p className="text-[11px] text-cc-muted mt-0.5">Generate custom visuals with AI.</p>
                </div>
                <GradientButton className="w-full text-xs" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Generate with Stable Diffusion / FLUX
                </GradientButton>
              </>
            )}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Film className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-sm text-white">Ken Burns Effect</h3>
            </div>
            <LabeledToggle
              label="Apply Ken Burns Effect"
              checked={!!selected?.visual?.kenBurns?.enabled}
              onChange={(v) => selected && updateKenBurns(selected, { enabled: v })}
            />
            <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-cc-muted w-14">Direction</span>
                <div className="flex gap-1.5">
                  {(["in", "out"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => selected && updateKenBurns(selected, { direction: d })}
                      className={cn(
                        "px-3 py-1.5 rounded-md border text-xs font-medium capitalize transition-all inline-flex items-center gap-1.5",
                        selected?.visual?.kenBurns?.direction === d
                          ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
                          : "border-cc-border bg-cc-panel2 text-cc-muted hover:text-white"
                      )}
                    >
                      <ZoomIn className="w-3 h-3" />
                      Zoom {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-cc-muted w-14">Intensity</span>
                <input
                  type="range"
                  className="cc-range flex-1"
                  min={1.05}
                  max={1.4}
                  step={0.05}
                  value={selected?.visual?.kenBurns?.intensity || 1.15}
                  onChange={(e) =>
                    selected && updateKenBurns(selected, { intensity: parseFloat(e.target.value) })
                  }
                />
                <span className="font-mono text-[10px] text-cc-dim w-9 text-right">
                  {(selected?.visual?.kenBurns?.intensity || 1.15).toFixed(2)}x
                </span>
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-white">Visual Library</h3>
              <div className="flex gap-1">
                {(["all", "stock", "ai"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLibraryTab(t)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium",
                      libraryTab === t ? "bg-cc-accent/20 text-indigo-200" : "text-cc-dim hover:text-white"
                    )}
                  >
                    {t === "all" ? "All" : t === "stock" ? "Stock" : "AI Generated"}
                  </button>
                ))}
              </div>
            </div>
            {libraryFiltered.length ? (
              <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto cc-scroll">
                {libraryFiltered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSegId(s.id)}
                    className="relative rounded-lg overflow-hidden border border-cc-border hover:border-indigo-500/60 group"
                    title={s.label}
                  >
                    { }
                    <img
                      src={s.visual!.thumbUrl || s.visual!.url}
                      alt={s.label}
                      className="w-full aspect-video object-cover"
                      loading="lazy"
                    />
                    <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 rounded truncate max-w-[90%]">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-cc-dim text-center py-6">
                No visuals in library yet
              </p>
            )}
          </Panel>

          <Panel className="p-4">
            <h3 className="font-semibold text-sm text-white">Visual to Timeline Mapping</h3>
            <p className="text-[11px] text-cc-dim mt-0.5 mb-3">
              Link generated/fetched visuals to the correct segments.
            </p>
            <div className="max-h-52 overflow-y-auto cc-scroll space-y-2">
              {keeps.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2.5 rounded-lg bg-cc-panel2/60 px-2.5 py-2"
                >
                  <span className="w-10 h-6 rounded overflow-hidden bg-cc-panel shrink-0 border border-cc-border">
                    {s.visual?.thumbUrl || s.visual?.url ? (
                       
                      <img
                        src={s.visual!.thumbUrl || s.visual!.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-white truncate">
                      Segment {s.index + 1} · {s.label}
                    </span>
                    <span className="block text-[9px] font-mono text-cc-dim">
                      {fmtTimeMs(s.start)} - {fmtTimeMs(s.end)}
                    </span>
                  </span>
                  {s.visual?.url ? (
                    <Badge tone="keep">
                      <Check className="w-3 h-3" />
                    </Badge>
                  ) : (
                    <button
                      className="text-[10px] font-semibold text-blue-300 hover:text-blue-200 border border-blue-500/40 rounded px-2 py-1"
                      onClick={() => {
                        setSelectedSegId(s.id);
                        if (s.visualPrompt) {
                          setQuery(s.visualPrompt);
                          doSearch(s.visualPrompt);
                        }
                      }}
                    >
                      <Plus className="w-3 h-3 inline mr-0.5" />
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-cc-border/70 bg-cc-panel/95 backdrop-blur px-4 md:px-8 py-3 flex items-center justify-between">
        <button
          className="text-sm text-cc-muted hover:text-white inline-flex items-center gap-1.5"
          onClick={() => setStep(2)}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-cc-dim hidden xl:inline">
            {library.length}/{keeps.length} segments have visuals
          </span>
          <GhostButton onClick={() => showToast("Project saved")}>
            <Save className="w-4 h-4" /> Save Project
          </GhostButton>
          <GradientButton onClick={() => setStep(4)}>
            Continue to Polish <ChevronRight className="w-4 h-4" />
          </GradientButton>
        </div>
      </div>
    </div>
  );
}
