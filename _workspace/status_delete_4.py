#!/usr/bin/env python3
# 상태이상 검수: #20 집중·#26 무통·#27 각혈·#28 반격진 삭제 + #25 불굴→강철 (2026-06-19)
#  - 버프 부여 전용 카드(다른 효과 없음, 풀 외 참조 0)는 *카드째 삭제*.
#  - 불굴(barricade) 카드는 강철(metallicize)로 전환 + 이름 '철벽'(기존 '강철'과 구분).
import re, os

DELETE_IDS = set()
for base in ["c-human-secondwind", "c-human-fullbreak", "c-human-expose",
             "c-human-disarm", "c-clear-focus"]:
    DELETE_IDS.add(base); DELETE_IDS.add(base + "-plus")
CONVERT_IDS = {"c-human-pivot", "c-human-pivot-plus"}

FILES = ["public/data/cards/cards-race.txt", "public/data/cards/cards-mvr.txt"]

def block_id(line):
    m = re.match(r"\s*\[card\.([^\]]+)\]", line)
    return m.group(1) if m else None

for fp in FILES:
    if not os.path.exists(fp): continue
    txt = open(fp, encoding="utf-8").read()
    nl = "\r\n" if "\r\n" in txt else "\n"
    lines = txt.split(nl)
    # 블록 경계
    heads = [i for i, l in enumerate(lines) if l.lstrip().startswith("[")]
    heads.append(len(lines))
    keep = [True] * len(lines)
    deleted = converted = 0
    for hi in range(len(heads) - 1):
        a, b = heads[hi], heads[hi + 1]
        cid = block_id(lines[a])
        if cid in DELETE_IDS:
            for i in range(a, b): keep[i] = False
            deleted += 1
        elif cid in CONVERT_IDS:
            for i in range(a, b):
                s = lines[i]
                if re.match(r"\s*effects\s*=", s):
                    lines[i] = re.sub(r"barricade:0:self", "metallicize:1:self", s)
                elif re.match(r"\s*name\s*=", s):
                    plus = lines[i].rstrip().endswith("+")
                    lines[i] = re.sub(r"(=\s*).*$", lambda m: m.group(1) + "철벽" + ("+" if plus else ""), lines[i])
            converted += 1
    out = [l for i, l in enumerate(lines) if keep[i]]
    open(fp, "w", encoding="utf-8").write(nl.join(out))
    print(f"  {os.path.basename(fp)}: 삭제 {deleted} 블록, 전환 {converted}")
print("완료")
