"""
cards-race.txt 격자 테마 변환 스크립트
- 베이스라인 단일 0,-1 을 카드 이름/효과/종족 정체성에 맞게 교체
- 이미 잘 설계된 카드(shape에 | 포함된 것, 직선2 이상)는 유지
- per_tile_mul, cast_speed 도 함께 조정
- effects/name/flavor/cost 는 절대 건드리지 않음
"""

import re, sys, copy

SRC = r"C:\WorkStation\EmergentRPG\EmergentRPG\emergent-rpg-web\public\data\cards\cards-race.txt"

# ────────────────────────────────────────────────────────────────
# 1. 파서: INI 섹션을 순서 보존 리스트로 읽기
# ────────────────────────────────────────────────────────────────
def parse_ini(path):
    """
    Returns list of (kind, content):
      kind='comment'  → raw comment/blank lines (str)
      kind='section'  → dict with '_header' and ordered list of (key,value) pairs
    """
    sections = []
    current_comments = []
    current_section = None

    with open(path, encoding='utf-8') as f:
        lines = f.readlines()

    def flush_comments():
        if current_comments:
            sections.append(('comment', ''.join(current_comments)))
            current_comments.clear()

    for line in lines:
        stripped = line.strip()
        if stripped.startswith('['):
            flush_comments()
            if current_section:
                sections.append(('section', current_section))
            current_section = {'_header': line, '_fields': []}
        elif current_section is not None:
            if '=' in line and not stripped.startswith('#'):
                k, _, v = line.partition('=')
                current_section['_fields'].append([k, v.rstrip('\n'), False])  # [key, value, is_inline_comment]
            else:
                # comment or blank inside section
                current_section['_fields'].append([None, line.rstrip('\n'), True])
        else:
            current_comments.append(line)

    if current_section:
        sections.append(('section', current_section))
    flush_comments()
    return sections


def get_field(sec, key):
    for f in sec['_fields']:
        if f[0] is not None and f[0].strip() == key:
            return f[1].strip()
    return None


def set_field(sec, key, value, after=None):
    """Set existing field or insert after `after` key."""
    for f in sec['_fields']:
        if f[0] is not None and f[0].strip() == key:
            # preserve original key string (with its spacing) but update value
            f[1] = ' ' + value
            return
    # insert after `after` key
    idx = len(sec['_fields'])
    if after:
        for i, f in enumerate(sec['_fields']):
            if f[0] is not None and f[0].strip() == after:
                idx = i + 1
                break
    sec['_fields'].insert(idx, [key, ' ' + value, False])


def del_field(sec, key):
    sec['_fields'] = [f for f in sec['_fields'] if f[0] is None or f[0].strip() != key]


def write_ini(sections, path):
    out = []
    for kind, content in sections:
        if kind == 'comment':
            out.append(content)
        else:
            out.append(content['_header'])
            for f in content['_fields']:
                if f[2]:  # comment/blank
                    out.append(f[1] + '\n')
                else:
                    out.append(f'{f[0]}={f[1]}\n')
    with open(path, 'w', encoding='utf-8') as fp:
        fp.write(''.join(out))


# ────────────────────────────────────────────────────────────────
# 2. 격자 설계 규칙 테이블
#    key = card id (without 'card.' prefix)
#    value = dict with shape, per_tile_mul (optional), cast_speed (optional)
#
#    설계 원칙:
#    - 단일(0,-1)         : 정밀 단타, 조건부/특수 효과
#    - 직선2(0,-1|0,-2)   : 먼 거리 관통, 빠른 공격
#    - 직선3(0,-1|0,-2|0,-3) : 긴 관통, 인간 대검/아르카나 빔
#    - 횡T(0,-1|-1,0|1,0) : 전방+좌우, 인간 균형/아르카나 디버프
#    - 십자(0,-1|0,1|-1,0|1,0) : 전방향 나방/아르카나 광역
#    - 광역3x3            : 대형 AOE (아르카나 피니셔)
#    - self               : 순수 자가 효과
#
#    per_tile_mul: 중심 1.0, 가장자리 0.5~0.8
#    cast_speed: fast(나방 다수), normal(기본), slow(광역/2코 이상 큰 카드)
# ────────────────────────────────────────────────────────────────

# 이미 잘 설계된 카드 ID (건드리지 않음)
SKIP_IDS = {
    # 이미 다중 shape
    'c-human-tailwind', 'c-human-tailwind-plus',
    'c-human-resolve', 'c-human-resolve-plus',
    'c-human-pin', 'c-human-pin-plus',
    'c-human-finalblow', 'c-human-finalblow-plus',
    'c-moth-pinprick', 'c-moth-pinprick-plus',
    'c-moth-triplet', 'c-moth-triplet-plus',
    'c-moth-tempest', 'c-moth-tempest-plus',
    'c-moth-gale', 'c-moth-gale-plus',
    'c-moth-flurry', 'c-moth-flurry-plus',
    'c-moth-cyclone', 'c-moth-cyclone-plus',
    'c-moth-stormcall', 'c-moth-stormcall-plus',
    'c-moth-tempocut', 'c-moth-tempocut-plus',
    'c-phantom-handcut', 'c-phantom-handcut-plus',
    'c-phantom-blankblade', 'c-phantom-blankblade-plus',
    'c-arcana-facet', 'c-arcana-facet-plus',
    # source=form (미사용)
    'c-moth-windgather',
}

# 개별 카드 설계 매핑 (base와 plus는 같은 shape 유지)
# 형식: card_id -> {shape, per_tile_mul(선택), cast_speed(선택), target_mode(선택)}
DESIGN = {

    # ── 인간 ── 균형: 공방 겸비, 단일/직선/횡T 혼합
    # 시그니처
    'c-human-balance':         {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-balance-plus':    {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-riposte':         {'shape':'0,-1', 'cast_speed':'fast'},     # 받아넘기기: 빠른 반격
    'c-human-riposte-plus':    {'shape':'0,-1', 'cast_speed':'fast'},
    'c-human-evenblade':       {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},  # 평정의 검: 균형 횡T
    'c-human-evenblade-plus':  {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'normal'},
    'c-human-adaptstrike':     {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-adaptstrike-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-hamstring':       {'shape':'0,-1', 'cast_speed':'fast'},     # 다리 후리기: 빠른 하체기
    'c-human-hamstring-plus':  {'shape':'0,-1', 'cast_speed':'fast'},
    'c-human-shatterguard':    {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-shatterguard-plus':{'shape':'0,-1', 'cast_speed':'normal'},

    # 하이브리드 공방
    'c-human-tradeblow':       {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-tradeblow-plus':  {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-twohands':        {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-twohands-plus':   {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-fairtrade':       {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},  # 등가교환: 균형 횡T
    'c-human-fairtrade-plus':  {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'normal'},
    'c-human-leveler':         {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},  # 고른 손: 균형 횡T
    'c-human-leveler-plus':    {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'normal'},
    'c-human-bulwarkblow':     {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-bulwarkblow-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-steadfast':       {'shape':'0,-1', 'cast_speed':'slow'},     # 굳건함: 2코 느리게
    'c-human-steadfast-plus':  {'shape':'0,-1', 'cast_speed':'slow'},

    # 적응형 변주
    'c-human-improvise':       {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-improvise-plus':  {'shape':'0,-1', 'cast_speed':'normal'},

    # 큰 한방
    'c-human-decisive':        {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'slow'},  # 결정타: 직선2 느리게
    'c-human-decisive-plus':   {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.8', 'cast_speed':'slow'},
    'c-human-overcome':        {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'slow'},  # 극복: 횡T 느리게
    'c-human-overcome-plus':   {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'slow'},
    'c-human-focuspoint':      {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.5', 'cast_speed':'slow'},  # 일점집중: 직선2 집중
    'c-human-focuspoint-plus': {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.5', 'cast_speed':'normal'},

    # 0코 회전
    'c-human-jab':             {'shape':'0,-1', 'cast_speed':'fast'},
    'c-human-jab-plus':        {'shape':'0,-1', 'cast_speed':'fast'},

    # 상태이상
    'c-human-laceration':      {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-laceration-plus': {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-emberbrand':      {'shape':'0,-1', 'cast_speed':'normal'},
    'c-human-emberbrand-plus': {'shape':'0,-1', 'cast_speed':'normal'},

    # 거중 반격 (2코 유지)
    'c-human-expose':          {'shape':'0,-1', 'cast_speed':'slow'},
    'c-human-expose-plus':     {'shape':'0,-1', 'cast_speed':'slow'},

    # 피 데미지
    'c-human-followthrough':   {'shape':'0,-1', 'cast_speed':'fast'},   # 혈투: 순간적
    'c-human-followthrough-plus':{'shape':'0,-1', 'cast_speed':'fast'},
    'c-human-bloodrage':       {'shape':'0,-1', 'cast_speed':'fast'},   # 피의 격노: 격렬
    'c-human-bloodrage-plus':  {'shape':'0,-1', 'cast_speed':'fast'},

    # 돌격 (strength + 공격)
    'c-human-warcry':          {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.5,0.5', 'cast_speed':'normal'},  # 돌격: 횡T
    'c-human-warcry-plus':     {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},

    # 전심전력 이미 단일이지만 slow가 맞음
    'c-human-allout':          {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'slow'},  # 전심전력: 전방위 느리게
    'c-human-allout-plus':     {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'slow'},

    # ── 나방 ── 속도/연사: fast 위주, 직선2, 작은 다중타
    'c-moth-flutter':          {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-flutter-plus':     {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-volley':           {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-volley-plus':      {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-quickjab':         {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-quickjab-plus':    {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-barrage':          {'shape':'0,-1', 'cast_speed':'fast'},     # 난사: 빠르게
    'c-moth-barrage-plus':     {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-combostrike':      {'shape':'0,-1', 'cast_speed':'normal'},   # 연격: 콤보 누적
    'c-moth-combostrike-plus': {'shape':'0,-1', 'cast_speed':'normal'},
    'c-moth-recall':           {'target_mode':'self'},                     # 자가 효과 유지
    'c-moth-recall-plus':      {'target_mode':'self'},
    'c-moth-accel':            {'target_mode':'self'},
    'c-moth-accel-plus':       {'target_mode':'self'},
    'c-moth-scatter':          {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'fast'},  # 흩날리기: 직선2 빠르게
    'c-moth-scatter-plus':     {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'fast'},
    'c-moth-dive':             {'shape':'0,-1', 'cast_speed':'fast'},     # 급강하: 빠르게
    'c-moth-dive-plus':        {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-blitz':            {'shape':'0,-1', 'cast_speed':'fast'},     # 연참: 빠르게
    'c-moth-blitz-plus':       {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-flick':            {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-flick-plus':       {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-spark':            {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-spark-plus':       {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-doubletap':        {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.8', 'cast_speed':'fast'},  # 두 발: 직선2
    'c-moth-doubletap-plus':   {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.8', 'cast_speed':'fast'},
    'c-moth-rapidfire':        {'shape':'0,-1', 'cast_speed':'fast'},     # 속사 연발: 빠르게
    'c-moth-rapidfire-plus':   {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-volleyup':         {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.8', 'cast_speed':'normal'},  # 모아 쏘기: 직선2
    'c-moth-volleyup-plus':    {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.8', 'cast_speed':'normal'},
    'c-moth-stinger':          {'shape':'0,-1', 'cast_speed':'fast'},     # 연침: 빠르게
    'c-moth-stinger-plus':     {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-windlash':         {'shape':'0,-1', 'cast_speed':'normal'},
    'c-moth-windlash-plus':    {'shape':'0,-1', 'cast_speed':'normal'},
    'c-moth-crescendo':        {'shape':'0,-1', 'cast_speed':'slow'},     # 마지막 소절: 클라이맥스
    'c-moth-crescendo-plus':   {'shape':'0,-1', 'cast_speed':'slow'},
    'c-moth-overdrive':        {'shape':'0,-1', 'cast_speed':'fast'},     # 과속: 빠르게
    'c-moth-overdrive-plus':   {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-cadence':          {'shape':'0,-1', 'cast_speed':'fast'},     # 가락: 빠르게
    'c-moth-cadence-plus':     {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-skyfall':          {'shape':'0,-1', 'cast_speed':'slow'},     # 빛살 낙하: slow
    'c-moth-skyfall-plus':     {'shape':'0,-1', 'cast_speed':'slow'},
    'c-moth-toxinburst':       {'shape':'0,-1', 'cast_speed':'fast'},     # 큰 부채질: 빠르게
    'c-moth-toxinburst-plus':  {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-shiv':             {'shape':'0,-1', 'cast_speed':'fast'},
    'c-moth-shiv-plus':        {'shape':'0,-1', 'cast_speed':'fast'},

    # ── 팬텀 ── 손패 관리: 보수적, 단일/전방2
    'c-phantom-handblade':     {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-handblade-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-overload':      {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-overload-plus': {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-voidstrike':    {'shape':'0,-1', 'cast_speed':'fast'},     # 숨긴 패: 빠른 기습
    'c-phantom-voidstrike-plus':{'shape':'0,-1', 'cast_speed':'fast'},
    'c-phantom-fullhand':      {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-fullhand-plus': {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-darkrend':      {'shape':'0,-1', 'cast_speed':'fast'},     # 카드 날리기: 빠르게
    'c-phantom-darkrend-plus': {'shape':'0,-1', 'cast_speed':'fast'},
    'c-phantom-discharge':     {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-discharge-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-empty':         {'shape':'0,-1', 'cast_speed':'slow'},     # 낙장불입: 결정적
    'c-phantom-empty-plus':    {'shape':'0,-1', 'cast_speed':'slow'},
    'c-phantom-static':        {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-static-plus':   {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-handguard':     {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-handguard-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-trickhand':     {'shape':'0,-1', 'cast_speed':'fast'},     # 손속임: 빠르게
    'c-phantom-trickhand-plus':{'shape':'0,-1', 'cast_speed':'fast'},
    'c-phantom-fanout':        {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'normal'},  # 패 펼치기: 직선2
    'c-phantom-fanout-plus':   {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'normal'},
    'c-phantom-bleedhand':     {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-bleedhand-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-drain':         {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-drain-plus':    {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-thinarmor':     {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-thinarmor-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-overcharge':    {'shape':'0,-1', 'cast_speed':'slow'},     # 에이스: 2코 느리게
    'c-phantom-overcharge-plus':{'shape':'0,-1', 'cast_speed':'slow'},
    'c-phantom-shortcircuit':  {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-shortcircuit-plus':{'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-hollow':        {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-hollow-plus':   {'shape':'0,-1', 'cast_speed':'normal'},
    'c-phantom-lastcard':      {'shape':'0,-1', 'cast_speed':'fast'},     # 마지막 패: 빠르게
    'c-phantom-lastcard-plus': {'shape':'0,-1', 'cast_speed':'fast'},
    'c-phantom-shock':         {'shape':'0,-1', 'cast_speed':'fast'},
    'c-phantom-shock-plus':    {'shape':'0,-1', 'cast_speed':'fast'},
    'c-phantom-burst':         {'shape':'0,-1', 'cast_speed':'slow'},     # 패의 작렬: 느리게
    'c-phantom-burst-plus':    {'shape':'0,-1', 'cast_speed':'slow'},
    'c-phantom-voidlance':     {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.6', 'cast_speed':'slow'},  # 허세: 직선2 느리게
    'c-phantom-voidlance-plus':{'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.6', 'cast_speed':'slow'},
    'c-phantom-thunderfist':   {'shape':'0,-1', 'cast_speed':'slow'},     # 피날레: slow
    'c-phantom-thunderfist-plus':{'shape':'0,-1', 'cast_speed':'slow'},

    # ── 아르카나 ── 색 공명: 직선/원거리, slow 경향
    'c-arcana-spire':          {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'normal'},  # 빛의 첨탑: 직선2
    'c-arcana-spire-plus':     {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'normal'},
    'c-arcana-prism':          {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},  # 분광: 횡T
    'c-arcana-prism-plus':     {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},
    'c-arcana-judgment':       {'shape':'0,-1|0,-2|0,-3', 'per_tile_mul':'1.0,0.8,0.6', 'cast_speed':'slow'},  # 빛의 심판: 직선3
    'c-arcana-judgment-plus':  {'shape':'0,-1|0,-2|0,-3', 'per_tile_mul':'1.0,0.8,0.6', 'cast_speed':'slow'},
    'c-arcana-spectrum':       {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},  # 스펙트럼: 횡T
    'c-arcana-spectrum-plus':  {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'normal'},
    'c-arcana-hex':            {'shape':'0,-1', 'cast_speed':'normal'},
    'c-arcana-hex-plus':       {'shape':'0,-1', 'cast_speed':'normal'},
    'c-arcana-overflow':       {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'slow'},  # 만조: 횡T 느리게
    'c-arcana-overflow-plus':  {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'slow'},
    'c-arcana-resonate':       {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.8', 'cast_speed':'slow'},  # 월광포: 직선2 slow
    'c-arcana-resonate-plus':  {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.8', 'cast_speed':'slow'},
    'c-arcana-beam':           {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.6', 'cast_speed':'fast'},   # 빛줄기: 직선2 빠르게
    'c-arcana-beam-plus':      {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.6', 'cast_speed':'fast'},
    'c-arcana-refract':        {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'normal'},  # 굴절: 직선2
    'c-arcana-refract-plus':   {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.7', 'cast_speed':'normal'},
    'c-arcana-glare':          {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.5,0.5', 'cast_speed':'normal'},  # 눈부심: 횡T
    'c-arcana-glare-plus':     {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'normal'},
    'c-arcana-searbrand':      {'shape':'0,-1', 'cast_speed':'normal'},
    'c-arcana-searbrand-plus': {'shape':'0,-1', 'cast_speed':'normal'},
    'c-arcana-unravel':        {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6', 'cast_speed':'slow'},  # 매듭 풀기: 횡T slow
    'c-arcana-unravel-plus':   {'shape':'0,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7', 'cast_speed':'slow'},
    'c-arcana-spark':          {'shape':'0,-1', 'cast_speed':'fast'},     # 작은 빛: 빠르게
    'c-arcana-spark-plus':     {'shape':'0,-1', 'cast_speed':'fast'},
    'c-arcana-glowfade':       {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.6', 'cast_speed':'normal'},  # 잔광: 직선2
    'c-arcana-glowfade-plus':  {'shape':'0,-1|0,-2', 'per_tile_mul':'1.0,0.6', 'cast_speed':'normal'},
    'c-arcana-radiance':       {'shape':'0,-1|-1,-1|1,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6,0.5,0.5', 'cast_speed':'slow'},  # 광휘: 5방향 느리게
    'c-arcana-radiance-plus':  {'shape':'0,-1|-1,-1|1,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7,0.6,0.6', 'cast_speed':'slow'},
    'c-arcana-zenith':         {'shape':'0,-1|0,-2|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.5,0.5', 'cast_speed':'slow'},  # 정점의 빛: 십자형 느리게
    'c-arcana-zenith-plus':    {'shape':'0,-1|0,-2|-1,0|1,0', 'per_tile_mul':'1.0,0.8,0.6,0.6', 'cast_speed':'slow'},
    'c-arcana-aurora':         {'shape':'0,-1|-1,-1|1,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.6,0.6,0.5,0.5', 'cast_speed':'slow'},  # 백야: 5방향
    'c-arcana-aurora-plus':    {'shape':'0,-1|-1,-1|1,-1|-1,0|1,0', 'per_tile_mul':'1.0,0.7,0.7,0.6,0.6', 'cast_speed':'slow'},
}

# ────────────────────────────────────────────────────────────────
# 3. 적용 로직
# ────────────────────────────────────────────────────────────────

def has_multi_shape(sec):
    """이미 멀티 타일 shape가 있으면 True"""
    s = get_field(sec, 'shape')
    if s and '|' in s:
        return True
    return False


def apply_design(sec, design):
    """design dict의 값으로 카드 섹션 필드 덮어쓰기"""
    tm = design.get('target_mode')
    shape = design.get('shape')
    ptm = design.get('per_tile_mul')
    cs = design.get('cast_speed')

    # target_mode 처리
    if tm == 'self':
        # self 카드: shape/per_tile_mul 제거, target_mode=self 설정
        set_field(sec, 'target_mode', 'self', after='effects')
        del_field(sec, 'shape')
        del_field(sec, 'per_tile_mul')
    elif shape:
        set_field(sec, 'shape', shape, after='effects')
        set_field(sec, 'target_mode', 'pattern', after='shape')
        if ptm:
            set_field(sec, 'per_tile_mul', ptm, after='shape')
        else:
            del_field(sec, 'per_tile_mul')

    if cs:
        set_field(sec, 'cast_speed', cs, after='target_mode')


def main():
    sections = parse_ini(SRC)
    changed = 0
    skipped_skip = 0
    skipped_multi = 0
    skipped_nodesign = 0

    stats = {'human': 0, 'moth': 0, 'phantom': 0, 'arcana': 0, 'other': 0}

    for kind, content in sections:
        if kind != 'section':
            continue
        header = content['_header'].strip()
        # [card.c-xxx-yyy]
        m = re.match(r'\[card\.(.+)\]', header)
        if not m:
            continue
        cid = m.group(1)

        # SKIP_IDS: 건드리지 않음
        if cid in SKIP_IDS:
            skipped_skip += 1
            continue

        # 이미 멀티 shape이면 건드리지 않음
        if has_multi_shape(content):
            skipped_multi += 1
            continue

        # DESIGN 테이블에 없으면 노터치
        if cid not in DESIGN:
            skipped_nodesign += 1
            continue

        design = DESIGN[cid]
        apply_design(content, design)
        changed += 1

        # 종족 통계
        if cid.startswith('c-human'):
            stats['human'] += 1
        elif cid.startswith('c-moth'):
            stats['moth'] += 1
        elif cid.startswith('c-phantom'):
            stats['phantom'] += 1
        elif cid.startswith('c-arcana'):
            stats['arcana'] += 1
        else:
            stats['other'] += 1

    write_ini(sections, SRC)

    print(f"=== 격자 테마 변환 완료 ===")
    print(f"  변경: {changed}장")
    print(f"  스킵(SKIP_IDS): {skipped_skip}장")
    print(f"  스킵(멀티shape이미있음): {skipped_multi}장")
    print(f"  스킵(DESIGN미정의): {skipped_nodesign}장")
    print(f"  종족별: 인간 {stats['human']} / 나방 {stats['moth']} / 팬텀 {stats['phantom']} / 아르카나 {stats['arcana']}")


if __name__ == '__main__':
    main()
