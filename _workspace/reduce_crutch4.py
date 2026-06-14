# -*- coding: utf-8 -*-
"""Fourth pass: thin abstract 마디, the '한 호흡 늦게' tic, doubled-자락 line, adjacent 잎새/그림자 repeats.
Keep legitimate plain-Korean 마디 (말 한 마디, 손가락 한 마디 joint) untouched.
Value side of prose keys only.
"""
import re, io

PATH = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\events\act-1-region-events.txt"
PROSE_KEYS = ("body", "result_text", "label", "name", "flavor", "description")

RULES = [
    # --- abstract/poetic 마디 -> plainer nouns ---
    ("그림자의 마디가 어깨에 단단히 닿았다.",
     "그림자가 어깨에 단단히 닿았다."),
    ("강의실의 마디가 등 뒤에서 짧게 닫혔다.",
     "강의실이 등 뒤에서 짧게 닫혔다."),
    ("두께의 마디가 손바닥에 한 자리 단단히 닿았다.",
     "두께가 손바닥에 단단히 닿았다."),
    ("빛의 온도 없는 마디가 어깨에 단정하게 닿았다.",
     "온도 없는 빛이 어깨에 단정하게 닿았다."),
    ("손바닥에 짠 마디가 한 줄 닿았다.",
     "손바닥에 짠 올이 한 줄 닿았다."),
    ("도구마다 마디가 다르게 닿았다.",
     "도구마다 손맛이 다르게 닿았다."),
    ("작은 결계가 한 마디 닿았다.",
     "작은 결계가 짧게 닿았다."),
    ("마디 한 줄이 잠시 머물렀다.",
     "온기 한 줄이 잠시 머물렀다."),
    ("시간의 마디가 누군가에 의해 길게 늘려져 있다.",
     "시간이 누군가에 의해 길게 늘려져 있다."),
    ('"...물의 틈, 따뜻한 겹, 잔의 마디 다 다르거든요." 꼬리 한 자락이 살짝 흔들린다.',
     '"...물의 온도, 잔의 두께, 손에 닿는 결 다 다르거든요." 꼬리가 살짝 흔들린다.'),
    # --- '한 호흡 늦게' tic varied ---
    ("첨탑 그림자가 한 호흡 늦게 떨어졌다.",
     "첨탑 그림자가 조금 늦게 떨어졌다."),
    ("그 이름이 옆에서 한 호흡 늦게 떠올랐다.",
     "그 이름이 옆에서 조금 늦게 떠올랐다."),
    ("표정이 한 호흡 늦게 그대를 따라온다.",
     "표정이 잠깐 늦게 그대를 따라온다."),
    ("그림자가 한 호흡 늦게 드리워 있다.",
     "그림자가 조금 늦게 드리워 있다."),
    ("종이 한 호흡 일찍 울렸다",
     "종이 살짝 일찍 울렸다"),
    ("글자가 햇살 틈에 한 호흡 머물렀다.",
     "글자가 햇살 틈에 잠시 머물렀다."),
    # --- adjacent 세계수 잎새 한 자락이 (2901/2926/2952 close) ---
    ("잎새 한 자락이 조각을 짧게 감싸 떨어진다.",
     "잎새 하나가 조각을 짧게 감싸 떨어진다."),
    ("잎새 한 자락이 바람에 길게 펄럭인다.",
     "잎새 하나가 바람에 길게 펄럭인다."),
    # --- adjacent 블룸 그림자 한 자락이 (2090/2101 close) ---
    ("발끝에 작은 그림자 한 자락이 잠시 일어났다 가라앉는다.",
     "발끝에 작은 그림자가 잠시 일어났다 가라앉는다."),
    ("자리 아래 작은 그림자 한 자락이 짧게 일어났다.",
     "자리 아래 작은 그림자가 짧게 일어났다."),
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
