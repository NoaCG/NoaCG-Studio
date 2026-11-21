# copies.py <pairs.json>...: per mode, copies of each Take sent before it ran (its own attempts),
# all send attempts of the taker's page that started between the press and the run (the Take's
# and any earlier press still being sent), and how many of those were answered 500 (55P03).
import json, sys, math
def p(v, q):
    s = sorted(v); return s[min(len(s) - 1, math.ceil(q / 100 * len(s)) - 1)] if s else None
for mode in ('all', 'alone'):
    own, total, busy, slow, n = [], [], 0, [], 0
    for f in sys.argv[1:]:
        for r in json.load(open(f))['rounds']:
            if r['mode'] != mode: continue
            for t in r.get('takes', []):
                ran = (t['ranAt'] - t['pressAt']) if t['ranAt'] else 1e9
                s = [x for x in t.get('sends', []) if x['t'] < ran]
                o = [x for x in s if 'play' in x['k']]
                n += 1
                own.append(len(o)); total.append(len(s)); busy += sum(1 for x in s if x.get('st') == 500)
                if ran > 2000: slow.append((round(ran), len(o), len(s)))
    print(f"{mode:5} takes {n}  own copies mean {sum(own)/max(1,len(own)):.2f} max {max(own or [0])}  "
          f"all copies mean {sum(total)/max(1,len(total)):.2f} p95 {p(total,95)} max {max(total or [0])}  "
          f"busy(500) answers {busy}  takes over 2 s (ms, own, all): {sorted(slow, reverse=True)[:8]}")

# Copies of the Take's own press that may sit at the server at once: an answered copy from its send to
# its answer; one with no answer (cut by the page, or no response) up to 8 s after its send, since
# the server may still hold it (the statement timeout). The most at any moment, per Take.
for mode in ('all', 'alone'):
    peaks = []
    for f in sys.argv[1:]:
        for r in json.load(open(f))['rounds']:
            if r['mode'] != mode: continue
            for t in r.get('takes', []):
                ran = (t['ranAt'] - t['pressAt']) if t['ranAt'] else 1e9
                iv = []
                for x in t.get('sends', []):
                    if 'play' not in x['k'] or x['t'] >= ran: continue
                    answered = x.get('end') is not None and x.get('st') not in (None, 0)
                    iv.append((x['t'], x['end'] if answered else x['t'] + 8000))
                peaks.append(max((sum(1 for a, b in iv if a <= s < b) for s, _ in iv), default=0))
    hist = {k: peaks.count(k) for k in sorted(set(peaks))}
    print(f"{mode:5} copies of one Take that may be at the server at once: {hist}")
