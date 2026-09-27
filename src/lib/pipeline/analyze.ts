import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  extractAudio,
  detectSilences,
  runProc,
} from "../ffmpeg";
import { getCollection, newId } from "../mongo";
import { getSettings, callLLMJson } from "../llm";
import type {
  ProjectDoc,
  TimelineSegment,
  WordTimestamp,
  LLMAnalysis,
  SegmentInsight,
  LayoutRegion,
} from "../types";
import { TMP_DIR, ensureDirs } from "../storage";
import { detectLayoutRegions, layoutAt } from "./layout";
import { pythonBin } from "../python";

const TRANSCRIBE_SCRIPT = path.join(process.cwd(), "scripts", "py", "transcribe.py");

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration: number;
  words: WordTimestamp[];
  segments: { start: number; end: number; text: string }[];
}

function runTranscribe(
  audioPath: string,
  model: string,
  language: string | null,
  onProgress?: (p: number, stage: string) => void
): Promise<TranscriptionResult> {
  return new Promise((resolve, reject) => {
    const resultFile = path.join(TMP_DIR, `transcript_${Date.now()}.json`);
    const args = [TRANSCRIBE_SCRIPT, audioPath, model, language || "auto", resultFile];
    const p = spawn(pythonBin(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => {
      const chunk = d.toString();
      stderr += chunk.slice(-4000);
      // parse progress lines
      for (const line of chunk.split("\n")) {
        const t = line.trim();
        if (t.startsWith("{") && t.includes('"p"')) {
          try {
            const j = JSON.parse(t);
            if (typeof j.p === "number") onProgress?.(j.p, j.stage || "Transcribing...");
          } catch {
            /* ignore */
          }
        }
      }
    });
    p.on("error", (e) => reject(new Error(`Python spawn failed: ${e.message}`)));
    p.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Transcription failed (exit ${code}): ${stderr.slice(-500)}`)
        );
      }
      try {
        const raw = fs.readFileSync(resultFile, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.error) return reject(new Error(parsed.error));
        resolve(parsed as TranscriptionResult);
      } catch (e: any) {
        reject(new Error(`Failed reading transcription result: ${e.message}`));
      } finally {
        try {
          if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
        } catch {
          /* ignore */
        }
      }
    });
  });
}

// Same hint the local transcriber uses: Roman-script Hindi with English tech words
const HINGLISH_PROMPT =
  "Hello dosto, aaj hum React aur Node.js ke baare mein seekhenge. " +
  "Pehle project setup karte hain, phir API banayenge. Chaliye code likhna shuru karte hain.";
const HINGLISH_SCRIPT = path.join(process.cwd(), "scripts", "py", "hinglish.py");

/** Convert any Devanagari in a transcript to Roman Hinglish (scripts/py/hinglish.py). */
async function romanizeTranscript(t: TranscriptionResult): Promise<TranscriptionResult> {
  const inFile = path.join(TMP_DIR, `hinglish_in_${Date.now()}.json`);
  const outFile = inFile.replace("_in_", "_out_");
  try {
    fs.writeFileSync(inFile, JSON.stringify(t), "utf-8");
    const r = await runProc(pythonBin(), [HINGLISH_SCRIPT, "--json", inFile, outFile], 60000);
    if (r.code !== 0 || !fs.existsSync(outFile)) throw new Error(r.stderr.slice(-300));
    return { ...t, ...JSON.parse(fs.readFileSync(outFile, "utf-8")), language: "hi-en" };
  } catch (e: any) {
    console.error("[analyze] romanization failed, keeping original script:", e?.message);
    return t;
  } finally {
    for (const f of [inFile, outFile]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

async function transcribeRemote(
  engine: "groq" | "openai",
  apiKey: string,
  audioPath: string,
  language: string,
  groqModel: string,
  onProgress?: (p: number, stage: string) => void
): Promise<TranscriptionResult> {
  onProgress?.(20, "Transcribing via API...");
  const model = engine === "groq" ? groqModel : "whisper-1";
  const url =
    engine === "groq"
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions";
  // APIs cap uploads at 25 MB: 16 kHz WAV hits that at ~13 min, 48 kbps MP3 at ~70 min
  const mp3Path = audioPath.replace(/\.wav$/i, "") + "_upload.mp3";
  const enc = await runProc("ffmpeg", ["-y", "-i", audioPath, "-ac", "1", "-b:a", "48k", mp3Path], 300000);
  const uploadPath = enc.code === 0 && fs.existsSync(mp3Path) ? mp3Path : audioPath;
  const buf = fs.readFileSync(uploadPath);
  if (uploadPath !== audioPath) fs.unlinkSync(mp3Path);
  const hinglish = language === "hi-en";
  const form = new FormData();
  form.append(
    "file",
    new Blob([buf], { type: uploadPath === audioPath ? "audio/wav" : "audio/mpeg" }),
    path.basename(uploadPath)
  );
  form.append("model", model);
  if (hinglish) {
    form.append("language", "hi");
    form.append("prompt", HINGLISH_PROMPT);
  } else if (language && language !== "auto") {
    form.append("language", language);
  }
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${engine} transcription error ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  onProgress?.(70, "Processing transcript...");
  const words: WordTimestamp[] = (j.words || []).map((w: any) => ({
    word: (w.word || "").trim(),
    start: w.start || 0,
    end: w.end || 0,
  }));
  const segments = (j.segments || []).map((s: any) => ({
    start: s.start || 0,
    end: s.end || 0,
    text: (s.text || "").trim(),
  }));
  const result: TranscriptionResult = {
    text: (j.text || "").trim(),
    language: j.language,
    duration: j.duration || 0,
    words,
    segments,
  };
  // like the local path: auto-detected Hindi/Urdu is treated as Hinglish
  const detectedHindi = /^(hi|hindi|ur|urdu)$/i.test(String(j.language || ""));
  return hinglish || (language === "auto" && detectedHindi) ? romanizeTranscript(result) : result;
}

// always fillers, wherever they appear (Whisper may write Hindi hesitations in Devanagari)
const HARD_FILLERS = ["um", "uh", "er", "ah", "eh", "hmm", "hm", "umm", "uhh", "mm", "mhm", "अम", "उम", "हम्म", "आ"];
// real words that are only fillers when set off by pauses/commas:
// "it's, like, slow" is a filler, "I like Python" is not.
// Hinglish: "matlab," / "toh," / "achha," as verbal tics, but not "iska matlab hai".
const SOFT_FILLERS = [
  "like", "basically", "actually", "literally",
  "matlab", "yaani", "yani", "toh", "to", "achha", "acha", "accha", "haan", "han", "bas", "dekho",
  "मतलब", "यानी", "तो", "अच्छा", "हां", "हाँ", "बस", "देखो",
];
const BIGRAM_FILLERS = [
  "you know", "i mean", "so yeah", "sort of", "kind of", "you see",
  "kya hai", "kya bolte", "hai na", "theek hai", "thik hai",
  "क्या है", "है ना", "ठीक है",
];
const FILLER_PAUSE = 0.3; // seconds of silence that isolates a soft filler

function cleanToken(token: string): string {
  // keep Devanagari (ऀ-ॿ) so Hindi words aren't stripped to nothing
  return token.toLowerCase().replace(/[^a-zऀ-ॿ\s']/g, "").trim();
}

function endsClause(word: string): boolean {
  return /[.,!?;:…।-]$/.test(word.trim()); // । = Devanagari danda (।)
}

/** true when words[i..j] are set off from the surrounding speech */
function isIsolated(ws: WordTimestamp[], i: number, j: number): boolean {
  const before = i === 0 || ws[i].start - ws[i - 1].end >= FILLER_PAUSE || endsClause(ws[i - 1].word);
  const after = j === ws.length - 1 || ws[j + 1].start - ws[j].end >= FILLER_PAUSE || endsClause(ws[j].word);
  return before && after;
}

function markFillers(words: WordTimestamp[]): { words: WordTimestamp[]; fillerCount: number } {
  const out: WordTimestamp[] = words.map((w) => ({ ...w, filler: false }));
  let count = 0;
  for (let i = 0; i < out.length; i++) {
    const t = cleanToken(out[i].word);
    if (HARD_FILLERS.includes(t)) {
      out[i].filler = true;
      count++;
      continue;
    }
    if (i + 1 < out.length) {
      const pair = `${t} ${cleanToken(out[i + 1].word)}`;
      if (BIGRAM_FILLERS.includes(pair) && isIsolated(out, i, i + 1)) {
        out[i].filler = true;
        out[i + 1].filler = true;
        count += 2;
        i++;
        continue;
      }
    }
    if (SOFT_FILLERS.includes(t) && isIsolated(out, i, i)) {
      out[i].filler = true;
      count++;
    }
  }
  return { words: out, fillerCount: count };
}

interface SilenceRegion {
  start: number;
  end: number;
  duration: number;
}

export function buildSegments(
  words: WordTimestamp[],
  silences: SilenceRegion[],
  totalDuration: number,
  regions: LayoutRegion[] = []
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const PAD = 0.18;
  const SILENCE_PAD = 0.25;
  const MIN_KEEP = 1.0;
  const FILLER_GAP = 0.7;
  // While coding on screen, quiet moments usually show typing or output,
  // so only long dead air is cut, and generously padded.
  const SCREEN_SILENCE_MIN = 4.0;
  const SCREEN_SILENCE_PAD = 1.0;

  const marked = markFillers(words);
  const ws = marked.words;

  // filler clusters: consecutive filler words with small gaps
  const clusters: { start: number; end: number; words: WordTimestamp[] }[] = [];
  let i = 0;
  while (i < ws.length) {
    if (ws[i].filler) {
      const clusterWords: WordTimestamp[] = [ws[i]];
      let j = i + 1;
      while (j < ws.length && ws[j].filler && ws[j].start - ws[j - 1].end <= FILLER_GAP) {
        clusterWords.push(ws[j]);
        j++;
      }
      const start = Math.max(0, ws[i].start - PAD);
      const end = Math.min(totalDuration, ws[j - 1].end + PAD);
      clusters.push({ start, end, words: clusterWords });
      i = j;
    } else {
      i++;
    }
  }

  const occupied: { start: number; end: number; kind: "silence" | "filler" }[] = [];
  for (const s of silences) {
    const onScreen = layoutAt(regions, (s.start + s.end) / 2) === "screen";
    if (onScreen && s.duration < SCREEN_SILENCE_MIN) continue;
    const pad = onScreen ? SCREEN_SILENCE_PAD : SILENCE_PAD;
    const sStart = s.start + pad;
    const sEnd = Math.max(sStart + 0.3, s.end - pad);
    occupied.push({ start: sStart, end: sEnd, kind: "silence" });
  }
  for (const c of clusters) {
    occupied.push({ start: c.start, end: c.end, kind: "filler" });
  }
  occupied.sort((a, b) => a.start - b.start);

  const merged: typeof occupied = [];
  for (const r of occupied) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      if (r.kind === "filler") last.kind = "filler";
    } else {
      merged.push({ ...r });
    }
  }

  let cursor = 0;
  let idx = 0;
  const pushKeep = (start: number, end: number) => {
    if (end - start < 0.25) return;
    const segWords = ws.filter((w) => w.start >= start - 0.05 && w.end <= end + 0.05 && !w.filler);
    const text = segWords.map((w) => w.word).join(" ");
    // on screen, a silent stretch is still content (typing, running code)
    const silentScreen = layoutAt(regions, (start + end) / 2) === "screen";
    if (end - start < MIN_KEEP || (text.trim().length === 0 && !silentScreen)) {
      segments.push({
        id: newId(),
        index: idx++,
        start: +start.toFixed(2),
        end: +end.toFixed(2),
        duration: +(end - start).toFixed(2),
        text,
        type: "cut",
        reason: "Too short",
        label: "Fragment",
        words: segWords,
        fillers: ws.filter((w) => w.filler && w.start >= start - 0.05 && w.end <= end + 0.05),
        transitionIn: "cut",
        status: "pending",
        visual: null,
      });
      return;
    }
    segments.push({
      id: newId(),
      index: idx++,
      start: +start.toFixed(2),
      end: +end.toFixed(2),
      duration: +(end - start).toFixed(2),
      text,
      type: "keep",
      label: "",
      words: segWords,
      fillers: [],
      transitionIn: "cut",
      status: "pending",
      visual: null,
    });
  };

  for (const r of merged) {
    if (r.start > cursor) pushKeep(cursor, r.start);
    if (r.kind === "silence") {
      const dur = r.end - r.start;
      if (dur >= 0.4) {
        segments.push({
          id: newId(),
          index: idx++,
          start: +r.start.toFixed(2),
          end: +r.end.toFixed(2),
          duration: +dur.toFixed(2),
          text: "",
          type: "silence",
          reason: `Silence (${dur.toFixed(1)}s)`,
          label: `${dur.toFixed(1)}s pause`,
          words: [],
          fillers: [],
          transitionIn: "none",
          status: "pending",
          visual: null,
        });
      }
    } else {
      const segWords = ws.filter((w) => w.start >= r.start && w.end <= r.end);
      segments.push({
        id: newId(),
        index: idx++,
        start: +r.start.toFixed(2),
        end: +r.end.toFixed(2),
        duration: +(r.end - r.start).toFixed(2),
        text: segWords.map((w) => w.word).join(" "),
        type: "cut",
        reason: "Filler words",
        label: segWords.map((w) => w.word).join(" ").slice(0, 24) || "Filler",
        words: segWords,
        fillers: segWords.filter((w) => w.filler),
        transitionIn: "none",
        status: "pending",
        visual: null,
      });
    }
    cursor = r.end;
  }
  if (cursor < totalDuration) pushKeep(cursor, totalDuration);

  segments.sort((a, b) => a.start - b.start);
  const split = splitAtLayoutChanges(segments, regions);
  split.forEach((s, i) => {
    s.index = i;
    s.layout = layoutAt(regions, (s.start + s.end) / 2);
  });
  labelKeeps(split);
  return split;
}

/**
 * A keep segment that spans a camera -> screen switch is split at the switch,
 * so each piece can be framed, transitioned and captioned for its layout.
 * The cut point is moved into the nearest gap between words.
 */
function splitAtLayoutChanges(segments: TimelineSegment[], regions: LayoutRegion[]): TimelineSegment[] {
  const boundaries = regions.slice(1).map((r) => r.start);
  if (!boundaries.length) return segments;
  const out: TimelineSegment[] = [];
  for (const seg of segments) {
    let pieces = [seg];
    if (seg.type === "keep") {
      for (const b0 of boundaries) {
        const last = pieces[pieces.length - 1];
        if (b0 <= last.start + 0.5 || b0 >= last.end - 0.5) continue;
        let b = b0;
        const straddler = last.words.find((w) => w.start < b && w.end > b);
        if (straddler) b = b - straddler.start < straddler.end - b ? straddler.start : straddler.end;
        if (b <= last.start + 0.5 || b >= last.end - 0.5) continue;
        const left = last.words.filter((w) => (w.start + w.end) / 2 < b);
        const right = last.words.filter((w) => (w.start + w.end) / 2 >= b);
        const mk = (start: number, end: number, ws: WordTimestamp[], id: string): TimelineSegment => ({
          ...last,
          id,
          start: +start.toFixed(2),
          end: +end.toFixed(2),
          duration: +(end - start).toFixed(2),
          words: ws,
          text: ws.map((w) => w.word).join(" "),
        });
        pieces = [...pieces.slice(0, -1), mk(last.start, b, left, last.id), mk(b, last.end, right, newId())];
      }
    }
    out.push(...pieces);
  }
  return out;
}

function labelKeeps(segments: TimelineSegment[]) {
  const keeps = segments.filter((s) => s.type === "keep");
  let mainN = 0;
  let exN = 0;
  let demoN = 0;
  keeps.forEach((s, i) => {
    if (s.layout === "screen") s.label = `Code Demo ${++demoN}`;
    else if (keeps.length === 1) s.label = "Full Content";
    else if (i === 0) s.label = "Introduction";
    else if (i === keeps.length - 1) s.label = "Conclusion";
    else {
      const lower = s.text.toLowerCase();
      if (/\b(example|for instance|case study|such as)\b/.test(lower)) s.label = `Example ${++exN}`;
      else if (/\b(problem|struggle|issue|challenge)\b/.test(lower)) s.label = "Problem Statement";
      else s.label = `Main Point ${++mainN}`;
    }
  });
}

export interface AnalyzeProgress {
  (p: number, stage: string): Promise<void>;
}

export async function runFullAnalysis(
  project: ProjectDoc,
  report: AnalyzeProgress
): Promise<{
  segments: TimelineSegment[];
  analysis?: LLMAnalysis;
  transcript: TranscriptionResult;
  layoutRegions: LayoutRegion[];
}> {
  ensureDirs();
  const settings = await getSettings();
  const srcPath = project.source.filepath;

  await report(4, "Extracting audio...");
  const audioPath = path.join(TMP_DIR, `audio_${project._id}.wav`);
  await extractAudio(srcPath, audioPath);

  await report(8, "Detecting silent moments...");
  const silences = await detectSilences(audioPath, -35, 1.2);

  await report(10, "Detecting camera vs screen recording...");
  const layoutRegions = await detectLayoutRegions(
    srcPath,
    project.source.duration,
    project.source.mediaType
  );

  let transcription: TranscriptionResult;
  const engine = settings.transcription.engine;
  const groqWhisper = settings.transcription.remoteModel || "whisper-large-v3-turbo";
  if (engine === "groq" && settings.keys.groq) {
    transcription = await transcribeRemote("groq", settings.keys.groq, audioPath, project.language, groqWhisper, (p, s) =>
      report(p * 0.7, s)
    );
  } else if (engine === "openai" && settings.keys.openai) {
    transcription = await transcribeRemote("openai", settings.keys.openai, audioPath, project.language, "whisper-1", (p, s) =>
      report(p * 0.7, s)
    );
  } else {
    transcription = await runTranscribe(
      audioPath,
      settings.transcription.model || "base",
      project.language === "auto" ? null : project.language,
      (p, s) => report(p * 0.7, s)
    );
  }

  await report(55, "Building timeline segments...");
  const duration = project.source.duration || transcription.duration || 0;
  const segments = buildSegments(transcription.words, silences, duration, layoutRegions);

  await report(62, "Running AI analysis...");
  let analysis: LLMAnalysis | undefined;
  try {
    analysis = await runLLMAnalysis(segments, transcription.text, project.name);
  } catch (e: any) {
    console.error("[analyze] LLM analysis failed:", e?.message);
    analysis = undefined;
  }

  try {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  } catch {
    /* ignore */
  }

  await report(100, "Analysis complete");
  return { segments, analysis, transcript: transcription, layoutRegions };
}

interface LLMAnalysisResponse {
  score?: number;
  hookStrength?: "strong" | "moderate" | "weak";
  assessment?: string;
  strengths?: string[];
  improvements?: string[];
  suggestedAngle?: string;
  segments?: {
    id?: string;
    label?: string;
    visualPrompt?: string;
    keywords?: string[];
    quality?: "good" | "average" | "weak";
    note?: string;
  }[];
}

export async function runLLMAnalysis(
  segments: TimelineSegment[],
  fullText: string,
  projectName: string,
  provider?: any
): Promise<LLMAnalysis> {
  const keepSegments = segments.filter((s) => s.type === "keep");
  const segDescription = keepSegments
    .map(
      (s) =>
        `- id: ${s.id} | ${fmt(s.start)}-${fmt(s.end)} | ${s.layout === "screen" ? "SCREEN RECORDING" : "on camera"} | ${s.label} | "${s.text.slice(0, 180)}"`
    )
    .join("\n");

  const system =
    "You are an expert video content strategist and editor. You analyze transcripts of talking-head videos and provide precise, actionable feedback. Transcripts may be Hinglish (Hindi in Roman script mixed with English) - understand them fully, but write your feedback in English. Always respond with valid JSON only, no markdown fences.";

  const hasScreen = keepSegments.some((s) => s.layout === "screen");
  const formatNote = hasScreen
    ? `
Format: an educational coding tutorial. The presenter introduces the topic on camera, then records their laptop screen while coding.
For SCREEN RECORDING segments: label them by what is being built or explained (e.g. "Setup Project", "Write API Route", "Run & Test"), and set "visualPrompt" to "" (never cover code with stock footage).
Judge the hook on the on-camera intro: does it state what the viewer will build/learn and why it matters?
`
    : "";

  const user = `Analyze this video transcript for an AI video editing tool.
${formatNote}
Project name: ${projectName}
Full transcript:
"""
${fullText.slice(0, 6000)}
"""

Timeline segments (keep segments only):
${segDescription}

Respond with JSON in exactly this schema:
{
  "score": <number 0-10, overall content quality>,
  "hookStrength": "strong" | "moderate" | "weak",
  "assessment": "<2-3 sentence overall assessment>",
  "strengths": ["<3 strong points>"],
  "improvements": ["<3-4 concrete improvements>"],
  "suggestedAngle": "<one-line creative suggestion>",
  "segments": [
    {
      "id": "<segment id from above>",
      "label": "<short 1-3 word label like 'Introduction', 'Problem Statement', 'Key Benefit', 'Example', 'Conclusion'>",
      "visualPrompt": "<stock footage search query, 3-6 words, concrete visual nouns>",
      "keywords": ["<2-4 keywords>"],
      "quality": "good" | "average" | "weak",
      "note": "<one short note about this segment>"
    }
  ]
}`;

  const { data, provider: usedProvider, model } = await callLLMJson<LLMAnalysisResponse>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { provider }
  );

  const insights: SegmentInsight[] = (data.segments || [])
    .filter((s) => s.id)
    .map((s) => ({
      segmentId: s.id!,
      quality: s.quality || "average",
      note: s.note || "",
    }));

  for (const seg of segments) {
    const match = (data.segments || []).find((s) => s.id === seg.id);
    if (match) {
      if (match.label && seg.type === "keep") seg.label = match.label;
      if (match.visualPrompt && seg.layout !== "screen") seg.visualPrompt = match.visualPrompt;
      if (match.keywords?.length && seg.layout !== "screen") seg.visualKeywords = match.keywords;
    }
  }

  return {
    provider: usedProvider,
    model,
    score: typeof data.score === "number" ? Math.max(0, Math.min(10, data.score)) : 7,
    hookStrength: data.hookStrength || "moderate",
    assessment:
      data.assessment ||
      "Content analyzed. Review the detected segments and proceed to visual selection.",
    strengths: data.strengths?.length ? data.strengths : ["Clear explanation"],
    improvements: data.improvements?.length
      ? data.improvements
      : ["Remove filler words", "Add supporting visuals"],
    suggestedAngle: data.suggestedAngle || "Show, don't just tell — demonstrate key points with visuals.",
    segmentInsights: insights,
    generatedAt: new Date().toISOString(),
  };
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1);
  return `${String(m).padStart(2, "0")}:${s.padStart(4, "0")}`;
}
