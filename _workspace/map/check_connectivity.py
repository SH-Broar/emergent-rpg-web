#!/usr/bin/env python3
"""act-1-map.txt 연결성 점검.
  1) start_node(n-iluneon-square)에서 BFS로 신규 노드 4지대 전부 도달 가능?
  2) neighbors 대칭(A->B면 B->A)?
  3) dangling: 존재하지 않는 노드 id를 가리키는 neighbor?
  4) 좌표 중복?
"""
import re, sys, os
from collections import deque

MAP = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'node-maps', 'act-1-map.txt')
MAP = os.path.abspath(MAP)

NODE_RE = re.compile(r'^\[nodemap\.nm-act-1-era4-061\.node\.([^\]]+)\]$')

nodes = {}      # id -> dict(neighbors=[], x, y, region, kind)
order = []
cur = None
with open(MAP, encoding='utf-8') as f:
    for raw in f:
        line = raw.split('#', 1)[0].split(';', 1)[0].strip()
        if not line:
            continue
        m = NODE_RE.match(line)
        if m:
            cur = m.group(1)
            nodes[cur] = dict(neighbors=[], x=None, y=None, region=None, kind=None)
            order.append(cur)
            continue
        if line.startswith('['):
            cur = None
            continue
        if cur is None or '=' not in line:
            continue
        k, v = [s.strip() for s in line.split('=', 1)]
        d = nodes[cur]
        if k == 'neighbors':
            d['neighbors'] = [s.strip() for s in v.split(',') if s.strip()]
        elif k == 'x':
            d['x'] = float(v)
        elif k == 'y':
            d['y'] = float(v)
        elif k == 'region':
            d['region'] = v
        elif k == 'kind':
            d['kind'] = v

NEW_REGIONS = {'starlight-plateau', 'mushroom-cave', 'fishing-village', 'mine-shaft'}
new_nodes = [nid for nid, d in nodes.items() if d['region'] in NEW_REGIONS]

errors = 0

# 3) dangling
dangling = []
for nid, d in nodes.items():
    for nb in d['neighbors']:
        if nb not in nodes:
            dangling.append((nid, nb))
if dangling:
    errors += 1
    print(f"[FAIL] dangling neighbors: {len(dangling)}")
    for a, b in dangling:
        print(f"   {a} -> {b} (missing)")
else:
    print(f"[OK] dangling = 0 (총 노드 {len(nodes)})")

# 2) 대칭
asym = []
for nid, d in nodes.items():
    for nb in d['neighbors']:
        if nb in nodes and nid not in nodes[nb]['neighbors']:
            asym.append((nid, nb))
if asym:
    errors += 1
    print(f"[FAIL] 비대칭 간선: {len(asym)}")
    for a, b in asym:
        print(f"   {a} -> {b} (역방향 없음)")
else:
    print("[OK] 모든 간선 대칭")

# 4) 좌표 중복
coords = {}
dups = []
for nid, d in nodes.items():
    key = (round(d['x'], 4), round(d['y'], 4))
    if key in coords:
        dups.append((nid, coords[key], key))
    else:
        coords[key] = nid
if dups:
    errors += 1
    print(f"[FAIL] 좌표 중복: {len(dups)}")
    for a, b, k in dups:
        print(f"   {a} == {b} @ {k}")
else:
    print("[OK] 좌표 중복 없음")

# 1) BFS from start
START = 'n-iluneon-square'
seen = set()
q = deque([START])
seen.add(START)
while q:
    cur = q.popleft()
    for nb in nodes[cur]['neighbors']:
        if nb in nodes and nb not in seen:
            seen.add(nb)
            q.append(nb)
unreachable_new = [nid for nid in new_nodes if nid not in seen]
if unreachable_new:
    errors += 1
    print(f"[FAIL] start에서 도달 불가 신규 노드: {len(unreachable_new)}")
    for nid in unreachable_new:
        print(f"   {nid}")
else:
    print(f"[OK] start({START})에서 신규 노드 {len(new_nodes)}개 전부 도달 가능")

# 전체 도달 불가도 참고로
all_unreach = [nid for nid in nodes if nid not in seen]
print(f"[INFO] 전체 노드 {len(nodes)} 중 start 미도달 {len(all_unreach)}개" +
      (": " + ", ".join(all_unreach) if all_unreach else ""))

print("\n--- 신규 노드 목록 ---")
for r in ['starlight-plateau', 'mushroom-cave', 'fishing-village', 'mine-shaft']:
    ns = [nid for nid in new_nodes if nodes[nid]['region'] == r]
    print(f"{r}: " + ", ".join(f"{nid}({nodes[nid]['kind']})" for nid in ns))

print("\nRESULT:", "ALL PASS" if errors == 0 else f"{errors} CHECK(S) FAILED")
sys.exit(1 if errors else 0)
