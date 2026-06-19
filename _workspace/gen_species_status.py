#!/usr/bin/env python3
# 특징 없는(상태 공격 0) 몬스터에 종족별 시그니처 상태 부여 공격 추가 (2026-06-19)
#  + beastkin 과밀 완화: 잘못 분류된 게→crab, 도마뱀/살라만더→emberling(기존 종족 재사용, 안전).
#  새 상태(혼란/졸음/빙의/점액/각인/잠식/경련)를 종족별로 분산. 빙의는 wraith만(시전 시 자멸 — 전투 단축).
import re, os, glob

# 종족 → (status, 공격이름). 적이 *플레이어에 거는 디버프*만.
SIG = {
    'golem': ('imprint','낙인'), 'gargoyle': ('imprint','낙인'), 'gemling': ('imprint','새김'), 'arcane': ('imprint','각인'), 'phantom': ('imprint','지우기'),
    'spirit': ('confusion','홀리기'), 'windfae': ('confusion','어지럽히기'), 'fairy': ('confusion','홀리기'), 'sprite': ('confusion','장난'),
    'wraith': ('possession','들러붙기'),
    'automaton': ('spasm','전류 교란'), 'construct': ('spasm','과부하'), 'drone': ('spasm','전파 방해'),
    'harpy': ('drowsy','자장가'), 'cat': ('drowsy','그르렁'), 'raccoon': ('drowsy','홀리는 손짓'),
    'werewolf': ('sap','물어뜯기'), 'leech': ('sap','흡혈'), 'diropel': ('sap','갉기'), 'shade': ('sap','그림자 잠식'),
    'insect': ('slime','끈끈이'), 'spider': ('slime','거미줄'), 'arachne': ('slime','거미줄'), 'vial': ('slime','점액 splash'), 'crab': ('slime','거품'), 'otter': ('slime','젖은 손'),
    'emberling': ('burn','불씨'), 'drake': ('burn','불길'),
    'orc': ('weakness','윽박'),
    'lamia': ('sleep','최면'),
}
BEASTKIN_VARY = [('drowsy','어르기'), ('sap','할퀴기'), ('slime','진흙 칠')]  # beastkin 분산
REASSIGN = {  # beastkin → 기존 종족(과밀 완화)
    '진흙 게':'crab', '절벽 게':'crab', '용암 게':'crab',
    '화염 도마뱀':'emberling', '용암 살라만더':'emberling',
}
STATUS_N = {'imprint':2,'confusion':1,'possession':1,'spasm':1,'drowsy':1,'sap':2,'slime':2,'burn':2,'weakness':2,'sleep':1}

def hid(s): return sum(ord(c) for c in s)

added=reassigned=0
for fp in glob.glob("public/data/monsters/act-1-roster-*.txt"):
    txt=open(fp,encoding='utf-8').read(); nl='\r\n' if '\r\n' in txt else '\n'
    lines=txt.split(nl)
    heads=[i for i,l in enumerate(lines) if l.lstrip().startswith('[monster.')]; heads.append(len(lines))
    # 뒤에서부터 처리(삽입으로 인덱스 안 밀리게)
    for hi in range(len(heads)-2,-1,-1):
        a,b=heads[hi],heads[hi+1]
        name=species=tier=None; atk_idxs=[]; has_status=False; sp_line=-1
        for i in range(a,b):
            s=lines[i].strip()
            if s.startswith('name ='): name=s.split('=',1)[1].strip()
            elif s.startswith('species ='): species=s.split('=',1)[1].strip(); sp_line=i
            elif s.startswith('tier ='): tier=s.split('=',1)[1].strip()
            elif re.match(r'grid_attack_\d+\s*=',s):
                atk_idxs.append(i)
                p=s.split('|')
                if len(p)>=7 and p[6].strip(): has_status=True
        if not name or not atk_idxs or has_status: continue  # 특징 있음/공격 없음 → skip
        # 재분류
        if name in REASSIGN and species!=REASSIGN[name]:
            new_sp=REASSIGN[name]
            lines[sp_line]=re.sub(r'(=\s*).*$', lambda m:m.group(1)+new_sp, lines[sp_line])
            species=new_sp; reassigned+=1
        # 시그니처 상태
        if species=='beastkin':
            st,anm=BEASTKIN_VARY[hid(name)%len(BEASTKIN_VARY)]
        else:
            sig=SIG.get(species)
            if not sig: continue  # 매핑 없는 종족(드묾) skip
            st,anm=sig
        n=STATUS_N.get(st,1)+(1 if tier=='elite' else 0)
        # atk 필드(피해) 추정 — 블록의 attack=N
        atk_val=6
        for i in range(a,b):
            m=re.match(r'\s*attack\s*=\s*(\d+)',lines[i])
            if m: atk_val=int(m.group(1)); break
        dmg=max(1,atk_val//2)
        # 다음 grid_attack 인덱스
        maxidx=max(int(re.search(r'grid_attack_(\d+)',lines[i]).group(1)) for i in atk_idxs)
        newline=f"grid_attack_{maxidx+1} = {anm} | 0,-1 0,1 -1,0 1,0 | 1,1,1,1 | {dmg} | normal | true | {st}:{n}"
        lines.insert(atk_idxs[-1]+1, newline)
        added+=1
    open(fp,'w',encoding='utf-8').write(nl.join(lines))
    print(f"  {os.path.basename(fp)} 처리")
print(f"\n상태 공격 추가 {added}종 / beastkin 재분류 {reassigned}종")
