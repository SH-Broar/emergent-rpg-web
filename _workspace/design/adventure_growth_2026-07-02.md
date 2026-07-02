# 모험·성장 확충 배치 (2026-07-02)

FunQA(playtest/funqa_2026-07-02.md) 후속. 사용자 재량 위임: "모험과 성장에서 부족한 부분을 정리하고 콘텐츠를 대량 추가/수정". 제약: 소규모 권역에 마을 추가 금지, 신규 권역 추가 보류(세계관 확장 고민 중), 유물 일반 공급 재개 안 함(타이머 보상 경로만).

## 부족점 정리

성장:
- 타이머 보상 파이프라인 미완 — 프리미엄 15종(c-tm/i-tm/r-tm)은 작성됐지만 지급 경로가 없음
- 일반 전투 성장 훅 부재, 강화 접근 느림(XP3=강화1) — 밸런스 트랙으로 보류(이번 스코프 밖)

모험:
- 이동에 조건이 없어 탐험이 "걸어가면 끝" — 간선 잠금 부재
- 소권역(별빛고원·버섯동굴·어촌·광산 3노드, 르슈드 4노드)이 이름만 있는 수준 — 심층 구조 없음
- 마을을 경유할 동선 이유 부족(우편 리듬 부재), 발견 콘텐츠(권역 사건) 얇음

## 이번 배치 4작업

### 1. 길드 우편(타이머 드립) — B안 변형 확정 스펙
- 런 시작: timers.cur = 연구 보너스(0~2)만, max = 10+보너스. BASE_TIMERS 전량 선지급 폐지.
- 경과 30턴마다 우편 2통 생성(pending=2). 생성 시 알림 "길드 앞으로 우편이 도착했다".
- 어느 마을이든 길드에서 수령: 타이머 +2. **다음 30턴은 수령 시점부터 기산** — 미수령 동안 사이클 정지. 최속 수령 시 30·60·…·150턴에 총 10개(=기존 총량), 60턴 주기를 넘기면 300턴 안에 다 못 받음. 고난이도 동선 압박 의도.
- 개입 보상 훅: 사건 개입으로 타이머 1개 소비마다 프리미엄 풀(c-tm/i-tm/r-tm 15종)에서 1개 지급(유물은 미보유만, 카테고리 균등, 결정론 rng).
- HUD: 우편 도착 뱃지 + 다음 우편까지 남은 턴.

### 2. 간선 잠금 (conditionalNeighbors 활성화)
- INI 문법(고정 계약): `conditional_neighbors = <nodeId>|<requires>, <nodeId>|<requires>`
- requires DSL: `cleared:<nodeId>` / `event:<nodeId>:cleared` / `clue:<clueId>` / `item:<itemId>` / `level:<n>` / `day:<n>` / `color:<key>:<n>`
- 충족 시 양방향 통행. 미충족 간선은 맵에 점선+잠금 표시 + 사유 라벨. 미지 형식은 잠김 유지+경고.
- 데이터 규율: 메인 동선은 항상 열려 있고 심층/지름길만 잠근다.

### 3. 소권역 확충 (+24노드, 마을 금지)
- 별빛고원(T2) 3→8, 버섯동굴(T3) 3→8, 어촌(T3) 3→8, 광산(T4) 3→8, 르슈드(T1) 4→8
- 각 권역: 조우/채집/사건/휴식(또는 활동) + 심층 노드 1~2개는 간선 잠금(권역 내부 조건)
- 노드 id 계약: n-starlight-loom/hollow/shrine/ledge/crown · n-mush-gill/spore-run/glowpool/warm-nook/heartcap · n-fishv-pier/netyard/tidecave/driftfire/deepreef · n-mine-lamprow/crossdig/ventshaft/toolroom/motherlode · n-reshud-mile/oldgate/wayrest/dustfield

### 4. 권역 사건 15종 (신규 파일 events/act-1-smallregion-events.txt)
- 5권역 × 3종, 일부 timer_cost 개입 분기 포함(개입 보상 훅과 자동 연동)
- 사건 id 계약: ev-splat-01~03 / ev-mush-01~03 / ev-fishv-01~03 / ev-mine-01~03 / ev-reshud-01~03

## 실행·검증
- Wave 1 병렬 4: 우편(implementer), 간선(implementer), 맵 확충(creator), 사건(creator) — 파일 영역 분리(loader.ts 등록은 조율자가 일괄)
- Wave 2: game-qa 통합 검증 + code-reviewer 병렬 + npm run build
- 되돌리기 쉬움: 전부 미커밋 작업트리, 데이터 파일 단위 분리
