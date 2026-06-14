# -*- coding: utf-8 -*-
"""Analyze act-1-region-events.txt choices: classify upside/negatives/custom/hidden.
Read-only. Prints a report so we can design the mutation rules with eyes open."""
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\events\act-1-region-events.txt"

with open(PATH, encoding='utf-8') as f:
    lines = f.read().split('\n')

# Parse into blocks keyed by section header.
sections = []  # list of (header, dict-of-key->value, start_idx, end_idx)
cur = None
for i, ln in enumerate(lines):
    m = re.match(r'^\[(.+)\]\s*$', ln)
    if m:
        if cur: sections.append(cur)
        cur = {'header': m.group(1), 'kv': {}, 'start': i}
    elif cur is not None:
        km = re.match(r'^([a-z_]+)\s*=\s*(.*)$', ln)
        if km:
            cur['kv'].setdefault(km.group(1), []).append(km.group(2))
if cur: sections.append(cur)

choices = [s for s in sections if '.choice.' in s['header']]
events  = [s for s in sections if '.choice.' not in s['header'] and s['header'].startswith('event.')]

print(f"events={len(events)} choices={len(choices)}")

POSITIVE_KEYS = {'grant_card','grant_relic','card','color','affinity','clue','draw','time_shards'}
# custom values that are an upside:
CUSTOM_UPSIDE = lambda v: True  # all current customs are upsides (push/grant/heal/time/color-1)

def classify(s):
    kv = s['kv']
    has_neg = False
    neg_detail = []
    for k in ('hp','gold'):
        for v in kv.get(k, []):
            try:
                n = int(v)
            except: continue
            if n < 0:
                has_neg = True; neg_detail.append(f"{k}{n}")
    upside = []
    for k in ('hp','gold'):
        for v in kv.get(k, []):
            try:
                if int(v) > 0: upside.append(f"{k}+{v}")
            except: pass
    for k in POSITIVE_KEYS:
        for v in kv.get(k, []):
            upside.append(f"{k}={v}")
    for v in kv.get('custom', []):
        upside.append(f"custom={v}")
    return has_neg, neg_detail, upside

# Negatives without upside
print("\n=== NEGATIVE CHOICES WITHOUT UPSIDE (pure loss) ===")
pure_loss = []
for s in choices:
    has_neg, neg, up = classify(s)
    if has_neg and not up:
        pure_loss.append(s)
        print(f"L{s['start']+1} {s['header']}  NEG={neg}")
print(f"-> {len(pure_loss)} pure-loss choices")

# Negatives WITH upside (already balanced) - count only
bal = sum(1 for s in choices if classify(s)[0] and classify(s)[2])
print(f"\nnegatives WITH upside (already ok)={bal}")

# custom color-1 inventory
print("\n=== custom *-color-1 (weak +1, to upgrade) ===")
weak = [s for s in choices if any(v.endswith('-color-1') for v in s['kv'].get('custom',[]))]
print(f"weak color-1 count={len(weak)}")

# choices with literally only draw=1 (weak filler reward)
print("\n=== choices with ONLY draw (no other effect) ===")
onlydraw = []
for s in choices:
    kv = s['kv']
    eff = {k:v for k,v in kv.items() if k not in ('label','result_text','condition')}
    if list(eff.keys()) == ['draw']:
        onlydraw.append(s)
print(f"only-draw count={len(onlydraw)}")

# choices with literally only small gold or hp positive (weak reward, <=5)
print("\n=== weak-only rewards (single hp<=5 or gold<=5, nothing else) ===")
weakonly = []
for s in choices:
    kv = s['kv']
    eff = {k:v for k,v in kv.items() if k not in ('label','result_text','condition')}
    keys = list(eff.keys())
    if keys == ['gold']:
        try:
            if int(eff['gold'][0]) > 0 and int(eff['gold'][0]) <= 5: weakonly.append((s,'gold'))
        except: pass
    if keys == ['hp']:
        try:
            if int(eff['hp'][0]) > 0 and int(eff['hp'][0]) <= 5: weakonly.append((s,'hp'))
        except: pass
print(f"weak-only count={len(weakonly)}")

# Hidden currently
print("\n=== hidden currently ===")
hid = [s for s in choices if s['kv'].get('hidden',['false'])[0]=='true']
print(f"hidden count={len(hid)}")
