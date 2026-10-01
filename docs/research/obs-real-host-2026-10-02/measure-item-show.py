# Counts one-off flashes of the settled lower third in a recording where the background never
# changes: a frame with the full graphic between frames without it is the stale texture.
#   python measure-item-show.py <rec.mkv>      (needs ffmpeg on the PATH and numpy)
import subprocess, sys
import numpy as np
rec = sys.argv[1]
W, H = 1920, 1080
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', rec, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
c = []
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    f = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(int)
    bg = f[100:120, 900:920].reshape(-1, 3).mean(0)
    c.append(int(((f[700:1080, 0:960] - bg).min(2) > 25).sum()))
full = max(c) * 0.5
shows = [i for i in range(1, len(c)) if c[i - 1] < full <= c[i]]
print(f'frames {len(c)}, settled {max(c)}')
flashes = 0
for i in shows:
    after = c[i:i + 6]
    flash = len(after) > 1 and after[1] < full
    flashes += flash
    print(f'frame {i}: {c[i-2:i]} | {after} {"FLASH" if flash else ""}')
print(f'graphic appearances {len(shows)}, one-frame flashes {flashes}')
