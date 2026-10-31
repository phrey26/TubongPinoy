"""Original marble foley and glass-mallet cues, using the Tumbang pack's helpers.

Run: python3 scripts/generate-jolens-audio.py
Standard library only; seeded generation reproduces all nine WAVs exactly.
"""
import hashlib
import importlib.util
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('tumbang_synthesis', Path(__file__).with_name('generate-tumbang-audio.py'))
foley = importlib.util.module_from_spec(spec)
spec.loader.exec_module(foley)
foley.OUT = ROOT / 'public/assets/jolens-blast-assets/audio'
RATE = foley.RATE


def glass(track, start, variant=0, level=1):
    """A solid glass bead: hard contact, small low body, rapidly damped modes."""
    frequencies = [[1517, 3373, 5659, 9041], [1643, 3593, 5999, 9473], [1399, 3163, 5347, 8597]][variant]
    foley.modes(track, start, .15, frequencies, .46 * level, .023)
    foley.modes(track, start, .055, [463, 811], .12 * level, .009)
    foley.friction(track, start, .009, .47 * level, 7600, attack=.0007, decay=7)


def note(track, start, frequency, duration, level):
    """Rounded musical glass, with a soft fundamental and tiny inharmonic sheen."""
    offset = round(start * RATE)
    for i in range(min(round(duration * RATE), len(track) - offset)):
        t = i / RATE
        envelope = min(1, t / .002) * min(1, (duration - t) / .018)
        phase = 2 * math.pi * frequency * t
        sample = (math.sin(phase) * math.exp(-t / .075)
                  + .19 * math.sin(phase * 2) * math.exp(-t / .035)
                  + .075 * math.sin(phase * 2.756) * math.exp(-t / .023))
        track[offset + i] += sample * envelope * level


def clink(variant):
    track = foley.blank(.18)
    glass(track, 0, variant)
    # Very quiet, irregular surface grit under the clean glass contact.
    foley.friction(track, .008, .075, .08, 2300, decay=6)
    return track


def aim():
    track = foley.blank(.27)
    for i, frequency in enumerate([523.25, 587.33, 659.25]):
        note(track, i * .06, frequency, .14, .50 + i * .12)
    return track


def shoot():
    track = foley.blank(.22)
    glass(track, 0, 1, .32)
    # A finger flick and a short grainy roll; the melodic tag matches the charge.
    foley.friction(track, 0, .026, .32, 1300, decay=5)
    foley.friction(track, .015, .15, .16, 1900, attack=.004, decay=5)
    for i, frequency in enumerate([659.25, 783.99, 1046.50]):
        note(track, .008 + i * .033, frequency, .12, .20 + .04 * i)
    return track


def knockout():
    track = foley.blank(.16)
    note(track, 0, 1318.51, .13, .38)
    note(track, .026, 1567.98, .12, .18)
    return track


def collect():
    track = foley.blank(.42)
    glass(track, 0, 2, .22)
    for start, frequency in [(0, 783.99), (.085, 1046.50), (.15, 1318.51)]:
        note(track, start, frequency, .24, .40)
    return track


def result(won):
    track = foley.blank(.88 if won else .63)
    notes = ([(0, 523.25), (.10, 659.25), (.20, 783.99), (.34, 1046.50)] if won
             else [(0, 392.00), (.135, 329.63), (.27, 261.63)])
    for start, frequency in notes:
        note(track, start, frequency, .29, .65)
    if won:
        note(track, .34, 1318.51, .38, .20)
        note(track, .34, 1567.98, .38, .12)
        glass(track, .025, 0, .10)
    return track


def main():
    foley.OUT.mkdir(parents=True, exist_ok=True)
    pack = [('aim', aim, .30), ('throw', shoot, .46),
            ('clink', lambda: clink(0), .65), ('clink-2', lambda: clink(1), .65),
            ('clink-3', lambda: clink(2), .65), ('knockout', knockout, .26),
            ('collect', collect, .39), ('win', lambda: result(True), .44),
            ('miss', lambda: result(False), .31)]
    hashes = {}
    for index, (name, generate, peak) in enumerate(pack):
        foley.RNG = random.Random(76100 + index)
        foley.save(name, generate(), peak)
        hashes[name + '.wav'] = hashlib.sha256((foley.OUT / (name + '.wav')).read_bytes()).hexdigest()
    (ROOT / 'docs/jolens-audio-sha256.json').write_text(json.dumps(hashes, indent=2) + '\n')


if __name__ == '__main__':
    main()
