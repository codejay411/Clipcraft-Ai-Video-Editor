#!/usr/bin/env python3
"""ClipCraft AI - Camera vs screen-recording detector.

Usage: detect_layout.py <video_path> <interval_seconds> <output_json>

Samples one frame every <interval_seconds> and classifies it as "camera"
(person on camera) or "screen" (laptop screen / IDE / browser recording).

Screen recordings are dominated by perfectly flat UI backgrounds with crisp
text edges; camera footage has sensor noise, gradients and soft edges. We
measure both on a small grayscale frame using Pillow only.

Writes JSON: {"samples": [{"t": 0.0, "layout": "camera", "score": 0.12,
"flat": 0.31, "edges": 0.01, "topColors": 0.22}, ...]}
Progress lines on stderr: {"p": 40, "stage": "..."}
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageFilter


def progress(p, stage):
    sys.stderr.write(json.dumps({"p": p, "stage": stage}) + "\n")
    sys.stderr.flush()


def frame_features(path):
    img = Image.open(path).convert("RGB")
    gray = img.convert("L")
    n = gray.width * gray.height

    # local detail: difference between the frame and a lightly blurred copy
    diff = ImageChops.difference(gray, gray.filter(ImageFilter.BoxBlur(1)))
    hist = diff.histogram()
    flat = sum(hist[:2]) / n  # pixels with (almost) no local variation
    edges = sum(hist[40:]) / n  # very sharp transitions (text strokes, UI lines)

    # palette concentration: share of the 3 most common coarse colors
    coarse = img.point(lambda v: v >> 4 << 4)
    colors = coarse.getcolors(maxcolors=n) or []
    colors.sort(reverse=True)
    top_colors = sum(c for c, _ in colors[:3]) / n

    return flat, edges, top_colors


def classify(flat, edges, top_colors):
    # weighted score in 0..1. Measured: IDE recordings ~1.0, camera footage
    # (even with a monitor in the background) ~0.35-0.40. Edge density is
    # reported for debugging only: downscaled text is antialiased, so camera
    # frames often have *more* hard edges than screens.
    score = 0.6 * min(1.0, flat / 0.8) + 0.4 * min(1.0, top_colors / 0.7)
    return score, ("screen" if score >= 0.6 else "camera")


def main():
    if len(sys.argv) < 4:
        print("usage: detect_layout.py <video> <interval> <out_json>", file=sys.stderr)
        sys.exit(2)
    video, interval, out_json = sys.argv[1], float(sys.argv[2]), sys.argv[3]
    work = tempfile.mkdtemp(prefix="cc_layout_")
    try:
        progress(5, "Sampling frames...")
        # png avoids adding JPEG noise that would make screens look like camera
        cmd = [
            "ffmpeg", "-v", "error", "-y", "-i", video,
            "-vf", f"fps=1/{interval},scale=320:-2",
            os.path.join(work, "f_%05d.png"),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg frame sampling failed: {r.stderr[-300:]}")

        frames = sorted(f for f in os.listdir(work) if f.endswith(".png"))
        samples = []
        for i, name in enumerate(frames):
            flat, edges, top_colors = frame_features(os.path.join(work, name))
            score, layout = classify(flat, edges, top_colors)
            # fps filter emits the frame for window i at t = i*interval (+ half window)
            samples.append({
                "t": round(i * interval + interval / 2, 2),
                "layout": layout,
                "score": round(score, 3),
                "flat": round(flat, 3),
                "edges": round(edges, 4),
                "topColors": round(top_colors, 3),
            })
            if i % 10 == 0:
                progress(10 + int(85 * i / max(1, len(frames))), "Classifying camera vs screen...")

        with open(out_json, "w", encoding="utf-8") as f:
            json.dump({"samples": samples}, f)
        progress(100, "Layout detection done")
    except Exception as e:  # report error through the json contract
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump({"error": str(e)}, f)
        sys.exit(1)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
