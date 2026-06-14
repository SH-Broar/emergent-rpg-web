"""
EmergentRPG 덱 성장·아크 격파 정량 분석.
INI-style .txt 전수 파싱 → 카드/유물/동료/아이템 화력 집계.
"""
import os, re, glob, statistics
from collections import defaultdict, Counter

ROOT = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data"

def parse_ini(path):
    """[section] + key=value 블록 파서. 한 섹션 = dict. 반환 list[(section, dict)]."""
    blocks = []
    cur_name = None
    cur = {}
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.rstrip("\n")
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            m = re.match(r"^\[([^\]]+)\]$", s)
            if m:
                if cur_name is not None:
                    blocks.append((cur_name, cur))
                cur_name = m.group(1)
                cur = {}
                continue
            if "=" in s and cur_name is not None:
                k, v = s.split("=", 1)
                cur[k.strip()] = v.strip()
    if cur_name is not None:
        blocks.append((cur_name, cur))
    return blocks

def parse_effects(s):
    """effects = damage:9:enemy, draw:1:self → list[(kind, value|None, rest...)]."""
    out = []
    if not s:
        return out
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        toks = part.split(":")
        kind = toks[0]
        val = None
        if len(toks) > 1:
            try:
                val = float(toks[1])
            except ValueError:
                val = None
        out.append((kind, val, toks[1:]))
    return out

# ---------- 카드 로드 ----------
card_files = {
    "race": "cards/cards-race.txt",
    "mvr": "cards/cards-mvr.txt",
    "arc": "cards/cards-arc.txt",
    "possession": "cards/cards-possession.txt",
    "forms": "cards/transform-forms.txt",
    "junk": "cards/junk-cards.txt",
}
cards = {}   # id -> dict
for tag, rel in card_files.items():
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    for name, d in parse_ini(p):
        if not name.startswith("card."):
            continue
        cid = name[len("card."):]
        d["_id"] = cid
        d["_file"] = tag
        d["_effects"] = parse_effects(d.get("effects", ""))
        cards[cid] = d

print(f"=== 카드 총 {len(cards)}장 로드 ===")
by_file = Counter(c["_file"] for c in cards.values())
print("파일별:", dict(by_file))
by_source = Counter(c.get("source","?") for c in cards.values())
print("source별:", dict(by_source))
by_rank = Counter(c.get("rank","?") for c in cards.values())
print("rank별:", dict(by_rank))

# plus 여부
def is_plus(cid): return cid.endswith("-plus")
def base_of(cid): return cid[:-5] if is_plus(cid) else cid

# ---------- 직접 데미지 효과 분류 ----------
DAMAGE_KINDS = {
    "damage","damage-min-color","damage-top-color","damage-color-count",
    "damage-per-debuff","consume-vulnerable","consume-burn","consume-poison",
    "damage-from-hp","damage-per-hand","damage-low-hand","block-to-damage",
    "spend-all-energy","damage-per-companion","damage-per-relic","growing-damage",
    "damage-per-cards-played","adaptive-strike",
}
# 고정 데미지(value가 곧 피해의 주성분)
FLAT_DAMAGE = {"damage"}

def card_flat_damage(c):
    """카드의 고정 damage 합 (multi-hit 합산). damage 효과만."""
    tot = 0
    for k, v, rest in c["_effects"]:
        if k == "damage" and v is not None:
            tot += v
    return tot

def card_has_damage(c):
    return any(k in DAMAGE_KINDS for k,_,_ in c["_effects"])

def card_cost(c):
    try: return int(float(c.get("cost","0")))
    except: return 0

# ---------- (b)② 강화(+plus) 효과 증가율 전수 ----------
print("\n=== (b)2 강화(+plus) 효과 증가율 전수 분석 ===")
pairs = []   # (base_id, base_card, plus_card)
for cid, c in cards.items():
    if is_plus(cid):
        b = base_of(cid)
        if b in cards:
            pairs.append((b, cards[b], c))

print(f"base/plus 쌍: {len(pairs)}개")

# 고정 damage 증가율
dmg_deltas = []      # (base_dmg, plus_dmg, delta, pct)
block_deltas = []
both_value_deltas = []  # 모든 수치형 효과(damage+block+heal)의 증가
for b_id, bc, pc in pairs:
    bd = card_flat_damage(bc)
    pd = card_flat_damage(pc)
    if bd > 0:
        delta = pd - bd
        pct = delta / bd * 100 if bd else 0
        dmg_deltas.append((b_id, bd, pd, delta, pct))
    # block
    def card_flat_block(c):
        return sum(v for k,v,_ in c["_effects"] if k=="block" and v is not None)
    bb, pb = card_flat_block(bc), card_flat_block(pc)
    if bb > 0:
        block_deltas.append((b_id, bb, pb, pb-bb, (pb-bb)/bb*100 if bb else 0))

if dmg_deltas:
    pcts = [x[4] for x in dmg_deltas]
    deltas = [x[3] for x in dmg_deltas]
    print(f"\n[고정 damage 카드 {len(dmg_deltas)}종]")
    print(f"  데미지 증가량 Δ: 평균 {statistics.mean(deltas):.2f}, 중앙값 {statistics.median(deltas):.1f}, 최소 {min(deltas):.0f}, 최대 {max(deltas):.0f}")
    print(f"  데미지 증가율 %: 평균 {statistics.mean(pcts):.1f}%, 중앙값 {statistics.median(pcts):.1f}%, 최소 {min(pcts):.1f}%, 최대 {max(pcts):.1f}%")
    # 분포
    buckets = Counter()
    for d in deltas:
        if d <= 0: buckets["0이하"] += 1
        elif d <= 2: buckets["+1~2"] += 1
        elif d <= 4: buckets["+3~4"] += 1
        elif d <= 6: buckets["+5~6"] += 1
        else: buckets["+7이상"] += 1
    print(f"  Δ분포: {dict(buckets)}")
    # 증가 0 (강화가 데미지를 안 올림)
    zero = [x for x in dmg_deltas if x[3] <= 0]
    print(f"  데미지 증가 0인 강화: {len(zero)}종 (예: {[x[0] for x in zero[:8]]})")

if block_deltas:
    bd_ = [x[3] for x in block_deltas]
    print(f"\n[고정 block 카드 {len(block_deltas)}종] Δ평균 {statistics.mean(bd_):.2f}, 중앙값 {statistics.median(bd_):.1f}")

# ---------- (b)① DPS 상위 카드 (풀 경로별) ----------
print("\n=== (b)1 화력 상위 카드 (cost당 고정 damage 기준) ===")
def shop_eligible(c):
    src = c.get("source","")
    return src not in ("race","character") and c.get("rank","")!="legendary" and c["_file"]=="mvr"

# cost당 데미지(고정) — plus 제외 본판만, 0코스트는 cost1로 환산
def dpc(c):
    d = card_flat_damage(c)
    cost = card_cost(c)
    denom = max(1, cost)
    return d/denom

attack_cards = [c for c in cards.values() if card_flat_damage(c) > 0 and not is_plus(c["_id"])]
attack_cards.sort(key=lambda c: card_flat_damage(c), reverse=True)
print("\n[고정 단일 damage 절대값 상위 15 — 본판]")
for c in attack_cards[:15]:
    print(f"  {c['_id']:32s} dmg={card_flat_damage(c):5.0f} cost={card_cost(c)} rank={c.get('rank','?'):9s} src={c.get('source','?'):10s} file={c['_file']}")

# 상점 가능 풀에서의 상위
shop_atk = [c for c in attack_cards if shop_eligible(c)]
shop_atk.sort(key=lambda c: dpc(c), reverse=True)
print("\n[상점 풀(mvr, non-legendary) cost당 damage 상위 12]")
for c in shop_atk[:12]:
    print(f"  {c['_id']:32s} dmg={card_flat_damage(c):4.0f}/cost{card_cost(c)} = {dpc(c):5.1f} rank={c.get('rank','?'):9s}")

# 종족별 시작 풀 상위
print("\n[종족(race) 풀 cost당 damage 상위 — 종족별]")
race_atk = defaultdict(list)
for c in attack_cards:
    if c.get("source")=="race":
        # element/id로 종족 추정
        cid = c["_id"]
        m = re.match(r"c-(human|moth|phantom|arcana)-", cid)
        race = m.group(1) if m else "other"
        race_atk[race].append(c)
for race, lst in race_atk.items():
    lst.sort(key=lambda c: dpc(c), reverse=True)
    top = lst[:5]
    print(f"  [{race}] {[(c['_id'].replace('c-'+race+'-',''), card_flat_damage(c), card_cost(c)) for c in top]}")

# ---------- (b)③ 컬러→데미지 기여 (공식 적용) ----------
print("\n=== (b)3 컬러 스탯 → 데미지 기여 (calculateStat + /33) ===")
def calc_stat(a,b):
    A,B = max(0,a),max(0,b)
    if A==0 and B==0: return 0
    lo,hi = min(A,B),max(A,B)
    bal = lo/hi if hi else 0
    return (A+B)*(1+1.5*(bal**1.5))
def atk_bonus(fire, electric):
    return int(calc_stat(fire,electric)//33)
# 시나리오: 컬러 획득 곡선
print("  ATK 보너스 = floor(calculateStat(fire,electric)/33)")
scenarios = [
    ("시드만(한 색 10)", 10, 0),
    ("한 색 집중 40", 40, 0),
    ("한 색 집중 80", 80, 0),
    ("두 색 균형 20/20", 20, 20),
    ("두 색 균형 40/40", 40, 40),
    ("두 색 균형 60/60", 60, 60),
    ("두 색 균형 80/80", 80, 80),
    ("두 색 100/100(MAX)", 100, 100),
    ("불균형 80/20", 80, 20),
]
for label, f, e in scenarios:
    s = calc_stat(f,e)
    print(f"  {label:24s} fire={f:3d} elec={e:3d} → ATK={s:6.1f} → damage보너스 +{int(s//33)}")

# 컬러 20당 +1? 검증: 한 색만 키울 때
print("\n  [한 색만 키울 때 데미지보너스 도달 컬러값]")
prev = 0
for col in range(0, 201, 5):
    b = int(calc_stat(col,0)//33)
    if b != prev:
        print(f"    fire={col} → +{b}")
        prev = b
print("\n  [두 색 균형(같은 값)으로 키울 때]")
prev = 0
for col in range(0, 101, 2):
    b = int(calc_stat(col,col)//33)
    if b != prev:
        print(f"    fire=elec={col} → +{b}")
        prev = b

# ---------- (b)④ 유물 데미지 증폭 ----------
print("\n=== (b)4 유물 데미지 증폭 (add/mul 구조) ===")
relics = {}
for p in glob.glob(os.path.join(ROOT, "relics", "*.txt")):
    for name, d in parse_ini(p):
        if not name.startswith("relic."):
            continue
        rid = name[len("relic."):]
        d["_id"] = rid
        d["_file"] = os.path.basename(p)
        d["_effects"] = parse_effects(d.get("effects",""))
        relics[rid] = d
print(f"유물 총 {len(relics)}개 로드. 파일: {Counter(r['_file'] for r in relics.values())}")

# damage 관련 effect kind 가진 유물
dmg_relic_kinds = Counter()
for r in relics.values():
    for k,v,rest in r["_effects"]:
        dmg_relic_kinds[k]+=1

# 직접 화력 유물
mul_relics = []
add_relics = []
strength_relics = []
for r in relics.values():
    for k,v,rest in r["_effects"]:
        if k == "damage-out-mul":
            mul_relics.append((r["_id"], v, r.get("source",""), r.get("rank",""), r.get("trigger","")))
        if k == "damage-out-add":
            add_relics.append((r["_id"], v, r.get("source",""), r.get("rank","")))
        if k in ("attacks-to-strength","strength-from-metric","turn-after-strength"):
            strength_relics.append((r["_id"], k, v, r.get("rank","")))

print(f"\n[damage-out-mul (곱셈 증폭) 유물 {len(mul_relics)}개]")
for rid,v,src,rank,trig in mul_relics:
    print(f"  {rid:34s} ×{v} src={src} rank={rank} trig={trig}")
print(f"\n[damage-out-add (가산 증폭) 유물 {len(add_relics)}개]")
for rid,v,src,rank in add_relics:
    print(f"  {rid:34s} +{v} src={src} rank={rank}")
print(f"\n[힘(strength) 공급 유물 {len(strength_relics)}개]")
for rid,k,v,rank in strength_relics:
    print(f"  {rid:34s} {k}={v} rank={rank}")

# ---------- (c) 시너지 효과 풀 비중 ----------
print("\n=== (c) 시너지/스케일 효과 풀 내 비중 ===")
SYNERGY_KINDS = {
    "damage-per-hand","damage-per-debuff","damage-per-cards-played","damage-per-companion",
    "damage-per-relic","damage-low-hand","consume-vulnerable","consume-burn","consume-poison",
    "growing-damage","growing-block","block-to-damage","spend-all-energy","amplify-debuff",
    "this-turn-amp","next-card-double","damage-from-hp","bloom-strength","buff-card-instance",
    "damage-top-color","damage-color-count","damage-min-color","block-top-color",
}
STATUS_INFLICT = {"apply-status"}  # poison/burn/vulnerable 부여
syn_counter = Counter()
status_inflict_by_status = Counter()
cards_with_synergy = []
for c in cards.values():
    if is_plus(c["_id"]): continue  # 본판만
    has_syn = False
    for k,v,rest in c["_effects"]:
        if k in SYNERGY_KINDS:
            syn_counter[k]+=1
            has_syn=True
        if k == "apply-status" and len(rest)>=2:
            status_inflict_by_status[rest[1]]+=1
    if has_syn:
        cards_with_synergy.append(c["_id"])

total_base = len([c for c in cards.values() if not is_plus(c["_id"])])
print(f"본판 카드 {total_base}장 중 시너지/스케일 효과 보유: {len(cards_with_synergy)}장 ({len(cards_with_synergy)/total_base*100:.0f}%)")
print(f"시너지 효과 종류별 카드 수: {dict(syn_counter.most_common())}")
print(f"apply-status 부여 상태별 카드 수(본판): {dict(status_inflict_by_status.most_common())}")

# 소비(consume) 짝 분석: 화상/중독/취약 부여 vs 소비
inflict_burn = [c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="apply-status" and len(rest)>=2 and rest[1]=="burn" for k,v,rest in c["_effects"])]
consume_burn = [c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="consume-burn" for k,v,rest in c["_effects"])]
inflict_poison = [c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="apply-status" and len(rest)>=2 and rest[1]=="poison" for k,v,rest in c["_effects"])]
consume_poison = [c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="consume-poison" for k,v,rest in c["_effects"])]
inflict_vuln = [c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="apply-status" and len(rest)>=2 and rest[1]=="vulnerable" for k,v,rest in c["_effects"])]
consume_vuln = [c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="consume-vulnerable" for k,v,rest in c["_effects"])]

def src_of(cid): return cards[cid].get("source","?")
def race_of(cid):
    m = re.match(r"c-(human|moth|phantom|arcana)-", cid); return m.group(1) if m else cards[cid]["_file"]
print(f"\n[화상 시너지] 부여 카드 {len(inflict_burn)}종, 소비(consume-burn) {len(consume_burn)}종")
print(f"   부여: {[(c, race_of(c)) for c in inflict_burn]}")
print(f"   소비: {[(c, race_of(c)) for c in consume_burn]}")
print(f"\n[중독 시너지] 부여 {len(inflict_poison)}종, 소비 {len(consume_poison)}종")
print(f"   부여: {[(c, race_of(c)) for c in inflict_poison]}")
print(f"   소비: {[(c, race_of(c)) for c in consume_poison]}")
print(f"\n[취약 시너지] 부여 {len(inflict_vuln)}종, 소비 {len(consume_vuln)}종")
print(f"   소비 carrier: {[(c, race_of(c)) for c in consume_vuln]}")

# ---------- (b)5 동료 스킬 화력 ----------
print("\n=== (b)5 동료 액티브 스킬 화력 ===")
npc_files = glob.glob(os.path.join(ROOT, "npcs", "*.txt"))
boss_files = glob.glob(os.path.join(ROOT, "bosses", "*.txt"))
skills = []
for p in npc_files + boss_files:
    for name, d in parse_ini(p):
        ckind = d.get("companion_kind","")
        if ckind != "skill":
            continue
        eff = parse_effects(d.get("companion_skill_effects",""))
        cd = d.get("companion_skill_cooldown","?")
        dmg = sum(v for k,v,_ in eff if k=="damage" and v is not None)
        nm = d.get("companion_skill_name", d.get("name","?"))
        try: cdn = float(cd)
        except: cdn = None
        dpc_skill = dmg/cdn if cdn else None
        skills.append((nm, dmg, cd, dpc_skill, d.get("companion_skill_effects",""), os.path.basename(p)))
skills.sort(key=lambda x: (x[3] or 0), reverse=True)
print(f"skill 타입 동료 {len(skills)}명")
print("\n[동료 스킬 데미지/쿨다운 상위 18]")
for nm, dmg, cd, dps, eff, fp in skills[:18]:
    print(f"  {nm:18s} dmg={dmg:5.0f} cd={cd} dmg/cd={dps if dps is None else round(dps,1)}  [{eff[:55]}]")

# ---------- (a) 아크 보스 ----------
print("\n=== (a) 아크 보스 데이터 ===")
for name, d in parse_ini(os.path.join(ROOT,"bosses","act-1-arc.txt")):
    if name.startswith("boss.") and name.count(".")==1:
        print(f"  {d.get('name','?'):8s} id={name[5:]:16s} hp={d.get('hp','?'):5s} atk={d.get('attack','?'):4s} kind={d.get('kind','?')}")

# 아크 전용 보상 카드/유물 화력
print("\n[아크 전용 보상 카드 (arc)]")
for cid, c in cards.items():
    if c["_file"]=="arc" and not is_plus(cid):
        print(f"  {cid:30s} {c.get('name','?'):16s} cost={card_cost(c)} dmg={card_flat_damage(c):.0f} eff={c.get('effects','')[:60]}")
print("\n[아크 전용 보상 유물 (relics-arc)]")
for rid, r in relics.items():
    if "arc" in r["_file"]:
        print(f"  {rid:30s} {r.get('name','?'):16s} trig={r.get('trigger','?'):16s} eff={r.get('effects','')[:55]}")
