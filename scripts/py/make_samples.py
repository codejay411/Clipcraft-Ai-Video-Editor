#!/usr/bin/env python3
"""ClipCraft AI - Sample video generator.

Generates demo videos (speech with fillers + pauses + background image)
so the entire pipeline can be tested end-to-end.

Usage: make_samples.py [sample_id]   (no arg = generate all missing)
"""
import subprocess
import sys
import os
import json
import shutil
import time
import random
import urllib.request
import urllib.parse

STORAGE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "storage")
SAMPLES_DIR = os.path.abspath(os.path.join(STORAGE, "samples"))
TMP = os.path.join(SAMPLES_DIR, "tmp")

SAMPLES = [
    {
        "id": "tech-talk",
        "title": "Tech Talk",
        "category": "Technology",
        "description": "How AI helps you create better videos, faster",
        "image_prompt": "Professional man with beard speaking to camera in a modern home office studio, warm lighting, shelves and plants in background, photorealistic, 16:9 video still",
        "parts": [
            ("s", "Hey everyone, um, welcome back to the channel."),
            ("g", 1.8),
            ("s", "Today we are going to talk about how AI can help you create better videos, faster."),
            ("s", "So, like, the first thing to understand is transcription."),
            ("s", "Basically, modern AI models can listen to your voice and write down every single word, with timestamps."),
            ("g", 2.2),
            ("s", "You know, this used to take hours of manual work."),
            ("s", "The second part is visual selection."),
            ("s", "The AI actually, uh, finds stock footage that matches what you are saying."),
            ("g", 1.6),
            ("s", "And finally, assembly. I mean, the whole render happens automatically."),
            ("s", "Pretty amazing, right?"),
            ("g", 2.0),
            ("s", "Thanks for watching, and I will see you in the next one."),
        ],
    },
    {
        "id": "educational",
        "title": "Educational",
        "category": "Education",
        "description": "Building good study habits that actually work",
        "image_prompt": "Friendly female teacher speaking in a bright modern classroom with a whiteboard, soft daylight, photorealistic, 16:9 video still",
        "parts": [
            ("s", "Hello students, um, today's lesson is about building good study habits."),
            ("s", "So, like, research shows that consistency beats intensity."),
            ("g", 2.0),
            ("s", "You know, studying thirty minutes every day is better than five hours on Sunday."),
            ("s", "The second habit is active recall."),
            ("s", "Basically, instead of re-reading your notes, you should test yourself."),
            ("g", 1.7),
            ("s", "Uh, this feels harder, but that is exactly why it works."),
            ("s", "And finally, sleep. I mean, your brain consolidates memory while you rest."),
            ("g", 2.3),
            ("s", "Good luck with your studies, and see you in the next class."),
        ],
    },
    {
        "id": "travel-vlog",
        "title": "Travel Vlog",
        "category": "Travel",
        "description": "Chasing sunrises in the mountains",
        "image_prompt": "Young man with backpack standing on a mountain trail looking at snowy peaks at golden sunset, cinematic wide shot, photorealistic, 16:9 video still",
        "parts": [
            ("s", "Hey guys, welcome back, um, so today I am taking you to the mountains."),
            ("s", "The drive here was, like, absolutely insane."),
            ("g", 2.4),
            ("s", "We woke up at four in the morning to catch the sunrise."),
            ("s", "You know, totally worth it. The light coming over those peaks was unreal."),
            ("g", 1.9),
            ("s", "Uh, later we found this small village, and the people there were so welcoming."),
            ("s", "I mean, moments like this are the reason I keep traveling."),
            ("g", 2.1),
            ("s", "Anyway, that is it for today's vlog. See you on the next adventure."),
        ],
    },
    {
        "id": "podcast",
        "title": "Podcast",
        "category": "Podcast",
        "description": "Productivity systems and decision fatigue",
        "image_prompt": "Man speaking into a professional condenser microphone in a cozy podcast studio, warm bokeh lights, shallow depth of field, photorealistic, 16:9 video still",
        "parts": [
            ("s", "Welcome to the show. Um, today we are diving into productivity systems."),
            ("s", "So, like, my guest last week said something interesting."),
            ("g", 1.8),
            ("s", "He said, you don't need more time, you need fewer decisions."),
            ("s", "And honestly, that hit me. You know, decision fatigue is real."),
            ("g", 2.2),
            ("s", "Basically, every choice you make drains a little bit of your energy."),
            ("s", "Uh, so what is the fix? Routines. I mean, automate the small stuff."),
            ("g", 1.6),
            ("s", "That is all for today's episode. Subscribe if you enjoyed it."),
        ],
    },
]


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


# ---------------------------------------------------------------------------
# Local TTS: no cloud service required.
# Detects, in order: espeak-ng / espeak (Linux+macOS), macOS `say`,
# and Windows SAPI via PowerShell. Works fully offline.
# ---------------------------------------------------------------------------
_TTS_KIND = None
_TTS_EXE = None


def detect_tts():
    global _TTS_KIND, _TTS_EXE
    if _TTS_KIND:
        return _TTS_KIND, _TTS_EXE
    for exe in ("espeak-ng", "espeak"):
        if shutil.which(exe):
            _TTS_KIND, _TTS_EXE = "espeak", exe
            return _TTS_KIND, _TTS_EXE
    if sys.platform == "darwin" and shutil.which("say"):
        _TTS_KIND, _TTS_EXE = "say", "say"
        return _TTS_KIND, _TTS_EXE
    if sys.platform == "win32":
        _TTS_KIND, _TTS_EXE = "sapi", None
        return _TTS_KIND, _TTS_EXE
    _TTS_KIND, _TTS_EXE = None, None
    return None, None


def tts(text, out_path, retries=1):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 2000:
        print(f"  (skip existing {os.path.basename(out_path)})", flush=True)
        return out_path
    kind, exe = detect_tts()
    if kind == "espeak":
        r = sh([exe, "-v", "en-us", "-s", "145", "-p", "35", "-a", "170", "-w", out_path, text])
        if r.returncode != 0 or not os.path.exists(out_path):
            raise RuntimeError(f"espeak failed: {(r.stderr or '')[-200:]}")
    elif kind == "say":
        aiff = out_path.replace(".wav", ".aiff")
        r = sh(["say", "-o", aiff, "--data-format=LEI16@22050", text])
        if r.returncode != 0:
            raise RuntimeError(f"macOS say failed: {(r.stderr or '')[-200:]}")
        r = sh(["ffmpeg", "-y", "-i", aiff, "-ar", "44100", "-ac", "1", out_path])
        if r.returncode != 0:
            raise RuntimeError("aiff->wav conversion failed")
    elif kind == "sapi":
        safe_text = text.replace('"', "'")
        safe_path = out_path.replace("\\", "\\\\")
        ps = (
            "Add-Type -AssemblyName System.Speech;"
            f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
            f"$s.SetOutputToWaveFile('{safe_path}');"
            f"$s.Speak(\"{safe_text}\");"
            "$s.Dispose()"
        )
        r = sh(["powershell", "-NoProfile", "-Command", ps])
        if r.returncode != 0 or not os.path.exists(out_path):
            raise RuntimeError(f"Windows SAPI TTS failed: {(r.stderr or '')[-200:]}")
    else:
        raise RuntimeError(
            "No local TTS engine found. Install one:\n"
            "  Linux:   sudo apt install espeak-ng   (or: sudo dnf install espeak-ng)\n"
            "  macOS:   built-in `say` (should be available)\n"
            "  Windows: built-in SAPI voices (should be available)\n"
            "Then try again — or simply upload your own video instead of using samples."
        )
    return out_path


def silence(dur, out_path):
    r = sh([
        "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-t", str(dur), "-c:a", "pcm_s16le", out_path,
    ])
    if r.returncode != 0:
        raise RuntimeError(f"silence gen failed: {r.stderr[-300:]}")
    return out_path


def probe_dur(path):
    r = sh(["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path])
    try:
        return float(json.loads(r.stdout)["format"]["duration"])
    except Exception:
        return 0


def generate_bg_image(prompt, out_path, retries=3):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 2000:
        return out_path
    # Try Pollinations (free image generation, no API key) first
    for attempt in range(1, retries + 1):
        try:
            url = (
                "https://image.pollinations.ai/prompt/"
                + urllib.parse.quote(prompt + ", photorealistic, cinematic lighting")
                + f"?width=1344&height=768&nologo=true&model=flux&seed={random.randint(1, 10**9)}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "ClipCraftAI/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) > 2000:
                with open(out_path, "wb") as f:
                    f.write(data)
                print("  (background via Pollinations)", flush=True)
                return out_path
        except Exception as e:
            print(f"  pollinations retry {attempt}/{retries} ({e})", flush=True)
            time.sleep(5)
    # final fallback: generate a nice gradient locally with PIL (always offline)
    try:
        from PIL import Image, ImageDraw, ImageFilter
        random.seed(hash(prompt) & 0xFFFFFFFF)
        w, h = 1344, 768
        palettes = [
            [(24, 20, 60), (90, 60, 180), (200, 130, 255)],
            [(10, 30, 60), (30, 110, 170), (140, 220, 250)],
            [(40, 16, 50), (180, 70, 120), (255, 180, 140)],
            [(15, 35, 30), (40, 140, 100), (200, 240, 200)],
        ]
        pal = random.choice(palettes)
        img = Image.new("RGB", (w, h))
        dr = ImageDraw.Draw(img)
        for y in range(h):
            t = y / h
            c = tuple(int(pal[0][i] + (pal[2][i] - pal[0][i]) * (t ** 1.4)) for i in range(3))
            dr.line([(0, y), (w, y)], fill=c)
        # soft blurred circles
        blobs = Image.new("RGB", (w, h), (0, 0, 0))
        bd = ImageDraw.Draw(blobs)
        for _ in range(14):
            x, y = random.randint(0, w), random.randint(0, h)
            rr = random.randint(60, 260)
            col = random.choice(pal)
            bd.ellipse([x - rr, y - rr, x + rr, y + rr], fill=col)
        blobs = blobs.filter(ImageFilter.GaussianBlur(60))
        img = Image.blend(img, blobs, 0.45)
        # subtle vignette
        vig = Image.new("L", (w, h), 0)
        vd = ImageDraw.Draw(vig)
        vd.ellipse([-w * 0.2, -h * 0.25, w * 1.2, h * 1.25], fill=90)
        vig = vig.filter(ImageFilter.GaussianBlur(120))
        img = Image.composite(img, Image.new("RGB", (w, h), (8, 8, 14)), vig)
        img.save(out_path)
        print("  (used local gradient fallback)", flush=True)
        return out_path
    except Exception as e:
        raise RuntimeError(f"background generation failed: {e}")


def generate_sample(s):
    os.makedirs(TMP, exist_ok=True)
    work = os.path.join(TMP, s["id"])
    os.makedirs(work, exist_ok=True)

    pieces = []
    idx = 0
    for kind, val in s["parts"]:
        if kind == "s":
            p = os.path.join(work, f"part_{idx:03d}.wav")
            tts(val, p)
            pieces.append(p)
            idx += 1
            print(f"  tts {idx}/{len([x for x in s['parts'] if x[0]=='s'])}")
        else:
            p = os.path.join(work, f"sil_{idx:03d}.wav")
            silence(val, p)
            pieces.append(p)
            idx += 1

    # normalize all to same rate/channels then concat
    norm = []
    for i, p in enumerate(pieces):
        np_ = os.path.join(work, f"n_{i:03d}.wav")
        r = sh(["ffmpeg", "-y", "-i", p, "-ar", "44100", "-ac", "1", np_])
        if r.returncode != 0:
            raise RuntimeError(f"normalize failed: {r.stderr[-200:]}")
        norm.append(np_)
    listfile = os.path.join(work, "list.txt")
    with open(listfile, "w") as f:
        for p in norm:
            f.write(f"file '{p}'\n")
    speech = os.path.join(work, "speech.wav")
    r = sh(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c:a", "pcm_s16le", speech])
    if r.returncode != 0:
        raise RuntimeError(f"concat failed: {r.stderr[-300:]}")

    dur = probe_dur(speech)
    bg = os.path.join(work, "bg.png")

    out_mp4 = os.path.join(SAMPLES_DIR, f"{s['id']}.mp4")
    if os.path.exists(out_mp4):
        print(f"  (final exists, skip build)")
    else:
        bg = os.path.join(work, "bg.png")
        generate_bg_image(s["image_prompt"], bg)

        r = sh([
            "ffmpeg", "-y",
            "-loop", "1", "-i", bg,
            "-i", speech,
            "-filter_complex",
            "[0:v]scale=1280:720,zoompan=z='1.0+0.00025*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=24,format=yuv420p[v]",
            "-map", "[v]", "-map", "1:a",
            "-t", str(dur),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
            "-shortest", out_mp4,
        ])
        if r.returncode != 0:
            raise RuntimeError(f"video build failed: {r.stderr[-500:]}")

    thumb = os.path.join(SAMPLES_DIR, f"{s['id']}_thumb.jpg")
    sh(["ffmpeg", "-y", "-ss", "1", "-i", out_mp4, "-frames:v", "1", "-vf", "scale=480:-2", thumb])

    total = probe_dur(out_mp4)
    print(f"  => {out_mp4} ({total:.1f}s)")
    return {"id": s["id"], "title": s["title"], "category": s["category"], "description": s["description"], "duration": round(total, 1)}


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    os.makedirs(SAMPLES_DIR, exist_ok=True)
    meta_path = os.path.join(SAMPLES_DIR, "samples.json")
    meta = []
    if os.path.exists(meta_path):
        try:
            meta = json.load(open(meta_path))
        except Exception:
            meta = []
    for s in SAMPLES:
        if only and s["id"] != only:
            continue
        out_mp4 = os.path.join(SAMPLES_DIR, f"{s['id']}.mp4")
        if os.path.exists(out_mp4):
            print(f"sample {s['id']} exists, skip")
            meta = [m for m in meta if m["id"] != s["id"]]
            meta.append({"id": s["id"], "title": s["title"], "category": s["category"], "description": s["description"], "duration": probe_dur(out_mp4)})
            continue
        print(f"Generating sample: {s['id']}")
        try:
            info = generate_sample(s)
            meta = [m for m in meta if m["id"] != s["id"]]
            meta.append(info)
        except Exception as e:
            print(f"  FAILED: {e}")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    # cleanup tmp
    if os.path.exists(TMP):
        shutil.rmtree(TMP, ignore_errors=True)
    print("Samples meta:", json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
