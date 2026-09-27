"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CloudUpload,
  Link2,
  Mic,
  Video,
  Clock,
  FileVideo,
  Maximize,
  CheckCircle2,
  Lightbulb,
  Globe,
  ChevronDown,
  Play,
  Loader2,
  FileAudio,
} from "lucide-react";
import { Panel, GradientButton, Badge } from "../ui-bits";
import { api, fmtTime, humanSize } from "@/lib/client/api";
import { useCC } from "../store";
import type { SampleVideo } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIPS = [
  "Use clear audio for better transcription",
  "Videos between 5-30 minutes work best",
  "Ensure the main speaker is clearly visible",
  "Supported formats: MP4, MOV, AVI, MKV, MP3, WAV, M4A",
];

export function StepInput() {
  const { setProject, setStep, setNav } = useCC();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"upload" | "url" | "record">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("auto");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<SampleVideo[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(true);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .getSamples()
        .then((d) => {
          if (alive) {
            setSamples(d.samples.filter((s) => s.ready));
            setSamplesLoading(false);
          }
        })
        .catch(() => setSamplesLoading(false));
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (file && !name) {
      setName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") || "My First Video");
    }
  }, [file]);

  const pickFile = useCallback((f: File) => {
    setFile(f);
    setSelectedSample(null);
    setError("");
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) pickFile(f);
    },
    [pickFile]
  );

  async function pickSample(id: string) {
    setSelectedSample(id);
    setFile(null);
    setError("");
    const s = samples.find((x) => x.id === id);
    if (s && !name) setName(`${s.title} Demo`);
  }

  async function createProject() {
    setError("");
    if (!file && !selectedSample) {
      setError("Please upload a file or pick a sample first.");
      return;
    }
    setCreating(true);
    try {
      const form = new FormData();
      form.append("name", name || "My First Video");
      form.append("description", description);
      form.append("language", language);
      if (file) form.append("file", file);
      if (selectedSample) form.append("sampleId", selectedSample);
      const project = await api.createProject(form);
      setProject(project);
      setStep(2);
      setNav("wizard");
    } catch (e: any) {
      setError(e.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  const activeSample = samples.find((s) => s.id === selectedSample);

  return (
    <div className="max-w-6xl mx-auto pb-24">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden mb-6 border border-cc-border/60">
        <div className="absolute inset-0 bg-gradient-to-r from-[#101726] via-[#131b30] to-[#1c1440]" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='240' viewBox='0 0 1200 240'%3E%3Cpath d='M0 200 L140 120 L260 170 L400 80 L540 150 L680 90 L820 160 L960 100 L1100 150 L1200 110 L1200 240 L0 240 Z' fill='%23372a63' fill-opacity='0.55'/%3E%3Cpath d='M0 220 L160 170 L300 200 L460 140 L620 190 L780 150 L940 200 L1100 160 L1200 190 L1200 240 L0 240 Z' fill='%231b2440' fill-opacity='0.9'/%3E%3C/svg%3E\")",
            backgroundSize: "cover",
          }}
        />
        <div className="relative px-6 md:px-10 py-12">
          <span className="absolute right-6 top-6 md:right-10 md:top-8 text-white/90 text-2xl italic font-serif hidden sm:block rotate-[-4deg]">
            Same Content
            <br />
            Bigger Impact
          </span>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Step 1: Upload Your Video or Audio
          </h1>
          <p className="text-cc-muted mt-2 text-sm md:text-base">
            Let&apos;s get started! Upload your file and we&apos;ll handle the rest.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: upload + samples */}
        <div className="lg:col-span-2 space-y-6">
          <Panel className="p-5">
            {/* Tabs */}
            <div className="flex gap-2 mb-5">
              {[
                { id: "upload", label: "Upload File", icon: CloudUpload },
                { id: "url", label: "Import from URL", icon: Link2 },
                { id: "record", label: "Record Audio", icon: Mic },
              ].map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      active
                        ? "bg-cc-accent text-white shadow-lg shadow-indigo-950/50"
                        : "bg-cc-panel2 text-cc-muted hover:text-white border border-cc-border"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {tab === "upload" && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "rounded-xl border-2 border-dashed py-12 px-6 text-center cursor-pointer transition-all",
                  dragOver
                    ? "border-indigo-400 bg-indigo-500/10"
                    : "border-indigo-800/70 bg-indigo-950/20 hover:border-indigo-500/80"
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac,.mp4,.mov,.avi,.mkv,.mp3,.wav,.m4a"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickFile(f);
                  }}
                />
                <CloudUpload className="w-12 h-12 mx-auto text-indigo-400 mb-4" />
                <p className="font-semibold text-white text-[15px]">
                  Drag &amp; drop your video or audio file here
                </p>
                <div className="flex items-center gap-3 my-4 justify-center">
                  <span className="h-px w-14 bg-cc-border" />
                  <span className="text-xs text-cc-dim">or</span>
                  <span className="h-px w-14 bg-cc-border" />
                </div>
                <GradientButton type="button">Browse Files</GradientButton>
                <p className="text-[11px] text-cc-dim mt-5">
                  Supports: MP4, MOV, AVI, MKV, MP3, WAV, M4A (Max 2GB)
                </p>
              </div>
            )}

            {tab === "url" && (
              <div className="rounded-xl border border-cc-border bg-cc-input/50 p-8 text-center">
                <Link2 className="w-10 h-10 mx-auto text-indigo-400 mb-3" />
                <p className="text-sm text-cc-muted mb-4">
                  Paste a direct media URL (MP4 / MP3) and we&apos;ll fetch it.
                </p>
                <div className="flex gap-2 max-w-md mx-auto">
                  <input
                    value={urlValue}
                    onChange={(e) => setUrlValue(e.target.value)}
                    placeholder="https://example.com/video.mp4"
                    className="flex-1 bg-cc-panel2 border border-cc-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-cc-dim outline-none focus:border-indigo-500"
                  />
                  <GradientButton
                    onClick={async () => {
                      if (!urlValue.trim()) return;
                      try {
                        setCreating(true);
                        const res = await fetch(urlValue.trim());
                        const blob = await res.blob();
                        const fn = urlValue.split("/").pop()?.split("?")[0] || "download.mp4";
                        const f = new File([blob], fn, { type: blob.type });
                        pickFile(f);
                      } catch {
                        setError("Could not download that URL.");
                      } finally {
                        setCreating(false);
                      }
                    }}
                  >
                    Fetch
                  </GradientButton>
                </div>
              </div>
            )}

            {tab === "record" && (
              <div className="rounded-xl border border-cc-border bg-cc-input/50 p-10 text-center">
                <Mic className="w-10 h-10 mx-auto text-indigo-400 mb-3" />
                <p className="text-sm text-cc-muted mb-4">
                  Record straight from your microphone
                </p>
                <AudioRecorder onDone={(f) => pickFile(f)} />
              </div>
            )}
          </Panel>

          {/* Sample Inputs */}
          <Panel className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-[15px] text-white">Sample Inputs</h3>
                <p className="text-xs text-cc-dim mt-0.5">
                  Try with a sample video to see how it works.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {samplesLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="aspect-video rounded-lg bg-cc-panel2 animate-pulse"
                  />
                ))
              ) : samples.length ? (
                samples.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pickSample(s.id)}
                    className={cn(
                      "group relative rounded-lg overflow-hidden text-left border-2 transition-all",
                      selectedSample === s.id
                        ? "border-indigo-500 shadow-lg shadow-indigo-950/50"
                        : "border-transparent hover:border-cc-dim/50"
                    )}
                  >
                    <div className="relative aspect-video bg-cc-panel2">
                      {s.thumbUrl ? (
                         
                        <img
                          src={s.thumbUrl}
                          alt={s.title}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/45 transition-colors">
                        <span className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                          <Play className="w-4 h-4 text-slate-900 fill-slate-900 ml-0.5" />
                        </span>
                      </span>
                      <span className="absolute bottom-1.5 left-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                        {fmtTime(s.duration || 0)}
                      </span>
                    </div>
                    <div className="pt-1.5 pb-0.5">
                      <p className="text-xs font-medium text-white truncate">{s.title}</p>
                      <p className="text-[10px] text-cc-dim truncate">{s.category}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="col-span-4 py-8 text-center text-xs text-cc-dim flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  Sample videos are being generated — check back in a minute.
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Right: file info + project details + tips */}
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[15px] text-white">File Information</h3>
              {(file || activeSample) && (
                <button
                  className="text-cc-dim hover:text-white"
                  onClick={() => {
                    setFile(null);
                    setSelectedSample(null);
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {file || activeSample ? (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-32 h-[72px] rounded-lg overflow-hidden bg-cc-panel2 border border-cc-border shrink-0 relative">
                    {file ? (
                      file.type.startsWith("video") ? (
                        <video
                          src={URL.createObjectURL(file)}
                          className="w-full h-full object-cover"
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileAudio className="w-6 h-6 text-cc-dim" />
                        </div>
                      )
                    ) : activeSample?.thumbUrl ? (
                       
                      <img
                        src={activeSample.thumbUrl}
                        alt={activeSample.title}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-semibold text-white truncate">
                      {file?.name || `${activeSample?.title}.mp4`}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-cc-muted">
                      {file ? (
                        file.type.startsWith("video") ? (
                          <>
                            <Video className="w-3.5 h-3.5" />
                            Video ({file.name.split(".").pop()?.toUpperCase()})
                          </>
                        ) : (
                          <>
                            <FileAudio className="w-3.5 h-3.5" />
                            Audio ({file.name.split(".").pop()?.toUpperCase()})
                          </>
                        )
                      ) : (
                        <>
                          <Video className="w-3.5 h-3.5" />
                          Video (MP4)
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-cc-muted">
                      <Clock className="w-3.5 h-3.5" />
                      {activeSample ? fmtTime(activeSample.duration) : "Ready to process"}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-cc-muted">
                      <FileVideo className="w-3.5 h-3.5" />
                      {activeSample ? "~6 MB" : humanSize(file?.size)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-cc-muted">
                      <Maximize className="w-3.5 h-3.5" />
                      {activeSample ? "1280 x 720" : "Auto-detected"}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      File ready
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-cc-dim py-8 text-center">
                No file selected yet. Upload or pick a sample.
              </p>
            )}
          </Panel>

          <Panel className="p-5 space-y-4">
            <h3 className="font-semibold text-[15px] text-white">Project Details</h3>
            <div>
              <label className="text-xs font-medium text-cc-muted mb-1.5 block">
                Project Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My First Video"
                className="w-full bg-cc-input border border-cc-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-cc-dim outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cc-muted mb-1.5 block">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description about your video..."
                rows={3}
                className="w-full bg-cc-input border border-cc-border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-cc-dim outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cc-muted mb-1.5 block">Language</label>
              <div className="relative">
                <Globe className="w-4 h-4 text-cc-dim absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full appearance-none bg-cc-input border border-cc-border rounded-lg pl-9 pr-8 py-2.5 text-sm text-white outline-none focus:border-indigo-500"
                >
                  <option value="auto">Auto-detect (Recommended)</option>
                  <option value="hi-en">Hinglish (Hindi + English, Roman captions)</option>
                  <option value="en">English (Hinglish speech is translated to English captions)</option>
                  <option value="hi">Hindi (Devanagari captions)</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ur">Urdu</option>
                </select>
                <ChevronDown className="w-4 h-4 text-cc-dim absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-sm text-white">Tips for best results</h3>
            </div>
            <ul className="space-y-2.5">
              {TIPS.map((t) => (
                <li key={t} className="flex items-start gap-2 text-xs text-cc-muted">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {/* Footer bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-cc-border/70 bg-cc-panel/95 backdrop-blur px-4 md:px-8 py-3.5 flex items-center justify-between">
        <button className="text-sm text-cc-muted hover:text-white transition-colors">
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <GradientButton onClick={createProject} disabled={creating || (!file && !selectedSample)}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Continue to Analysis →
          </GradientButton>
        </div>
      </div>
    </div>
  );
}

function AudioRecorder({ onDone }: { onDone: (f: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const f = new File([blob], `recording_${Date.now()}.webm`, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        onDone(f);
        setRecording(false);
        setSeconds(0);
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      /* mic denied */
    }
  }

  return (
    <div>
      {recording ? (
        <Badge tone="cut" className="mb-3 cc-pulse">
          ● Recording {fmtTime(seconds)}
        </Badge>
      ) : null}
      <GradientButton onClick={recording ? () => mediaRef.current?.stop() : start}>
        <Mic className="w-4 h-4" />
        {recording ? "Stop Recording" : "Start Recording"}
      </GradientButton>
    </div>
  );
}
