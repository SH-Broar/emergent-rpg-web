import re, glob, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
files = sorted(glob.glob('public/data/npcs/act-1-*.txt'))
def parse(f):
    text = open(f, encoding='utf-8').read()
    blocks = re.split(r'(?m)^\[npc\.', text)
    out = []
    for b in blocks[1:]:
        idm = re.match(r'([^\]]+)\]', b)
        npc_id = 'npc-' + idm.group(1).strip()
        def fld(name):
            mm = re.search(r'(?m)^%s\s*=\s*(.+)$' % re.escape(name), b)
            return mm.group(1).strip() if mm else None
        out.append(dict(id=npc_id, name=fld('name'), race=fld('race'),
            kind=fld('companion_kind'), rec_en=fld('recruit_enabled'),
            tagline=fld('tagline'), bg=fld('background'),
            sk_name=fld('companion_skill_name'), sk_desc=fld('companion_skill_desc'),
            psv_desc=fld('companion_passive_desc')))
    return out
allnpcs = []
for f in files: allnpcs += parse(f)
comp = [n for n in allnpcs if n['kind'] is not None or n['rec_en'] == 'true']
for n in comp:
    print("="*70)
    print(f"{n['id']}  ({n['name']}, {n['race']})")
    print(f"  tagline: {n['tagline']}")
    if n['sk_name']: print(f"  skill: {n['sk_name']} -- {n['sk_desc']}")
    if n['psv_desc']: print(f"  passive: {n['psv_desc']}")
    if n['bg']:
        for part in n['bg'].split('|'):
            print(f"  bg> {part.strip()}")
