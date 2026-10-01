# Per-frame read of an OBS recording of cuts between "Other" (a blue colour source) and "On Air"
# (a grey colour source under the lower third). For every switch back to On Air it prints, for the
# first frames, how far the scene has come in (the grey share of the background, 0 to 1) and how
# many pixels of the lower-third region stand above that background by more than a threshold:
# text drawn there before the entrance has started is the stale frame.
#   python measure-cut-back.py <rec.mkv> [threshold, default 25; 6 finds text faded to about 5%]
# Needs ffmpeg on the PATH and numpy. The colours are fixed: Other is pure blue #0000FF and On Air
# is #808080, both full-frame colour sources. A frame counts as stale while more than 30% of the
# settled graphic shows; that holds for an entrance like Hairline's, whose first frames draw only
# its bar, and the per-switch lines print the counts so a reader can check it.
import subprocess, sys
import numpy as np

rec = sys.argv[1]
THRESHOLD = int(sys.argv[2]) if len(sys.argv) > 2 else 25
X, Y, WW, HH = 0, 700, 960, 380  # the lower-left quarter, where the lower third sits
W, H = 1920, 1080
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', rec, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
rows = []
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    f = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    bg = f[100:120, 900:920].reshape(-1, 3).mean(0)
    grey = min(1.0, max(0.0, bg[0] / 128.0))  # red is 0 on Other and 128 on On Air
    region = f[Y:Y + HH, X:X + WW]
    lift = (region - bg).min(2)  # how far each pixel stands above the background in every channel
    rows.append((grey, int((lift > THRESHOLD).sum())))
if p.wait() != 0 or not rows:
    sys.exit(f'ffmpeg could not read {rec}')
print(f'frames {len(rows)}')
settled = max(t for g, t in rows)
print(f'settled graphic pixels {settled}')
starts = [i for i in range(1, len(rows)) if rows[i][0] > 0.02 and rows[i - 1][0] <= 0.02]
stale = []
for c in starts:
    seq = [(round(rows[c + k][0], 2), rows[c + k][1]) for k in range(0, 12) if c + k < len(rows)]
    n = 0
    for g, t in seq:
        if t > settled * 0.3 * max(g, 0.2):
            n += 1
        else:
            break
    stale.append(n)
    print(f'switch at frame {c}: (in, graphic px) {seq} -> stale frames {n}')
print(f'switches {len(starts)}, stale frames per switch {stale}')
