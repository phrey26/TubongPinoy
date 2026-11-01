"""Original struck-crystal Aldugo cues with subtle baked reverb; no pitch sweeps.

Deterministic modal synthesis, no external samples.
"""
import math
import random
import struct
import wave
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/tumbang-preso-skins-assets/audio'
RATE = 44100
rng = random.Random(1101)

def crystal(track, start, frequency, gain, decay=.22, stretch=1, brightness=1):
    """Struck-glass modes: fixed, inharmonic pitches with faster high-mode decay."""
    offset = round(start * RATE)
    length = min(round(decay * 5 * RATE), len(track) - offset)
    for ratio, weight in [(1, 1), (2.756, .43), (5.404, .19), (8.933, .07)]:
        hz = frequency * (ratio if ratio == 1 else ratio * stretch)
        weight *= 1 if ratio == 1 else brightness
        if hz > 14000:
            continue
        lifetime = decay / (ratio ** .42)
        for i in range(length):
            t = i / RATE
            envelope = min(1, t / .0012) * math.exp(-t / lifetime)
            # Close resonances produce the natural beating of vibrating crystal.
            wavelet = math.sin(2 * math.pi * hz * t)
            wavelet += .16 * math.sin(2 * math.pi * hz * 1.003 * t)
            track[offset+i] += gain * weight * envelope * wavelet
    # A tiny contact tick gives the chime a tangible struck attack, not a whoosh.
    for i in range(min(round(.003 * RATE), length)):
        track[offset+i] += rng.uniform(-1, 1) * gain * .22 * math.exp(-i / (RATE * .0007))


def reverb(track, wet=.17):
    """Short damped room reflections, baked in so mute/reset also stop the tail."""
    dry = track[:]
    reflected = [0.] * len(track)
    for delay, feedback in [(.029, .53), (.037, .49), (.043, .46), (.053, .42)]:
        size = round(delay * RATE)
        line = [0.] * size
        low = 0.
        for i, sample in enumerate(dry):
            index = i % size
            echo = line[index]
            low += .32 * (echo - low)
            line[index] = sample + low * feedback
            reflected[i] += echo * .25
    # Predelay keeps the crystal contact distinct; the tail sits behind it.
    predelay = round(.012 * RATE)
    return [sample + (wet * reflected[i-predelay] if i >= predelay else 0)
            for i, sample in enumerate(dry)]


def make(name, duration, variant):
    # Five newly synthesized takes: distinct crystal sizes, resonance and timing.
    semitones, stretch, brightness, timing, sustain = [
        (0, 1, 1, 1, 1),
        (-.3, .998, .97, 1.01, 1.02),
        (-.15, 1.002, 1.03, .99, .98),
        (.15, .999, 1.02, 1.005, .99),
        (.3, 1.003, .98, .985, .97),
    ][variant]
    rng.seed(1101 + variant * 101 + sum(map(ord, name)))
    track = [0.] * round(duration * RATE)
    def strike(track, start, frequency, gain, decay):
        crystal(track, start * timing, frequency * 2 ** (semitones / 12),
                gain, decay * sustain, stretch, brightness)
    if name == 'aldugo-aim':
        for start, frequency, gain in [(0, 1046.5, .25), (.085, 1568, .16), (.16, 2093, .11)]:
            strike(track, start, frequency, gain, .16)
    elif name == 'aldugo-launch':
        # A crisp crystal chord followed by individual prismatic fragments.
        for frequency, gain in [(783.99, .22), (1174.66, .16), (1568, .1)]:
            strike(track, 0, frequency, gain, .18)
        for start, frequency in [(.055, 2637), (.115, 2093), (.18, 3136)]:
            strike(track, start, frequency, .065, .11)
    elif name == 'aldugo-bounce':
        strike(track, 0, 1396.9, .28, .105)
        strike(track, .012, 2349.3, .09, .075)
    else:
        # A heavy crystal strike blooms into bright shards over the explosion.
        strike(track, 0, 392, .30, .23)
        strike(track, .003, 1046.5, .20, .21)
        strike(track, .008, 1568, .12, .18)
        for start, frequency, gain in [
            (.065, 3136, .09), (.12, 2093, .08), (.19, 2637, .07),
            (.28, 1568, .055), (.38, 3136, .035), (.49, 2093, .025),
        ]:
            strike(track, start, frequency, gain, .13)
    track = reverb(track, .2 if name == 'aldugo-impact' else .16)
    mean = sum(track) / len(track)
    track = [(v-mean)*min(1, i/64, (len(track)-1-i)/512) for i,v in enumerate(track)]
    # Shared headroom keeps layered gameplay transients under control.
    scale = .62 / max(abs(v) for v in track)
    samples = [round(v*scale*32767) for v in track]
    assert samples[0] == samples[-1] == 0 and max(map(abs,samples)) < 32767
    path = OUT / (name + (f'-{variant + 1}' if variant else '') + '.wav')
    with wave.open(str(path), 'wb') as file:
        file.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        file.writeframes(struct.pack('<'+'h'*len(samples), *samples))
    return path

OUT.mkdir(parents=True, exist_ok=True)
paths = [make(name, duration, variant) for name,duration in [
    ('aldugo-aim', .8), ('aldugo-launch', .85), ('aldugo-bounce', .55), ('aldugo-impact', 1.25)] for variant in range(1 if name in ('aldugo-aim', 'aldugo-impact') else 5)]
(ROOT / 'docs/aldugo-audio-sha256.json').write_text(json.dumps({
    p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}, indent=2)+'\n')
for p in paths:
    print(p.relative_to(ROOT))
