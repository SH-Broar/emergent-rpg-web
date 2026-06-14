# -*- coding: utf-8 -*-
"""Fifth pass: thin 박자 cluster (마노니클라/로크), remaining piled 겹/틈/자락 in blossom cluster.
Value side of prose keys only. No banned words introduced (no 박자/한 박/결).
"""
import re, io

PATH = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\events\act-1-region-events.txt"
PROSE_KEYS = ("body", "result_text", "label", "name", "flavor", "description")

RULES = [
    # --- 박자 cluster -> 리듬/걸음/장단 (plain) ---
    ('라고 했지만 박자가 한 번 늦었다.',
     '라고 했지만 대답이 한 번 늦었다.'),
    ('소문은 자기 박자로 흘러갔다.',
     '소문은 자기 속도로 흘러갔다.'),
    ('카요가 모루 박자를 한 번 멈췄다.',
     '카요가 모루질을 한 번 멈췄다.'),
    ('박자가 익숙해질 때까지 옆을 지킨다',
     '걸음이 익숙해질 때까지 옆을 지킨다'),
    ('돌 손발의 박자가 마노니클라의 길에 조금씩 맞춰졌다.',
     '돌 손발의 걸음이 마노니클라의 길에 조금씩 맞춰졌다.'),
    ('조각의 박자대로 한 자리에 앉는다',
     '조각의 흐름대로 한 자리에 앉는다'),
    # --- blossom cluster piled 자락/겹/틈 ---
    ('자세히 보면 낯선 틈 한 자락이 길 옆에 머문다.',
     '자세히 보면 낯선 틈이 길 옆에 머문다.'),
    ('꽃잎 틈이 어깨 한 자락에 머물렀다.',
     '꽃잎 틈이 어깨에 잠시 머물렀다.'),
    ('다른 길에 낯선 겹이 한 자락 머물렀다.',
     '다른 길에 낯선 무늬가 잠시 머물렀다.'),
    ('한 줄에 옛 마법의 자락이 한 틈 있었다.',
     '한 줄에 옛 마법의 흔적이 짧게 있었다.'),
    # --- remaining abstract 자락 piles ---
    ('흐름 한 자락에 잠시 끼어 본다',
     '흐름에 잠시 끼어 본다'),
    ('행상의 외침 한 자락,',
     '행상의 외침,'),
    ('증기 한 자락,',
     '증기,'),
    ('손바닥에 한 자락 머물렀다.',
     '손바닥에 잠시 머물렀다.'),
    ('얇은 한 자락이 어깨에 가볍게 둘러졌다.',
     '얇은 천이 어깨에 가볍게 둘러졌다.'),
    ('얇은 한 자락이', '얇은 천이'),
    ('비늘 한 자락의 켜를 묻는다', '비늘의 켜를 묻는다'),
    ('한 자락 천 끝을 잡아 준다', '천 끝을 잡아 준다'),
    ('손목 가리개 한 자리가 깊은 자락으로 바뀌었다.',
     '손목 가리개가 깊은 광으로 바뀌었다.'),
    ('옷감 한 자락이 한 줄씩 길어진다.',
     '옷감이 한 줄씩 길어진다.'),
    ('옷감 한 자락을 부탁한다', '옷감 한 필을 부탁한다'),
    ('정문의 한 자락', '정문의 한 자리'),
    ('동문의 한 자락', '동문의 한 자리'),
    # --- '한 호흡 사이' name/body (절벽 바람) keep one, thin label ---
    ('환영의 늦은 한 호흡을 같이 맞춰 본다',
     '환영의 늦은 숨을 같이 맞춰 본다'),
    ('그림자의 늦은 한 호흡을 같이 맞춰 본다',
     '그림자의 늦은 숨을 같이 맞춰 본다'),
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
        for a, b in RULES:
            nv = nv.replace(a, b)
        if nv != val:
            assert "#" not in nv and ";" not in nv, line
            lines[i] = f"{indent}{key}{eq}{nv}\n"
            changed += 1
    with io.open(PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("changed lines:", changed)

if __name__ == "__main__":
    main()
