#!/usr/bin/env python3
# 몬스터 종족 다양화 적용 (2026-06-19, ralph)
#  US-001: monster_diversify_1.json 23종 → name+species (천사/악마/켄타우로스/리저드맨/미노타우로스)
#  US-002: spirit(정령) 14종 → species=wraith(유령), 정령/요정→유령(고유명·도깨비불·불씨 유지)
import re, json, glob, os

# US-001: diversify_1 (id → (new_name, new_species))
dv = json.load(open("_review/monster_diversify_1.json", encoding="utf-8"))
ID2NEW = {}
for it in dv["items"]:
    mid = re.search(r'(mr-[a-z0-9-]+)', it["loc"]).group(1)
    sp = re.search(r'\(([a-z]+)\)', it["kind"]).group(1)
    ID2NEW[mid] = (it["proposal"].strip(), sp)

# US-002: spirit → wraith(유령). id → new_name (species 일괄 wraith)
SPIRIT2GHOST = {
    'mr-iluneon-lantern-imp': '가로등 불씨',
    'mr-iluneon-spirit-herald': '시미브',
    'mr-moss-forge-imp': '라로그',
    'mr-ali-fog-sprite': '안개 유령',
    'mr-ali-fog-sovereign': '안개',
    'mr-martin-tide-spirit': '물보라 유령',
    'mr-luna-forbidden-wisp': '서고 도깨비불',
    'mr-tacomi-barrier-sprite': '결계 유령',
    'mr-demon-windfall-gale-blade': '회오리 유령',
    'mr-demon-windfall-time-freezer': '멈춘 유령',
    'mr-demon-windfall-storm-tyrant': '성난 폭풍 유령',
    'mr-triflower-flame-spirit': '불꽃 유령',
    'mr-triflower-scorchling': '잿불 유령',
    'mr-oldshrine-spirit-flame': '도깨비불',
}
for mid, nm in SPIRIT2GHOST.items():
    ID2NEW[mid] = (nm, 'wraith')

applied = []
miss = set(ID2NEW)
for fp in glob.glob("public/data/monsters/act-1-roster-*.txt"):
    txt = open(fp, encoding="utf-8").read()
    nl = '\r\n' if '\r\n' in txt else '\n'
    lines = txt.split(nl)
    cur_id = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        m = re.match(r'\[monster\.([a-z0-9-]+)\]', s)
        if m:
            cur_id = m.group(1)
            continue
        if cur_id in ID2NEW:
            nm, sp = ID2NEW[cur_id]
            if re.match(r'\s*name\s*=', ln):
                lines[i] = re.sub(r'^(\s*name\s*=\s*).*$', lambda mm: mm.group(1)+nm, ln)
            elif re.match(r'\s*species\s*=', ln):
                lines[i] = re.sub(r'^(\s*species\s*=\s*).*$', lambda mm: mm.group(1)+sp, ln)
                applied.append((cur_id, nm, sp)); miss.discard(cur_id)
    open(fp, 'w', encoding='utf-8').write(nl.join(lines))

print(f"적용 {len(applied)}종 / 목표 {len(ID2NEW)}종")
if miss: print("!! 미적용(id 매칭 실패):", sorted(miss))
# 검증: spirit 잔존?
rem = 0
for fp in glob.glob("public/data/monsters/act-1-roster-*.txt"):
    for ln in open(fp, encoding="utf-8"):
        if re.match(r'\s*species\s*=\s*spirit\s*$', ln): rem += 1
print(f"spirit 잔존: {rem}건 (0이어야 함)")
