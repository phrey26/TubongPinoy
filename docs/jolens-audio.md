# Jolens Blast audio

Nine original procedural WAVs give the glass marbles a hard contact, a small
rounded body, and a short bright ring. Musical cues use a glass-mallet voice in
the same musical family as Tumbang Preso. These are synthesized effects, not
field recordings. There is no background loop.

| Files | Trigger and character |
| --- | --- |
| aim.wav | 0.27-second do–re–mi charge when picking up the shooter |
| throw.wav | 0.22-second finger flick, brief surface roll, and mi–sol–do release |
| clink.wav, clink-2.wav, clink-3.wav | 0.18-second glass-on-glass contacts, louder for harder collisions |
| knockout.wav | Quiet 0.16-second sparkle when a target clears the ring; this is provisional |
| collect.wav | 0.42-second collection flourish after a successful shot settles |
| win.wav | 0.88-second rising jingle when the board clears or a session ends with points |
| miss.wav | Soft 0.63-second descending jingle for a missed shot or a lost shooter |

Collection and win cues wait until the shooter and targets settle. A target that
returns to the ring is not rewarded. Leaving the shooter inside plays a miss,
even if targets temporarily left the circle. A board clear uses the win jingle
instead of overlapping it with the collection flourish.

The shared audio service retains its `TumbangAudio` name for existing callers.
`start('jolens')` selects a separate lazily loaded bank; it reuses Tumbang's
interface click and low-Juice warning. Each game keeps its own cached aim,
throw, and result buffers. Tumbang's WAVs are unchanged.

Collisions cycle between three takes without immediate repeats, with subtle
1.8–5% pitch offsets. Collection, win, miss, and low-Juice jingles keep fixed
tuning. Shot and collision volume follow force. Collision accents are limited
to one per 55 ms and ring-exit accents to one per 90 ms. All sounds are finite;
the shared compressor and twelve-voice limit keep dense collisions controlled.

The game's Sound on/off button and Settings → Sound & volume share the same
per-account saved master, effects, and interface levels. **Preview marbles**
uses the settings draft without saving it. Tutorial/confirmation pauses, mute,
hidden tabs, leaving the game, and account changes silence playback. Cancelled
drags and new attempts clear old cues. Failed loads show Retry sound and do not
block play.

## Reproduce the assets

Run `python3 scripts/generate-jolens-audio.py`. The generator uses the standard
library and synthesis helpers from `generate-tumbang-audio.py`, with separate
fixed seeds. It writes only Jolens assets and their reference hashes in
`docs/jolens-audio-sha256.json`. Format: 44,100 Hz, mono, 16-bit PCM with boundary
fades and headroom. The nine WAVs total approximately 269 KiB.
