import json,sys,re,collections,glob
for f in sorted(glob.glob('*-trace.network')):
    ev=[json.loads(l) for l in open(f)]
    rows=[]
    for e in ev:
        s=e.get('snapshot') or {}
        r=s.get('request') or {}
        u=r.get('url','')
        if 'supabase' not in u: continue
        t=s.get('startedDateTime')
        path=re.sub(r'https://[^/]+','',u)
        ep=r.get('method','')+' '+path.split('?')[0]
        rows.append((t,ep,path,s.get('_frameref') or s.get('pageref'), (s.get('response') or {}).get('status'), s.get('time')))
    rows.sort()
    pages=collections.Counter(r[3] for r in rows)
    print('=====',f,len(rows),'first',rows[0][0] if rows else None,'last',rows[-1][0] if rows else None, dict(pages))
    by=collections.defaultdict(collections.Counter)
    for t,ep,p,pg,st,tm in rows:
        by[t[11:16]][ep]+=1
    eps=collections.Counter(r[1] for r in rows)
    for ep,n in eps.most_common(14): print(n,ep)
    for m in sorted(by): print(m, dict(by[m].most_common(5)))
