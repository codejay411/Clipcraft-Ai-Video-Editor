import { LLM_PROVIDERS, type LLMProviderId, type SettingsDoc } from "./types";
import { getConfig } from "./config";

/** Provider, models and API keys — from .env only (see src/lib/config.ts). */
export async function getSettings(): Promise<SettingsDoc> {
  return getConfig();
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallResult {
  content: string;
  provider: string;
  model: string;
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  messages: LLMMessage[],
  model: string,
  temperature = 0.7
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${model} API error ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  return j.choices?.[0]?.message?.content || "";
}

async function callGemini(apiKey: string, messages: LLMMessage[], model: string): Promise<string> {
  const sys = messages.find((m) => m.role === "system")?.content;
  const rest = messages.filter((m) => m.role !== "system");
  const body: any = {
    contents: rest.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature: 0.7 },
  };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") || "";
}

async function callClaude(apiKey: string, messages: LLMMessage[], model: string): Promise<string> {
  const sys = messages.find((m) => m.role === "system")?.content;
  const rest = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: sys || undefined,
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude API error ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  return j.content?.map((c: any) => c.text).join("") || "";
}

export async function callLLM(
  messages: LLMMessage[],
  opts?: { provider?: LLMProviderId; model?: string }
): Promise<LLMCallResult> {
  const settings = await getSettings();
  const provider = opts?.provider || settings.llm.provider;
  const key = settings.keys as Record<string, string | undefined>;

  if (provider === "groq") {
    const apiKey = key.groq;
    if (!apiKey) throw new Error("No LLM configured. Set GROQ_API_KEY in .env (free tier available), or choose another LLM_PROVIDER.");
    const model = opts?.model || settings.llm.model || "openai/gpt-oss-120b";
    const content = await callOpenAICompatible(
      "https://api.groq.com/openai/v1",
      apiKey,
      messages,
      model,
      settings.llm.temperature
    );
    return { content, provider: "groq", model };
  }
  if (provider === "openai") {
    const apiKey = key.openai;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set in .env.");
    const model = opts?.model || settings.llm.model || "gpt-4o";
    const content = await callOpenAICompatible("https://api.openai.com/v1", apiKey, messages, model, settings.llm.temperature);
    return { content, provider: "openai", model };
  }
  if (provider === "gemini") {
    const apiKey = key.gemini;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env.");
    const model = opts?.model || settings.llm.model || "gemini-2.5-flash";
    const content = await callGemini(apiKey, messages, model);
    return { content, provider: "gemini", model };
  }
  if (provider === "claude") {
    const apiKey = key.claude;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env.");
    const model = opts?.model || settings.llm.model || "claude-sonnet-4-20250514";
    const content = await callClaude(apiKey, messages, model);
    return { content, provider: "claude", model };
  }
  if (provider === "glm") {
    // Zhipu GLM via the public OpenAI-compatible API (https://open.bigmodel.cn)
    const apiKey = key.glm;
    if (!apiKey) throw new Error("GLM_API_KEY is not set in .env (free keys at open.bigmodel.cn).");
    const model = opts?.model || settings.llm.model || "glm-4-flash";
    const content = await callOpenAICompatible("https://open.bigmodel.cn/api/paas/v4", apiKey, messages, model, settings.llm.temperature);
    return { content, provider: "glm", model };
  }
  if (provider === "ollama") {
    // Fully local LLM via Ollama's OpenAI-compatible endpoint (no API key needed)
    const baseUrl = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "") + "/v1";
    const model = opts?.model || settings.llm.model || "llama3.2";
    const content = await callOpenAICompatible(baseUrl, "ollama", messages, model, settings.llm.temperature);
    return { content, provider: "ollama", model };
  }
  throw new Error(`Unknown provider: ${provider}`);
}

export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  // strip markdown fences
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fence) text = fence[1].trim();
  // find first { or [ and matching last
  const first = text.search(/[{[]/);
  if (first === -1) return null;
  const open = text[first];
  const close = open === "{" ? "}" : "]";
  const last = text.lastIndexOf(close);
  if (last <= first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1)) as T;
  } catch {
    // try to fix common issues: trailing commas
    const fixed = text
      .slice(first, last + 1)
      .replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(fixed) as T;
    } catch {
      return null;
    }
  }
}

export async function callLLMJson<T>(
  messages: LLMMessage[],
  opts?: { provider?: LLMProviderId; model?: string }
): Promise<{ data: T; provider: string; model: string }> {
  const res = await callLLM(messages, opts);
  const data = extractJson<T>(res.content);
  if (!data) throw new Error("LLM returned invalid JSON. Try again or set a different LLM_PROVIDER in .env.");
  return { data, provider: res.provider, model: res.model };
}

export { LLM_PROVIDERS };
