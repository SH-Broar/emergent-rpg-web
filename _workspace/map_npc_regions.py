import re, glob, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

# --- parse node-map: regions (tier, event_pool) and nodes (region) ---
mp = open('public/data/node-maps/act-1-map.txt', encoding='utf-8').read()
# regions
regions = {}  # region_key -> dict(name, tier, event_pool list, raw block start)
for m in re.finditer(r'(?m)^\[nodemap\.[^\.]+\.region\.([^\]]+)\]', mp):
    key = m.group(1)
    start = m.end()
    nxt = re.search(r'(?m)^\[', mp[start:])
    block = mp[start:start + (nxt.start() if nxt else len(mp))]
    def f(name):
        mm = re.search(r'(?m)^%s\s*=\s*(.+)$' % re.escape(name), block)
        return mm.group(1).strip() if mm else None
    ep = f('event_pool')
    regions[key] = dict(name=f('name'), tier=f('tier'),
                        event_pool=[x.strip() for x in ep.split(',')] if ep else [])

# nodes: [nodemap.X.node.<id>] with region field
node_region = {}
for m in re.finditer(r'(?m)^\[nodemap\.[^\.]+\.node\.([^\]]+)\]', mp):
    nid = 'n-' + m.group(1) if not m.group(1).startswith('n-') else m.group(1)
    # actually node id may be full; capture raw suffix
    suffix = m.group(1)
    start = m.end()
    nxt = re.search(r'(?m)^\[', mp[start:])
    block = mp[start:start + (nxt.start() if nxt else len(mp))]
    rg = re.search(r'(?m)^region\s*=\s*(.+)$', block)
    idf = re.search(r'(?m)^id\s*=\s*(.+)$', block)
    real_id = idf.group(1).strip() if idf else suffix
    node_region[real_id] = rg.group(1).strip() if rg else None

# --- parse npcs ---
files = sorted(glob.glob('public/data/npcs/act-1-*.txt'))
def parse_npcs(f):
    text = open(f, encoding='utf-8').read()
    blocks = re.split(r'(?m)^\[npc\.', text)
    out = []
    for b in blocks[1:]:
        idm = re.match(r'([^\]]+)\]', b)
        npc_id = idm.group(1).strip() if idm else '?'
        def field(name):
            mm = re.search(r'(?m)^%s\s*=\s*(.+)$' % re.escape(name), b)
            return mm.group(1).strip() if mm else None
        out.append(dict(file=os.path.basename(f), id='npc-' + npc_id if not npc_id.startswith('npc-') else npc_id,
            rawid=npc_id, name=field('name'), race=field('race'),
            kind=field('companion_kind'), rec_en=field('recruit_enabled'),
            home=field('home_node'), presence=field('presence_nodes'),
            village=field('village_recruit'), tags=field('tags')))
    return out

allnpcs = []
for f in files: allnpcs += parse_npcs(f)
comp = [n for n in allnpcs if n['kind'] is not None or n['rec_en'] == 'true']

print("=== REGIONS (tier / #event_pool) ===")
for k, r in regions.items():
    print(f"  {k:18} tier={r['tier']}  events={len(r['event_pool'])}  {r['name']}")

print("\n=== COMPANION NPC -> HOME NODE -> REGION ===")
for n in comp:
    reg = node_region.get(n['home'], '??? NODE NOT FOUND')
    tier = regions.get(reg, {}).get('tier', '?') if reg in regions else '?'
    print(f"  {n['id']:22} {str(n['name']):14} race={str(n['race']):10} home={str(n['home']):26} region={str(reg):16} tier={tier}")
