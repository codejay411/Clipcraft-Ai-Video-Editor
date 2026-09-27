"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Play,
  Trash2,
  FolderOpen,
  MoreVertical,
  Loader2,
  Sparkles,
  Clock,
  Film,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import { Panel, GradientButton, Badge, EmptyState } from "../ui-bits";
import { api, fmtTime, humanSize, type PublicProject } from "@/lib/client/api";
import { useCC } from "../store";
import { cn } from "@/lib/utils";

export function ProjectsView() {
  const { setProject, setNav } = useCC();
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">My Projects</h1>
          <p className="text-sm text-cc-muted mt-1">
            {projects.length} project{projects.length === 1 ? "" : "s"} in your workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-cc-dim absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="bg-cc-input border border-cc-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-cc-dim outline-none focus:border-indigo-500 w-56"
            />
          </div>
          <GradientButton onClick={() => setNav("new")}>
            <Plus className="w-4 h-4" /> New Project
          </GradientButton>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-video rounded-xl bg-cc-panel animate-pulse" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Panel
              key={p._id}
              className="group overflow-hidden hover:border-indigo-500/50 transition-all cursor-pointer"
              onClick={() => {
                setProject(p);
                setNav("wizard");
                useCC.setState({ step: Math.min(6, Math.max(p.currentStep || 1, 1)) });
              }}
            >
              <div className="relative aspect-video bg-cc-panel2 overflow-hidden">
                {p.source.thumbnail ? (
                   
                  <img
                    src={p.source.thumbnail}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-8 h-8 text-cc-dim" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <StatusBadge status={p.status} />
                </div>
                <span className="absolute bottom-2 left-2 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                  {fmtTime(p.source.duration)}
                </span>
                <span className="absolute inset-0 bg-indigo-950/0 group-hover:bg-indigo-950/30 transition-colors items-center justify-center hidden group-hover:flex">
                  <span className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="w-5 h-5 text-slate-900 fill-slate-900 ml-0.5" />
                  </span>
                </span>
              </div>
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                    <p className="text-[11px] text-cc-dim mt-0.5">
                      {new Date(p.createdAt).toLocaleDateString()} · step {p.currentStep}/6
                    </p>
                  </div>
                  <button
                    className="text-cc-dim hover:text-red-400 shrink-0"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api.deleteProject(p._id);
                      setProjects((ps) => ps.filter((x) => x._id !== p._id));
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {p.description ? (
                  <p className="text-xs text-cc-muted mt-2 line-clamp-2">{p.description}</p>
                ) : null}
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="py-16">
          <EmptyState
            icon={<FolderOpen className="w-10 h-10" />}
            title="No projects yet"
            hint="Create your first project — upload a video or pick a sample to see the pipeline in action."
          />
          <div className="flex justify-center">
            <GradientButton onClick={() => setNav("new")}>
              <Plus className="w-4 h-4" /> Create Your First Project
            </GradientButton>
          </div>
        </Panel>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    created: { tone: "neutral", label: "Draft" },
    analyzing: { tone: "info", label: "Analyzing" },
    analyzed: { tone: "accent", label: "Analyzed" },
    visuals: { tone: "accent", label: "Visuals" },
    polishing: { tone: "info", label: "Polishing" },
    polished: { tone: "accent", label: "Polished" },
    assembling: { tone: "info", label: "Rendering" },
    assembled: { tone: "keep", label: "Ready" },
    exporting: { tone: "info", label: "Exporting" },
    exported: { tone: "keep", label: "Exported" },
  };
  const cfg = map[status] || { tone: "neutral", label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

export function MediaView() {
  const { project } = useCC();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const projects = await api.listProjects();
        const items: any[] = [];
        for (const p of projects) {
          items.push({
            id: `src-${p._id}`,
            kind: p.source.mediaType === "video" ? "video" : "audio",
            url: p.source.url,
            thumb: p.source.thumbnail,
            name: p.source.filename,
            project: p.name,
            date: p.createdAt,
          });
          for (const s of p.segments || []) {
            if (s.visual?.url) {
              items.push({
                id: `vis-${s.id}`,
                kind: s.visual.kind === "stock_video" ? "video" : "image",
                url: s.visual.url,
                thumb: s.visual.thumbUrl || s.visual.url,
                name: `${s.label} visual`,
                project: p.name,
                date: p.updatedAt,
              });
            }
          }
          if (p.export?.url) {
            items.push({
              id: `exp-${p._id}`,
              kind: "video",
              url: p.export.url,
              thumb: undefined,
              name: "Final export",
              project: p.name,
              date: p.export.exportedAt || p.updatedAt,
            });
          }
          for (const t of p.thumbnails || []) {
            items.push({
              id: `th-${t.id}`,
              kind: "image",
              url: t.url,
              thumb: t.url,
              name: t.headline,
              project: p.name,
              date: p.updatedAt,
            });
          }
        }
        setAssets(items);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <h1 className="text-2xl font-bold text-white mb-1">Media Library</h1>
      <p className="text-sm text-cc-muted mb-6">
        All uploads, stock assets, AI visuals and renders across your projects.
      </p>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="aspect-video rounded-xl bg-cc-panel animate-pulse" />
          ))}
        </div>
      ) : assets.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((a) => (
            <Panel key={a.id} className="overflow-hidden group">
              <div className="relative aspect-video bg-cc-panel2">
                {a.kind === "image" ? (
                   
                  <img src={a.thumb || a.url} alt={a.name} className="w-full h-full object-cover" />
                ) : (
                  <video src={a.url} className="w-full h-full object-cover" preload="metadata" muted />
                )}
                <span className="absolute top-1.5 right-1.5">
                  <Badge tone="neutral" className="text-[9px]">{a.kind}</Badge>
                </span>
              </div>
              <div className="p-2.5">
                <p className="text-xs font-medium text-white truncate">{a.name}</p>
                <p className="text-[10px] text-cc-dim truncate">{a.project}</p>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel className="py-16">
          <EmptyState
            icon={<ImageIcon className="w-10 h-10" />}
            title="Media library is empty"
            hint="Assets you upload or generate will appear here."
          />
        </Panel>
      )}
    </div>
  );
}

const TEMPLATES = [
  {
    name: "Talking Head → Short",
    desc: "Trim fillers & silence, punchy captions, bold visuals",
    duration: "1-3 min",
    steps: ["Whisper transcription", "Filler removal", "Burn-in captions"],
    icon: Sparkles,
  },
  {
    name: "Podcast Clip",
    desc: "Best moments, waveform intro, crossfade segments",
    duration: "30-60 sec",
    steps: ["Silence trim", "B-roll overlay", "Crossfades"],
    icon: Play,
  },
  {
    name: "Course Lesson",
    desc: "Structured chapters, slides visuals, SRT export",
    duration: "5-15 min",
    steps: ["Scene detection", "Ken Burns images", "Sidecar SRT"],
    icon: Clock,
  },
  {
    name: "Voice Memo → Video",
    desc: "Audio-only input, AI visuals, music bed",
    duration: "1-5 min",
    steps: ["Audio analysis", "AI-generated visuals", "Music mix"],
    icon: Film,
  },
];

export function TemplatesView() {
  const { setNav } = useCC();
  return (
    <div className="max-w-5xl mx-auto pb-10">
      <h1 className="text-2xl font-bold text-white mb-1">Templates</h1>
      <p className="text-sm text-cc-muted mb-6">
        Start from a preset tuned for your content type — the pipeline adapts automatically.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <Panel key={t.name} className="p-5 hover:border-indigo-500/50 transition-all">
              <div className="flex items-start gap-4">
                <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-cc-accent/30 to-cc-accent2/20 border border-cc-accent/30 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-indigo-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                    <Badge tone="neutral">{t.duration}</Badge>
                  </div>
                  <p className="text-xs text-cc-muted mt-1">{t.desc}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {t.steps.map((s) => (
                      <Badge key={s} tone="accent" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <GradientButton className="w-full mt-4 text-xs py-2" onClick={() => setNav("new")}>
                <Plus className="w-3.5 h-3.5" /> Use This Template
              </GradientButton>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

export function HelpView() {
  return (
    <div className="max-w-3xl mx-auto pb-10">
      <h1 className="text-2xl font-bold text-white mb-1">Help &amp; Docs</h1>
      <p className="text-sm text-cc-muted mb-6">
        How the ClipCraft AI pipeline works, end to end.
      </p>
      <div className="space-y-4">
        {[
          {
            title: "1. Input",
            body: "Upload a video or audio file (MP4, MOV, AVI, MKV, MP3, WAV, M4A up to 2GB), import from a direct URL, or record from your microphone. You can also start from a sample video with natural speech, filler words and pauses.",
          },
          {
            title: "2. Analyze",
            body: "Whisper transcribes your audio with word-level timestamps. FFmpeg's silencedetect finds long pauses. Filler words (um, uh, you know...) are detected and marked for removal. An LLM of your choice (Groq, OpenAI, Gemini, Claude, GLM, or local Ollama) reviews the transcript for hook strength, pacing and visual opportunities.",
          },
          {
            title: "3. Visuals",
            body: "Each key segment gets a visual prompt from the AI. Search Pexels or Pixabay stock media (set PEXELS_API_KEY / PIXABAY_API_KEY in .env), or generate custom images with AI. Static images get a Ken Burns motion effect via FFmpeg zoompan.",
          },
          {
            title: "4. Polish",
            body: "Scene changes are detected automatically. Transitions follow simple rules: camera ↔ screen = crossfade, screen → screen = hard cut (keeps code sharp), and on camera new topic = hard cut, same topic = crossfade. Captions are generated from the transcript as SRT and burned in during render. Audio is cleaned with the afftdn FFT denoiser.",
          },
          {
            title: "5. Assemble",
            body: "The compositor cuts your keep segments, overlays visuals, applies transitions and captions, mixes optional background music, and renders the final MP4 (or MOV/GIF) at your chosen resolution and aspect ratio.",
          },
          {
            title: "6. Review & Export",
            body: "Preview the final video, generate AI thumbnails with headlines, pick an LLM-suggested title, and export. Download the final file and the full timeline JSON (source of truth) for further processing.",
          },
        ].map((s) => (
          <Panel key={s.title} className="p-5">
            <h3 className="text-sm font-semibold text-white mb-2">{s.title}</h3>
            <p className="text-sm text-cc-muted leading-relaxed">{s.body}</p>
          </Panel>
        ))}
        <Panel className="p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Data & Privacy</h3>
          <p className="text-sm text-cc-muted leading-relaxed">
            Everything is stored in your own MongoDB database — projects, transcripts, segments,
            visuals and renders. No mock data, no external telemetry. Media files stay on your
            server&apos;s storage volume.
          </p>
        </Panel>
      </div>
    </div>
  );
}
