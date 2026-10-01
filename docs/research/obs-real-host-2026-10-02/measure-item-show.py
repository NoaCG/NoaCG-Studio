# Counts one-off flashes of the settled lower third in a recording where the background never
# changes (the overlay's own scene stays on program while its item is hidden and shown): a frame
# with the full graphic, straight after frames with none of it and followed by frames without it,
# is the stale texture. The entrance that follows a flash is reported but not counted as a show.
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
    f = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    bg = f[100:120, 900:920].reshape(-1, 3).mean(0)
    c.append(int(((f[700:1080, 0:960] - bg).min(2) > 25).sum()))
if p.wait() != 0 or not c:
    sys.exit(f'ffmpeg could not read {rec}')
full = max(c) * 0.5
print(f'frames {len(c)}, settled graphic pixels {max(c)}')
shows = flashes = 0
for i in range(2, len(c)):
    if not (c[i - 1] < full <= c[i]):
        continue
    after = c[i:i + 6]
    if max(c[i - 2:i]) < 50:  # the graphic was gone: this is a show
        shows += 1
        flash = len(after) > 1 and after[1] < full
        flashes += flash
        print(f'show at frame {i}: before {c[i - 2:i]} | {after} {"FLASH" if flash else ""}')
print(f'shows {shows}, one-frame flashes {flashes}')
