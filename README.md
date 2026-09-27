# ClipCraft AI — Auto-Edit Talking-Head Videos into Polished Clips

ClipCraft AI is a full-stack, production-ready AI video editing pipeline that runs
**100% on your own machine** — no proprietary cloud SDKs, no container lock-in.
Upload a raw talking-head video and the system automatically transcribes it
(word-level timestamps), removes filler words and silences, scores every segment
with the LLM of your choice, suggests/inserts b-roll visuals, polishes audio &
subtitles, renders the final cut with music, and generates AI thumbnails + viral
titles — all state persisted in MongoDB.

## The 6-Phase Pipeline

| Phase | What happens | Key tech |
|---|---|---|
| 1. Input | Upload video (up to 2 GB), or generate a demo sample locally | Next.js API, ffprobe |
| 2. Analyze | Word-level transcription, filler-word & silence detection, LLM hook-strength scoring → central Timeline JSON | faster-whisper, FFmpeg silencedetect, multi-provider LLM |
| 3. Visuals | B-roll keyword → stock image/video search, AI image generation, Ken Burns motion | Pexels / Pixabay / Openverse / Wikimedia / Pollinations / HuggingFace, FFmpeg zoompan |
| 4. Polish | Scene detection, rule-based transitions (cut on new topic / fade on same), SRT captions, audio de-noise | xfade, afftdn |
| 5. Assemble | Final render: segment cuts, visual overlays, burn-in captions, music mix, export MP4/MOV/GIF | FFmpeg compositor |
| 6. Review | Side-by-side compare, AI thumbnails with headlines, LLM title suggestions, one-click re-render | Next.js dashboard, Pillow |

## Fully Local & Zero-Lock-In

Every dependency is a public, standard service or runs on your machine:

| Capability | Zero-config path (no API keys at all) | Premium path (optional keys) |
|---|---|---|
| Transcription | Local faster-whisper (CPU) | Groq / OpenAI whisper-large-v3 |
| LLM analysis | Pipeline runs without LLM (graceful fallback) or **Ollama** fully offline | Groq / OpenAI / Gemini / Claude / GLM (Zhipu) |
| Stock visuals | Openverse + Wikimedia Commons search | Pexels / Pixabay |
| AI image generation | Pollinations.ai (FLUX) | Hugging Face Inference API (FLUX.1-schnell) |
| Demo sample TTS | espeak-ng / espeak (Linux), `say` (macOS), SAPI (Windows) — all offline | — |
| Thumbnails | Keyframes + Pillow headline overlays | — |

## Prerequisites

1. **Node.js 18+** (or **Bun 1.0+**) — `node` and `npm` on your PATH
2. **MongoDB Atlas** account (free tier) — for cloud database
3. **FFmpeg + FFprobe** installed and on `PATH`
   - Windows: `winget install Gyan.FFmpeg` — macOS: `brew install ffmpeg` — Linux: `sudo apt install ffmpeg`
4. **Python 3.8+** on your PATH (`python3` or `python`) with `pip`
5. (Optional, for demo samples) **espeak-ng** — Linux: `sudo apt install espeak-ng`,
   macOS: `brew install espeak-ng` (Windows SAPI voices are built in)

## Quick Start

```bash
# 1. Unzip and enter the project
cd clipcraft-ai

# 2. Create a MongoDB Atlas cluster
#    Sign up at https://www.mongodb.com/atlas (free tier)
#    Get your connection string and set MONGODB_URL in .env

# 3. Install JS dependencies
npm install            # or: bun install / pnpm install / yarn

# 4. Install Python dependencies (local Whisper + thumbnails + samples)
pip install -r requirements.txt
#    First transcription auto-downloads the faster-whisper "base" model (~150 MB).

# 5. Start the app (cross-platform: Linux / macOS / Windows)
npm run dev            # or: bun run dev
# Open http://localhost:3000
```

If MongoDB is not reachable, the app shows a friendly banner with fix
instructions instead of failing silently. A health endpoint is available at
`/api/health`.

### First Run Walkthrough

1. Open the app → the **Input** step lets you upload a video, or click a
   **Sample Input** to generate a demo talking-head video locally (offline TTS
   narration with deliberate filler words and pauses) if you have none handy.
2. **Analyze** — runs local Whisper + silence detection + filler detection, then
   LLM scoring (needs a provider key or local Ollama; without one, the pipeline
   still completes and you can re-run AI analysis later from the Analyze step).
   Review the timeline: keep / cut every segment, adjust thresholds.
3. **Visuals** — pick a segment, search stock visuals by keyword (zero-key
   Openverse/Wikimedia works out of the box) or generate AI images, assign with
   Ken Burns zoom in/out.
4. **Polish** — scene detection, transitions, captions (SRT), audio de-noise.
5. **Assemble** — FFmpeg renders the final cut; optional background music mix.
6. **Review** — compare original vs polished, export MP4/MOV/GIF, pick an AI
   thumbnail and a viral title.

## Project Structure

```
clipcraft-ai/
├── requirements.txt              # Python deps: faster-whisper, Pillow
├── scripts/
│   ├── dev.mjs                   # cross-platform dev server (replaces unix `tee`)
│   ├── build.mjs                 # cross-platform standalone build (no unix `cp`)
│   └── py/
│       ├── transcribe.py         # faster-whisper word-level transcription (JSON out)
│       ├── thumbnail.py          # keyframe extraction + PIL headline overlays
│       ├── make_samples.py       # demo videos via LOCAL TTS (espeak/say/SAPI) + ffmpeg
│       └── make_music.py         # procedural background music generator
├── prisma/schema.prisma          # legacy schema (project state lives in MongoDB)
├── src/
│   ├── app/
│   │   ├── page.tsx              # single-page wizard app (the only route)
│   │   └── api/                  # REST API (Node runtime)
│   │       ├── projects/         # CRUD + upload + step endpoints
│   │       │   └── [id]/
│   │       │       ├── analyze/   # Phase 2 (Whisper + silence + filler + LLM)
│   │       │       ├── analyze/llm/  # re-run LLM scoring only
│   │       │       ├── visuals/   # Phase 3 (search / generate / assign)
│   │       │       ├── polish/    # Phase 4 (scenes / transitions / SRT / denoise)
│   │       │       ├── assemble/  # Phase 5 (final FFmpeg render)
│   │       │       ├── export/    # MP4 / MOV / GIF export
│   │       │       ├── thumbnails/ # Phase 6 keyframes + PIL headlines
│   │       │       └── titles/    # Phase 6 LLM title suggestions
│   │       ├── jobs/[id]/        # async job status polling
│   │       ├── media/[...path]/  # media serving with HTTP Range support
│   │       ├── health/           # MongoDB connectivity check (UI banner)
│   │       ├── settings/         # LLM provider & API key settings (MongoDB)
│   │       ├── samples/          # local demo sample generation
│   │       ├── srt/              # SRT download
│   │       └── thumb/            # single-frame thumbnails
│   ├── components/
│   │   ├── clipcraft/            # app shell, wizard steps, views, settings dialog
│   │   └── ui/                   # shadcn/ui component library
│   ├── hooks/
│   └── lib/
│       ├── mongo.ts              # MongoDB connection + collections
│       ├── python.ts             # cross-platform python detection (python3/python/py)
│       ├── storage.ts            # storage/ folder layout helpers
│       ├── ffmpeg.ts             # FFmpeg/FFprobe wrappers
│       ├── llm.ts                # multi-provider LLM layer (Groq/OpenAI/Gemini/Claude/GLM/Ollama)
│       ├── jobs.ts               # background job manager
│       ├── types.ts              # central Timeline JSON types (single source of truth)
│       ├── projects.ts           # project state machine (steps 1→6)
│       └── pipeline/
│           ├── analyze.ts        # Phase 2 orchestration
│           ├── visuals.ts       # Phase 3 orchestration (stock search + AI gen)
│           ├── polish.ts        # Phase 4 orchestration
│           └── assemble.ts      # Phase 5 render pipeline
├── storage/                      # runtime media (auto-created)
│   ├── uploads/  samples/  visuals/  renders/  music/  tmp/
└── mini-services/                # reserved for sidecar services
```

## Configuration

All configuration — AI providers, models and API keys — lives in the server's
**`.env`** file. Copy `.env.example` to `.env`, fill in what you use, and restart
`npm run dev`. None of these variables use the `NEXT_PUBLIC_` prefix, so Next.js
never sends them to the browser; the in-app **Settings** dialog is read-only and
only shows which keys are set, never their values.

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URL` | *(required)* | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | `clipcraft` | MongoDB database name |
| `LLM_PROVIDER` | `groq` | `groq` / `openai` / `gemini` / `claude` / `glm` / `ollama` |
| `LLM_MODEL` | provider default | Groq: `openai/gpt-oss-120b` (best), `qwen/qwen3.8-27b`, `openai/gpt-oss-20b` |
| `LLM_TEMPERATURE` | `0.7` | LLM sampling temperature |
| `TRANSCRIPTION_ENGINE` | `local` | `local` (faster-whisper) / `groq` / `openai` — `groq` is best for Hinglish |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | Groq engine: `whisper-large-v3-turbo` (Roman Hinglish) or `whisper-large-v3` |
| `WHISPER_MODEL` | `small` | local engine: `tiny` / `base` / `small` / `medium` / `large-v3` |
| `GROQ_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `GLM_API_KEY` | — | LLM / transcription keys (optional) |
| `PEXELS_API_KEY`, `PIXABAY_API_KEY` | — | premium stock media (optional) |
| `HUGGINGFACE_API_KEY` | — | FLUX image generation (optional) |
| `VIDEO_ENCODER` | `auto` | Render encoder: `auto` (NVIDIA NVENC → Intel Quick Sync → CPU), `nvenc`, `qsv`, `cpu`. GPU failures fall back to CPU automatically |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama endpoint for fully-local LLM |
| `PYTHON_BIN` | auto-detect | Force a specific python binary (e.g. `.venv/Scripts/python.exe`) |

## MongoDB Collections

- `projects` — project meta + full central Timeline JSON (single source of truth)
- `jobs` — background job records (analyze/visuals/polish/assemble/export/thumbnails)
- `settings` — unused (configuration now comes from `.env`)
- `media` — uploaded/generated media registry

## Troubleshooting

| Problem | Fix |
|---|---|
| "MongoDB is not connected" banner | Set `MONGODB_URL` to your Atlas connection string in `.env` |
| Transcription fails: `No module named 'faster_whisper'` | `pip install -r requirements.txt` (in the same python you run the app with; set `PYTHON_BIN` if you use a venv) |
| `ffprobe failed` / FFmpeg not found | Install FFmpeg and reopen the terminal so PATH refreshes |
| Sample generation: "No local TTS engine found" | Install espeak-ng (`sudo apt install espeak-ng` / `brew install espeak-ng`); Windows has SAPI built in |
| LLM analysis missing / "API key not configured" | Set `GROQ_API_KEY` in `.env` (free tier) and restart, or set `LLM_PROVIDER=ollama` and run `ollama pull llama3.2` |
| Port 3000 already in use | `PORT=3001 npm run dev` |

## Notes

- Rendered videos land in `storage/renders/` and are served via
  `/api/media/...` with Range support (seekable previews).
- The Python scripts are invoked by the backend automatically — `python3`,
  `python`, and the Windows `py` launcher are all auto-detected.
- Demo sample videos are generated with offline TTS narration containing
  deliberate fillers ("um", "uh", long pauses) so the auto-trim has something to
  remove. Backgrounds are AI-generated via Pollinations with an offline PIL
  gradient fallback.
- `npm run lint` runs ESLint; `npm run build` produces a cross-platform
  standalone build; `npm start` runs it in production mode.
