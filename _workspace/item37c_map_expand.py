# -*- coding: utf-8 -*-
"""
Item 37-② Stage C, 1E — 맵 살짝 확장.

권역별로 *사건/몬스터/엘리트* 노드를 소폭 추가(+1~2). 마을/보스/상점/공방은 늘리지 않음.
기존 hex 레이아웃·region 구조 유지. dangling 0·간선 정합·≤6 degree cap 보장.

규칙:
  - 새 노드는 같은 권역의 *저차수 앵커* 노드에 연결(양방향). 가능하면 2번째 가까운 동권역 노드에도 연결.
  - 앵커는 degree<6 인 것만(cap 보존). 새 노드 자체도 ≤2 연결로 시작(저차수).
  - 좌표: 앵커 좌표 + 작은 오프셋(겹침 회피). 시각화만 영향(런타임은 neighbors로 이동).
  - content: combat→enemy=권역 enemy_pool[idx], elite→enemy=elite_pool[idx], event→events=event_pool[idx].
    (첫 방문 폴백용. 하루 경과 시 어차피 권역 풀에서 재추첨됨.)
  - reshud(정사각 특수 권역)·demon-windfall(보스 코어)·yusezria(dead-end 의도)는 *건드리지 않음*.

출력: --apply 없으면 dry-run(통계만). --apply면 파일 갱신.
"""
import io, re, sys
from collections import defaultdict
sys.path.insert(0, '_workspace')
from map_lib import load, parse_nodes, MAP_PATH

MAP_ID = 'nm-act-1-era4-061'

# 권역별 추가 계획: region -> [kind, ...]. (combat/event/elite 만)
# reshud/demon-windfall/yusezria 제외(특수 토폴로지·dead-end 의도).
PLAN = {
    'iluneon':       ['combat', 'event'],
    'lar-forest':    ['combat', 'event'],
    'moss-north':    ['combat', 'elite'],
    'moss-south':    ['event'],
    'manonickla':    ['combat', 'event'],
    'riagralta':     ['combat', 'event'],
    'alimes':        ['combat', 'event'],
    'luna':          ['combat', 'elite'],
    'tacomi':        ['combat', 'event'],
    'martin':        ['combat'],
    'demon-castle':  ['combat'],
    'diropel':       ['event'],
    'enicham':       ['combat'],
    'triflower':     ['combat'],
    'tradepost':     ['event'],
    'coral-coast':   ['combat'],
    'falcon-garden': ['combat'],
    'oldshrine':     ['combat'],
}

# 권역 풀(첫 항목)을 content로 — region 섹션에서 추출.
def parse_region_pools(text):
    pools = {}
    cur = None
    for raw in text.splitlines():
        line = raw.strip()
        m = re.match(r'\[nodemap\.[a-z0-9-]+\.region\.([a-z0-9-]+)\]', line)
        if m:
            cur = m.group(1); pools[cur] = {}
            continue
        if line.startswith('['):
            cur = None; continue
        if cur and '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1); k = k.strip(); v = v.split('#')[0].strip()
            if k in ('enemy_pool', 'elite_enemy_pool', 'event_pool'):
                pools[cur][k] = [t.strip() for t in v.split(',') if t.strip()]
    return pools

KIND_KO = {'combat': '전투', 'event': '사건', 'elite': '엘리트'}


def main(apply=False):
    text = load()
    nodes, order = parse_nodes(text)
    pools = parse_region_pools(text)

    # 현재 degree(선언된 neighbors 기준, 양방향 보장돼 있음).
    deg = {nid: len(n.get('neighbors', [])) for nid, n in nodes.items()}
    adj = {nid: set(n.get('neighbors', [])) for nid, n in nodes.items()}

    # region -> 노드 목록(좌표 보유).
    region_nodes = defaultdict(list)
    for nid in order:
        region_nodes[nodes[nid]['region']].append(nid)

    new_sections = []
    added = []
    # content 인덱스(권역별 라운드로빈 — 같은 종류 여러 개여도 다른 적/사건).
    pool_idx = defaultdict(lambda: defaultdict(int))

    for region, kinds in PLAN.items():
        members = region_nodes.get(region, [])
        if not members:
            print(f'  SKIP {region}: 노드 없음'); continue
        # 연결 후보: 같은 권역에서 degree<6 인 비-마을/비-보스/비-상점/비-공방 노드(앵커는 흐름 노드 선호).
        def connectable(nid):
            k = nodes[nid]['kind']
            return deg[nid] < 6 and k not in ('boss',)
        for ci, kind in enumerate(kinds):
            anchors = sorted([m for m in members if connectable(m)], key=lambda m: deg[m])
            if not anchors:
                print(f'  SKIP {region}/{kind}: 여유 앵커 없음'); continue
            a1 = anchors[0]
            # 2번째 앵커: a1과 가까운(좌표) 다른 동권역 저차수 노드(있으면) — 연결성 보강.
            ax, ay = nodes[a1]['x'], nodes[a1]['y']
            second = None
            cand = [m for m in anchors[1:] if deg[m] < 6 and m != a1]
            if cand:
                second = min(cand, key=lambda m: (nodes[m]['x']-ax)**2 + (nodes[m]['y']-ay)**2)

            # 새 노드 id(충돌 회피).
            base = f'n-{region}-x{ci+1}'
            nid = base; suf = 1
            while nid in nodes:
                suf += 1; nid = f'{base}-{suf}'

            # 좌표: 앵커에서 작은 오프셋(겹침 회피, 시각화만).
            off = 0.018 * (1 + ci)
            nx = round(min(0.97, max(0.03, ax + off)), 4)
            ny = round(min(0.97, max(0.03, ay - off)), 4)

            # content(첫 방문 폴백) — 권역 풀 라운드로빈.
            content_line = None
            if kind == 'combat':
                pool = pools.get(region, {}).get('enemy_pool', [])
                if pool:
                    i = pool_idx[region]['enemy'] % len(pool); pool_idx[region]['enemy'] += 1
                    content_line = f'enemy = {pool[i]}'
            elif kind == 'elite':
                pool = pools.get(region, {}).get('elite_enemy_pool', []) or pools.get(region, {}).get('enemy_pool', [])
                if pool:
                    i = pool_idx[region]['elite'] % len(pool); pool_idx[region]['elite'] += 1
                    content_line = f'enemy = {pool[i]}'
            elif kind == 'event':
                pool = pools.get(region, {}).get('event_pool', [])
                if pool:
                    i = pool_idx[region]['event'] % len(pool); pool_idx[region]['event'] += 1
                    content_line = f'events = {pool[i]}'

            nbrs = [a1] + ([second] if second else [])
            label = f'{nodes[a1].get("label", region)} 갈래'
            # region 한글명 폴백 — 권역 description 없으니 kind 기반 짧은 설명.
            desc = {
                'combat': '길에서 갈라진 좁은 샛길. 무언가 도사린다.',
                'elite': '인적이 끊긴 깊은 곳. 강한 기척이 짙다.',
                'event': '잠시 머물 만한 자리. 무슨 일이 생길지 모른다.',
            }[kind]

            sec = []
            sec.append(f'[nodemap.{MAP_ID}.node.{nid}]')
            sec.append(f'kind = {kind}')
            sec.append(f'region = {region}')
            sec.append(f'label = {label}')
            sec.append(f'description = {desc}')
            sec.append(f'x = {nx}')
            sec.append(f'y = {ny}')
            sec.append(f'neighbors = {", ".join(nbrs)}')
            if content_line:
                sec.append(content_line)
            sec.append('')
            new_sections.append('\n'.join(sec))

            # 상태 갱신(다음 추가가 정확한 degree 보도록).
            nodes[nid] = {'_id': nid, 'region': region, 'kind': kind,
                          'x': nx, 'y': ny, 'label': label, 'neighbors': list(nbrs)}
            order.append(nid)
            region_nodes[region].append(nid)
            deg[nid] = len(nbrs)
            adj[nid] = set(nbrs)
            for a in nbrs:
                adj[a].add(nid); deg[a] += 1
            added.append((nid, region, kind, content_line, nbrs))

    # 새 노드 섹션을 *파일 끝*에 추가(파서는 순서 무관).
    addition = '\n# ============================================================\n' \
               '# Item 37-② Stage C, 1E — 권역별 사건/전투/엘리트 노드 소폭 확장.\n' \
               '# (마을/보스/상점/공방 미증가. content는 첫 방문 폴백 — 하루 경과 시 권역 풀 재추첨.)\n' \
               '# ============================================================\n\n' \
               + '\n'.join(new_sections)
    newtext = text.rstrip('\n') + '\n' + addition

    # === 새 노드의 역간선을 *기존 앵커 섹션*의 neighbors 줄에 반영(양방향 보장) ===
    # 앵커 nid -> 추가할 역링크 목록.
    back = defaultdict(list)
    for nid, region, kind, cl, nbrs in added:
        for a in nbrs:
            back[a].append(nid)

    out = []
    cur = None
    for raw in newtext.splitlines(keepends=True):
        line = raw.rstrip('\n').rstrip('\r'); nl = raw[len(line):]
        st = line.strip()
        if st.startswith('['):
            m = re.search(r'\.node\.([a-z0-9-]+)\]\s*$', st)
            cur = m.group(1) if m else None
            out.append(raw); continue
        if cur and cur in back and st.startswith('neighbors'):
            # 이 줄은 *기존 앵커*의 neighbors. 새 역링크가 이미 있으면 skip.
            existing = [t.strip() for t in st.split('=', 1)[1].split(',') if t.strip()]
            for nn in back[cur]:
                if nn not in existing:
                    existing.append(nn)
            out.append('neighbors = ' + ', '.join(existing) + nl)
            # 한 번만 처리(새 노드 섹션의 neighbors는 cur이 새 노드라 back에 없음).
            back.pop(cur, None)
            continue
        out.append(raw)
    newtext = ''.join(out)

    # === 검증: 재파싱 후 dangling / asym / degree cap / connectivity ===
    nodes2, order2 = parse_nodes(newtext)
    dang = sorted({nb for nid, n in nodes2.items() for nb in n.get('neighbors', []) if nb not in nodes2})
    asym = 0
    for nid, n in nodes2.items():
        for nb in n.get('neighbors', []):
            if nb in nodes2 and nid not in nodes2[nb].get('neighbors', []):
                asym += 1
    over = [(nid, len(n.get('neighbors', []))) for nid, n in nodes2.items() if len(n.get('neighbors', [])) > 6]
    # connectivity(start_node 기준 BFS).
    fadj = defaultdict(set)
    for nid, n in nodes2.items():
        for nb in n.get('neighbors', []):
            if nb in nodes2:
                fadj[nid].add(nb); fadj[nb].add(nid)
    seen = set(); comps = 0
    for s0 in nodes2:
        if s0 in seen: continue
        comps += 1; stk = [s0]
        while stk:
            u = stk.pop()
            if u in seen: continue
            seen.add(u); stk += [v for v in fadj[u] if v not in seen]

    print(f'added nodes: {len(added)} (was {len(nodes)-len(added)} -> {len(nodes2)})')
    from collections import Counter
    print('added by region/kind:', dict(Counter((r, k) for _, r, k, _, _ in added)))
    print('dangling neighbors:', dang)
    print('asymmetric endpoints:', asym)
    print('degree cap violations (>6):', over)
    print('components:', comps)
    for nid, region, kind, cl, nbrs in added:
        print(f'   + {nid:24s} {KIND_KO[kind]:4s} {region:14s} -> {nbrs}  | {cl or "(pool fallback)"}')

    if apply:
        if dang or asym or over or comps != 1:
            print('REFUSE APPLY — 정합성 위반 존재'); return
        with io.open(MAP_PATH, 'w', encoding='utf-8', newline='') as f:
            f.write(newtext)
        print('APPLIED')
    else:
        print('DRY RUN')


if __name__ == '__main__':
    main(apply='--apply' in sys.argv)
