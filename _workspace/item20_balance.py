#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Item 20 — 채집/이벤트 보상 밸런스 데이터 변환.

규칙(스펙 정본):
  1. 양수 hp = +N (회복) → heal_pct.  (2~5→35, 6~9→50, 10~12→100). 음수 hp 유지.
  2. color = X:N (보상)이 있는데 *비용 키가 하나도 없는* choice에 댓가 추가.
     비용 키 집합: gold(음수), hp(음수, 변환 전 기준), time_shards(음수), color_cost, lose_card.
     댓가 분포(다양하게): gold -4 (주력) / color_cost(보색):3 / hp -3 를 회전.
  3. 줄·블록 순서·주석·빈 줄을 보존(블록 안에서 키만 변환/추가).

choice 블록 = `[event.*.choice.*]` 섹션부터 다음 `[` 또는 EOF 까지.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS = ROOT / "public" / "data" / "events"

FILES = [
    "act-1-region-events.txt",
    "events-filler.txt",
    "events-mvr.txt",
    "events-persistent.txt",
    "events-possession.txt",
]

# color_cost 보색 매핑 — 반대 결의 색을 비용으로.
COMPLEMENT = {
    "fire": "water", "water": "fire",
    "electric": "earth", "earth": "electric",
    "iron": "wind", "wind": "iron",
    "light": "dark", "dark": "light",
}
# random 보상에 쓸 회전 비용 색(고정 풀).
RANDOM_COST_COLORS = ["water", "earth", "wind", "fire", "iron", "dark"]


def heal_pct_for(n: int) -> int:
    if n <= 5:
        return 35
    if n <= 9:
        return 50
    return 100


CHOICE_HEADER = re.compile(r"^\[event\.[^\]]+\.choice\.\d+\]\s*$")
SECTION_HEADER = re.compile(r"^\[")


def parse_kv(line):
    """'key = value' → (key, value, prefix_ws). 아니면 None."""
    m = re.match(r"^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
    if not m:
        return None
    return m.group(2), m.group(3), m.group(1)


def transform_file(path: Path, stats: dict):
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    out = []
    i = 0
    n = len(lines)
    cost_rotation = 0  # gold / color_cost / hp 회전 카운터(파일 전역)

    while i < n:
        line = lines[i]
        if CHOICE_HEADER.match(line.strip()):
            # 블록 수집: 헤더 포함, 다음 섹션 헤더 전까지.
            block = [line]
            j = i + 1
            while j < n and not SECTION_HEADER.match(lines[j].strip()):
                block.append(lines[j])
                j += 1
            new_block, cost_rotation = transform_block(block, cost_rotation, stats)
            out.extend(new_block)
            i = j
        else:
            out.append(line)
            i += 1

    new_text = "\n".join(out)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False


def transform_block(block, cost_rotation, stats):
    """한 choice 블록 변환. 반환 (new_block_lines, cost_rotation)."""
    # 1차 패스: 키 인덱스/값 수집.
    kv = {}            # key -> (line_index_in_block, value)
    for idx, ln in enumerate(block):
        p = parse_kv(ln)
        if p:
            key, value, _ = p
            kv[key] = (idx, value)

    # --- 규칙 1: 양수 hp → heal_pct ---
    has_negative_hp = False
    if "hp" in kv:
        hp_idx, hp_val = kv["hp"]
        try:
            hp_num = int(hp_val.replace("+", ""))
        except ValueError:
            hp_num = None
        if hp_num is not None:
            if hp_num > 0:
                pct = heal_pct_for(hp_num)
                # hp = N 라인을 heal_pct = PCT 로 치환(선행 공백 보존).
                lead = re.match(r"^(\s*)", block[hp_idx]).group(1)
                block[hp_idx] = f"{lead}heal_pct = {pct}"
                # kv 갱신: hp 제거, heal_pct 추가.
                del kv["hp"]
                kv["heal_pct"] = (hp_idx, str(pct))
                stats["hp_to_heal"] += 1
            elif hp_num < 0:
                has_negative_hp = True

    # --- 규칙 2: 댓가 없는 color 보상에 비용 추가 ---
    if "color" in kv:
        color_idx, color_val = kv["color"]
        # color = X:N 파싱.
        cparts = color_val.split(":")
        reward_color = cparts[0].strip() if cparts else ""
        reward_amt = 0
        if len(cparts) > 1:
            try:
                reward_amt = int(cparts[1].strip())
            except ValueError:
                reward_amt = 0
        if reward_amt > 0:
            # 비용 키 존재 검사.
            has_cost = has_negative_hp
            if "gold" in kv:
                try:
                    if int(kv["gold"][1].replace("+", "")) < 0:
                        has_cost = True
                except ValueError:
                    pass
            if "time_shards" in kv:
                try:
                    if int(kv["time_shards"][1].replace("+", "")) < 0:
                        has_cost = True
                except ValueError:
                    pass
            if "color_cost" in kv or "lose_card" in kv:
                has_cost = True
            if not has_cost:
                # 양수 gold 보상이 이미 있으면 gold 비용을 넣으면 중복 키가 됨 →
                # 이 경우 color_cost로만 비용 부과(보상 gold 유지).
                gold_reward = False
                if "gold" in kv:
                    try:
                        if int(kv["gold"][1].replace("+", "")) > 0:
                            gold_reward = True
                    except ValueError:
                        pass
                cost_line = make_cost(reward_color, cost_rotation, force_color=gold_reward)
                cost_rotation += 1
                # color 보상 라인 *바로 앞에* 비용 라인 삽입(선행 공백 맞춤).
                lead = re.match(r"^(\s*)", block[color_idx]).group(1)
                block.insert(color_idx, f"{lead}{cost_line}")
                stats["color_cost_added"] += 1

    return block, cost_rotation


def make_cost(reward_color, rotation, force_color=False):
    """회전에 따라 비용 라인 1개 생성. gold 주력, color_cost, hp 섞기.
    force_color=True면 gold/hp 대신 항상 color_cost(양수 gold 보상과 키 충돌 회피)."""
    def color_cost_line():
        if reward_color in ("random", "all", ""):
            cc = RANDOM_COST_COLORS[rotation % len(RANDOM_COST_COLORS)]
        else:
            cc = COMPLEMENT.get(reward_color, "water")
        return f"color_cost = {cc}:3"

    if force_color:
        return color_cost_line()
    slot = rotation % 5
    if slot in (0, 2):           # 40% gold
        return "gold = -4"
    if slot in (1, 4):           # 40% color_cost
        return color_cost_line()
    # slot == 3 → 20% hp
    return "hp = -3"


def main():
    stats = {"hp_to_heal": 0, "color_cost_added": 0}
    changed = []
    for fn in FILES:
        p = EVENTS / fn
        if not p.exists():
            print(f"  SKIP (없음): {fn}")
            continue
        if transform_file(p, stats):
            changed.append(fn)
    print("=== Item 20 변환 결과 ===")
    print(f"  hp+ → heal_pct : {stats['hp_to_heal']}")
    print(f"  color 비용 추가 : {stats['color_cost_added']}")
    print(f"  변경 파일       : {', '.join(changed) if changed else '없음'}")


if __name__ == "__main__":
    main()
