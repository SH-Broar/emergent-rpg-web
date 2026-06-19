#!/usr/bin/env python3
# monster_name_1 검수 시트의 proposal을 몬스터 데이터에 적용 (2026-06-19)
#  name 필드만 교체(species·id 불변 → 세이브 안전). text(현재명) == data의 name 일 때만 교체.
import json, re, os, glob

d = json.load(open("_review/monster_name_1.json", encoding="utf-8"))
ren = {}
for it in d.get("items", []):
    old = str(it.get("text", "")).strip()
    new = str(it.get("proposal", "")).strip()
    if old and new and old != new:
        ren[old] = new

files = glob.glob("public/data/monsters/*.txt")
total = 0
for fp in files:
    txt = open(fp, encoding="utf-8").read()
    nl = "\r\n" if "\r\n" in txt else "\n"
    lines = txt.split(nl)
    cnt = 0
    for i, ln in enumerate(lines):
        m = re.match(r"^(\s*name\s*=\s*)(.+?)(\s*)$", ln)
        if not m:
            continue
        cur = m.group(2).strip()
        if cur in ren:
            lines[i] = m.group(1) + ren[cur]
            cnt += 1
    if cnt:
        open(fp, "w", encoding="utf-8").write(nl.join(lines))
        print(f"  {os.path.basename(fp)}: {cnt}건")
        total += cnt
print(f"\n적용 {total}건 / 제안 {len(ren)}종")
# 미적용(데이터에서 못 찾은) 제안 보고
applied_names = set()
blob = "\n".join(open(fp, encoding="utf-8").read() for fp in files)
miss = [o for o in ren if re.search(r"name = " + re.escape(ren[o]) + r"\s*$", blob, re.M) is None]
if miss:
    print("미적용(확인 필요):", ", ".join(miss))
