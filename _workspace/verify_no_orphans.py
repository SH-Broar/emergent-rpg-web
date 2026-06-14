import re, glob, os, sys
sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

# 1. all companion NPCs (companion_kind OR recruit_enabled=true)
files = sorted(glob.glob('public/data/npcs/act-1-*.txt'))
companions = {}
village_ok = set()
for f in files:
    text = open(f, encoding='utf-8').read()
    for b in re.split(r'(?m)^\[npc\.', text)[1:]:
        nid = re.match(r'([^\]]+)\]', b).group(1)
        is_comp = bool(re.search(r'(?m)^companion_kind\s*=', b)) or \
                  re.search(r'(?m)^recruit_enabled\s*=\s*true', b)
        if not is_comp:
            continue
        name = re.search(r'(?m)^name\s*=\s*(.+)$', b)
        companions[nid] = name.group(1).strip() if name else nid
        vr = re.search(r'(?m)^village_recruit\s*=\s*false', b)
        if not vr:
            village_ok.add(nid)   # village_recruit not false -> can recruit in village

# 2. all event recruit targets (recruit = npc-X in any event file) whose event is wired to a region pool
mp = open('public/data/node-maps/act-1-map.txt', encoding='utf-8').read()
pooled_events = set()
for line in re.findall(r'(?m)^event_pool\s*=\s*(.+)$', mp):
    for e in line.split(','):
        pooled_events.add(e.strip())

event_recruit = {}   # npc -> set of event ids (pooled)
all_event_files = glob.glob('public/data/events/*.txt')
for f in all_event_files:
    ev = open(f, encoding='utf-8').read()
    for b in re.split(r'(?m)^\[event\.', ev)[1:]:
        idm = re.match(r'([\w-]+(?:\.choice\.\d+)?)\]', b)
        if not idm:
            continue
        sect = idm.group(1)
        rm = re.search(r'(?m)^recruit\s*=\s*(npc-[\w-]+)', b)
        if not rm:
            continue
        parent = re.sub(r'\.choice\.\d+$', '', sect)
        npc = rm.group(1).strip()
        event_recruit.setdefault(npc, set()).add(parent)

def is_pooled(npc):
    return any(eid in pooled_events for eid in event_recruit.get(npc, set()))

# 3. report
print(f"TOTAL companion NPCs: {len(companions)}")
print(f"village-recruitable (village_recruit != false): {sorted(village_ok)}")
print()
orphans = []
village_only = []
event_only = []
both = []
for nid, name in sorted(companions.items()):
    v = nid in village_ok
    e = is_pooled(nid)
    if v and e:
        both.append(nid)
    elif v:
        village_only.append(nid)
    elif e:
        event_only.append(nid)
    else:
        orphans.append((nid, name))

print(f"recruitable via VILLAGE only: {len(village_only)} {village_only}")
print(f"recruitable via EVENT(pooled) only: {len(event_only)}")
print(f"recruitable via BOTH: {len(both)} {both}")
print()
if orphans:
    print("!!! ORPHANS (no recruit path):", len(orphans))
    for o in orphans:
        print("   ", o)
else:
    print(">>> ORPHAN COMPANIONS: 0  (every companion is recruitable)")

# 4. extra: event recruit targets that are NOT companions (would silently fail recruitCompanion)
non_comp_targets = [npc for npc in event_recruit if npc not in companions]
print()
print("event recruit targets that are NOT companion NPCs (would fail):", non_comp_targets if non_comp_targets else "NONE")

# 5. extra: recruit events NOT pooled (dead events)
unpooled = []
for npc, eids in event_recruit.items():
    for eid in eids:
        if eid.startswith('ev-rec-') and eid not in pooled_events:
            unpooled.append(eid)
print("ev-rec-* events not in any pool:", unpooled if unpooled else "NONE")
