# 작문 지시서 — 타이머 사건 재집필·개작 (event_review_1: O 7 / ? 10)

> **대상**: 작가 에이전트
> **입력 데이터**:
> - `_review/event_review_1.json` — 17종의 이름·내용 전문·등장 권역 (각 `#N` 참조)
> - `_review/character_bible_1.json` — 캐릭터/보스 설정 (캐붕 방지 기준)
> - `public/data/events/act-1-region-events.txt` — 이미 작성된 타이머 바리에이션 142종 (형식·톤 예시)

---

## 1. 배경 / 작업 구분

타이머 사건 바리에이션 시스템 도입 후 기존 이벤트 36종을 검수했다. **X(폐기) 19종은 이미 데이터에서 완전 제거**됨. 이 지시서의 대상은 **살린 17종**:

- **O 재집필만 (7)**: 기존 컨셉·구조를 **유지**하고 문장만 JRPG 소설 톤으로 다듬는다. 내용 변경 최소.
- **? 컨셉 다듬어 사용 (10)**: 핵심 컨셉만 가져와 **새 사건으로 개작**한다. 자유도 높음.

---

## 2. 타이머 사건 바리에이션 형식 (INI)

한 사건 = `[event.{id}]` 헤더 + `[event.{id}.var.{N}]` 자식 섹션(턴 구간별 내용):

```ini
[event.ev-X]
node_kinds = event
weight = 1

[event.ev-X.var.1]
from_turn = 0
name = 이른 아침의 ...
body = (개입 전 짧은 글)
timer_cost = 2
resolved = (개입[타이머 사용] 후 바뀌는 글)
color = water:5        # 개입 보상 — 아래 보상키
```

- **from_turn**: 이 턴(경과)부터 활성. 시간대 하한. `0~300` (1턴=14.4분, 1일차 12:00 시작 → 4일차 12:00 종료, 300턴=3일). var는 **from_turn 오름차순, 1부터 연속**(중간 번호 빠지면 이후가 무시됨).
- **timer_cost**: 개입 비용 `1·2·3·5`. *변동성·파급*이 클수록 높게(보상 크기 기준 아님). `0`이면 개입 불가(지나치기만 — 보상 없는 분위기 바리에 사용).
- **resolved**: 개입하면 body가 이 텍스트로 교체된다(노드 소비 처리). 결과는 개입 전엔 숨겨짐.
- **보상키**(개입 시 적용): `color`(fire:5 등) / `gold` / `hp` / `heal_pct` / `grant_card = c-X` / `grant_relic = r-X` / `clue = cl-X` / `time_shards`. **유물도 `grant_relic`으로 줄 수 있다**(희소한 개입 보상으로 적합).
- **추가 조건**(선택): `min_visits = N`(N번째 방문부터), `require_clue`/`forbid_clue = cl-X`(단서 보유/미보유 게이트).
- **참조 예시**: `act-1-region-events.txt`의 142종 — 형식·길이·톤의 기준으로 삼을 것.

---

## 3. 대상 17종

(현재 이름·내용 **전문**은 `_review/event_review_1.json`의 해당 `#N` 항목 참조)

| #N | 판정 | id | 이름 | 현재 성격·등장 |
|---|---|---|---|---|
| #15 | O | `ev-filler-roadside-spring` | 온천 | 빈노드 폴백(ev-filler-*) |
| #28 | O | `ev-guardian-blessing` | 꼬마 수호정령 | 전 권역 공용(day>=2) |
| #29 | O | `ev-nekomata-bell` | 방울과 고양이 귀 | 전 권역 공용(day>=2) |
| #30 | O | `ev-baby-dragon-breath` | 아기 드래곤의 숨결 | 전 권역 공용(day>=2) |
| #31 | O | `ev-possession-wisp-follow` | 따라오는 도깨비불 | 어둠계 7권역(day>=2) |
| #32 | O | `ev-possession-shadow-doll` | 인형극 | 어둠계 7권역(day>=2) |
| #33 | O | `ev-hanabridge-shrine` | 하나브릿지 신전 | 어둠계 7권역(day>=2, once_per_run) |
| #7 | ? | `ev-blood-altar` | 붉은 제단 | 풀 미등록(고위험 컨셉) |
| #11 | ? | `ev-vault-collapse` | 무너지는 보고 | 풀 미등록(고위험 컨셉) |
| #17 | ? | `ev-filler-old-shrine` | 이끼 낀 사당 | 빈노드 폴백 |
| #19 | ? | `ev-filler-fork-merchant` | 원정 거래 | 빈노드 폴백 |
| #21 | ? | `ev-filler-quiet-pond` | 고요한 못 | 빈노드 폴백 |
| #22 | ? | `ev-filler-traveling-bard` | 떠도는 악사 | 빈노드 폴백 |
| #23 | ? | `ev-filler-emberfly-swarm` | 불나방 떼 | 빈노드 폴백 |
| #24 | ? | `ev-filler-stone-circle` | 페어리 서클? | 빈노드 폴백 |
| #25 | ? | `ev-filler-night-lantern` | 꺼져 가는 등불 | 빈노드 폴백 |
| #27 | ? | `ev-filler-timer-rift` | 시간의 균열 | 빈노드 폴백(시스템 슬라이스) |

### 작업 메모
- **O #28·29·30** (수호정령/방울고양이/아기드래곤): 전 권역 공용(day>=2). 공용성을 유지하되 소설 톤으로 재집필. 특정 권역에 묶지 말 것.
- **O #31·32·33** (도깨비불/인형극/하나브릿지): 어둠계 7권역(알리메스·루나·타코미·풍혈지대·에니챰·버섯동굴·마왕성) 계열. 계열 유지 재집필.
- **O #15 + ? filler 8종**: 빈노드 폴백(`ev-filler-*`). 개작 시 권역 특색을 부여해 1:1 매칭 후보로 승격 가능.
- **? #7·11** (붉은제단/무너지는보고): 고위험 컨셉이나 어느 권역에도 미배치. 개작해 어울리는 권역에 배치 권장(예: 어둠/철 계열 고티어).

---

## 4. 권역 배정 (1:1 매칭 방향)

- **게임 목표**: 사건 노드가 자기 권역의 사건을 우선 출력하고, 매칭 안 된 노드에서만 살린 기존 이벤트를 낸다.
- 각 이벤트를 어울리는 권역에 배정하고, 그 권역 `event_pool`(=`public/data/node-maps/act-1-map.txt`의 `[...region.{권역}]` 섹션의 `event_pool` 줄)에 id를 등록한다.
- 공용 사건(수호정령 등)은 다권역 등록을 유지해도 된다.
- 권역 톤·색·티어는 `act-1-map.txt`의 각 region `description`·`primary_color`·`tier` 참조.

---

## 5. 캐릭터 설정 (캐붕 방지)

등장 NPC/보스는 `_review/character_bible_1.json`의 확정 설정을 따른다. (작가 답변이 확정되면 그 값을 우선.) 설정 미정 캐릭터는 무리하게 등장시키지 말 것.

---

## 6. 톤 가이드 (필수 준수)

- 노출 prose에 **별표 강조·em-dash(—) 금지** (ASCII 하이픈 `-`은 보존).
- 시적 크러치("박자/자락/결/한 마디/한 호흡/한 겹")·"쥔 패" 표현·수량 표현(한 장/두 배 등)을 **flavor/name에 자제**(수치는 effects/labels로).
- 톤은 **귀엽게**. 호러·그로테스크 금지. 천사·악마는 OK, 다크는 X.
- 정령 = 어린아이의 귀여운 반말(예외: 레테언). 노출 텍스트에 **"몬무스" 금지**(고유 종족명 사용).
- **작명 소재 중복 금지**(부적·종·송곳니 등 같은 명사 반복 X — 대량 작명 전 빈도 집계).
- 종결 어미가 바뀌는 단어를 전역 치환했다면 조사 교정 필수.
- 상세 작문 가이드: 부모 `_workspace/krtext/`(02 스타일·09 인터뷰·11 desc·12 body) 참조.

---

## 7. 산출물

- 17종을 var.N INI로 작성(O는 재집필, ?는 개작).
- 권역 사건은 `act-1-region-events.txt`에 이어 쓰거나 신규 `public/data/events/events-rescued.txt`로.
- 작성한 사건 id를 배정 권역의 `event_pool`에 등록(또는 노드 `events` 필드). **폐기된 X 19종과 섞이지 않게** 할 것.
- 작성 후 정합성(var 번호 연속·참조 id 유효·필수 필드)을 자체 점검.
