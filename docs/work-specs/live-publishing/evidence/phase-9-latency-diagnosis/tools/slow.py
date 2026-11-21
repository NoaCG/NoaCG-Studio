import json, sys
# Classify Takes slower than 900 ms: answered late (one attempt, 200), first attempt cut at 1.5 s
# (no answer), refused (HTTP 5xx), and where the frame fell relative to the answer.
for path in sys.argv[1:]:
    d = json.load(open(path))
    for mode in ('alone', 'all'):
        n = slow = late200 = cut = refused = lost = 0
        page = []
        for r in d['rounds']:
            if r['mode'] != mode: continue
            for t in r.get('takes', []):
                n += 1
                if t['ranAt'] is None: lost += 1; continue
                ran = t['ranAt'] - t['pressAt']
                if ran <= 900: continue
                slow += 1
                s = [x for x in t['sends'] if 'play' in x['k']]
                if not s: continue
                page.append(s[0]['t'])
                if s[0]['f']: cut += 1
                elif s[0]['st'] == 200: late200 += 1
                else: refused += 1
        print(f"{path.split('/')[-3] if '/' in path else path} {mode:5} takes {n} lost {lost} slow>900 {slow}: first answered 200 late {late200}, first cut at 1.5 s {cut}, first refused {refused}; press->send of slow max {max(page) if page else None}")
