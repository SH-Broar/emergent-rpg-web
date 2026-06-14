# -*- coding: utf-8 -*-
"""
백업(act-1-map.orig.txt) 권역 재구성:
  1) emberforge → triflower 흡수 (노드 region + 풀 병합 + emberforge def 삭제)
  2) moss → moss-north(북 모스)/moss-south(남 모스) 분할 (노드 region + def 2개)
  3) luna 마왕성·금단회랑 8노드 → demon-castle(마왕성) 분리 (노드 region + def 추가)
  4) enicham 이름 에니챀→에니챰
  5) reshud 4노드 각각 1개씩 다른 권역 연결
이후 hex_layout 재생성이 이 구조를 읽어 위치/간선을 다시 깐다.
"""
import io, re

BACKUP = '_workspace/act-1-map.orig.txt'
PFX = 'nodemap.nm-act-1-era4-061'

MOSS_NORTH = {'n-moss-steam-room','n-moss-inn','n-clutch-lighthouse','n-moss-hammer-row','n-moss-ridge','n-moss-ember-bed','n-moss-watchtower','n-moss-furnace','n-moss-tool-room','n-moss-armor-stall','n-clutch-pier'}
MOSS_SOUTH = {'n-clutch-harbor-alley','n-clutch-landing','n-moss-alley','n-moss-weapon-stall','n-moss-fissure','n-moss-plaza','n-moss-anvil-room','n-clutch-warehouse','n-moss','n-moss-forge','n-moss-workshop'}
CASTLE = {'n-demon-castle','n-castle-gate','n-castle-throne','n-castle-office','n-forbidden-corridor','n-corridor-entry','n-corridor-sealed-door','n-corridor-inscription'}

# 노드 region 재배정 맵
def node_region(nid, old):
    if nid in MOSS_NORTH: return 'moss-north'
    if nid in MOSS_SOUTH: return 'moss-south'
    if nid in CASTLE: return 'demon-castle'
    if old == 'emberforge': return 'triflower'
    return old

# reshud 4노드 → 각 1개씩 다른 권역
RESHUD_NB = {
    'n-reshud-junction': 'n-iluneon-guild, n-reshud-pass, n-reshud-station, n-reshud-bell',
    'n-reshud-pass':     'n-reshud-junction, n-windfall-outskirts',
    'n-reshud-station':  'n-reshud-junction, n-riagralta',
    'n-reshud-bell':     'n-reshud-junction, n-bagreat-foot',
}

# triflower 병합 풀
TRI_ENEMY = 'mr-triflower-ember-arachne, mr-triflower-lava-salamander, mr-triflower-flame-spirit, mr-triflower-magma-crab, mr-triflower-scorchling, mr-emberforge-ash-hound, mr-emberforge-furnace-golem, mr-emberforge-lava-crawler, mr-emberforge-cinder-bat, mr-emberforge-slag-crusher'
TRI_ELITE = 'mr-triflower-ignia-queen, mr-emberforge-magma-titan, mr-emberforge-kumamimi'
TRI_EVENT = 'ev-lar-triflower-spirit, ev-lar-crater-rim-heat, ev-lar-lava-vein-spark, ev-lar-cooled-slag-rest, ev-tri-web-nest, ev-tri-magma-core, ev-emberforge-lair, ev-emberforge-core'

MOSS_ENEMY = 'mr-moss-fireworm, mr-moss-cindermoth, mr-moss-anvil-arachne, mr-moss-slag-golem, mr-moss-flame-lizard, mr-moss-forge-imp, mr-moss-char-wraith, mr-moss-iron-guardian'
MOSS_ELITE = 'mr-moss-forge-titan, mr-moss-smelter-queen'
MOSS_EVENT = 'ev-moss-forge-flame, ev-stranger-favor, ev-moss-plaza-busy, ev-moss-hammer-row-line, ev-moss-furnace-arachne, ev-moss-watchtower-zenith, ev-moss-lighthouse-keeper, ev-moss-anvil-rhythm, ev-moss-tool-organize, ev-moss-workshop-apprentice, ev-moss-armor-polish, ev-moss-fissure-miner, ev-moss-clutch-stevedore, ev-moss-clutch-checker, ev-moss-ember-warden'

def moss_def(rid, name, desc):
    return (f'[{PFX}.region.{rid}]\n'
            f'name = {name}\n'
            f'description = {desc}\n'
            f'tier = 2\n'
            f'enemy_pool = {MOSS_ENEMY}\n'
            f'elite_enemy_pool = {MOSS_ELITE}\n'
            f'event_pool = {MOSS_EVENT}\n'
            f'primary_color = fire\n'
            f'specialty_item = i-forge-ember\n'
            f'legendary_cards = c-moss-ember-strike\n')

DEMON_DEF = (f'[{PFX}.region.demon-castle]\n'
             f'name = 마왕성\n'
             f'description = 루나 남쪽 끝의 마왕성·금단 회랑. 봉인된 방문·옛 명문·먼지. 마법학교에서 떨어져 나온 옛 권력의 자취.\n'
             f'tier = 3\n'
             f'enemy_pool = mr-luna-corridor-phantom, mr-luna-forbidden-wisp, mr-luna-mirror-shade, mr-luna-cursed-page, mr-luna-phantom-scribe\n'
             f'elite_enemy_pool = mr-luna-headmaster-shade, mr-luna-arcane-devourer\n'
             f'event_pool = ev-luna-forbidden-page, ev-luna-ward-shake, ev-mono-whisper\n'
             f'primary_color = dark\n'
             f'specialty_item = i-grimoire-ink\n')

HDR = re.compile(r'\[' + re.escape(PFX) + r'\.(region|node)\.([a-z0-9-]+)\]')

def main(apply=False):
    with io.open(BACKUP, 'r', encoding='utf-8', newline='') as f:
        text = f.read()
    lines = text.split('\n')
    out = []
    cur_type = None; cur_id = None
    skip_section = False
    demon_injected = False
    stats = {'node_region':0, 'reshud':0}
    for line in lines:
        m = HDR.search(line.strip()) if line.strip().startswith('[') else None
        if m:
            cur_type, cur_id = m.group(1), m.group(2)
            # 첫 node 섹션 직전에 demon-castle def 주입
            if cur_type == 'node' and not demon_injected:
                out.append(DEMON_DEF)  # 자체 개행 포함
                demon_injected = True
            # emberforge def 삭제
            if cur_type == 'region' and cur_id == 'emberforge':
                skip_section = True
                continue
            # moss def → 북/남 2개로 치환
            if cur_type == 'region' and cur_id == 'moss':
                skip_section = True
                out.append(moss_def('moss-north', '북 모스', '모스 북부 — 화산 능선·망루·증기실·여관. 대장간의 망치·증기.'))
                out.append(moss_def('moss-south', '남 모스', '모스 남부 — 광장·대장간·클러치 상륙장·항구. 망치·바닷내음.'))
                continue
            skip_section = False
            out.append(line); continue
        if skip_section:
            # emberforge/moss 원본 섹션 본문은 다음 헤더까지 버림
            continue
        st = line.strip()
        # triflower 풀 병합
        if cur_type == 'region' and cur_id == 'triflower':
            if st.startswith('enemy_pool ='): out.append(f'enemy_pool = {TRI_ENEMY}'); continue
            if st.startswith('elite_enemy_pool ='): out.append(f'elite_enemy_pool = {TRI_ELITE}'); continue
            if st.startswith('event_pool ='): out.append(f'event_pool = {TRI_EVENT}'); continue
        # enicham 이름
        if cur_type == 'region' and cur_id == 'enicham' and st.startswith('name ='):
            out.append('name = 에니챰 · 발전소 지대'); continue
        # 노드 region 재배정
        if cur_type == 'node' and st.startswith('region ='):
            old = st.split('=',1)[1].strip()
            new = node_region(cur_id, old)
            if new != old: stats['node_region'] += 1
            out.append(f'region = {new}'); continue
        # reshud 노드 neighbors
        if cur_type == 'node' and cur_id in RESHUD_NB and st.startswith('neighbors ='):
            out.append(f'neighbors = {RESHUD_NB[cur_id]}'); stats['reshud'] += 1; continue
        out.append(line)
    newtext = '\n'.join(out)
    if apply:
        with io.open(BACKUP, 'w', encoding='utf-8', newline='') as f:
            f.write(newtext)
        print('APPLIED to backup')
    else:
        print('DRY RUN')
    print('node region 변경:', stats['node_region'], '/ reshud 노드:', stats['reshud'], '/ demon-castle 주입:', demon_injected)

if __name__ == '__main__':
    import sys
    main(apply='--apply' in sys.argv)
