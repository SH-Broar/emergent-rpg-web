# Harness — 게임 데이터 작성 가이드

RDC-Roguelike의 *모든 콘텐츠*는 `public/data/*/` 하위의 INI-style `.txt` 파일로 정의됩니다. 이 문서는 *각 단위별로 빠르게 추가·확장*할 수 있도록 *필드 레퍼런스 + 살아있는 예시 + 공통 규칙*을 모은 것입니다.

---

## 공통 규칙

### INI 포맷 (모든 데이터 파일 공통)

```ini
# 한 줄 주석 (또는 ; 도 가능)
[section_kind.section_id]
key = value
list_field = a, b, c     ; 콤마 분리 리스트
encoded_field = damage:5:enemy, draw:1   ; 콜론 분리 + 콤마 다중
```

- `[section]` 헤더가 *데이터 항목 1개*
- `section.id` 형식 — id가 `parser.ts` 기준 식별자
- 같은 키 반복 시 *마지막 값* 우선
- `+태그.txt` 파일명 접미사는 *자동 병합* — 같은 종류 데이터를 여러 파일로 나눠 작성 가능 (예: `cards.txt` + `cards+rdc.txt`)

### 파일 위치

| 단위 | 폴더 |
|---|---|
| 연표 | `public/data/timelines/` |
| 종족 | `public/data/races/` |
| 캐릭터 | `public/data/characters/` |
| 노드 맵 | `public/data/node-maps/` |
| NPC | `public/data/npcs/` *(아직 빈 단위)* |
| 카드 | `public/data/cards/` |
| 유물 | `public/data/relics/` |
| 몬스터 | `public/data/monsters/` |
| 보스 | `public/data/bosses/` |
| 이벤트 | `public/data/events/` |
| 카오스 | *(현재는 코드 등록; 추후 데이터 파일 이전 가능)* |
| 자원·제작 | *(시스템 코드; 추후 제작 카탈로그 데이터화)* |

### 검증

- 데이터 변경 후: `npm run dev` 콘솔 — loader가 실패한 파일을 `[loader] failed to load ...`로 출력
- 빌드 검증: `npm run build` — TypeScript 타입까지 검사
- 런타임 검증: 게임 시작 시 데이터 로드 후 모든 참조가 유효한지 확인 (id 매칭)
- **공통 함정:** 카드/유물/노드 등의 `id` 참조가 정확해야 함. 오타 시 콘솔 경고.

### 데이터 추가 워크플로우

1. 해당 폴더에 `.txt` 파일 추가 (예: `cards+myaddition.txt`)
2. 그 안에 `[card.my-card-id]` 형식으로 새 섹션 작성
3. 다른 곳에서 참조하는 id (캐릭터 시작 덱, 이벤트 보상 등)에 추가
4. `npm run dev`로 동작 확인 — 콘솔에 경고 없으면 OK
5. (선택) `npm run build`로 타입 검증

---

## 1. 연표 (Timeline)

> 게임의 *최상위 단위*. 한 런이 1개 연표 안에서 진행됨.

**폴더:** `public/data/timelines/`  
**섹션 prefix:** `timeline.`  
**살아있는 예시:** `peace-310.txt`

### 필드

```ini
[timeline.<id>]
name = 표시 이름
description = 한 줄 설명
year = 정수 (게임 내 연도)
era = 시대 톤 (평온/위기/결핍 등; 자유 텍스트)
tagline = UI 카드 부제 (선택)
node_map = <node-map id>           # 어떤 맵 사용
events = ev-a, ev-b, ev-c          # 출현 가능한 이벤트 id 리스트
characters = char-a, char-b        # 선택 가능한 캐릭터 id 리스트
npcs = npc-a, npc-b                # 등장 NPC id 리스트
time_limit = 7                     # 노드 방문 카운트 임계 (보스 게이트)
deck_expansion = 3, 5              # 덱 10→20→30 임계 [방문 N, 방문 N]
boss = <boss id>                   # 종말 위협 보스
mission_goal = 플레이어에게 안내될 한 줄 목표
unlock =                           # 비어 있으면 기본 해금. 메타 키 (예: insight2-50)
shareable = true                   # 세계 티켓 공유 가능 여부
thumbnail =                        # 카드 그리드 이미지 (선택)
```

### 팁

- 첫 연표는 `unlock` 비워둠 (기본 해금)
- `time_limit`이 너무 작으면 *맵 탐험 X*. 노드 수의 60~80%가 적정.
- `deck_expansion = 3, 5`는 *3번 방문 후 덱 20장, 5번 방문 후 30장*
- *이벤트 풀*은 *모든 노드 후보*에서 추첨됨 — 자주 등장시키려면 풀 작게.

---

## 2. 종족 (Race)

> 캐릭터의 *시드 카드 풀* + *이벤트 분기 기준*.

**폴더:** `public/data/races/`  
**섹션 prefix:** `race.`  
**살아있는 예시:** `race-human.txt`

### 필드

```ini
[race.<id>]
name = 종족 이름
description = 한 줄 설명
category = humanoid | beastkin | flight | dragon-divine | plant | construct  # 자유롭게 확장
primary_element = light | water | fire | wind | iron | earth | electric | dark  # 8원소
secondary_element = wind                # 선택
seed_cards = c-strike, c-defend, c-strike  # 시작 시드 카드 id (중복 OK — 시작 덱에 직접 들어감)
seed_relics = r-determined-heart        # 시작 유물 id (선택)
hp_bonus = 0                            # 시작 HP 보너스
mp_bonus = 0                            # 시작 MP 보너스
```

### 팁

- `seed_cards`는 *캐릭터 시작 덱*에 *그대로* 들어감 (인간 = 일격 3장 + 자세 3장 등)
- 종족마다 7~12장의 시드 카드 추천 (시작 덱은 10장)
- *원소*는 카드의 시너지·이벤트 분기에 사용 (현재는 시각 색상만)

---

## 3. 캐릭터 (Character)

> 한 시간대에 깃들 *그릇*. 시작 덱 + 5단계 히페리온 미션 + 시그니처.

**폴더:** `public/data/characters/`  
**섹션 prefix:** `character.`  
**살아있는 예시:** `transcendent-01.txt`

### 필드 (메인 섹션)

```ini
[character.<id>]
name = 캐릭터 이름
description = 한 줄 설명
race = <race id>
base_npc = <npc id>                  # (선택) 본래 RDC 인물
hp = 32
mp = 12
attack = 5
defense = 2
vigor = 10
starting_deck = c-a, c-a, c-b, ...   # 10장 (종족 시드와 별개로 정의 가능)
unlock =                             # 잠금 조건 (메타 키)
portrait =                           # (선택)
tagline = UI 부제
```

### 히페리온 5단계 (각 단계 별도 섹션)

```ini
[character.<id>.hyperion.1]
requirement = 자유 텍스트 ("노드 3개 방문" 등)
hp = 5
attack = 1
reward_card = <card id>              # 1~2단계: 일반 등급
boss_signature =

[character.<id>.hyperion.5]
requirement = 보스 게이트 도달
hp = 5
attack = 2
defense = 1
reward_card = <전설 카드 id>          # 5단계: 전설 시그니처
boss_signature = <signature id>      # 5단계만 — 보스전 양상 변형
```

### 팁

- 단계 1~5 *모두 작성* (누락 시 placeholder 들어감)
- *requirement*는 *현재 자동 트리거 미구현* — 추후 캐릭터 harness에서 평가 로직 추가
- *boss_signature*는 5단계에만; 같은 id를 `boss.<id>.signature_variants`와 연결

---

## 4. 노드 맵 (Node Map)

> 한 연표의 거미줄 그래프.

**폴더:** `public/data/node-maps/`  
**섹션 prefix:** `nodemap.<map-id>` + `nodemap.<map-id>.node.<node-id>`  
**살아있는 예시:** `peace-310-map.txt`

### 헤더 + 노드들

```ini
[nodemap.<map-id>]
name = 맵 이름
description = 한 줄
start_node = <node id>           # 첫 노드 (마을 권장)
boss_gate = <node id>            # 보스 노드

[nodemap.<map-id>.node.<node-id>]
kind = village | combat | event | elite | boss | rest | shop | workshop
label = 노드 표시 이름
description = drawer에 표시될 한 줄
x = 0.0~1.0                      # 정규화 좌표 (SVG viewBox 100×100)
y = 0.0~1.0
neighbors = id-1, id-2, id-3     # 양방향 인접 (양쪽에 모두 적을 필요 X — 단방향이면 한쪽만)
enemy = <monster id>             # combat/elite 노드용
boss = <boss id>                 # boss 노드용
events = ev-a, ev-b              # event 노드의 풀
npcs = npc-a, npc-b              # village 노드의 NPC 풀 (NPC harness 이후)
is_start = true                  # (선택) 시작 노드 표시
is_boss_gate = true              # (선택) 보스 게이트 표시
```

### 조건부 인접 (선택)

```ini
[nodemap.<map-id>.node.<node-id>.conditional_neighbors]
# 데이터 구조는 준비됨. 현재는 코드 없음 — 추후 노드 harness에서 활성화.
```

### 팁

- *좌표 0~1 정규화*는 SVG가 100×100 viewBox라서 *position.x * 100*으로 변환됨
- 시작 노드 옆에 *첫 콘텐츠* 배치 권장 (전투 또는 이벤트)
- 보스 게이트 *직전*에 *휴식 노드*를 두면 페이싱 좋음
- *조건부 인접*은 향후 *완료 이벤트 만족 시 추가 길*에 사용

---

## 5. NPC (아직 빈 단위)

> *시간대 거주자*. 친밀도 시스템 매개. 카드 보상 출처.

**폴더:** `public/data/npcs/` *(아직 schema·loader 없음 — NPC harness 작업 시 추가)*  
**현재 상태:** 캐릭터 schema의 `base_npc` 필드와 노드의 `npcs` 풀로 *참조*만 됨. 실제 NPC 데이터는 *NPC harness*에서 도입 예정.

### 향후 필드 (예상)

```ini
[npc.<id>]
name = 이름
race = <race id>
role = 직업/역할
location = 주된 노드 id
trait = 성격 키워드
affinity_rewards = npc-card-a:level1, npc-card-b:level3, npc-card-c:level5
gift_loved = item-a, item-b
gift_liked = item-c
gift_disliked = item-d
```

→ NPC harness 단계에서 결정.

---

## 6. 카드 (Card)

> 핵심 게임플레이 단위. 4등급 + 5가지 효과.

**폴더:** `public/data/cards/`  
**섹션 prefix:** `card.`  
**살아있는 예시:** `cards-mvr.txt`

### 필드

```ini
[card.<id>]
name = 표시 이름
description = (선택) 도감 텍스트
rank = basic | common | rare | legendary
source = race | character | npc | hyperion | event | relic | boss
element = light | water | fire | wind | iron | earth | electric | dark   # (선택)
cost = 1                                  # 마나 비용
trigger = manual | on-draw | on-turn-end | on-take-damage | persistent
effects = damage:6:enemy, draw:1          # 효과 리스트 (콜론으로 kind:value:target 인코딩)
custom_effect =                           # (선택) 함수 슬롯 키 — 코드 등록 필요
flavor = 플레이버 텍스트
unlock_hint = "이리엘과 3단계 친밀도" 같은 UI 안내
```

### 효과 종류 (kind)

| kind | value | target | 동작 |
|---|---|---|---|
| `damage` | 데미지 | enemy / all-enemies / random-enemy | 적 HP - value (방어 먼저) |
| `heal` | 회복량 | self | 자신 HP + value |
| `block` | 방어량 | self / enemy | 방어막 + value |
| `draw` | 장수 | self | 카드 N장 드로우 |
| `apply-status` | 스택 | enemy / self | params.status 키로 상태 부여 |

### 등급 자동 매핑

- `basic` = 시작 시드 (종족 카드)
- `common` = NPC 1단계 / 히페리온 1~2 / 흔한 이벤트 / 마을 제작
- `rare` = NPC 3단계 / 히페리온 3~4 / 엘리트 / 희귀 유물
- `legendary` = 보스 / 시그니처 / 특이 이벤트

### 팁

- *효과 인코딩*은 `kind:value:target` — target 없으면 기본값(damage=enemy, heal/block=self)
- 다중 효과는 콤마: `effects = damage:5:enemy, draw:1, block:3:self`
- 등급별 효과 *수치 가이드*: basic 5~6 / common 7~9 / rare 10~15 / legendary 15+

---

## 7. 유물 (Relic)

> 패시브 효과. 카드와 평행하게 4등급.

**폴더:** `public/data/relics/`  
**섹션 prefix:** `relic.`  
**살아있는 예시:** `relics-mvr.txt`

### 필드

```ini
[relic.<id>]
name = 유물 이름
description = 한 줄
rank = basic | common | rare | legendary
source = race | character | event | elite | boss | shop | meta
trigger = passive | on-combat-start | on-combat-end | on-node-enter | on-card-play | on-rest
effects = bonus-hp:5, bonus-mana:1        # kind:value (target 없음)
custom_effect =                            # 함수 슬롯 (선택)
flavor = 플레이버
```

### 유물 효과 (kind — 추후 확장)

| kind | value | 동작 |
|---|---|---|
| `bonus-hp` | N | 최대 HP +N |
| `bonus-mana` | N | 매 턴 시작 마나 +N |
| `bonus-gold` | N | 전투 종료 시 골드 +N |
| `bonus-damage` | N | 모든 데미지 +N |
| `discount` | 0.1~0.5 | 제작 비용 N 비율 할인 |

⚠️ *유물 효과의 실제 코드 적용은 아직 미구현*. 데이터 정의만 가능. 추후 유물 harness에서 핸들러 등록.

---

## 8. 몬스터 (Monster)

> 전투 노드의 적. 골드 + 시간의 조각 + 카드 드롭.

**폴더:** `public/data/monsters/`  
**섹션 prefix:** `monster.`  
**살아있는 예시:** `mvr-monsters.txt`

### 필드

```ini
[monster.<id>]
name = 적 이름
description = (선택) 도감 텍스트
tier = minion | normal | elite
hp = 14
attack = 5
defense = 0
intents = attack:5, attack:5, defend:4    # 의도 패턴 (턴마다 순회)
gold = 5                                   # 드롭 골드
time_shards = 2                            # 드롭 시간의 조각
card_drops = c-shadow-rebuke:0.25          # 카드 id:확률, 콤마로 다수
appears_in = nodemap-a, nodemap-b          # (선택) 등장 가능 맵 필터
```

### 의도 (intent) 인코딩

| kind | value | 동작 |
|---|---|---|
| `attack` | N | 다음 턴에 데미지 N |
| `defend` | N | 다음 턴에 방어막 N |
| `buff` | N | 자신의 strength +N |

### 팁

- *minion*: HP 10~20, 드롭 적음
- *normal*: HP 20~35
- *elite*: HP 35~60, 더 좋은 드롭 (전설 카드 확률)
- *intents*는 *순회* — `attack:5, defend:4, attack:7`이면 턴마다 그 순서로 반복

---

## 9. 보스 (Boss)

> 연표 종말 위협. 다단계 페이즈 + 시그니처 양상.

**폴더:** `public/data/bosses/`  
**섹션 prefix:** `boss.` (+ `.phase.N`, `.signature.<id>`)  
**살아있는 예시:** `boss-shadow.txt`

### 메인 섹션

```ini
[boss.<id>]
name = 보스 이름
description = 한 줄
timeline = <timeline id>             # 어느 연표의 종말
hp = 60
attack = 8
defense = 2
reward_unlocks = unlock-tl-x, unlock-character-y   # 클리어 시 메타 해금 키
reward_soul = 10                                   # 영혼 자원
reward_codex = boss-id, codex-entry-a              # 도감 등록 트리거
intro = 보스전 도입 텍스트
defeat_text = 클리어 후 결말 텍스트
```

### 페이즈 (다단계)

```ini
[boss.<id>.phase.1]
starts_at = 1.0                       # HP 100%부터
intents = attack:6, defend:5, attack:8, buff:1

[boss.<id>.phase.2]
starts_at = 0.5                       # HP 50% 이하로
intents = attack:9, attack:9, defend:8, attack:12
```

⚠️ 페이즈 전환 코드는 아직 *현재 phase.1만 사용* — 보스 harness에서 페이즈 전환 로직 활성화.

### 시그니처 양상 (캐릭터별 변형, 향후)

```ini
[boss.<id>.signature.<signature-id>]
dialogue = 양상별 대화 (캐릭터에 따라 다른 대화)
intent_overrides = attack:12, defend:10   # (선택) intent 덮어쓰기
```

---

## 10. 이벤트 (Event)

> 본문 + 선택지 + 분기. 단위 완결 원칙.

**폴더:** `public/data/events/`  
**섹션 prefix:** `event.` (+ `.choice.N`)  
**살아있는 예시:** `events-mvr.txt`

### 메인 + 선택지

```ini
[event.<id>]
name = 이벤트 제목
node_kinds = event, village, rest    # 어느 노드 종류에서 발동?
seasons = spring, autumn             # (선택) 특정 계절만
weight = 2                           # 풀에서 추첨 가중치
once_per_run = true                  # 런당 1회
unlock_key =                         # (선택) 메타 키
featured_npcs = npc-a, npc-b         # 등장 NPC (도감 등록 트리거)
body = |
  본문 (여러 줄도 OK — 한 키에 \n으로 또는 indented 다음 줄로)
  500~1000자 권장.

[event.<id>.choice.1]
label = 선택지 라벨
condition =                          # (선택) "has-card:friendship" 등 — 미구현
hp = -3                              # HP 변화
gold = +5                            # 골드 변화
draw = 1                             # 카드 드로우 (런 내)
affinity = npc-a:1                   # 친밀도 변화 (npc id : delta)
grant_card = c-burn-mark             # 카드 보상 (이름 lookup 자동)
grant_relic = r-token                # 유물 보상
followup = <next event id>           # (선택) 후속 이벤트
custom =                             # (선택) 함수 슬롯
result_text = 선택 후 표시될 결과 한 줄

[event.<id>.choice.2]
label = 다른 선택
...
```

### 종족별·재방문 분기 (향후 확장 슬롯)

현재 schema는 *단일 선택지 풀*. 향후 이벤트 harness에서 다음 슬롯 추가 예정:
- `[event.<id>.choice.N.race.<race-id>]` — 특정 종족 시 다른 결과
- `[event.<id>.revisit.2]` — 2회 방문 시 다른 본문/선택지

### 팁

- *body*는 줄바꿈 보존 (`white-space: pre-line`)
- 선택지는 최대 6개 (UI 한계)
- *result_text*는 *부가 설명*. 이미 hp/gold 같은 효과는 *자동으로 라인*에 추가됨.

---

## 11. 카오스 (Chaos)

> 매 런 단위 특수 기능 토글.

**현재 상태:** schema는 `stores/chaos.ts` 안에 정의됨. 데이터 파일 형식은 아직 *코드에 등록*하는 방식.

### 향후 데이터 파일 (예상)

```ini
[chaos.<id>]
name = 카오스 이름
description = 한 줄
unlock_key =                        # (선택) 연구 해금 키
affects_meta = false                # 메타 진행에 영향?
```

→ 카오스 harness에서 *catalog 자동 로드*로 전환 예정.

---

## 12. 자원 시스템 + 제작

> *시스템 코드*. 데이터 파일이 아닌 시스템 정의.

### 자원 현황 (코드)

| 자원 | 위치 | 시간 단위 |
|---|---|---|
| 마나 | `RunState.combat.mana` | 런 휘발, 매 턴 리셋 |
| 골드 | `RunState.gold` | 런 휘발 |
| 시간의 조각 | `RunState.timeShards` | 런 휘발 (제작 전용) |
| HP/MP | `RunState.hp/mp` | 런 휘발 |
| 영혼 | `MetaProgress.soulResource` | 영구 |
| 게이지 (5) | `MetaProgress.gauges` | 영구 |

### 제작 (현재)

- 마을: 일반 등급 카드 풀에서 *랜덤 3장 → 1장 선택* (시간의 조각 5)
- 공방: 셸만 존재 (다음 라운드 분기 결정 필요)

### 제작 카탈로그 데이터화 (향후)

```ini
[craft.<id>]
location = village | workshop       # 어디서 제작?
input_shards = 5
input_gold = 0
input_cards = card-a:1              # (선택) 재료 카드
output_rank = common                # 추첨될 등급
output_pool = all | race | character | special   # 풀 종류
```

---

## 검증 명령어 (TODO — 향후 추가)

현재는 `npm run dev` / `npm run build`의 콘솔 출력으로 검증. 향후 추가 권장:

```bash
npm run validate    # (TODO) 모든 INI 파싱 + 참조 무결성 + 등급 매핑 자동 검증
npm run lint:data   # (TODO) 데이터 스타일 검사 (id naming, 줄 길이 등)
```

---

## 우선순위 권장 (콘텐츠 확장 순서)

1. **연표 1~2개 추가** — 다양한 시대 체험 (시간대 선택지 풍부)
2. **카드 30~50장 추가** — 가장 자주 추가될 단위
3. **몬스터 5~10종 추가** — 전투 다양성
4. **이벤트 10~20개 추가** — 분량 큰 콘텐츠
5. **종족 3~5개 추가** — 시작 덱 다양화
6. **캐릭터 2~3명 추가** — 다른 시그니처 양상
7. **유물 10~20개 추가**
8. **보스 1~2개 추가** — 연표 추가에 맞춰
9. **NPC harness 작성** (현재 빈 단위)
10. **공방 메커니즘 디테일 결정 + 데이터화**

---

## 관련 문서

- `../README.md` — 게임 전체 안내
- `../.omc/specs/deep-interview-rdc-roguelike-pivot.md` — 게임 정체성 spec
- `../.omc/plans/autopilot-impl.md` — Phase 별 구현 계획
