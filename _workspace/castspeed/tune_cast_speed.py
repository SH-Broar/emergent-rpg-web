#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
카드 cast_speed 튜닝 — public/data/cards/*.txt 전체.

규칙:
  - block 효과만 있고 공격 없음          -> fast
  - 공격 + 방어 둘 다(공방일체)          -> normal | slow (강한 효과일수록 slow)
  - 순수 공격/기타                        -> normal (미설정=normal이라 명시 안 함; 기존 cast_speed가 있고
                                            normal이면 유지, fast/slow면 normal로 교정)
  - instant 카드는 계획(plan)에 안 들어가 정렬과 무관 -> 건드리지 않음(건너뜀).

DRY=1 이면 변경 미적용, 리포트만.
"""
import os, re, sys

CARDS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'cards')
CARDS_DIR = os.path.normpath(CARDS_DIR)
DRY = os.environ.get('DRY', '0') == '1'

# 데미지(공격)를 내는 effect kind.
DAMAGE_KINDS = {
    'damage', 'damage-min-color', 'damage-top-color', 'damage-color-count',
    'damage-per-debuff', 'consume-vulnerable', 'damage-from-hp', 'damage-per-hand',
    'damage-per-confine', 'block-to-damage', 'adaptive-strike', 'spend-all-energy',
    'damage-per-companion', 'damage-per-relic', 'growing-damage', 'heavy-blade',
    'damage-per-cards-played', 'delayed-damage', 'chain-explosion', 'consume-burn',
    'consume-poison', 'amplify-debuff',
}
# 방어(block)를 내는 effect kind.
BLOCK_KINDS = {
    'block', 'growing-block', 'block-top-color', 'double-block', 'metallicize',
}

# 강한 공방일체 = slow. (rank rare/legendary/boss) 또는 (damage값+block값 합 >= 24)
HEAVY_RANKS = {'rare', 'legendary', 'boss'}
HEAVY_HYBRID_SUM = 24


def parse_effects(line):
    """'effects = a:b:c, d:e' -> [(kind, first_numeric_value_or_None), ...]"""
    body = line.split('=', 1)[1].strip()
    out = []
    if not body:
        return out
    for tok in body.split(','):
        tok = tok.strip()
        if not tok:
            continue
        parts = tok.split(':')
        kind = parts[0].strip()
        val = None
        if len(parts) > 1:
            m = re.match(r'^-?\d+(\.\d+)?$', parts[1].strip())
            if m:
                val = abs(float(parts[1].strip()))
        out.append((kind, val))
    return out


def classify(effects, rank):
    kinds = [k for k, _ in effects]
    has_dmg = any(k in DAMAGE_KINDS for k in kinds)
    has_block = any(k in BLOCK_KINDS for k in kinds)

    if has_block and not has_dmg:
        return 'fast', 'block-only'
    if has_block and has_dmg:
        dmg_sum = sum(v or 0 for k, v in effects if k in DAMAGE_KINDS)
        blk_sum = sum(v or 0 for k, v in effects if k in BLOCK_KINDS)
        heavy = (rank in HEAVY_RANKS) or ((dmg_sum + blk_sum) >= HEAVY_HYBRID_SUM)
        return ('slow' if heavy else 'normal'), 'hybrid-' + ('slow' if heavy else 'normal')
    # 순수 공격/기타 -> normal
    return 'normal', 'other'


def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # 카드 블록 단위로 스캔. 블록 경계 = [card.xxx]
    blocks = []  # (start_idx, end_idx_exclusive)
    idxs = [i for i, l in enumerate(lines) if l.startswith('[card.')]
    for n, s in enumerate(idxs):
        e = idxs[n + 1] if n + 1 < len(idxs) else len(lines)
        blocks.append((s, e))

    changes = []  # (cardid, old, new, reason)
    new_lines = lines[:]
    ops = []  # (global_idx, mode 'replace'|'insert_after', text) — 적용은 *내림차순* 위치로.

    for (s, e) in blocks:
        block = lines[s:e]
        cardid = block[0].strip().lstrip('[').rstrip(']\n')
        rank = None
        eff_line_local = None
        cs_line_local = None
        instant = False
        for li, l in enumerate(block):
            st = l.strip()
            if st.startswith('rank') and '=' in st:
                rank = st.split('=', 1)[1].strip()
            elif st.startswith('effects') and '=' in st and eff_line_local is None:
                eff_line_local = li
            elif st.startswith('cast_speed') and '=' in st:
                cs_line_local = li
            elif st.startswith('instant') and '=' in st:
                if st.split('=', 1)[1].strip().lower() == 'true':
                    instant = True

        if instant:
            continue  # 정렬 무관 — 건너뜀.
        if eff_line_local is None:
            continue  # effects 없는 카드(상처 등) — 건너뜀.

        effects = parse_effects(block[eff_line_local])
        if not effects:
            continue  # 빈 effects(상처) — 건너뜀.

        target, reason = classify(effects, rank or '')
        cur = None
        if cs_line_local is not None:
            cur = block[cs_line_local].split('=', 1)[1].strip()

        # 순수 공격/기타("other") = 규칙이 *기본 normal*만 규정 — 명시 불필요(미설정=normal).
        #   기존 authored fast/slow(빠른 기본타격·느린 대형타격 등)는 *디자인 의도*라 건드리지 않는다.
        #   따라서 block-only / hybrid만 규칙대로 세팅·교정한다.
        if reason == 'other':
            continue
        if cur == target:
            continue  # 이미 일치.

        changes.append((cardid, cur, target, reason))
        new_cs_line = f'cast_speed = {target}\n'
        if cs_line_local is not None:
            ops.append((s + cs_line_local, 'replace', new_cs_line))
        else:
            # cast_speed 없는 카드 -> effects 라인 *바로 다음*에 삽입.
            ops.append((s + eff_line_local, 'insert_after', new_cs_line))

    # *내림차순* 위치로 적용 — 삽입이 앞쪽(미처리) 인덱스를 흔들지 않게.
    if not DRY:
        for (idx, mode, text) in sorted(ops, key=lambda o: o[0], reverse=True):
            if mode == 'replace':
                new_lines[idx] = text
            else:
                new_lines.insert(idx + 1, text)
        if changes:
            with open(path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)

    return changes


def main():
    files = sorted(f for f in os.listdir(CARDS_DIR) if f.endswith('.txt'))
    total = {'fast': 0, 'normal': 0, 'slow': 0}
    all_changes = []
    for fn in files:
        path = os.path.join(CARDS_DIR, fn)
        ch = process_file(path)
        for (cid, old, new, reason) in ch:
            total[new] += 1
            all_changes.append((fn, cid, old, new, reason))

    print(f"{'DRY-RUN' if DRY else 'APPLIED'} — {len(all_changes)} card changes")
    print(f"  -> fast={total['fast']}  normal={total['normal']}  slow={total['slow']}")
    print()
    for (fn, cid, old, new, reason) in all_changes:
        print(f"  [{fn}] {cid}: {old or '(unset)'} -> {new}   ({reason})")


if __name__ == '__main__':
    main()
