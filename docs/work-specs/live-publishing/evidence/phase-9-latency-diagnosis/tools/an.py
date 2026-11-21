import json, sys
# Per-mode breakdown of press to ran: press -> first send start (page), first send start -> its answer
# (network + server), first send start -> output's batch frame (server + realtime), frame -> play (output).
def pct(a, p):
    a = sorted(a)
    if not a: return None
    k = (len(a) - 1) * p / 100
    f = int(k); c = min(f + 1, len(a) - 1)
    return round(a[f] + (a[c] - a[f]) * (k - f), 1)

def load(paths):
    rounds = []
    for p in paths:
        try: d = json.load(open(p))
        except Exception as e: print('skip', p, e); continue
        rounds += d['rounds']
    return rounds

rounds = load(sys.argv[1:])
for mode in ('alone', 'all'):
    tot, pre, rpc, frame, play, resend, lost = [], [], [], [], [], 0, 0
    for r in rounds:
        if r['mode'] != mode: continue
        for t in r.get('takes', []):
            if t['ranAt'] is None: lost += 1; continue
            ran = t['ranAt'] - t['pressAt']; tot.append(ran)
            s = [x for x in t.get('sends', []) if 'play' in x['k']]
            if not s: continue
            pre.append(s[0]['t'])
            if s[0]['end'] is not None: rpc.append(s[0]['end'] - s[0]['t'])
            if len(s) > 1: resend += 1
            fr = [f['t'] for f in t.get('oframes', []) if 'batch' in f['d']]
            if fr:
                frame.append(fr[-1] - s[0]['t']); play.append(ran - fr[-1])
    print(f"{mode:5} n={len(tot)} lost={lost} resent={resend}")
    for name, a in (('press->ran', tot), ('press->send', pre), ('send rpc', rpc), ('send->out frame', frame), ('frame->play', play)):
        print(f"   {name:16} p50 {pct(a,50)}  p95 {pct(a,95)}  max {round(max(a),1) if a else None}")

# frame arrival minus answer arrival (both cross the same delay): >0 means realtime was later than the RPC answer
for mode in ('alone', 'all'):
    d = []
    for r in rounds:
        if r['mode'] != mode: continue
        for t in r.get('takes', []):
            s = [x for x in t.get('sends', []) if 'play' in x['k']]
            fr = [f['t'] for f in t.get('oframes', []) if 'batch' in f['d']]
            if s and fr and s[0]['end'] is not None: d.append(fr[-1] - s[0]['end'])
    print(f"{mode:5} frame minus answer: p50 {pct(d,50)} p95 {pct(d,95)} max {round(max(d),1) if d else None}")
