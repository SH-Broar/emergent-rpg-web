#!/usr/bin/env python3
"""
grid_validate.py — 격자 전투 *비배타 점유*(겹침 허용) 메커니즘 정적 검증.

칸 점유가 배타적이지 않다(플레이어·몬스터 같은 칸 겹침 허용)는 개편이 grid-combat.ts에
일관되게 반영됐는지 소스 패턴으로 확인한다. 코드 실행 없이 정규식만.

종료코드 0 = 통과(에러 0), 1 = 위반.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "systems" / "grid-combat.ts"

def main() -> int:
    if not SRC.exists():
        print(f"[ERROR] not found: {SRC}")
        return 1
    text = SRC.read_text(encoding="utf-8")
    errors = []
    oks = []

    def block(fn_name: str) -> str:
        """함수 본문 대략 추출(이름~다음 top-level 함수/끝)."""
        m = re.search(rf"function {re.escape(fn_name)}\b", text)
        if not m:
            return ""
        start = m.start()
        nxt = re.search(r"\nfunction \w|\nexport function \w", text[start + 5:])
        end = start + 5 + nxt.start() if nxt else len(text)
        return text[start:end]

    # 1) combatantsAt(복수 타깃 헬퍼)가 존재해야.
    if "export function combatantsAt" in text:
        oks.append("combatantsAt 헬퍼 존재")
    else:
        errors.append("combatantsAt 헬퍼가 없음 (한 칸의 모든 대상 타깃 불가)")

    # 2) isFreeTile 은 점유자 검사를 하면 안 됨(이동 목적지=walkable만).
    b = block("isFreeTile")
    if b and "combatantAt" in b:
        errors.append("isFreeTile 에 combatantAt 점유 검사가 남아 있음 (이동 칸 차단)")
    elif b:
        oks.append("isFreeTile 점유 검사 없음 (walkable만)")

    # 3) slideReach 경로에서 combatantAt break 가 없어야(전투원 통과).
    b = block("slideReach")
    if b and "combatantAt" in b:
        errors.append("slideReach 에 combatantAt 경로 차단이 남아 있음 (전투원 통과 불가)")
    elif b:
        oks.append("slideReach 전투원 통과 허용 (벽/void만 차단)")

    # 4) execAttack 근접 폴백 manhattan <= 1 (같은 칸 겹침 포함).
    b = block("execAttack")
    if b and re.search(r"manhattan\([^)]*\)\s*<=\s*1", b):
        oks.append("execAttack 근접 폴백 manhattan<=1 (겹침 타격)")
    elif b and re.search(r"manhattan\([^)]*\)\s*===\s*1", b):
        errors.append("execAttack 근접 폴백이 manhattan===1 (겹친 적 타격 불가)")

    # 5) execAttack shape 타깃이 combatantsAt 사용(겹친 플레이어 포함).
    if b and "combatantsAt" in b:
        oks.append("execAttack shape 타깃 combatantsAt (겹침 포함)")
    elif b:
        errors.append("execAttack shape 타깃이 combatantsAt 미사용")

    # 6) applyCardEffects shapeHits 가 combatantsAt 사용.
    b = block("applyCardEffects")
    if b and "combatantsAt" in b:
        oks.append("applyCardEffects AoE 타깃 combatantsAt (한 칸 다수 적)")
    elif b:
        errors.append("applyCardEffects shapeHits 가 combatantsAt 미사용")

    for o in oks:
        print(f"[OK] {o}")
    for e in errors:
        print(f"[ERROR] {e}")
    print(f"\n{'PASS' if not errors else 'FAIL'} — 에러 {len(errors)}")
    return 0 if not errors else 1

if __name__ == "__main__":
    sys.exit(main())
