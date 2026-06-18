#!/usr/bin/env python3
# 권역 로스터 몬스터에 격자 공격(grid_attack) 생성 (2026-06-19, Fun QA)
#  문제: 147종 중 격자 공격 보유 11종뿐(t2/t3/t4=0). 나머지는 격자에서 '걷다가 기본 찌르기'만 →
#        텔레그래프 없음·다양성 없음·intents(디버프)가 사장 → 전투가 밋밋.
#  해결: 기존 attack·intents·tier에서 *대칭* 격자 공격을 도출.
#    - 적은 shape를 회전하지 않으므로 4방향/방사형 대칭이라야 인접 플레이어를 친다.
#    - id 해시로 근접/사거리/대각 아키타입 분배(공간 다양성). 엘리트는 전방위(8칸).
#    - intents의 debuff(poison/burn/vulnerable/weakness/frail/slowed/sleep/slime/sap)를
#      *상태 부여 공격*(grid_attack_2)으로 부활 — 이식된 상태이상과 연동.
#  멱등: 이미 grid_attack 보유 블록은 건너뜀.
import re, os

FILES = [
    "public/data/monsters/act-1-roster-t1.txt",
    "public/data/monsters/act-1-roster-t2.txt",
    "public/data/monsters/act-1-roster-t3.txt",
    "public/data/monsters/act-1-roster-t4.txt",
]

# 부여 가능한(이식 완료) 상태 → 디버프 공격 이름.
STATUS_ATK_NAME = {
    "poison": "독 뿌리기", "burn": "불씨 던지기", "vulnerable": "허 찌르기",
    "weakness": "기 빼앗기", "frail": "으스러뜨리기", "slowed": "옭아매기",
    "sleep": "잠재우기", "slime": "끈끈이", "sap": "잠식", "brainwash": "홀리기",
}
GOOD_STATUS = set(STATUS_ATK_NAME.keys())

# 아키타입 — (이름, 셀목록, perTileMul, 속도). 셀은 적 기준 대칭.
def archetype(kind):
    if kind == "melee":
        return ("할퀴기", [(0,-1),(0,1),(-1,0),(1,0)], [1,1,1,1], "fast")
    if kind == "diagonal":
        return ("휘둘러치기", [(-1,-1),(1,-1),(-1,1),(1,1)], [1,1,1,1], "normal")
    if kind == "reach":
        return ("내지르기", [(0,-1),(0,-2),(0,1),(0,2),(-1,0),(-2,0),(1,0),(2,0)],
                [1,0.7,1,0.7,1,0.7,1,0.7], "slow")
    # wide(엘리트) — 전방위 8칸.
    return ("휩쓸기", [(0,-1),(0,1),(-1,0),(1,0),(-1,-1),(1,-1),(-1,1),(1,1)], [1]*8, "normal")

def hash_id(s):
    return sum(ord(c) for c in s)

def fmt_shape(cells):
    return " ".join(f"{x},{y}" for x, y in cells)

def fmt_mul(muls):
    return ",".join(str(int(m)) if float(m).is_integer() else ("%g" % m) for m in muls)

def split_blocks(lines):
    blocks = []
    header, body = None, []
    for ln in lines:
        if ln.lstrip().startswith("[monster.") and "]" in ln:
            if header is not None or body:
                blocks.append((header, body))
            header, body = ln, []
        else:
            body.append(ln)
    blocks.append((header, body))
    return blocks

def field(body, key):
    pat = re.compile(r"^\s*" + re.escape(key) + r"\s*=\s*(.*?)\s*$")
    for i, ln in enumerate(body):
        m = pat.match(ln)
        if m:
            return i, m.group(1)
    return -1, None

def header_id(h):
    m = re.search(r"\[monster\.([^\]]+)\]", h or "")
    return m.group(1) if m else ""

def parse_debuff(intents):
    """intents 문자열에서 첫 (status, N) 디버프 — 이식된 상태만."""
    for m in re.finditer(r"debuff:(\d+):([a-z\-]+)", intents or ""):
        n, st = int(m.group(1)), m.group(2)
        if st in GOOD_STATUS:
            return st, n
    return None

def main():
    total = 0
    for rel in FILES:
        if not os.path.exists(rel):
            print(f"  (없음) {rel}"); continue
        with open(rel, "r", encoding="utf-8") as f:
            text = f.read()
        nl = "\r\n" if "\r\n" in text else "\n"
        blocks = split_blocks(text.split(nl))
        cnt = 0
        for bi, (header, body) in enumerate(blocks):
            if header is None:
                continue
            if any("grid_attack" in ln for ln in body):
                continue  # 이미 보유 — 건너뜀.
            cid = header_id(header)
            _, atk_s = field(body, "attack")
            atk = max(4, int(atk_s)) if atk_s and atk_s.isdigit() else 6
            _, tier = field(body, "tier")
            tier = (tier or "normal").strip()
            _, intents = field(body, "intents")
            ai, _ = field(body, "attack")
            if ai < 0:
                continue  # attack 필드 없는 비전투 블록은 건너뜀.

            lines = []
            if tier == "elite":
                nm, cells, muls, spd = archetype("wide")
                dmg = int(round(atk * 1.15))
            else:
                kind = ["melee", "reach", "diagonal"][hash_id(cid) % 3]
                nm, cells, muls, spd = archetype(kind)
                dmg = atk
            lines.append(f"grid_attack_1 = {nm} | {fmt_shape(cells)} | {fmt_mul(muls)} | {dmg} | {spd} | true |")

            deb = parse_debuff(intents)
            if deb:
                st, n = deb
                dnm = STATUS_ATK_NAME[st]
                dcells = [(0,-1),(0,1),(-1,0),(1,0)]
                ddmg = max(1, atk // 2)
                lines.append(f"grid_attack_2 = {dnm} | {fmt_shape(dcells)} | 1,1,1,1 | {ddmg} | normal | true | {st}:{n}")

            # attack 라인 바로 뒤에 삽입.
            for j, ln in enumerate(lines):
                body.insert(ai + 1 + j, ln)
            blocks[bi] = (header, body)
            cnt += 1
        if cnt:
            out = []
            for header, body in blocks:
                if header is not None:
                    out.append(header)
                out.extend(body)
            with open(rel, "w", encoding="utf-8") as f:
                f.write(nl.join(out))
        print(f"  {rel}: +{cnt}종")
        total += cnt
    print(f"\n합계: {total}종에 격자 공격 생성")

if __name__ == "__main__":
    main()
