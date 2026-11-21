import json, sys, datetime
# WAL written per second in each round's window, from a once-a-second LSN log.
pairs, wallog = sys.argv[1], sys.argv[2]
pts = []
for line in open(wallog):
    p = line.split()
    if len(p) == 2 and p[1].isdigit():
        t = datetime.datetime.fromisoformat(p[0]).replace(tzinfo=datetime.timezone.utc).timestamp()
        pts.append((t, int(p[1])))
def lsn_at(t):
    best = min(pts, key=lambda x: abs(x[0] - t))
    return best
rates = {'all': [], 'alone': []}
for r in json.load(open(pairs))['rounds']:
    ts = [x['pressAt'] / 1000 for x in r.get('takes', [])]
    if len(ts) < 2: continue
    a, b = lsn_at(ts[0]), lsn_at(ts[-1])
    if b[0] - a[0] < 5: continue
    rates[r['mode']].append((b[1] - a[1]) / (b[0] - a[0]) / 1e6)
for m, v in rates.items():
    print(f"{m:5} WAL MB/s per round: {[round(x, 2) for x in v]}")
