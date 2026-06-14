/**
 * 카오스 도전-점수 시스템 — 자기부여 핸디캡. 높을수록 원래 세계에서 멀어진다.
 * (deep-interview-chaos-system.md / Phase A — Round 12 강도 모델 재정합)
 *
 * 루프:
 *   ① 영혼으로 카오스를 영구 구매(purchaseChaos) — meta.unlockedChaosIds.
 *   ② 런 시작 시 소유분을 자유 토글 + 강도 선택 → RunState.activeChaos({id,intensity}[]).
 *   ③ 시작형(start-*)은 applyStartChaos가 startRun에서 1회, *그 강도의 param*으로 적용.
 *   ④ 상시형(enemy-hp-mul 등)은 시스템 조회 시점에 enemyHpMul() 등으로 *그 강도 param* 합산.
 *   ⑤ 매 클리어 revealNextTierOnClear + recordBestChaos.
 *
 * 점수: 강도에서 파생 — numeric 1/2/3, binary 1, start-hp 2/3, legend(T4) 4.
 *   각 강도의 점수는 `chaos.levels[intensity-1].score`.
 *
 * 본 모듈은 *시스템 계층* — UI는 Phase C. 여기서는 store(meta/run/data)를 직접 조회/변경한다.
 */

import type { Chaos, ChaosEffectKind, Monster, RunState } from '@/data/schemas';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { useRunStore } from '@/stores/run';
import { instantiateCard } from '@/systems/deck';
import { rng } from '@/systems/rng';

/** 활성 카오스 1개 — id + 강도(1-base). */
export interface ActiveChaos {
  id: string;
  intensity: number;
}

/** 8 컬러 — color-seal 무작위 봉인 후보. */
const ALL_8_COLORS = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'] as const;

/** 티어별 영혼 구매 비용 — 튜닝 상수. */
export const CHAOS_COST_BY_TIER: Record<number, number> = { 1: 3, 2: 5, 3: 8, 4: 12 };

/** 티어 → 영혼 비용. 미정의 티어는 0(안전). */
export function chaosCostFor(tier: number): number {
  return CHAOS_COST_BY_TIER[tier] ?? 0;
}

/** 카오스 정의 조회 (data store). 없으면 undefined. */
export function chaosById(id: string): Chaos | undefined {
  return useDataStore().chaosDefs.get(id);
}

/**
 * 활성 항목 정규화 — 구 세이브에 string[]가 섞여도 {id, intensity}로 통일.
 * intensity는 정수·최소 1로 클램프.
 */
function normalizeActive(raw: unknown): ActiveChaos[] {
  if (!Array.isArray(raw)) return [];
  const out: ActiveChaos[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      out.push({ id: item, intensity: 1 });
    } else if (item && typeof item === 'object' && typeof (item as ActiveChaos).id === 'string') {
      const it = item as ActiveChaos;
      const n = Math.max(1, Math.floor(Number(it.intensity) || 1));
      out.push({ id: it.id, intensity: n });
    }
  }
  return out;
}

/** 강도를 levels 범위로 클램프해 0-base 인덱스 반환. */
function levelIndex(chaos: Chaos, intensity: number): number {
  const n = chaos.levels.length;
  if (n === 0) return -1;
  const idx = Math.floor(intensity) - 1;
  if (idx < 0) return 0;
  if (idx >= n) return n - 1;
  return idx;
}

/** 한 카오스의 *그 강도* 도전 점수 — `levels[intensity-1].score`. 범위 밖/누락은 1점 폴백. */
export function chaosScoreOf(chaos: Chaos, intensity: number): number {
  const idx = levelIndex(chaos, intensity);
  if (idx < 0) return 1;
  const s = chaos.levels[idx]?.score;
  return Number.isFinite(s) ? s : 1;
}

/** 한 카오스의 *그 강도* 효과 파라미터 — `levels[intensity-1].param`. 없으면 ''. */
export function effectParamOf(chaos: Chaos, intensity: number): string {
  const idx = levelIndex(chaos, intensity);
  if (idx < 0) return '';
  return chaos.levels[idx]?.param ?? '';
}

/** 활성 카오스 목록의 강도별 도전 점수 합. 정의 없는 id는 0. */
export function computeChaosScore(active: ActiveChaos[]): number {
  let total = 0;
  const defs = useDataStore().chaosDefs;
  for (const a of normalizeActive(active)) {
    const c = defs.get(a.id);
    if (c) total += chaosScoreOf(c, a.intensity);
  }
  return total;
}

/** 상점에 진열되는 카오스 — tier ≤ meta.chaosTierRevealed. */
export function shopChaos(): Chaos[] {
  const revealed = useMetaStore().chaosTierRevealed;
  return [...useDataStore().chaosDefs.values()]
    .filter((c) => c.tier <= revealed)
    .sort((a, b) => a.tier - b.tier);
}

/**
 * 카오스 구매 — 영혼이 충분하면 차감 + unlockedChaosIds에 추가.
 * 이미 소유했거나(중복) 잔액 부족이면 false.
 */
export function purchaseChaos(id: string): boolean {
  const meta = useMetaStore();
  const c = chaosById(id);
  if (!c) return false;
  if (meta.unlockedChaosIds.includes(id)) return false; // 중복 가드
  const cost = chaosCostFor(c.tier);
  if (!meta.canAfford('soul', cost)) return false; // 잔액 가드
  meta.spend('soul', cost);
  meta.unlockedChaosIds.push(id);
  meta.persist();
  return true;
}

/** start-inject-card param 'cardId=count|cardId=count' → 카드 주입 목록. (구분자 '|' — INI는 ';'/'#'를 주석으로 자르므로 사용 불가) */
function parseInjectParam(param: string): { cardId: string; count: number }[] {
  const out: { cardId: string; count: number }[] = [];
  for (const pair of param.split('|')) {
    const t = pair.trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    if (eq < 0) {
      out.push({ cardId: t, count: 1 });
    } else {
      const cardId = t.slice(0, eq).trim();
      const count = Math.max(1, Math.floor(Number(t.slice(eq + 1).trim()) || 1));
      if (cardId) out.push({ cardId, count });
    }
  }
  return out;
}

/**
 * start-inject-card 효과만 단독 적용 — 시작 덱(+collection)에 죽은 카드 주입.
 * 덱·컬러 셋업이 *끝난 뒤* 호출해야 주입이 보존되므로, ChaosSelectView가 셋업 후 1회 호출.
 * (applyStartChaos도 내부적으로 이것을 부른다 — 직접 startRun 경로용. 점수/HP 등은 건드리지 않음.)
 */
export function injectStartChaosCards(run: RunState): void {
  const active = normalizeActive(run.activeChaos);
  const defs = useDataStore().chaosDefs;
  const cardDefs = useDataStore().cards;
  for (const a of active) {
    const c = defs.get(a.id);
    if (!c || c.effectKind !== 'start-inject-card') continue;
    for (const { cardId, count } of parseInjectParam(effectParamOf(c, a.intensity))) {
      const card = cardDefs.get(cardId);
      if (!card) continue;
      for (let i = 0; i < count; i++) {
        const inst = instantiateCard(card);
        run.collection.push(inst);
        run.deck.push(inst);
      }
    }
  }
}

/**
 * 시작형(start-*) 카오스를 1회 적용 — *각 항목의 강도 param*으로.
 *
 *   start-hp           : param='-0.5' → 현재 HP 50% 감소(반올림), 'hp1' → HP를 1로.
 *   start-inject-card  : injectStartChaosCards로 죽은 카드 주입.
 *   time-limit-mul     : 시간 한도 ×(1-param).
 *   color-seal         : 무작위 1색 봉인 → chaosBannedColor.
 *   seed-seal          : 종족 시드 컬러 0.
 *
 * 호출 경로:
 *   - startRun 내부 1회(직접 startRun: DebugBattle/QA). 이때 덱이 비어 inject는 빈 덱에 들어가나
 *     실제 RaceSelect→ChaosSelect 플로우는 startRun 뒤 덱을 재구성하므로 그 분은 폐기되고,
 *     ChaosSelectView가 셋업 후 injectStartChaosCards + seed-seal을 *재적용*해 보존한다.
 *   - HP/시간/색결정/점수 캐시는 startRun 내부 1회로 확정(ChaosSelectView는 재적용 안 함 → 중복 방지).
 * 상시형 kind는 여기서 아무 것도 하지 않음(조회 시점 적용).
 */
export function applyStartChaos(run: RunState): void {
  const active = normalizeActive(run.activeChaos);
  // 정규화 결과를 다시 써넣어 이후 모든 조회가 동일 구조를 보게 한다(구 string[] 마이그레이션).
  run.activeChaos = active;
  if (active.length === 0) {
    run.chaosScore = 0;
    return;
  }
  const defs = useDataStore().chaosDefs;

  for (const a of active) {
    const c = defs.get(a.id);
    if (!c) continue;
    const param = effectParamOf(c, a.intensity);
    switch (c.effectKind) {
      case 'start-hp': {
        if (param === 'hp1') {
          run.hp = 1;
        } else {
          const ratio = Number(param); // 예: -0.5
          if (Number.isFinite(ratio) && ratio !== 0) {
            run.hp = Math.max(1, Math.round(run.hp * (1 + ratio)));
          }
        }
        break;
      }
      case 'fragile-glory': {
        // 시작 시 *최대 체력*을 절반으로(최대치 자체 반감) + 현재 HP도 새 최대치로 클램프.
        // 상시형 절반(보스 보상 2배)은 bossRewardMul()이 조회 시점에 처리.
        run.maxHp = Math.max(1, Math.round(run.maxHp / 2));
        run.hp = Math.min(run.hp, run.maxHp);
        break;
      }
      case 'start-inject-card': {
        injectStartChaosCards({ ...run, activeChaos: [a] } as RunState);
        break;
      }
      case 'time-limit-mul': {
        // 런 시작 시 시간 한도 ×(1-param). param 예: '0.25' → 25% 단축.
        const ratio = Number(param);
        if (Number.isFinite(ratio) && ratio > 0) {
          const factor = Math.max(0, 1 - ratio);
          run.remainingTime = Math.max(1, Math.round(run.remainingTime * factor));
        }
        break;
      }
      case 'color-seal': {
        // 무작위 1색 봉인 → RunState.chaosBannedColor. param='random'(또는 특정 색이면 그 색).
        if (param && param !== 'random') {
          run.chaosBannedColor = param;
        } else {
          run.chaosBannedColor = ALL_8_COLORS[Math.floor(rng() * ALL_8_COLORS.length)];
        }
        break;
      }
      case 'seed-seal': {
        // 종족 시드 컬러 0으로. 주의: 실제 플레이는 RaceSelectView가 startRun *이후* colors를
        // 셋업하므로 보존되지 않음 — Phase C에서 색셋업 이후 재정렬. 직접 startRun QA에선 반영됨.
        run.colors = {
          fire: 0, water: 0, electric: 0, iron: 0,
          earth: 0, wind: 0, light: 0, dark: 0,
        };
        break;
      }
      // 그 외 상시형 — 시작 시 처리할 것 없음(조회 시점 적용).
      default:
        break;
    }
  }

  // 점수 캐시 갱신.
  run.chaosScore = computeChaosScore(active);
}

// ===================== 상시형 쿼리 헬퍼 =====================
//
// 모든 상시형 카오스 효과는 *조회 시점*에 활성 카오스를 스캔해 그 강도 param을 합산한다.
// 각 시스템(combat/shop/workshop/gathering/item/run)이 자기 조회 지점에서 아래 헬퍼를 호출.
// 유물 modifier 패턴과 동형 — store 미접근 시 try/catch로 무영향(0/false/1) 폴백.

/** 활성 카오스 중 해당 kind의 *강도 param 수치*를 모두 합산. 비수치 param은 무시. */
function sumParamOf(kind: ChaosEffectKind): number {
  let sum = 0;
  try {
    const run = useRunStore().data;
    const defs = useDataStore().chaosDefs;
    for (const a of normalizeActive(run.activeChaos)) {
      const c = defs.get(a.id);
      if (c && c.effectKind === kind) {
        const v = Number(effectParamOf(c, a.intensity));
        if (Number.isFinite(v)) sum += v;
      }
    }
  } catch {
    /* store 미접근 — 무영향. */
  }
  return sum;
}

/** 활성 카오스 중 해당 kind가 하나라도 켜져 있는가 (binary/플래그형). */
export function isChaosActive(kind: ChaosEffectKind): boolean {
  try {
    const run = useRunStore().data;
    const defs = useDataStore().chaosDefs;
    for (const a of normalizeActive(run.activeChaos)) {
      const c = defs.get(a.id);
      if (c && c.effectKind === kind) return true;
    }
  } catch {
    /* 무영향. */
  }
  return false;
}

/** monster.id가 보스 정의에 존재하면 보스 전투로 판정. */
function isBossMonster(monster?: Monster): boolean {
  if (!monster) return false;
  try {
    return useDataStore().bosses.has(monster.id);
  } catch {
    return false;
  }
}

/**
 * 상시형 — 적 HP 배수. *대상 몬스터 tier에 따라* 합산 대상이 달라진다.
 *   - enemy-hp-mul : 모든 적.
 *   - elite-hp-mul : monster.tier==='elite' 또는 보스일 때만.
 * 반환 = 1 + 합. 활성 없으면 1.
 *
 * monster 생략(레거시 호출) 시 enemy-hp-mul만 적용(보스/엘리트 추가 없음).
 */
export function enemyHpMul(monster?: Monster): number {
  let sum = sumParamOf('enemy-hp-mul');
  const isElite = monster?.tier === 'elite';
  const isBoss = isBossMonster(monster);
  if (isElite || isBoss) sum += sumParamOf('elite-hp-mul');
  return 1 + sum;
}

/**
 * 상시형 — 적 공격 데미지 배수.
 *   - enemy-atk-mul : 모든 적 공격 인텐트.
 *   - boss-atk-mul  : 보스일 때만 추가.
 * 반환 = 1 + 합. executeMonsterIntent의 attack/drain/charge 등에서 적용.
 */
export function enemyAtkMul(monster?: Monster): number {
  let sum = sumParamOf('enemy-atk-mul');
  if (isBossMonster(monster)) sum += sumParamOf('boss-atk-mul');
  return 1 + sum;
}

/** 상시형 — 적 전투 시작 block 추가량(enemy-def-add 합, 정수 올림). */
export function enemyDefAdd(): number {
  return Math.round(sumParamOf('enemy-def-add'));
}

/** 상시형 — 매 턴 드로우 감소량(small-hand 합, 정수). */
export function handSizeReduction(): number {
  return Math.round(sumParamOf('small-hand'));
}

/** 상시형 — 전투 마나 감소량(low-mana 합, 정수). */
export function manaReduction(): number {
  return Math.round(sumParamOf('low-mana'));
}

/** 상시형 — 적 의도 가려짐(hidden-intent) 활성 여부. CombatView/BossView의 의도 라벨러가 직접 분기 마스킹. */
export function isHiddenIntent(): boolean {
  return isChaosActive('hidden-intent');
}

/** 상시형 — 모든 적 기믹 삽입(all-gimmick) 활성 여부. */
export function isAllGimmick(): boolean {
  return isChaosActive('all-gimmick');
}

/**
 * 종족(몬무스) → *대표 교란 기믹* 인코딩 인텐트 토큰.
 * combat.executeMonsterIntent가 파싱하는 형식 그대로(Stage2/3 기믹 어휘 재사용).
 *   bind:gauge:lock  — 손패 잠금(발버둥 탈출)
 *   web:N            — 거미줄 N스택(카드 쓰면 풀림)
 *   devour:gauge:dot — 삼킴 DoT
 *   drain:N          — 흡혈
 *   drain-stat:N     — 스탯 잠식(sap + 적 strength)
 *   charge:N         — 윈드업(다음 공격 강화)
 *   obscure:N        — 손패 은폐 N턴
 *   cost-up:amt:turns— 카드 비용 상승
 *
 * 세계관 규칙: 이상전투 상태이상을 거는 적은 *전부 몬무스(몬스터 걸/아인종)*.
 * all-gimmick(만물의 송곳니)이 모든 적에 종족 기믹을 부여하므로, 키는 전부 몬무스 종족이다.
 * (순수 짐승/무기물 명칭은 몬무스 변형으로 표기: 짐승귀=beastkin, 늑대=werewolf, 새=harpy,
 *  인간형 도적=imp, 구축물=automaton, 언데드=wraith.)
 *
 * all-gimmick 활성 시 그 몬스터 종족의 토큰 1개를 인텐트 로테이션에 삽입.
 */
export const SPECIES_GIMMICK: Record<string, string> = {
  // --- 거미·구속류 (아라크네) ---
  spider: 'bind:3:1',
  arachne: 'bind:3:2',
  // --- 슬라임 걸(삼킴) ---
  slime: 'devour:4:3',
  // --- 흡혈·매혹 (서큐버스/거머리 몬무스) ---
  succubus: 'drain-stat:2',
  vampire: 'drain:8',
  leech: 'drain:8',
  // --- 라미아·뱀 몬무스(구속) ---
  lamia: 'bind:4:2',
  serpent: 'bind:3:1',
  // --- 인어·세이렌(시야 교란/매혹) ---
  mermaid: 'drain:8',
  siren: 'obscure:2',
  // --- 정령·유령·레이스 몬무스(시간/시야 교란) ---
  spirit: 'obscure:2',
  phantom: 'obscure:2',
  wraith: 'drain:8',
  // --- 마법·오토마톤·골렘 몬무스(비용/윈드업 교란) ---
  arcane: 'cost-up:1:2',
  automaton: 'cost-up:1:2',
  golem: 'charge:3',
  // --- 짐승귀·늑대·여우·하피·용 몬무스(윈드업 강타) ---
  beastkin: 'charge:3',
  werewolf: 'charge:3',
  fox: 'charge:3',
  harpy: 'charge:3',
  dragon: 'charge:4',
  drake: 'charge:4',
  // --- 곤충·식물(알라우네) 몬무스(독/약화 — 잠식으로 대표) ---
  insect: 'drain-stat:2',
  plant: 'drain-stat:2',
  // --- 임프 몬무스(도적류, 흡혈) ---
  imp: 'drain:6',
  // --- 신수 몬무스(강력 삼킴) ---
  mythicbeast: 'devour:5:4',
};

/** all-gimmick 폴백 — 종족 미정의/누락 시 보편 교란 기믹. */
const ALL_GIMMICK_FALLBACK = 'web:1';

/**
 * all-gimmick 활성 시 *그 몬스터에 주입할 인텐트 토큰* 반환. 비활성이면 undefined.
 * 종족 매핑 우선, 미정의/누락이면 폴백(web:1). combat.startCombat가 인텐트 로테이션에 삽입.
 */
export function allGimmickIntentFor(monster?: Monster): string | undefined {
  if (!isAllGimmick()) return undefined;
  const sp = monster?.species;
  if (sp && SPECIES_GIMMICK[sp]) return SPECIES_GIMMICK[sp];
  return ALL_GIMMICK_FALLBACK;
}

/** 상시형 — 상점 가격 배수(shop-price-mul 합 → 1+합). */
export function shopPriceMul(): number {
  return 1 + sumParamOf('shop-price-mul');
}

/** 상시형 — 강화비 배수(upgrade-cost-mul 합 → 1+합). */
export function upgradeCostMul(): number {
  return 1 + sumParamOf('upgrade-cost-mul');
}

/** 상시형 — 휴식 회복 배수(rest-heal-mul 합 → 1-합, 최소 0). */
export function restHealMul(): number {
  return Math.max(0, 1 - sumParamOf('rest-heal-mul'));
}

/** 상시형 — 노드 진입 시 HP 손실량(node-hp-loss 합, 정수). */
export function nodeHpLoss(): number {
  return Math.round(sumParamOf('node-hp-loss'));
}

/** 상시형 — 채집 후반 임계 가산량(gather-threshold-add 합, 정수). */
export function gatherThresholdAdd(): number {
  return Math.round(sumParamOf('gather-threshold-add'));
}

/** 상시형 — 잠글 마을 노드 수(locked-town 합, 정수). MapView가 가용성 판정에 사용(Phase C). */
export function lockedTownCount(): number {
  return Math.round(sumParamOf('locked-town'));
}

/** 상시형 — 카드 제거 비활성(no-removal) 활성 여부. */
export function isNoRemoval(): boolean {
  return isChaosActive('no-removal');
}

/** 상시형 — 카드 보상 수 감소(narrow-reward) 활성 여부(−1). CombatView 결선(Phase C). */
export function isNarrowReward(): boolean {
  return isChaosActive('narrow-reward');
}

/** 상시형 — 맵(비전투) 포션 사용 불가(no-map-potion) 활성 여부. */
export function isNoMapPotion(): boolean {
  return isChaosActive('no-map-potion');
}

/**
 * 상시형 — 하루(100턴)당 상점 입장 횟수 제한(shop-limit/닫힌 시장).
 * 활성 카오스 중 shop-limit의 param(=일일 입장 횟수)을 *최솟값*으로 채택(여러 개면 가장 빡빡한 쪽).
 * 0 또는 미활성이면 제한 없음(Infinity 반환).
 */
export function shopEntryLimit(): number {
  let limit = Infinity;
  try {
    const run = useRunStore().data;
    const defs = useDataStore().chaosDefs;
    for (const a of normalizeActive(run.activeChaos)) {
      const c = defs.get(a.id);
      if (c && c.effectKind === 'shop-limit') {
        const n = Math.max(0, Math.floor(Number(effectParamOf(c, a.intensity)) || 0));
        if (n < limit) limit = n;
      }
    }
  } catch {
    /* 무영향. */
  }
  return limit;
}

/** shop-limit 활성 여부 — MapView/Shop 게이트가 빠르게 분기. */
export function isShopLimited(): boolean {
  return Number.isFinite(shopEntryLimit());
}

/**
 * 카오스 fragile-glory(부서지는 영광) — 보스 클리어 보상 배수.
 * 활성이면 2, 아니면 1. (시작 시 최대 체력 절반은 applyStartChaos에서 처리.)
 */
export function bossRewardMul(): number {
  return isChaosActive('fragile-glory') ? 2 : 1;
}

/** 카오스 no-respite(황폐) — 휴식 회복 소멸 + 상점 회복 구매 개방 활성 여부. */
export function isNoRespite(): boolean {
  return isChaosActive('no-respite');
}

/**
 * shop-limit 일일 카운터를 *현재 날(currentDay)에 맞춰 동기화*.
 * 새 날이면 카운터·방문목록을 리셋한다. (입장 판정/기록 전에 호출.)
 */
function syncShopDay(): void {
  const run = useRunStore().data;
  if (run.shopEntryDay !== run.currentDay) {
    run.shopEntryDay = run.currentDay;
    run.shopEntriesToday = 0;
    run.shopVisitedNodes = [];
  }
}

/**
 * shop-limit — 이 상점 노드에 *입장 가능한가*.
 *  - 카오스 비활성: 항상 true.
 *  - 이미 그 날 입장한 노드(재방문): true(무료 재입장).
 *  - 그 외: 그 날 입장 수 < 한도일 때만 true.
 */
export function canEnterShop(nodeId: string): boolean {
  const limit = shopEntryLimit();
  if (!Number.isFinite(limit)) return true; // 제한 없음.
  try {
    const run = useRunStore().data;
    syncShopDay();
    if ((run.shopVisitedNodes ?? []).includes(nodeId)) return true;
    return (run.shopEntriesToday ?? 0) < limit;
  } catch {
    return true;
  }
}

/**
 * shop-limit — 상점 입장을 *기록*(카운터 +1). 같은 날 같은 노드 재방문은 차감하지 않는다.
 * 입장이 실제로 성사된 시점(ShopView 진입)에서 호출. 카오스 비활성이면 아무것도 안 함.
 */
export function recordShopEntry(nodeId: string): void {
  if (!Number.isFinite(shopEntryLimit())) return;
  try {
    const run = useRunStore().data;
    syncShopDay();
    if (!run.shopVisitedNodes) run.shopVisitedNodes = [];
    if (run.shopVisitedNodes.includes(nodeId)) return; // 재방문 — 무료.
    run.shopVisitedNodes.push(nodeId);
    run.shopEntriesToday = (run.shopEntriesToday ?? 0) + 1;
  } catch {
    /* 무영향. */
  }
}

/** shop-limit — 그 날 남은 상점 입장 횟수(표시용). 제한 없으면 Infinity. */
export function shopEntriesRemaining(): number {
  const limit = shopEntryLimit();
  if (!Number.isFinite(limit)) return Infinity;
  try {
    const run = useRunStore().data;
    syncShopDay();
    return Math.max(0, limit - (run.shopEntriesToday ?? 0));
  } catch {
    return limit;
  }
}

// ===================== UI 표시 헬퍼 (Phase C) =====================

/** 티어 표시 라벨. */
export function chaosTierLabel(tier: number): string {
  switch (tier) {
    case 1: return 'T1 입문';
    case 2: return 'T2 압박';
    case 3: return 'T3 제약';
    case 4: return 'T4 레전드';
    default: return `T${tier}`;
  }
}

/** 이 카오스가 가진 강도 단계 수 (levels 길이; numeric 3 / start-hp 2 / binary·legend 1). */
export function maxIntensityOf(chaos: Chaos): number {
  return Math.max(1, chaos.levels.length);
}

/**
 * 한 강도 단계의 *효과 요약* 사람이 읽는 문구.
 * 데이터의 raw param을 effectKind별로 해석해 한국어로. (UI 툴팁/스텝 라벨용.)
 * "몬무스" 단어 미사용 — color-seal 등 종족 무관 효과만 다룸.
 */
export function chaosLevelSummary(chaos: Chaos, intensity: number): string {
  const param = effectParamOf(chaos, intensity);
  const pctUp = (p: string) => `+${Math.round(Number(p) * 100)}%`;
  // param이 음수(start-hp '-0.5')든 양수(rest-heal '0.30')든 항상 단일 '-' 접두로 표기.
  const pctDown = (p: string) => `-${Math.abs(Math.round(Number(p) * 100))}%`;
  switch (chaos.effectKind) {
    case 'enemy-hp-mul': return `적 체력 ${pctUp(param)}`;
    case 'enemy-atk-mul': return `적 공격 ${pctUp(param)}`;
    case 'elite-hp-mul': return `엘리트·보스 체력 ${pctUp(param)}`;
    case 'enemy-def-add': return `적 방어 +${param}`;
    case 'boss-atk-mul': return `보스 공격 ${pctUp(param)}`;
    case 'start-hp': return param === 'hp1' ? '체력 1로 시작' : `시작 체력 ${pctDown(param)}`;
    case 'shop-price-mul': return `상점가 ${pctUp(param)}`;
    case 'upgrade-cost-mul': return `강화비 ${pctUp(param)}`;
    case 'node-hp-loss': return `노드 진입마다 체력 -${param}`;
    case 'time-limit-mul': return `시간 한도 ${pctDown(param)}`;
    case 'rest-heal-mul': return `휴식 회복 ${pctDown(param)}`;
    case 'gather-threshold-add': return `채집 임계 +${param}`;
    case 'locked-town': return `마을 ${param}곳 잠금`;
    case 'no-removal': return '덱 편집 잠금(최근 얻은 카드로 고정)';
    case 'narrow-reward': return '카드 보상 1장 적게';
    case 'small-hand': return '매 턴 드로우 -1';
    case 'low-mana': return '전투 마나 -1';
    case 'hidden-intent': return '적 의도 가려짐';
    case 'no-map-potion': return '맵에서 포션 사용 불가';
    case 'seed-seal': return '종족 시드 컬러 봉인';
    case 'start-inject-card': return '시작 덱에 죽은 카드 주입';
    case 'color-seal': return '무작위 한 색 봉인(그 색 카드 사용 불가)';
    case 'all-gimmick': return '모든 적이 종족 기믹 1개 추가';
    case 'shop-limit': return `하루에 상점 ${param}회만 입장`;
    case 'fragile-glory': return '시작 최대 체력 절반 · 보스 보상 2배';
    case 'no-respite': return '휴식 회복 소멸 · 상점 회복 구매 개방';
    default: return chaos.description;
  }
}

/**
 * 매 클리어 시 다음 티어 진열 해금 (Round 9 단순화).
 * 활성 카오스가 ≥1개이면(임의 하위 티어 허용) `chaosTierRevealed = min(4, +1)`.
 * 첫 클리어 한정 아님 — *매 클리어* 평가, 한 번에 1티어.
 */
export function revealNextTierOnClear(run: RunState): void {
  const active = normalizeActive(run.activeChaos);
  if (active.length === 0) return; // 활성 카오스 없음 — 진열 변동 없음.
  const meta = useMetaStore();
  if (meta.chaosTierRevealed < 4) {
    meta.chaosTierRevealed = Math.min(4, meta.chaosTierRevealed + 1);
    meta.persist();
  }
}

/**
 * 클리어 시 연표별 최고 점수 갱신.
 * meta.bestChaosScore[timeline] = max(기존 || 0, computeChaosScore(activeChaos)).
 */
export function recordBestChaos(run: RunState): void {
  const meta = useMetaStore();
  const timeline = run.timelineId;
  if (!timeline) return;
  const score = computeChaosScore(normalizeActive(run.activeChaos));
  const prev = meta.bestChaosScore[timeline] ?? 0;
  if (score > prev) {
    meta.bestChaosScore[timeline] = score;
    meta.persist();
  }
}
