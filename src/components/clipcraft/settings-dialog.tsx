"use client";

import { useEffect, useState } from "react";
import { X, KeyRound, Brain, Mic2, Loader2, Info, AlertTriangle, FileCode2, Cpu } from "lucide-react";
import { Badge } from "./ui-bits";
import { api, type PublicSettings } from "@/lib/client/api";

// Read-only view. Providers and API keys are configured in the server's .env
// file; the browser only learns which ones are set, never their values.

const PROVIDER_LABELS: Record<string, string> = {
  groq: "Groq",
  openai: "OpenAI",
  gemini: "Google Gemini",
  claude: "Anthropic Claude",
  glm: "GLM (Zhipu)",
  ollama: "Ollama (local)",
};

const KEY_LABELS: Record<string, string> = {
  groq: "Groq — LLM + fast Hinglish transcription (free at console.groq.com)",
  openai: "OpenAI — LLM / whisper-1",
  gemini: "Google Gemini — LLM",
  claude: "Anthropic Claude — LLM",
  glm: "GLM (Zhipu) — LLM",
  pexels: "Pexels — premium stock videos",
  pixabay: "Pixabay — backup stock provider",
  huggingface: "Hugging Face — FLUX image generation",
};

const ENGINE_LABELS: Record<string, string> = {
  local: "Local Whisper (faster-whisper on this machine)",
  groq: "Groq API (whisper-large-v3)",
  openai: "OpenAI API (whisper-1)",
};

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [render, setRender] = useState<{ preference: string; active: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((d) => {
        setSettings(d.settings);
        setRender(d.render);
      })
      .catch((e) => setError(e.message || "Could not load settings"));
  }, []);

  const warnings: string[] = [];
  if (settings) {
    const { llm, transcription, configured, envVars } = settings;
    if (llm.provider !== "ollama" && !configured[llm.provider as keyof typeof configured]) {
      warnings.push(
        `LLM_PROVIDER is ${llm.provider} but ${envVars[llm.provider as keyof typeof envVars]} is not set — AI analysis, titles and headlines will be skipped.`
      );
    }
    if (transcription.engine !== "local" && !configured[transcription.engine as "groq" | "openai"]) {
      warnings.push(
        `TRANSCRIPTION_ENGINE is ${transcription.engine} but ${envVars[transcription.engine as "groq" | "openai"]} is not set — local Whisper will be used instead.`
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-cc-panel border border-cc-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cc-border/70">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button className="text-cc-dim hover:text-white" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto cc-scroll p-5 space-y-5">
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 flex gap-2.5">
            <FileCode2 className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />
            <p className="text-xs text-cc-muted leading-relaxed">
              Providers and API keys are configured in the <code className="text-white">.env</code> file
              on the server and are never sent to the browser. Edit <code className="text-white">.env</code>{" "}
              (see <code className="text-white">.env.example</code>) and restart{" "}
              <code className="text-white">npm run dev</code> to change them.
            </p>
          </div>

          {error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : !settings ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : (
            <>
              {warnings.map((w) => (
                <div
                  key={w}
                  className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 flex gap-2 text-[12px] text-amber-200/90"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  {w}
                </div>
              ))}

              <section>
                <p className="text-xs uppercase tracking-wide text-cc-dim mb-2 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" /> LLM (analysis, labels, titles)
                </p>
                <Row name="LLM_PROVIDER" value={PROVIDER_LABELS[settings.llm.provider] || settings.llm.provider} />
                <Row name="LLM_MODEL" value={settings.llm.model || "provider default"} />
                {settings.llm.provider === "ollama" ? (
                  <Row name="OLLAMA_URL" value={settings.ollamaUrl} />
                ) : null}
              </section>

              <section>
                <p className="text-xs uppercase tracking-wide text-cc-dim mb-2 flex items-center gap-1.5">
                  <Mic2 className="w-3.5 h-3.5" /> Transcription
                </p>
                <Row
                  name="TRANSCRIPTION_ENGINE"
                  value={ENGINE_LABELS[settings.transcription.engine] || settings.transcription.engine}
                />
                {settings.transcription.engine === "local" ? (
                  <Row name="WHISPER_MODEL" value={settings.transcription.model} />
                ) : null}
                {settings.transcription.engine === "groq" ? (
                  <Row name="GROQ_WHISPER_MODEL" value={settings.transcription.remoteModel || "whisper-large-v3-turbo"} />
                ) : null}
                <p className="text-[11px] text-cc-dim mt-1.5 flex gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  For Hinglish, TRANSCRIPTION_ENGINE=groq is far faster and more accurate than local Whisper.
                </p>
              </section>

              {render ? (
                <section>
                  <p className="text-xs uppercase tracking-wide text-cc-dim mb-2 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Rendering
                  </p>
                  <Row name="VIDEO_ENCODER" value={`${render.preference} → ${render.label}`} />
                  {render.preference !== "auto" && render.preference !== render.active ? (
                    <p className="text-[11px] text-amber-300/80 mt-1.5">
                      {render.preference} isn&apos;t usable on this machine, so the CPU is used.
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section>
                <p className="text-xs uppercase tracking-wide text-cc-dim mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" /> API keys
                </p>
                <div className="space-y-1.5">
                  {Object.entries(settings.envVars).map(([id, varName]) => {
                    const set = settings.configured[id as keyof typeof settings.configured];
                    return (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-cc-panel2/50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-white">{varName}</p>
                          <p className="text-[11px] text-cc-muted truncate">{KEY_LABELS[id]}</p>
                        </div>
                        <Badge tone={set ? "keep" : "neutral"} className="text-[10px] shrink-0">
                          {set ? "set" : "not set"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-cc-dim mt-2">
                  All keys are optional: without them, local Whisper transcribes, Openverse/Wikimedia
                  provide stock images and Pollinations generates AI images.
                </p>
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-4 border-t border-cc-border/70">
          <button
            className="cc-btn-primary text-white font-semibold rounded-lg px-5 py-2.5 text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-cc-border/40 last:border-0">
      <span className="text-xs font-mono text-cc-muted">{name}</span>
      <span className="text-sm text-white text-right">{value}</span>
    </div>
  );
}
