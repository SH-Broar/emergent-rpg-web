"""
2차 분석: apply-status 파싱 교정 + 시너지 짝 획득경로 동시성 + 컬러 획득곡선 + 격파 갭 시뮬.
apply-status 형식: apply-status:VALUE:TARGET:STATUS  (rest = [VALUE, TARGET, STATUS])
"""
import os, re, glob, statistics
from collections import defaultdict, Counter

ROOT = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data"

def parse_ini(path):
    blocks=[]; cur_name=None; cur={}
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            s=line.strip()
            if not s or s.startswith("#"): continue
            m=re.match(r"^\[([^\]]+)\]$", s)
            if m:
                if cur_name is not None: blocks.append((cur_name,cur))
                cur_name=m.group(1); cur={}; continue
            if "=" in s and cur_name is not None:
                k,v=s.split("=",1); cur[k.strip()]=v.strip()
    if cur_name is not None: blocks.append((cur_name,cur))
    return blocks

def parse_effects(s):
    out=[]
    if not s: return out
    for part in s.split(","):
        part=part.strip()
        if not part: continue
        toks=part.split(":")
        out.append((toks[0], toks[1:]))   # (kind, [args])
    return out

# 카드 로드
cards={}
for rel in ["cards/cards-race.txt","cards/cards-mvr.txt","cards/cards-arc.txt",
            "cards/cards-possession.txt","cards/transform-forms.txt","cards/junk-cards.txt"]:
    p=os.path.join(ROOT,rel)
    if not os.path.exists(p): continue
    tag=os.path.basename(rel).replace(".txt","")
    for name,d in parse_ini(p):
        if not name.startswith("card."): continue
        cid=name[5:]; d["_id"]=cid; d["_file"]=tag
        d["_eff"]=parse_effects(d.get("effects",""))
        cards[cid]=d

def is_plus(cid): return cid.endswith("-plus")
def card_dmg(c): return sum(float(a[0]) for k,a in c["_eff"] if k=="damage" and a and _num(a[0]) is not None)
def _num(x):
    try: return float(x)
    except: return None
def cost(c):
    try: return int(float(c.get("cost","0")))
    except: return 0
def race_of(cid):
    m=re.match(r"c-(human|moth|phantom|arcana)-", cid); return m.group(1) if m else None

# ---------- apply-status 부여 정밀 집계 (status = args[2]) ----------
print("=== apply-status 부여 상태 정밀 집계 (본판) ===")
inflict = defaultdict(list)  # status -> [card_id]
for c in cards.values():
    if is_plus(c["_id"]): continue
    for k,a in c["_eff"]:
        if k=="apply-status" and len(a)>=3:
            status=a[2]; target=a[1]
            if target=="enemy":
                inflict[status].append(c["_id"])
for st in sorted(inflict, key=lambda s:-len(inflict[s])):
    print(f"  {st:12s}: {len(inflict[st])}종")

# consume 카드
consume = defaultdict(list)
for c in cards.values():
    if is_plus(c["_id"]): continue
    for k,a in c["_eff"]:
        if k in ("consume-burn","consume-poison","consume-vulnerable"):
            consume[k].append(c["_id"])

# ---------- 시너지 짝 획득경로 동시성 ----------
print("\n=== 시너지 짝: 부여 carrier vs 소비/스케일 carrier 획득경로 ===")
def src_label(cid):
    c=cards[cid]; src=c.get("source","?"); r=race_of(cid)
    if r: return f"종족:{r}"
    return f"{src}"

def report_pair(status, consume_kind, scale_kinds=()):
    inf = inflict.get(status, [])
    con = consume.get(consume_kind, [])
    scal=[]
    for c in cards.values():
        if is_plus(c["_id"]): continue
        if any(k in scale_kinds for k,a in c["_eff"]):
            scal.append(c["_id"])
    print(f"\n[{status} 빌드]")
    print(f"  부여 carrier {len(inf)}종: {[(c, src_label(c)) for c in inf]}")
    print(f"  소비 carrier({consume_kind}) {len(con)}종: {[(c, src_label(c)) for c in con]}")
    if scale_kinds:
        print(f"  스케일 carrier {len(scal)}종: {[(c, src_label(c)) for c in scal]}")
    # 같은 source에서 부여+소비 둘 다 얻을 수 있나?
    inf_src=set(src_label(c) for c in inf)
    con_src=set(src_label(c) for c in con)
    common = inf_src & con_src
    print(f"  >> 부여 출처={sorted(inf_src)} / 소비 출처={sorted(con_src)} / 교집합={sorted(common) if common else '없음(!)'}")

report_pair("burn","consume-burn", {"consume-burn"})
report_pair("poison","consume-poison", {"consume-poison"})
report_pair("vulnerable","consume-vulnerable", {"consume-vulnerable","damage-per-debuff"})

# damage-per-hand / damage-per-cards-played 빌드 carrier
print("\n[손패수 빌드 (damage-per-hand)]")
ph=[c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="damage-per-hand" for k,a in c["_eff"])]
print(f"  {len(ph)}종: {[(c, src_label(c)) for c in ph]}")
print("\n[콤보 빌드 (damage-per-cards-played)]")
cp=[c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k=="damage-per-cards-played" for k,a in c["_eff"])]
print(f"  {len(cp)}종: {[(c, src_label(c)) for c in cp]}")
print("\n[컬러 빌드 (damage-top-color / damage-color-count)]")
tc=[c["_id"] for c in cards.values() if not is_plus(c["_id"]) and any(k in ("damage-top-color","damage-color-count","damage-min-color") for k,a in c["_eff"])]
print(f"  {len(tc)}종: source분포 {Counter(src_label(c) for c in tc)}")

# ---------- 상점 풀 vs 종족풀 시너지 carrier 비중 ----------
print("\n=== 풀별 시너지/스케일 carrier 비중 ===")
SYN={"damage-per-hand","damage-per-debuff","damage-per-cards-played","consume-vulnerable",
     "consume-burn","consume-poison","growing-damage","amplify-debuff","this-turn-amp",
     "next-card-double","damage-from-hp","damage-top-color","damage-color-count","damage-min-color"}
def pool_of(c):
    src=c.get("source","")
    if src in ("race","character"): return "종족시작덱"
    if c.get("rank")=="legendary": return "전설(공방/엘리트)"
    if src=="shop": return "상점/일반보상"
    if src=="npc": return "동료(npc연동)"
    if src=="event": return "이벤트"
    if src=="hyperion": return "전설히페리온"
    if src=="form": return "변신폼"
    return src or "기타"
pool_syn=defaultdict(lambda:[0,0])
for c in cards.values():
    if is_plus(c["_id"]): continue
    p=pool_of(c)
    pool_syn[p][1]+=1
    if any(k in SYN for k,a in c["_eff"]): pool_syn[p][0]+=1
for p,(syn,tot) in sorted(pool_syn.items(), key=lambda x:-x[1][1]):
    print(f"  {p:18s} 시너지 {syn:3d}/{tot:3d} ({syn/tot*100:.0f}%)")

# ---------- 컬러 획득 곡선 (보상 데이터 기반) ----------
print("\n=== 컬러 획득 곡선 (전투보상/이벤트/채집) ===")
# combat-rewards.ts 상수 (코드에서 추출)
NORMAL_COLOR=[0,2,3,4,5]; ELITE_COLOR=[0,4,6,8,10]
print("  전투당 권역 primaryColor 부스트: 일반 tier1~4 =", NORMAL_COLOR[1:], "/ 엘리트 =", ELITE_COLOR[1:])
# 한 색에 집중 시 누적 곡선. 하루 100턴, 전투 노드 비율 가정.
print("\n  [시나리오: 한 색에 모든 전투보상 집중, 3일=300턴]")
# 노드맵에서 전투/엘리트 노드 비율
mapfile=os.path.join(ROOT,"node-maps","act-1-map.txt")
kinds=Counter()
for name,d in parse_ini(mapfile):
    if name.startswith("node.") or ".node." in name:
        kinds[d.get("kind","?")]+=1
# 노드 kind 필드 추적 (다른 포맷일 수 있음)
print(f"  맵 노드 kind 분포(act-1-map): {dict(kinds)}")

# ---------- 격파 갭 시뮬레이션 ----------
print("\n=== (d) 3일차 아크 격파 갭 시뮬레이션 ===")
def calc_stat(a,b):
    A,B=max(0,a),max(0,b)
    if A==0 and B==0: return 0
    lo,hi=min(A,B),max(A,B); bal=lo/hi if hi else 0
    return (A+B)*(1+1.5*(bal**1.5))

# 현실적 빌드 3종 가정 (3일차 진입, 컬러/유물/덱 수준)
def atk_dmg_bonus(fire,elec): return int(calc_stat(fire,elec)//33)

print("""
  전제:
   - 아크 보스 HP: 던 1040 / 티프레 1080 / 타마모 480 (보스는 하루 스케일 미적용, 고정)
   - 보스 rewind 기믹: 직전 턴 피해의 30%(최대 25) 회복 + 자기 디버프 제거 (던/티프레는 P1/P2 인텐트로 확인 필요)
   - 덱 10장 고정, 턴당 마나 3(+MAG). 한 턴 보통 3코 = 카드 2~3장.
""")

# 빌드 A: 균형 컬러 빌드 (한 쌍 60/60 → +9), 강화 약간, 곱유물 0
# 빌드 B: 컬러 풀투자 (80/80 → +12) + strength 유물
# 빌드 C: 곱유물 빌드 (glass ×1.5) + 컬러 40/40(+6)

def turn_damage(base_cards_dmg, atk_bonus, strength, mul=1.0, cards_per_turn=2.5):
    """한 턴 평균 화력. base_cards_dmg = 카드 1장 평균 고정 데미지."""
    per_card = (base_cards_dmg + atk_bonus + strength) * mul
    return per_card * cards_per_turn

# 평균 공격 카드 고정 데미지 (본판 mvr non-legendary, cost<=2)
atk_cards=[card_dmg(c) for c in cards.values() if not is_plus(c["_id"]) and card_dmg(c)>0 and cost(c)<=2]
avg_atk = statistics.mean(atk_cards)
med_atk = statistics.median(atk_cards)
print(f"  공격카드(cost<=2, 본판) 평균 고정 데미지: {avg_atk:.1f}, 중앙값 {med_atk:.0f} (n={len(atk_cards)})")

scenarios = [
    ("A 초보(시드색, 강화X, 곱X)",    8,  0, 0, 1.0, 2.5),
    ("B 균형빌드(40/40=+6, str3)",   9,  6, 3, 1.0, 2.5),
    ("C 풀투자(80/80=+12, str6)",   10, 12, 6, 1.0, 3.0),
    ("D 곱유물(60/60=+9, glass1.5)",10,  9, 4, 1.5, 3.0),
    ("E 이상적(MAX색+12, str10, mul1.5, 4장/턴)", 11, 12, 10, 1.5, 4.0),
]
print(f"\n  {'빌드':36s} {'장당':>6s} {'턴화력':>7s} {'rewind후실효':>11s} {'1040격파턴':>9s} {'1080격파턴':>9s}")
for label, base, ab, st, mul, cpt in scenarios:
    td = turn_damage(base, ab, st, mul, cpt)
    # rewind: 매 턴 화력의 30%(최대25) 회복 → 실효 화력 = td - min(25, td*0.3)
    rewind_heal = min(25, td*0.3)
    eff = td - rewind_heal
    t1040 = 1040/eff if eff>0 else 9999
    t1080 = 1080/eff if eff>0 else 9999
    per_card = (base+ab+st)*mul
    print(f"  {label:36s} {per_card:6.1f} {td:7.1f} {eff:11.1f} {t1040:9.1f} {t1080:9.1f}")

print("""
  주: '턴화력'=장당×장수. 'rewind후실효'=보스 회복 차감. 격파턴=HP/실효화력.
      보스 방어(defend 인텐트)·플레이어 피격으로 실제론 더 길어짐.
""")
