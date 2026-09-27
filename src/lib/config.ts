// Server-side configuration, read only from environment variables (.env).
// API keys never leave the server: they are not stored in MongoDB, not
// returned by any API route, and not editable from the browser. None of these
// variables use the NEXT_PUBLIC_ prefix, so Next.js never bundles them for the
// client. Only import this from API routes / server code.
import { LLM_PROVIDERS, type LLMProviderId, type SettingsDoc } from "./types";

const TRANSCRIPTION_ENGINES = ["local", "groq", "openai"] as const;
const WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"] as const;
// turbo tested best for Hinglish: Roman script, English terms intact, complete, ~10x faster
const GROQ_WHISPER_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;

// env var name for each key in SettingsDoc["keys"]
export const KEY_ENV_VARS = {
  groq: "GROQ_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  glm: "GLM_API_KEY",
  pexels: "PEXELS_API_KEY",
  pixabay: "PIXABAY_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
} as const satisfies Record<keyof SettingsDoc["keys"], string>;

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  console.warn(`[config] ${name}="${value}" is not one of ${allowed.join(", ")} — using "${fallback}"`);
  return fallback;
}

export function getConfig(): SettingsDoc {
  const provider = oneOf(
    "LLM_PROVIDER",
    env("LLM_PROVIDER"),
    Object.keys(LLM_PROVIDERS) as LLMProviderId[],
    "groq"
  );
  const temperature = parseFloat(env("LLM_TEMPERATURE") || "");
  const keys: SettingsDoc["keys"] = {};
  for (const [k, varName] of Object.entries(KEY_ENV_VARS)) {
    const v = env(varName);
    if (v) keys[k as keyof SettingsDoc["keys"]] = v;
  }
  return {
    _id: "global",
    llm: {
      provider,
      model: env("LLM_MODEL") || LLM_PROVIDERS[provider].models[0],
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
    },
    transcription: {
      engine: oneOf("TRANSCRIPTION_ENGINE", env("TRANSCRIPTION_ENGINE"), TRANSCRIPTION_ENGINES, "local"),
      model: oneOf("WHISPER_MODEL", env("WHISPER_MODEL"), WHISPER_MODELS, "small"),
      remoteModel: oneOf("GROQ_WHISPER_MODEL", env("GROQ_WHISPER_MODEL"), GROQ_WHISPER_MODELS, "whisper-large-v3-turbo"),
    },
    keys,
  };
}

/** What the Settings dialog may see: choices and which keys exist — never the keys. */
export function publicConfig() {
  const c = getConfig();
  const configured = Object.fromEntries(
    Object.keys(KEY_ENV_VARS).map((k) => [k, !!c.keys[k as keyof SettingsDoc["keys"]]])
  ) as Record<keyof typeof KEY_ENV_VARS, boolean>;
  return {
    llm: { provider: c.llm.provider, model: c.llm.model },
    transcription: c.transcription,
    configured,
    envVars: KEY_ENV_VARS,
    ollamaUrl: env("OLLAMA_URL") || "http://127.0.0.1:11434",
  };
}
