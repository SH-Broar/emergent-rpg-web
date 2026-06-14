import re, glob, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

# region of each home node (reuse logic)
mp = open('public/data/node-maps/act-1-map.txt', encoding='utf-8').read()
node_region = {}
for m in re.finditer(r'(?m)^\[nodemap\.[^\.]+\.node\.([^\]]+)\]', mp):
    start = m.end()
    nxt = re.search(r'(?m)^\[', mp[start:])
    block = mp[start:start + (nxt.start() if nxt else len(mp))]
    rg = re.search(r'(?m)^region\s*=\s*(.+)$', block)
    idf = re.search(r'(?m)^id\s*=\s*(.+)$', block)
    real_id = idf.group(1).strip() if idf else m.group(1)
    node_region[real_id] = rg.group(1).strip() if rg else None
region_tier = {}
for m in re.finditer(r'(?m)^\[nodemap\.[^\.]+\.region\.([^\]]+)\]', mp):
    key = m.group(1); start = m.end()
    nxt = re.search(r'(?m)^\[', mp[start:])
    block = mp[start:start + (nxt.start() if nxt else len(mp))]
    t = re.search(r'(?m)^tier\s*=\s*(.+)$', block)
    region_tier[key] = t.group(1).strip() if t else '?'

files = sorted(glob.glob('public/data/npcs/act-1-*.txt'))
def parse(f):
    text = open(f, encoding='utf-8').read()
    blocks = re.split(r'(?m)^\[npc\.', text)
    out=[]
    for b in blocks[1:]:
        idm = re.match(r'([^\]]+)\]', b)
        nid = 'npc-' + idm.group(1).strip()
        def fld(n):
            mm = re.search(r'(?m)^%s\s*=\s*(.+)$' % re.escape(n), b)
            return mm.group(1).strip() if mm else None
        out.append(dict(id=nid, name=fld('name'), race=fld('race'),
            kind=fld('companion_kind'), rec_en=fld('recruit_enabled'),
            home=fld('home_node'), file=os.path.basename(f)))
    return out
allnpcs=[]
for f in files: allnpcs+=parse(f)
comp=[n for n in allnpcs if n['kind'] is not None or n['rec_en']=='true']

KEEP_VILLAGE = {'npc-npc-hako','npc-npc-valencia'}
by_region={}
for n in comp:
    reg = node_region.get(n['home'],'??')
    by_region.setdefault(reg,[]).append(n)

print("REGION (tier)            | event-recruit NPCs")
total_events=0
for reg in sorted(by_region, key=lambda r:(region_tier.get(r,'9'),r)):
    npcs=by_region[reg]
    ev=[n for n in npcs if n['id'] not in KEEP_VILLAGE]
    vil=[n for n in npcs if n['id'] in KEEP_VILLAGE]
    total_events+=len(ev)
    print(f"{reg:16}(t{region_tier.get(reg,'?')}) ev={len(ev)} vil={len(vil)}")
    for n in ev: print(f"      EVENT  {n['id']:20} {n['name']}")
    for n in vil: print(f"      VILLAGE{n['id']:20} {n['name']}  (kept)")
print("TOTAL event-recruit NPCs needed:", total_events)
print("TOTAL village-kept:", sum(1 for n in comp if n['id'] in KEEP_VILLAGE))
print("TOTAL companions:", len(comp))
