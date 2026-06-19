#!/usr/bin/env python3
# 정정(2026-06-19): spirit(정령) → 요정(fae), 유령(wraith) 아님. 이전 잘못된 spirit→wraith 되돌림.
#  사용자: "정령이 아니라 요정입니다. 유령을 늘려서는 안 됩니다."
import re, glob

# id → 새 이름 (전부 species=fae). 정령/유령 → 요정, 고유명·도깨비불·불씨 유지.
FIX = {
    'mr-iluneon-lantern-imp': '가로등 불씨',
    'mr-iluneon-spirit-herald': '시미브',
    'mr-moss-forge-imp': '라로그',
    'mr-ali-fog-sprite': '안개 요정',
    'mr-ali-fog-sovereign': '안개',
    'mr-martin-tide-spirit': '물보라 요정',
    'mr-luna-forbidden-wisp': '서고 도깨비불',
    'mr-tacomi-barrier-sprite': '결계 요정',
    'mr-demon-windfall-gale-blade': '회오리 요정',
    'mr-demon-windfall-time-freezer': '멈춘 요정',
    'mr-demon-windfall-storm-tyrant': '성난 폭풍 요정',
    'mr-triflower-flame-spirit': '불꽃 요정',
    'mr-triflower-scorchling': '잿불 요정',
    'mr-oldshrine-spirit-flame': '도깨비불',
}
done = set()
for fp in glob.glob("public/data/monsters/act-1-roster-*.txt"):
    txt = open(fp, encoding="utf-8").read()
    nl = '\r\n' if '\r\n' in txt else '\n'
    lines = txt.split(nl)
    cur = None
    for i, ln in enumerate(lines):
        m = re.match(r'\[monster\.([a-z0-9-]+)\]', ln.strip())
        if m:
            cur = m.group(1); continue
        if cur in FIX:
            if re.match(r'\s*name\s*=', ln):
                lines[i] = re.sub(r'^(\s*name\s*=\s*).*$', lambda mm: mm.group(1)+FIX[cur], ln)
            elif re.match(r'\s*species\s*=', ln):
                lines[i] = re.sub(r'^(\s*species\s*=\s*).*$', lambda mm: mm.group(1)+'fae', ln)
                done.add(cur)
    open(fp, 'w', encoding='utf-8').write(nl.join(lines))

print(f"요정(fae) 변환 {len(done)}/{len(FIX)}")
miss = set(FIX) - done
if miss: print("!! 미적용:", sorted(miss))
# 검증: wraith 13으로 복귀? fae 14?
import collections
cnt = collections.Counter()
for fp in glob.glob("public/data/monsters/act-1-roster-*.txt"):
    for ln in open(fp, encoding="utf-8"):
        m = re.match(r'\s*species\s*=\s*(\w+)\s*$', ln)
        if m and m.group(1) in ('wraith', 'fae', 'spirit'): cnt[m.group(1)] += 1
print(f"집계: fae={cnt['fae']} wraith={cnt['wraith']} spirit={cnt['spirit']} (fae 14·wraith 13·spirit 0 기대)")
