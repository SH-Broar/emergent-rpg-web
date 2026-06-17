import re
from collections import Counter

with open('public/data/cards/cards-mvr.txt', 'r', encoding='utf-8') as f:
    content = f.read()

sections = re.split(r'\n(?=\[card\.)', content)
cards = {}
for sec in sections:
    m = re.match(r'\[card\.([\w-]+)\]', sec)
    if m:
        cid = m.group(1)
        fields = {}
        for line in sec.split('\n'):
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, _, v = line.partition('=')
                fields[k.strip()] = v.strip()
        cards[cid] = fields

def classify(tm, sh):
    if tm == 'self':
        return 'self'
    if not sh:
        return '(shape없음-pattern오류)'
    pairs = sh.split('|')
    if len(pairs) == 1:
        return 'single(단일)'
    if sh in ('0,-1|0,-2', '0,-1|0,-2|0,-3'):
        return 'line(직선관통)'
    if '0,-1|0,1|-1,0|1,0' in sh:
        return 'cross(십자)'
    if sh in ('-1,-1|0,-1|1,-1', '0,-1|-1,0|1,0', '0,-1|-1,-1|1,-1',
              '-1,-1|0,-1|1,-1|-1,0|1,0'):
        return 'horizontal/cone'
    if len(pairs) >= 6:
        return 'aoe(광역)'
    return 'other'

dist = Counter(
    classify(f.get('target_mode', ''), f.get('shape', ''))
    for f in cards.values()
)
total = sum(dist.values())
print('=== cards-mvr.txt 최종 shape 분포 ===')
for k, v in sorted(dist.items(), key=lambda x: -x[1]):
    pct = v / total * 100
    print(f'  {k:<32}: {v:3d}장 ({pct:.0f}%)')
print(f'  총 {total}장')

# target_mode=pattern인데 shape 없는 카드 목록
errors = [(cid, f) for cid, f in cards.items()
          if f.get('target_mode') == 'pattern' and not f.get('shape')]
if errors:
    print('\n[ERROR] pattern이지만 shape 없음:')
    for cid, f in errors:
        print(f'  {cid}')
else:
    print('\n[OK] pattern 카드 전부 shape 있음')
