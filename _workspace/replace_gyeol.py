# -*- coding: utf-8 -*-
"""
이벤트 prose의 추상 "결" 표현을 다양한 대체어로 회전 치환.
- 정상 단어 보존: 결계/결정/결국/결합/결심/결과/결말(결 다음 글자로 판별) + 연결/완결/해결/물결(결 앞 글자로 판별).
- 그 외 추상 결(결이/결을/결에/결로/결은/결의/결만/결대로/한 결/나뭇결 등) → 회전 대체.
- 섹션 헤더([..])·주석(#)·키 이름은 건드리지 않음(= 우변 값만 처리).
"""
import sys, io, glob

FILES = ['public/data/events/act-1-region-events.txt', 'public/data/events/events-mvr.txt']
SKIP_AFTER = set('계정국합심과말')   # 결계 결정 결국 결합 결심 결과 결말
SKIP_BEFORE = set('연완해물')        # 연결 완결 해결 물결
REPL = ['자락', '틈', '겹', '마디', '올', '무늬', '가닥', '켜', '줄']

state = {'i': 0, 'kept': 0, 'changed': 0}

def last_jong(w):
    """마지막 한글 글자의 종성 인덱스(0=받침없음, 8=ㄹ, -1=한글아님)."""
    c = w[-1]
    if '가' <= c <= '힣':
        return (ord(c) - 0xAC00) % 28
    return -1

def conv(text):
    # 특수: 나뭇결(나무 결) → 나뭇무늬(실재 단어).
    text = text.replace('나뭇결', '나뭇무늬')
    out = []
    n = len(text)
    i = 0
    while i < n:
        ch = text[i]
        if ch != '결':
            out.append(ch); i += 1; continue
        before = text[i-1] if i > 0 else ''
        after = text[i+1] if i+1 < n else ''
        if after in SKIP_AFTER or before in SKIP_BEFORE:
            out.append('결'); state['kept'] += 1; i += 1; continue
        w = REPL[state['i'] % len(REPL)]; state['i'] += 1; state['changed'] += 1
        out.append(w); i += 1
        # 조사 일치 보정 (w의 받침에 맞춰 다음 조사 교정).
        jong = last_jong(w)
        has = jong > 0
        rieul = jong == 8
        if i < n:
            p = text[i]
            if p == '을':   out.append('을' if has else '를'); i += 1
            elif p == '이': out.append('이' if has else '가'); i += 1
            elif p == '은': out.append('은' if has else '는'); i += 1
            elif p == '과': out.append('과' if has else '와'); i += 1
            elif p == '로': out.append('로' if (rieul or not has) else '으로'); i += 1
    return ''.join(out)

def process_line(line):
    s = line.lstrip()
    if s.startswith('[') or s.startswith('#'):
        return line
    if '=' in line:
        k, v = line.split('=', 1)
        return k + '=' + conv(v)
    return conv(line)

def main(apply=False):
    samples = []
    for path in FILES:
        with io.open(path, 'r', encoding='utf-8', newline='') as f:
            text = f.read()
        lines = text.split('\n')
        new = []
        for ln in lines:
            nl = process_line(ln)
            if nl != ln and len(samples) < 8:
                samples.append((ln.strip()[:80], nl.strip()[:80]))
            new.append(nl)
        if apply:
            with io.open(path, 'w', encoding='utf-8', newline='') as f:
                f.write('\n'.join(new))
    print(f"changed(추상 결): {state['changed']}, kept(정상단어): {state['kept']}")
    for a, b in samples:
        print('  -', a)
        print('  +', b)
    print('APPLIED' if apply else 'DRY RUN')

if __name__ == '__main__':
    main(apply='--apply' in sys.argv)
