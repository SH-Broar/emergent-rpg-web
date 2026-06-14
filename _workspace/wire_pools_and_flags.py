import re, glob, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

# --- 1. NPC -> home node -> region ---
mp_path = 'public/data/node-maps/act-1-map.txt'
mp = open(mp_path, encoding='utf-8').read()
node_region = {}
for m in re.finditer(r'(?m)^\[nodemap\.[^\.]+\.node\.([^\]]+)\]', mp):
    start = m.end(); nxt = re.search(r'(?m)^\[', mp[start:])
    block = mp[start:start + (nxt.start() if nxt else len(mp))]
    rg = re.search(r'(?m)^region\s*=\s*(.+)$', block)
    idf = re.search(r'(?m)^id\s*=\s*(.+)$', block)
    rid = idf.group(1).strip() if idf else m.group(1)
    node_region[rid] = rg.group(1).strip() if rg else None

files = sorted(glob.glob('public/data/npcs/act-1-*.txt'))
npc_home = {}
for f in files:
    text = open(f, encoding='utf-8').read()
    for b in re.split(r'(?m)^\[npc\.', text)[1:]:
        idm = re.match(r'([^\]]+)\]', b)
        nid = idm.group(1).strip()  # suffix already begins with 'npc-'
        hm = re.search(r'(?m)^home_node\s*=\s*(.+)$', b)
        npc_home[nid] = hm.group(1).strip() if hm else None

# --- 2. recruit events: id -> recruited npc ---
# recruit= lives in a [event.<id>.choice.N] section, separate from the parent header.
ev = open('public/data/events/act-1-region-events.txt', encoding='utf-8').read()
ev_blocks = re.split(r'(?m)^\[event\.', ev)
ev_to_npc = {}
for b in ev_blocks[1:]:
    idm = re.match(r'([\w-]+(?:\.choice\.\d+)?)\]', b)
    if not idm:
        continue
    sect = idm.group(1)
    rm = re.search(r'(?m)^recruit\s*=\s*(npc-[\w-]+)', b)
    if not rm:
        continue
    # parent event id = strip trailing .choice.N
    parent = re.sub(r'\.choice\.\d+$', '', sect)
    if parent.startswith('ev-rec-'):
        ev_to_npc[parent] = rm.group(1).strip()

# region -> list of event ids
region_events = {}
for eid, npc in ev_to_npc.items():
    home = npc_home.get(npc)
    reg = node_region.get(home)
    if reg is None:
        print("WARN no region for", eid, npc, home); continue
    region_events.setdefault(reg, []).append(eid)

print("=== region -> recruit events ===")
for r, lst in sorted(region_events.items()):
    print(f"  {r}: {lst}")

# --- 3. patch node-map: append event ids to each region's event_pool ---
out = mp
def patch_region_pool(text, region_key, new_ids):
    # find the region section header
    pat = re.compile(r'(\[nodemap\.[^\.]+\.region\.%s\][\s\S]*?)(^event_pool\s*=\s*)([^\n]*)' % re.escape(region_key), re.M)
    def repl(m):
        head, key, val = m.group(1), m.group(2), m.group(3)
        existing = [x.strip() for x in val.split(',') if x.strip()]
        for nid in new_ids:
            if nid not in existing:
                existing.append(nid)
        return head + key + ', '.join(existing)
    new_text, n = pat.subn(repl, text)
    return new_text, n

total_added = 0
for region_key, ids in region_events.items():
    out, n = patch_region_pool(out, region_key, ids)
    if n == 0:
        print("ERROR: region not patched:", region_key)
    else:
        total_added += len(ids)
open(mp_path, 'w', encoding='utf-8').write(out)
print(f"\nPatched node-map. recruit event ids wired: {total_added}")

# verify: every recruit event id is now in some event_pool
out2 = open(mp_path, encoding='utf-8').read()
pools = ' '.join(re.findall(r'(?m)^event_pool\s*=\s*(.+)$', out2))
missing = [e for e in ev_to_npc if e not in pools]
print("recruit events NOT wired to any pool:", missing if missing else "NONE")
