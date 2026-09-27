#!/usr/bin/env python3
"""ClipCraft AI - Procedural background music generator.

Generates soft ambient chord-pad tracks (WAV, 44.1kHz stereo).
Usage: make_music.py <output_dir>
Creates: inspirational.wav, calm.wav, upbeat.wav
"""
import sys
import wave
import struct
import math
import os
import numpy as np

SR = 44100
DURATION = 90  # seconds per track

# chord progressions (midi note numbers)
TRACKS = {
    # Cmaj - Gmaj - Am - Fmaj : uplifting
    "inspirational": {
        "tempo": 96,
        "progression": [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]],
        "pad_gain": 0.16,
        "arp": True,
        "wave": "sine",
    },
    # Am - Fmaj - Cmaj - Gmaj : calm
    "calm": {
        "tempo": 72,
        "progression": [[57, 60, 64, 71], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]],
        "pad_gain": 0.14,
        "arp": False,
        "wave": "sine",
    },
    # faster plucky feel
    "upbeat": {
        "tempo": 118,
        "progression": [[62, 66, 69, 74], [58, 62, 65, 70], [54, 57, 62, 66], [59, 63, 66, 71]],
        "pad_gain": 0.13,
        "arp": True,
        "wave": "triangle",
    },
}


def midi_freq(m):
    return 440.0 * (2 ** ((m - 69) / 12.0))


def adsr(n, sr, a=0.4, d=0.6, sustain_level=0.7):
    t_attack = int(a * sr)
    t_decay = int(d * sr)
    env = np.ones(n)
    if t_attack > 0:
        env[:t_attack] = np.linspace(0, 1, t_attack)
    if t_decay > 0 and n > t_attack + t_decay:
        env[t_attack : t_attack + t_decay] = np.linspace(1, sustain_level, t_decay)
    # release
    t_rel = min(int(0.8 * sr), n // 10)
    if t_rel > 0:
        env[-t_rel:] *= np.linspace(1, 0, t_rel)
    return env


def render_track(spec):
    total_samples = SR * DURATION
    out = np.zeros(total_samples)
    bar_dur = 60.0 / spec["tempo"] * 4  # one chord per bar (4 beats)
    n_bars = int(math.ceil(DURATION / bar_dur))
    for bar in range(n_bars):
        chord = spec["progression"][bar % len(spec["progression"])]
        start = int(bar * bar_dur * SR)
        end = min(int((bar + 1) * bar_dur * SR), total_samples)
        n = end - start
        if n <= 0:
            continue
        t = np.arange(n) / SR
        # pad: all chord notes sustained
        for m in chord:
            f = midi_freq(m)
            if spec["wave"] == "sine":
                tone = np.sin(2 * np.pi * f * t)
                tone += 0.35 * np.sin(2 * np.pi * f * 2 * t)  # soft octave harmonic
            else:
                tone = 2 * np.abs(2 * ((f * t) % 1) - 1) - 1  # triangle
                tone *= 0.6
            env = adsr(n, SR, a=0.5, d=1.0)
            out[start:end] += spec["pad_gain"] * tone * env / len(chord)
        # arpeggio sparkle
        if spec["arp"]:
            step_dur = bar_dur / 8
            for k in range(8):
                m = chord[k % len(chord)] + 12
                s = int(start + k * step_dur * SR)
                e = min(s + int(step_dur * SR), total_samples)
                if e <= s:
                    continue
                tt = np.arange(e - s) / SR
                f = midi_freq(m)
                tone = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 6)
                out[s:e] += 0.06 * tone
    # gentle master fade in/out
    fade = int(SR * 2)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    out = out / (np.max(np.abs(out)) + 1e-9) * 0.85
    return out


def write_wav(path, data):
    stereo = np.zeros(len(data) * 2)
    stereo[0::2] = data
    # slight stereo width via delay
    delay = int(SR * 0.012)
    stereo[1::2] = np.roll(data, delay)
    pcm = (stereo * 32767 * 0.9).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out_dir, exist_ok=True)
    for name, spec in TRACKS.items():
        path = os.path.join(out_dir, f"{name}.wav")
        print(f"Rendering {name}...")
        data = render_track(spec)
        write_wav(path, data)
        print(f"  saved {path} ({os.path.getsize(path)//1024} KB)")


if __name__ == "__main__":
    main()
