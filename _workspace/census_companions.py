import re, glob, os, sys
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
files = sorted(glob.glob('public/data/npcs/act-1-*.txt'))

def parse_npcs(f):
    text = open(f, encoding='utf-8').read()
    blocks = re.split(r'(?m)^\[npc\.', text)
    out = []
    for b in blocks[1:]:
        idm = re.match(r'([^\]]+)\]', b)
        npc_id = idm.group(1).strip() if idm else '?'
        def field(name):
            m = re.search(r'(?m)^%s\s*=\s*(.+)$' % re.escape(name), b)
            return m.group(1).strip() if m else None
        out.append(dict(file=os.path.basename(f), id=npc_id,
            name=field('name'), race=field('race'),
            kind=field('companion_kind'), rec_en=field('recruit_enabled'),
            home=field('home_node'), tags=field('tags'),
            village=field('village_recruit')))
    return out

allnpcs = []
for f in files:
    allnpcs += parse_npcs(f)
comp = [n for n in allnpcs if n['kind'] is not None or n['rec_en'] == 'true']
print("TOTAL npcs:", len(allnpcs), " companion npcs:", len(comp))
for n in comp:
    k = n['kind'] or ('passive(recruit_enabled)' if n['rec_en'] == 'true' else '-')
    vr = n['village'] if n['village'] is not None else '(default true)'
    print(f"{n['file']:24} npc-{n['id']:22} {str(n['name']):16} race={str(n['race']):10} kind={k:24} village={vr:14} home={n['home']}")
