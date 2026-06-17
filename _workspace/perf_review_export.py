"""성능 검수 시트 export — 카드/유물/아이템의 *성능*을 O/?/X 판별용 _review JSON으로.

격자 전투 개편(구조 변경) 후 유물·아이템 재정비 + 전 카드 성능 검수용.
검수 앱(public/review)이 raw.githubusercontent .../rdc-roguelike-main/_review/<id>.json 을 fetch.
각 항목 text = 성능 요약(이름·코스트·범위·효과·속도 등) → 앱에서 O/보류/X + 코멘트.

제외: -plus(강화판=base 따라감), unplayable(잡카드), source=form(변신 전용).
시트 분할: 카테고리별 ~55개.
"""
import json
import os
import re
import glob

ROOT = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web"
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(ROOT, "_review")
PER_SHEET = 55


def parse_ini(path):
    """[section] → {key: value} 리스트(순서 보존). 주석(#·;) 무시(mid-line 포함)."""
    out = []
    cur = None
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.rstrip("\n")
            # mid-line 주석 제거(값 안의 ;도 잘리지만 검수 표시용이라 무방).
            for c in ("#", ";"):
                i = line.find(c)
                if i >= 0:
                    line = line[:i]
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^\[([^\]]+)\]$", line)
            if m:
                cur = {"__section__": m.group(1), "__order__": []}
                out.append(cur)
                continue
            if cur is None:
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                k = k.strip(); v = v.strip()
                cur[k] = v
                cur["__order__"].append(k)
    return out


def collect(subdir, prefix):
    secs = []
    for path in sorted(glob.glob(os.path.join(DATA, subdir, "*.txt"))):
        fname = os.path.basename(path)
        for s in parse_ini(path):
            sec = s["__section__"]
            if not sec.startswith(prefix + "."):
                continue
            s["__file__"] = f"{subdir}/{fname}"
            secs.append(s)
    return secs


def shape_desc(s):
    tm = s.get("target_mode", "")
    shape = s.get("shape", "")
    n = len([p for p in shape.split("|") if p.strip()]) if shape else 0
    if tm == "self" or n == 0:
        return "self(제자리)"
    if tm == "aimed":
        return f"조준 {n}칸(사거리 {s.get('aim_range','3')})"
    return f"{n}칸"


def write_sheets(entries, base_id, title, kind):
    """entries: [(loc, text)] → PER_SHEET 단위 시트 파일들."""
    sheets = []
    total = len(entries)
    nsheet = max(1, (total + PER_SHEET - 1) // PER_SHEET)
    per = (total + nsheet - 1) // nsheet  # 균등 분배(고아 시트 방지).
    for si in range(nsheet):
        chunk = entries[si * per:(si + 1) * per]
        if not chunk:
            continue
        sid = f"{base_id}_{si+1}" if nsheet > 1 else base_id
        items = [{"n": i + 1, "kind": kind, "loc": loc, "text": text}
                 for i, (loc, text) in enumerate(chunk)]
        doc = {"meta": {"id": sid, "title": f"{title} ({si+1}/{nsheet})" if nsheet > 1 else title},
               "items": items}
        path = os.path.join(OUT, sid + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        sheets.append((sid, len(items)))
    return sheets


# ---- 카드 ----
card_entries = []
for s in collect("cards", "card"):
    cid = s["__section__"][len("card."):]
    if cid.endswith("-plus"):
        continue
    if s.get("unplayable") == "true":
        continue
    if s.get("source") == "form":
        continue
    name = s.get("name", cid)
    cost = s.get("cost", "0")
    eff = s.get("effects", "")
    cs = s.get("cast_speed", "normal")
    ptm = s.get("per_tile_mul", "")
    extra = f" · 배율 {ptm}" if ptm else ""
    text = f"「{name}」 {cost}코 · {shape_desc(s)} · 효과: {eff} · 속도 {cs}{extra}"
    loc = f"{s['__file__']} [{s['__section__']}]"
    card_entries.append((loc, text))

# ---- 유물 ----
relic_entries = []
for s in collect("relics", "relic"):
    name = s.get("name", s["__section__"])
    trig = s.get("trigger", "passive")
    eff = s.get("effects", "")
    ct = " · 전투형(로드아웃)" if s.get("combat_type") == "true" else ""
    rank = s.get("rank", "")
    text = f"「{name}」 [{rank}] {trig}{ct} · 효과: {eff}"
    loc = f"{s['__file__']} [{s['__section__']}]"
    relic_entries.append((loc, text))

# ---- 아이템 ----
item_entries = []
for s in collect("items", "item"):
    name = s.get("name", s["__section__"])
    eff = s.get("effects", "")
    combat = "전투포션" if s.get("combat") == "true" else "재료/기타"
    cons = "" if s.get("consumable") == "false" else " · 소모"
    rank = s.get("rank", "")
    text = f"「{name}」 [{rank}] {combat}{cons} · 효과: {eff}"
    loc = f"{s['__file__']} [{s['__section__']}]"
    item_entries.append((loc, text))

all_sheets = []
all_sheets += write_sheets(relic_entries, "perf_relic", "유물 성능 검수", "유물성능")
all_sheets += write_sheets(item_entries, "perf_item", "아이템 성능 검수", "아이템성능")
all_sheets += write_sheets(card_entries, "perf_card", "카드 성능 검수", "카드성능")

print(f"카드 {len(card_entries)} · 유물 {len(relic_entries)} · 아이템 {len(item_entries)}")
print(f"시트 {len(all_sheets)}개:")
for sid, n in all_sheets:
    print(f"  {sid}  ({n})")
