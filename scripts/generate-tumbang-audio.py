"""Reproduce the original Tumbang Preso sound pack with Python's standard library.

Run: python3 scripts/generate-tumbang-audio.py
Material-based procedural foley, charging/shooting cues, and result jingles.
No field recordings or background music. Fixed seed preserves the original takes.
"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parents[1] / 'public/assets/tumbang-preso-assets/audio'
RNG = random.Random(451)


def blank(seconds):
    return [0.0] * round(seconds * RATE)


def friction(track, start, seconds, level, cutoff=2200, attack=.0015, decay=5, swell=False):
    offset = round(start * RATE)
    low = dc = 0.0
    alpha = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    for i in range(min(round(seconds * RATE), len(track) - offset)):
        t = i / RATE
        low += alpha * (RNG.uniform(-1, 1) - low)
        dc += .006 * (low - dc)
        envelope = math.sin(math.pi * t / seconds) ** 2 if swell else min(1, t / attack) * math.exp(-decay * t / seconds)
        release = min(1, (seconds - t) / .015)
        track[offset + i] += (low - dc) * envelope * release * level


def modes(track, start, seconds, frequencies, level, decay):
    offset = round(start * RATE)
    count = min(round(seconds * RATE), len(track) - offset)
    excitation = [RNG.uniform(-1, 1) * math.exp(-i / (RATE * .0007)) for i in range(count)]
    for j, frequency in enumerate(frequencies):
        radius = math.exp(-1 / (RATE * decay / (1 + j * .55)))
        coefficient = 2 * radius * math.cos(2 * math.pi * frequency / RATE)
        previous = older = 0.0
        response = []
        for impulse in excitation:
            current = impulse + coefficient * previous - radius * radius * older
            response.append(current)
            older, previous = previous, current
        peak = max(abs(value) for value in response) or 1
        gain = level / peak / ((j + 1) ** .85)
        for i, value in enumerate(response):
            t = i / RATE
            track[offset + i] += value * gain * min(1, t / .0008) * min(1, (seconds - t) / .025)


def rubber(track, start, level=1):
    friction(track, start, .055, level * .85, 1750, decay=7)
    friction(track, start, .09, level * .9, 360, attack=.002, decay=5)
    modes(track, start, .095, [132, 217, 341], level * .14, .015)


def sidewalk(variant):
    track = blank(.24)
    rubber(track, 0, .95)
    friction(track, .001, .026, .95, 6200, decay=8)
    friction(track, .016, .13, .29, 3400, attack=.006, decay=4)
    for _ in range(4):
        friction(track, RNG.uniform(.025, .085), .012, RNG.uniform(.08, .15), 5500)
    return track


def rock(variant):
    track = blank(.22)
    rubber(track, 0, .55)
    frequencies = [[870, 1931, 3187, 5071], [955, 2143, 3479, 5641], [810, 1823, 2917, 4721]][variant]
    modes(track, 0, .14, frequencies, .32, .014)
    friction(track, 0, .021, 1.0, 9200, decay=9)
    friction(track, .018, .075, .20, 5200, decay=6)
    return track


def can(variant):
    track = blank(.86)
    frequencies = [[463, 731, 1247, 2081, 3269], [497, 773, 1319, 2237, 3451], [439, 691, 1171, 1993, 3109]][variant]
    rubber(track, 0, .36)
    modes(track, 0, .72, frequencies, .36, .14)
    friction(track, 0, .025, .72, 7800, decay=9)
    for start, strength in [(RNG.uniform(.11, .14), .22), (RNG.uniform(.23, .27), .14), (RNG.uniform(.37, .42), .075)]:
        modes(track, start, .30, [f * RNG.uniform(.99, 1.01) for f in frequencies[1:]], strength, .045)
        friction(track, start, .022, strength * 1.5, 6800, decay=8)
    friction(track, .40, .29, .13, 3900, attack=.005, decay=5)
    return track


def save(name, samples, target):
    assert samples and all(math.isfinite(s) for s in samples)
    mean = sum(samples) / len(samples)
    samples = [(s - mean) * min(1, i / 32, (len(samples) - 1 - i) / 400) for i, s in enumerate(samples)]
    gain = target / max(abs(s) for s in samples)
    pcm = [round(s * gain * 32767) for s in samples]
    assert max(abs(s) for s in pcm) < 32767
    with wave.open(str(OUT / (name + '.wav')), 'wb') as file:
        file.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        file.writeframes(struct.pack('<' + 'h' * len(pcm), *pcm))
    print(f'{name:12} {len(samples) / RATE:.2f}s  peak {target:.2f}')


def jingle(won):
    track = blank(.90 if won else .72)
    notes = ([(0, 523.25, .22), (.105, 659.25, .22), (.21, 783.99, .22),
              (.35, 1046.50, .47)] if won else
             [(0, 392.00, .24), (.15, 311.13, .24), (.31, 261.63, .34)])
    for start, frequency, duration in notes:
        offset = round(start * RATE)
        for i in range(round(duration * RATE)):
            t = i / RATE
            attack = min(1, t / .003)
            release = min(1, (duration - t) / .025)
            phase = 2 * math.pi * frequency * t
            sample = (math.sin(phase) * math.exp(-t / .13)
                      + .28 * math.sin(phase * 2) * math.exp(-t / .045)
                      + .09 * math.sin(phase * 3) * math.exp(-t / .025))
            track[offset + i] += sample * attack * release * (.8 if won else .65)
    return track


def charge():
    track = blank(.27)
    for step, frequency in enumerate([523.25, 587.33, 659.25]):
        offset = round(step * .065 * RATE)
        duration = .12
        for i in range(round(duration * RATE)):
            t = i / RATE
            phase = 2 * math.pi * frequency * t
            envelope = min(1, t / .005) * min(1, (duration - t) / .02) * math.exp(-t / .065)
            sample = math.sin(phase) + .22 * math.sin(phase * 2) + .06 * math.sin(phase * 3)
            track[offset + i] += sample * envelope * (.55 + step * .2)
    return track


def shoot():
    track = blank(.18)
    for step, frequency in enumerate([659.25, 783.99, 1046.50]):
        offset = round(step * .035 * RATE)
        duration = .10 if step == 2 else .065
        for i in range(round(duration * RATE)):
            t = i / RATE
            phase = 2 * math.pi * frequency * t
            envelope = min(1, t / .002) * min(1, (duration - t) / .012) * math.exp(-t / .038)
            sample = math.sin(phase) + .22 * math.sin(phase * 2) + .06 * math.sin(phase * 3)
            track[offset + i] += sample * envelope * (.75 + step * .1)
    return track


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for material, name, peak in [(sidewalk, 'wall', .68), (rock, 'rock', .65), (can, 'can-hit', .73)]:
        for variant in range(3):
            save(name + (f'-{variant + 1}' if variant else ''), material(variant), peak)
    save('aim', charge(), .32)
    save('throw', shoot(), .38)
    save('win', jingle(True), .46)
    save('miss', jingle(False), .36)
    track = blank(.08)
    rubber(track, 0, .3)
    save('click', track, .22)
    track = blank(.26)
    rubber(track, 0, .3)
    rubber(track, .13, .22)
    save('empty', track, .24)


if __name__ == '__main__':
    main()
