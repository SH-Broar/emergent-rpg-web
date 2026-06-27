# 생성/수정 파일 — 고위험 사건 확장 (2026-06-22)

## 데이터 (append)
- `public/data/events/events-mvr.txt` — 고위험/한정보상 사건 8개 append
  - event.ev-blood-altar / ev-gambler-tent / ev-unknown-door / ev-alchemist-trade
  - event.ev-vault-collapse / ev-hungry-well / ev-dragon-scale / ev-mono-wager

## 코드 (custom 핸들러 신규 — 도박형은 데이터만으로 불가)
- `src/systems/event-effects.ts`
  - import 추가: `rng` (@/systems/rng)
  - 신규 핸들러 `gamble-all-gold` — 골드 전부 걸기(55% 두 배 / 45% 전부 상실)
  - 신규 핸들러 `mono-wager-shards` — 시간조각 전부 걸기(50% c-transcend-strike 획득·조각 유지 / 50% 조각 전부 상실)
  - 두 id는 validate-core.mjs가 event-effects.ts에서 정적 추출 → 화이트리스트 자동 통과

## 검증
- `npm run validate` → PASS, 에러 0 / 경고 0 (이벤트 230)
- `npx tsc --noEmit` → exit 0

## 참조한 실존 id (xref 통과 확인)
- 카드: c-transcend-strike(L), c-doom-mark(R), c-prism-strike(R), c-strike(basic, lose_card 타깃)
- 유물: r-glass-prism(L), r-cursed-coin(R), r-hungry-lamp(R)
- custom: grant-blessing, grant-bell-mark, grant-rare-material, gift-time-shards-3/5,
          pulse-all-colors-3, random-color-1, atk-color-1, grant-dragonform (+ 신규 2종)
- 아이템 조건: has-item:i-time-answer (grant-rare-material가 주는 희소 재료)
