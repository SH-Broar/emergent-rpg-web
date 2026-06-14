# -*- coding: utf-8 -*-
"""act-1-map.txt 파서/라이터 — 노드 섹션(kind/region/label/description/x/y/neighbors) 보존 편집용."""
import io, re

MAP_PATH = 'public/data/node-maps/act-1-map.txt'
NODE_RE = re.compile(r'\.node\.([a-z0-9-]+)\]\s*$')

def load(path=MAP_PATH):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        text = f.read()
    return text

def parse_nodes(text):
    """반환: dict nodeId -> {kind,region,label,x,y,neighbors(list),...}. 순서 보존 위해 list도."""
    nodes = {}
    order = []
    cur = None
    for raw in text.splitlines():
        line = raw.strip()
        m = NODE_RE.search(line) if line.startswith('[') else None
        if line.startswith('['):
            if m:
                cur = m.group(1)
                nodes[cur] = {'_id': cur}
                order.append(cur)
            else:
                cur = None  # 비-노드 섹션
            continue
        if cur is None:
            continue
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            k = k.strip(); v = v.split('#')[0].strip()
            if k == 'neighbors':
                nodes[cur]['neighbors'] = [t.strip() for t in v.split(',') if t.strip()]
            elif k in ('x', 'y'):
                nodes[cur][k] = float(v)
            else:
                nodes[cur][k] = v
    return nodes, order

if __name__ == '__main__':
    text = load()
    nodes, order = parse_nodes(text)
    print('total nodes:', len(nodes))
    # 권역 분포
    from collections import Counter
    reg = Counter(n.get('region','?') for n in nodes.values())
    print('regions:', dict(sorted(reg.items())))
    # neighbor 수 분포
    deg = Counter(len(n.get('neighbors',[])) for n in nodes.values())
    print('degree dist (declared neighbors):', dict(sorted(deg.items())))
    over = [(nid, len(n['neighbors'])) for nid,n in nodes.items() if len(n.get('neighbors',[]))>6]
    print('nodes with >6 neighbors:', len(over))
    for nid,d in sorted(over, key=lambda x:-x[1])[:15]:
        print('   ', nid, d, nodes[nid].get('region'))
    # 르슈드(reshd) 노드
    reshd = [nid for nid,n in nodes.items() if 'reshd' in nid or n.get('region','').startswith('reshd')]
    print('reshd-ish nodes:', reshd)
    # 대칭성 체크 (양방향 누락)
    asym = 0
    for nid,n in nodes.items():
        for nb in n.get('neighbors',[]):
            if nb in nodes and nid not in nodes[nb].get('neighbors',[]):
                asym += 1
    print('asymmetric edge endpoints:', asym)
