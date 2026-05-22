/**
 * 전투 시스템.
 *
 * spec v2 Round 8: 카드 = 여정. 핸드 드로우 + 카드 사용 + 적 행동 + 턴 진행.
 * 분기 B (하이브리드): 효과는 *데이터 드리븐* 기본, *함수 슬롯*은 특수 카드용.
 * 분기 C (하이브리드): *기본 턴제* + *persistent 카드*는 지속 효과.
 *
 * MVR 단계 효과 종류: damage / heal / block / draw / apply-status.
 * 사용자 정의: 몬스터는 골드 + 시간의 조각 드롭.
 */

import type {
  Card,
  CardEffect,
  CardEffectKind,
  CombatState,
  Combatant,
  EffectTarget,
  Monster,
  MonsterDrop,
} from '@/data/schemas';
import { drawCards, discardHand, instantiateCard, shuffle } from './deck';
import { rng } from './rng';
import { bonusesFromEffective } from './equipment';
import {
  applyModifiers,
  fireRelicTrigger,
  getModifierAdd,
  getModifierMul,
  onCombatStart as fireOnCombatStart,
  onCombatEnd as fireOnCombatEnd,
} from './relic';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import {
  enemyHpMul,
  enemyAtkMul,
  enemyDefAdd,
  handSizeReduction,
  manaReduction,
  isHiddenIntent,
  allGimmickIntentFor,
  isNarrowReward,
} from '@/systems/chaos';

const STARTING_HAND_SIZE = 5;
const DEFAULT_MAX_MANA = 3;

/** 전투 로그 큐 최대 보관 수 (표시는 뷰에서 마지막 몇 줄만). */
const LOG_MAX = 24;
/** 전투 로그에 한 줄 추가 — 오래된 항목은 앞에서 잘라 LOG_MAX 유지. */
function pushLog(c: CombatState, text: string): void {
  if (!text) return;
  c.log = [...(c.log ?? []), text].slice(-LOG_MAX);
}
/** 상태이상 스택 총합 — 로그에서 디버프 부여 여부 판정용. */
function countStatuses(statuses: Record<string, number> | undefined): number {
  if (!statuses) return 0;
  let sum = 0;
  for (const v of Object.values(statuses)) sum += v;
  return sum;
}

/** 현재 런의 *effective* 컬러(베이스+장비)에서 도출된 전투 보너스 (B1 fix). */
function currentBonuses() {
  const run = useRunStore();
  const data = useDataStore();
  return bonusesFromEffective(run.data, data.equipments);
}

/**
 * 플레이어가 *이번 전투에서 실제로 받을* 컬러 스탯 보너스.
 *
 * regress(퇴행) 상태이면 ATK/DEF/MAG 컬러 보너스를 *전부 무효* — 모두 0.
 * 그 외에는 currentBonuses()와 동일.
 *
 * 주의: 컬러 *직접* 피해(damage-top-color / damage-min-color / damage-color-count 등)는
 * 스탯 보너스가 아니라 컬러값 자체를 쓰므로 regress 영향을 받지 않는다.
 */
function playerBonuses(c: CombatState): ReturnType<typeof currentBonuses> {
  if ((c.player.statuses?.regress ?? 0) > 0) {
    return { damage: 0, block: 0, drawExtra: 0, manaExtra: 0 };
  }
  return currentBonuses();
}

/**
 * 플레이어가 *해당 kind의 효과를 가진 패시브 마커 유물*을 보유했는지.
 * C 메커니즘 유물(block-carryover / mana-carryover / first-card-free / double-debuff)은
 * 핸들러 없이 이 조회로 전투 흐름에서 동작한다.
 */
function playerHasRelicEffect(kind: string): boolean {
  try {
    return useRunStore().data.relics.some((r) => r.effects.some((e) => e.kind === kind));
  } catch {
    return false;
  }
}

/**
 * 전투 중 *버프/디버프*가 카드 effect.value에 더하는 *플랫* 보정.
 *   - damage: +strength
 *   - block: +dexterity, -frail
 * 사용자 사양: 카드 표시에서 "(+1) / (-2)" 부가 표기.
 *
 * 주의 (status 통합 fix): weakness는 *배수 단계*(applyDamage의 ×0.75)로 일원화했다.
 * 따라서 여기서는 weakness 플랫 차감을 *제거* — 중복 적용 방지.
 * (frail은 block 전용이라 배수 단계가 없으므로 플랫으로 유지.)
 */
export function statusBonusForCardEffectKind(
  kind: string,
  statuses: Record<string, number> | undefined,
): number {
  if (!statuses) return 0;
  // sap(잠식): 주는 피해와 방어 둘 다 *플랫* 차감(weakness 배수와 별개). 음수 방지는 최종 적용처에서.
  const sap = statuses.sap ?? 0;
  if (kind === 'damage') return (statuses.strength ?? 0) - sap;
  if (kind === 'block') return (statuses.dexterity ?? 0) - (statuses.frail ?? 0) - sap;
  return 0;
}

/**
 * 통합 피해 적용 — 모든 피해 경로(카드 damage / 컬러 피해 / 적 공격)가 이 함수를 거친다.
 *
 * rawValue: 이미 strength/ATK/modifier 등 *플랫 보정이 끝난* 피해량.
 * attackerStatuses: 공격자의 statuses (플레이어 카드면 player, 적 공격이면 enemy).
 *
 * 적용 순서:
 *   rawValue → weakness(공격자) ×0.75 → ghost(공격자) ×0.5 → vulnerable(대상) ×1.5
 *            → ghost(대상) ×0.5 → damage-in-mul → block 흡수 → hp.
 * 각 배수마다 Math.floor.
 */
function applyDamage(
  target: Combatant,
  rawValue: number,
  attackerStatuses: Record<string, number> | undefined,
  isPlayerTarget = false,
): void {
  let v = Math.max(0, rawValue);
  // weakness(약화): 공격자가 주는 피해 ×0.75.
  const weakness = attackerStatuses?.weakness ?? 0;
  if (weakness > 0) v = Math.floor(v * 0.75);
  // 세뇌(brainwash): 홀려서 손이 무뎌진다 — 공격자가 주는 피해 ×0.66.
  if ((attackerStatuses?.brainwash ?? 0) > 0) v = Math.floor(v * 0.66);
  // 각인(imprint): 새겨진 표식이 힘을 빼앗는다 — 공격자가 주는 피해 ×0.85(가벼움, 빙의 전조).
  if ((attackerStatuses?.imprint ?? 0) > 0) v = Math.floor(v * 0.85);
  // 빙의(possession): 몸을 절반쯤 빼앗긴다 — 공격자가 주는 피해 ×0.5(강력, 비감쇠).
  if ((attackerStatuses?.possession ?? 0) > 0) v = Math.floor(v * 0.5);
  // ghost(유령화·공격자): 비실체라 *주는 피해 ×0.5*. weakness 뒤(출력 단계).
  const attackerGhost = attackerStatuses?.ghost ?? 0;
  if (attackerGhost > 0) v = Math.floor(v * 0.5);
  // vulnerable(취약): 대상이 받는 피해 ×1.5.
  const vulnerable = target.statuses?.vulnerable ?? 0;
  if (vulnerable > 0) v = Math.floor(v * 1.5);
  // ghost(유령화·대상): 비실체라 *받는 피해 ×0.5*. vulnerable 뒤(입력 단계).
  const targetGhost = target.statuses?.ghost ?? 0;
  if (targetGhost > 0) v = Math.floor(v * 0.5);
  // damage-in-mul 유물: 플레이어가 *받는* 피해에만 배수 적용 (예: 글래스 프리즘 ×1.3).
  if (isPlayerTarget) {
    const inMul = getModifierMul('damage-in-mul');
    if (inMul !== 1) v = Math.floor(v * inMul);
  }
  // block 흡수 후 hp 차감.
  const absorbed = Math.min(target.block, v);
  target.block -= absorbed;
  const hpLoss = v - absorbed;
  target.hp = Math.max(0, target.hp - hpLoss);
  // 수면(sleep): 실제로 HP를 깎는 피해를 받으면 즉시 깬다.
  if (isPlayerTarget && hpLoss > 0 && (target.statuses?.sleep ?? 0) > 0) {
    delete target.statuses.sleep;
  }
}

/**
 * poison(중독) 턴 처리 — 대상 턴 종료 시 호출.
 * 스택만큼 *block 무시 직접 hp* 피해, 그 후 스택 -1. 스택 0이면 제거.
 * (vulnerable/weakness 배수는 적용하지 않음 — poison은 *순수 직접 피해*.)
 */
function tickPoison(target: Combatant): void {
  const stack = target.statuses?.poison ?? 0;
  if (stack <= 0) return;
  target.hp = Math.max(0, target.hp - stack);
  const next = stack - 1;
  if (next <= 0) {
    delete target.statuses.poison;
  } else {
    target.statuses.poison = next;
  }
}

/**
 * 매 턴 1씩 자연 감소하는 디버프 목록 — 적이 걸 때 *최소 2* 보장(executeMonsterIntent)과
 * 턴 감소(decayTurnStatuses)가 같은 목록을 공유한다.
 */
const DECAYING_DEBUFFS = new Set<string>(['feral', 'regress', 'sap', 'ghost', 'weakness', 'vulnerable', 'frail', 'brainwash', 'sleep', 'slime']);

/**
 * 지속 상태이상 턴 감소 — 매 플레이어 턴 종료 시 양쪽(플레이어·적) -1, 0이면 제거.
 * feral/regress/sap/ghost + weakness/vulnerable/frail(매 턴 1씩 자연 감소).
 */
function decayTurnStatuses(target: Combatant): void {
  if (!target.statuses) return;
  for (const key of DECAYING_DEBUFFS) {
    const stack = target.statuses[key] ?? 0;
    if (stack <= 0) continue;
    const next = stack - 1;
    if (next <= 0) delete target.statuses[key];
    else target.statuses[key] = next;
  }
}

/**
 * 적 사망 인터셉트 — 분열(split) 처리.
 *
 * 반환값:
 *   - true  : 적이 *진짜로* 패배(hp<=0 && 부활 잔여 없음) → 호출자가 승리 처리.
 *   - false : 적이 아직 살아 있음(hp>0) 또는 *분열로 부활*(hp<=0 && enemySplit>0).
 *
 * 부활 시: hp = floor(maxHp*0.5), enemySplit -= 1, 토스트. 무한루프 방지 — 부활마다 감소.
 * 모든 적 사망 체크 지점(playCard 반환 + endPlayerTurn poison/intent/retaliate/boss rewind)이
 * 이 헬퍼를 거쳐야 분열 몹이 한 곳에서라도 그냥 죽는 누락이 없다.
 */
function resolveEnemyDefeat(c: CombatState): boolean {
  if (c.enemy.hp > 0) return false;
  const remaining = c.enemySplit ?? 0;
  if (remaining > 0) {
    c.enemySplit = remaining - 1;
    c.enemy.hp = Math.max(1, Math.floor(c.enemy.maxHp * 0.5));
    // 부활 적은 block을 들고 일어나지 않게 0으로 (방어적).
    c.enemy.block = 0;
    useUiStore().toast('warning', '분열했다! — 다시 나뉘었다');
    return false;
  }
  return true;
}

// === 하루 경과 스케일링 — 날이 갈수록 적이 강해진다(초반 HP 감소를 후반에서 보강). ===
// 일반 몬스터 HP를 권역 데이터에서 깎은 대신, 하루가 지날수록 HP/공격이 더 크게 오른다.
// day 1 = ×1. HP는 +18%/일, 공격은 +12%/일. (런 ~3일 → day3 HP ×1.36, ATK ×1.24.)
const DAY_HP_SCALE_PER_DAY = 0.18;
const DAY_ATK_SCALE_PER_DAY = 0.12;
/** 적 HP 하루 스케일 배수(currentDay 기반). */
function dayHpScale(): number {
  const day = Math.max(1, useRunStore().data.currentDay ?? 1);
  return 1 + DAY_HP_SCALE_PER_DAY * (day - 1);
}
/** 적 공격 하루 스케일 배수(currentDay 기반). */
function dayAtkScale(): number {
  const day = Math.max(1, useRunStore().data.currentDay ?? 1);
  return 1 + DAY_ATK_SCALE_PER_DAY * (day - 1);
}

/** 전투 시작 — Combat state 초기화 + 첫 핸드 드로우. */
export function startCombat(monster: Monster) {
  const run = useRunStore();
  const r = run.data;

  // 런에 잔존하는 강 상태이상(빙의·수화 중)을 안고 전투를 시작한다(정화 전까지).
  const carriedStatuses: Record<string, number> = {};
  if ((r.possessed ?? 0) > 0) carriedStatuses.possession = r.possessed as number;
  if ((r.feralHeavy ?? 0) > 0) carriedStatuses['feral-heavy'] = r.feralHeavy as number;
  const player: Combatant = {
    hp: r.hp,
    maxHp: r.maxHp,
    block: 0,
    statuses: carriedStatuses,
  };

  // 카오스 상시형 — enemy-hp-mul(+elite-hp-mul, 엘리트/보스) 활성 시 적 HP 배수 상향(올림).
  // + 하루 경과 스케일(dayHpScale) — 날이 갈수록 적 HP 증가.
  const scaledEnemyHp = Math.round(monster.hp * enemyHpMul(monster) * dayHpScale());
  const enemyCombatant: Combatant = {
    hp: scaledEnemyHp,
    maxHp: scaledEnemyHp,
    // 카오스 enemy-def-add — 적 전투 시작 block +N.
    block: enemyDefAdd(),
    statuses: {},
  };

  // MAG 보너스 + 유물(draw-extra-add / mana-extra-add)로 드로우/마나 증가.
  // 카오스 small-hand/low-mana — 드로우/마나 감소(최소 클램프).
  const bonus = currentBonuses();
  const handSize = Math.max(
    0,
    STARTING_HAND_SIZE + bonus.drawExtra + getModifierAdd('draw-extra-add') - handSizeReduction(),
  );
  const maxMana = Math.max(
    0,
    DEFAULT_MAX_MANA + bonus.manaExtra + getModifierAdd('mana-extra-add') - manaReduction(),
  );

  // 전투 시작마다 덱을 *새로 셔플* — 안 하면 매 전투 드로우 순서가 r.deck 정의 순서로 고정된다.
  // (seeded rng는 런 동안 전역으로 진행되므로 전투마다 다른 순서가 나온다.)
  const drawPile = shuffle([...r.deck]);
  const { drawn, newDrawPile, newDiscardPile } = drawCards(drawPile, [], handSize);

  // 카오스 all-gimmick(만물의 송곳니) — 그 몬스터 *종족 대표 기믹*을 인텐트 로테이션에 삽입.
  // 보스는 자체 기믹이 강하므로 제외(일반·엘리트만). 보스 판정은 monster.id가 보스 정의에 있는가.
  const enemyIntentRotation = buildEnemyIntentRotation(monster);
  // 첫 턴 의도 큐 — 멀티액션이면 여러 개, 일반이면 1개.
  const initIntents = buildIntentQueue(monster, 0, enemyIntentRotation);

  const combat: CombatState = {
    enemy: enemyCombatant,
    enemyIntent: initIntents[0],
    enemyIntentQueue: initIntents,
    intentCooldowns: {},
    enemyBaseAttack: monster.attack,
    // 락인 수치 — 적이 락인 의도(`~unlocked=`)를 쓸 때 플레이어가 풀려면 그 턴 쌓아야 할 방어량.
    lockIn: monster.lockIn ?? 0,
    player,
    hand: drawn,
    drawPile: newDrawPile,
    discardPile: newDiscardPile,
    exhaustPile: [],
    turn: 1,
    mana: maxMana,
    maxMana: maxMana,
    log: [],
    // 보스 기믹 카운터 초기화 — 일반 전투에선 bossMechanic이 undefined라 무시됨.
    stillness: 0,
    bossTurnCount: 0,
    lockedCardIds: [],
    frozenTurn: false,
    // 유물 카운터 — 매 전투 리셋.
    relicCounters: {},
    cardsPlayedThisTurn: 0,
    potionUsedThisTurn: false,
    // 이상전투 심화 기믹 초기화 — splitCount 없으면 0(부활 없음), 거미줄 0.
    enemySplit: monster.splitCount ?? 0,
    webStacks: 0,
    // 카오스 all-gimmick — 종족 대표 기믹이 끼워진 인텐트 로테이션(미주입 시 undefined → 원본 사용).
    enemyIntentRotation,
    // 카오스 hidden-intent — 적 의도 가려짐(Stage2 obscure 재사용). 큰 값으로 상시 은폐.
    obscuredTurns: isHiddenIntent() ? 9999 : 0,
  };
  r.combat = combat;

  // 보스 기믹: 첫 플레이어 턴 시작 훅 (마나/잠금/스냅샷). bossMechanic 미설정 시 no-op.
  // (BossView는 startCombat 직후 bossMechanic을 set하므로, 1턴 기믹은 첫 endPlayerTurn 이후부터 본격 적용.)
  applyBossPlayerTurnStart(combat);

  // on-combat-start 유물 발동, 이어서 1턴의 on-turn-start.
  fireOnCombatStart();
  fireRelicTrigger('on-turn-start', { run: r, combat });
}

/**
 * 보스 기믹 — *플레이어 턴 시작* 훅. `combat.bossMechanic`이 set일 때만 동작.
 * startCombat(1턴)과 endPlayerTurn(새 턴 드로우 후)에서 호출된다.
 * 일반 몬스터 전투에선 bossMechanic === undefined → 전체 no-op.
 *
 * 호출 시점엔 *이번 플레이어 턴의 손패*가 이미 드로우되어 있어야 한다(닻 잠금 대상).
 */
function applyBossPlayerTurnStart(c: CombatState): void {
  const mech = c.bossMechanic;
  if (!mech) return;
  const ui = useUiStore();

  // rewind: 이번 플레이어 턴 시작 시 적 HP 스냅샷 (턴 종료 시 피해량 = 스냅샷 - 현재 HP).
  c.playerTurnStartEnemyHp = c.enemy.hp;

  // stillness: 누적 스택에 따라 마나 감소. 4 이상이면 이번 턴 정지.
  if (mech === 'stillness') {
    const stack = c.stillness ?? 0;
    if (stack >= 4) {
      c.frozenTurn = true;
      c.mana = 0;
      c.hand = []; // 정지 턴은 드로우 0 — 보충된 핸드를 비운다.
      c.stillness = 0;
      ui.toast('warning', '시간이 멈춰 — 아무것도 할 수 없다.');
    } else {
      c.frozenTurn = false;
      c.mana = Math.max(0, c.maxMana - Math.floor(stack / 2));
    }
  } else {
    c.frozenTurn = false;
  }

  // anchor: 적 턴 블록에서 "이번 턴 잠금 예정" 카운트가 짝수면, 새 손패에서 1장 잠금.
  if (mech === 'anchor') {
    const count = c.bossTurnCount ?? 0;
    if (count > 0 && count % 2 === 0 && c.hand.length > 0) {
      const idx = Math.floor(rng() * c.hand.length);
      const target = c.hand[idx];
      const iid = target?.instanceId;
      if (iid) {
        c.lockedCardIds = [iid];
        ui.toast('warning', '시간의 닻이 한 장을 붙잡는다.');
      }
    }
  }
}

/**
 * 보스 기믹 — *적 턴* 훅. 적 행동·poison 등 모든 처리가 끝난 뒤 호출.
 * `combat.bossMechanic`이 set일 때만 동작. 일반 전투에선 전체 no-op.
 *
 *  - anchor   : 이전 잠금 해제 + bossTurnCount += 1 (실제 잠금은 다음 플레이어 턴 시작에서).
 *  - stillness: stillness += 1.
 *  - rewind   : 직전 플레이어 턴 피해의 절반(최대 40) 회복 + 자기 디버프 제거.
 */
function applyBossEnemyTurn(c: CombatState): void {
  const mech = c.bossMechanic;
  if (!mech) return;
  const ui = useUiStore();

  if (mech === 'anchor') {
    // 이전 플레이어 턴 잠금 해제 후 재판정용 카운트만 증가. 실제 잠금은 새 손패 기준.
    c.lockedCardIds = [];
    c.bossTurnCount = (c.bossTurnCount ?? 0) + 1;
  }

  if (mech === 'stillness') {
    c.stillness = (c.stillness ?? 0) + 1;
  }

  if (mech === 'rewind') {
    const before = c.playerTurnStartEnemyHp ?? c.enemy.hp;
    const dealt = Math.max(0, before - c.enemy.hp);
    c.lastPlayerTurnDamage = dealt;
    const heal = Math.min(40, Math.floor(dealt * 0.5));
    if (heal > 0) {
      c.enemy.hp = Math.min(c.enemy.maxHp, c.enemy.hp + heal);
      ui.toast('info', '정령이 이 순간을 되감는다.');
    }
    // 적 자신의 디버프 제거.
    for (const key of ['vulnerable', 'weakness', 'poison', 'regress']) {
      delete c.enemy.statuses[key];
    }
  }
}

/**
 * 카드를 핸드에서 사용. 효과 적용 후 디스카드.
 * 적 사망 시 false (호출자가 결과 화면으로 전환), 아니면 true.
 */
export function playCard(handIndex: number, monster: Monster): { enemyDefeated: boolean } {
  const run = useRunStore();
  const ui = useUiStore();
  const r = run.data;
  const c = r.combat;
  if (!c) return { enemyDefeated: false };

  const card = c.hand[handIndex];
  if (!card) return { enemyDefeated: false };

  // 잡카드(상처/저주): 사용 불가 — 칸만 차지, 전투 종료 시 소멸.
  if (card.unplayable) {
    ui.toast('warning', '이 카드는 쓸 수 없다.');
    return { enemyDefeated: false };
  }

  // 카오스 color-seal(색의 침묵) — 봉인된 색의 카드는 사용 불가(anchor/web 잠금 패턴 동형).
  if (r.chaosBannedColor && card.element === r.chaosBannedColor) {
    ui.toast('warning', '봉인된 색 — 이 카드는 쓸 수 없다.');
    return { enemyDefeated: false };
  }

  // 잠긴 카드 — 보스 기믹(닻) 또는 구속(bind)으로 묶임. lockedCardIds가 비어 있으면 영향 0.
  if (card.instanceId && c.lockedCardIds?.includes(card.instanceId)) {
    ui.toast('warning', c.bossMechanic ? '시간의 닻에 묶여 움직이지 않는다.' : '묶여서 움직이지 않는다.');
    return { enemyDefeated: false };
  }

  // 동적 cost: c-tripps-rage는 *이번 런 누적 피해*만큼 cost 경감.
  let baseCost = card.cost;
  if (card.id === 'c-tripps-rage' || card.id === 'c-tripps-rage-plus') {
    const damageReceived = r.runDamageReceived ?? 0;
    baseCost = Math.max(0, baseCost - damageReceived);
  }
  // cost-mod-add 유물 (예: 모든 카드 비용 -1) + 몬스터 비용 교란(cost-up) 적용. 음수 cost는 0으로 clamp.
  let effCost = Math.max(0, baseCost + getModifierAdd('cost-mod-add') + (c.costUp?.amount ?? 0));
  // first-card-free 유물: 매 턴 *첫 카드*의 비용 0.
  if ((c.cardsPlayedThisTurn ?? 0) === 0 && playerHasRelicEffect('first-card-free')) {
    effCost = 0;
  }
  // r4: debugFlag infiniteMana — 마나 가드 우회 + 차감 스킵. *디버그 전투에서만* 적용(일반 런 누수 방지).
  const inf = ui.debug.infiniteMana && !!(ui.debugBattle.monsterId || ui.debugBattle.bossId);
  if (!inf && c.mana < effCost) {
    ui.toast('warning', '마나가 부족합니다');
    return { enemyDefeated: false };
  }
  if (!inf) c.mana -= effCost;
  // 이번 턴 사용 카드 수 누적 (first-card-free 판정용).
  c.cardsPlayedThisTurn = (c.cardsPlayedThisTurn ?? 0) + 1;

  // 카드 효과 적용 *직전* trigger — 자기 자신의 데미지 계산에 영향을 줄 마지막 기회.
  fireRelicTrigger('on-card-played-before', { run: r, combat: c, triggeredBy: card.id });

  // growing-block/growing-damage 효과 핸들러가 카드 인스턴스의 bonus를 더하기 위해 임시 참조를 세팅.
  (c as { currentPlayingCard?: Card }).currentPlayingCard = card;

  // next-card-double: *이전* 카드가 세워 둔 플래그가 켜져 있으면 이 카드의 모든 effect value 2배.
  // 이번 카드가 스스로 세우는 플래그(자기 자신은 영향 X)와 구분하기 위해, 효과 루프 *전*에 캡처.
  const flags = c as { nextCardDouble?: boolean };
  const doubleThisCard = flags.nextCardDouble === true;
  if (doubleThisCard) flags.nextCardDouble = false;

  // 로그용 스냅샷 — 효과 적용 전후 차이로 "방금 전 플레이 내용" 요약.
  const snapEnemyHp = c.enemy.hp;
  const snapPlayerHp = c.player.hp;
  const snapPlayerBlock = c.player.block;
  const snapEnemyStatus = countStatuses(c.enemy.statuses);

  for (const effect of card.effects) {
    if (doubleThisCard && effect.value !== undefined) {
      // value를 2배로 한 *사본*으로 적용 — 원본 effect는 건드리지 않음.
      applyEffect({ ...effect, value: effect.value * 2 }, c);
    } else {
      applyEffect(effect, c);
    }
  }

  (c as { currentPlayingCard?: Card }).currentPlayingCard = undefined;

  // 카드 사용 결과를 전투 로그에 기록 — 피해/방어/회복/디버프 델타를 짧게 요약.
  {
    const segs: string[] = [];
    const dmg = snapEnemyHp - c.enemy.hp;
    if (dmg > 0) segs.push(`적 -${dmg}`);
    const heal = c.player.hp - snapPlayerHp;
    if (heal > 0) segs.push(`HP +${heal}`);
    const blk = c.player.block - snapPlayerBlock;
    if (blk > 0) segs.push(`방어 +${blk}`);
    const dbuff = countStatuses(c.enemy.statuses) - snapEnemyStatus;
    if (dbuff > 0) segs.push('디버프');
    pushLog(c, segs.length > 0 ? `「${card.name}」 ${segs.join(' · ')}` : `「${card.name}」`);
  }

  // growing-block 효과가 있으면 *카드 인스턴스의 bonusBlock 누적* (다음 사용 시 block에 더해짐).
  if (card.effects.some((e) => e.kind === 'growing-block')) {
    card.bonusBlock = (card.bonusBlock ?? 0) + 1;
  }

  // growing-damage 효과가 있으면 *카드 인스턴스의 bonusDamage 누적* (다음 사용 시 damage에 더해짐).
  if (card.effects.some((e) => e.kind === 'growing-damage')) {
    card.bonusDamage = (card.bonusDamage ?? 0) + 1;
  }

  // 카드 효과 적용 *후*, 디스카드 *전* trigger.
  // alias 정규화 덕분에 옛 데이터의 trigger=on-card-play도 같은 시점에 매칭.
  fireRelicTrigger('on-card-played-after', { run: r, combat: c, triggeredBy: card.id });

  c.hand = c.hand.filter((_, i) => i !== handIndex);
  // 카드 이동: return-self-to-hand(손으로 복귀) > exhaust-self(소멸) > 기본(버린 더미).
  if (card.effects.some((e) => e.kind === 'return-self-to-hand')) {
    // 손으로 복귀(버리지 않음). 손패 가득(10)이면 예외적으로 버린 더미로.
    if (c.hand.length < 10) c.hand = [...c.hand, card];
    else c.discardPile = [...c.discardPile, card];
  } else if (card.effects.some((e) => e.kind === 'exhaust-self')) {
    c.exhaustPile = [...c.exhaustPile, card];
  } else {
    c.discardPile = [...c.discardPile, card];
  }

  // c-rize-relay 특수 후처리: *돌아온 한 판*(에코) 1장을 핸드에 push (이번 턴 비용 0 재사용 가능).
  // 에코는 같은 이름의 *별개 카드*(c-rize-relay-echo) — 자신은 다시 복제하지 않으므로 무한 공격이 안 된다.
  // 핸드 풀이면 discard로 fallback. 카드 ID 비교 — 데이터 드리븐이 아닌 *카드 특이 분기*.
  if (card.id === 'c-rize-relay' || card.id === 'c-rize-relay-plus') {
    const echoId = card.id === 'c-rize-relay-plus' ? 'c-rize-relay-echo-plus' : 'c-rize-relay-echo';
    const echoDef = useDataStore().cards.get(echoId);
    // 데이터 누락 시에도 무한 복제만은 막도록 fallback(다른 id로 cost 0 사본).
    const replica = echoDef ? instantiateCard(echoDef) : { ...card, id: echoId, cost: 0 };
    if (c.hand.length < 10) {
      c.hand = [...c.hand, replica];
    } else {
      c.discardPile = [...c.discardPile, replica];
    }
  }

  // 거미줄(web): 카드를 *실제로 사용*했으니 스택 1 감소 — 능동 플레이로 풀린다.
  // (잠긴 카드/마나부족/잡카드는 위에서 early-return하므로 여기 도달 = 실제 사용.)
  if ((c.webStacks ?? 0) > 0) {
    c.webStacks = (c.webStacks ?? 0) - 1;
    // 0이 되면 이번 턴 *즉시* 잠금 해제 — 단, bind/보스 anchor가 같은 lockedCardIds를
    // 점유 중이면 그들 잠금을 깨지 않도록 그대로 둔다(다음 턴 시작에서 재계산).
    if ((c.webStacks ?? 0) <= 0 && !c.grapple && !c.bossMechanic) {
      c.lockedCardIds = [];
      ui.toast('success', '거미줄을 떨쳐냈다.');
    }
  }

  // 분열 인터셉트 — hp<=0이어도 enemySplit>0이면 부활 후 false.
  if (resolveEnemyDefeat(c)) {
    return { enemyDefeated: true };
  }
  void monster;
  return { enemyDefeated: false };
}

/** 전투 더미를 *현재 r.deck*으로 새로 구성 — 변신 원복 시 폼 덱 → 원본 덱 교체용. */
function rebuildCombatPiles(c: CombatState): void {
  const r = useRunStore().data;
  const handSize = STARTING_HAND_SIZE + playerBonuses(c).drawExtra + getModifierAdd('draw-extra-add');
  const rebuilt = drawCards(shuffle([...r.deck]), [], handSize);
  c.drawPile = rebuilt.newDrawPile;
  c.hand = rebuilt.drawn;
  c.discardPile = rebuilt.newDiscardPile;
  c.exhaustPile = [];
  c.lockedCardIds = [];
}

function applyEffect(effect: CardEffect, c: CombatState) {
  const handler = EFFECT_HANDLERS[effect.kind];
  if (handler) handler(effect, c);
}

/** 수화(feral) 또는 수화 중(feral-heavy)인가 — 둘 다 공격 ×2 + 방어 불가. */
function playerWild(c: CombatState): boolean {
  const s = c.player.statuses;
  return (s?.feral ?? 0) > 0 || (s?.['feral-heavy'] ?? 0) > 0;
}
/** 수화 중(feral-heavy)이면 *회복 전면 차단*. (일반 수화는 회복 가능.) */
function healBlocked(c: CombatState): boolean {
  return (c.player.statuses?.['feral-heavy'] ?? 0) > 0;
}

const EFFECT_HANDLERS: Record<CardEffectKind, (e: CardEffect, c: CombatState) => void> = {
  damage: (e, c) => {
    const targets = resolveTargets(e.target ?? 'enemy', c);
    // feral(수화)/feral-heavy(수화 중): 카드 *base damage ×2* — ATK 보너스 더하기 *전*에 2배.
    const base = playerWild(c) ? (e.value ?? 0) * 2 : (e.value ?? 0);
    // ATK 스탯 보너스 — 공격 카드 *최소 공격력* +N (10 ATK당 1). regress면 0.
    const atkBonus = playerBonuses(c).damage;
    // 전투 중 player buff (strength). weakness는 applyDamage 배수 단계에서 처리.
    const statusBonus = statusBonusForCardEffectKind('damage', c.player.statuses);
    // base(×feral) + atk + status를 modifier pipeline에 흘려보냄.
    // 유물의 damage-out-add (옛 bonus-damage alias)는 applyModifiers 내부에서 합산.
    const value = applyModifiers(
      base + atkBonus + statusBonus,
      'damage-out-add',
      'damage-out-mul',
    );
    // 통합 피해: weakness(공격자=player) ×0.75 → vulnerable(대상) ×1.5 → block → hp.
    for (const t of targets) applyDamage(t, value, c.player.statuses);
  },
  // *0보다 큰(=다루는) 컬러 중 최솟값* × value 만큼 데미지. ATK/상태/modifier 보너스 모두 무시 — *순수 균형값*.
  // 단 weakness/vulnerable 배수는 통합 적용 (다른 피해 경로와 일관성).
  // 주의: 8색 전체의 min을 쓰면 보통 다수 색이 0이라 항상 0데미지가 되어 카드가 죽는다 →
  //       *아직 다루지 않는(0) 색은 제외*하고 다루는 색끼리의 최솟값을 쓴다. 시드 컬러가 있어 최소 1색은 >0.
  'damage-min-color': (e, c) => {
    const targets = resolveTargets(e.target ?? 'enemy', c);
    const colors = useRunStore().data.colors;
    const nonzero = [
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    ].filter((v) => v > 0);
    const minColor = nonzero.length > 0 ? Math.min(...nonzero) : 0;
    const value = Math.max(0, Math.floor(minColor * (e.value ?? 1)));
    for (const t of targets) applyDamage(t, value, c.player.statuses);
  },
  heal: (e, c) => {
    // 수화 중(feral-heavy): 회복 전면 차단 — self 회복 불가.
    const targets = resolveTargets(e.target ?? 'self', c);
    const value = e.value ?? 0;
    for (const t of targets) {
      if (t === c.player && healBlocked(c)) continue;
      t.hp = Math.min(t.maxHp, t.hp + value);
    }
  },
  block: (e, c) => {
    // feral(수화)/feral-heavy(수화 중): 플레이어는 *block을 전혀 쌓지 못함* — 0 부여.
    if (playerWild(c)) return;
    const targets = resolveTargets(e.target ?? 'self', c);
    // DEF 스탯 보너스 — 방어 카드 *방어력* +N (10 DEF당 1). regress면 0.
    const defBonus = playerBonuses(c).block;
    // 전투 중 player buff/debuff (dexterity/frail).
    const statusBonus = statusBonusForCardEffectKind('block', c.player.statuses);
    // base + def + status에 유물의 block-out-add 합산 (mul은 본 라운드 미사용).
    // sap(잠식)으로 statusBonus가 음수가 될 수 있으므로 최종 max(0) 클램프.
    const value = Math.max(0, applyModifiers(
      (e.value ?? 0) + defBonus + statusBonus,
      'block-out-add',
    ));
    for (const t of targets) {
      t.block += value;
    }
  },
  draw: (e, c) => {
    const count = e.value ?? 1;
    const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, count);
    c.hand = [...c.hand, ...drawn];
    c.drawPile = newDrawPile;
    c.discardPile = newDiscardPile;
  },
  'apply-status': (e, c) => {
    const targets = resolveTargets(e.target ?? 'enemy', c);
    const statusName = (e.params?.status as string) ?? 'unknown';
    const stack = e.value ?? 1;
    // double-debuff 유물: *적*에게 거는 디버프 스택 2배 (자기 버프는 불변).
    const dbl = playerHasRelicEffect('double-debuff');
    for (const t of targets) {
      const s = (t === c.enemy && dbl) ? stack * 2 : stack;
      t.statuses[statusName] = (t.statuses[statusName] ?? 0) + s;
    }
  },
  // 손에서 *가장 오른쪽* 1장을 drawPile 맨 위로 (칼리번 c-trace-step).
  // count = value (기본 1). 카드가 사용된 *직후* 시점이라 hand에는 *다른* 카드들만 남아 있음.
  'return-hand-to-deck': (e, c) => {
    let remaining = e.value ?? 1;
    while (remaining > 0 && c.hand.length > 0) {
      const last = c.hand[c.hand.length - 1];
      c.hand = c.hand.slice(0, -1);
      c.drawPile = [last, ...c.drawPile];
      remaining -= 1;
    }
  },
  // 다음 턴 시작 에너지 +value 누적 (칼리번 c-trace-step).
  // endPlayerTurn 끝부분에서 mana += nextTurnEnergyBonus 후 0으로 리셋.
  'next-turn-energy': (e) => {
    const r = useRunStore().data;
    r.nextTurnEnergyBonus = (r.nextTurnEnergyBonus ?? 0) + (e.value ?? 1);
  },
  // block:value + *이 카드 인스턴스의 bonusBlock +growthValue* 누적 (쿠르쿠마 c-growing-leaf).
  // e.value = 기본 block, e.params.growth = 누적량(기본 1). bonusBlock은 매 사용마다 누적 → 다음 사용 때 더해짐.
  'growing-block': (e, c) => {
    // 이 효과가 적용되는 시점에서 *어떤 카드*가 트리거됐는지 알기 위해 컨텍스트 카드 참조가 필요.
    // playCard의 currentPlayingCard를 통해 우회 — 여기선 c.hand에 없는 *방금 사용된 카드*를 추적해야 함.
    // 단순화: combat 상태에 latestPlayingCard 임시 필드를 두지 않고, playCard에서 `growing-block` 효과 카드를 미리 식별해 처리.
    // → 이 핸들러는 block 효과만 수행하고, *누적*은 playCard 본체에서.
    // feral(수화): block 부여 0. 단 bonusBlock *누적*은 playCard 본체에서 계속됨(다음 사용 대비).
    if (playerWild(c)) return;
    const targets = resolveTargets(e.target ?? 'self', c);
    const defBonus = playerBonuses(c).block;
    const statusBonus = statusBonusForCardEffectKind('block', c.player.statuses);
    const base = e.value ?? 0;
    const bonus = (c as { currentPlayingCard?: Card }).currentPlayingCard?.bonusBlock ?? 0;
    // sap(잠식)으로 statusBonus가 음수가 될 수 있으므로 최종 max(0) 클램프.
    const value = Math.max(0, applyModifiers(
      base + bonus + defBonus + statusBonus,
      'block-out-add',
    ));
    for (const t of targets) {
      t.block += value;
    }
  },
  // === 측정 어려운 메커니즘 (1차 배치) — 컬러/상태/HP/패 ===
  // 순수 피해 헬퍼: block 흡수 후 hp 차감.
  // 8 컬러 중 *최댓값* × value (보강 무시).
  'damage-top-color': (e, c) => {
    const colors = useRunStore().data.colors;
    const top = Math.max(
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    );
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), Math.floor(top * (e.value ?? 1)));
  },
  // *0보다 큰 컬러 종류 수* × value.
  'damage-color-count': (e, c) => {
    const colors = useRunStore().data.colors;
    const count = [
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    ].filter((v) => v > 0).length;
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), count * (e.value ?? 1));
  },
  // 8 컬러 중 *최댓값* × value 방어.
  'block-top-color': (e, c) => {
    // feral(수화): 플레이어는 block을 전혀 쌓지 못함 — 0 부여.
    if (playerWild(c)) return;
    const colors = useRunStore().data.colors;
    const top = Math.max(
      colors.fire, colors.water, colors.electric, colors.iron,
      colors.earth, colors.wind, colors.light, colors.dark,
    );
    c.player.block += Math.floor(top * (e.value ?? 1));
  },
  // params.color 컬러 ≥ params.threshold면 value장 드로우.
  'draw-if-color': (e, c) => {
    const color = (e.params?.color as keyof typeof zeroColors) ?? 'fire';
    const threshold = Number(e.params?.threshold ?? 5);
    const colors = useRunStore().data.colors;
    if ((colors[color] ?? 0) >= threshold) {
      const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, e.value ?? 1);
      c.hand = [...c.hand, ...drawn];
      c.drawPile = newDrawPile;
      c.discardPile = newDiscardPile;
    }
  },
  // (적 디버프 스택 총합) × value + base 데미지.
  'damage-per-debuff': (e, c) => {
    const s = c.enemy.statuses;
    // regress(퇴행)/feral도 포함한 *모든* 적 디버프 스택 총합 (status 작동).
    const debuffSum = (s.vulnerable ?? 0) + (s.weakness ?? 0) + (s.frail ?? 0)
      + (s.poison ?? 0) + (s.feral ?? 0) + (s.regress ?? 0);
    // regress면 atkBonus 0 (playerBonuses).
    const atkBonus = playerBonuses(c).damage + statusBonusForCardEffectKind('damage', c.player.statuses);
    const value = applyModifiers((e.value ?? 0) * debuffSum + atkBonus, 'damage-out-add', 'damage-out-mul');
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), value);
  },
  // 적 *취약 스택 제거* → 제거량 × value 추가 데미지.
  'consume-vulnerable': (e, c) => {
    const vuln = c.enemy.statuses.vulnerable ?? 0;
    c.enemy.statuses.vulnerable = 0;
    dealRawDamage([c.enemy], vuln * (e.value ?? 1));
  },
  // 자기 HP를 value 지불, 지불액 × params.mult 데미지.
  'damage-from-hp': (e, c) => {
    const pay = Math.min(e.value ?? 0, Math.max(0, c.player.hp - 1));
    c.player.hp -= pay;
    const mult = Number(e.params?.mult ?? 2);
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), Math.floor(pay * mult));
  },
  // *현재 손패 수* × value 데미지 (이 카드 사용 후 핸드 — 자기 자신은 아직 hand에 있음).
  'damage-per-hand': (e, c) => {
    const handCount = c.hand.length;
    // regress면 atkBonus 0 (playerBonuses).
    const atkBonus = playerBonuses(c).damage + statusBonusForCardEffectKind('damage', c.player.statuses);
    const value = applyModifiers((e.value ?? 1) * handCount + atkBonus, 'damage-out-add', 'damage-out-mul');
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), value);
  },
  // === 측정 어려운 메커니즘 (3차 배치) ===
  // 마커: 실제 처리는 playCard 본체(card.effects에 exhaust-self 있으면 exhaustPile로). 핸들러는 no-op.
  'exhaust-self': () => {
    // no-op — playCard에서 카드 이동 분기로 처리.
  },
  'return-self-to-hand': () => {
    // no-op — playCard에서 카드 이동 분기로 처리(버리지 않고 손으로 복귀).
  },
  // 현재 player.block × value 추가 피해 (block 소모하지 않음). weakness/vulnerable 통합 적용.
  'block-to-damage': (e, c) => {
    const value = c.player.block * (e.value ?? 1);
    for (const t of resolveTargets(e.target ?? 'enemy', c)) {
      applyDamage(t, value, c.player.statuses);
    }
  },
  // 남은 mana 전부 소비 → 소비액 × value 피해. (playCard에서 effCost 차감 후 남은 mana 기준.)
  'spend-all-energy': (e, c) => {
    const spent = c.mana;
    c.mana = 0;
    const value = spent * (e.value ?? 1);
    for (const t of resolveTargets(e.target ?? 'enemy', c)) {
      applyDamage(t, value, c.player.statuses);
    }
  },
  // 동료 수 × value 피해.
  'damage-per-companion': (e, c) => {
    const count = useRunStore().data.companions.length;
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), count * (e.value ?? 1));
  },
  // 유물 수 × value 피해.
  'damage-per-relic': (e, c) => {
    const count = useRunStore().data.relics.length;
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), count * (e.value ?? 1));
  },
  // growing-block의 공격판: damage = (value + 이 카드 인스턴스의 bonusDamage) + atk/status 보정.
  // 누적은 playCard 본체에서 (다음 사용 시 더해짐). feral ×2는 적용하지 않음(특수 효과 일관).
  'growing-damage': (e, c) => {
    const bonus = (c as { currentPlayingCard?: Card }).currentPlayingCard?.bonusDamage ?? 0;
    // regress면 atkBonus 0 (playerBonuses).
    const atkBonus = playerBonuses(c).damage + statusBonusForCardEffectKind('damage', c.player.statuses);
    const value = applyModifiers((e.value ?? 0) + bonus + atkBonus, 'damage-out-add', 'damage-out-mul');
    dealRawDamage(resolveTargets(e.target ?? 'enemy', c), value);
  },
  // *현재 손패 수* × value 회복 (self, maxHp clamp).
  'heal-per-hand': (e, c) => {
    const handCount = c.hand.length;
    const value = handCount * (e.value ?? 1);
    for (const t of resolveTargets(e.target ?? 'self', c)) {
      t.hp = Math.min(t.maxHp, t.hp + value);
    }
  },
  // combat flag: *다음 1장*의 모든 effect value 2배. 실제 2배 적용은 playCard 본체.
  // 이 카드 자신은 영향 없음(playCard가 효과 루프 전에 플래그를 캡처하기 때문).
  'next-card-double': (_e, c) => {
    (c as { nextCardDouble?: boolean }).nextCardDouble = true;
  },
  // 유령화(비실체) — 플레이어 자신을 value턴 ghost: 받는·주는 피해 ×0.5(양날). 매 턴 -1 (decayTurnStatuses).
  'ghost-self': (e, c) => {
    const turns = e.value ?? 2;
    c.player.statuses['ghost'] = (c.player.statuses['ghost'] ?? 0) + turns;
  },
  // 마커: 저주 잡카드가 손에 있으면 매 턴 시작 피해. 실제 틱은 applyPlayerStatusTurnStart의 스캔.
  // (저주는 unplayable이라 이 핸들러는 사실상 호출되지 않음 — 타입 완전성용 no-op.)
  'curse-tick': () => {
    // no-op
  },
  // 변신 해제 카드('본모습') — 즉시가 아니라 ~2턴에 걸쳐 풀린다(releasePending 카운트다운).
  // 실제 원복·더미 재구성은 applyPlayerStatusTurnStart에서 카운트다운 0 도달 시.
  'release-transform': (_e, c) => {
    if (!useRunStore().data.transform) return; // 변신 중이 아니면 무효.
    if ((c.releasePending ?? 0) <= 0) {
      c.releasePending = 2;
      useUiStore().toast('info', '본모습이 돌아오는 중… (2턴)');
    }
  },
};

/** 컬러 키 참조용 (draw-if-color params 타입). */
const zeroColors = {
  fire: 0, water: 0, electric: 0, iron: 0, earth: 0, wind: 0, light: 0, dark: 0,
};

/**
 * 플레이어 컬러/특수 효과 피해 — 통합 applyDamage 경유.
 * 공격자는 항상 *플레이어*(이 헬퍼는 카드 효과 전용)이므로 player.statuses의 weakness,
 * 대상의 vulnerable 배수가 일관 적용된다.
 */
function dealRawDamage(targets: Combatant[], value: number) {
  const playerStatuses = useRunStore().data.combat?.player.statuses;
  for (const t of targets) applyDamage(t, value, playerStatuses);
}

function resolveTargets(target: EffectTarget, c: CombatState): Combatant[] {
  switch (target) {
    case 'self':
      return [c.player];
    case 'enemy':
    case 'all-enemies':
    case 'random-enemy':
      return [c.enemy];
  }
}

/**
 * 플레이어 턴 종료. 적 행동 → 다음 턴 시작.
 * 플레이어 사망 시 { playerDefeated: true }.
 * 적이 (poison 등으로) 턴 종료 중 사망하면 { enemyDefeated: true } — 호출자가 승리 처리.
 */
export function endPlayerTurn(monster: Monster): { playerDefeated: boolean; enemyDefeated?: boolean } {
  const run = useRunStore();
  const r = run.data;
  const c = r.combat;
  if (!c) return { playerDefeated: false };

  // 카드 교란 지속 감소 — *끝나는* 이번 턴이 은폐/비용상승 대상이었으므로 1 소모.
  if ((c.obscuredTurns ?? 0) > 0) c.obscuredTurns = (c.obscuredTurns ?? 0) - 1;
  if (c.costUp) {
    c.costUp.turns -= 1;
    if (c.costUp.turns <= 0) c.costUp = undefined;
  }

  // 플레이어 턴 종료 trigger — 몬스터 행동 *전*.
  fireRelicTrigger('on-turn-end', { run: r, combat: c });

  // 적 poison(중독) — 적 턴 종료 처리. 몬스터 행동 *전*에 틱.
  // (poison으로 적 hp 0이 되면 행동을 생략하고 *승리* 신호 — CombatView가 onVictory.)
  // 분열 적은 부활(resolveEnemyDefeat false) → 행동을 계속 진행.
  tickPoison(c.enemy);
  if (resolveEnemyDefeat(c)) {
    return { playerDefeated: false, enemyDefeated: true };
  }

  // r4: debugFlag freezeEnemies — 적 행동 시뮬 스킵 (전투 정지 디버그). *디버그 전투에서만* 적용.
  {
    const ui = useUiStore();
    const freeze =
      ui.debug.freezeEnemies && !!(ui.debugBattle.monsterId || ui.debugBattle.bossId);
    if (!freeze) {
      // 멀티액션: 큐의 의도를 연달아 실행. 중간에 플레이어 사망/적 처치 시 즉시 종료.
      const queue = (c.enemyIntentQueue && c.enemyIntentQueue.length > 0)
        ? c.enemyIntentQueue
        : (c.enemyIntent ? [c.enemyIntent] : []);
      for (const intent of queue) {
        executeMonsterIntent(c, monster, intent);
        if (c.player.hp <= 0) return { playerDefeated: true };
        if (resolveEnemyDefeat(c)) return { playerDefeated: false, enemyDefeated: true };
      }
    }
  }

  if (c.player.hp <= 0) {
    return { playerDefeated: true };
  }

  // retaliate 등 on-damage-taken 유물로 적이 쓰러질 수 있음 — 승리 신호(분열이면 부활).
  if (resolveEnemyDefeat(c)) {
    return { playerDefeated: false, enemyDefeated: true };
  }

  // 보스 기믹 — 적 턴 처리 (anchor 카운트/해제, stillness 누적, rewind 회복+디버프 제거).
  // bossMechanic 미설정(일반 몬스터 전투)이면 no-op.
  applyBossEnemyTurn(c);
  if (resolveEnemyDefeat(c)) {
    // 되감기 회복은 hp를 올리는 방향이라 0이 될 일은 없지만, 방어적으로 확인(분열이면 부활).
    return { playerDefeated: false, enemyDefeated: true };
  }

  // feral(수화)/regress(퇴행) 턴 감소 — 양쪽 -1, 0이면 제거. (vulnerable/weakness는 불변.)
  // 새 턴의 mana/handSize 계산 *전*에 감소시켜야 regress가 다음 턴부터 풀린다.
  decayTurnStatuses(c.player);
  decayTurnStatuses(c.enemy);

  // retain-hand 유물(팬텀): 턴 종료 시 손패를 버리지 않고 유지 → 새 드로우가 *누적*된다(손패 수 빌드).
  const retainHand = playerHasRelicEffect('retain-hand');
  if (!retainHand) {
    c.discardPile = discardHand(c.hand, c.discardPile);
    c.hand = [];
  }

  c.turn += 1;
  c.cardsPlayedThisTurn = 0; // 새 턴 — first-card-free 판정 리셋.
  c.potionUsedThisTurn = false; // 새 턴 — 전투 포션 턴당 1회 가드 리셋.
  c.frozenTurn = false; // 새 턴은 기본 비정지 — 마비/보스 stillness가 이번 턴 한정으로 다시 set.
  // mana-carryover 유물: 쓰지 않은 마나를 다음 턴으로 이월.
  const manaCarry = playerHasRelicEffect('mana-carryover') ? Math.max(0, c.mana) : 0;
  // regress(퇴행)면 MAG manaExtra 무효 → 기본 maxMana만. (playerBonuses가 0 반환.)
  // 유물 mana-extra-add는 색 스탯과 무관하므로 regress와 별개로 항상 합산.
  // 카오스 low-mana — 매 턴 마나 -N(최소 0).
  // 점액(slime): 끈적임이 손을 묶어 매 턴 마나 -스택(최소 0).
  const slimeMana = c.player.statuses?.slime ?? 0;
  const effMaxMana = Math.max(
    0,
    DEFAULT_MAX_MANA + playerBonuses(c).manaExtra + getModifierAdd('mana-extra-add') - manaReduction() - slimeMana,
  );
  c.mana = effMaxMana + manaCarry;
  // 칼리번 c-trace-step: 다음 턴 시작 에너지 +N 보너스 소비.
  const nextEnergyBonus = r.nextTurnEnergyBonus ?? 0;
  if (nextEnergyBonus > 0) {
    c.mana += nextEnergyBonus;
    r.nextTurnEnergyBonus = 0;
  }
  // block-carryover 유물: 방어를 0으로 리셋하지 않고 이월. 그 외엔 매 턴 0.
  if (!playerHasRelicEffect('block-carryover')) c.player.block = 0;

  // MAG 보너스로 매 턴 드로우 +. regress면 drawExtra 무효(playerBonuses 0).
  // 유물 draw-extra-add는 색 스탯과 무관하므로 regress와 별개로 항상 합산.
  // force-discard 교란(drawDown)은 이번 드로우를 줄이고 1회 소비.
  const drawDown = c.drawDown ?? 0;
  if (drawDown > 0) c.drawDown = 0;
  // 수면(sleep): 잠에 빠져 매 턴 드로우 -스택(피해를 받으면 깬다 — applyDamage에서 해제).
  const sleepDraw = c.player.statuses?.sleep ?? 0;
  // 카오스 small-hand — 매 턴 드로우 -N(최소 0).
  const handSize = Math.max(
    0,
    STARTING_HAND_SIZE + playerBonuses(c).drawExtra + getModifierAdd('draw-extra-add')
      - drawDown - handSizeReduction() - sleepDraw,
  );
  const { drawn, newDrawPile, newDiscardPile } = drawCards(c.drawPile, c.discardPile, handSize);
  c.drawPile = newDrawPile;
  c.discardPile = newDiscardPile;
  // 손패에 드로우 추가(retain이면 유지된 손패 위에 누적). 10장 초과분은 버린 더미로.
  const HAND_CAP = 10;
  const room = Math.max(0, HAND_CAP - c.hand.length);
  c.hand = [...c.hand, ...drawn.slice(0, room)];
  if (drawn.length > room) c.discardPile = [...c.discardPile, ...drawn.slice(room)];

  const nextIntents = buildIntentQueue(monster, c.turn, c.enemyIntentRotation);
  c.enemyIntent = nextIntents[0];
  c.enemyIntentQueue = nextIntents;

  // 보스 기믹 — 새 플레이어 턴 시작 훅 (stillness 마나 감소/정지, anchor 잠금, rewind 스냅샷).
  // 새 손패 드로우 *후*에 호출해야 닻이 이번 턴 손패를 잠근다. bossMechanic 미설정이면 no-op.
  applyBossPlayerTurnStart(c);

  // 플레이어 상태 턴 시작 — 마비(이번 턴 스킵)/경련(이번 턴 마나 0). 보스 기믹 후 적용.
  applyPlayerStatusTurnStart(c);

  // 플레이어 poison(중독) — 새 턴 시작 시 틱. block 무시 직접 hp 피해.
  tickPoison(c.player);
  if (c.player.hp <= 0) {
    return { playerDefeated: true };
  }

  // 새 턴 진입 trigger — 드로우/마나 리셋 완료 후.
  fireRelicTrigger('on-turn-start', { run: r, combat: c });
  return { playerDefeated: false };
}

/**
 * 플레이어 상태 턴 시작 — 마비(paralyze)/경련(spasm). 매 새 턴 시작에 호출.
 *  - paralyze > 0: 이번 턴 *행동 불가*(frozenTurn=true, 마나 0). 스택 -1.
 *  - spasm > 0: 이번 턴 마나 0(0코스트 카드는 가능). 스택 -1.
 * 둘 다 적용(마비가 우선). 보스 stillness frozenTurn 패턴 재사용.
 */
function applyPlayerStatusTurnStart(c: CombatState): void {
  const ui = useUiStore();
  // 새 턴 — 발버둥 1턴 1회 리셋.
  c.struggledThisTurn = false;

  // 변신 해제 카운트다운 — '본모습' 카드 사용 후 ~2턴에 걸쳐 풀린다.
  if ((c.releasePending ?? 0) > 0) {
    c.releasePending = (c.releasePending ?? 0) - 1;
    if (c.releasePending <= 0) {
      c.releasePending = 0;
      if (revertTransformationState()) {
        rebuildCombatPiles(c); // 폼 덱 → 원본 덱으로 더미 재구성.
        ui.toast('success', '원래 모습으로 돌아왔다.');
      }
    } else {
      ui.toast('info', `본모습이 돌아오는 중… (${c.releasePending}턴)`);
    }
  }

  const st = c.player.statuses;
  const par = st.paralyze ?? 0;
  if (par > 0) {
    c.frozenTurn = true;
    c.mana = 0;
    if (par - 1 <= 0) delete st.paralyze;
    else st.paralyze = par - 1;
    ui.toast('warning', '마비 — 이번 턴 움직일 수 없다.');
  }
  const sp = st.spasm ?? 0;
  if (sp > 0) {
    c.mana = 0;
    if (sp - 1 <= 0) delete st.spasm;
    else st.spasm = sp - 1;
  }

  // 각인(imprint): 비감쇠 표식. 5 이상 쌓이면 빙의로 번진다(전조 → 본격). 5 소비 + 빙의 +1.
  const imp = st.imprint ?? 0;
  if (imp >= 5) {
    const left = imp - 5;
    if (left <= 0) delete st.imprint;
    else st.imprint = left;
    st.possession = (st.possession ?? 0) + 1;
    ui.toast('warning', '각인이 깊어져 빙의로 번졌다.');
  }
  // 빙의(possession): 비감쇠 강력 디버프. 매 턴 시작 HP를 잠식한다(스택 비례, 캡 6, 최소 HP 1).
  // 정화하지 않으면 전투 후에도 런에 남는다(clearCombat 라이트백).
  const poss = st.possession ?? 0;
  if (poss > 0) {
    const drain = Math.min(6, 1 + poss);
    c.player.hp = Math.max(1, c.player.hp - drain);
    ui.toast('warning', `빙의 — 몸을 빼앗긴다 (HP -${drain})`);
  }

  // 구속(bind)/삼킴(devour) + 거미줄(web) — 매 플레이어 턴 시작 카드 잠금 *재계산*.
  // bind와 web 둘 다 lockedCardIds를 쓰므로, 각자의 잠금 집합을 구해 *합집합*으로 set한다.
  // (보스 anchor 잠금은 별도 경로(applyBossPlayerTurnStart)라 여기서 덮어쓰지 않게 주의 —
  //  일반 전투에선 bossMechanic 미설정이라 충돌 없음. anchor 보스는 grapple/web을 쓰지 않음.)
  const lockedSet = new Set<string>(c.bossMechanic ? (c.lockedCardIds ?? []) : []);

  const g = c.grapple;
  if (g) {
    if (g.kind === 'devour') {
      const dot = g.base + g.ramp; // 삼킴: DoT가 ramp.
      c.player.hp = Math.max(0, c.player.hp - dot);
      ui.toast('warning', `삼켜짐 — ${dot} 피해 (탈출까지 ${g.gauge})`);
    } else {
      // 구속: 잠금 카드 수가 ramp. 새 손패에서 무작위 선택해 잠금 집합에 추가.
      const lockN = Math.min(c.hand.length, g.base + g.ramp);
      const ids = c.hand.map((card) => card.instanceId).filter((id): id is string => !!id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      for (const id of ids.slice(0, lockN)) lockedSet.add(id);
      if (lockN > 0) ui.toast('warning', `구속 — 카드 ${lockN}장이 묶였다 (탈출까지 ${g.gauge})`);
    }
    g.ramp += 1;
  }

  // 거미줄(web): 스택 수만큼(손패 한도 내) 무작위로 추가 잠금. bind와 *공존*(합집합).
  // bind와 달리 게이지/발버둥이 없고, 카드를 실제로 쓰면 스택이 1씩 줄어 풀린다(playCard).
  const web = c.webStacks ?? 0;
  if (web > 0 && c.hand.length > 0) {
    const lockN = Math.min(c.hand.length, web);
    // 아직 잠기지 않은 카드 중에서 우선 선택(bind와 최대한 겹치지 않게).
    const candidates = c.hand
      .map((card) => card.instanceId)
      .filter((id): id is string => !!id && !lockedSet.has(id));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const id of candidates.slice(0, lockN)) lockedSet.add(id);
    ui.toast('warning', `거미줄 — ${lockN}장이 묶였다`);
  }

  // bind/web 중 하나라도 활성이면(또는 보스 잠금이 있으면) 합집합으로 set,
  // 둘 다 비활성이고 보스 잠금도 없으면 잠금 해제(빈 배열) — bind 게이지 0 탈출/web 0 해제 반영.
  if (g || web > 0 || c.bossMechanic) {
    c.lockedCardIds = Array.from(lockedSet);
  } else {
    c.lockedCardIds = [];
  }

  // 저주(curse-tick) — 손에 든 저주 잡카드마다 매 턴 시작 직접 피해.
  let curseDmg = 0;
  for (const card of c.hand) {
    for (const e of card.effects) {
      if (e.kind === 'curse-tick') curseDmg += e.value ?? 0;
    }
  }
  if (curseDmg > 0) {
    c.player.hp = Math.max(0, c.player.hp - curseDmg);
    ui.toast('warning', `저주 — ${curseDmg} 피해`);
  }

  // add-card-hand 대기열 — 새 손패에 강제 삽입(10장 초과분은 버린 더미로). 저주 틱 *이후*라
  // 막 쥐어준 저주는 도착 턴엔 터지지 않고 다음 턴부터 작동.
  const pending = c.pendingHandJunk;
  if (pending && pending.length > 0) {
    for (const card of pending) {
      if (c.hand.length < 10) c.hand = [...c.hand, card];
      else c.discardPile = [...c.discardPile, card];
    }
    c.pendingHandJunk = [];
    ui.toast('warning', `잡카드 ${pending.length}장이 손에 쥐어졌다.`);
  }
}

const STRUGGLE_POWER = 2;     // 발버둥 1회당 탈출 게이지 감소량.
const STRUGGLE_MANA_COST = 1; // 발버둥 마나 비용 (저비용 — 탈출은 쉽게).

/**
 * 발버둥 — 구속/삼킴 탈출 전용 액션. 마나 1 소모, *한 턴에 마나가 있는 한 여러 번* 가능.
 * 게이지를 STRUGGLE_POWER만큼 깎고, 0 이하가 되면 즉시 해제(구속이면 손패 잠금도 해제).
 * CombatView의 '발버둥' 버튼이 호출.
 */
export function struggle(): { freed: boolean } {
  const run = useRunStore();
  const ui = useUiStore();
  const c = run.data.combat;
  if (!c || !c.grapple) return { freed: false };
  if (c.frozenTurn) {
    ui.toast('warning', '몸이 굳어 발버둥칠 수 없다.');
    return { freed: false };
  }
  // 발버둥은 한 턴에 여러 번 가능하다(구속·삼킴 모두). 제한은 마나뿐 — 마나가 있는 한 반복 탈출 시도.
  // infiniteMana는 *디버그 전투에서만* 적용(일반 런 누수 방지).
  const inf = ui.debug.infiniteMana && !!(ui.debugBattle.monsterId || ui.debugBattle.bossId);
  if (!inf && c.mana < STRUGGLE_MANA_COST) {
    ui.toast('warning', '마나가 부족해 발버둥칠 수 없다.');
    return { freed: false };
  }
  if (!inf) c.mana -= STRUGGLE_MANA_COST;
  c.struggledThisTurn = true;
  c.grapple.gauge -= STRUGGLE_POWER;
  if (c.grapple.gauge <= 0) {
    const wasBind = c.grapple.kind === 'bind';
    c.grapple = undefined;
    if (wasBind) c.lockedCardIds = []; // 묶인 카드 즉시 해제.
    ui.toast('success', '벗어났다!');
    return { freed: true };
  }
  ui.toast('info', `발버둥 — 탈출까지 ${c.grapple.gauge}`);
  return { freed: false };
}

function executeMonsterIntent(c: CombatState, monster?: Monster, intentOverride?: string) {
  // 동적 의도 — *실행 시점의 현재 상태*로 재평가(예고 후 그 턴에 수화가 풀렸으면 공격으로 복귀).
  // resolveIntent가 쿨다운 중인 특수는 이미 평타로 대체했으므로, 여기 들어온 특수는 *실제 발동*분.
  const intent = resolveIntent(intentOverride ?? c.enemyIntent, c);
  if (!intent) return;
  // 특수 행동이 실제로 들어오면 쿨다운 기록 — 다음 N턴 재발동(예고 포함) 금지.
  {
    const key = specialIntentKey(intent);
    if (key) {
      if (!c.intentCooldowns) c.intentCooldowns = {};
      c.intentCooldowns[key] = c.turn + (SPECIAL_INTENT_COOLDOWNS[key] ?? 8);
    }
  }

  // 로그용 스냅샷 — 적 행동 전후 차이로 요약.
  const snapPlayerHp = c.player.hp;
  const snapPlayerStatus = countStatuses(c.player.statuses);
  const snapEnemyBlock = c.enemy.block;
  const snapEnemyHp = c.enemy.hp;

  const parts = intent.split(':');
  const kind = parts[0];
  const rawValue = Number(parts[1]) || 0;
  // 적 힘(strength) 버프 — *피해를 주는* 인텐트(attack/drain)의 데미지에 플랫 가산.
  // charge는 힘을 *쌓는* 행동이라 가산 대상이 아니다(자기 자신 이중 적용 방지).
  // (플레이어 힘은 statusBonusForCardEffectKind에서 이미 처리되므로 여기선 적만.)
  const dealsDamage = kind === 'attack' || kind === 'drain';
  const enemyStrength = dealsDamage ? (c.enemy.statuses.strength ?? 0) : 0;
  // 카오스 enemy-atk-mul(+boss-atk-mul) × 하루 경과 스케일(dayAtkScale) — 공격성 인텐트의 데미지 배수.
  // 힘 가산 후 배수. 날이 갈수록 적 공격이 커진다(초반 약화 보강).
  const isAggressive = kind === 'attack' || kind === 'drain' || kind === 'charge';
  const atkMul = enemyAtkMul(monster) * (isAggressive ? dayAtkScale() : 1);
  const baseWithStrength = rawValue + enemyStrength;
  const value =
    isAggressive && atkMul !== 1
      ? Math.round(baseWithStrength * atkMul)
      : baseWithStrength;

  switch (kind) {
    case 'attack': {
      // 통합 피해: weakness(공격자=enemy) ×0.75 → vulnerable(대상=player) ×1.5 → damage-in-mul → block → hp.
      const hpBefore = c.player.hp;
      applyDamage(c.player, value, c.enemy.statuses, true);
      const hpLoss = hpBefore - c.player.hp;
      // 모나토 c-tripps-rage 동적 cost용 누적 피해 — block 흡수 제외 *실제 HP 손실*만.
      if (hpLoss > 0) {
        const r = useRunStore().data;
        r.runDamageReceived = (r.runDamageReceived ?? 0) + hpLoss;
        // 피해 받을 시 유물 발동 (retaliate / hurt-to-color / hurt-to-block).
        fireRelicTrigger('on-damage-taken', { run: r, combat: c, amount: hpLoss });
      }
      break;
    }
    case 'defend': {
      c.enemy.block += value;
      break;
    }
    case 'buff': {
      c.enemy.statuses['strength'] = (c.enemy.statuses['strength'] ?? 0) + value;
      break;
    }
    case 'debuff': {
      // intent: debuff:N:status — 플레이어에게 status N 부여.
      //   status = vulnerable|weakness|poison|frail|regress|feral|paralyze|spasm 등.
      const status = parts[2] ?? 'vulnerable';
      // 매 턴 -1 감쇠하는 디버프는 *적이 걸 때 최소 2* — 1만 걸면 다음 플레이어 턴에 즉시 0이 되어
      // 효과가 한 번도 적용되지 않는 문제 방지. (DECAYING_DEBUFFS와 동일 목록.)
      const applied = DECAYING_DEBUFFS.has(status) ? Math.max(2, value || 1) : (value || 1);
      c.player.statuses[status] = (c.player.statuses[status] ?? 0) + applied;
      break;
    }
    // 수화 중(feral-heavy) 부여 — *이미 수화(feral) 상태일 때만* 발동(조건부). 비감쇠·전투 후 잔존.
    // intent: heavy-feral (값 무시). 수화가 아니면 아무 일도 없다(귀여운 헛손질).
    case 'heavy-feral': {
      if ((c.player.statuses.feral ?? 0) > 0) {
        c.player.statuses['feral-heavy'] = (c.player.statuses['feral-heavy'] ?? 0) + 1;
        delete c.player.statuses.feral; // 수화 → 수화 중으로 *승격*.
        useUiStore().toast('warning', '더 깊이 휩쓸렸다 — 수화 중!');
      }
      break;
    }
    // === 조건부 특수 행동 — 동적 의도(resolveIntent)로 *플레이어가 특정 상태일 때만* 치환되어 들어온다. ===
    // 감정 흡수: 플레이어 방어가 있으면 그 마음을 흡수해 힘으로 삼킨다(방어 0, 적 힘 += block/3).
    case 'absorb-emotion': {
      if (c.player.block > 0) {
        const gained = Math.max(1, Math.floor(c.player.block / 3));
        c.player.block = 0;
        c.enemy.statuses.strength = (c.enemy.statuses.strength ?? 0) + gained;
        useUiStore().toast('warning', `마음을 흡수했다 — 적 힘 +${gained}`);
      }
      break;
    }
    // 동기화: 플레이어가 디버프에 걸려 있으면 거기 동기화해 회복+방어(디버프 종류 수 비례).
    case 'feast-debuff': {
      const ds = c.player.statuses;
      let cnt = 0;
      for (const k of DECAYING_DEBUFFS) if ((ds[k] ?? 0) > 0) cnt++;
      if (cnt > 0) {
        const heal = cnt * (value || 3);
        c.enemy.hp = Math.min(c.enemy.maxHp, c.enemy.hp + heal);
        c.enemy.block += cnt * 2;
        useUiStore().toast('warning', `동기화 — 적 HP +${heal}`);
      }
      break;
    }
    // === 전투 에로 기믹 ===
    case 'bind': {
      // bind:gauge:lock — 구속 시작/갱신. parts[2]=기본 잠금 카드 수.
      startGrapple(c, 'bind', value || 3, Number(parts[2]) || 1, parts[3] || '구속');
      break;
    }
    case 'devour': {
      // devour:gauge:dot — 삼킴 시작/갱신. parts[2]=기본 턴당 피해.
      startGrapple(c, 'devour', value || 4, Number(parts[2]) || 3, parts[3] || '삼켜짐');
      break;
    }
    case 'web': {
      // web:N — 거미줄 N 스택 누적. bind와 달리 게이지/발버둥 없이, 카드를 쓰면 풀린다.
      // 실제 잠금은 다음 플레이어 턴 시작(applyPlayerStatusTurnStart)에서 재계산.
      c.webStacks = (c.webStacks ?? 0) + (value || 1);
      useUiStore().toast('warning', `거미줄에 휘감겼다 — 누적 ${c.webStacks}`);
      break;
    }
    case 'drain-stat': {
      // drain-stat:N — 플레이어 스탯 잠식(sap N) *동시에* 적이 그만큼 흡수(strength +N).
      const n = value || 1;
      c.player.statuses['sap'] = (c.player.statuses['sap'] ?? 0) + n;
      c.enemy.statuses['strength'] = (c.enemy.statuses['strength'] ?? 0) + n;
      useUiStore().toast('warning', `잠식 — 힘이 빨려 들어간다 (잠식 ${c.player.statuses['sap']})`);
      break;
    }
    case 'drain': {
      // drain:value — 흡혈 공격: 피해를 주고 *실제 HP 손실*만큼 적 회복.
      const before = c.player.hp;
      applyDamage(c.player, value, c.enemy.statuses, true);
      const lost = before - c.player.hp;
      if (lost > 0) {
        c.enemy.hp = Math.min(c.enemy.maxHp, c.enemy.hp + lost);
        const r = useRunStore().data;
        r.runDamageReceived = (r.runDamageReceived ?? 0) + lost;
        fireRelicTrigger('on-damage-taken', { run: r, combat: c, amount: lost });
      }
      break;
    }
    case 'charge': {
      // charge:value — 윈드업: 힘 +value 축적(다음 공격 강화 텔레그래프).
      c.enemy.statuses['strength'] = (c.enemy.statuses['strength'] ?? 0) + value;
      break;
    }
    case 'ghost': {
      // ghost:N — 적이 *자기 자신*을 N턴 유령화(비실체). 받는·주는 피해 ×0.5(양날). 매 턴 -1.
      c.enemy.statuses['ghost'] = (c.enemy.statuses['ghost'] ?? 0) + (value || 2);
      useUiStore().toast('warning', '형태가 흐려진다 — 비실체가 되었다.');
      break;
    }
    // === 카드 교란 기믹 (잡카드 주입은 위치별 3종) ===
    case 'add-card':
    case 'add-card-draw': {
      // add-card[-draw]:cardId:N — 잡카드 N장을 *뽑을 더미 맨 위*에 주입.
      injectJunk(c, parts[1], Number(parts[2]) || 1, 'draw');
      break;
    }
    case 'add-card-discard': {
      // add-card-discard:cardId:N — *버린 더미*에 주입(셔플 후 등장).
      injectJunk(c, parts[1], Number(parts[2]) || 1, 'discard');
      break;
    }
    case 'add-card-hand': {
      // add-card-hand:cardId:N — *손패에 즉시* 주입.
      injectJunk(c, parts[1], Number(parts[2]) || 1, 'hand');
      break;
    }
    case 'obscure': {
      // obscure:N — 손패 은폐 N턴 (카드 뒷면).
      c.obscuredTurns = Math.max(c.obscuredTurns ?? 0, value || 1);
      break;
    }
    case 'cost-up': {
      // cost-up:amount:turns — 모든 카드 비용 +amount를 turns 동안.
      c.costUp = { amount: value || 1, turns: Number(parts[2]) || 2 };
      break;
    }
    case 'force-discard': {
      // force-discard:N — 다음 손패 드로우를 N장 줄임 (몬스터가 손패를 떨군다).
      // 몬스터는 턴 종료에 행동하므로 *현재* 손패를 버려도 곧 버려진다 → 다음 드로우 감소로 구현.
      c.drawDown = (c.drawDown ?? 0) + (value || 1);
      break;
    }
    case 'transform-card': {
      // transform-card:N — 무작위 손패 N장을 상처(잡카드)로 변환.
      transformToJunk(c, value || 1);
      break;
    }
    // === 플래그십: 체인지(변신/TSF) ===
    case 'change': {
      // change:formRaceId — 종족+덱 전체를 변신 폼으로 교체(원본 stash). 다음 손패부터 폼 덱.
      applyTransformation(c, parts[1]);
      break;
    }
    default:
      break;
  }

  // 적 행동 결과를 전투 로그에 기록 — 델타 우선, 없으면 인텐트 종류로 표기.
  {
    const name = monster?.name ?? '적';
    const segs: string[] = [];
    const dmg = snapPlayerHp - c.player.hp;
    if (dmg > 0) segs.push(`${dmg} 피해`);
    const blk = c.enemy.block - snapEnemyBlock;
    if (blk > 0) segs.push(`방어 +${blk}`);
    const drained = c.enemy.hp - snapEnemyHp;
    if (drained > 0) segs.push(`흡수 +${drained}`);
    if (countStatuses(c.player.statuses) > snapPlayerStatus) segs.push('디버프 부여');
    const fallback = ENEMY_INTENT_LOG[kind];
    if (segs.length > 0) pushLog(c, [name, ...segs].join(' · '));
    else if (fallback) pushLog(c, `${name} · ${fallback}`);
  }
}

/** 적 인텐트 종류 → 로그용 짧은 라벨 (델타가 없을 때의 폴백). */
const ENEMY_INTENT_LOG: Record<string, string> = {
  defend: '방어 태세',
  buff: '힘을 모은다',
  charge: '공격을 준비한다',
  bind: '구속',
  devour: '삼킴',
  web: '거미줄',
  obscure: '손패를 가린다',
  'cost-up': '비용 교란',
  'force-discard': '손패를 떨군다',
  'transform-card': '카드를 비튼다',
  'add-card': '잡카드 주입',
  'add-card-draw': '잡카드 주입',
  'add-card-discard': '잡카드 주입',
  'add-card-hand': '잡카드 주입',
  ghost: '형태가 흐려진다',
  'drain-stat': '스탯을 잠식한다',
  change: '모습을 바꾼다',
};

/**
 * 변신(체인지) 적용 — 종족+덱 전체를 폼으로 교체, 원본은 RunState.transform에 stash.
 * 적 턴(executeMonsterIntent)에서 호출 → 이후 endPlayerTurn 재드로우가 폼 손패를 뽑는다.
 * 이미 변신 중이거나 폼 데이터가 없으면 no-op.
 */
function applyTransformation(c: CombatState, formRaceId: string): void {
  const r = useRunStore().data;
  if (!formRaceId || r.transform) return;
  const data = useDataStore();
  const form = data.races.get(formRaceId);
  if (!form) return;
  const formDeck = form.startingDeck
    .map((id) => data.cards.get(id))
    .filter((cd): cd is Card => !!cd)
    .map(instantiateCard);
  if (formDeck.length === 0) return;
  // 원본 stash 후 폼으로 교체.
  r.transform = {
    formRaceId,
    originalRaceId: r.raceId,
    stashDeck: r.deck,
    stashCollection: r.collection,
    stashDeckSize: r.deckSize,
  };
  r.raceId = formRaceId;
  r.deck = formDeck;
  r.collection = formDeck.map((cd) => ({ ...cd }));
  r.deckSize = form.deckSize ?? formDeck.length;
  // 전투 더미를 폼 덱으로 — 손패는 비우고 endPlayerTurn 재드로우가 채운다.
  c.drawPile = [...formDeck];
  c.hand = [];
  c.discardPile = [];
  c.exhaustPile = [];
  c.lockedCardIds = [];
  useUiStore().toast('warning', `체인지! — ${form.name}(으)로 변했다.`);
}

/**
 * 변신 해제 — 원본 종족·덱·컬렉션·덱슬롯 복원 후 transform 클리어. 변신 중이 아니면 false.
 * 전투 중 해제(release 카드)는 호출자가 rebuildFromDeck로 더미 재구성, 전투 밖(아이템 정화)은 상태만.
 */
export function revertTransformationState(): boolean {
  const r = useRunStore().data;
  const t = r.transform;
  if (!t) return false;
  r.raceId = t.originalRaceId;
  r.deck = t.stashDeck;
  r.collection = t.stashCollection;
  r.deckSize = t.stashDeckSize;
  r.transform = undefined;
  return true;
}

/** 구속/삼킴 시작·갱신. 같은 류면 게이지 보강(재구속), 아니면 새로 설정. */
function startGrapple(
  c: CombatState,
  kind: 'bind' | 'devour',
  gauge: number,
  base: number,
  label: string,
): void {
  if (c.grapple && c.grapple.kind === kind) {
    c.grapple.gauge += gauge;
    c.grapple.base = Math.max(c.grapple.base, base);
  } else {
    c.grapple = { kind, gauge, base, ramp: 0, label };
  }
  useUiStore().toast('warning', kind === 'bind' ? `${label} — 손이 묶인다.` : `${label} — 빠져나가야 한다.`);
}

/** 잡카드 주입 — 위치별(draw/discard/hand). 손패 가득(10)이면 버린 더미로 폴백. */
function injectJunk(
  c: CombatState,
  cardId: string,
  count: number,
  dest: 'draw' | 'discard' | 'hand',
): void {
  const def = useDataStore().cards.get(cardId);
  if (!def) return;
  for (let i = 0; i < count; i++) {
    const inst = instantiateCard(def);
    if (dest === 'draw') c.drawPile = [inst, ...c.drawPile];
    else if (dest === 'discard') c.discardPile = [...c.discardPile, inst];
    // 'hand': 몬스터는 턴 종료에 행동 → 지금 손패에 넣으면 곧 버려진다. 대기열에 모아
    // 다음 손패 드로우 직후 강제 삽입(applyPlayerStatusTurnStart).
    else c.pendingHandJunk = [...(c.pendingHandJunk ?? []), inst];
  }
}

/** 무작위 손패 N장(잡카드 제외)을 상처로 변환. */
function transformToJunk(c: CombatState, count: number): void {
  const wound = useDataStore().cards.get('c-junk-wound');
  if (!wound) return;
  for (let i = 0; i < count; i++) {
    const targets = c.hand
      .map((card, idx) => ({ card, idx }))
      .filter((t) => t.card.source !== 'junk');
    if (targets.length === 0) break;
    const pick = targets[Math.floor(rng() * targets.length)];
    c.hand.splice(pick.idx, 1, instantiateCard(wound));
  }
}

/**
 * 이번 턴 적 인텐트 토큰 선택.
 * rotation(카오스 all-gimmick이 만든 종족 기믹 포함 배열)이 주어지면 그것을, 아니면 monster.intents를 순회.
 */
function pickIntent(monster: Monster, turn: number, rotation?: string[]): string {
  const rot = rotation && rotation.length > 0 ? rotation : null;
  if (rot) return rot[turn % rot.length];
  if (monster.intents.length === 0) return 'attack:5';
  return monster.intents[turn % monster.intents.length].encoded;
}

/**
 * 이번 턴 적이 실행할 의도 목록 — monster.actions만큼 회전에서 *연속 위치*를 뽑는다.
 * actions=1(미설정 포함)이면 [pickIntent(turn)]로 기존 단일 행동과 동일.
 */
function buildIntentQueue(monster: Monster, turn: number, rotation?: string[]): string[] {
  const actions = Math.max(1, Math.floor(monster.actions ?? 1));
  const out: string[] = [];
  for (let i = 0; i < actions; i++) out.push(pickIntent(monster, turn * actions + i, rotation));
  return out;
}

/** 동적 의도 조건 — 플레이어 상태 플래그가 충족되는가. (resolveIntent용) */
function intentConditionMet(flag: string, c: CombatState): boolean {
  const s = c.player.statuses ?? {};
  switch (flag) {
    case 'feral': return (s.feral ?? 0) > 0;
    case 'block': return c.player.block > 0;
    case 'sleep': return (s.sleep ?? 0) > 0;
    case 'possession': return (s.possession ?? 0) > 0;
    // 락인 해제 — 플레이어가 그 턴 방어 ≥ 락인 수치를 쌓았는가. 충족 시 special→약공격(override).
    // lockIn 0/미설정이면 항상 true → 락인 의도를 *쓰지 않는* 평범한 적엔 영향 없음.
    case 'unlocked': return (c.player.block ?? 0) >= (c.lockIn ?? 0);
    case 'debuff': {
      for (const k of DECAYING_DEBUFFS) if ((s[k] ?? 0) > 0) return true;
      return false;
    }
    default: return false;
  }
}

/**
 * 특수 행동 쿨다운(턴) — 발동 후 이만큼 재발동 금지. 짧은 로테이션에서도 강 행동이 드물게 나오게.
 * 준보스 특수(수화 중·삼킴)는 ~20턴 주기에 가깝게, 강 디버프는 ~10턴대, 일반 그래플/조건부는 짧게.
 */
const SPECIAL_INTENT_COOLDOWNS: Record<string, number> = {
  'heavy-feral': 18,
  devour: 16,
  'debuff:possession': 14,
  'debuff:imprint': 12,
  bind: 9,
  web: 9,
  'drain-stat': 9,
  'absorb-emotion': 6,
  'feast-debuff': 6,
};
/** 해석된 의도의 쿨다운 키(특수 행동이면 키, 아니면 null). debuff는 status까지 본다. */
function specialIntentKey(resolved: string): string | null {
  const parts = resolved.split(':');
  const kind = parts[0];
  if (kind === 'debuff') {
    const k = `debuff:${parts[2] ?? ''}`;
    return k in SPECIAL_INTENT_COOLDOWNS ? k : null;
  }
  return kind in SPECIAL_INTENT_COOLDOWNS ? kind : null;
}

/**
 * 동적 의도 해석 — `base~flag=override`면 *플레이어 상태*로 override/base를 고른 뒤,
 * 그 결과가 *쿨다운 중인 특수 행동*이면 평범한 공격으로 대체한다.
 * 텔레그래프(CombatView)와 실행(executeMonsterIntent) 모두 이 함수를 거쳐 *현재 상태*로 재평가 →
 * 그 턴에 상태가 바뀌면 의도도 즉시 바뀌고, 쿨다운 중인 강 행동은 예고도 평타로 보인다.
 */
export function resolveIntent(encoded: string | undefined, c: CombatState | undefined): string {
  if (!encoded) return '';
  let result = encoded;
  const tilde = encoded.indexOf('~');
  if (tilde >= 0 && c) {
    const base = encoded.slice(0, tilde);
    const cond = encoded.slice(tilde + 1); // "flag=override"
    const eq = cond.indexOf('=');
    result = eq < 0 ? base : (intentConditionMet(cond.slice(0, eq), c) ? cond.slice(eq + 1) : base);
  }
  // 쿨다운 — 특수 행동이 아직 쿨다운 중이면 평타로 대체(예고·실행 모두).
  if (c) {
    const key = specialIntentKey(result);
    if (key && (c.intentCooldowns?.[key] ?? 0) > c.turn) {
      return `attack:${c.enemyBaseAttack ?? 6}`;
    }
  }
  return result;
}

/**
 * all-gimmick 활성 시 *종족 대표 기믹*을 끼운 인텐트 로테이션을 생성.
 * 비활성이거나 보스면 undefined(원본 monster.intents 사용).
 * 삽입 위치: 두 번째 슬롯(인텐트가 1개뿐이면 끝에 추가) — 전투 초반 1회 자연 발동.
 */
function buildEnemyIntentRotation(monster: Monster): string[] | undefined {
  // 보스 제외 — 보스는 자체 기믹(anchor/stillness/rewind 등)이 강하므로 추가 주입 안 함.
  try {
    if (useDataStore().bosses.has(monster.id)) return undefined;
  } catch {
    /* store 미접근 — 보스 판정 실패 시 일반 취급(주입 진행). */
  }
  const gimmick = allGimmickIntentFor(monster);
  if (!gimmick) return undefined;
  const base = monster.intents.map((i) => i.encoded);
  if (base.length === 0) return [gimmick, 'attack:5'];
  const out = [...base];
  // 두 번째 슬롯에 삽입(없으면 끝에 추가) — 첫 턴은 원래 의도, 다음 턴에 기믹.
  out.splice(Math.min(1, out.length), 0, gimmick);
  return out;
}

/**
 * 드롭 정보를 반환하고 run에 적용. CombatView가 결과 화면에 표시.
 */
export interface CombatVictoryDrop {
  gold: number;
  timeShards: number;
  cards: Card[];     // 드롭된 카드 (확률 통과)
}

export function applyMonsterDrop(drop: MonsterDrop, allCards: Map<string, Card>): CombatVictoryDrop {
  const run = useRunStore();
  const r = run.data;

  r.gold += drop.gold;
  r.timeShards += drop.timeShards;

  // 카오스 narrow-reward(좁은 길) — 카드 보상 제시 수 -1. 확률 통과 카드 후보 중 마지막 1장 누락.
  // (이 게임은 'N장 중 택1' UI가 아니라 확률 드롭이므로, 통과 카드 수에서 1장 감산으로 구현.)
  const narrow = isNarrowReward();
  const passed: { card: Card }[] = [];
  for (const cd of drop.cardDrops ?? []) {
    if (rng() < cd.chance) {
      const card = allCards.get(cd.cardId);
      if (card) passed.push({ card });
    }
  }
  const granted = narrow && passed.length > 0 ? passed.slice(0, passed.length - 1) : passed;
  const droppedCards: Card[] = [];
  for (const { card } of granted) {
    droppedCards.push(card);
    // 컬렉션에 추가 — 덱 슬롯 등록은 사용자가 덱 편집에서.
    run.addCardToCollection(card);
  }

  // on-combat-end 유물 발동 (bonus-gold 등)
  fireOnCombatEnd();

  return {
    gold: drop.gold,
    timeShards: drop.timeShards,
    cards: droppedCards,
  };
}

/** 전투 종료 정리 (CombatView가 결과 화면 이후 호출). */
export function clearCombat() {
  const run = useRunStore();
  // 전투 종료 — 전투 중 HP 변화(피해·DoT·회복)를 런 HP로 라이트백(영구 누적). 사용자 사양(2026-05-21).
  // 모든 전투 종료 경로(CombatView/BossView의 onVictory·onDefeat)가 clearCombat을 거치므로 여기 단일 처리.
  const c = run.data.combat;
  if (c) {
    run.data.hp = Math.max(0, Math.min(run.data.maxHp, c.player.hp));
    // 빙의(possession) 잔존 — 전투 종료 시 정화하지 못한 빙의는 런에 남는다(맵 이동 제약).
    // 정화/하루 경과로만 풀린다. 0이면 해제.
    const poss = c.player.statuses?.possession ?? 0;
    run.data.possessed = poss > 0 ? poss : 0;
    // 수화 중(feral-heavy) 잔존 — 전투 후에도 유지. 마을/휴식에서만 풀린다(하루 경과로는 X).
    const fh = c.player.statuses?.['feral-heavy'] ?? 0;
    run.data.feralHeavy = fh > 0 ? fh : 0;
    // 지속 요소(축복·드래곤화) 카운트다운 — 전투 종료마다 -1. 드래곤화는 0 도달 시 컬러 원복.
    if ((run.data.blessingCombats ?? 0) > 0) {
      run.data.blessingCombats = (run.data.blessingCombats ?? 0) - 1;
      if (run.data.blessingCombats <= 0) useUiStore().toast('info', '축복의 기운이 가셨다.');
    }
    if ((run.data.dragonCombats ?? 0) > 0) {
      run.data.dragonCombats = (run.data.dragonCombats ?? 0) - 1;
      if (run.data.dragonCombats <= 0) {
        const b = run.data.dragonBoost ?? 0;
        if (b > 0) {
          const cols = run.data.colors as unknown as Record<string, number>;
          for (const k of Object.keys(cols)) cols[k] = Math.max(0, cols[k] - b);
        }
        run.data.dragonBoost = 0;
        useUiStore().toast('info', '드래곤의 비늘이 사그라들었다.');
      }
    }
  }
  run.data.combat = undefined;
  // 디버그 전투 오버라이드는 1회용 — 전투 종료 시 해제해 일반 전투에 영향 없게.
  useUiStore().clearDebugBattle();
}
