#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
게임 데이터 prose 정리:
  - 강조 마커 '*' 전부 제거 (마크다운 렌더러 없음 → raw 노출되어 가독성 저하)
  - em/en-dash (—, –, ―) 제거 (과용된 stylistic dash)
ASCII 하이픈('-')은 보존 — ID(c-foo, npc-bar), 마이너스 숫자(hp = -2),
인명(알티-알타)에 쓰이므로 절대 건드리지 않음.
라인 단위로 처리하되 기존 공백 구조는 최대한 보존.
"""
import sys, glob, os, io

DASHES = ['—', '–', '―']  # U+2014, U+2013, U+2015

def clean_line(line: str) -> str:
    out = line
    # 1) 강조 별표 제거
    out = out.replace('*', '')
    # 2) ' — ' (양옆 공백) → 단일 공백
    for d in DASHES:
        out = out.replace(' ' + d + ' ', ' ')
    # 3) 남은 dash(붙은 경우 포함) 제거
    for d in DASHES:
        out = out.replace(d, '')
    # 4) 라인 끝 공백 정리(개행 보존)
    out = out.rstrip(' \t')
    return out

def process(path: str, apply: bool):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        text = f.read()
    # 개행 보존 위해 splitlines(keepends) 사용
    lines = text.splitlines(keepends=True)
    changed = 0
    new_lines = []
    samples = []
    for ln in lines:
        # 개행 분리
        if ln.endswith('\r\n'):
            body, nl = ln[:-2], '\r\n'
        elif ln.endswith('\n'):
            body, nl = ln[:-1], '\n'
        elif ln.endswith('\r'):
            body, nl = ln[:-1], '\r'
        else:
            body, nl = ln, ''
        cleaned = clean_line(body)
        if cleaned != body:
            changed += 1
            if len(samples) < 2:
                samples.append((body, cleaned))
        new_lines.append(cleaned + nl)
    if apply and changed:
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(''.join(new_lines))
    return changed, samples

def main():
    apply = '--apply' in sys.argv
    files = sorted(glob.glob('public/data/**/*.txt', recursive=True))
    total = 0
    for p in files:
        changed, samples = process(p, apply)
        if changed:
            total += changed
            print(f"{'APPLIED' if apply else 'WOULD CHANGE'} {changed:4d}  {p}")
            for b, c in samples:
                print(f"      - {b[:90]}")
                print(f"      + {c[:90]}")
    print(f"\nTOTAL lines changed: {total}  ({'APPLIED' if apply else 'DRY RUN'})")

if __name__ == '__main__':
    main()
