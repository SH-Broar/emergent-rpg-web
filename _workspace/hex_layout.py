# -*- coding: utf-8 -*-
"""
act-1-map.txt 육각 격자 재배치 (v2).

사용자 사양:
  - 한 노드 최대 연결 6개.
  - 르슈드(reshud) 분기 제외, 모든 노드를 육각 격자로 재배치.
  - 권역 내에서는 *되도록 같은 kind끼리* 모음(필수 아님).
  - 권역간 연결은 *되도록 양쪽 권역의 가까운 가장자리 노드끼리*(엄밀한 최단 아님, 눈대중 허용).

방법:
  1) 권역 centroid를 맵 중심에서 EXPAND배 밀어 지리 보존+분리.
  2) 권역을 큰 것부터, centroid 셀 주변의 *가장 가까운 빈 셀*들로 콤팩트 blob 점유(ring 단위).
     노드는 kind별로 묶은 순서로 셀에 배정 → 같은 kind가 연속 셀(=wedge)로 모임.
  3) neighbors = 점유 인접 6셀(자동 ≤6).
  4) 권역간: 원본에서 연결됐던 권역쌍마다 *두 blob의 최근접(여유 있는) 노드쌍* 1개를 브리지(가장자리끼리).
     union-find로 전체 연결 보장(부족 시 최근접 추가 브리지).
  5) reshud 4노드: 스냅 안 함(정사각형 유지), expand 위치만. 외부 앵커에 reshud-junction 역링크 보존.
  6) 전체 좌표 [MARGIN,1-MARGIN] 정규화. x/y/neighbors 라인만 교체.
"""
import io, math, os
from collections import defaultdict, deque, Counter
from _workspace.map_lib import load, parse_nodes, MAP_PATH, NODE_RE

# EXPAND 1.9 → 1.55 (2026-05-27): 사용자 요구 "권역 외 라인이 너무 길다".
# 권역 centroid 를 맵 중심에서 EXPAND배 밀어낸다 → 값을 줄이면 권역끼리 가까워져
# 브리지(권역간 간선) 길이가 단축. 1.35 는 너무 작아 일부 권역 blob 이 겹쳐서 노드 누락(232/261).
# 1.55 가 권역 안 hex 폭(≈0.052)과 브리지 길이가 균형 — 작은 권역도 모두 충분한 공간 확보.
EXPAND = 1.55
INTRA  = 1.0
HEX    = 0.030
MARGIN = 0.04

SQRT3 = math.sqrt(3.0)
AX_DIRS = [(1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1)]

def axial_to_px(q, r, size=HEX):
    return (size*SQRT3*(q + r/2.0), size*1.5*r)

def px_to_axial_round(px, py, size=HEX):
    qf = (SQRT3/3.0*px - 1.0/3.0*py)/size
    rf = (2.0/3.0*py)/size
    x, z = qf, rf; y = -x - z
    rx, ry, rz = round(x), round(y), round(z)
    dx, dy, dz = abs(rx-x), abs(ry-y), abs(rz-z)
    if dx > dy and dx > dz: rx = -ry - rz
    elif dy > dz:           ry = -rx - rz
    else:                   rz = -rx - ry
    return (int(rx), int(rz))

def hex_ring(center, r):
    if r == 0: return [center]
    out = []
    cur = (center[0] + AX_DIRS[4][0]*r, center[1] + AX_DIRS[4][1]*r)
    for i in range(6):
        for _ in range(r):
            out.append(cur)
            cur = (cur[0]+AX_DIRS[i][0], cur[1]+AX_DIRS[i][1])
    return out

def hexdist_cell(a, b):
    return (abs(a[0]-b[0]) + abs(a[1]-b[1]) + abs(a[0]+a[1]-b[0]-b[1])) // 2

def claim_blob(center, count, occupied):
    """center 주변 가장 가까운 빈 셀 count개를 ring 단위로 점유(콤팩트)."""
    cells = []
    r = 0
    while len(cells) < count and r < 80:
        for cell in hex_ring(center, r):
            if cell not in occupied:
                occupied[cell] = True
                cells.append(cell)
                if len(cells) >= count: break
        r += 1
    return cells

def spiral_free(start, occupied):
    if start not in occupied: return start
    seen = {start}; dq = deque([start])
    while dq:
        cell = dq.popleft()
        for d in AX_DIRS:
            nb = (cell[0]+d[0], cell[1]+d[1])
            if nb in seen: continue
            seen.add(nb)
            if nb not in occupied: return nb
            dq.append(nb)
    raise RuntimeError('no free cell')

def main(apply=False, force=False):
    # 수동 저장 잠금 — 에디터로 저장한 적이 있으면 자동 레이아웃이 덮어쓰지 않음(--force로 무시).
    lock = '_workspace/.map-manual-lock'
    if os.path.exists(lock) and not force:
        with io.open(lock, 'r', encoding='utf-8') as f:
            info = f.read().strip().replace('\n', ' / ')
        print(f'LOCKED — 수동 저장본 존재({info}). 자동 레이아웃 건너뜀. (덮어쓰려면 --force)')
        return
    backup = '_workspace/act-1-map.orig.txt'
    text = load(backup) if os.path.exists(backup) else load()
    nodes, order = parse_nodes(text)

    adj0 = defaultdict(set)
    for nid, n in nodes.items():
        for nb in n.get('neighbors', []):
            if nb in nodes:
                adj0[nid].add(nb); adj0[nb].add(nid)

    cen = defaultdict(lambda: [0.0, 0.0, 0])
    for nid, n in nodes.items():
        c = cen[n['region']]; c[0]+=n['x']; c[1]+=n['y']; c[2]+=1
    centroid = {r:(c[0]/c[2], c[1]/c[2]) for r,c in cen.items()}
    CX, CY = 0.5, 0.5
    # 권역별 추가 분리 nudge — EXPAND 1.55 비례로 축소(이전 1.9 기준 ×0.82).
    REGION_NUDGE = {
        'tacomi': (-0.05, 0.13),       # 알리메스에서 더 멀리(아래로)
        'alimes': (0.08, -0.08),       # 타코미에서 더 멀리(위/오른쪽)
        'manonickla': (0.18, 0.11),    # 모스에서 더 멀리(극동/아래)
        'triflower': (0.00, -0.37),    # 화산 — 모스에서 분리해 위로
        'falcon-garden': (0.05, 0.47), # 군도 — 마노니클라 아래(산호골 쪽)
    }
    def region_target(reg):
        cx, cy = centroid[reg]
        nx, ny = REGION_NUDGE.get(reg, (0.0, 0.0))
        return (CX + (cx-CX)*EXPAND + nx, CY + (cy-CY)*EXPAND + ny)

    reshud = [nid for nid in order if nodes[nid]['region']=='reshud']
    movable_regions = [r for r in centroid if r != 'reshud']
    # 큰 권역부터 공간 선점
    movable_regions.sort(key=lambda r: -cen[r][2])

    # 권역별 노드: kind별로 묶기(개수 많은 kind 먼저 → blob 중심에 큰 그룹)
    region_nodes = defaultdict(list)
    for nid in order:
        if nodes[nid]['region'] != 'reshud':
            region_nodes[nodes[nid]['region']].append(nid)

    cell_of = {}
    occupied = {}
    for reg in movable_regions:
        members = region_nodes[reg]
        kind_counts = Counter(nodes[m]['kind'] for m in members)
        # kind 우선순위: 개수 desc, 이름 asc(결정적). 같은 kind 내부는 id asc.
        members_sorted = sorted(members, key=lambda m: (-kind_counts[nodes[m]['kind']], nodes[m]['kind'], m))
        tgt = region_target(reg)
        center_cell = spiral_free(px_to_axial_round(*tgt), occupied)
        # center_cell을 다시 비워(claim_blob이 처음부터 점유) 처리
        occupied.pop(center_cell, None)
        cells = claim_blob(center_cell, len(members_sorted), occupied)
        for nid, cell in zip(members_sorted, cells):
            cell_of[nid] = cell

    movable = list(cell_of.keys())
    occ_node = {cell: nid for nid, cell in cell_of.items()}

    # 육각 인접 neighbors
    adj = defaultdict(set)
    for nid, cell in cell_of.items():
        for d in AX_DIRS:
            nb_cell = (cell[0]+d[0], cell[1]+d[1])
            if nb_cell in occ_node:
                adj[nid].add(occ_node[nb_cell])

    def hexdist(a, b):
        return hexdist_cell(cell_of[a], cell_of[b])

    # union-find
    parent = {nid: nid for nid in movable}
    def find(a):
        while parent[a]!=a:
            parent[a]=parent[parent[a]]; a=parent[a]
        return a
    def union(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb: parent[ra]=rb; return True
        return False
    for nid in movable:
        for nb in adj[nid]:
            union(nid, nb)

    # 원본에서 연결됐던 권역쌍
    region_pairs = set()
    for u in movable:
        for v in adj0[u]:
            if v in cell_of:
                ra, rb = nodes[u]['region'], nodes[v]['region']
                if ra != rb:
                    region_pairs.add(tuple(sorted((ra, rb))))

    def add_edge(u, v):
        adj[u].add(v); adj[v].add(u)

    bridges = []
    # 권역쌍마다 두 blob의 *최근접 여유 노드쌍*으로 가장자리 연결
    for ra, rb in sorted(region_pairs):
        A = region_nodes[ra]; B = region_nodes[rb]
        best = None
        for u in A:
            if len(adj[u]) >= 6: continue
            for v in B:
                if len(adj[v]) >= 6: continue
                d = hexdist(u, v)
                if best is None or d < best[0]:
                    best = (d, u, v)
        if best is None:
            # 여유 노드 없으면 cap 무시 최근접
            best = min(((hexdist(u,v),u,v) for u in A for v in B), key=lambda t:t[0])
        add_edge(best[1], best[2]); union(best[1], best[2]); bridges.append((best[1], best[2]))

    # 전체 연결 보장
    def components():
        comps = defaultdict(list)
        for nid in movable: comps[find(nid)].append(nid)
        return list(comps.values())
    guard = 0
    while len(components()) > 1 and guard < 300:
        guard += 1
        comps = sorted(components(), key=len, reverse=True)
        main_c = set(comps[0]); other = comps[1]
        best = None
        for v in other:
            for u in main_c:
                if len(adj[u])<6 and len(adj[v])<6:
                    d = hexdist(u, v)
                    if best is None or d < best[0]: best = (d, u, v)
        if best is None:
            v = other[0]; u = min(main_c, key=lambda x: hexdist(x, v)); best = (0, u, v)
        add_edge(best[1], best[2]); union(best[1], best[2]); bridges.append((best[1], best[2]))

    # 좌표
    pos = {nid: axial_to_px(*cell_of[nid]) for nid in movable}
    for nid in reshud:
        n = nodes[nid]; cx, cy = centroid['reshud']
        tx, ty = region_target('reshud')
        pos[nid] = (tx + (n['x']-cx)*INTRA, ty + (n['y']-cy)*INTRA)

    xs=[p[0] for p in pos.values()]; ys=[p[1] for p in pos.values()]
    minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
    s = min((1-2*MARGIN)/(maxx-minx) if maxx>minx else 1,
            (1-2*MARGIN)/(maxy-miny) if maxy>miny else 1)
    ox=(1-(maxx-minx)*s)/2 - minx*s
    oy=(1-(maxy-miny)*s)/2 - miny*s
    norm={nid:(round(p[0]*s+ox,4), round(p[1]*s+oy,4)) for nid,p in pos.items()}

    final_nb = {nid: sorted(adj[nid]) for nid in movable}
    for nid in reshud:
        final_nb[nid] = sorted(adj0[nid])
    # reshud 외부 앵커에 역링크 추가 — 6 초과 시 고차수 이웃 간선 1개 제거해 cap 유지.
    for nid in reshud:
        for ext in adj0[nid]:
            if ext in movable and nid not in final_nb[ext]:
                lst = set(final_nb[ext])
                if len(lst) >= 6:
                    cand = [m for m in lst if m in movable]
                    if cand:
                        drop = max(cand, key=lambda m: len(final_nb[m]))
                        lst.discard(drop)
                        final_nb[drop] = sorted(set(final_nb[drop]) - {ext})
                lst.add(nid)
                final_nb[ext] = sorted(lst)

    over = [(nid, len(final_nb[nid])) for nid in final_nb
            if nodes[nid]['region'] != 'reshud' and len(final_nb[nid]) > 6]

    # 쓰기
    out=[]; cur=None
    for raw in text.splitlines(keepends=True):
        line = raw.rstrip('\n').rstrip('\r'); nl = raw[len(line):]
        if line.strip().startswith('['):
            m = NODE_RE.search(line.strip()); cur = m.group(1) if m else None
            out.append(raw); continue
        if cur and cur in norm:
            st = line.strip()
            if st.startswith('x ') or st.startswith('x='): out.append(f'x = {norm[cur][0]}'+nl); continue
            if st.startswith('y ') or st.startswith('y='): out.append(f'y = {norm[cur][1]}'+nl); continue
            if st.startswith('neighbors'): out.append('neighbors = '+', '.join(final_nb[cur])+nl); continue
        out.append(raw)
    newtext = ''.join(out)

    # 통계 + 검증
    print('movable:', len(movable), 'reshud:', len(reshud), 'region pairs:', len(region_pairs))
    print('bridges added:', len(bridges))
    print('cap violations (non-reshud):', over)
    fadj = defaultdict(set)
    for nid, nbs in final_nb.items():
        for nb in nbs:
            if nb in final_nb: fadj[nid].add(nb); fadj[nb].add(nid)
    seen=set(); comps=0
    for s0 in final_nb:
        if s0 in seen: continue
        comps+=1; stk=[s0]
        while stk:
            u=stk.pop()
            if u in seen: continue
            seen.add(u); stk+=[v for v in fadj[u] if v not in seen]
    print('final components (incl reshud):', comps)
    print('final degree dist:', dict(sorted(Counter(len(fadj[n]) for n in final_nb).items())))
    # kind 그룹핑 품질: 같은 kind 인접 비율
    same=0; tot=0
    for nid in movable:
        for nb in adj[nid]:
            tot+=1
            if nodes[nb]['kind']==nodes[nid]['kind']: same+=1
    print('intra-region same-kind adjacency ratio: %.2f'%(same/max(1,tot)))

    if apply:
        with io.open(MAP_PATH, 'w', encoding='utf-8', newline='') as f:
            f.write(newtext)
        print('APPLIED')
    else:
        print('DRY RUN')

if __name__ == '__main__':
    import sys
    main(apply='--apply' in sys.argv, force='--force' in sys.argv)
