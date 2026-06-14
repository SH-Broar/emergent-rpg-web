# -*- coding: utf-8 -*-
"""
신규 노드만 격자 위 빈 셀에 분산 배치.

사용자 사양 (2026-05-27):
  - 기존 노드 좌표·간선은 *절대* 건드리지 않는다. lock된 act-1-map.txt 의 사용자 수정본 보존.
  - 셀(육각 격자 좌표)이 *겹치는* 노드들에서, 결정적으로 첫 노드(id 정렬)만 그 자리에 두고
    나머지는 spiral 탐색으로 가장 가까운 빈 셀로 옮긴다.
  - "기존에 *연결되지 않은 간선*"이 다시 연결돼선 안 된다 — neighbors 라인은 *완전 보존*.
  - 신규 노드도 데이터에 적힌 neighbors 그대로 사용(자동 추가 X). 신규 노드의 의도된 연결은
    데이터에 이미 작성돼 있다고 가정.

알고리즘:
  1) 모든 노드의 (x, y) → axial (q, r) 변환(hex_layout 의 px_to_axial_round).
  2) 셀별로 그룹화. 셀에 N 노드면 id 정렬 첫 노드만 keep, 나머지는 신규 후보.
  3) keep 노드의 (q, r, x, y) 샘플로 *affine 변환* (x = a·q + b·r + c) 두 개를 최소제곱 추정.
  4) 신규 노드는 자기 *원래 셀*에서 spiral_free 로 가장 가까운 빈 셀을 받고,
     그 cell → (x, y) 를 affine 변환으로 계산해 좌표만 갱신.
  5) neighbors 는 그대로. x/y 라인만 교체해 act-1-map.txt 저장.

--apply 가 있으면 파일 수정, 없으면 dry-run(통계만).
"""
import io, math, sys
from collections import defaultdict
from _workspace.map_lib import load, parse_nodes, MAP_PATH, NODE_RE
from _workspace.hex_layout import px_to_axial_round, AX_DIRS


def spiral_free(start, occupied):
    """start 가 비었으면 그대로, 아니면 BFS 로 가장 가까운 비어 있는 인접 셀."""
    if start not in occupied:
        return start
    seen = {start}
    from collections import deque
    dq = deque([start])
    while dq:
        cell = dq.popleft()
        for d in AX_DIRS:
            nb = (cell[0] + d[0], cell[1] + d[1])
            if nb in seen:
                continue
            seen.add(nb)
            if nb not in occupied:
                return nb
            dq.append(nb)
    raise RuntimeError('no free cell within reach')


def fit_affine(samples):
    """
    samples: [(q, r, x, y), ...] 셀 좌표 ↔ 노드 좌표 쌍.
    두 개의 독립 3-변수 선형회귀로 (a,b,c) (d,e,f) 풀이 — Cramer's rule (numpy 비의존).
    """
    M = [[0.0]*3 for _ in range(3)]
    bx = [0.0]*3
    by = [0.0]*3
    for q, r, x, y in samples:
        v = [float(q), float(r), 1.0]
        for i in range(3):
            bx[i] += v[i] * x
            by[i] += v[i] * y
            for j in range(3):
                M[i][j] += v[i] * v[j]

    def det3(m):
        return (m[0][0]*(m[1][1]*m[2][2] - m[1][2]*m[2][1])
                - m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0])
                + m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0]))

    D = det3(M)
    if abs(D) < 1e-12:
        raise RuntimeError('affine fit singular — too few keep samples or collinear')

    def solve(b):
        out = []
        for k in range(3):
            Mk = [row[:] for row in M]
            for i in range(3):
                Mk[i][k] = b[i]
            out.append(det3(Mk) / D)
        return out

    return tuple(solve(bx)), tuple(solve(by))


def main(apply=False):
    text = load()
    nodes, order = parse_nodes(text)

    # 1) 모든 노드의 hex cell 추정.
    cell_of = {}
    for nid, n in nodes.items():
        cell_of[nid] = px_to_axial_round(n['x'], n['y'])

    # 2) 셀별 그룹 → keep / new 분할 (결정적: id 정렬 첫 노드 keep).
    by_cell = defaultdict(list)
    for nid, c in cell_of.items():
        by_cell[c].append(nid)
    keep_ids = set()
    new_ids = []  # 옮길 노드 — id 정렬 두 번째부터.
    for c, ids in by_cell.items():
        ids_sorted = sorted(ids)
        keep_ids.add(ids_sorted[0])
        new_ids.extend(ids_sorted[1:])

    if not new_ids:
        print('충돌 셀 없음 — 이동할 신규 노드가 없다.')
        return

    print(f'총 노드: {len(nodes)}, keep: {len(keep_ids)}, 이동 대상(신규): {len(new_ids)}')

    # 3) affine fit — keep 샘플 (q, r, x, y) 로 unit basis 추정.
    samples = []
    for nid in keep_ids:
        q, r = cell_of[nid]
        x, y = nodes[nid]['x'], nodes[nid]['y']
        samples.append((q, r, x, y))
    cx, cy = fit_affine(samples)
    # 추정 오차 확인 — 평균 residual.
    err = 0.0
    for q, r, x, y in samples:
        ex = cx[0]*q + cx[1]*r + cx[2]
        ey = cy[0]*q + cy[1]*r + cy[2]
        err += math.hypot(x - ex, y - ey)
    err /= max(1, len(samples))
    print(f'affine 추정 평균 잔차: {err:.5f} (좌표 단위, 1=맵 전체 폭)')

    def cell_to_xy(q, r):
        return (cx[0]*q + cx[1]*r + cx[2], cy[0]*q + cy[1]*r + cy[2])

    # 4) 신규 노드를 spiral_free 로 *원래 셀의 인접 빈 셀*에 분산.
    occupied = {cell_of[nid]: True for nid in keep_ids}
    moves = []
    # 새 노드 안에서도 같은 셀(이중 충돌)이 또 있을 수 있으므로, id 정렬 후 순차 처리.
    for nid in sorted(new_ids):
        start = cell_of[nid]
        new_cell = spiral_free(start, occupied)
        occupied[new_cell] = True
        new_xy = cell_to_xy(*new_cell)
        moves.append((nid, start, new_cell, new_xy))

    # 5) 미리보기 — 권역별 이동 수.
    region_moves = defaultdict(int)
    for nid, _, _, _ in moves:
        region_moves[nodes[nid].get('region', '?')] += 1
    print('권역별 이동 수:', dict(sorted(region_moves.items())))

    if not apply:
        # dry-run — 처음 30개 미리보기.
        for nid, old_c, new_c, xy in moves[:30]:
            print(f'  {nid} ({nodes[nid].get("region")}) cell {old_c}→{new_c}, (x,y) → ({xy[0]:.4f}, {xy[1]:.4f})')
        if len(moves) > 30:
            print(f'  ... +{len(moves)-30}개')
        print('DRY RUN — --apply 로 act-1-map.txt 수정.')
        return

    # 6) 좌표만 갱신해 파일 다시 쓰기. neighbors 라인은 손대지 않는다.
    new_xy = {nid: (round(xy[0], 4), round(xy[1], 4)) for nid, _, _, xy in moves}
    out = []
    cur = None
    for raw in text.splitlines(keepends=True):
        line = raw.rstrip('\n').rstrip('\r')
        nl = raw[len(line):]
        if line.strip().startswith('['):
            m = NODE_RE.search(line.strip())
            cur = m.group(1) if m else None
            out.append(raw)
            continue
        if cur and cur in new_xy:
            st = line.strip()
            if st.startswith('x ') or st.startswith('x='):
                out.append(f'x = {new_xy[cur][0]}' + nl)
                continue
            if st.startswith('y ') or st.startswith('y='):
                out.append(f'y = {new_xy[cur][1]}' + nl)
                continue
        out.append(raw)
    with io.open(MAP_PATH, 'w', encoding='utf-8', newline='') as f:
        f.write(''.join(out))
    print(f'APPLIED — {len(moves)}개 노드 좌표 갱신.')


if __name__ == '__main__':
    main(apply='--apply' in sys.argv)
