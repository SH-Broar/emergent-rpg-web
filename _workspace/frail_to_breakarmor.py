#!/usr/bin/env python3
# frail(취약 — 방어 감소 디버프) 폐지 → '방어 파괴'(break-armor) 전환 (2026-06-19)
#  (1) 카드: effects의 apply-status:N:enemy:frail → break-armor:0:enemy, 그리고 *피해보다 앞*으로 이동
#           (방어를 먼저 깨고 때려야 의미가 있으므로).
#  (2) 몬스터: grid_attack_*에 frail:N 부여하던 줄 삭제(폐지 상태 적용 방지). grid_attack_1(주공격)은 유지.
import re, os

CARD_FILES = [
    "public/data/cards/cards-race.txt",
    "public/data/cards/cards-mvr.txt",
    "public/data/cards/cards-slime.txt",
    "public/data/cards/cards-sminthus.txt",
    "public/data/cards/cards-whitefang.txt",
    "public/data/cards/transform-forms.txt",
]
MONSTER_FILES = [
    "public/data/monsters/act-1-roster-t1.txt",
    "public/data/monsters/act-1-roster-t2.txt",
    "public/data/monsters/act-1-roster-t3.txt",
    "public/data/monsters/act-1-roster-t4.txt",
]

def convert_card_effects(val):
    """effects 값 문자열 변환. frail apply-status → break-armor, break-armor를 맨 앞으로."""
    toks = [t.strip() for t in val.split(",") if t.strip()]
    changed = False
    out = []
    for t in toks:
        parts = t.split(":")
        if parts[0] == "apply-status" and len(parts) >= 4 and parts[3] == "frail":
            out.append("break-armor:0:enemy")
            changed = True
        else:
            out.append(t)
    if changed:
        # break-armor를 앞으로(여러 개면 모두 앞).
        ba = [t for t in out if t.startswith("break-armor")]
        rest = [t for t in out if not t.startswith("break-armor")]
        out = ba + rest
    return ", ".join(out), changed

def do_cards():
    total = 0
    pat = re.compile(r"^(\s*effects\s*=\s*)(.*?)(\s*)$")
    for rel in CARD_FILES:
        if not os.path.exists(rel):
            continue
        with open(rel, "r", encoding="utf-8") as f:
            text = f.read()
        nl = "\r\n" if "\r\n" in text else "\n"
        lines = text.split(nl)
        cnt = 0
        for i, ln in enumerate(lines):
            m = pat.match(ln)
            if not m or "frail" not in m.group(2):
                continue
            newval, ch = convert_card_effects(m.group(2))
            if ch:
                lines[i] = m.group(1) + newval
                cnt += 1
        if cnt:
            with open(rel, "w", encoding="utf-8") as f:
                f.write(nl.join(lines))
        if cnt:
            print(f"  카드 {rel}: {cnt}건")
        total += cnt
    return total

def do_monsters():
    total = 0
    for rel in MONSTER_FILES:
        if not os.path.exists(rel):
            continue
        with open(rel, "r", encoding="utf-8") as f:
            text = f.read()
        nl = "\r\n" if "\r\n" in text else "\n"
        lines = text.split(nl)
        # frail을 부여하는 grid_attack 줄 삭제.
        keep = [ln for ln in lines if not re.match(r"^\s*grid_attack_\d+\s*=.*\|\s*frail:", ln)]
        removed = len(lines) - len(keep)
        if removed:
            with open(rel, "w", encoding="utf-8") as f:
                f.write(nl.join(keep))
            print(f"  몬스터 {rel}: -{removed} grid_attack(frail)")
        total += removed
    return total

if __name__ == "__main__":
    c = do_cards()
    m = do_monsters()
    print(f"\n합계: 카드 {c}건 전환 / 몬스터 frail 공격 {m}줄 제거")
