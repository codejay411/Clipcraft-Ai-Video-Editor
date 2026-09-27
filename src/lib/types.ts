// ClipCraft AI — Central data model (source of truth for the whole pipeline)

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number; // seconds
  filler?: boolean;
}

export type SegmentType = "keep" | "cut" | "silence";
// what is on screen: the presenter on camera, or a laptop/screen recording (code, browser...)
export type SegmentLayout = "camera" | "screen";
export type SegmentStatus = "approved" | "rejected" | "pending";

export interface TimelineSegment {
  id: string;
  index: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  type: SegmentType;
  reason?: string; // "Filler words" | "Silence (2.1s)" | ...
  label: string; // "Introduction" | "Main Point 1" | ...
  words: WordTimestamp[];
  fillers: WordTimestamp[];
  visualPrompt?: string;
  visualKeywords?: string[];
  visual?: VisualAsset | null;
  transitionIn: "cut" | "crossfade" | "none";
  layout?: SegmentLayout; // missing on projects analyzed before layout detection = camera
  sceneId?: number;
  status: SegmentStatus;
}

export interface KenBurnsConfig {
  enabled: boolean;
  direction: "in" | "out";
  intensity: number; // 1.. 1.25
}

export type VisualKind = "stock_video" | "stock_image" | "ai_generated";

export interface VisualAsset {
  id: string;
  kind: VisualKind;
  source: "pexels" | "pixabay" | "huggingface" | "pollinations" | "web" | "upload";
  url: string; // /api/media/... local url
  remoteUrl?: string; // original provider url
  thumbUrl?: string;
  author?: string;
  prompt?: string;
  duration?: number;
  kenBurns: KenBurnsConfig;
  searchQuery?: string;
}

export interface SourceMedia {
  filename: string;
  filepath: string; // absolute server path
  url: string; // /api/media/... serving url
  size: number; // bytes
  duration: number; // seconds
  width: number;
  height: number;
  mimeType: string;
  mediaType: "video" | "audio";
  thumbnail?: string; // url of extracted poster
  isSample?: boolean;
  sampleId?: string;
}

export interface LLMAnalysis {
  provider: string;
  model: string;
  score: number; // 0..10
  hookStrength: "strong" | "moderate" | "weak";
  assessment: string;
  strengths: string[];
  improvements: string[];
  suggestedAngle: string;
  segmentInsights: SegmentInsight[];
  generatedAt?: string;
}

export interface SegmentInsight {
  segmentId: string;
  quality: "good" | "average" | "weak";
  note: string;
}

export interface LayoutRegion {
  start: number;
  end: number;
  layout: SegmentLayout;
}

export interface SceneInfo {
  id: number;
  start: number;
  end: number;
  label: string;
  type: "Intro" | "Topic Change" | "Same Topic" | "Conclusion";
  thumbnail?: string;
}

export interface TransitionInfo {
  id: string;
  type: "cut" | "crossfade";
  at: number; // position (in OUTPUT timeline)
  duration: number;
  rationale: string;
}

export interface CaptionCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface PolishState {
  applied: boolean;
  scenes: SceneInfo[];
  transitions: TransitionInfo[];
  captions: {
    enabled: boolean;
    style: string;
    srtUrl?: string;
    cues: CaptionCue[];
  };
  audio: {
    cleanup: boolean;
    method: "afftdn" | "arnndn" | "off";
    noiseBeforeDb?: number;
    noiseAfterDb?: number;
    noiseReducedPct?: number;
    cleanedUrl?: string;
  };
  appliedAt?: string;
}

export interface OutputSettings {
  resolution: "480p" | "720p" | "1080p";
  format: "mp4" | "mov" | "gif";
  aspectRatio: "16:9" | "9:16" | "1:1";
  quality: "high" | "medium" | "compact";
  music: boolean;
  musicTrack?: string;
  musicVolume: number; // 0..100
  burnSubtitles: boolean;
  optimizeSize: boolean;
}

export interface ExportedArtifact {
  url?: string;
  filename?: string;
  sizeBytes?: number;
  exportedAt?: string;
  duration?: number;
  originalDuration?: number;
}

export interface ThumbnailOption {
  id: string;
  url: string;
  headline: string;
  selected?: boolean;
}

export interface TitleOption {
  id: string;
  text: string;
  selected?: boolean;
}

export interface ProjectDoc {
  _id: string;
  name: string;
  description?: string;
  language: string; // "auto" or code
  status:
    | "created"
    | "analyzing"
    | "analyzed"
    | "visuals"
    | "polishing"
    | "polished"
    | "assembling"
    | "assembled"
    | "exporting"
    | "exported";
  currentStep: number; // 1..6
  source: SourceMedia;
  transcript: {
    text: string;
    language?: string;
    words: WordTimestamp[];
    engine: string;
  };
  segments: TimelineSegment[];
  layoutRegions?: LayoutRegion[]; // camera / screen spans detected on the source video
  analysis?: LLMAnalysis;
  polish: PolishState;
  output: OutputSettings;
  export: ExportedArtifact;
  thumbnails: ThumbnailOption[];
  titles: TitleOption[];
  highlights?: {
    totalDuration?: number;
    originalDuration?: number;
    timeSavedPct?: number;
    fillersRemoved?: number;
    silencesRemoved?: number;
    visualsAdded?: number;
    transitionsAdded?: number;
    captionsEnabled?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface JobDoc {
  _id: string;
  projectId: string;
  type: "analyze" | "llm" | "polish" | "assemble" | "export" | "thumbnails" | "titles" | "visuals" | "sample";
  status: "queued" | "running" | "completed" | "failed";
  progress: number; // 0..100
  stage: string;
  error?: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsDoc {
  _id: "global";
  llm: {
    provider: LLMProviderId;
    model?: string;
    temperature?: number;
  };
  transcription: {
    engine: "local" | "groq" | "openai";
    model: string; // local whisper model name
    remoteModel?: string; // Groq whisper model (GROQ_WHISPER_MODEL)
  };
  keys: {
    groq?: string;
    openai?: string;
    gemini?: string;
    claude?: string;
    glm?: string;
    pexels?: string;
    pixabay?: string;
    huggingface?: string;
  };
  updatedAt?: string;
}

export interface MediaAssetDoc {
  _id: string;
  projectId?: string | null;
  kind: "upload" | "sample" | "stock" | "generated" | "thumbnail" | "render" | "audio";
  filename: string;
  filepath: string;
  url: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface SampleVideo {
  id: string;
  title: string;
  category: string;
  duration: number;
  url?: string;
  thumbUrl?: string;
  description: string;
  generating?: boolean;
  ready?: boolean;
}

export const LLM_PROVIDERS = {
  groq: {
    label: "Groq (recommended)",
    models: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    needsKey: true,
  },
  openai: { label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini"], needsKey: true },
  gemini: {
    label: "Google Gemini",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    needsKey: true,
  },
  claude: {
    label: "Anthropic Claude",
    models: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
    needsKey: true,
  },
  glm: {
    label: "GLM (Zhipu)",
    models: ["glm-4-flash", "glm-4-plus", "glm-4-air"],
    needsKey: true,
  },
  ollama: {
    label: "Ollama (fully local)",
    models: ["llama3.2", "llama3.1:8b", "qwen2.5:7b", "gemma2:9b"],
    needsKey: false,
  },
} as const;

export type LLMProviderId = keyof typeof LLM_PROVIDERS;

export const FILLER_WORDS = [
  "um",
  "uh",
  "er",
  "ah",
  "hmm",
  "like",
  "you know",
  "i mean",
  "so yeah",
  "basically",
  "actually",
  "literally",
  "sort of",
  "kind of",
  "you see",
];
