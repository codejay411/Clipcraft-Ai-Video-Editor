#!/usr/bin/env python3
"""ClipCraft AI - Local Whisper transcription (word-level timestamps).

Usage: transcribe.py <audio_path> <model_name> <language> <result_json_path>

<language> is a Whisper code, "auto", or "hi-en" (Hinglish: Hindi + English
speech, captions in Roman script). With "auto", detected Hindi/Urdu is
treated as Hinglish; pick "hi" explicitly for Devanagari output.

Writes progress lines to stderr as JSON: {"p": 0-100, "stage": "..."}
Writes final JSON to result path: {text, language, duration, words:[{word,start,end}], segments:[{start,end,text}]}
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hinglish import romanize  # noqa: E402

# Shown to Whisper as "previous text": nudges it to write Hindi in Roman
# script and keep English/tech words in English.
HINGLISH_PROMPT = (
    "Hello dosto, aaj hum React aur Node.js ke baare mein seekhenge. "
    "Pehle project setup karte hain, phir API banayenge. Chaliye code likhna shuru karte hain."
)
HINDI_LIKE = ("hi", "ur")


def emit_progress(p, stage):
    sys.stderr.write(json.dumps({"p": p, "stage": stage}) + "\n")
    sys.stderr.flush()


def main():
    audio_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base"
    language = sys.argv[3] if len(sys.argv) > 3 else None
    result_path = sys.argv[4] if len(sys.argv) > 4 else None

    if language in ("", "auto", "none", "null"):
        language = None
    hinglish = language == "hi-en"
    if hinglish:
        language = "hi"

    emit_progress(5, "Loading Whisper model...")
    from faster_whisper import WhisperModel, decode_audio

    def load(name):
        try:
            return WhisperModel(name, device="cpu", compute_type="int8")
        except Exception as e:
            print(json.dumps({"error": f"Failed to load model: {e}"}))
            sys.exit(1)

    model = load(model_name)

    if language is None:
        emit_progress(12, "Detecting language...")
        try:
            detected, prob, _ = model.detect_language(
                decode_audio(audio_path), vad_filter=True, language_detection_segments=3
            )
            if detected in HINDI_LIKE:
                language, hinglish = "hi", True
            elif prob >= 0.5:
                language = detected
        except Exception:
            pass  # fall back to Whisper's own per-file detection

    # tiny/base produce gibberish for Hindi; small is the smallest usable model
    if language in HINDI_LIKE and model_name in ("tiny", "base"):
        emit_progress(15, "Hindi/Hinglish detected - loading the 'small' model for accuracy...")
        model = load("small")

    emit_progress(20, "Transcribing audio...")

    options = dict(
        word_timestamps=True,
        language=language,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700},
        beam_size=5,
    )
    if language in HINDI_LIKE:
        # Whisper tends to loop on Hindi; don't feed its own output back in,
        # and drop windows that are repetitive or hallucinated over silence
        options.update(
            condition_on_previous_text=False,
            compression_ratio_threshold=2.0,
            hallucination_silence_threshold=2.0,
        )
    if hinglish:
        options["initial_prompt"] = HINGLISH_PROMPT

    segments_iter, info = model.transcribe(audio_path, **options)

    words = []
    segments = []
    total_text_parts = []

    # estimate total duration for progress
    duration = getattr(info, "duration", 0) or 0

    try:
        for seg in segments_iter:
            t0 = seg.start
            t1 = seg.end
            text = romanize(seg.text).strip() if hinglish else seg.text.strip()
            if text:
                segments.append({"start": round(t0, 3), "end": round(t1, 3), "text": text})
                total_text_parts.append(text)
            if seg.words:
                for w in seg.words:
                    token = (romanize(w.word or "") if hinglish else (w.word or "")).strip()
                    if token:
                        words.append(
                            {"word": token, "start": round(w.start, 3), "end": round(w.end, 3)}
                        )
            if duration > 0:
                pct = min(95, 20 + int(75 * (t1 / duration)))
                emit_progress(pct, f"Transcribing... {int(t1)}s / {int(duration)}s")
    except Exception as e:
        print(json.dumps({"error": f"Transcription failed: {e}"}))
        sys.exit(1)

    emit_progress(97, "Finalizing transcript...")
    result = {
        "text": " ".join(total_text_parts).strip(),
        "language": "hi-en" if hinglish else getattr(info, "language", None),
        "duration": duration,
        "words": words,
        "segments": segments,
    }

    if result_path:
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
    else:
        print(json.dumps(result, ensure_ascii=False))
    emit_progress(100, "Transcription complete")


if __name__ == "__main__":
    main()
