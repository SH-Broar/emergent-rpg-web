#!/usr/bin/env python3
# 격자 전투 시작 덱 카드 일괄 변환 (2026-06-19)
#  #8: 모든 근접(pattern) 공격 카드의 shape를 4방향 대칭(90도 4회 회전 합집합)으로.
#      - target_mode = aimed/throw 는 제외(원거리/투척은 방향성 의도).
#      - per_tile_mul도 회전 칸에 그대로 복사(강 칸 1.5x 유지).
#      - 이미 대칭이면 건너뜀(idempotent).
#  #7: 드로우(draw) 효과가 붙은 카드(aimed/throw 제외)에 instant = true 추가(즉시 발동).
#      - 이미 instant 라인이 있으면 건너뜀.
import re, sys, os

FILES = [
    "public/data/cards/cards-race.txt",
    "public/data/cards/cards-whitefang.txt",
    "public/data/cards/cards-slime.txt",
    "public/data/cards/cards-sminthus.txt",
    "public/data/cards/cards-mvr.txt",
]

# 시작 덱 카드(race starting_deck 합집합) — 즉시(instant)는 이들 + 그 -plus 강화판 중 draw 보유만.
STARTING_DECK_IDS = {
    "c-strike", "c-defend", "c-recover",
    "c-arcana-spire", "c-arcana-levee", "c-arcana-prism", "c-arcana-judgment", "c-quickdraw",
    "c-human-cleave", "c-human-throw", "c-human-balance", "c-human-tailwind", "c-human-step", "c-human-adapt",
    "c-moth-flutter", "c-moth-snipe", "c-moth-volley", "c-moth-glide", "c-moth-flight", "c-moth-gale",
    "c-phantom-handblade", "c-phantom-fullhand", "c-phantom-shroud", "c-phantom-shuffle", "c-phantom-cycle",
    "c-phantom-guard", "c-phantom-static", "c-phantom-overload", "c-focused-mind",
    "c-sl-splash", "c-sl-glob", "c-sl-spit", "c-sl-corrode", "c-sl-sticky", "c-sl-body", "c-sl-bounce",
    "c-sl-puddle", "c-sl-split", "c-sl-chainpop",
    "c-smi-wrench", "c-smi-slam", "c-smi-throw", "c-smi-scurry", "c-smi-firetrap", "c-smi-spiketrap",
    "c-smi-hook", "c-smi-shove", "c-smi-bomb",
    "c-wf-slash", "c-wf-twin", "c-wf-reach", "c-wf-edgewave", "c-wf-throw", "c-wf-afterimage",
    "c-wf-haste", "c-wf-blink", "c-wf-retreat", "c-wf-slow-cut", "c-wf-parry",
}

def header_id(header):
    m = re.search(r"\[card\.([^\]]+)\]", header or "")
    return m.group(1) if m else ""

def base_id(cid):
    return re.sub(r"-plus$", "", cid)

def rot90(p):
    x, y = p
    return (-y, x)

def four_fold(pairs, muls):
    """pairs: list[(dx,dy)], muls: list[float] aligned(부족분 1.0). 4회전 합집합(순서·강mul 보존)."""
    seen = {}
    order = []
    for i, p in enumerate(pairs):
        m = muls[i] if i < len(muls) else 1.0
        cur = p
        for _ in range(4):
            if cur not in seen:
                seen[cur] = m
                order.append(cur)
            else:
                seen[cur] = max(seen[cur], m)
            cur = rot90(cur)
    return order, [seen[c] for c in order]

def parse_pairs(val):
    out = []
    for tok in val.split("|"):
        tok = tok.strip()
        if not tok:
            continue
        a = tok.split(",")
        if len(a) != 2:
            return None
        try:
            out.append((int(a[0]), int(a[1])))
        except ValueError:
            return None
    return out

def parse_muls(val):
    out = []
    for tok in val.split(","):
        tok = tok.strip()
        if not tok:
            continue
        try:
            out.append(float(tok))
        except ValueError:
            out.append(1.0)
    return out

def fmt_mul(m):
    return str(int(m)) if float(m).is_integer() else ("%g" % m)

def split_blocks(lines):
    """[(header_or_None, [body_lines...]) ...] — 첫 [ 이전은 header=None."""
    blocks = []
    cur_header = None
    cur_body = []
    started = False
    for ln in lines:
        if ln.lstrip().startswith("[") and "]" in ln:
            if started or cur_body:
                blocks.append((cur_header, cur_body))
            cur_header = ln
            cur_body = []
            started = True
        else:
            cur_body.append(ln)
    blocks.append((cur_header, cur_body))
    return blocks

def field_value(body, key):
    pat = re.compile(r"^\s*" + re.escape(key) + r"\s*=\s*(.*?)\s*$")
    for i, ln in enumerate(body):
        m = pat.match(ln)
        if m:
            return i, m.group(1)
    return -1, None

def main():
    total_sym = 0
    total_instant = 0
    changed_files = 0
    for rel in FILES:
        if not os.path.exists(rel):
            print(f"  (없음) {rel}")
            continue
        with open(rel, "r", encoding="utf-8") as f:
            text = f.read()
        nl = "\r\n" if "\r\n" in text else "\n"
        lines = text.split(nl)
        blocks = split_blocks(lines)
        f_sym = 0
        f_inst = 0
        for bi, (header, body) in enumerate(blocks):
            if header is None:
                continue
            tm_i, tm = field_value(body, "target_mode")
            tmode = (tm or "").strip()
            if tmode in ("aimed", "throw"):
                continue
            # --- #8 4방향 대칭 ---
            sh_i, sh = field_value(body, "shape")
            if sh_i >= 0 and sh:
                pairs = parse_pairs(sh)
                if pairs:
                    pm_i, pm = field_value(body, "per_tile_mul")
                    muls = parse_muls(pm) if pm else []
                    new_pairs, new_muls = four_fold(pairs, muls)
                    if set(new_pairs) != set(pairs):
                        body[sh_i] = re.sub(r"(=\s*).*$", lambda mm: mm.group(1) + "|".join(f"{a},{b}" for a, b in new_pairs), body[sh_i])
                        # per_tile_mul: 강 칸(>1)이 있으면 전 칸 명시.
                        if any(abs(m - 1.0) > 1e-9 for m in new_muls):
                            mul_str = ",".join(fmt_mul(m) for m in new_muls)
                            if pm_i >= 0:
                                body[pm_i] = re.sub(r"(=\s*).*$", lambda mm: mm.group(1) + mul_str, body[pm_i])
                            else:
                                body.insert(sh_i + 1, f"per_tile_mul = {mul_str}")
                        f_sym += 1
            # --- #7 드로우 카드 즉시 (시작 덱 카드 + 그 -plus 강화판만 — '별도 지정' 취지) ---
            cid = base_id(header_id(header))
            ef_i, ef = field_value(body, "effects")
            inst_i, _ = field_value(body, "instant")
            if ef and inst_i < 0 and cid in STARTING_DECK_IDS:
                has_draw = any(tok.strip().split(":")[0] == "draw" for tok in ef.split(","))
                if has_draw:
                    body.insert(ef_i + 1, "instant = true")
                    f_inst += 1
            blocks[bi] = (header, body)
        if f_sym or f_inst:
            out_lines = []
            for header, body in blocks:
                if header is not None:
                    out_lines.append(header)
                out_lines.extend(body)
            with open(rel, "w", encoding="utf-8") as f:
                f.write(nl.join(out_lines))
            changed_files += 1
        print(f"  {rel}: 대칭 {f_sym}장, 즉시 {f_inst}장")
        total_sym += f_sym
        total_instant += f_inst
    print(f"\n합계: 대칭 {total_sym}장 / 즉시 {total_instant}장 / 파일 {changed_files}개")

if __name__ == "__main__":
    main()
