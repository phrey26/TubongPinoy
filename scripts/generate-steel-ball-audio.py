"""Deterministic original electrical arcs and thunder; no external recordings."""
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/jolens-blast-skin-assets/audio'
RATE = 44100


def make(kind, duration, variant):
    rng = random.Random(7261 + variant * 113 + sum(map(ord, kind)))
    pitch = 2 ** ([0, -.3, -.15, .15, .3][variant] / 12)
    track = [0.] * round(duration * RATE)

    def arc(start, length, gain):
        offset = round(start * RATE)
        low = 0.
        for i in range(min(round(length * RATE), len(track) - offset)):
            t = i / RATE
            noise = rng.uniform(-1, 1)
            low += .19 * (noise - low)
            # Broken electrical discharge: sharp sparks and a raspy resonant core.
            pulse = .25 + .75 * max(0, math.sin(2 * math.pi * 83 * pitch * t)) ** 4
            buzz = math.sin(2 * math.pi * 970 * pitch * t + 1.8 * math.sin(2 * math.pi * 137 * pitch * t))
            envelope = min(1, t / .0006) * math.exp(-t / (length / 4))
            track[offset+i] += gain * envelope * pulse * (.65 * (noise-low) + .35 * buzz)

    def thunder(start, gain, decay):
        offset = round(start * RATE)
        low = slow = 0.
        for i in range(len(track) - offset):
            t = i / RATE
            low += .035 * (rng.uniform(-1, 1) - low)
            slow += .055 * (low - slow)
            envelope = min(1, t / .006) * math.exp(-t / decay)
            body = .35 * math.sin(2 * math.pi * 66 * pitch * t) + .17 * math.sin(2 * math.pi * 103 * pitch * t)
            track[offset+i] += gain * envelope * (slow * 5 + body)

    def impact(gain, decay):
        """Immediate metal/thunder punch with audible mids, even on small speakers."""
        low = 0.
        for i in range(min(round(.28 * RATE), len(track))):
            t = i / RATE
            noise = rng.uniform(-1, 1)
            low += .24 * (noise - low)
            attack = min(1, t / .0008)
            # Fixed resonances avoid a swooping laser tone.
            body = sum(weight * math.sin(2 * math.pi * hz * pitch * t)
                       for hz, weight in [(92, .46), (184, .34), (370, .22), (740, .10)])
            crack = (noise - low) * math.exp(-t / .012)
            metal = math.sin(2 * math.pi * 1630 * pitch * t) * math.exp(-t / .024)
            track[i] += gain * attack * (body * math.exp(-t / decay) + .55 * crack + .16 * metal)

    if kind == 'aim':
        for start, gain in [(0, .24), (.07, .17), (.13, .12)]:
            arc(start, .065, gain)
    elif kind == 'launch':
        impact(.95, .085)
        arc(0, .21, .65)
        arc(.045, .12, .28)
        thunder(.004, .7, .17)
    elif kind == 'arc':
        impact(.9, .055)
        arc(0, .14, .65)
        arc(.027 + rng.uniform(0, .012), .075, .3)
        thunder(.003, .5, .095)
    else:
        arc(0, .17, .7)
        thunder(.012, .8, .26)
        thunder(.11, .24, .19)
        arc(.095, .08, .13)
    # Short diffuse reflections behind the attack, with no persistent loop.
    dry = track[:]
    for delay, gain in [(.029, .12), (.047, .09), (.079, .06), (.113, .035)]:
        offset = round(delay * RATE)
        for i in range(offset, len(track)):
            track[i] += dry[i-offset] * gain
    mean = sum(track) / len(track)
    track = [(v-mean) * min(1, i/32, (len(track)-1-i)/768) for i, v in enumerate(track)]
    # Round isolated peaks so the impact body stays present without clipping.
    if kind in ('launch', 'arc'):
        track = [math.tanh(v * 1.6) for v in track]
    peak = .32 if kind == 'aim' else .72 if kind in ('launch', 'arc') else .58
    scale = peak / max(map(abs, track))
    samples = [round(v * scale * 32767) for v in track]
    assert samples[0] == samples[-1] == 0 and max(map(abs, samples)) < 32767
    path = OUT / f"steel-{kind}{'-' + str(variant+1) if variant else ''}.wav"
    with wave.open(str(path), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        output.writeframes(struct.pack('<' + 'h'*len(samples), *samples))
    return path


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    paths = [make(kind, duration, variant)
             for kind, duration in [('aim', .35), ('launch', .65), ('arc', .38), ('thunder', 1.05)]
             for variant in range(1 if kind == 'aim' else 5)]
    (ROOT / 'docs/steel-ball-audio-sha256.json').write_text(json.dumps({
        p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}, indent=2) + '\n')
    print(f'Generated {len(paths)} Steel Ball cues.')
