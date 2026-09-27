#!/usr/bin/env python3
"""ClipCraft AI - Devanagari -> casual Roman Hindi ("Hinglish") transliteration.

Whisper often writes Hindi speech in Devanagari even when the creator wants
Roman captions ("aaj hum React seekhenge"). This converts any Devanagari
words to the informal spelling YouTube audiences read, leaving Latin words
(English/code terms) untouched. Pure Python, no dependencies.

Usage as a script: hinglish.py "आज हम कोड लिखेंगे"  ->  aaj hum kod likhenge
                   hinglish.py --json <in.json> <out.json>
  (romanizes "text", words[].word and segments[].text of a transcript file)
"""
import re
import sys

VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e",
}
MATRAS = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
}
CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "ळ": "l",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    # precomposed nukta letters
    "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f", "य़": "y",
}
NUKTA_FORMS = {"क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f"}
NUKTA, VIRAMA = "़", "्"
NASALS = {"ं": "n", "ँ": "n"}
VISARGA = "ः"
DIGITS = {chr(0x0966 + i): str(i) for i in range(10)}
DEVANAGARI = re.compile(r"[ऀ-ॿ]+")

# very common words whose everyday Hinglish spelling the rules don't produce
COMMON = {
    "हम": "hum", "तुम": "tum", "नहीं": "nahi", "नही": "nahi", "भाई": "bhai", "में": "mein",
    "मैं": "main", "यह": "ye", "ये": "ye", "वह": "wo", "वो": "wo", "कुछ": "kuch",
    "और": "aur", "एक": "ek", "सब": "sab", "आप": "aap", "क्यों": "kyun", "हाँ": "haan", "हां": "haan",
}


def _syllables(word):
    """Split into units: (consonant_roman | None, vowel_roman | None, has_inherent_a)."""
    units = []
    i = 0
    while i < len(word):
        ch = word[i]
        if ch in CONSONANTS:
            roman = CONSONANTS[ch]
            i += 1
            if i < len(word) and word[i] == NUKTA:
                roman = NUKTA_FORMS.get(ch, roman)
                i += 1
            if i < len(word) and word[i] in MATRAS:
                units.append([roman, MATRAS[word[i]], False])
                i += 1
            elif i < len(word) and word[i] == VIRAMA:
                units.append([roman, None, False])
                i += 1
            else:
                units.append([roman, "a", True])  # inherent vowel, may be deleted
        elif ch in VOWELS:
            units.append([None, VOWELS[ch], False])
            i += 1
        elif ch in NASALS or ch == VISARGA:
            tail = NASALS.get(ch, "h")
            if units:
                units[-1].append(tail)
            i += 1
        elif ch in DIGITS:
            units.append([DIGITS[ch], None, False])
            i += 1
        elif ch == "।" or ch == "॥":
            units.append([".", None, False])
            i += 1
        else:
            i += 1  # stray marks
    return units


def _delete_schwas(units):
    # Hindi drops the inherent "a" at the end of a word (कर = kar) and between
    # a vowel-bearing syllable and a following consonant+vowel (करते = karte).
    n = len(units)
    if n > 1 and units[-1][2]:
        units[-1][1] = None
    for k in range(n - 2, 0, -1):
        u = units[k]
        if not u[2]:
            continue
        prev_has_vowel = units[k - 1][1] is not None
        nxt = units[k + 1]
        if prev_has_vowel and nxt[0] is not None and nxt[1] is not None:
            u[1] = None
    return units


def romanize_word(word):
    if word in COMMON:
        return COMMON[word]
    units = _delete_schwas(_syllables(word))
    out = []
    for u in units:
        cons, vowel = u[0], u[1]
        extra = "".join(u[3:])
        out.append((cons or "") + (vowel or "") + extra)
    roman = "".join(out)
    # casual spelling: word-final "aa" is written "a" (hona, karna)
    if roman.endswith("aa") and len(roman) > 3:
        roman = roman[:-1]
    # ...and long final i/u are written short (zaroori, shuru, bhi)
    if roman.endswith("ee"):
        roman = roman[:-2] + "i"
    elif roman.endswith("oo") and len(roman) > 3:
        roman = roman[:-2] + "u"
    return roman


def romanize(text):
    """Replace every Devanagari run in text; Latin text passes through."""
    return DEVANAGARI.sub(lambda m: romanize_word(m.group(0)), text)


def has_devanagari(text):
    return bool(DEVANAGARI.search(text))


def romanize_transcript(t):
    t["text"] = romanize(t.get("text") or "")
    for w in t.get("words") or []:
        w["word"] = romanize(w.get("word") or "")
    for seg in t.get("segments") or []:
        seg["text"] = romanize(seg.get("text") or "")
    return t


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--json":
        import json
        with open(sys.argv[2], encoding="utf-8") as f:
            data = json.load(f)
        with open(sys.argv[3], "w", encoding="utf-8") as f:
            json.dump(romanize_transcript(data), f, ensure_ascii=False)
    else:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        print(romanize(" ".join(sys.argv[1:])))
