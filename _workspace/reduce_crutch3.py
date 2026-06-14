# -*- coding: utf-8 -*-
"""Third pass: vary the repeated '한 자락이 어깨에 닿았다' closer tic and other piles.
Value side of prose keys only. Literal full-string replacements where possible.
"""
import re, io

PATH = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\events\act-1-region-events.txt"
PROSE_KEYS = ("body", "result_text", "label", "name", "flavor", "description")

# (search, replace) literal substrings applied to value only
RULES = [
    ("짧은 한 자락이 손바닥에 머물렀다. 낯익은 글자 한 줄.",
     "짧은 빛이 손바닥에 머물렀다. 낯익은 글자 한 줄."),
    ("손바닥에 서늘한 잎새 한 자락이 닿았다.",
     "손바닥에 서늘한 잎새 한 장이 닿았다."),
    ("잎새 사이에서 짧고 단정한 빛 한 자락이 어깨에 닿았다.",
     "잎새 사이에서 짧고 단정한 빛이 어깨에 닿았다."),
    ("누군가의 짧은 답 한 자락이 어깨에 닿았다.",
     "누군가의 짧은 답이 어깨에 닿았다."),
    ("잎새 사이로 짧고 단정한 한 자락이 어깨에 닿았다.",
     "잎새 사이로 짧고 단정한 빛이 어깨에 닿았다."),
    ("그녀의 짧고 단정한 한 자락이 어깨에 닿았다.",
     "그녀의 짧고 단정한 목소리가 어깨에 닿았다."),
    ("새끼가 따뜻한 한 자락으로 손바닥에 머물렀다.",
     "새끼가 따뜻하게 손바닥에 머물렀다."),
    ("어깨에 서늘한 한 자락이 닿았다.",
     "어깨에 서늘한 기운이 닿았다."),
    # '두 사람의 짧은 한 자락' (오두막 마당 chain, repeated 3x)
    ("두 사람의 짧은 한 자락이 잎새 사이로 단정하게 흘렀다.",
     "두 사람의 짧은 인사가 잎새 사이로 단정하게 흘렀다."),
    ("두 사람의 짧은 한 자락이 마당에 떨어졌다.",
     "두 사람의 짧은 인사가 마당에 떨어졌다."),
    ("두 사람의 짧은 한 자락이 마당에 단정하게 머물렀다.",
     "두 사람의 짧은 인사가 마당에 단정하게 머물렀다."),
    # '한 자락이 길게 머문다' (body atmosphere)
    ("노을 한 자락이 길게 머문다.", "노을이 길게 머문다."),
    ("조용한 한 자락이 길게 머문다.", "조용함이 길게 머문다."),
    ("빈 방의 햇살이 등 뒤로 한 자락 길게 흘렀다.",
     "빈 방의 햇살이 등 뒤로 길게 흘렀다."),
    # 자락 doubled / awkward lines
    ("노바의 자락 한 자락이 부스 한 자리에 남아 있다.",
     "노바의 흔적이 부스 한 자리에 남아 있다."),
    ("틈 한 자락을 손끝으로 짚는다", "틈을 손끝으로 짚는다"),
    ("한 음 한 자락이 손바닥에 잠시 머물렀다.",
     "한 음이 손바닥에 잠시 머물렀다."),
    ("마지막 한 자락만 남았다", "마지막 한 소절만 남았다"),
    ("빛 한 자락을 어깨로 받는다", "빛을 어깨로 받는다"),
    ("빛 한 자락과 어둠 한 자락이 발끝에서 두 겹으로 갈라진다.",
     "빛과 어둠이 발끝에서 두 갈래로 갈라진다."),
    ("골목 끝에서 네온 한 자락이 어깨를 다시 받았다.",
     "골목 끝에서 네온이 어깨를 다시 받았다."),
    ("네온 한 자락을 내려다 본다", "네온을 내려다 본다"),
    ("타코미의 네온 한 자락이 작게 보인다.",
     "타코미의 네온이 작게 보인다."),
    ("네온 한 자락이 한꺼번에 일렁인다.",
     "네온이 한꺼번에 일렁인다."),
    # 안개/구름
    ("안개 한 자락이 어깨를 짧게 스쳤다 흩어졌다.",
     "안개가 어깨를 짧게 스쳤다 흩어졌다."),
    ("안개 한 자락이 비스듬히 흐른다.",
     "안개가 비스듬히 흐른다."),
    ("구름 한 자락이 내일의 모양을 짧게 보여 주는 듯했다.",
     "구름이 내일의 모양을 짧게 보여 주는 듯했다."),
    ("구름 한 자락 그림이 그려져 있다.",
     "구름 그림이 그려져 있다."),
    ("새 한 마리, 구름 한 자락, 별 한 점",
     "새 한 마리, 구름 한 점, 별 한 점"),
    # 불꽃/불씨 trifllower
    ("불꽃 한 자락이 짧게 흩어졌다.",
     "불꽃이 짧게 흩어졌다."),
    ("능선 너머의 불꽃 한 자락이 어깨에 짧게 닿았다.",
     "능선 너머의 불꽃이 어깨에 짧게 닿았다."),
    ("작은 어깨 한 자락에 짧고 단정한 불꽃 한 줄이 올라 있다.",
     "작은 어깨에 짧고 단정한 불꽃 한 줄이 올라 있다."),
    ("작은 불씨 한 자락이 한 자리 떨어진다.",
     "작은 불씨 하나가 천천히 떨어진다."),
    # misc
    ("물 위에 맑은 한 자락이 어깨에 길게 닿았다.",
     "물 위의 맑은 기운이 어깨에 길게 닿았다."),
    ("작은 광맥 한 자락이 발끝에 짧게 빛났다.",
     "작은 광맥 한 줄기가 발끝에 짧게 빛났다."),
    ("정수 한 자락을 만진다", "정수를 만진다"),
    ("우유 한 자락을 그릇에 따른다", "우유를 그릇에 따른다"),
    ("작은 우유 한 자락을 그릇에 따른다", "작은 우유를 그릇에 따른다"),
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
