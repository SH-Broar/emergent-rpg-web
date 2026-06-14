# -*- coding: utf-8 -*-
"""
활성 인간직업형 몬스터 16종을 세계관에 맞게 재해석(이름) + 어색한 species 보정.
원칙: 인간 사회의 범죄자/경비가 아니라, 여행자를 노리는 야생·영역성 몬무스거나 옛 문명의 파수 구조물.
종족명은 고유어(임프/수인/라미아/하피/인어/골렘/석상)로 — "몬무스" 단어 미사용.
이름(name)과 필요한 경우 species 라인만 교체. 섹션 id로 매칭.
"""
import io, glob, re

# id -> (new_name, new_species or None)
RETONE = {
    'mr-iluneon-trickster':          ('광장 홀림 임프', None),
    'mr-iluneon-guild-rat':          ('곳간 쥐수인', None),
    'mr-reshud-bandit':              ('길목 임프 무리', None),
    'mr-reshud-drifter':             ('떠도는 들임프', None),
    'mr-reshud-toll-raider':         ('교차로 덮침 임프', None),
    'mr-tradepost-stray-hound':      ('굶주린 늑대수인', None),
    'mr-tradepost-caravan-thief':    ('상로의 흡정 임프', None),
    'mr-tradepost-wanderer':         ('상로의 사나운 임프', None),
    'mr-tradepost-lamia-guard':      ('똬리 튼 라미아', None),
    'mr-moss-iron-guardian':         ('이끼낀 강철 골렘', 'golem'),
    'mr-ali-herb-bandit':            ('안개밭 흡정 임프', None),
    'mr-martin-gull-raider':         ('갈매기 하피 떼', None),
    'mr-mano-limun-ward':            ('깨어난 리문상', None),
    'mr-coral-coast-mermaid-hunter': ('여울 인어 사냥꾼', None),
    'mr-yusezria-iron-sentinel':     ('무쇠 파수 골렘', 'golem'),
    'mr-oldshrine-relic-hunter':     ('신전 빛홀림 임프', None),
}
SEC = re.compile(r'\[monster\.([a-z0-9-]+)\]')

def main(apply=False):
    files = glob.glob('public/data/monsters/act-1-roster-t*.txt') + glob.glob('public/data/monsters/mvr-monsters.txt')
    done = {}
    for path in sorted(files):
        with io.open(path, 'r', encoding='utf-8', newline='') as f:
            text = f.read()
        cur = None; out = []
        for raw in text.splitlines(keepends=True):
            line = raw.rstrip('\n').rstrip('\r'); nl = raw[len(line):]
            m = SEC.match(line.strip())
            if m:
                cur = m.group(1)
                out.append(raw); continue
            spec = RETONE.get(cur) if cur else None
            if spec:
                st = line.strip()
                if st.startswith('name ='):
                    out.append(f'name = {spec[0]}' + nl); done.setdefault(cur, []).append('name'); continue
                if st.startswith('species =') and spec[1]:
                    out.append(f'species = {spec[1]}' + nl); done.setdefault(cur, []).append('species'); continue
            out.append(raw)
        if apply:
            with io.open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(''.join(out))
    # species 보정 대상이 species 라인이 없으면 추가 필요 — 확인
    for mid, (nm, sp) in RETONE.items():
        marks = done.get(mid, [])
        warn = ''
        if 'name' not in marks: warn += ' [NAME NOT FOUND]'
        if sp and 'species' not in marks: warn += ' [SPECIES LINE MISSING — 추가 필요]'
        print(f"{mid:32s} -> {nm}{(' ('+sp+')') if sp else ''}{warn}")
    print(f"\n{'APPLIED' if apply else 'DRY RUN'} — {len(done)}/{len(RETONE)} matched")

if __name__ == '__main__':
    import sys
    main(apply='--apply' in sys.argv)
