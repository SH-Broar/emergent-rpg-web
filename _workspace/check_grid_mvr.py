import re

with open("public/data/cards/cards-mvr.txt", "r", encoding="utf-8") as f:
    content = f.read()

check_ids = [
    "c-falcon-skydive", "c-flame-web", "c-alti-resonance",
    "c-overdraw-burst", "c-spectrum-edge", "c-doom-mark",
    "c-tacomi-hologram-mirror", "c-shop-wall", "c-mounting-storm",
    "c-trade-coil", "c-transcend-strike", "c-burn-mark",
    "c-wild-rush", "c-phase-out", "c-gentle-mend",
]

sections = re.split(r'\n(?=\[card\.)', content)
cards = {}
for sec in sections:
    m = re.match(r'\[card\.([\w-]+)\]', sec)
    if m:
        card_id = m.group(1)
        fields = {}
        for line in sec.split('\n'):
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, _, v = line.partition('=')
                fields[k.strip()] = v.strip()
        cards[card_id] = fields

for cid in check_ids:
    if cid in cards:
        f = cards[cid]
        print(f"[{cid}]")
        print(f"  target_mode  = {f.get('target_mode','')}")
        print(f"  shape        = {f.get('shape','(없음)')}")
        print(f"  per_tile_mul = {f.get('per_tile_mul','(없음)')}")
        print(f"  cast_speed   = {f.get('cast_speed','')}")
    else:
        print(f"[{cid}] NOT FOUND")

# ; 포함 여부 검사 (파서가 주석으로 자름)
semicolon_issues = []
for cid, f in cards.items():
    sh = f.get('shape', '')
    if ';' in sh:
        semicolon_issues.append((cid, sh))

if semicolon_issues:
    print("\n[ERROR] shape에 ';' 포함된 카드:")
    for cid, sh in semicolon_issues:
        print(f"  {cid}: {sh}")
else:
    print("\n[OK] shape에 ';' 없음")
