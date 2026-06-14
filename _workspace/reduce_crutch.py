# -*- coding: utf-8 -*-
"""Reduce poetic crutch expressions in act-1-region-events.txt.
Edits ONLY the value side of natural-language keys (body/result_text/label/name/flavor/description/choice...).
Never touches keys, ids, numbers, effects, conditions, section headers, comments.
"""
import re, sys, io

PATH = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\events\act-1-region-events.txt"

# keys whose value is natural-language prose
PROSE_KEYS = ("body", "result_text", "label", "name", "flavor", "description")

# Ordered replacement rules applied to the VALUE string only.
# These target the dominant repetitive templates. Each is a literal-or-regex pair.
# Goal: reduce frequency, vary structure, keep meaning. Not total eradication.
RULES = [
    # --- "가슴 안쪽이 한 자락 가벼워졌다" template (very repetitive) ---
    (r"가슴 안쪽이 한 자락 가벼워졌다", "가슴 안쪽이 가벼워졌다"),
    (r"가슴 안쪽이 한 자락 단단해졌다", "가슴 안쪽이 단단해졌다"),
    (r"조각이 천천히 흘러갔다", "조각이 천천히 흘러갔다"),  # noop placeholder

    # --- "X 한 자락 어깨에 길게 머물렀다 / 닿았다" template ---
    (r"햇살이 한 자락 어깨에 길게 머물렀다", "햇살이 어깨에 오래 머물렀다"),
    (r"빛이 한 자락 들어왔다", "빛이 천천히 들어왔다"),
    (r"빛이 한 자락 더 정확해졌다", "빛이 조금 더 정확해졌다"),
    (r"등대 빛이 한 자락 더 정확해졌다", "등대 빛이 조금 더 정확해졌다"),

    # --- "한 호흡" templates ---
    (r"손바닥에 한 자락 머물렀다. 짧은 한 호흡이 서늘하게 가벼웠다", "손바닥에 잠시 머물렀다. 숨이 서늘하게 가벼웠다"),
    (r"무늬의 느린 한 호흡이 손바닥에 한 자락 머물렀다", "무늬의 느린 결이 손바닥에 잠시 머물렀다"),
    (r"꽃잎 자락이 한 호흡 어깨에 머물렀다", "꽃잎이 잠시 어깨에 머물렀다"),
    (r"한 호흡 끝에 조용해졌다", "잠시 뒤 조용해졌다"),
    (r"한 호흡 끝에 깊은 한 자리가 머물렀다", "잠시 뒤 깊은 자리가 머물렀다"),
    (r"한 호흡 어지러웠다", "잠시 어지러웠다"),
    (r"꿈 한 호흡이 짧게 어지러웠다", "짧은 꿈에 잠시 어지러웠다"),
    (r"가슴 안쪽에 낯선 따뜻함이 한 자락 남았다", "가슴 안쪽에 낯선 따뜻함이 남았다"),
    (r"무엇이 한 호흡 조용해졌다", "무엇이 잠시 조용해졌다"),
    (r"머리가 한 호흡 맑아졌다", "머리가 잠시 맑아졌다"),
    (r"식물이 짧은 한 호흡만큼 길어졌다", "식물이 잠깐 사이에 길어졌다"),
    (r"고양이가 짧은 한 호흡만큼 눈을 떴다", "고양이가 잠깐 눈을 떴다"),
    (r"노인은 짧은 한 호흡만큼 깊이 자고 있다", "노인은 잠깐 사이에도 깊이 자고 있다"),
    (r"한 호흡이 한 자루만큼 길어졌다", "숨이 한 자루만큼 길어졌다"),
    (r"타르코의 짧은 한 마디가 한 호흡씩 이어졌다", "타르코의 짧은 말이 띄엄띄엄 이어졌다"),

    # --- generic "한 자락 가벼워졌다 / 단단해졌다" (without 가슴) ---
    (r"한 자락 가벼워졌다", "조금 가벼워졌다"),
    (r"한 자락 단단해졌다", "조금 단단해졌다"),
]

def transform_value(val):
    out = val
    for pat, rep in RULES:
        out = re.sub(pat, rep, out)
    return out

def main():
    with io.open(PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()
    changed = 0
    for i, line in enumerate(lines):
        # skip comments and section headers
        stripped = line.lstrip()
        if stripped.startswith("#") or stripped.startswith("["):
            continue
        m = re.match(r"^(\s*)([A-Za-z0-9_]+)(\s*=\s*)(.*)$", line.rstrip("\n"))
        if not m:
            continue
        indent, key, eq, val = m.groups()
        # only prose keys (choice labels are 'label', results are 'result_text')
        if key not in PROSE_KEYS:
            continue
        newval = transform_value(val)
        if newval != val:
            # safety: no # or ; introduced (we never add them, but assert)
            assert "#" not in newval and ";" not in newval, line
            lines[i] = f"{indent}{key}{eq}{newval}\n"
            changed += 1
    with io.open(PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("changed lines:", changed)

if __name__ == "__main__":
    main()
