import json,sys
for f in sys.argv[1:]:
    d=json.load(open(f))
    print(f"== {d['build']} proxy={d['proxy']} min={d['ms']/60000:.2f} takes={d['takes']} lost={d['lost']} edits={d['edits']} errors={d['errors']} dbCPUs/min={d['dbCpuSecPerMin']} WAL KB/min={d['walKBPerMin']} failed={d['failedRequests']}")
    for who,eps in d['perMin'].items():
        top=sorted(eps.items(),key=lambda x:-x[1])[:7]
        print('  ',who, round(sum(eps.values()),1),'/min:', ', '.join(f"{k.replace('/rest/v1','')} {v}" for k,v in top))
