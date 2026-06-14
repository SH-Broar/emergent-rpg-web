#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Item 37-① 전투 밸런스 재조정 — 카드 데이터 변환 (idempotent).

스펙 정본: emergent-rpg-web/.omc/specs/item-37a-combat-balance.md

규칙
  A. 회복 카드 — 소멸 + 축소
     - 양수 heal value 효과가 있는 카드 전부에 exhaust-self 추가(이미 있으면 유지).
       음수 heal(자기 HP 비용)·재생(apply-status regen)은 대상 아님(heal 효과만 본다).
     - 순수 회복(damage 없는) 카드 ~절반을 하이브리드(heal↓ + damage 추가)로 전환 →
       삭제 없이 dangling 0. 전환 목록은 HEAL_HYBRID 화이트리스트.
  B. 커먼 이상 카드 강화 (basic 불변)
     - 피해/방어 *직접* value (damage/block)에 등급 배수 적용(반올림):
         common ×1.4 / rare ×1.55 / legendary ×1.75
     - 배수형(value 가 곱 인자) 효과는 과증폭 방지 — MULT_KINDS 는 +정량(작게)만.
       per-unit/카운트형(damage-per-*, growing-*, damage-color-count, spend-all-energy,
       block-to-damage)도 작은 정량 가산(스택과 곱해지므로 배수 금지).
     - heal/마커/apply-status/draw 는 등급 배수 미적용(heal=A, draw/status=정량 별도).
     - source junk/form/possession 제외. cost 불변.
  C. 보스 되감기는 코드(combat.ts)에서 별도 — 이 스크립트 범위 아님.

LF 라인엔딩 유지(저장소 카드 파일 컨벤션 = LF). 블록·주석·키 순서 보존, effects 라인만 재작성.
멱등 보장: 첫 실행에서 원본을 `_workspace/.item37a_orig/<file>` 스냅샷으로 저장하고,
  이후 매 실행은 *항상 스냅샷(원본)을 입력*으로 변환한다 → 재실행해도 결과 동일(배수 누적 없음).
  스냅샷을 지우면 현재 파일이 새 원본이 된다(주의). --reset 으로 스냅샷 삭제.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "public" / "data" / "cards"

FILES = ["cards-mvr.txt", "cards-race.txt", "cards-possession.txt"]

GRADE_MULT = {"common": 1.4, "rare": 1.55, "legendary": 1.75}

# 직접 피해/방어 value (HP 단위) — 등급 배수 적용.
FLAT_KINDS = {"damage", "block"}

# per-unit / 카운트형 — 작은 정량 가산(등급별). 배수는 스택과 곱해 과증폭.
# 값은 '추가량'. common/rare/legendary 순.
PERUNIT_ADD = {
    "common": 1,
    "rare": 1,
    "legendary": 2,
}
PERUNIT_KINDS = {
    "damage-per-hand", "damage-per-debuff", "damage-per-companion",
    "damage-per-relic", "growing-damage", "growing-block",
    "damage-color-count", "spend-all-energy",
}

# 큰 base 의 순수 배수형(컬러/방어 곱) — 과증폭 위험. 손대지 않음(value 유지).
#   damage-top-color / damage-min-color / block-top-color / block-to-damage:
#   value 가 1~2 인데 base(컬러/블록)가 크다. ×1.4 면 폭증 → 제외.
MULT_KINDS_SKIP = {
    "damage-top-color", "damage-min-color", "block-top-color", "block-to-damage",
}

# 베이스라인(새 정책): race/character common+ 가 충족해야 함.
NEW_BASELINE = {"basic": 4, "common": 9, "rare": 14, "legendary": 22}

# race/character common·rare 카드 중 *단일 피해/방어* 정체성 카드는 베이스라인 바닥값까지 끌어올림.
#   단일 damage 또는 block 효과 1개를 baseline 으로 set(배수 후에도 미달이면).
#   제외(정체성 우선, 경고 허용): 나방 연사/다단(c-moth-flutter, c-moth-gale, c-moth-volley),
#     측정형(damage-per-hand/top-color/color-count/block-top-color → 평범 피해/방어 효과가 없음).
RACE_FLOOR_EXCLUDE = {
    "c-moth-flutter", "c-moth-flutter-plus",   # 나방 고속 소형 연사
    "c-moth-gale", "c-moth-gale-plus",         # 나방 다단 사격
    "c-moth-volley", "c-moth-volley-plus",     # basic(애초 면제)
}


# ---------------------------------------------------------------------------
# A. 회복 하이브리드 전환 — 순수 회복 카드 ~절반.
#    '목표 effects 문자열'을 직접 지정(set). exhaust-self 는 일괄 부여 단계에서 보장되므로
#    여기엔 회복/피해 본체만 둔다(exhaust 는 add_exhaust 가 덧붙임).
#    원본(비-plus)과 plus 를 함께 정의. heal↓ + damage 추가.
#    주의: 여기 damage 값은 *배수 적용 전 base* — A1 후 B 등급 배수가 곱해진다.
#      예) c-warm-cup(common ×1.4) base damage:6 → 최종 8. heal 값은 B 미적용(축소값 그대로).
# ---------------------------------------------------------------------------
HEAL_HYBRID = {
    # 응급 치료(rare, draw 주효과였음) → 회복 줄이고 소폭 피해. 드로우 유지.
    "c-deep-breath":         "draw:1:self, heal:1:self, damage:5:enemy",
    "c-deep-breath-plus":    "draw:2:self, heal:1:self, damage:7:enemy",
    # 따뜻한 한 잔(common) → heal 절반 + 피해.
    "c-warm-cup":            "heal:3:self, draw:1:self, damage:6:enemy",
    "c-warm-cup-plus":       "heal:4:self, draw:1:self, damage:9:enemy",
    # 두 자아의 공명(rare) → heal 축소 + 피해. 드로우 유지.
    "c-alti-resonance":      "draw:2:self, heal:2:self, damage:8:enemy",
    "c-alti-resonance-plus": "draw:2:self, heal:3:self, damage:11:enemy",
    # 안개의 약속(legendary) → heal 대폭 축소 + 큰 피해.
    "c-alimes-mist-vow":     "heal:7:self, draw:1:self, damage:14:enemy",
    "c-alimes-mist-vow-plus": "heal:9:self, draw:1:self, damage:20:enemy",
}

# A. exhaust 면제(개념상) — 없음. 양수 heal 카드 전부 exhaust(수용 기준 절대값).
#    possession c-blessed 도 포함: exhaust-self 는 *전투당* 1회이며 run.deck 영속성과 무관
#    (exhaustPile 은 전투 한정, 다음 전투에 원복). possession permanence 보존됨.
EXHAUST_EXEMPT = set()


# ---------------------------------------------------------------------------
# 파싱 헬퍼
# ---------------------------------------------------------------------------
def num_fmt(x):
    """float 결과를 정수면 정수로, 아니면 소수 1자리로."""
    if abs(x - round(x)) < 1e-9:
        return str(int(round(x)))
    return ("%.2f" % x).rstrip("0").rstrip(".")


def parse_effects(s):
    """'a:1:enemy, b:2:self' → [['a','1','enemy'], ...] (토큰별 파트 보존)."""
    out = []
    for tok in s.split(","):
        tok = tok.strip()
        if not tok:
            continue
        out.append([p.strip() for p in tok.split(":")])
    return out


def join_effects(parts_list):
    return ", ".join(":".join(p) for p in parts_list)


def has_positive_heal(parts_list):
    for p in parts_list:
        if p[0] == "heal" and len(p) > 1:
            try:
                if float(p[1]) > 0:
                    return True
            except ValueError:
                pass
    return False


def has_exhaust(parts_list):
    return any(p[0] == "exhaust-self" for p in parts_list)


# ---------------------------------------------------------------------------
# 블록 단위 변환
# ---------------------------------------------------------------------------
SECTION = re.compile(r"^\[card\.([^\]]+)\]\s*$")
KV = re.compile(r"^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")


SNAP_DIR = ROOT / "_workspace" / ".item37a_orig"


def load_original(path):
    """멱등: 스냅샷이 있으면 그걸, 없으면 현재 파일을 원본으로 저장 후 반환."""
    SNAP_DIR.mkdir(exist_ok=True)
    snap = SNAP_DIR / path.name
    if snap.exists():
        return snap.read_text(encoding="utf-8")
    text = path.read_text(encoding="utf-8")
    snap.write_text(text, encoding="utf-8", newline="")
    return text


def transform_file(path, stats):
    cur_text = path.read_text(encoding="utf-8")
    text = load_original(path)  # 항상 원본 스냅샷 기준으로 변환(멱등).
    eol = "\r\n" if "\r\n" in text else "\n"
    lines = text.split("\n")
    # CRLF 였다면 \r 제거 후 끝에서 재부착.
    lines = [ln.rstrip("\r") for ln in lines]

    # 1차 패스: 카드 블록 경계 + 필드 인덱스 맵.
    out = list(lines)
    i = 0
    n = len(lines)
    while i < n:
        m = SECTION.match(lines[i].strip())
        if not m:
            i += 1
            continue
        cid = m.group(1)
        # 블록 수집: 다음 [ 또는 EOF.
        j = i + 1
        block_fields = {}  # key -> (abs_line_idx, value)
        while j < n and not lines[j].lstrip().startswith("["):
            km = KV.match(lines[j])
            if km:
                block_fields[km.group(2)] = (j, km.group(3))
            j += 1
        transform_card(cid, block_fields, out, stats)
        i = j

    # 원본이 LF 였으면 LF 로 저장(컨벤션 보존). out 은 \r 없는 라인 리스트.
    new_text = ("\n" if eol == "\n" else "\r\n").join(out)
    if new_text != cur_text:
        path.write_text(new_text, encoding="utf-8", newline="")
        return True
    return False


def transform_card(cid, fields, out, stats):
    if "effects" not in fields or "rank" not in fields or "source" not in fields:
        return
    eff_idx, eff_val = fields["effects"]
    rank = fields["rank"][1].strip()
    source = fields["source"][1].strip()
    lead = re.match(r"^(\s*)", out[eff_idx]).group(1)

    parts = parse_effects(eff_val)

    # --- A1. 하이브리드 전환(화이트리스트) — exhaust 부여 전에 effects 본체 교체. ---
    if cid in HEAL_HYBRID:
        parts = parse_effects(HEAL_HYBRID[cid])
        stats["hybrid"] += 1

    # --- B. 등급 배수 / 정량 가산 (basic 불변, junk/form/possession 제외). ---
    if source not in ("junk", "form", "possession") and rank in GRADE_MULT:
        mult = GRADE_MULT[rank]
        addu = PERUNIT_ADD[rank]
        for p in parts:
            kind = p[0]
            if len(p) < 2:
                continue
            try:
                v = float(p[1])
            except ValueError:
                continue
            if kind in FLAT_KINDS:
                if v > 0:  # 음수(페널티) block/damage 는 손대지 않음.
                    nv = round_half_up(v * mult)
                    if nv != v:
                        p[1] = num_fmt(nv)
                        stats["flat_buffed"] += 1
            elif kind in PERUNIT_KINDS:
                if v > 0:
                    nv = v + addu
                    p[1] = num_fmt(nv)
                    stats["perunit_buffed"] += 1
            # MULT_KINDS_SKIP / heal / draw / apply-status / 마커 → 미적용.

    # --- B2. 유틸 카드(피해 0, draw/status 위주) 소폭 강화 ---
    #   common+ 이고 damage/block 직접효과가 전혀 없으며 source 일반일 때만.
    if source not in ("junk", "form", "possession") and rank in GRADE_MULT:
        kinds = {p[0] for p in parts}
        has_offense = any(k in ("damage", "block") for k in kinds) or \
            any(k in PERUNIT_KINDS or k in MULT_KINDS_SKIP for k in kinds) or \
            "consume-vulnerable" in kinds or "damage-from-hp" in kinds
        # 순수 draw 카드: draw +1.
        if not has_offense and "draw" in kinds and not has_positive_heal(parts):
            for p in parts:
                if p[0] == "draw" and len(p) > 1:
                    try:
                        v = int(float(p[1]))
                        p[1] = str(v + 1)
                        stats["util_draw"] += 1
                        break
                    except ValueError:
                        pass
        # 순수 상태 카드(피해 0, draw 없음): 가장 큰 apply-status 스택 +1.
        #   regen(재생)은 스펙 A의 명시적 면제 — 손대지 않음.
        elif not has_offense and "apply-status" in kinds and "draw" not in kinds \
                and not has_positive_heal(parts):
            best = None
            for p in parts:
                if p[0] != "apply-status" or len(p) < 2:
                    continue
                status_name = p[3] if len(p) > 3 else ""
                if status_name == "regen":
                    continue
                try:
                    v = float(p[1])
                except ValueError:
                    continue
                if best is None or v > float(parts[best][1]):
                    best = parts.index(p)
            if best is not None:
                try:
                    v = int(float(parts[best][1]))
                    parts[best][1] = str(v + 1)
                    stats["util_status"] += 1
                except ValueError:
                    pass

    # --- B3. race/character 시작 덱 baseline 바닥값 보장 (단일 피해/방어 카드만). ---
    if source in ("race", "character") and rank in ("common", "rare") \
            and cid not in RACE_FLOOR_EXCLUDE:
        baseline = NEW_BASELINE[rank]
        # 평범 damage/block 효과만 후보(측정형 제외). 다단(여러 damage)·heal 카드 제외.
        dmg_idx = [k for k, p in enumerate(parts) if p[0] == "damage" and len(p) > 1]
        blk_idx = [k for k, p in enumerate(parts) if p[0] == "block" and len(p) > 1]
        cand = []
        if len(dmg_idx) == 1:
            cand.append(dmg_idx[0])
        if len(blk_idx) == 1:
            cand.append(blk_idx[0])
        # 가장 큰 후보 1개를 baseline 까지 올림(이미 충족이면 no-op).
        best = None
        for k in cand:
            try:
                v = float(parts[k][1])
            except ValueError:
                continue
            if best is None or v > float(parts[best][1]):
                best = k
        if best is not None:
            try:
                v = float(parts[best][1])
                if v < baseline:
                    parts[best][1] = num_fmt(baseline)
                    stats["race_floor"] += 1
            except ValueError:
                pass

    # --- A2. 양수 heal 카드 → exhaust-self 보장 (멱등). ---
    if has_positive_heal(parts) and not has_exhaust(parts) and cid not in EXHAUST_EXEMPT:
        parts.append(["exhaust-self", "0", "self"])
        stats["exhaust_added"] += 1

    new_eff = join_effects(parts)
    if new_eff != eff_val.strip():
        out[eff_idx] = f"{lead}effects = {new_eff}"


def round_half_up(x):
    import math
    return math.floor(x + 0.5)


def main():
    if "--reset" in sys.argv:
        import shutil
        if SNAP_DIR.exists():
            shutil.rmtree(SNAP_DIR)
            print("스냅샷 삭제 — 다음 실행에서 현재 파일이 새 원본이 됨.")
        else:
            print("스냅샷 없음.")
        return
    stats = {
        "flat_buffed": 0, "perunit_buffed": 0, "util_draw": 0,
        "util_status": 0, "race_floor": 0, "exhaust_added": 0, "hybrid": 0,
    }
    changed = []
    for fn in FILES:
        p = CARDS / fn
        if not p.exists():
            print(f"  SKIP(없음): {fn}")
            continue
        if transform_file(p, stats):
            changed.append(fn)
    print("=== Item 37-① 카드 변환 ===")
    print(f"  flat damage/block 배수    : {stats['flat_buffed']}")
    print(f"  per-unit/카운트 정량 가산 : {stats['perunit_buffed']}")
    print(f"  유틸 draw +1              : {stats['util_draw']}")
    print(f"  유틸 status 스택 +1       : {stats['util_status']}")
    print(f"  race baseline 바닥값 보정 : {stats['race_floor']}")
    print(f"  exhaust-self 추가         : {stats['exhaust_added']}")
    print(f"  회복 하이브리드 전환      : {stats['hybrid']}")
    print(f"  변경 파일                 : {', '.join(changed) if changed else '없음'}")


if __name__ == "__main__":
    main()
