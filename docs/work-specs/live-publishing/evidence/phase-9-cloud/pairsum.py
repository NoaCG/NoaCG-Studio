# pairsum.py <pair.json>...: pooled p95 (all - alone) with a bootstrap over pairs, as phase 8 judged it
import json,sys,random,math
def p(v,q):
  s=sorted(v); return s[min(len(s)-1,math.ceil(q/100*len(s))-1)] if s else float('nan')
pairs=[]; errs=[]
for f in sys.argv[1:]:
  rs=json.load(open(f))['rounds']
  by={}
  for r in rs: by.setdefault(r['round'],{})[r['mode']]=r; errs+= [e for e in r['errors']]
  for k,m in sorted(by.items()):
    if 'all' in m and 'alone' in m: pairs.append((m['all'],m['alone']))
A=[x for a,_ in pairs for x in a['samples']]; B=[x for _,b in pairs for x in b['samples']]
lostA=sum(a['lost'] for a,_ in pairs); lostB=sum(b['lost'] for _,b in pairs)
d=p(A,95)-p(B,95)
random.seed(1); bs=[]
for _ in range(2000):
  pick=[random.choice(pairs) for _ in pairs]
  a=[x for q,_ in pick for x in q['samples']]; b=[x for _,q in pick for x in q['samples']]
  if a and b: bs.append(p(a,95)-p(b,95))
bs.sort()
print(json.dumps({'pairs':len(pairs),'all':{'n':len(A),'p50':p(A,50),'p95':p(A,95),'lost':lostA},'alone':{'n':len(B),'p50':p(B,50),'p95':p(B,95),'lost':lostB},'diffP95':round(d,1),'bootstrap95':[round(bs[int(.025*len(bs))],1),round(bs[int(.975*len(bs))],1)],'errors':errs}, indent=1))
