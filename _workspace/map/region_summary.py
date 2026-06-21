import re, collections
txt = open('public/data/node-maps/act-1-map.txt', encoding='utf-8').read()
regs = {}
for m in re.finditer(r'\.region\.([a-z0-9-]+)\]\n(.*?)(?=\n\[|\Z)', txt, re.S):
    rid, body = m.group(1), m.group(2)
    name = re.search(r'name = (.*)', body)
    tier = re.search(r'tier = (\d+)', body)
    col = re.search(r'primary_color = (\w+)', body)
    regs[rid] = {
        'name': name.group(1).strip() if name else rid,
        'tier': tier.group(1) if tier else '?',
        'color': col.group(1) if col else '?',
        'kinds': collections.Counter(),
    }
for m in re.finditer(r'\.node\.([a-z0-9-]+)\]\n(.*?)(?=\n\[|\Z)', txt, re.S):
    body = m.group(2)
    k = re.search(r'kind = (\w+)', body)
    rg = re.search(r'region = ([a-z0-9-]+)', body)
    if k and rg and rg.group(1) in regs:
        regs[rg.group(1)]['kinds'][k.group(1)] += 1
order = sorted(regs, key=lambda r: (int(regs[r]['tier']) if regs[r]['tier'].isdigit() else 9))
print('%-16s%-2s%-9s%s' % ('region', 't', 'color', 'nodes(kind counts)'))
print('-' * 78)
for r in order:
    d = regs[r]
    kinds = ' '.join('%s:%d' % (k, c) for k, c in d['kinds'].most_common())
    tot = sum(d['kinds'].values())
    print('%-16s%-2s%-9s[%2d] %s' % (r, d['tier'], d['color'], tot, kinds))
allk = collections.Counter()
for d in regs.values():
    allk += d['kinds']
print('\n총 권역 %d / 총 노드 %d' % (len(regs), sum(allk.values())))
print('전체 kind 분포:', dict(allk))
