# Tumbang Preso audio

The pack contains 15 WAV files. Reference SHA-256 hashes for the current versions
are in `docs/tumbang-audio-sha256.json`. The restored gameplay sounds are preserved;
the interface click and low-Juice warning have been redesigned. There is no
background music.

Regenerate all files with `python3 scripts/generate-tumbang-audio.py`.
The generator uses only Python's standard library and a fixed random seed.
The sounds are original procedural effects, not field recordings. Files are
44,100 Hz mono 16-bit PCM, with boundary fades and headroom.

| File(s) | Sound / trigger |
| --- | --- |
| aim.wav | Quick 0.27-second do–re–mi charge on picking up the slipper |
| throw.wav | Snappy 0.18-second mi–sol–high do shooting jingle, matching aim |
| wall.wav, wall-2.wav, wall-3.wav | Rubber slap, concrete thud, and gritty scrape |
| rock.wav, rock-2.wav, rock-3.wav | Sharp, dry stone clacks |
| can-hit.wav, can-hit-2.wav, can-hit-3.wav | Hollow tin impact and irregular tumbling clatter |
| win.wav | 0.90-second ascending four-note win jingle |
| miss.wav | 0.72-second descending three-note miss jingle |
| click.wav | Playful 0.12-second rubbery pop with a bright click finish |
| empty.wav | 0.86-second low-Juice warning: two alert pings and a draining, powering-down tail |

Material impacts have three takes, with no immediate repeats. Cues alternate
small pitch offsets (1.8–5%) and vary gain by up to 6%; win, miss, and low-Juice jingles keep
their original pitch, timing, and gain. Throw and bounce loudness follows shot
strength. All cues are finite one-shots; idle gameplay becomes silent.

Settings → Sound & volume provides Master, Game effects, and Interface mixers,
individual previews, mute, and restore defaults. Preferences apply immediately
and are saved per account on this browser under `tubong.audio.v1.<id>`; blocked
storage displays a notice while retaining working controls. The game toolbar
provides quick mute and its sidebar links to Sound settings.

Audio initializes only after a user gesture. Loading failures offer Retry sound
and do not block gameplay. Pending sounds cannot play after leaving. Current
sounds stop on mute, tutorial/confirmation pause, hiding the tab, leaving the
game, account changes, or resetting an attempt. Twelve-source polyphony and a
55 ms bounce interval prevent excessive overlap. A compressor provides output
headroom; separate effects/interface gains feed the master.

Run `npm test -- --watch=false` and `npm run build` to verify integration.
To verify the restored files against the current reference hashes:

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib, json
root = Path('public/assets/tumbang-preso-assets/audio')
expected = json.loads(Path('docs/tumbang-audio-sha256.json').read_text())
assert {p.name for p in root.glob('*.wav')} == set(expected)
for name, digest in expected.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
print('All 15 sounds match their reference hashes.')
PY
```
