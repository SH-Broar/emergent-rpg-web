# 대사 확장 — 다음 세션 이어가기 가이드

## 완료 현황

### 마로 엔야 (1499/2000 — 1차 완료)
- dialogues.txt: base(170) + close(100) + companion(100) + travel(30) = 400
- dialogues+stages.txt: 친구(60) + 신뢰(50) + 깊은유대(49) + continue 4단계(700) = 859
- dialogues+rdc-deep.txt: 신뢰(100) + 깊은유대(100) + gift(40) = 240
- dialogue_choices.txt: 6개 이벤트
- **남은 작업**: stages 친구/신뢰/깊은유대 섹션 확장으로 ~500 보충 가능

### 니아 이유르 / 하코 / 모노 (기존 ~1890 + travel 30)
- travel 섹션 추가 완료

---

## 나머지 44명 작업 프로세스 (A 방식)

### 1단계: 캐릭터 질문 (사용자에게 20개+)
actors.txt의 background를 기반으로 23개 질문을 사용자에게 제시:
- 정체성(1~4), 관계(5~8), 일상(9~12), 세계관(13~16), 성장(17~20), 비밀(21~23)
- **사용자가 잘못된 부분을 수정** → 분석 파일(CHAR_ANALYSIS_XXX.md) 저장

### 2단계: 대사 작성 (에이전트 병렬)
수정된 분석을 기반으로 Sonnet 에이전트 병렬 작성:

| 파일 | 섹션 | 목표 항목수 |
|------|------|------------|
| dialogues.txt | base | 170 |
| dialogues.txt | close | 100 |
| dialogues.txt | companion | 100 |
| dialogues.txt | travel | 30 |
| dialogues+stages.txt | 친구 | 60 |
| dialogues+stages.txt | 신뢰 | 50 |
| dialogues+stages.txt | 깊은유대 | 50 |
| dialogues+stages.txt | continue.낯선 | 150 |
| dialogues+stages.txt | continue.친구 | 200 |
| dialogues+stages.txt | continue.신뢰 | 150 |
| dialogues+stages.txt | continue.깊은유대 | 200 |
| dialogues+rdc-deep.txt | 신뢰 | 100 |
| dialogues+rdc-deep.txt | 깊은유대 | 100 |
| dialogues+rdc-deep.txt | gift (4종) | 40 |
| dialogue_choices.txt | 선택지 이벤트 | 6~10개 |
| **합계** | | **~1500+** |

### 3단계: 검증
- 금지 소재 grep 확인
- 항목 수 카운트
- 사용자 확인 후 push

---

## 캐릭터별 핵심 금지/주의 소재

### 마로 엔야
- 금지: "천재" 호칭/자각, 재능 부담, 아르바로 정령화 두려움
- 톤: 착하고 신념 있지만 재미는 좀 없는 친구
- 핵심: 하라티쿠스 사건 사망 처리, 본인 정령화 자각 없음, 아르바로와 행복한 가족

---

## 대사 구조 매핑 (코드 ↔ 데이터)

```
데이터 섹션명          → 코드 내부 키              사용 상황
[캐릭터]              → 캐릭터                   기본 대사 (단계 무관)
[캐릭터.close]        → 캐릭터.close             친한 사이
[캐릭터.companion]    → 캐릭터.companion         파티 동행
[캐릭터.travel]       → 캐릭터.travel            이동 중
[캐릭터.친구]          → 캐릭터.known             아는 사이 (remapStageKey)
[캐릭터.신뢰]          → 캐릭터.close             친한 사이 (remapStageKey, 합산)
[캐릭터.깊은유대]       → 캐릭터.companion         동료 (remapStageKey, 합산)
[캐릭터.continue.X]   → 캐릭터.continue.X        대화 계속
```

rdc-deep.txt의 .신뢰/.깊은유대도 같은 remapStageKey로 close/companion에 합산됨.
gift 섹션(캐릭터.gift.loved 등)은 선물 시스템에서 별도 사용.

## 다음 작업 순서 (Phase 1)
1. 크루하 — 풍신, 루나 교장, 999세
2. 임페리시아 — 인공지능, 모노가 만듬
3. 리엔카이 — 하피, 밤참새
4. 에코 — 땅의 사천왕, 드워프 대장장이
5. 카시스 — 불의 사천왕, 구미호
6. 시아 — 바람의 사천왕, 시이드 언니
7. 리무 — 물의 사천왕, 나방
