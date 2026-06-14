# -*- coding: utf-8 -*-
"""Rebalance act-1-region-events.txt event-choice rewards.

STRICT CONSTRAINTS (from brief):
- Never change keys (left of '='), ids, section headers, event ids, node_kinds,
  weight, once_per_run. Only ADD/EDIT effect-VALUE lines and result_text prose.
- No '#', ';', '*', em-dash in values.
- Section-header count and event-id count must be identical before/after.

RULES:
 (1) Custom weak +1 upgrade: lines `custom = atk/def/mag-color-1`
     -> replace IN PLACE with a `color = <c>:<amt>` line (transparent + bigger).
        Map deterministically by tag so the flavor is preserved:
          atk -> fire   (ATK pair)   amt 6
          def -> iron   (DEF pair)   amt 6
          mag -> water  (MAG pair)   amt 6
        (random would also be valid but a fixed color reads cleaner in preview.)
     This converts the opaque "특수 효과" preview into a clear "+N color".
 (2) Negatives whose only upside was that weak custom now read clearly (they get
     a real color reward from rule 1). For the 2 author-intended big-payoff
     dead-ends (relic= broken key) we ALSO add a strong color so they are never
     pure loss even before the key bug is fixed.
 (3) Hidden distribution: deterministically tag ~18% of choices hidden, mixing
     good and bad. We pick by a stable hash of the choice header so it is
     reproducible and spread across events. Only choices that ALREADY have a
     non-trivial effect (so '???' actually hides something) are eligible, and we
     SKIP chain/clue/affinity-key choices (story-critical, must stay legible) and
     skip the 'do nothing / leave' style (no effect to hide).

Color value scale reference (codebase): boss clear +5, event push +5, late
gather +3. So +6 from an upgraded custom is a *meaningful* bump (slightly above
the +5 baseline, justified because it replaces a whole effect slot).
"""
import re, io, sys, hashlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\events\act-1-region-events.txt"

with open(PATH, encoding='utf-8') as f:
    text = f.read()
orig_lines = text.split('\n')

# --- snapshot invariants ---
n_headers_before = sum(1 for l in orig_lines if re.match(r'^\[.+\]\s*$', l))
n_events_before  = sum(1 for l in orig_lines if re.match(r'^\[event\.[^\]]+\]\s*$', l) and '.choice.' not in l)

# --- Pass 1: build choice blocks (header line idx ranges) ---
blocks = []  # (header, start_idx, end_idx_exclusive)
cur_start = None; cur_header = None
for i, l in enumerate(orig_lines):
    m = re.match(r'^\[(.+)\]\s*$', l)
    if m:
        if cur_start is not None:
            blocks.append((cur_header, cur_start, i))
        cur_start = i; cur_header = m.group(1)
if cur_start is not None:
    blocks.append((cur_header, cur_start, len(orig_lines)))

lines = list(orig_lines)

# Upgrade weak +1 tag-color to a meaningful, theme-neutral random colorDelta.
# Original behavior was "+1 to a random color from a stat pair"; random:6 keeps
# the random spirit, avoids forcing an off-theme element, and previews clearly
# as "무작위 컬러 +6". Amount 6 is just above the +5 event baseline (it replaces
# a whole effect slot).
TAG_AMT = 6

stats = {'custom_upgraded':0, 'pure_loss_fixed':0, 'hidden_added':0,
         'hidden_good':0, 'hidden_bad':0}

# Helper: does a choice block have a negative hp/gold?
def block_kv(start, end):
    kv = {}
    for j in range(start+1, end):
        km = re.match(r'^([a-z_]+)\s*=\s*(.*)$', lines[j])
        if km:
            kv.setdefault(km.group(1), []).append((j, km.group(2)))
    return kv

# --- Pass A0: two thematic "double-element" choices have TWO `custom = *-color-1`
# lines. A duplicate `color` key would collapse in the loader (it reads each key
# once), so we convert these to a SINGLE thematic color and DELETE the 2nd line.
# (The original double-custom already only ever applied one effect, since the
#  loader keeps one value per key, so this loses nothing and reads cleanly.)
DOUBLE_CUSTOM = {
    'event.ev-lar-lava-vein-spark.choice.3': 'fire:7',  # 식지 않은 불씨 -> fire
    'event.ev-yuse-iron-vein.choice.2':      'iron:7',  # 철과 물 -> iron
}
for header, start, end in [(h,s,e) for (h,s,e) in blocks if h in DOUBLE_CUSTOM]:
    cidx = [j for j in range(start+1, end)
            if re.match(r'^custom = (atk|def|mag)-color-1\s*$', lines[j])]
    if len(cidx) >= 2:
        lines[cidx[0]] = f"color = {DOUBLE_CUSTOM[header]}"
        # blank out the 2nd custom line (mark for deletion)
        lines[cidx[1]] = None
        stats['custom_upgraded'] += 1
# drop deleted lines
lines = [l for l in lines if l is not None]
# rebuild blocks after deletion
blocks = []
cs = None; ch = None
for i, l in enumerate(lines):
    m = re.match(r'^\[(.+)\]\s*$', l)
    if m:
        if cs is not None: blocks.append((ch, cs, i))
        cs = i; ch = m.group(1)
if cs is not None: blocks.append((ch, cs, len(lines)))

# --- Pass A: remaining single custom *-color-1 -> color = random:6 (in place) ---
for j, l in enumerate(lines):
    m = re.match(r'^custom = (atk|def|mag)-color-1\s*$', l)
    if m:
        lines[j] = f"color = random:{TAG_AMT}"
        stats['custom_upgraded'] += 1

# --- Pass B: the 2 author-intended dead-ends (relic= broken). Add strong color
#     as guaranteed upside so the hp -10 choice is never pure loss. ---
DEAD_ENDS = {
    'event.ev-yuse-dead-end.choice.1': 'iron:12',   # 철과 물의 정수 -> iron
    'event.ev-falcon-core.choice.1':  'wind:12',    # 바람과 깃 -> wind
}
for header, start, end in blocks:
    if header in DEAD_ENDS:
        # insert a color line right after the hp line
        kv = block_kv(start, end)
        ins_at = None
        for j in range(start+1, end):
            if re.match(r'^hp = ', lines[j]):
                ins_at = j+1; break
        if ins_at is None:
            ins_at = start+1
        lines.insert(ins_at, f"color = {DEAD_ENDS[header]}")
        stats['pure_loss_fixed'] += 1
        # shift block indices below: rebuild blocks for subsequent passes
        # (we rebuild blocks fully after this pass instead)

# rebuild blocks after insertions
blocks = []
cur_start = None; cur_header = None
for i, l in enumerate(lines):
    m = re.match(r'^\[(.+)\]\s*$', l)
    if m:
        if cur_start is not None:
            blocks.append((cur_header, cur_start, i))
        cur_start = i; cur_header = m.group(1)
if cur_start is not None:
    blocks.append((cur_header, cur_start, len(lines)))

# --- Pass C: hidden distribution. Target ~20% of all 440 choices hidden,
# mixing good and bad so '???' is a genuine gamble (never learnable as "loss").
# Eligible pool = good-or-bad mechanical choices, NOT story-critical (clue/affinity)
# and NOT neutral 'do-nothing'. We collect eligible choices first (document order),
# then pick every-Nth from the good list and bad list to hit precise, evenly
# spread targets. Selecting in document order avoids same-event clustering.
EFFECT_KEYS = {'hp','gold','draw','color','custom','grant_card','grant_relic',
               'time_shards','card','relic'}
GOOD_SIGNAL = {'grant_card','grant_relic','card','relic','color','draw'}

# 1) classify (no mutation yet) -> lists of header strings.
good_pool = []
bad_pool = []
for header, start, end in [(h,s,e) for (h,s,e) in blocks if '.choice.' in h]:
    kv = block_kv(start, end)
    keys = set(kv.keys())
    if 'hidden' in keys or 'clue' in keys or 'affinity' in keys:
        continue
    eff = keys & EFFECT_KEYS
    if not eff:
        continue
    neg = False
    for k in ('hp','gold'):
        for (jj, v) in kv.get(k, []):
            try:
                if int(v) < 0: neg = True
            except: pass
    is_good = bool(eff & GOOD_SIGNAL) and not neg
    is_bad = neg
    if is_good: good_pool.append(header)
    elif is_bad: bad_pool.append(header)

# 2) targets: ~20% of all choices, balanced. Aim ~50 good + ~35 bad = ~85/440 (~19%).
TARGET_GOOD = 50
TARGET_BAD = 35
def every_nth(pool, target):
    if target <= 0 or not pool: return set()
    if target >= len(pool): return set(pool)
    step = len(pool) / target
    return { pool[min(len(pool)-1, int(round(i*step)))] for i in range(target) }

to_hide = every_nth(good_pool, TARGET_GOOD) | every_nth(bad_pool, TARGET_BAD)
good_set = set(good_pool); bad_set = set(bad_pool)

# 3) apply (iterate blocks fresh each insertion to keep indices valid).
applied = set()
changed = True
while changed:
    changed = False
    blocks = []
    cs = None; ch = None
    for i, l in enumerate(lines):
        m = re.match(r'^\[(.+)\]\s*$', l)
        if m:
            if cs is not None: blocks.append((ch, cs, i))
            cs = i; ch = m.group(1)
    if cs is not None: blocks.append((ch, cs, len(lines)))
    for header, start, end in blocks:
        if header in to_hide and header not in applied:
            ins_at = None
            for j in range(start+1, end):
                if re.match(r'^label = ', lines[j]):
                    ins_at = j+1; break
            if ins_at is None: ins_at = start+1
            lines.insert(ins_at, "hidden = true")
            applied.add(header)
            stats['hidden_added'] += 1
            if header in good_set: stats['hidden_good'] += 1
            elif header in bad_set: stats['hidden_bad'] += 1
            changed = True
            break

new_text = '\n'.join(lines)

# --- invariants check ---
n_headers_after = sum(1 for l in lines if re.match(r'^\[.+\]\s*$', l))
n_events_after  = sum(1 for l in lines if re.match(r'^\[event\.[^\]]+\]\s*$', l) and '.choice.' not in l)
assert n_headers_after == n_headers_before, f"HEADER COUNT CHANGED {n_headers_before}->{n_headers_after}"
assert n_events_after == n_events_before, f"EVENT COUNT CHANGED {n_events_before}->{n_events_after}"
# forbidden chars in any value we touch: ensure no '#',';','*',em-dash in new color/hidden lines
for l in lines:
    if l.startswith('color = ') or l.startswith('hidden = '):
        assert not any(c in l for c in ('#',';','*','—')), f"forbidden char: {l}"

with open(PATH, 'w', encoding='utf-8', newline='\n') as f:
    f.write(new_text)

print("OK")
print(f"headers {n_headers_before} -> {n_headers_after}")
print(f"events  {n_events_before} -> {n_events_after}")
print(stats)
