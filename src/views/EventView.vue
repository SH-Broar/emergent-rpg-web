<script setup lang="ts">
/**
 * 이벤트 화면 — 본문 + 선택지 + *결과 화면*.
 *
 * 사용자 피드백: 결과를 한 번의 텍스트 타이밍 후 명시적으로 보여줄 것.
 * 카드/유물 획득은 *이름*으로 표시 (id 노출 X).
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import {
  pickEvent,
  isChoiceAvailable,
  invokeCustomEffect,
} from '@/systems/event-runner';
import { effectiveContent, findRegion } from '@/systems/map';
import { applyAffinityDelta } from '@/systems/affinity';
import { acquireRelic } from '@/systems/relic';
import { applyColorBoost, applyColorBoostAll, type ColorKey } from '@/systems/colors';
import { colorLabel, cardDetailText, relicDetailText, josa } from '@/systems/labels';
import { rng } from '@/systems/rng';
import { grantInterventionRewards, previewInterventionRewards } from '@/systems/mail';
import { beginRewardBatch, collectRewardBatch } from '@/systems/reward-feed';
import SceneCharacter from '@/components/SceneCharacter.vue';
import type { Card, Event, EventChoice, EventChoiceEffect, EventVariation, Node } from '@/data/schemas';

const ALL_8_COLORS: ColorKey[] = ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark'];

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const currentEvent = ref<Event | undefined>();
const result = ref<{ lines: string[] } | null>(null);
/** followupEventId 체인 가드 — 같은 이벤트 무한 루프 방지. */
const followupChain = ref<Set<string>>(new Set());

// === 바리에이션 모드 (타이머 사건) ===
// currentEvent.variations가 있으면 진입 시 1개 바리를 선택해 "고정 2버튼"(개입/지나치기)으로 렌더.
// variation이 set이면 바리 모드, null이면 기존 choices 모드. (choices 모드는 이 ref를 절대 건드리지 않음.)
/** 이번 진입에 선택된 바리(없으면 choices 모드). */
const variation = ref<EventVariation | null>(null);
/** 개입했거나(또는 재진입으로) 해결된 상태인가 — true면 resolvedBody + 결과 라인 + [나간다]만. */
const variationResolved = ref(false);
/** 개입/재진입으로 표시할 결과 라인(타이머 차감·보상 등). */
const variationLines = ref<string[]>([]);
/** 해결 시 표시할 본문(개입 후 resolvedBody 스냅샷). 미해결이면 비움. */
const resolvedBodyText = ref('');

/** 바리 모드 여부 — variation이 선택되어 있으면 바리 모드. */
const isVariationMode = computed(() => variation.value !== null);
/** 선택 바리의 개입 비용(없으면 0). */
const varTimerCost = computed(() => variation.value?.timerCost ?? 0);
/** 개입 버튼 노출 — 미해결 + 개입 비용이 있는 바리에서만(timerCost=0 바리는 지나치기만). */
const showInterveneButton = computed(() => !variationResolved.value && varTimerCost.value > 0);
/** 개입 가능 — 미해결 + 비용>0 + 타이머 보유 충분. */
const canIntervene = computed(
  () => !variationResolved.value && varTimerCost.value > 0 && run.data.timers.cur >= varTimerCost.value,
);
/** 변형 개입 버튼에 표시할 배정 보상 이름(미리보기) — 지급과 동일 계산. 비용 0/사건 없으면 빈 문자열. */
const interveneReward = computed(() => {
  const v = variation.value;
  const ev = currentEvent.value;
  if (!v || !ev || v.timerCost <= 0) return '';
  return previewInterventionRewards(ev.id, v.timerCost, v.premiumReward).join(' · ');
});
/** 화면 본문 — 해결 후엔 resolvedBody, 그 전엔 바리 body. */
const displayBody = computed(() => {
  const v = variation.value;
  if (!v) return '';
  if (variationResolved.value) return resolvedBodyText.value || v.resolvedBody || v.body;
  return v.body;
});

/** 현재 런의 노드 맵(권역 1:1 매칭에 권역 풀·형제 노드 목록이 필요). */
const nodeMap = computed(() =>
  data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? ''),
);

const currentNode = computed(() =>
  nodeMap.value?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId),
);

// === 사건 노드 ↔ 권역 타이머 사건 1:1 매칭 ===
// 명시 events가 없는 event 노드에 권역 event_pool의 *고유 타이머 사건*을 결정론적으로 고정 배정.
//   같은 노드 = 항상 같은 사건(재진입 동일), 다른 노드 = 다른 사건.
//   권역 사건 < 노드 → 남는 노드는 filler 폴백, 권역 사건 > 노드 → 일부 미사용(허용).

/** 모든 권역 풀에 공통으로 끼어 있는 공용 사건(축복/방울/새끼용/빙의/하나브릿지) — 1:1 대상 제외. */
const COMMON_EVENT_IDS = new Set<string>([
  'ev-guardian-blessing',
  'ev-nekomata-bell',
  'ev-baby-dragon-breath',
  'ev-possession-wisp-follow',
  'ev-possession-shadow-doll',
  'ev-hanabridge-shrine',
]);

/** 1:1 대상 = 권역 고유 *타이머 사건*(variations 보유) ∧ 공용 사건 아님. */
function isRegionTimerEvent(e: Event): boolean {
  return !COMMON_EVENT_IDS.has(e.id) && !!e.variations && e.variations.length > 0;
}

/** 노드가 데이터에 *명시 events*(contentRef.eventIdPool)를 가졌는가 — 이미 1:1이므로 보존. */
function nodeHasExplicitEvents(n: Node): boolean {
  return !!(n.contentRef?.eventIdPool && n.contentRef.eventIdPool.length > 0);
}

/**
 * 이 event 노드에 결정론적으로 대응되는 권역 타이머 사건(없으면 undefined → 기존/폴백 경로).
 *  - 명시 events가 있는 노드는 보존(undefined 반환).
 *  - 권역 event_pool에서 공용·이미배정 사건을 뺀 타이머 사건 목록을 선언 순서로 만들고,
 *    권역 내 '명시 events 없는' event 노드를 id 정렬한 순서 i번째에 1:1 배정.
 */
function matchedRegionTimerEvent(node: Node): Event | undefined {
  // 구조적 기준(node.kind/region/contentRef)만 사용 — 런타임 override와 무관하게 매핑 불변.
  if (node.kind !== 'event') return undefined;
  if (nodeHasExplicitEvents(node)) return undefined;
  const m = nodeMap.value;
  if (!m) return undefined;
  const region = findRegion(m, node.region);
  if (!region) return undefined;

  // 이미 명시 배정된 권역 사건 id — 중복 배정 방지(타이머 사건이 두 노드에 겹치지 않게).
  const placed = new Set<string>();
  for (const n of m.nodes) {
    if (n.region !== node.region || n.kind !== 'event') continue;
    for (const id of n.contentRef?.eventIdPool ?? []) placed.add(id);
  }

  // 권역 고유 타이머 사건 풀(event_pool 선언 순서, 공용·중복 제외).
  const timerEvents: Event[] = [];
  for (const id of region.eventPool) {
    if (placed.has(id)) continue;
    const e = data.events.get(id);
    if (e && isRegionTimerEvent(e)) timerEvents.push(e);
  }
  if (timerEvents.length === 0) return undefined;

  // 권역 내 '명시 events 없는' event 노드 — id 정렬(결정론 순서).
  const openNodeIds = m.nodes
    .filter((n) => n.kind === 'event' && n.region === node.region && !nodeHasExplicitEvents(n))
    .map((n) => n.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const i = openNodeIds.indexOf(node.id);
  if (i < 0 || i >= timerEvents.length) return undefined; // 남는 노드 → 기존/필러 폴백.
  return timerEvents[i];
}

const pool = computed<Event[]>(() => {
  const node = currentNode.value;
  if (!node) return [];
  // 권역 풀에서 재추첨된 eventIdPool도 반영.
  const content = effectiveContent(node, run.data);
  return (content.eventIdPool ?? [])
    .map((id: string) => data.events.get(id))
    .filter((e: Event | undefined): e is Event => e !== undefined);
});

/**
 * 선택지의 효과들을 *런타임에 적용*하면서 결과 라인 수집.
 * event-runner의 selectChoice를 *대체*하여 *이름 lookup*까지 처리.
 *
 * r4 확장: customEffectId / grantCardFromPool / followupEventId 처리 추가.
 */
function applyChoice(choice: EventChoice) {
  const lines: string[] = [];

  // 스파링 진입 — `spar=` 토큰이 있으면 *다른 효과보다 먼저* 안전 대련 전투로 보낸다.
  //   사건 결과 화면을 거치지 않고 즉시 라우팅(전투 종료 후 맵으로 복귀하므로 사건은 1회성).
  //   친밀도 대상은 이 사건의 featured NPC 첫 항목(없으면 null → 승리 보상 친밀도만 생략).
  const sparEff = choice.effects.find((e) => e.sparMonsterId);
  if (sparEff?.sparMonsterId) {
    const npcId = currentEvent.value?.featuredNpcIds?.[0] ?? null;
    ui.setSparring({ monsterId: sparEff.sparMonsterId, npcId });
    run.markEventTriggered(run.data.currentNodeId, currentEvent.value?.id ?? '');
    router.push('/game/combat');
    return;
  }

  // 타이머 개입 비용 차감 — canAfford가 보유를 게이트하므로 여기선 안전하게 깎는다.
  //   spar(즉시 라우팅) 선택지는 위에서 return되어 도달 안 함 → 비용 없음. 무비용(지나치기)도 0.
  if (choice.timerCost && choice.timerCost > 0) {
    run.data.timers.cur = Math.max(0, run.data.timers.cur - choice.timerCost);
    lines.push(`타이머 -${choice.timerCost}`);
    // 개입 보상(2026-07-02) — 배치로 감싸 프리미엄 보상 라인을 *결과 목록에 인라인*으로 넣는다(토스트 대신).
    //   뷰가 이미 패널(결과 화면)이라 오버레이는 띄우지 않는다. 항목은 mail.ts가 결정론 산출.
    beginRewardBatch();
    grantInterventionRewards(currentEvent.value?.id ?? '', choice.timerCost, choice.premiumReward);
    lines.push(...collectRewardBatch());
  }

  // 효과들을 순서대로 적용. 마지막 effect에 followupEventId가 있으면 체인 진입.
  let followupId: string | undefined;
  for (const eff of choice.effects) {
    applyEffectWithNames(choice, eff, lines);
    if (eff.resultText) lines.push(eff.resultText);
    if (eff.followupEventId) followupId = eff.followupEventId;
  }

  // followupEventId 처리 — chain 가드로 무한 루프 방지.
  if (followupId) {
    if (followupChain.value.has(followupId)) {
      lines.push(`(주의) 이미 흘러간 이야기로 다시 돌아가지 않는다.`);
    } else {
      const next = data.events.get(followupId);
      if (next) {
        followupChain.value.add(followupId);
        result.value = { lines }; // 현재 결과를 한 번 표시한 뒤,
        // followup을 사용자가 *결과 화면을 닫는 순간*이 아니라 *지금 바로* 이어가게 한다.
        // 사용자 경험: "결과 라인 + 다음 이벤트의 본문이 곧바로 이어진다."
        currentEvent.value = next;
        result.value = null;
        // followup이 바리 사건이면 바리 모드로 전환(드문 저작 케이스 — 빈 화면 방지).
        if (next.variations && next.variations.length > 0) initVariation(next);
        return;
      } else {
        lines.push(`(알 수 없는 후속 이벤트: ${followupId})`);
      }
    }
  }

  result.value = { lines };
}

function applyEffectWithNames(choice: EventChoice, effect: EventChoiceEffect, lines: string[]) {
  const r = run.data;

  // 카드 댓가 — *먼저* 시도. 제거 실패(저주 사본 등)면 이 effect의 나머지 보상을 적용하지 않는다
  //   (무료 컬러 획득 방지). salvage=false: 카드 자체가 댓가이므로 시간조각 환급 없음.
  //   정상 경로는 canAfford가 보유를 게이트하므로 동작 변화 없음.
  if (effect.loseCardId) {
    const target = r.collection.find((c) => c.id === effect.loseCardId && c.instanceId);
    if (target?.instanceId && run.removeCardFromCollection(target.instanceId, false)) {
      lines.push(`카드 소비: ${target.name}`);
    } else {
      const name = data.cards.get(effect.loseCardId)?.name ?? effect.loseCardId;
      lines.push(`카드를 떼어낼 수 없다 (${name})`);
      return; // 댓가 미지불 → 보상 미적용.
    }
  }

  if (effect.hpDelta !== undefined) {
    r.hp = Math.max(0, Math.min(r.maxHp, r.hp + effect.hpDelta));
    lines.push(effect.hpDelta >= 0 ? `체력 +${effect.hpDelta}` : `체력 ${effect.hpDelta}`);
  }
  if (effect.healPct !== undefined) {
    const heal = Math.round((r.maxHp * effect.healPct) / 100);
    const before = r.hp;
    r.hp = Math.min(r.maxHp, r.hp + heal);
    lines.push(`체력 +${r.hp - before} (${effect.healPct}%)`);
  }
  if (effect.colorCost) {
    const { color, amount } = effect.colorCost;
    const d = applyColorBoost(color as ColorKey, -amount);
    lines.push(`${colorLabel(color)} ${d}`);
  }
  if (effect.goldDelta !== undefined) {
    r.gold = Math.max(0, r.gold + effect.goldDelta);
    lines.push(effect.goldDelta >= 0 ? `골드 +${effect.goldDelta}` : `골드 ${effect.goldDelta}`);
  }
  if (effect.timeShardsDelta !== undefined) {
    r.timeShards = Math.max(0, r.timeShards + effect.timeShardsDelta);
    lines.push(effect.timeShardsDelta >= 0 ? `시간의 조각 +${effect.timeShardsDelta}` : `시간의 조각 ${effect.timeShardsDelta}`);
  }
  if (effect.colorDelta) {
    const { color, amount } = effect.colorDelta;
    if (color === 'all') {
      applyColorBoostAll(amount);
      lines.push(`컬러: 모든 컬러 +${amount}`);
    } else if (color === 'random') {
      const c = ALL_8_COLORS[Math.floor(rng() * ALL_8_COLORS.length)];
      const d = applyColorBoost(c, amount);
      lines.push(`컬러: ${colorLabel(c)} +${d}`);
    } else {
      const d = applyColorBoost(color as ColorKey, amount);
      lines.push(`컬러: ${colorLabel(color)} +${d}`);
    }
  }
  if (effect.affinityDelta) {
    const a = effect.affinityDelta;
    const npcName = data.npcs.get(a.npcId)?.name ?? a.npcId;
    lines.push(`${npcName} 친밀도 ${a.delta >= 0 ? '+' : ''}${a.delta}`);
    applyAffinityDelta(a.npcId, a.delta, lines);
  }
  // 동료 사건 영입 (Item 37-② Stage C, 1A) — 비용 아님. 중복이면 스킵(이미 동료).
  if (effect.recruitNpcId) {
    const npcId = effect.recruitNpcId;
    const npcName = data.npcs.get(npcId)?.name ?? npcId;
    if (run.inRoster(npcId)) {
      lines.push(`${josa(npcName, '은', '는')} 이미 함께하고 있다`);
    } else if (run.recruitCompanion(npcId)) {
      lines.push(`${josa(npcName, '이', '가')} 동행하기로 했다`);
    } else {
      lines.push(`${josa(npcName, '과', '와')} 함께할 수 없었다`);
    }
  }
  if (effect.grantCardId) {
    const card = data.cards.get(effect.grantCardId);
    if (card) {
      run.addCardToCollection(card);
      lines.push(`카드: ${card.name}`);
    } else {
      lines.push('카드를 찾지 못했다');
    }
  }
  // r4: 카드 풀에서 필터 후 추첨. rank / tag 둘 다 옵션.
  if (effect.grantCardFromPool) {
    const filt = effect.grantCardFromPool;
    const pool: Card[] = [...data.cards.values()].filter((c) => {
      if (filt.rank && c.rank !== filt.rank) return false;
      // tag 필터 — Card 스키마에 tags 필드가 *없으므로* 현재는 항상 통과.
      // 다음 데이터 라운드에 Card.tags 추가 시 자동 작동.
      void filt.tag;
      return true;
    });
    if (pool.length > 0) {
      const pick = pool[Math.floor(rng() * pool.length)];
      run.addCardToCollection(pick);
      lines.push(`카드: ${pick.name}`);
    } else {
      lines.push(`(카드 풀이 비어 있다.)`);
    }
  }
  if (effect.grantRelicId) {
    const relic = data.relics.get(effect.grantRelicId);
    if (relic) {
      acquireRelic(relic); // 중앙 진입점 — on-acquire/passive 즉시 발동 포함.
      lines.push(`유물: ${relic.name}`);
    } else {
      lines.push('유물을 찾지 못했다');
    }
  }
  if (effect.grantClueId) {
    const clue = data.clues.get(effect.grantClueId);
    if (clue) {
      const added = run.addClue(clue);
      if (added) lines.push(`단서: ${clue.name}`);
    } else {
      lines.push('단서를 찾지 못했다');
    }
  }
  // r4: customEffectId — 등록된 핸들러 호출. 미등록 id는 console.warn + false.
  if (effect.customEffectId) {
    invokeCustomEffect(effect.customEffectId, {
      run: r,
      ui,
      data,
      choice,
      effect,
      lines,
    });
  }
}

function choose(c: EventChoice) {
  applyChoice(c);
}

/** 선택지 버튼 disabled 판단 — DSL 조건 + *비용 지불 가능* 여부. */
function isAvailable(c: EventChoice): boolean {
  if (!isChoiceAvailable(c, run.data)) return false;
  return canAfford(c);
}

/** 자원을 *깎는* 선택지는 보유량이 부족하면 고를 수 없다(골드/시간의 조각/컬러/카드). 클램프로 몰래 0이 되는 것 방지. */
function canAfford(c: EventChoice): boolean {
  const r = run.data;
  // 타이머 개입 비용 — 보유 미만이면 고를 수 없다(개입 선택지 게이트).
  if (c.timerCost && r.timers.cur < c.timerCost) return false;
  for (const eff of c.effects) {
    if (eff.goldDelta !== undefined && eff.goldDelta < 0 && r.gold < -eff.goldDelta) return false;
    if (eff.timeShardsDelta !== undefined && eff.timeShardsDelta < 0 && r.timeShards < -eff.timeShardsDelta) return false;
    if (eff.colorCost) {
      const have = (r.colors as unknown as Record<string, number>)[eff.colorCost.color] ?? 0;
      if (have < eff.colorCost.amount) return false;
    }
    if (eff.loseCardId && !r.collection.some((card) => card.id === eff.loseCardId && card.instanceId)) return false;
  }
  return true;
}

/**
 * 고를 수 있는 선택지가 하나라도 있는가. 없으면(전부 조건/비용 미달, 또는 선택지 자체가 없음)
 * "자리를 떠난다" 폴백을 노출해 *막힘(softlock) 방지*.
 */
const anyChoiceAvailable = computed(() =>
  (currentEvent.value?.choices ?? []).some((c) => isAvailable(c)),
);

/** 한 효과를 *적용 없이* 사람이 읽는 미리보기 토큰으로. (선택 전 결과 표시용) */
function effectPreviewTokens(eff: EventChoiceEffect): string[] {
  const t: string[] = [];
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  if (eff.hpDelta !== undefined) t.push(`HP ${signed(eff.hpDelta)}`);
  if (eff.healPct !== undefined) t.push(`체력 +${eff.healPct}%`);
  if (eff.goldDelta !== undefined) t.push(`골드 ${signed(eff.goldDelta)}`);
  if (eff.timeShardsDelta !== undefined) t.push(`시간의 조각 ${signed(eff.timeShardsDelta)}`);
  if (eff.colorDelta) {
    const { color, amount } = eff.colorDelta;
    const name = color === 'all' ? '모든 컬러' : color === 'random' ? '무작위 컬러' : colorLabel(color);
    t.push(`${name} +${amount}`);
  }
  if (eff.colorCost) {
    t.push(`${colorLabel(eff.colorCost.color)} -${eff.colorCost.amount}`);
  }
  if (eff.loseCardId) {
    t.push(`카드 '${data.cards.get(eff.loseCardId)?.name ?? eff.loseCardId}' 소비`);
  }
  if (eff.grantCardId) {
    t.push(`카드 '${data.cards.get(eff.grantCardId)?.name ?? eff.grantCardId}'`);
  }
  if (eff.grantCardFromPool) t.push('카드 (무작위)');
  if (eff.grantRelicId) {
    t.push(`유물 '${data.relics.get(eff.grantRelicId)?.name ?? eff.grantRelicId}'`);
  }
  if (eff.affinityDelta) {
    const npc = data.npcs.get(eff.affinityDelta.npcId)?.name ?? eff.affinityDelta.npcId;
    t.push(`${npc} 친밀도 ${signed(eff.affinityDelta.delta)}`);
  }
  if (eff.recruitNpcId) {
    const npc = data.npcs.get(eff.recruitNpcId)?.name ?? eff.recruitNpcId;
    t.push(`동료: ${npc}`);
  }
  if (eff.sparMonsterId) t.push('대련 (HP는 원래대로 돌아온다)');
  if (eff.grantClueId) t.push('단서');
  if (eff.customEffectId) t.push('특수 효과');
  return t;
}

/** 선택지의 효과 미리보기 문자열. hidden이면 ??? (의도적 미스터리). 효과 없으면 빈 문자열. */
function choicePreview(c: EventChoice): string {
  if (c.hidden) return '???';
  const tokens = c.effects.flatMap(effectPreviewTokens);
  // 개입(timerCost) 선택지엔 배정된 프리미엄 보상 이름을 덧붙인다(노드별 고유, 지급과 동일 계산).
  if (c.timerCost && c.timerCost > 0) {
    const rewards = previewInterventionRewards(currentEvent.value?.id ?? '', c.timerCost, c.premiumReward);
    if (rewards.length) tokens.push(`보상: ${rewards.join(' · ')}`);
  }
  return tokens.join(' · ');
}

/**
 * 선택지가 주는 *카드/유물의 상세*(길게 누름/호버 툴팁) — 보상 성능 확인용.
 * hidden 선택지는 가리지 않도록 빈 문자열(미스터리 보존). 카드/유물 grant 없으면 빈 문자열(툴팁 없음).
 */
function choiceRewardTip(c: EventChoice): string {
  if (c.hidden) return '';
  const parts: string[] = [];
  for (const e of c.effects) {
    if (e.grantCardId) parts.push(cardDetailText(data.cards.get(e.grantCardId)));
    if (e.grantRelicId) parts.push(relicDetailText(data.relics.get(e.grantRelicId)));
  }
  return parts.filter(Boolean).join('  /  ');
}

// === 바리에이션 모드 로직 ===

/**
 * 진입 시 현재 상태로 바리 1개 선택.
 *  후보 = fromTurn(경과턴) 충족 + minVisits(이 노드 방문 횟수) + requireClue/forbidClue 게이트 통과.
 *  선택 = 후보 중 fromTurn 최대(동률이면 index 큰 것 = 더 구체적/최신).
 *  폴백 = 후보 없으면 fromTurn 최소인 첫 바리(항상 무언가는 보이도록).
 *
 * elapsed = visitedNodes.length(경과 턴), visits = 이 노드 바리 방문 횟수(증가 *후* 값 — 호출 전 증가).
 */
function selectVariation(ev: Event, elapsed: number, visits: number): EventVariation | null {
  const vars = ev.variations ?? [];
  if (vars.length === 0) return null;
  const clues = run.data.clues ?? [];
  const hasClue = (id: string) => clues.some((c) => c.id === id);
  const candidates = vars.filter(
    (v) =>
      elapsed >= v.fromTurn &&
      (v.minVisits == null || visits >= v.minVisits) &&
      (v.requireClue == null || hasClue(v.requireClue)) &&
      (v.forbidClue == null || !hasClue(v.forbidClue)),
  );
  if (candidates.length > 0) {
    return candidates.reduce((best, v) =>
      v.fromTurn > best.fromTurn || (v.fromTurn === best.fromTurn && v.index > best.index) ? v : best,
    );
  }
  // 폴백 — fromTurn 최소인 첫 바리(동률이면 먼저 나온 것 유지: `<`로만 교체).
  return vars.reduce((best, v) => (v.fromTurn < best.fromTurn ? v : best));
}

/**
 * 바리 모드 진입 초기화 — 이미 개입(소비)된 노드면 저장된 결과로 재진입 표시,
 * 아니면 방문 횟수 +1 후 현재 상태로 바리를 선택한다.
 * (바리 사건은 eventTriggered를 세우지 않아 지나치기 재진입이 항상 가능하다.)
 */
function initVariation(ev: Event) {
  const nodeId = run.data.currentNodeId;
  const resolved = run.getNodeState(nodeId)?.timerResolved;
  if (resolved) {
    // 재진입 — 저장된 바리 인덱스로 복원(못 찾으면 현 상태 기준 재선택으로 폴백).
    const found = (ev.variations ?? []).find((v) => v.index === resolved.index);
    variation.value = found ?? selectVariation(ev, run.data.visitedNodes.length, run.getNodeState(nodeId)?.eventVisits ?? 0);
    variationResolved.value = true;
    variationLines.value = resolved.lines ?? [];
    resolvedBodyText.value = resolved.resolvedBody;
    return;
  }
  // 신규 진입 — 방문 횟수 증가 후 선택(선택은 증가 *후* 값 기준 — 첫 진입 visits=1).
  const visits = run.incrementEventVisits(nodeId);
  variation.value = selectVariation(ev, run.data.visitedNodes.length, visits);
  variationResolved.value = false;
  variationLines.value = [];
  resolvedBodyText.value = '';
}

/**
 * 개입 — 타이머 비용을 차감하고 바리 effects를 적용해 결과 라인을 수집,
 * 본문을 resolvedBody로 교체하고 노드 개입 소비(timerResolved)를 저장한다.
 * 버튼 disabled(canIntervene)가 보유를 게이트하므로 여기선 안전하게 차감한다.
 */
function intervene() {
  const v = variation.value;
  if (!v || variationResolved.value || v.timerCost <= 0) return;
  if (run.data.timers.cur < v.timerCost) return; // 보유 부족 가드(버튼 비활성이지만 이중 방어).

  const lines: string[] = [];
  run.data.timers.cur = Math.max(0, run.data.timers.cur - v.timerCost);
  lines.push(`타이머 -${v.timerCost}`);
  // 개입 보상(2026-07-02) — 배치로 감싸 프리미엄 보상 라인을 *결과 목록에 인라인*으로 넣는다(토스트 대신).
  //   뷰가 이미 패널(바리 결과)이라 오버레이는 띄우지 않는다. 항목은 mail.ts가 결정론 산출.
  beginRewardBatch();
  grantInterventionRewards(currentEvent.value?.id ?? '', v.timerCost, v.premiumReward);
  lines.push(...collectRewardBatch());

  // 바리 effects 적용 — 기존 applyEffectWithNames 재사용(이름 lookup·보상 라인 수집).
  //   applyEffectWithNames는 timerCost를 건드리지 않으므로 위의 차감과 중복되지 않는다.
  if (v.effects) {
    const shim: EventChoice = { label: v.name, effects: v.effects };
    for (const eff of v.effects) {
      applyEffectWithNames(shim, eff, lines);
      if (eff.resultText) lines.push(eff.resultText);
    }
  }

  const body = v.resolvedBody ?? v.body;
  resolvedBodyText.value = body;
  variationLines.value = lines;
  variationResolved.value = true;
  // 노드 개입 소비 처리 — 재진입 시 이 스냅샷으로 resolvedBody + 라인을 복원.
  run.markTimerResolved(run.data.currentNodeId, { index: v.index, resolvedBody: body, lines });
}

function leave() {
  router.push('/game/map');
}

/** 빈노드 폴백 — 노드 풀에서 뽑을 사건이 없으면 *반복형 필러 사건*(ev-filler-*)으로 채운다.
 *  사건 노드에서 "여기엔 사건이 없다"가 뜨지 않도록 보장. 필러는 condition 없이 항상 적격. */
const fillerPool = computed<Event[]>(() =>
  [...data.events.values()].filter((e: Event) => e.id.startsWith('ev-filler-')),
);

onMounted(() => {
  // 1순위: 사건 노드 ↔ 권역 타이머 사건 1:1 결정론 매칭(명시 events 없는 event 노드 한정).
  //   매칭 실패(남는 노드·풀 소진)면 기존 경로: 노드 풀 추첨 → 필러 폴백.
  const node = currentNode.value;
  const matched = node ? matchedRegionTimerEvent(node) : undefined;
  currentEvent.value = matched ?? pickEvent(pool.value) ?? pickEvent(fillerPool.value);
  const ev = currentEvent.value;
  if (!ev) return;
  if (ev.variations && ev.variations.length > 0) {
    // 바리 모드 — eventTriggered를 *세우지 않는다*. 지나치기(미소비)로 맵에 돌아가도
    //   재방문 시 다시 들어올 수 있어야 하고, 개입 소비는 timerResolved로 따로 추적한다.
    initVariation(ev);
  } else {
    // choices 모드(기존) — 그대로 eventTriggered 마킹(재진입 시 MapView가 event-pass).
    run.markEventTriggered(run.data.currentNodeId, ev.id);
  }
});
</script>

<template>
  <SceneCharacter
    v-if="ui.debug.showPortraits"
    :mood="result ? 'happy' : 'curious'"
  />
  <main class="event-view">
    <article v-if="currentEvent" class="event">
      <!-- ===== 바리에이션 모드(타이머 사건) — 고정 2버튼(개입/지나치기) ===== -->
      <template v-if="isVariationMode">
        <h1 class="var-name">
          <span>{{ variation?.name }}</span>
          <span class="var-index">#{{ variation?.index }}</span>
        </h1>
        <p class="body">{{ displayBody }}</p>

        <!-- 개입/재진입 결과 라인 -->
        <ul v-if="variationResolved && variationLines.length" class="result-list var-result">
          <li v-for="(line, i) in variationLines" :key="i">{{ line }}</li>
        </ul>

        <div class="choices">
          <!-- 개입 — 비용>0 + 미해결일 때만. 보유<비용이면 비활성. -->
          <button
            v-if="showInterveneButton"
            class="choice choice--intervene"
            :disabled="!canIntervene"
            @click="canIntervene && intervene()"
          >
            <span class="choice__label">개입한다<span class="choice__timer">⏳{{ varTimerCost }}</span></span>
            <span v-if="interveneReward" class="choice__reward">보상: {{ interveneReward }}</span>
            <span class="choice__preview" :class="{ 'choice__preview--short': !canIntervene }">
              보유 {{ run.data.timers.cur }}<template v-if="!canIntervene"> · 타이머가 부족하다</template>
            </span>
          </button>
          <!-- 지나치기(미해결) / 나간다(해결) -->
          <button class="choice choice--leave-fallback" @click="leave">
            <span class="choice__label">{{ variationResolved ? '나간다' : '그냥 지나친다' }}</span>
          </button>
        </div>
      </template>

      <!-- ===== choices 모드(기존) ===== -->
      <template v-else>
      <h1>{{ currentEvent.name }}</h1>
      <p class="body">{{ currentEvent.body }}</p>

      <!-- 선택지 — r4: condition DSL이 false면 비활성화 -->
      <div v-if="!result" class="choices">
        <button
          v-for="(c, i) in currentEvent.choices"
          :key="i"
          class="choice"
          :disabled="!isAvailable(c)"
          :title="c.condition && !isAvailable(c) ? `조건 미달: ${c.condition}` : ''"
          v-tooltip.hold="choiceRewardTip(c)"
          @click="isAvailable(c) && choose(c)"
        >
          <span class="choice__label">{{ c.label }}<span v-if="c.timerCost" class="choice__timer">⏳{{ c.timerCost }}</span></span>
          <span v-if="choicePreview(c)" class="choice__preview" :class="{ 'choice__preview--hidden': c.hidden }">{{ choicePreview(c) }}</span>
        </button>
        <!-- 막힘 방지: 고를 수 있는 선택지가 하나도 없으면 떠나는 선택지를 노출 -->
        <button
          v-if="!anyChoiceAvailable"
          class="choice choice--leave-fallback"
          @click="leave"
        >
          <span class="choice__label">자리를 떠난다</span>
          <span class="choice__preview">고를 수 있는 선택지가 없다</span>
        </button>
      </div>

      <!-- 결과 화면 -->
      <div v-else class="result">
        <h3>결과</h3>
        <ul class="result-list">
          <li v-for="(line, i) in result.lines" :key="i">{{ line }}</li>
          <li v-if="result.lines.length === 0" class="empty">조용한 결말.</li>
        </ul>
        <button class="leave" @click="leave">계속 →</button>
      </div>
      </template>
    </article>
    <section v-else class="empty-event">
      <p>이 자리엔 사건이 없었다.</p>
      <button class="leave" @click="leave">계속 →</button>
    </section>
  </main>
</template>

<style scoped>
.event-view { max-width: 720px; margin: 0 auto; padding: 3rem 2rem; min-height: 100vh; min-height: 100dvh; }
.event h1 { color: #8eedff; margin-bottom: 1rem; }
.body { white-space: pre-line; line-height: 1.8; color: #d6d6e0; margin-bottom: 2rem; }
.choices { display: flex; flex-direction: column; gap: 0.7rem; }
.choice { display: flex; flex-direction: column; gap: 0.3rem; padding: 1rem 1.2rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15); color: inherit; border-radius: 8px; cursor: pointer; text-align: left; font: inherit; }
.choice:hover:not(:disabled) { background: rgba(142,237,255,0.1); border-color: rgba(142,237,255,0.4); }
.choice:disabled { opacity: 0.4; cursor: not-allowed; }
.choice__label { font-weight: 600; }
.choice__timer { margin-left: 0.5rem; padding: 0.05rem 0.4rem; font-size: 0.78rem; color: #ffd98e; background: rgba(255,217,142,0.12); border: 1px solid rgba(255,217,142,0.35); border-radius: 999px; font-variant-numeric: tabular-nums; }
.choice__preview { font-size: 0.82rem; color: #8effb8; font-variant-numeric: tabular-nums; }
.choice__reward { font-size: 0.82rem; color: #ffd98e; font-variant-numeric: tabular-nums; }
.choice__preview--hidden { color: #c08eff; letter-spacing: 0.1em; }
.choice--leave-fallback { border-color: rgba(192,142,255,0.5); background: rgba(192,142,255,0.12); }
.choice--leave-fallback:hover { background: rgba(192,142,255,0.22); border-color: rgba(192,142,255,0.7); }
.choice--leave-fallback .choice__preview { color: #b9a0e8; }
/* 바리에이션 모드 — 사건 이름 + 우하단 #index */
.var-name { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.5rem; color: #8eedff; margin-bottom: 1rem; }
.var-index { font-size: 0.72rem; font-weight: 400; color: #6c6c7c; font-variant-numeric: tabular-nums; line-height: 1; padding-bottom: 0.15rem; }
.var-result { margin: 0 0 1.5rem; padding-left: 1.2rem; color: #d6d6e0; list-style: none; }
.var-result li { padding: 0.2rem 0; color: #8effb8; font-variant-numeric: tabular-nums; }
.choice--intervene { border-color: rgba(255,217,142,0.5); background: rgba(255,217,142,0.1); }
.choice--intervene:hover:not(:disabled) { background: rgba(255,217,142,0.18); border-color: rgba(255,217,142,0.7); }
.choice--intervene .choice__preview { color: #ffd98e; }
.choice__preview--short { color: #c08e8e; }
.result { margin-top: 2rem; padding: 1.2rem; background: rgba(0,0,0,0.4); border-left: 3px solid #8eedff; border-radius: 4px; }
.result h3 { margin: 0 0 0.6rem; color: #8eedff; font-size: 1rem; }
.result-list { margin: 0 0 1rem; padding-left: 1.2rem; color: #d6d6e0; }
.result-list li { padding: 0.2rem 0; }
.empty { color: #6c6c7c; font-style: italic; list-style: none; padding-left: 0; }
.leave { padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; }
.leave:hover { background: rgba(192,142,255,0.3); }
.empty-event { text-align: center; padding: 4rem; color: #6c6c7c; }
.empty-event p { font-style: italic; margin-bottom: 1.5rem; }
</style>
