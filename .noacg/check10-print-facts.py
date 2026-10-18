import sys,json,pathlib
for path in sorted(pathlib.Path(sys.argv[1]).rglob('*.json')):
    if path.name in ['ninth.json','fifth.json','fifth-b1-bounded.json']: continue
    raw=path.read_text()
    if len(raw)>50000:
        print('FACTS TOO LARGE',str(path),len(raw));continue
    try: data=json.loads(raw)
    except json.JSONDecodeError: continue
    print('FACTS',str(path),json.dumps(data,ensure_ascii=True))
