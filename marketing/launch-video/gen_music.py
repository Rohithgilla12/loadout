"""Original score for the Loadout launch video — synthesized, deterministic, ours.

32s @ 120bpm in D minor with an F-lydian lift at the reveal. Section changes land
exactly on the video's scene transitions: 4.5 / 9 / 15.5 / 22.5 / 26.5.
"""

import numpy as np

SR = 44100
DUR = 32.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(42)  # deterministic

mix = np.zeros(N)


def env(attack, decay, length_s):
    """Simple AD envelope of length_s seconds."""
    n = int(length_s * SR)
    e = np.zeros(n)
    na = max(1, int(attack * SR))
    e[:na] = np.linspace(0, 1, na)
    e[na:] = np.exp(-np.arange(n - na) / (decay * SR))
    return e


def add(start_s, sig, gain=1.0):
    i = int(start_s * SR)
    j = min(N, i + len(sig))
    if i < N:
        mix[i:j] += sig[: j - i] * gain


def sine(freq, length_s, phase=0.0):
    n = int(length_s * SR)
    return np.sin(2 * np.pi * freq * np.arange(n) / SR + phase)


def saw_pad(freqs, length_s, detune=0.6):
    """Detuned-saw pad, mellowed by stacking only low harmonics."""
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for d in (-detune, 0.0, detune):
            for h in (1, 2, 3):
                out += np.sin(2 * np.pi * (f + d) * h * tt) / (h * h)
    return out / (len(freqs) * 3 * 1.4)


def kick(length_s=0.3):
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    freq = 110 * np.exp(-tt * 24) + 44
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(phase) * np.exp(-tt * 14)


def hat(length_s=0.05):
    n = int(length_s * SR)
    noise = rng.standard_normal(n)
    noise = np.diff(noise, prepend=0)  # crude highpass
    return noise * np.exp(-np.arange(n) / (0.012 * SR)) * 0.25


def boom(length_s=2.2):
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * 38 * tt) + 0.4 * np.sin(2 * np.pi * 57 * tt)) * np.exp(-tt * 2.2)


def riser(length_s=1.6):
    n = int(length_s * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    smooth = np.convolve(noise, np.ones(96) / 96, mode="same")  # darken
    ramp = (tt / length_s) ** 2.4
    sweep = np.sin(2 * np.pi * (90 + 480 * (tt / length_s) ** 2) * tt) * 0.35
    return (smooth * 0.9 + sweep) * ramp


# ---- harmonic plan (Hz) ----
Dm = [73.42, 110.0, 146.83, 174.61]        # D2 A2 D3 F3 — tense
Bb = [58.27, 87.31, 146.83, 174.61]        # Bb1 F2 D3 F3 — heavier
F_lyd = [87.31, 130.81, 174.61, 220.0]     # F2 C3 F3 A3 — the lift
C = [65.41, 98.0, 130.81, 196.0]           # C2 G2 C3 G3 — motion
D_sub = 36.71                               # D1 sub root
F_sub = 43.65                               # F1 sub root

beat = 0.5  # 120bpm

# ---- pads: one chord per section, slow attack, sustained ----
for start, dur, chord, g in [
    (0.0, 4.5, Dm, 0.16),
    (4.5, 4.5, Bb, 0.20),
    (9.0, 6.5, F_lyd, 0.30),     # reveal — warmest moment
    (15.5, 7.0, C, 0.24),
    (22.5, 4.0, Dm, 0.22),
    (26.5, 5.5, F_lyd, 0.26),    # CTA resolves on the lift
]:
    pad = saw_pad(chord, dur)
    e = np.ones(len(pad))
    na = int(0.8 * SR)
    e[:na] = np.linspace(0, 1, na)
    nr = int(0.6 * SR)
    e[-nr:] *= np.linspace(1, 0.25, nr)
    add(start, pad * e, g)

# ---- sub pulse: 8th notes, section roots ----
def sub_pulse(start, end, root, gain, pattern=2):
    """pattern: place a pulse every `pattern` half-beats."""
    step = beat / 2
    k = 0
    s = start
    while s < end - 0.05:
        if k % pattern == 0:
            note = sine(root, 0.22) * env(0.004, 0.09, 0.22)
            add(s, note, gain)
        k += 1
        s += step

sub_pulse(0.0, 4.5, D_sub, 0.5, pattern=4)        # sparse — unease
sub_pulse(4.5, 9.0, D_sub, 0.55, pattern=2)       # doubling — pressure
sub_pulse(9.0, 15.5, F_sub, 0.5, pattern=2)       # reveal groove
sub_pulse(15.5, 22.5, 49.0, 0.55, pattern=2)      # G1 — motion under C
sub_pulse(22.5, 26.5, D_sub, 0.6, pattern=1)      # 16ths — peak energy
sub_pulse(26.5, 30.5, F_sub, 0.45, pattern=4)     # strip back

# ---- kick: enters at the cost section, grooves through the demo ----
for s in np.arange(4.5, 9.0, beat * 2):
    add(s, kick(), 0.7)
for s in np.arange(9.0, 15.5, beat * 2):
    add(s, kick(), 0.55)
for s in np.arange(15.5, 26.5, beat):
    add(s, kick(), 0.62)

# ---- hats: offbeats from the demo, 16ths at the checklist ----
for s in np.arange(15.5 + beat / 2, 22.5, beat):
    add(s, hat(), 0.5)
for s in np.arange(22.5, 26.5, beat / 4):
    add(s, hat(), 0.38)

# ---- transition hits & risers ----
add(7.4, riser(1.6), 0.5)            # riser into the reveal
add(9.05, boom(), 0.75)              # impact on the zoom-through
add(11.6, boom(1.2), 0.3)            # soft hit under the wordmark stamp
add(14.9, riser(0.6), 0.3)
add(15.5, kick(), 0.85)
add(22.5, kick(), 0.9)
add(26.0, riser(0.5), 0.25)
add(26.6, boom(1.8), 0.4)            # warm hit under "This is my loadout."

# ---- master: gentle fade-in, fade-out, soft clip ----
fade_in = int(0.4 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)
fade_out = int(2.4 * SR)
mix[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5
mix = np.tanh(mix * 1.15) * 0.85

# stereo width: tiny haas delay on one side
delay = int(0.011 * SR)
left = mix
right = np.concatenate([np.zeros(delay), mix[:-delay]]) * 0.97
stereo = np.stack([left, right], axis=1)
pcm = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)

import wave
with wave.open("music.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("music.wav written:", pcm.shape[0] / SR, "s")
