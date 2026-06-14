# -*- coding: utf-8 -*-
"""Second pass: reduce '한 자락' density with context-safe, meaning-preserving swaps.
Value side of prose keys only.
"""
import re, io

PATH = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\events\act-1-region-events.txt"
PROSE_KEYS = ("body", "result_text", "label", "name", "flavor", "description")

RULES = [
    # leaf as a flat object -> natural counter
    (r"잎 한 자락을 짧게 만져 본다", "잎 한 장을 짧게 만져 본다"),
    (r"잎 한 자락을 샘 옆에 놓아 본다", "잎 한 장을 샘 옆에 놓아 본다"),
    (r"잎 한 자락을 짧게 굴려", "잎 한 장을 짧게 굴려"),
    (r"잎 한 자락의 자락을 짚는다", "잎 한 장의 결을 짚는다"),
    (r"낯선 잎 한 자락\.", "낯선 잎 한 장."),
    (r"작은 잎 한 자락을", "작은 잎 한 장을"),
    # water as small quantity
    (r"물 한 자락을 작게 튀겼다", "물을 작게 튀겼다"),
    (r"물 한 자락을 그대 어깨에 끼얹어", "물을 그대 어깨에 끼얹어"),
    (r"작은 물 한 자락을 흘려 본다", "작은 물줄기를 흘려 본다"),
    (r"물의 한 자락을 빌린다", "물줄기를 빌린다"),
    (r"맑은 한 자락이 어깨에 길게 닿았다", "맑은 기운이 어깨에 길게 닿았다"),
    # light/neon dripping -> 조금씩
    (r"빛이 한 자락씩 떨어진다", "빛이 조금씩 떨어진다"),
    (r"빛이 한 자락씩 정확히 흐른다", "빛이 조금씩 정확히 흐른다"),
    (r"광이 한 자락씩 깊어진다", "광이 조금씩 깊어진다"),
    (r"불그스름한 실이 한 줄로", "불그스름한 실이 한 줄로"),  # noop
    # "한 자락 더" -> 조금 더
    (r"한 자락 더 정확해졌다", "조금 더 정확해졌다"),
    (r"세계수가 한 자락 더 자란대요", "세계수가 조금 더 자란대요"),
    (r"페비엘이 한 자락 더 비켰다", "페비엘이 조금 더 비켰다"),
    # "한 자락 늦게/늦은" -> 조금 늦게/늦은
    (r"등대 한 자락 늦게 빛난다", "등대가 조금 늦게 빛난다"),
    (r"한 자락 늦은 빛", "조금 늦은 빛"),
    # press/lay
    (r"열기가 살을 한 자락 누른다", "열기가 살을 무겁게 누른다"),
    (r"밤이 한 자락 길게 흘렀다", "밤이 길게 흘렀다"),
    (r"이야기가 한 자락 지나갔다", "이야기가 잠시 지나갔다"),
    # smile/help as small action
    (r"칼리번이 한 자락 웃었다", "칼리번이 짧게 웃었다"),
    (r"흥정을 한 자락 건다", "흥정을 한 번 건다"),
    (r"작업을 한 자락 돕는다", "작업을 잠깐 돕는다"),
    (r"실 엮는 일을 한 자락 돕는다", "실 엮는 일을 잠깐 돕는다"),
    (r"흔적을 한 자락 긁어 챙긴다", "흔적을 조금 긁어 챙긴다"),
    (r"안료 흔적을 한 자락 긁어", "안료 흔적을 조금 긁어"),
    (r"리포가 곁에 와 한 자락씩 짚어 준다", "리포가 곁에 와 하나씩 짚어 준다"),
    # cloth/coat draping
    (r"외투를 한 자락 늘어뜨린", "외투를 길게 늘어뜨린"),
    (r"예복을 한 자락 걸친", "예복을 느슨하게 걸친"),
    (r"꼬리를 한 자락 똬리로 말고", "꼬리를 똬리로 말고"),
    (r"푸른 꼬리를 한 자락 늘어뜨린", "푸른 꼬리를 길게 늘어뜨린"),
    (r"깃을 한 자락 접었다", "깃을 짧게 접었다"),
    # spark/sound
    (r"윙소리 한 자락이 길게 머문다", "윙소리가 길게 머문다"),
    (r"물소리가 한 자락 그의 어깨에 길게 머문다", "물소리가 그의 어깨에 길게 머문다"),
    # misc closers piling up
    (r"가슴 안쪽이 한 자락 가벼워졌다", "가슴 안쪽이 가벼워졌다"),
    (r"가슴 안쪽이 한 자락 단단해졌다", "가슴 안쪽이 단단해졌다"),
    (r"조각이 한 자락 가벼워졌다", "조각이 조금 가벼워졌다"),
]

def main():
    with io.open(PATH, "r", encoding="utf-8") as f:
        lines = f.readlines()
    changed = 0
    for i, line in enumerate(lines):
        s = line.lstrip()
        if s.startswith("#") or s.startswith("["):
            continue
        m = re.match(r"^(\s*)([A-Za-z0-9_]+)(\s*=\s*)(.*)$", line.rstrip("\n"))
        if not m:
            continue
        indent, key, eq, val = m.groups()
        if key not in PROSE_KEYS:
            continue
        nv = val
        for pat, rep in RULES:
            nv = re.sub(pat, rep, nv)
        if nv != val:
            assert "#" not in nv and ";" not in nv, line
            lines[i] = f"{indent}{key}{eq}{nv}\n"
            changed += 1
    with io.open(PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("changed lines:", changed)

if __name__ == "__main__":
    main()
