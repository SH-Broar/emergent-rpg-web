# EmergentRPG 히페리온 200 루트 설계 리포트

작성일: 2026-04-19
대상: 히페리온 총합 **195 (실질 상한)** 달성을 위한 플레이 루트 가이드

---

## 서론: 시스템 이해와 이론 상한

### 메커니즘 요약
- **대상 범위**: 히페리온 레벨은 *플레이어 + 플레이어가 만난(`knownActorNames`) NPC 중 `acquisitionMet`/`recruited`/`companion` 상태인 자*만 오른다. 즉, 영입되거나 "친한 사이"에 도달한 캐릭터만 상승.
- **총합 계산**: `allActors.reduce((s,a)=>s+a.hyperionLevel,0)` — 세계의 모든 Actor(38 NPC + 플레이어) 총합. 만나지 못한 NPC는 0으로 계산.
- **레벨당 보너스**: HP +10, MP +5, 공격 +2, 방어 +1, Vigor +5. 총합 기반 누적.
- **hyperion.txt 정의**: `__default__` + 38명.

### 이론 상한
- 플레이어 1명 × Lv.5 = 5
- NPC 38명 × Lv.5 = 190
- **이론 최대치 = 195**
- "200"은 설계상 목표치(symbolic) — 현 데이터 스키마로는 달성 불가. 40명×Lv.5 = 200은 탄생 캐릭터 시스템이 `__default__`를 플레이어 외 1명 이상에 적용하는 변형에서만 성립.

### 조건 평가상의 핵심 순환
- `hyperion_total:N` 류는 **자기 자신의 기여를 포함한 총합 검사**. 자기 Lv.5 조건이 `hyperion_total:99`라면, 자기 Lv.4 = 4까지 포함하여 나머지 95가 필요.
- 순환은 없으며, **단방향 상승** (한 번 오른 레벨은 감소하지 않음).

---

## A. 캐릭터별 히페리온 비용 지도 (38명)

> 난이도 표기: ★☆☆☆☆(매우 쉬움) ~ ★★★★★(매우 어려움)
> "의존"은 다른 캐릭터의 레벨/영입 요구를 의미

### A-1. 시작권 (difficulty 1~2, 초반 허브)

#### [니아 이유르] — 시작 캐릭터
| 레벨 | 조건 | 선행 행동 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | visited_count:5 | 5개 지역 방문 | ★☆☆☆☆ | 없음 |
| Lv.2 | conversation_count:5 | NPC 5명과 대화 | ★☆☆☆☆ | 없음 |
| Lv.3 | days_passed:10 | 게임 10일 | ★☆☆☆☆ | 시간 경과 |
| Lv.4 | visited_count:15 | 15개 지역 | ★★☆☆☆ | 탐험 |
| Lv.5 | hyperion_total:99 | 총합 99 | ★★★★☆ | 거의 모든 캐릭터 선행 |

**영입 즉시**: 시작 캐릭터, 조건 없음. Lv.1~4를 초반에 쉽게 달성할 수 있어 **총합 캐리어**.

#### [하코] (difficulty 1)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | location_visited:World_Tree | 세계수 방문 | ★★☆☆☆ | 라르 포레스트 진입 |
| Lv.2 | location_visited:Manonickla | 마노니클라 방문 | ★★☆☆☆ | 서쪽 사막 진출 |
| Lv.3 | location_visited:Uppio_Swamp | 우피오 늪 | ★★★☆☆ | 후반 습지 |
| Lv.4 | location_visited:Halpia | 부유 섬 할퓌아 | ★★★☆☆ | 상공 진출 |
| Lv.5 | all_locations_visited | 전 지역 방문 | ★★★★★ | 모든 지역 로딩 완료 전제 |

**영입**: 원작 퀘스트형 이벤트 — 자동 합류. 조건 없음.

#### [이연] (difficulty 1)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | dungeon_clear_count:1 | 던전 1회 | ★☆☆☆☆ | 없음 |
| Lv.2 | vigor_spent:1000 | 기력 1000 소비 | ★☆☆☆☆ | 일상 플레이 |
| Lv.3 | visited_count:10 | 10개 지역 | ★★☆☆☆ | 탐험 |
| Lv.4 | color_value:Wind:0.5 | 바람 속성 0.5 | ★★★☆☆ | 바람 대화/장비 편중 |
| Lv.5 | recruited_count:10 | 동료 10명 | ★★★☆☆ | 중후반 |

**영입**: 마로 엔야와 동행 중 루나에서 이연과 대화 → 마로 선행.

#### [마로 엔야] (difficulty 1)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | conversation_count:5 | 5회 대화 | ★☆☆☆☆ | 없음 |
| Lv.2 | activities_done:10 | 활동 10회 | ★☆☆☆☆ | 일상 |
| Lv.3 | hyperion_total:10 | 총합 10 | ★★☆☆☆ | 초반 집계 필요 |
| Lv.4 | stat_total:50 | 공+방 50 | ★★★☆☆ | 장비 성장 |
| Lv.5 | damage_dealt:20000 | 누적 피해 20k | ★★★☆☆ | 전투 누적 |

**영입**: 마법학교 루나 방문 후 대화. 초반 루나 접근성이 핵심.

#### [아카샤] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | relationship:마로 엔야:0.5 | 마로와 호감 0.5 | ★★☆☆☆ | 마로 영입·선물 |
| Lv.2 | activities_done:15 | 활동 15회 | ★☆☆☆☆ | 일상 |
| Lv.3 | all_elements_recruited | 8속성 동료 | ★★★★★ | 폭넓은 영입 |
| Lv.4 | all_races_recruited | 8종족 동료 | ★★★★★ | 폭넓은 영입 |
| Lv.5 | hyperion_total:100 | 총합 100 | ★★★★☆ | 중후반 |

**영입**: 니아 Lv.2 & 마로 Lv.1 선행.

#### [칼리번] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | location_visited:Moss | 모스 방문 | ★★☆☆☆ | 라르 동쪽 |
| Lv.2 | hyperion_levels:엘네스트:1 | 엘네스트 Lv.1 | ★★★☆☆ | 엘네스트 영입 |
| Lv.3 | treasure_found:10 | 보물상자 10 | ★★★☆☆ | 던전 반복 |
| Lv.4 | vigor_spent:5000 | 기력 5000 | ★★★☆☆ | 일상 누적 |
| Lv.5 | hyperion_total:70 | 총합 70 | ★★★★☆ | 중후반 |

**영입**: 마을 5곳 이상 + 동료 5명 → 라르 포레스트 깊은 곳의 집.

#### [쿠르쿠마] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | conversation_with:크루하 | 크루하와 대화 | ★★★★☆ | 크루하 해금 후 |
| Lv.2 | location_visited:World_Tree | 세계수 | ★★☆☆☆ | 라르 |
| Lv.3 | companion_days:쿠르쿠마:10 | 쿠르쿠마 10일 동행 | ★★☆☆☆ | 영입 후 |
| Lv.4 | color_value:Earth:0.6 | 땅 속성 0.6 | ★★★☆☆ | 땅 편향 |
| Lv.5 | hyperion_total:60 | 총합 60 | ★★★☆☆ | 중반 |

**영입**: 동료 4명 + 미유와 대화 + 마로 Lv.1. 미유는 에니챰 30%+시계탑 100% 선행.

#### [시이드] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | actor_recruited:시이드 | 시이드 영입 | ★★☆☆☆ | 영입 즉시 달성 |
| Lv.2 | visited_count:10 | 10지역 | ★★☆☆☆ | |
| Lv.3 | days_passed:30 | 30일 | ★★☆☆☆ | 시간 |
| Lv.4 | companion_days:시이드:15 | 시이드 15일 동행 | ★★★☆☆ | |
| Lv.5 | hyperion_total:40 | 총합 40 | ★★★☆☆ | |

**영입**: 조류 1명 또는 바람 2명 + 마노니클라 방문 후 시장. Lv.1 자동 달성형.

#### [루디] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | items_sold:3 | 3개 판매 | ★☆☆☆☆ | 상점 |
| Lv.2 | items_sold:10 | 10개 | ★☆☆☆☆ | |
| Lv.3 | treasure_found:5 | 보물 5회 | ★★☆☆☆ | |
| Lv.4 | gold_spent:300 | 골드 300 소비 | ★☆☆☆☆ | |
| Lv.5 | gold_spent:1000 | 골드 1000 | ★★☆☆☆ | |

**영입**: 마틴 항 + 히페리온 10 + 동료 3명 + 150G. 꽤 초중반 접근.

#### [테오] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | food_eaten:3 | 3종 음식 | ★☆☆☆☆ | |
| Lv.2 | food_eaten:5 | 5종 | ★★☆☆☆ | 다양한 식재 |
| Lv.3 | activities_done:20 | 활동 20 | ★★☆☆☆ | |
| Lv.4 | food_eaten:8 | 8종 | ★★★☆☆ | 요리/채집 |
| Lv.5 | activities_done:50 | 활동 50 | ★★★☆☆ | 누적 |

**영입**: 히페리온 10 + 마틴 항 + 마노니클라. 테오는 **음식 + 활동 반복**으로 효율적.

#### [노노] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | food_eaten:2 | 2종 | ★☆☆☆☆ | |
| Lv.2 | companion_days:미유:5 | 미유 5일 동행 | ★★★☆☆ | 미유 영입 선행 |
| Lv.3 | visited_count:20 | 20지역 | ★★★☆☆ | |
| Lv.4 | color_value:Dark:0.4 | 어둠 0.4 | ★★★☆☆ | |
| Lv.5 | friend_count:5 | 호감 0.3+ NPC 5명 | ★★☆☆☆ | |

**영입**: 미유와 대화 + 마로 동행 + 루나 실습동 30% → 미유 영입 후.

#### [카르디] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | friend_count:5 | 호감 5명 | ★★☆☆☆ | |
| Lv.2 | treasure_found:15 | 보물 15회 | ★★★★☆ | 던전 반복 |
| Lv.3 | dungeon_clear_count:15 | 던전 15 | ★★★☆☆ | |
| Lv.4 | damage_taken:30000 | 피격 30k | ★★★☆☆ | |
| Lv.5 | gold_spent:5000 | 골드 5000 | ★★★★☆ | 경제 누적 |

**영입**: "수상한 카드" + "카르디의 초대장" 소지. 아이템 획득이 선행.

#### [에코] (difficulty 2)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | actor_recruited:시아 | 시아 영입 | ★★★★★ | 시아=히페리온 50 |
| Lv.2 | all_recruited:카시스,시아,리무,모노 | 사천왕+모노 | ★★★★★ | 최종반 |
| Lv.3 | items_crafted:20 | 제작 20 | ★★★☆☆ | |
| Lv.4 | hyperion_levels:카시스:3,시아:3,리무:3 | 사천왕 전원 Lv.3 | ★★★★★ | 순환 지점 |
| Lv.5 | relationship:에코:0.8 | 에코와 0.8 | ★★★★☆ | 호감 축적 |

**영입**: 히페리온 30 + 일루네온 광장. **Lv.1부터 시아 의존** → 실질적으로는 종반에 레벨 완성.

### A-2. 중반권 (difficulty 3)

#### [리엔카이] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | location_visited:Void_Forest | 허공 숲 | ★★★☆☆ | |
| Lv.2 | monsters_killed:50 | 50마리 | ★★☆☆☆ | |
| Lv.3 | damage_dealt:5000 | 누적 5k | ★★☆☆☆ | |
| Lv.4 | monster_types:10 | 10종 | ★★★☆☆ | |
| Lv.5 | max_damage:500 | 단일 500 | ★★★★☆ | 고공격 |

**영입**: 히페리온 30 + "반딧불 머리핀" + 니아 동행 + 이벤트 전투 승리. 모노 영입 전제조건.

#### [카요] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | location_visited:Manonickla_Forge | 카요 공방 | ★★☆☆☆ | |
| Lv.2 | conversation_with:모노 | 모노와 대화 | ★★★★★ | **모노 = 최종** |
| Lv.3 | color_value:Iron:0.7 | 철 0.7 | ★★★★☆ | 편향 필요 |
| Lv.4 | items_crafted:30 | 제작 30 | ★★★☆☆ | |
| Lv.5 | hyperion_total:50 | 총합 50 | ★★★☆☆ | |

**영입**: 히페리온 25 + 드래곤/철 동료 1 + 마노니클라. Lv.2가 **종반 의존**.

#### [제로] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | actor_recruited:알티 알타 | 알타 영입 | ★★★★☆ | 상호 의존 |
| Lv.2 | location_visited:Night_Tacomi | 나이트 타코미 | ★★★☆☆ | |
| Lv.3 | color_value:Electric:0.5 | 전기 0.5 | ★★★☆☆ | |
| Lv.4 | items_crafted:10 | 제작 10 | ★★☆☆☆ | |
| Lv.5 | color_value:Electric:0.7 | 전기 0.7 | ★★★★☆ | |

**영입**: 나이트 타코미 30% + 초대장 + 카미키 대화 + 히페리온 15 + "제로의 생활" 퀘스트.

#### [아르바로 엔야] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | activities_done:5 | 활동 5 | ★☆☆☆☆ | |
| Lv.2 | location_visited:Luna_Academy | 루나 | ★★☆☆☆ | |
| Lv.3 | conversation_count:10 | 대화 10 | ★☆☆☆☆ | |
| Lv.4 | stat_total:40 | 공+방 40 | ★★★☆☆ | |
| Lv.5 | dungeon_clear_count:10 | 던전 10 | ★★★☆☆ | |

**영입**: 마로 Lv.2 + 마로 동행 + 라르 포레스트. 마로 선행 체인.

#### [리비트] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | monster_types:5 | 5종 | ★☆☆☆☆ | |
| Lv.2 | visited_count:15 | 15지역 | ★★☆☆☆ | |
| Lv.3 | damage_dealt:8000 | 누적 8k | ★★☆☆☆ | |
| Lv.4 | actor_recruited:화이트 팡 | 화이트 팡 영입 | ★★★★☆ | 후반 |
| Lv.5 | dungeon_clear_count:20 | 던전 20 | ★★★☆☆ | |

**영입**: 할퓌아 + 히페리온 15 + 동료 5명.

#### [윤희원] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | monster_types:3 | 3종 | ★☆☆☆☆ | |
| Lv.2 | companion_days:윤희원:10 | 10일 동행 | ★★☆☆☆ | |
| Lv.3 | party_stat_total:100 | 파티 100 | ★★★☆☆ | 장비 |
| Lv.4 | visited_count:20 | 20지역 | ★★★☆☆ | |
| Lv.5 | monsters_killed:1000 | 1000 처치 | ★★★★★ | 장기 누적 |

**영입**: 니아 Lv.2 + 퀘스트 15개 + 산정. 산정은 알리메 설산 정상.

#### [엘네스트] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | recruited_count:3 | 3명 | ★☆☆☆☆ | |
| Lv.2 | vigor_spent:2000 | 기력 2k | ★★☆☆☆ | |
| Lv.3 | treasure_found:20 | 보물 20 | ★★★★☆ | |
| Lv.4 | hyperion_total:20 | 총합 20 | ★★☆☆☆ | |
| Lv.5 | damage_dealt:100000 | 누적 10만 | ★★★★★ | 장기 누적 |

**영입**: 칼리번 Lv.1 + "붉은 망토" 장비 + 허공 숲 30%.

#### [카미키] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | activities_done:10 | 활동 10 | ★☆☆☆☆ | |
| Lv.2 | items_crafted:5 | 제작 5 | ★★☆☆☆ | |
| Lv.3 | conversation_with:모노 | 모노 대화 | ★★★★★ | 최종 |
| Lv.4 | activities_done:30 | 활동 30 | ★★★☆☆ | |
| Lv.5 | damage_dealt:30000 | 3만 누적 | ★★★☆☆ | |

**영입**: 루나 실습동 30% + "영차원 입자붕괴 큐브" + 모스 방문.

#### [모나토] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | conversation_with:카르디 | 카르디 대화 | ★★☆☆☆ | |
| Lv.2 | damage_taken:20000 | 피격 20k | ★★★☆☆ | |
| Lv.3 | conversation_with:카미키 | 카미키 대화 | ★★★☆☆ | |
| Lv.4 | hyperion_levels:윤희원:3 | 윤희원 Lv.3 | ★★★★☆ | 윤희원 장기 동행 |
| Lv.5 | all_locations_visited | 전 지역 | ★★★★★ | |

**영입**: 히페리온 10 + "파란 눈의 전학생에 대한 소문" 퀘스트 + 몬스터 20종.

#### [루핀] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | companion_days:루핀:3 | 3일 동행 | ★☆☆☆☆ | |
| Lv.2 | location_visited:Triflower | 트리플라워 | ★★★☆☆ | |
| Lv.3 | color_value:Fire:0.5 | 불 0.5 | ★★★☆☆ | |
| Lv.4 | relationship:루핀:0.7 | 루핀 0.7 | ★★★☆☆ | 선물 반복 |
| Lv.5 | hyperion_total:45 | 총합 45 | ★★★☆☆ | |

**영입**: 히페리온 20 + 카르디 동행 + 퀘스트 10개 + 루나 이벤트 전투 승리.

#### [리무] (difficulty 3, 사천왕)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | actor_recruited:카시스 | 카시스 영입 | ★★★★☆ | 카시스 |
| Lv.2 | all_recruited:에코,카시스,시아,모노 | 사천왕+모노 | ★★★★★ | |
| Lv.3 | food_eaten:6 | 6종 | ★★★☆☆ | |
| Lv.4 | hyperion_levels:에코:3,카시스:3,시아:3 | 사천왕 Lv.3 | ★★★★★ | |
| Lv.5 | relationship:리무:0.8 | 0.8 | ★★★★☆ | |

**영입**: 히페리온 40 + 라르:도토리나무 숲 클리어.

#### [미유] (difficulty 3)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | food_eaten:3 | 3종 | ★☆☆☆☆ | |
| Lv.2 | visited_count:20 | 20지역 | ★★★☆☆ | |
| Lv.3 | actor_recruited:피닉스 | 피닉스 영입 | ★★★★★ | 종반 |
| Lv.4 | items_crafted:5 | 5회 | ★★☆☆☆ | |
| Lv.5 | dungeon_clear_count:30 | 30회 | ★★★★☆ | |

**영입**: 에니챰 30% + 시계탑 100% + 마로 Lv.2.

### A-3. 후반권 (difficulty 4)

#### [페비엘] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | conversation_with:마로 엔야 | 마로 대화 | ★☆☆☆☆ | |
| Lv.2 | location_visited:Stella_Ville | 스텔라 빌 | ★★★★☆ | 후반 지역 |
| Lv.3 | color_value:Dark:0.6 | 어둠 0.6 | ★★★★☆ | |
| Lv.4 | hyperion_levels:마로 엔야:4,크루하:3 | 마로 4 + 크루하 3 | ★★★★☆ | |
| Lv.5 | hyperion_total:80 | 총합 80 | ★★★★☆ | |

**영입**: 마로 Lv.3 + 아카샤 Lv.2 + 마로 동행 + 루나 마력 골짜기 S랭크.

#### [알티 알타] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | conversation_with:제로 | 제로 대화 | ★★☆☆☆ | |
| Lv.2 | conversation_with:카미키 | 카미키 대화 | ★★☆☆☆ | |
| Lv.3 | companion_days:제로:7 | 제로 7일 동행 | ★★★☆☆ | |
| Lv.4 | visited_count:10 | 10지역 | ★☆☆☆☆ | |
| Lv.5 | hyperion_total:30 | 총합 30 | ★★☆☆☆ | |

**영입**: 제로 동행 + 나이트 타코미 60% + 칭호 "정밀기계취급 자격 B"(아이템 30회 제작) + 히페리온 25.

#### [네토 로크] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | vigor_spent:1000 | 기력 1000 | ★☆☆☆☆ | |
| Lv.2 | location_visited:Limun_Ruins | 리문 | ★★★★☆ | |
| Lv.3 | damage_taken:10000 | 피격 10k | ★★★☆☆ | |
| Lv.4 | dungeon_clear_count:30 | 던전 30 | ★★★★☆ | |
| Lv.5 | gold_spent:2000 | 골드 2k | ★★★☆☆ | |

**영입**: 시이드 Lv.3 + 카요 Lv.2 + 리문 유적 80%.

#### [화이트 팡] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | activities_done:20 | 활동 20 | ★★☆☆☆ | |
| Lv.2 | damage_taken:5000 | 피격 5k | ★★☆☆☆ | |
| Lv.3 | friend_count:5 | 호감 5 | ★★☆☆☆ | |
| Lv.4 | hyperion_total:30 | 총합 30 | ★★☆☆☆ | |
| Lv.5 | max_damage:1000 | 단일 1000 | ★★★★★ | 최종 장비 |

**영입**: 리비트 Lv.3 + "고양이 방울" + "유령 고양이" 퀘스트 + 이벤트 전투 승리.

#### [커트래빗] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | conversation_with:제로 | 제로 대화 | ★★☆☆☆ | |
| Lv.2 | max_damage:200 | 200 데미지 | ★★☆☆☆ | |
| Lv.3 | relationship:제로:0.5 | 제로 0.5 | ★★★☆☆ | |
| Lv.4 | color_value:Dark:0.5 | 어둠 0.5 | ★★★☆☆ | |
| Lv.5 | dungeon_clear_count:100 | 던전 **100회** | ★★★★★ | 초장기 |

**영입**: 히페리온 40 + 제로 Lv.2 + "토끼 구하기" 퀘스트 + 제로 동행 + 라르 포레스트:폭포 클리어.

#### [임페리시아] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | damage_taken:50000 | 피격 50k | ★★★★☆ | 장기 |
| Lv.2 | recruited_count:10 | 동료 10 | ★★★☆☆ | |
| Lv.3 | activities_done:20 | 활동 20 | ★★☆☆☆ | |
| Lv.4 | dungeon_clear_count:50 | 던전 50 | ★★★★☆ | |
| Lv.5 | stat_total:100 | 공+방 100 | ★★★★☆ | |

**영입**: 홀로그램 필드 20% + 오드 산 20% + 카미키 동행 + 히페리온 35.

#### [발렌시아] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | items_crafted:3 | 3회 | ★☆☆☆☆ | |
| Lv.2 | hyperion_levels:카요:3,에코:1 | 카요3+에코1 | ★★★★☆ | |
| Lv.3 | dungeon_clear_count:40 | 던전 40 | ★★★★☆ | |
| Lv.4 | damage_dealt:200000 | 누적 20만 | ★★★★★ | |
| Lv.5 | items_crafted:50 | 제작 50 | ★★★★☆ | |

**영입**: 히페리온 35 + "전쟁의 정령들" 퀘스트 + 임페리시아 동행.

#### [카시스] (difficulty 4, 사천왕)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | actor_recruited:리무 | 리무 영입 | ★★★★☆ | |
| Lv.2 | all_recruited:에코,시아,리무,모노 | 사천왕+모노 | ★★★★★ | |
| Lv.3 | location_progress:Triflower:60 | 트리플라워 60% | ★★★★☆ | |
| Lv.4 | hyperion_levels:에코:3,시아:3,리무:3 | 3사천왕 Lv.3 | ★★★★★ | |
| Lv.5 | relationship:카시스:0.8 | 0.8 | ★★★★☆ | |

**영입**: 히페리온 45 + 던전 20 + 탐사 10지역.

#### [크루하] (difficulty 4)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | activities_done:30 | 활동 30 | ★★★☆☆ | |
| Lv.2 | visited_count:15 | 15지역 | ★★☆☆☆ | |
| Lv.3 | hyperion_total:25 | 총합 25 | ★★☆☆☆ | |
| Lv.4 | damage_dealt:50000 | 누적 5만 | ★★★★☆ | |
| Lv.5 | recruited_count:20 | 20명 | ★★★★☆ | |

**영입**: 마로/아르바로/이연/페비엘/루핀/미유/모나토/카르디 **8명 전원 동료** + 히페리온 40 → 루나 교무실. **영입 조건 자체가 난관.**

### A-4. 종반권 (difficulty 5)

#### [리제] (difficulty 5)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | location_visited:Puchi_Tower | 푸치 탑 | ★★★★☆ | |
| Lv.2 | location_visited:Riel_Sky | 리엘 | ★★★★★ | |
| Lv.3 | companion_days:리제:5 | 5일 동행 | ★☆☆☆☆ | |
| Lv.4 | activities_done:50 | 활동 50 | ★★★☆☆ | |
| Lv.5 | hyperion_total:60 | 총합 60 | ★★★☆☆ | |

**영입**: 히페리온 50 + 환영의 첨탑 100% + 루나 방문.

#### [시아] (difficulty 5, 사천왕)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | actor_recruited:에코 | 에코 영입 | ★★★☆☆ | |
| Lv.2 | all_recruited:에코,카시스,리무,모노 | 사천왕+모노 | ★★★★★ | |
| Lv.3 | quest_count:20 | 퀘스트 20 | ★★★☆☆ | |
| Lv.4 | hyperion_levels:에코:3,카시스:3,리무:3 | 사천왕 Lv.3 | ★★★★★ | |
| Lv.5 | relationship:시아:0.8 | 0.8 | ★★★★☆ | |

**영입**: 히페리온 50 + 시이드 Lv.4 + 몬스터 100 + 마을 30.

#### [피닉스] (difficulty 5)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | visited_count:20 | 20지역 | ★★★☆☆ | |
| Lv.2 | recruited_count:30 | 30명 | ★★★★★ | 거의 전원 |
| Lv.3 | visited_count:45 | **45지역** | ★★★★★ | 전 세계 탐험 |
| Lv.4 | hyperion_total:140 | 총합 140 | ★★★★★ | 종반 |
| Lv.5 | days_passed:100 | 100일 경과 | ★★★☆☆ | 시간 |

**영입**: 히페리온 60 + 동료 30 이상. **Lv.3의 45지역은 locations+rdc.txt 전 지역 수준**.

### A-5. 최종권 (difficulty 6)

#### [모노] (difficulty 6)
| 레벨 | 조건 | 선행 | 난이도 | 의존 |
|---|---|---|---|---|
| Lv.1 | gold_spent:500 | 500G | ★☆☆☆☆ | |
| Lv.2 | dungeon_clear_count:5 | 던전 5 | ★☆☆☆☆ | |
| Lv.3 | damage_dealt:10000 | 누적 10k | ★★☆☆☆ | |
| Lv.4 | monsters_killed:500 | 500 처치 | ★★★★☆ | |
| Lv.5 | dungeon_clear_count:50 | 던전 50 | ★★★★☆ | |

**영입**: 사천왕 전원 + 니아 Lv.4 + 리엔카이 Lv.3 + 히페리온 80. **영입 후 레벨 달성은 의외로 쉬움(모노의 개인 조건은 누적 카운터).**

---

## B. 의존성 그래프 (선행 체인)

### B-1. 영입 → 히페리온
| 대상 | 레벨 | 조건 | 필요 영입 |
|---|---|---|---|
| 제로 | Lv.1 | actor_recruited:알티 알타 | 알타 |
| 리비트 | Lv.4 | actor_recruited:화이트 팡 | 화이트 팡 (리비트 Lv.3 필요) |
| 미유 | Lv.3 | actor_recruited:피닉스 | 피닉스 (히페리온 60) |
| 에코 | Lv.1 | actor_recruited:시아 | 시아 (히페리온 50) |
| 시아 | Lv.1 | actor_recruited:에코 | 에코 (히페리온 30) |
| 카시스 | Lv.1 | actor_recruited:리무 | 리무 (히페리온 40) |
| 리무 | Lv.1 | actor_recruited:카시스 | 카시스 (히페리온 45) |

### B-2. 히페리온 레벨 → 영입 조건
| 영입 대상 | 필요한 타 캐릭터 레벨 |
|---|---|
| 아카샤 | 니아 Lv.2, 마로 Lv.1 |
| 쿠르쿠마 | 마로 Lv.1 |
| 아르바로 | 마로 Lv.2 |
| 엘네스트 | 칼리번 Lv.1 |
| 페비엘 | 마로 Lv.3, 아카샤 Lv.2 |
| 네토 로크 | 시이드 Lv.3, 카요 Lv.2 |
| 화이트 팡 | 리비트 Lv.3 |
| 커트래빗 | 제로 Lv.2 |
| 모노 | 니아 Lv.4, 리엔카이 Lv.3 |
| 윤희원 | 니아 Lv.2 |
| 시아 | 시이드 Lv.4 |

### B-3. 히페리온 → 히페리온 (`hyperion_levels`)
| 대상.Lv | 필요 |
|---|---|
| 칼리번.Lv.2 | 엘네스트 1 |
| 페비엘.Lv.4 | 마로 엔야 4, 크루하 3 |
| 발렌시아.Lv.2 | 카요 3, 에코 1 |
| 모나토.Lv.4 | 윤희원 3 |
| 에코.Lv.4 | 카시스 3, 시아 3, 리무 3 |
| 카시스.Lv.4 | 에코 3, 시아 3, 리무 3 |
| 시아.Lv.4 | 에코 3, 카시스 3, 리무 3 |
| 리무.Lv.4 | 에코 3, 카시스 3, 시아 3 |

→ **사천왕 Lv.4의 상호 의존**: 에코·카시스·시아·리무의 Lv.4는 "다른 셋이 Lv.3". **전원이 동시에 Lv.3에 도달한 뒤 일제히 Lv.4로 승급**하는 구조(순환 아님, **동시 해금**).

### B-4. `hyperion_total:N` 요구 (체인 진입 조건)
| 캐릭터.Lv | 요구 총합 |
|---|---|
| 마로 엔야.Lv.3 | 10 |
| 엘네스트.Lv.4 | 20 |
| 크루하.Lv.3 | 25 |
| 알티 알타.Lv.5, 화이트 팡.Lv.4 | 30 |
| 시이드.Lv.5 | 40 |
| 루핀.Lv.5 | 45 |
| 카요.Lv.5 | 50 |
| 리제.Lv.5, 쿠르쿠마.Lv.5 | 60 |
| 칼리번.Lv.5 | 70 |
| 페비엘.Lv.5 | 80 |
| 니아 이유르.Lv.5 | 99 |
| 아카샤.Lv.5 | 100 |
| 피닉스.Lv.4 | 140 |

### B-5. 순환 의존 체크
- **사천왕 Lv.4 상호**: "동시에 Lv.3 도달" 조건이 동시 승급으로 풀림 → 순환 아님.
- **제로 ↔ 알티 알타**: 알타 영입 = 제로 동행. 제로는 알타 영입 없이도 먼저 영입되므로 순환 아님.
- **크루하 ↔ 페비엘**: **페비엘 영입 → 크루하 영입 → 크루하 Lv.3 → 페비엘 Lv.4** 단방향 체인.

**결론: 순수 데드락 순환 없음.**

---

## C. 200(195) 레벨 루트 — 단계별 가이드

### 단계 1. **초반 — 알리메스 정착기 (게임 1~15일)**
- **목표 총합**: 5 → 20
- **영입 우선순위**: 마로 엔야(루나) → 니아 Lv.1~2 유지 → 이연 → 하코
- **던전 공략 순서** (난이도 0.05~0.25):
  - Sea_Cliff_Path(Cyan_Dunes) → Kishina_Cove(Kishina) → Lar_Entrance(Lar_Forest) → Mana_Garden(Luna_Practice_Hall) → Sapling_Grove(Tiklit_Range) → Snow_Entrance(Alime_Mountain)
- **주요 과제**:
  - `visited_count` 5 → 15 (알리메스, 르슈드, 바그레트, 이쿠나 + 루나, 마노니클라)
  - `conversation_count` 5+
  - `days_passed` 10+
  - `dungeon_clear_count` 1~5
- **체크포인트**: 니아 Lv.4, 마로 Lv.2~3, 이연 Lv.1~2, 하코 Lv.1~2 → 총합 ≈ 18~20.

### 단계 2. **초중반 — 서부 사막 & 루나 심화 (15~30일)**
- **목표 총합**: 20 → 50
- **영입**: 아카샤 → 시이드 → 카요 → 루디 → 테오 → 아르바로 엔야 → 리비트
- **던전 공략 순서** (난이도 0.25~0.45):
  - Blue_Bluff → Tidebreak_Grotto(사구) → Cherry_Blossom_Belt → Abandoned_Shrine(티클릿) → Mana_Valley/Mana_Falls(루나 실습동) → Kishina_Grotto → Penta_Tideland
- **과제**:
  - `food_eaten:5` (테오 Lv.2)
  - `items_crafted:10~15` (발렌시아 Lv.1, 카요 Lv.4 선행)
  - `items_sold:10` (루디 Lv.2)
  - `recruited_count:8~10`
- **체크포인트**: 총합 50. 카요 Lv.5(hyperion_total:50) 해금.

### 단계 3. **중반 — 일루네온 & 나이트 타코미 (30~50일)**
- **목표 총합**: 50 → 80
- **영입**: 카르디 → 모나토 → 에코 → 리엔카이(이벤트 전투) → 제로 → 알티 알타 → 카미키
- **던전** (난이도 0.35~0.60):
  - Night_Cyber_Pop → Night_Golden_Claw → Night_Keltria → Night_Oriens
  - Phantom_Winding_Gallery → Phantom_Aerial_Vestibule
  - Clocktower_Outer/Inner → Enicham_5V/45V/200kV
- **과제**:
  - `hyperion_total:80` 달성 → 페비엘 Lv.5 가능
  - `monsters_killed:50~100` (리엔카이 Lv.2, 시아 영입 게이트)
  - `monster_types:10~20` (리엔카이 Lv.4, 모나토 영입)
  - `items_crafted:30` → 칭호 "정밀기계취급 자격 B" (알타 영입)
- **체크포인트**: 총합 80, 동료 ~18명, 에코 Lv.3.

### 단계 4. **중후반 — 크루하 해금 & 파티 확장 (50~65일)**
- **목표 총합**: 80 → 100
- **영입**: 미유 → 페비엘 → 루핀(이벤트 전투) → **크루하** → 쿠르쿠마 → 노노 → 엘네스트 → 칼리번 → 윤희원
- **던전** (난이도 0.50~0.72):
  - Erumen_Mistwood → Lar_Acornwood/Lar_Cliff/Lar_Fireherb
  - Phantom_Stratum_Lower (환영의 첨탑 100%)
  - Limun_Courtyard/Fallen_Temple (리문 유적 80%)
- **과제**:
  - `quest_count:15~20` (윤희원, 루핀, 시아)
  - `hyperion_levels:마로:4,크루하:3` (페비엘 Lv.4)
  - `hyperion_total:100` (아카샤 Lv.5)
  - `items_crafted:20~30`
- **체크포인트**: 총합 100, 동료 ~25명, 아카샤 Lv.5.

### 단계 5. **후반 — 리무·카시스 준비 & 후반 던전 (65~80일)**
- **목표 총합**: 100 → 140
- **영입**: 리무 → 카시스 → 리제 → 네토 로크 → 화이트 팡(이벤트 전투) → 임페리시아 → 발렌시아 → 커트래빗
- **던전** (난이도 0.65~0.88):
  - Ancient_Miners_Road → Permafrost/Basecamp_Ruins
  - Grand_Crack_Wall/Abyss
  - Limun_Fallen_Temple_Deep/Limun_Arrival
  - Hologram_Virtual_Iluneon/Alimes/Mos/Tacomi
  - Ode_Wolfpack_Domain/Ode_Alpha_Throne
  - Triflower_Foothills/Vent_Corridor
- **과제**:
  - `dungeon_clear_count:30~50` (네토 Lv.4, 임페리시아 Lv.4)
  - `damage_dealt:100000` (엘네스트 Lv.5 준비)
  - `monsters_killed:500` (모노 Lv.4 — 모노 영입 후 자동)
  - `hyperion_total:140` (피닉스 Lv.4)
  - `visited_count:45` (피닉스 Lv.3) — 전 지역 순회
- **체크포인트**: 총합 140, 동료 33~34명.

### 단계 6. **종반 — 시아·피닉스·모노 최종 영입 (80~100일)**
- **목표 총합**: 140 → 180
- **영입**: 시아 → 피닉스 → **모노**
- **던전** (난이도 0.80~0.96):
  - Whiteout(알리메 설산 정상)
  - Falcon_Shore/Mist/Remote/Apex
  - Demon_Gatehouse/Demon_Hall/Demon_Throne_Chamber (마왕성)
  - Puchi_Lower/Mid/Upper_Floors(푸치 탑 52층)
  - Yusejeria(유세제리아 눈보라 심층)
  - Triflower_Crater(카시스 Lv.3 삼연계)
- **과제**:
  - 사천왕 전원 Lv.3 → **동시 Lv.4 해금**
  - 사천왕 전원 relationship:0.8 → Lv.5 (선물·장기 동행)
  - `days_passed:100` (피닉스 Lv.5)
  - `dungeon_clear_count:100` (커트래빗 Lv.5) ← **최장기 누적**
- **체크포인트**: 총합 180, 38명 전원 영입 완료.

### 단계 7. **최종 — 모든 히페리온 Lv.5 클린업 (100~130일+)**
- **목표 총합**: 180 → **195 (이론 최대)**
- **남은 과제**:
  - 니아 Lv.5 (hyperion_total:99) — 이미 자동 달성
  - 피닉스 Lv.3 (visited_count:45) — hidden 지역 순회
  - 피닉스 Lv.4 (hyperion_total:140) — 자동
  - 하코 Lv.5 (`all_locations_visited`) — 실제 로딩된 모든 location 방문 (hidden 포함)
  - 모나토 Lv.5 (`all_locations_visited`) — 하코와 동일
  - 엘네스트 Lv.5 (damage_dealt:100000) — 전투 누적
  - 윤희원 Lv.5 (monsters_killed:1000)
  - 발렌시아 Lv.4/5 (damage_dealt:200000 / items_crafted:50)
  - 커트래빗 Lv.5 (dungeon_clear_count:100)
  - 화이트 팡 Lv.5 (max_damage:1000)
  - 카르디 Lv.5 (gold_spent:5000)
  - 사천왕 Lv.5 (각자 relationship:0.8)
- **체크포인트**: 총합 **195 달성**.

---

## D. 리스크·병목 분석

### D-1. 가장 늦게 영입되는 캐릭터
1. **모노** (difficulty 6): 사천왕 전원 + 니아 Lv.4 + 리엔카이 Lv.3 + 히페리온 80. 유일한 "최종 단계" 영입.
2. **피닉스** (difficulty 5): 히페리온 60 + 동료 30.
3. **시아** (difficulty 5): 시이드 Lv.4 + 히페리온 50 필요.
4. **크루하** (difficulty 4): 8명 전원 영입이라는 단일 요건. 페비엘(마로 Lv.3)·루핀·미유가 모두 선행.

### D-2. 가장 어려운 히페리온 레벨 (TOP 7)
| 순위 | 조건 | 해석 |
|---|---|---|
| 1 | **커트래빗 Lv.5** `dungeon_clear_count:100` | 100회 던전 — 플레이 시간의 지속적 투입 |
| 2 | **하코 Lv.5 / 모나토 Lv.5** `all_locations_visited` | hidden 지역 포함 전역 방문, 일부는 time-locked |
| 3 | **윤희원 Lv.5** `monsters_killed:1000` | 초장기 전투 누적 |
| 4 | **발렌시아 Lv.4** `damage_dealt:200000` | 20만 누적 피해 |
| 5 | **피닉스 Lv.3/4** `visited_count:45` + `hyperion_total:140` | 45 지역 + 총합 140 연속 게이트 |
| 6 | **아카샤 Lv.3/4** `all_elements_recruited` + `all_races_recruited` | 8속성 + 8종족 다양성 |
| 7 | **화이트 팡 Lv.5** `max_damage:1000` | 단일 타격 1000 |

### D-3. 순환 의존 병목
- **사천왕 Lv.4 4중 의존**: 전원 Lv.3 도달 순간 → 다음 턴 전원 Lv.4 자동 승급.
- **페비엘 Lv.4 ↔ 크루하 Lv.3**: 페비엘 → 크루하 영입 → 크루하 Lv.3 → 페비엘 Lv.4 순 강제.

### D-4. 플레이어 성장 곡선 vs 요구 사항 불일치
| 시점 | 기대 플레이어 레벨 | 과잉 요구 조건 |
|---|---|---|
| 15~20일 | 공+방 ~20 | 마로 Lv.4 `stat_total:50`, 아르바로 Lv.4 `stat_total:40` |
| 30~40일 | 단일 피해 ~200 | 리엔카이 Lv.5 `max_damage:500`, 커트래빗 Lv.2 `max_damage:200` |
| 50일+ | 누적 피해 ~1만 | 엘네스트 Lv.5 `damage_dealt:100000`, 발렌시아 Lv.4 `damage_dealt:200000` |
| 70일+ | `color_value` 편향 | 카요 Lv.3 Iron:0.7, 제로 Lv.5 Electric:0.7, 쿠르쿠마 Lv.4 Earth:0.6, 페비엘 Lv.3 Dark:0.6 |

---

## E. 총합 195 시뮬레이션

### E-1. 단계별 도달 가능 총합
| 단계 | 영입 수 | 평균 Lv | 총합 추정 | 게이트 해금 |
|---|---|---|---|---|
| 1 (15일) | 4 | 2.0 | 8 + 플레이어1 ≈ **9** | 마로 Lv.3(총합 10) 직전 |
| 2 (30일) | 11 | 3.0 | 33 + 플레이어2 ≈ **35** | 엘네스트 Lv.4(20), 크루하 Lv.3(25), 알타 Lv.5(30) |
| 3 (50일) | 19 | 3.5 | 66 + 플레이어3 ≈ **69** | 시이드·루핀·카요·쿠르쿠마·리제 Lv.5 |
| 4 (65일) | 26 | 3.8 | 99 + 플레이어3 ≈ **102** | 칼리번·페비엘·니아·아카샤 Lv.5 |
| 5 (80일) | 34 | 4.1 | 139 + 플레이어4 ≈ **143** | 피닉스 Lv.4(140) |
| 6 (100일) | 38 | 4.5 | 171 + 플레이어4 ≈ **175** | 전 캐릭터 Lv.4 범위 |
| 7 (130일+) | 38 | 5.0 | 190 + 플레이어5 = **195** | 최종 |

### E-2. 병목 총합 지점
- **총합 25 → 40**: 엘네스트/크루하 Lv.4/3 해금 + 시이드 Lv.5.
- **총합 80 → 100**: 페비엘 Lv.5 ← 크루하 Lv.3 + 마로 Lv.4.
- **총합 99**: 니아 Lv.5.
- **총합 140**: 피닉스 Lv.4.
- **총합 190 → 195**: 모든 38명 Lv.5 + 플레이어 Lv.5.

### E-3. 실질 상한
- **195**가 hyperion.txt 정의상 이론·실질 최대.
- "200"은 symbolic 목표치 — 현 데이터 스키마로 불가. 플레이어 커스텀 히페리온 엔트리(현재 `__default__`로 대체)의 조건(visited_count:5, conversation_count:10, monsters_killed:30, dungeon_clear_count:3, friend_count:5)은 모두 매우 쉬워 **플레이어 Lv.5는 단계 2~3에서 이미 해결**.

---

## F. 요약 체크리스트

### F-1. 마스터 플레이북
1. **Day 1~15**: 루나 + 알리메스 권역. 마로·이연·하코 + 니아.
2. **Day 15~30**: 마노니클라 + 마틴 항 + 시이드·카요·루디·테오·아르바로·리비트. 아카샤 병렬 영입.
3. **Day 30~50**: 일루네온·나이트 타코미. 카르디·모나토·에코·리엔카이·제로·알타·카미키. 총합 80.
4. **Day 50~65**: 페비엘·미유·루핀 → **크루하 8인 게이트** 돌파. 쿠르쿠마·노노·엘네스트·칼리번·윤희원 마무리. 총합 100.
5. **Day 65~80**: 후반 던전 반복. 리무·카시스·리제·네토·화이트팡·임페리시아·발렌시아·커트래빗. 총합 140.
6. **Day 80~100**: 시아·피닉스·모노 최종 영입. 사천왕 Lv.3 → Lv.4 동시 승급. 총합 180.
7. **Day 100+**: 최장기 누적 조건 소화. 총합 **195**.

### F-2. 병행 최적화 팁
- **`items_crafted` 집중**: 30회 달성 시 "정밀기계취급 자격 B" 칭호 → 알타 영입 해금 + 카요 Lv.4 + 에코 Lv.3 + 발렌시아 Lv.5 50회 동시 진행.
- **`damage_dealt` 누적**: 리엔카이 Lv.3(5k) → 리비트 Lv.3(8k) → 모노 Lv.3(10k) → 마로 Lv.5(20k) → 카미키 Lv.5(30k) → 크루하 Lv.4(50k) → 엘네스트 Lv.5(100k) → 발렌시아 Lv.4(200k) **단일 전투 라인**이 여러 레벨 동시 해결.
- **`visited_count`**: 5→10→15→20→45 게이트가 6개 이상 캐릭터에 공통. 전 지역 순회는 피닉스·하코·모나토를 동시 해결.
- **속성 편향**: 플레이어 컬러는 대화 주제로만 ±0.005~0.03 → 특정 속성 0.7 목표는 **20~40회 집중 주제 대화** 필요.
- **사천왕 relationship 0.8**: 주기적 선물(선호 아이템) + 장기 동행. 영입 시점부터 매일 선물 루틴화.

### F-3. 불가 조건 검증
- `monsters_killed:1000`(윤희원), `dungeon_clear_count:100`(커트래빗), `damage_dealt:200000`(발렌시아), `damage_taken:50000`(임페리시아): 모두 **유한 시간 내 달성 가능**하지만 최소 **게임 100~150일+** 필요.
- `all_locations_visited`: loadedLocationIds 기반이므로 초기 `size === 0`이면 false. 데이터 로딩 완료 후, hidden 지역(timeVisible 조건 포함) 모두 방문 시 true. 달성 가능.
- `hyperion_total:140`: 피닉스 Lv.4. 35명 × 평균 4 = 140. 수학적으로 가능하며 단계 5 말에 자동 해금.

---

## 참조 파일

- `public/data/hyperion.txt`
- `public/data/acquisition.txt`
- `public/data/locations.txt`, `locations+rdc.txt`
- `public/data/dungeons.txt`
- `public/data/titles.txt` (정밀기계취급 자격 B)
- `public/data/npc_quests.txt` (제로의 생활, 전쟁의 정령들, 토끼 구하기, 유령 고양이, 파란 눈의 전학생에 대한 소문)
- `public/data/items.txt` (수상한 카드, 카르디의 초대장)
- `public/data/armor.txt` (붉은 망토, 고양이 방울, 반딧불 머리핀, 영차원 큐브)
- `public/data/event_battles.txt` (battle_lienkai_windfall, battle_lupin_luna, battle_whitefang_halpia)
- `src/systems/hyperion.ts` — 조건 판정 로직
- `src/systems/npc-interaction.ts` — acquisition 파서
- `src/models/knowledge.ts` — 누적 카운터

---

## 최종 결론

히페리온 총합의 실질 상한은 **195** (플레이어 1 + NPC 38 × Lv.5). "200"은 설계 목표치이며 현 데이터 스키마로는 달성 불가. **단계 7의 모든 클린업을 완주하면 195에 도달하여 게임의 모든 히페리온 보상(HP+1950, 공격+390, 방어+195 상당)을 획득**.

병목은 ① 단계 4의 크루하 8인 게이트, ② 단계 6의 사천왕 Lv.4 동시 승급, ③ 단계 7의 100회 던전·1000마리 몬스터·20만 누적 피해의 시간 투자.
