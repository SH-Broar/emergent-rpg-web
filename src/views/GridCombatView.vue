<script setup lang="ts">
/**
 * 격자 전술 전투 화면 (Phase D, 신규 엔진).
 *
 * 구 STS식 1v1 CombatView를 대체하는 *격자 다중 적* 전투 UI.
 * 엔진(systems/grid-combat)·스토어(stores/run)의 공개 API에만 의존하며,
 * 직접 전투 로직을 돌리지 않는다(순수 표현 + 행동 큐 입력).
 *
 * 상호작용:
 *  - 이동: [이동] → reachableTiles 하이라이트 → 칸 탭 → queuePlayerAction(move).
 *  - 카드: 핸드에서 카드 탭(canPlayCard) → previewCardTiles 하이라이트 → 확정 → queuePlayerAction(card).
 *  - 계획 시야(foresight): 행동 큐 슬롯 N개 + [실행] 버튼. clearPlayerPlan으로 비움.
 *  - 커밋: store.commitGridRound() → fx 애니 재생 → outcome 있으면 endGridCombat 후 전이.
 *  - 인스펙트: 적 원 탭 → 이름/HP/의도(intentQueue) 패널 + previewAttackTiles 미리보기.
 *
 * 톤(D11): 그래픽 자산 최소 — 플레이어=파란 원 / 적=빨강(종족색) 원. 이동·움직임 ≤0.1초 트랜지션.
 * 씬 전환 소프트락 회귀 방지(project_scene_transition_softlock_fix): 단일 루트 wrapper.
 */

import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import {
  reachableTiles,
  previewCardTiles,
  previewAttackTiles,
  canPlayCard,
  queuePlayerAction,
  clearPlayerPlan,
  combatantAt,
  combatPotions,
  isAimedCard,
  aimableTiles,
  cardShapePreview,
  resolveThrowHits,
  STRONG_MUL,
  swappableCompanions,
  dequeuePlayerAction,
  isInstantCard,
  previewDashTarget,
  previewEnemyTelegraph,
} from '@/systems/grid-combat';
import { traceLineOfSight, TILE_PROPS } from '@/systems/tiles';
import { statusLabel } from '@/systems/labels';
import type { Item } from '@/data/schemas';
import { scaledValue, enhanceBadge } from '@/systems/enhance';
import { useGridFx } from '@/composables/useGridFx';
import type { ActorSnapshot } from '@/composables/useGridFx';
import type {
  Card,
  GridCombatant,
  GridOffset,
  GridPos,
  PlannedAction,
} from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const ui = useUiStore();
const data = useDataStore();

// === 상태 핸들 ===
const gc = computed(() => run.data.gridCombat);

// === 보스 전투(#4) — 큰 토큰·이름·페이즈 배지. 일반 전투는 전부 false/0. ===
const isBoss = computed(() => gc.value?.isBoss === true);
const bossUnit = computed<GridCombatant | undefined>(() =>
  isBoss.value ? gc.value?.enemies.find((e) => e.isBoss) : undefined,
);
const bossPhaseLabel = computed<string>(() => {
  if (!isBoss.value) return '';
  const idx = gc.value?.bossPhaseIndex ?? 0;
  const total = gc.value?.bossPhaseThresholds?.length ?? 1;
  return total > 1 ? `${idx + 1} / ${total} 단계` : '';
});

type Phase = 'combat' | 'victory' | 'defeat';
const phase = ref<Phase>('combat');

// 행동 모드 — idle: 아무 칸도 안 고름 / move: 이동 칸 선택 중 / card: 카드 조준 중.
type Mode = 'idle' | 'move' | 'card';
const mode = ref<Mode>('idle');
/** 카드 조준 중인 손패 인스턴스 id. */
const aimingCardId = ref<string | null>(null);
/** 데스크탑 hover 중인 손패 인스턴스 id(#2) — 마우스만 올려도 격자에 사거리/패턴 즉시 미리보기. */
const hoverCardId = ref<string | null>(null);
/** aimed(원거리 조준) 카드의 현재 선택 조준 칸. null이면 아직 조준 칸 미선택(후보 하이라이트 단계). */
const aimCell = ref<GridPos | null>(null);

/**
 * 격자 미리보기 대상 카드 id(#2) — 사거리/패턴/조준선을 어느 카드 기준으로 그릴지.
 *  - 카드 조준 모드(mode==='card'): 조준 중인 카드(aimingCardId).
 *  - 그 외(idle, 커밋 아님): hover(데스크탑) 또는 롱프레스(터치, detailCardId) 카드.
 * 커밋/비전투면 null(미리보기 없음).
 */
function previewCardId(): string | null {
  if (committing.value || phase.value !== 'combat') return null;
  if (mode.value === 'card') return aimingCardId.value;
  if (mode.value !== 'idle') return null; // 이동 모드 등에선 카드 미리보기 안 함.
  return hoverCardId.value ?? detailCardId.value;
}
/** 미리보기가 *조준 확정(card 모드)*이 아니라 hover/롱프레스 단계인가 — aimed 후보칸을 보일지 판단. */
function isHoverPreview(): boolean {
  return mode.value !== 'card' && previewCardId() !== null;
}
/** 조준 중 호버 칸 — 시야 라인 미리보기용(#3). */
const losPreviewCell = ref<GridPos | null>(null);
/** 커밋(라운드 해소) 진행 중 — 입력 잠금. */
const committing = ref(false);
/** 인스펙트 중인 적 id(원 탭). */
const inspectedId = ref<string | null>(null);
/** 바닥 정보 패널 — idle에서 빈 칸을 탭하면 그 칸 좌표(타일 특성 표시, #1). */
const tileInfo = ref<GridPos | null>(null);
/** 아이템(포션) 선택 패널 열림 여부. */
const itemPanelOpen = ref(false);
/** 동료 교대 선택 패널 열림 여부. */
const swapPanelOpen = ref(false);

// === FX ===
const fx = useGridFx();

// === 동료 교대(C6) ===
/** 교대 가능한 활성 동료(스킬/카드형). 전투 상태 변화 시 재평가. */
const swapTargets = computed<{ id: string; name: string }[]>(() => {
  void gc.value?.turn;
  void run.data.activeSlots;
  return swappableCompanions();
});
/** 이번 전투에서 동료를 조종 중인가(state.swap.controlling). */
const isControllingCompanion = computed<boolean>(() => gc.value?.swap?.controlling === true);
/** 교대를 지금 걸 수 있나 — 대상 존재 + 미교대 + 계획에 swap/item 없음. */
const canSwap = computed<boolean>(() => {
  const state = gc.value;
  if (!state || state.swap) return false;
  if (swapTargets.value.length === 0) return false;
  return !(state.playerPlan ?? []).some((a) => a.kind === 'swap' || a.kind === 'item');
});

// === 포션(아이템) — 보유 전투용 포션 + 턴당 1회 가드 ===
/** 보유 전투용 포션 목록(반응형 — items/턴 변동 추적). */
const potions = computed<Item[]>(() => {
  // gc.value 의존성을 걸어 전투 상태 변화 시 재평가(소모/턴 리셋 반영).
  void gc.value?.turn;
  void gc.value?.potionUsedThisTurn;
  void run.data.items.length;
  return combatPotions();
});
/** 이번 라운드에 이미 포션을 썼거나 계획에 든 아이템이 있으면 사용 불가. */
const potionLocked = computed<boolean>(() => {
  const state = gc.value;
  if (!state) return true;
  if (state.potionUsedThisTurn) return true;
  return (state.playerPlan ?? []).some((a) => a.kind === 'item');
});

// ============================================================================
// 파생 — 무대/전투원/하이라이트
// ============================================================================

const stage = computed(() => gc.value?.stage);
/** 계획 큐 안전 상한(마나 외) — grid-combat MAX_PLAN과 일치. 카드는 마나로 별도 제한. */
const PLAN_CAP = 12;
/** 전투 로그 패널 열림 여부(item 4) — 기본 접힘. 상단 [기록] 버튼으로 토글(레이아웃 안 밀리게 오버레이). */
const logOpen = ref(false);

/**
 * 손패 간략 모드(item 3) — 기본 ON: 카드에 비용·이름·속도만(효과 텍스트 숨김)으로 컴팩트.
 * 효과/범위는 카드를 hover하거나 길게 눌러 상세 패널로 본다. [자세히] 토글로 인라인 효과도 켤 수 있다.
 */
const handCompact = ref(true);

const plan = computed<PlannedAction[]>(() => gc.value?.playerPlan ?? []);
const planFull = computed(() => plan.value.length >= PLAN_CAP);

/**
 * 렌더 대상 적 — 살아 있는 적 + *지금 소멸 애니 중인* 적(보너스: 치명타 데미지 숫자 신뢰성).
 * 치명타로 hp가 0이 되면 그 토큰이 즉시 사라져 그 위에 뜬 "-N" 플로팅 숫자가 한 프레임도
 * 안 보이던 버그가 있었다. dyingActors(짧은 페이드)에 든 적은 데미지·death fx가 끝날 때까지 남긴다.
 */
const liveEnemies = computed<GridCombatant[]>(() =>
  (gc.value?.enemies ?? []).filter(
    (e) =>
      e.hp > 0 ||
      fx.dyingActors.value.has(e.id) ||
      // 순차 재생(A) 중: 엔진은 이미 처치했어도 display hp가 남아 있으면 그 토큰을 계속 보여 준다.
      (fx.playing.value && (fx.displayHp.value.get(e.id) ?? 0) > 0),
  ),
);

/** 살아 있는 아군 토큰(샤유아 분열 등). 순차 재생 중 display hp도 고려. */
const liveAllies = computed<GridCombatant[]>(() =>
  (gc.value?.allies ?? []).filter(
    (a) =>
      a.hp > 0 ||
      fx.dyingActors.value.has(a.id) ||
      (fx.playing.value && (fx.displayHp.value.get(a.id) ?? 0) > 0),
  ),
);

/** 셀 정사각 그리드 — void는 빈칸(렌더 X). */
const gridCols = computed(() => stage.value?.width ?? 0);
const gridRows = computed(() => stage.value?.height ?? 0);

/**
 * 계획에 이동이 큐돼 있으면 *이동 후* 플레이어 위치(US-002). 이후 카드의 범위/조준은 이 위치 기준.
 * 이동은 한 라운드 1회(US-001)라 마지막 큐 이동의 도착점.
 */
const effectivePlayerPos = computed<GridPos>(() => {
  const state = gc.value;
  if (!state) return { x: 0, y: 0 };
  let pos = { ...state.player.pos };
  for (const a of plan.value) if (a.kind === 'move') pos = { ...a.to };
  return pos;
});
/** 이동이 큐돼 현재 위치와 이동 후 위치가 다른가(잔상 토큰 표시 여부). */
const hasPlannedMove = computed<boolean>(() => {
  const state = gc.value;
  if (!state) return false;
  const e = effectivePlayerPos.value;
  return e.x !== state.player.pos.x || e.y !== state.player.pos.y;
});
/** 이동은 한 라운드 1회(US-001), 단 퇴행(#10)이면 2회까지. 한도 도달 시 [이동] 비활성. */
const moveQueued = computed<boolean>(() => {
  const limit = (gc.value?.player.statuses?.['regress'] ?? 0) > 0 ? 2 : 1;
  return plan.value.filter((a) => a.kind === 'move').length >= limit;
});

/** 현재 모드에 따른 하이라이트 칸 집합(키 'x,y'). */
const highlightTiles = computed<Set<string>>(() => {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return new Set();
  if (mode.value === 'move') {
    // 퇴행 2번째 이동 등은 *이동 후 위치* 기준으로 도달칸 계산(없으면 현재 위치).
    return new Set(reachableTiles(state, { ...state.player, pos: effectivePlayerPos.value }).map(posKey));
  }
  const pid = previewCardId();
  if (pid) {
    const card = state.hand.find((c) => c.instanceId === pid);
    if (!card) return new Set();
    const caster = effectivePlayerPos.value;
    if (isAimedCard(card)) {
      // aimed: 조준 칸 미선택(또는 hover 미리보기)이면 *후보 칸*(사거리 내), 선택 후면 shape 미리보기.
      if (isHoverPreview() || !aimCell.value) return new Set(aimableTiles(state, card, caster).map(posKey));
      const off = { dx: aimCell.value.x - caster.x, dy: aimCell.value.y - caster.y };
      return new Set(previewCardTiles(state, card, caster, off).map(posKey));
    }
    return new Set(previewCardTiles(state, card, caster).map(posKey));
  }
  return new Set();
});

/** 조준 중 카드의 *강 칸*(per_tile_mul ≥ 1.5) 집합 — 1.5× 데미지 칸을 별색 표기(US-002). */
const strongHighlightTiles = computed<Set<string>>(() => {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return new Set();
  const pid = previewCardId();
  if (!pid) return new Set();
  const card = state.hand.find((c) => c.instanceId === pid);
  if (!card || !card.shape || card.shape.length === 0) return new Set();
  const out = new Set<string>();
  // 투척 — 해소된 타격칸 중 수렴(강) 칸을 강조.
  if (card.targetMode === 'throw') {
    for (const h of resolveThrowHits(state, card, effectivePlayerPos.value)) {
      if (h.mul >= STRONG_MUL) out.add(`${h.pos.x},${h.pos.y}`);
    }
    return out;
  }
  const muls = card.perTileMul ?? [];
  let anchor = effectivePlayerPos.value;
  if (isAimedCard(card)) {
    if (!aimCell.value) return new Set(); // 조준 칸 미선택(hover 단계)이면 강 칸 미표시.
    anchor = aimCell.value;
  }
  card.shape.forEach((s, i) => {
    if ((muls[i] ?? 1) < STRONG_MUL) return;
    out.add(`${anchor.x + s.dx},${anchor.y + s.dy}`);
  });
  return out;
});
function isStrongTile(x: number, y: number): boolean {
  return strongHighlightTiles.value.has(`${x},${y}`);
}

/** 투척 카드 조준 중 — 해소된 타격칸 + 투척 방향(화살표) 힌트(US-003). */
const THROW_ARROWS: Record<string, string> = {
  '0,-1': '↑', '0,1': '↓', '-1,0': '←', '1,0': '→',
  '-1,-1': '↖', '1,-1': '↗', '-1,1': '↙', '1,1': '↘',
};
const throwHints = computed<Map<string, string>>(() => {
  const state = gc.value;
  const m = new Map<string, string>();
  if (!state || committing.value || phase.value !== 'combat') return m;
  const pid = previewCardId();
  if (!pid) return m;
  const card = state.hand.find((c) => c.instanceId === pid);
  if (!card || card.targetMode !== 'throw') return m;
  const caster = effectivePlayerPos.value;
  for (const h of resolveThrowHits(state, card, caster)) {
    const dx = Math.sign(h.pos.x - caster.x), dy = Math.sign(h.pos.y - caster.y);
    m.set(`${h.pos.x},${h.pos.y}`, THROW_ARROWS[`${dx},${dy}`] ?? '◎');
  }
  return m;
});
function throwArrowAt(x: number, y: number): string | null {
  return throwHints.value.get(`${x},${y}`) ?? null;
}

/**
 * 원거리(aimed) 조준 중 시야 라인(#3) — 내 위치→조준(호버/선택) 칸 직선.
 * 경로에 시야 차단 타일이 있으면 거기서 라인 중단 + 그 칸을 blocked로 강조.
 */
const losInfo = computed<{ line: Set<string>; blocked: string | null }>(() => {
  const state = gc.value;
  const empty = { line: new Set<string>(), blocked: null as string | null };
  if (!state || committing.value || phase.value !== 'combat') return empty;
  if (mode.value !== 'card' || !aimingCardId.value) return empty;
  const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
  if (!card || !isAimedCard(card)) return empty; // 원거리만 시야 라인.
  const target = losPreviewCell.value ?? aimCell.value;
  if (!target) return empty;
  const from = effectivePlayerPos.value;
  if (target.x === from.x && target.y === from.y) return empty;
  const tr = traceLineOfSight(state.stage, from, target);
  return {
    line: new Set(tr.path.map((p) => `${p.x},${p.y}`)),
    blocked: tr.blockedAt ? `${tr.blockedAt.x},${tr.blockedAt.y}` : null,
  };
});
function isLosBlocked(x: number, y: number): boolean { return losInfo.value.blocked === `${x},${y}`; }
/** 셀 호버 — 조준 중이면 시야 라인 미리보기 대상 갱신(데스크톱). */
function onCellHover(x: number, y: number): void {
  if (mode.value === 'card' && aimingCardId.value) losPreviewCell.value = { x, y };
}

/** 설치물 글리프/색(2026-06-18) — 그 칸의 설치물 표시. */
const INSTALL_GLYPH: Record<string, string> = {
  burn: '✸', poison: '☣', explosion: '✺', vulnerable: '▽',
  'atk-up': '▲', 'def-up': '◆', 'mana-up': '✦',
};
function installAt(x: number, y: number): { glyph: string; kind: string } | null {
  const inst = gc.value?.installations?.find((i) => i.pos.x === x && i.pos.y === y);
  if (!inst) return null;
  return { glyph: INSTALL_GLYPH[inst.kind] ?? '◎', kind: inst.kind };
}
/** 플레이어 비행 상태 여부(토큰 배지). */
const playerAirborne = computed<boolean>(() => (gc.value?.player.statuses?.['airborne'] ?? 0) > 0);

/** 공격 장판(#4) — 순차 재생 중 *지금 때리는 칸*의 유형('melee'|'ranged'|'throw'). 없으면 null. */
function strikeStyleAt(x: number, y: number): string | null {
  return fx.displayStrikes.value.get(`${x},${y}`) ?? null;
}

/** aimed 조준 칸 자체(중심 표시용 — shape 미리보기와 구분). */
function isAimCenter(x: number, y: number): boolean {
  return !!aimCell.value && aimCell.value.x === x && aimCell.value.y === y;
}

/** 바닥 정보(#1) — 탭한 칸의 타일 종류 + 6축 특성(O/X). */
const TILE_TYPE_LABEL: Record<string, string> = {
  floor: '바닥', item: '바닥 (아이템)', spawn: '바닥 (증원점)',
  wall: '벽', void: '빈 공간', pit: '구덩이', bush: '수풀', fence: '난간',
};
const tileInfoData = computed(() => {
  const p = tileInfo.value;
  const st = stage.value;
  if (!p || !st) return null;
  const type = (st.cells[p.y]?.[p.x] ?? 'void') as keyof typeof TILE_PROPS;
  const props = TILE_PROPS[type] ?? TILE_PROPS.floor;
  return {
    label: TILE_TYPE_LABEL[type] ?? type,
    pos: p,
    rows: [
      { label: '이동', ok: props.moveStop },
      { label: '공중이동', ok: props.airStop },
      { label: '공격', ok: props.attack },
      { label: '관통', ok: props.pierce },
      { label: '설치', ok: props.place },
      { label: '시야', ok: props.sight },
    ],
  };
});

/**
 * 원거리(aimed) 조준 직선(#2) — 내 위치→조준 칸을 잇는 *연속* 선(칸 단위 좌표).
 * 차단 시 차단 칸까지만. SVG가 viewBox=칸단위라 --cell px와 무관하게 토큰 중심에 정렬된다.
 */
const aimLine = computed<{ x1: number; y1: number; x2: number; y2: number; blocked: boolean } | null>(() => {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return null;
  if (mode.value !== 'card' || !aimingCardId.value) return null;
  const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
  if (!card || !isAimedCard(card)) return null;
  const target = losPreviewCell.value ?? aimCell.value;
  if (!target) return null;
  const from = effectivePlayerPos.value;
  if (target.x === from.x && target.y === from.y) return null;
  const tr = traceLineOfSight(state.stage, from, target);
  const end = tr.blockedAt ?? target;
  return { x1: from.x + 0.5, y1: from.y + 0.5, x2: end.x + 0.5, y2: end.y + 0.5, blocked: !!tr.blockedAt };
});

/** move-self(대시) 카드 조준 중 — 이동 목적지 잔상(Q3). */
const dashPreviewCell = computed<GridPos | null>(() => {
  const state = gc.value;
  if (!state) return null;
  const pid = previewCardId();
  if (!pid) return null;
  const card = state.hand.find((c) => c.instanceId === pid);
  if (!card || !card.effects.some((e) => e.kind === 'move-self')) return null;
  return previewDashTarget(state, card);
});

/** 인스펙트 중인 적의 다음 공격 미리보기 칸(키 집합). */
const inspectAttackTiles = computed<Set<string>>(() => {
  const state = gc.value;
  if (!state || !inspectedId.value) return new Set();
  const enemy = state.enemies.find((e) => e.id === inspectedId.value && e.hp > 0);
  if (!enemy) return new Set();
  // intentQueue의 첫 attack 행동의 targetTiles를 우선, 없으면 첫 attack 정의로 계산.
  const out = new Set<string>();
  const firstAttack = (enemy.intentQueue ?? []).find((a) => a.kind === 'attack');
  if (firstAttack && firstAttack.kind === 'attack') {
    if (firstAttack.targetTiles?.length) {
      for (const t of firstAttack.targetTiles) out.add(posKey(t));
      return out;
    }
    const atk = enemy.attacks?.[firstAttack.attackIdx];
    if (atk) for (const t of previewAttackTiles(state, enemy, atk)) out.add(posKey(t));
  }
  return out;
});

const inspectedEnemy = computed<GridCombatant | undefined>(() =>
  inspectedId.value ? gc.value?.enemies.find((e) => e.id === inspectedId.value) : undefined,
);

/**
 * 적 행동 텔레그래프 — *이번 턴에 행동할(임박한)* 적의 공격 범위 + 이동 목적지를 자동 표시.
 * tempoUntilTurnLive(e) <= 1 이면 이 적은 계획 + 자동 대기로 곧 1턴을 수행한다 → 미리 보여 준다.
 * intentQueue를 따라가며 이동은 도착 칸(move), 공격은 (이동 후 위치 기준) 타격 칸(attack)을 모은다.
 * 계획을 쌓을수록(queuedTempoTicks 변동) 임박 적이 늘어 — 체스처럼 상대 수를 읽고 대응하게 한다.
 */
// 무한갱신 회피(#3): 텔레그래프 AI(enemyPlan/게임트리)는 무겁고 reactive 의존성을 건드려, computed로
//   렌더 중 동기 계산하면 "Maximum recursive updates"가 났다. 그래서 *post-flush watch*에서 계산해
//   shallowRef에 기록한다(렌더 플러시와 분리 — 콜백 내 reactive read/write는 추적되지 않아 루프 불가).
//   source는 계획·적 위치·턴 등 *필요 신호만* 추려 의존(전체 state 깊은 의존 회피).
const enemyTelegraph = shallowRef<{ attack: Set<string>; move: Set<string> }>({ attack: new Set(), move: new Set() });
watch(
  () => {
    const s = gc.value;
    if (!s || committing.value || phase.value !== 'combat') return '';
    const p = plan.value.map((a) => (a.kind === 'move' ? `m${a.to.x},${a.to.y}` : a.kind)).join('>');
    const e = liveEnemies.value.map((en) => `${en.id}@${en.pos.x},${en.pos.y}#${en.tempoCounter ?? 0}/${en.hp}`).join('|');
    return `${s.turn}~${p}~${e}`;
  },
  () => {
    const s = gc.value;
    const atk = new Set<string>();
    const mv = new Set<string>();
    if (s && !committing.value && phase.value === 'combat') {
      const tele = previewEnemyTelegraph(s);
      for (const t of tele.attack) atk.add(`${t.x},${t.y}`);
      for (const t of tele.move) mv.add(`${t.x},${t.y}`);
    }
    enemyTelegraph.value = { attack: atk, move: mv };
  },
  { immediate: true, flush: 'post' },
);
function isEnemyAtkTele(x: number, y: number): boolean { return enemyTelegraph.value.attack.has(`${x},${y}`); }
function isEnemyMoveTele(x: number, y: number): boolean { return enemyTelegraph.value.move.has(`${x},${y}`); }

// === 적 종족색 (그래픽 최소 — 종족별 톤만 다르게, 폴백 빨강) ===
const SPECIES_COLOR: Record<string, string> = {
  vial: '#9ad6ff', sprite: '#b6ff9a', emberling: '#ff9a5a', otter: '#7fd0c0',
  grimoire: '#c9a6ff', mushroom: '#e6d08e', crab: '#ff8e8e', gemling: '#8eeaff',
  windfae: '#bfe6ff', gargoyle: '#9aa0b0', cat: '#d8b48e', shade: '#8a8aa0',
  raccoon: '#b0a890', squirrel: '#d0a878', orc: '#8eb87a', diropel: '#c0b0e0',
  spirit: '#a8e0ff', wraith: '#b09ad0', golem: '#a89878', arachne: '#c08eaa',
  lamia: '#9ad0a0', slime: '#9ee0c0', fox: '#ffb86c', dragon: '#ff9a6c',
  angel: '#ffe6a0', demon: '#ef8fb0', centaur: '#c2925f', lizardman: '#6fbf76', minotaur: '#a86a4a',
  fae: '#d8c0ff',
};
function enemyColor(e: GridCombatant): string {
  const species = e.monsterId ? data.monsters.get(e.monsterId)?.species : undefined;
  return SPECIES_COLOR[String(species ?? '')] ?? '#ff7a7a';
}

// === 활성 유물 표시 — 로드아웃(전투형) + 패시브/즉발(상시). 간단 칩. ===
const activeRelics = computed(() => {
  const loadout = gc.value?.loadout ?? [];
  const loadoutIds = new Set(loadout.map((r) => r.id));
  // 비-전투형(패시브·즉발)도 전투에 영향 → 함께 보여 준다. 중복 제외.
  const passives = (run.data.relics ?? []).filter((r) => !loadoutIds.has(r.id));
  return { loadout, passives };
});

// ============================================================================
// 헬퍼
// ============================================================================

function posKey(p: GridPos): string { return `${p.x},${p.y}`; }

/** 셀이 렌더 대상인가(void 제외). */
function cellRendered(x: number, y: number): boolean {
  const t = stage.value?.cells[y]?.[x];
  return t !== undefined && t !== 'void';
}
function cellType(x: number, y: number): string {
  return stage.value?.cells[y]?.[x] ?? 'void';
}
function isHighlighted(x: number, y: number): boolean {
  return highlightTiles.value.has(`${x},${y}`);
}
function isAttackPreview(x: number, y: number): boolean {
  return inspectAttackTiles.value.has(`${x},${y}`);
}

/** 그 칸에 바닥 보상 마커가 있는가. */
function hasItemDrop(x: number, y: number): boolean {
  return (stage.value?.itemDrops ?? []).some((d) => d.pos.x === x && d.pos.y === y);
}
/** 보상 글리프 — 골드는 코인(◈), 아이템은 별(✦). 마커 없으면 빈 문자열. */
function dropGlyph(x: number, y: number): string {
  const d = (stage.value?.itemDrops ?? []).find((dd) => dd.pos.x === x && dd.pos.y === y);
  if (!d) return '';
  return d.gold ? '◈' : '✦';
}

// === 표시(display) 상태 — 순차 재생(A) 중에는 엔진 final이 아니라 fx.display* 로 렌더. ===
// 비어 있으면(idle) 엔진 state로 폴백. playRound가 라운드 시작에서 출발해 한 행동씩 채운다.
/** 토큰 표시 위치 — 재생 중이면 display, 아니면 엔진 pos. */
function tokenPos(c: GridCombatant): GridPos {
  return fx.displayPos.value.get(c.id) ?? c.pos;
}
/** 토큰 표시 HP — 재생 중이면 display, 아니면 엔진 hp. */
function tokenHp(c: GridCombatant): number {
  const v = fx.displayHp.value.get(c.id);
  return v !== undefined ? v : c.hp;
}
/** 토큰 표시 방어 — 재생 중이면 display, 아니면 엔진 block. */
function tokenBlock(c: GridCombatant): number {
  const v = fx.displayBlock.value.get(c.id);
  return v !== undefined ? v : c.block;
}

/**
 * 같은 (표시) 칸에 겹친 토큰들의 id 목록 맵 — 'x,y' → [actorId...]
 * 칸 점유가 배타적이지 않아(겹침 허용) 한 칸에 토큰 2개+가 올 수 있다. 겹쳤을 때 둘 다 보이게
 * tokenOffset이 이 인덱스로 소폭 어긋나게 그린다. display state(tokenPos)와 일관되게 계산.
 */
const cellOccupants = computed<Map<string, string[]>>(() => {
  const m = new Map<string, string[]>();
  const add = (c: GridCombatant) => {
    const p = tokenPos(c);
    const k = `${p.x},${p.y}`;
    const arr = m.get(k);
    if (arr) arr.push(c.id); else m.set(k, [c.id]);
  };
  const player = gc.value?.player;
  if (player && player.hp > 0) add(player);
  for (const e of liveEnemies.value) add(e);
  for (const a of liveAllies.value) add(a);
  return m;
});

/**
 * 토큰 겹침 오프셋 — 같은 칸에 토큰이 2개+면 인덱스별로 소폭 픽셀 어긋남(원이 완전히 안 가려지게).
 * 혼자면 오프셋 0. translate3d 한 칸당 최대 ±(cell의 일부)만큼. wrapper transform(위치)과 분리된
 * inner 레이어에 적용해 위치/fx와 충돌하지 않게 한다.
 */
function tokenOffset(c: GridCombatant): string {
  const p = tokenPos(c);
  const group = cellOccupants.value.get(`${p.x},${p.y}`) ?? [c.id];
  if (group.length <= 1) return 'translate(0,0)';
  const idx = group.indexOf(c.id);
  // 부채꼴/대각으로 분산 — 인덱스에 따라 (dx,dy) px. 셀 크기 대비 작게(겹쳐도 둘 다 식별).
  const step = 9; // px
  const dx = (idx - (group.length - 1) / 2) * step;
  const dy = (idx % 2 === 0 ? -1 : 1) * Math.ceil(idx / 2) * (step * 0.6);
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
}

function hpRatio(c: GridCombatant): number {
  const hp = tokenHp(c);
  return c.maxHp > 0 ? Math.max(0, Math.min(1, hp / c.maxHp)) : 0;
}

function statusEntries(c: GridCombatant | undefined) {
  if (!c) return [] as { key: string; count: number; label: string }[];
  return Object.entries(c.statuses ?? {})
    .filter(([, v]) => v > 0)
    .map(([key, count]) => ({ key, count, label: statusLabel(key) || key }));
}

/** 적 의도 한 줄 텍스트 — 인스펙트 패널용. attack은 이름·피해·부여 상태를 보여 준다. */
function intentText(a: PlannedAction, enemy: GridCombatant): string {
  switch (a.kind) {
    case 'attack': {
      const atk = enemy.attacks?.[a.attackIdx];
      const name = atk?.name ?? (a.attackIdx < 0 ? '근접 공격' : '공격');
      const dmg = atk?.damage ?? enemy.attack ?? 0;
      const st = atk?.applyStatus
        ? ` + ${statusLabel(atk.applyStatus.split(':')[0]) || atk.applyStatus}`
        : '';
      return dmg > 0 ? `${name} (피해 ${dmg})${st}` : `${name}${st}`;
    }
    case 'move': return `이동 → (${a.to.x},${a.to.y})`;
    case 'wait': return '대기';
    case 'item': return '도구 사용';
    case 'swap': return '동료 교대';
    case 'card': return '특수';
    default: return '?';
  }
}

/** 스피드 모델: 이 적이 다음 1턴을 수행하기까지 남은 *플레이어 행동* 수(tempo - counter). 최소 1. */
function tempoUntilTurn(e: GridCombatant): number {
  const tempo = Math.max(1, e.tempo ?? 4);
  return Math.max(1, tempo - (e.tempoCounter ?? 0));
}

/**
 * 적 토큰에 *상시* 띄울 다음 의도 한 줄(B3-disp) — intentQueue[0] 요약.
 * 클릭(인스펙트) 없이도 신규가 적의 다음 행동·피해를 바로 볼 수 있게 한다.
 * 공격=피해량, 이동=화살표, 대기=점.
 */
function enemyNextIntent(e: GridCombatant): { icon: string; text: string; kind: string } {
  const a = (e.intentQueue ?? [])[0];
  if (!a) return { icon: '·', text: '', kind: 'wait' };
  switch (a.kind) {
    case 'attack': {
      const atk = a.attackIdx >= 0 ? e.attacks?.[a.attackIdx] : undefined;
      const dmg = atk?.damage ?? e.attack ?? 0;
      return { icon: '⚔', text: dmg > 0 ? String(dmg) : '', kind: 'attack' };
    }
    case 'move': return { icon: '»', text: '', kind: 'move' };
    case 'wait': return { icon: '·', text: '', kind: 'wait' };
    default: return { icon: '?', text: '', kind: 'other' };
  }
}

// === 상단 적 패널(요청) — 대치 몬스터별 이름·HP·남은턴·의도. 감출 수 있고, 카드가 노리면 테두리. ===
/** 적 패널 펼침 여부 — 기본 펼침, [감추기]로 접는다. */
const enemyPanelOpen = ref(true);

/** 플레이어 카드(지금 조준/hover 중 + 계획에 올린 카드)가 타격하는 칸 — 적 박스 테두리 강조용. */
const targetedEnemyPositions = computed<Set<string>>(() => {
  const state = gc.value;
  const set = new Set<string>();
  if (!state || phase.value !== 'combat') return set;
  // 지금 조준/hover 중인 카드 미리보기(이동 모드 제외 — 이동칸은 적 타겟이 아님).
  if (mode.value !== 'move') for (const k of highlightTiles.value) set.add(k);
  // 계획에 올린 카드들의 타격 칸.
  for (const a of plan.value) {
    if (a.kind !== 'card') continue;
    const card = state.hand.find((c) => c.instanceId === a.cardInstanceId);
    if (!card) continue;
    for (const t of previewCardTiles(state, card, undefined, a.aimOffset)) set.add(posKey(t));
  }
  return set;
});
/** 이 적이 지금 플레이어 카드의 타격 대상인가(테두리 표시). */
function isEnemyTargeted(e: GridCombatant): boolean {
  return targetedEnemyPositions.value.has(posKey(e.pos));
}
/** 적 패널 행 클릭 → 인스펙트 토글(상세 패널). */
function toggleInspect(e: GridCombatant): void {
  inspectedId.value = inspectedId.value === e.id ? null : e.id;
}
/** 적 HP 게이지 비율(%) — 순차 재생 중에는 display hp 기준. */
function enemyHpPct(e: GridCombatant): number {
  const max = Math.max(1, e.maxHp);
  return Math.max(0, Math.min(100, Math.round((tokenHp(e) / max) * 100)));
}

// === 카드 표시 ===
const rankColors: Record<string, string> = {
  basic: '#a4a4b0', common: '#8effb8', rare: '#8eedff', legendary: '#ffe88e',
};
function cardBorder(c: Card): string { return rankColors[c.rank] ?? '#a4a4b0'; }
function cardCost(c: Card): number { return Math.max(0, c.cost ?? 0); }

/** 카드 1차 효과 요약(강화 반영) — damage/block/heal/draw 중심. */
function cardEffectSummary(c: Card): string {
  const parts: string[] = [];
  for (const e of c.effects) {
    const v = scaledValue(e.value ?? 0, c);
    switch (e.kind) {
      case 'damage': parts.push(`피해 ${v}`); break;
      case 'block': parts.push(`방어 ${v}`); break;
      case 'heal': parts.push(`회복 ${v}`); break;
      case 'draw': parts.push(`드로우 ${e.value ?? 0}`); break;
      case 'apply-status': parts.push(`${statusLabel(String(e.params?.status ?? '')) || '상태'} ${e.value ?? 0}`); break;
      default: break;
    }
  }
  return parts.join(' · ');
}

/** 카드 발동 속도 배지(#6) — 빠름/보통/느림(미설정=보통). 즉시 카드는 '즉시'. */
const CAST_SPEED_LABEL: Record<string, string> = { fast: '빠름', normal: '보통', slow: '느림' };
function castSpeedKey(c: Card): string { return cardIsInstant(c) ? 'instant' : (c.castSpeed ?? 'normal'); }
function castSpeedLabel(c: Card): string {
  return cardIsInstant(c) ? '즉시' : (CAST_SPEED_LABEL[c.castSpeed ?? 'normal'] ?? '보통');
}
/** 즉시 발동 카드인가(#7) — 누르는 즉시 발동(계획 미경유·적 템포 0). */
function cardIsInstant(c: Card): boolean { return isInstantCard(c); }

/** 계획에서 i번째 줄 1개 취소(#3). */
function removePlanLine(i: number) {
  const state = gc.value;
  if (!state || committing.value) return;
  dequeuePlayerAction(state, i);
}

/** 이미 큐에 든 카드 인스턴스 id 집합(중복 표시·비활성). */
const queuedCardIds = computed<Set<string>>(() => {
  const s = new Set<string>();
  for (const a of plan.value) if (a.kind === 'card') s.add(a.cardInstanceId);
  return s;
});

/** 계획에 올린 카드들의 마나 비용 합(미리보기용). */
const queuedManaCost = computed<number>(() => {
  const state = gc.value;
  if (!state) return 0;
  let sum = 0;
  for (const a of plan.value) {
    if (a.kind !== 'card') continue;
    const c = state.hand.find((h) => h.instanceId === a.cardInstanceId);
    if (c) sum += cardCost(c);
  }
  return sum;
});
/** 계획 차감 후 *남은* 마나(슬롯에 카드 올리면 소비 마나만큼 깎여 보임). */
const remainingMana = computed<number>(() => Math.max(0, (gc.value?.mana ?? 0) - queuedManaCost.value));

/** 행동 1개의 템포 소모(대기=2, 그 외 1) — commitRound와 동일 규칙(US-001). */
function actionTempoCost(a: { kind: string }): number { return a.kind === 'wait' ? 2 : 1; }
/** 계획에 이미 쌓인 템포 진행량(적 카운터 예측용). */
const queuedTempoTicks = computed<number>(() => plan.value.reduce((s, a) => s + actionTempoCost(a), 0));
/** 적 e의 실효 템포(전역 slow + slowed 상태 반영) — commitRound tickEnemyTempo와 동일. */
function effectiveTempo(e: GridCombatant): number {
  const state = gc.value;
  const slow = (state?.gridEnemySlow ?? 0) > 0 ? 1 : 0;
  return Math.max(1, (e.tempo ?? 4) + slow + (e.statuses['slowed'] ?? 0));
}
/**
 * 지금 행동을 1개(ticks 템포) 더 두면 적 *누군가*가 1턴을 수행하게 되는가(US-003 경고).
 * 큐에 쌓인 진행량 위에서 이 행동이 적 카운터를 임계 너머로 넘기는지 판정.
 */
function actionTriggersEnemy(ticks: number): boolean {
  const state = gc.value;
  if (!state) return false;
  const before = queuedTempoTicks.value;
  for (const e of liveEnemies.value) {
    const tempo = effectiveTempo(e);
    const c0 = (e.tempoCounter ?? 0) + before;
    if (Math.floor((c0 + ticks) / tempo) > Math.floor(c0 / tempo)) return true;
  }
  return false;
}
/** 손패 카드(템포 1)를 지금 큐에 넣으면 적 행동 타이밍인가 — 테두리 경고용. */
function cardTriggersEnemy(_c: Card): boolean { return actionTriggersEnemy(1); }

/** 적 e가 다음 1턴을 수행하기까지 남은 플레이어 행동 수 — *큐에 쌓인 행동 반영*(토큰 상시 표시). 1..tempo. */
function tempoUntilTurnLive(e: GridCombatant): number {
  const tempo = effectiveTempo(e);
  const c = ((e.tempoCounter ?? 0) + queuedTempoTicks.value) % tempo;
  return c === 0 ? tempo : tempo - c;
}

// === 카드 상세 롱프레스(US-005) — 누르고 있으면 범위·효과 상세, 드래그하면 다른 카드로 전환 ===
const detailCardId = ref<string | null>(null);
let pressTimer: number | null = null;
let pressFired = false;
function onCardPointerDown(c: Card) {
  if (!c.instanceId) return;
  pressFired = false;
  if (pressTimer !== null) window.clearTimeout(pressTimer);
  const iid = c.instanceId;
  pressTimer = window.setTimeout(() => { pressFired = true; detailCardId.value = iid; }, 320);
}
function onHandPointerMove(ev: PointerEvent) {
  if (detailCardId.value === null) return; // 상세 표시 중에만 드래그 전환
  const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-card-iid]') as HTMLElement | null;
  const iid = el?.dataset.cardIid;
  if (iid) detailCardId.value = iid;
}
function endCardPress() {
  if (pressTimer !== null) { window.clearTimeout(pressTimer); pressTimer = null; }
  detailCardId.value = null;
}
const detailCard = computed<Card | null>(() => {
  const id = detailCardId.value;
  if (!id) return null;
  return gc.value?.hand.find((c) => c.instanceId === id) ?? null;
});
const detailShape = computed(() => (detailCard.value ? cardShapePreview(detailCard.value) : null));

/** 손패 카드가 지금 사용(큐잉) 가능한가. */
function cardPlayable(c: Card): boolean {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return false;
  if (!c.instanceId) return false;
  // 즉시 카드(#7) — 계획·캡과 무관, *남은 마나*로만 판정(누르면 바로 발동).
  if (cardIsInstant(c)) return !c.unplayable && remainingMana.value >= cardCost(c);
  if (planFull.value) return false;
  if (queuedCardIds.value.has(c.instanceId)) return false;
  if (!canPlayCard(state, c)) return false;
  // 누적 마나 검증(엔진 queuePlayerAction과 동일 — 미리 표기).
  const queuedCost = plan.value.reduce((sum, a) => {
    if (a.kind !== 'card') return sum;
    const qc = state.hand.find((h) => h.instanceId === a.cardInstanceId);
    return sum + (qc ? cardCost(qc) : 0);
  }, 0);
  return queuedCost + cardCost(c) <= state.mana;
}

// 행동 큐 라벨(요약).
function planLabel(a: PlannedAction): string {
  switch (a.kind) {
    case 'move': return `이동 → (${a.to.x},${a.to.y})`;
    case 'card': {
      const c = gc.value?.hand.find((h) => h.instanceId === a.cardInstanceId);
      return `카드 「${c?.name ?? '?'}」`;
    }
    case 'item': {
      const it = run.data.items.find((i) => (i.instanceId ?? i.id) === a.itemId || i.id === a.itemId);
      return `아이템 ${it?.name ?? ''}`.trim();
    }
    case 'swap': {
      const c = swapTargets.value.find((t) => t.id === a.companionId);
      return `교대 → ${c?.name ?? '동료'}`;
    }
    case 'wait': return '대기';
    default: return '?';
  }
}

// ============================================================================
// 입력 핸들러
// ============================================================================

function selectMoveMode() {
  if (committing.value || planFull.value) return;
  inspectedId.value = null;
  tileInfo.value = null;
  itemPanelOpen.value = false;
  swapPanelOpen.value = false;
  mode.value = mode.value === 'move' ? 'idle' : 'move';
  aimingCardId.value = null;
  aimCell.value = null;
}

/** [아이템] 버튼 — 보유 전투용 포션 패널 토글. */
function toggleItemPanel() {
  if (committing.value || planFull.value || potionLocked.value) return;
  if (potions.value.length === 0) {
    ui.toast('info', '쓸 아이템이 없다.');
    return;
  }
  mode.value = 'idle';
  aimingCardId.value = null;
  aimCell.value = null;
  inspectedId.value = null;
  swapPanelOpen.value = false;
  itemPanelOpen.value = !itemPanelOpen.value;
}

/** [교대] 버튼 — 동료 선택 패널 토글. */
function toggleSwapPanel() {
  if (committing.value || planFull.value || !canSwap.value) return;
  const next = !swapPanelOpen.value;
  mode.value = 'idle';
  aimingCardId.value = null;
  aimCell.value = null;
  inspectedId.value = null;
  itemPanelOpen.value = false;
  swapPanelOpen.value = next;
}

/** 동료 1명 선택 — 행동 큐에 swap 행동 추가(라운드당 1회, 다음 턴 조종). */
function queueSwap(companionId: string) {
  const state = gc.value;
  if (!state || committing.value || planFull.value) return;
  if (queuePlayerAction(state, { kind: 'swap', companionId })) {
    swapPanelOpen.value = false;
    ui.toast('info', '교대 준비 — 다음 턴 동료를 조종한다.');
  } else {
    ui.toast('warning', '지금 교대할 수 없다.');
  }
}

/** 포션 1점 선택 — 행동 큐에 item 행동 추가(턴당 1회). */
function usecPotion(item: Item) {
  const state = gc.value;
  if (!state || committing.value || planFull.value) return;
  const id = item.instanceId ?? item.id;
  const ok = queuePlayerAction(state, { kind: 'item', itemId: id });
  if (ok) {
    itemPanelOpen.value = false;
  swapPanelOpen.value = false;
    ui.toast('success', `${item.name} 사용 예약`);
  } else {
    ui.toast('warning', '아이템은 라운드당 1회.');
  }
}

/** 포션 효과 한 줄 요약(행동바 패널 표시용). */
function potionSummary(item: Item): string {
  const parts: string[] = [];
  for (const e of item.effects) {
    switch (e.kind) {
      case 'heal': parts.push(`HP +${e.value ?? 0}`); break;
      case 'combat-block': parts.push(`방어 +${e.value ?? 0}`); break;
      case 'combat-mana': parts.push(`마나 +${e.value ?? 0}`); break;
      case 'combat-draw': parts.push(`드로우 ${e.value ?? 0}`); break;
      case 'combat-enemy-status': parts.push(`적 ${statusLabel(String(e.param ?? '')) || e.param} +${e.value ?? 0}`); break;
      case 'combat-self-status': parts.push(`${statusLabel(String(e.param ?? '')) || e.param} +${e.value ?? 0}`); break;
      case 'cleanse-group': parts.push('디버프 정화'); break;
      default: break;
    }
  }
  return parts.join(' · ');
}

/**
 * 핸드 카드 탭(#2) — 한 번 탭에 선택/등록.
 *  - 즉시(instant) 카드: 누르는 즉시 발동(현행).
 *  - 원거리(aimed=투척/조준) 카드: 탭1=조준 진입 → 타깃 칸 탭=등록(현행 2단계 유지).
 *  - 패턴/제자리(비조준) 카드: *탭 한 번에 즉시 큐잉*(기존 "같은 카드 다시 탭" 2탭 제거).
 */
function selectCard(c: Card) {
  if (pressFired) { pressFired = false; return; } // 롱프레스(상세) 직후의 click 억제
  if (committing.value) return;
  if (!c.instanceId || !cardPlayable(c)) return;
  inspectedId.value = null;
  tileInfo.value = null;
  itemPanelOpen.value = false;
  swapPanelOpen.value = false;
  // 즉시 카드(#7) — 누르는 즉시 발동(조준/계획 없이). planFull과 무관.
  if (cardIsInstant(c)) { doInstant(c); return; }
  // 원거리 조준 카드 — 2단계(조준 진입 → 칸 탭 등록). 조준 중 같은 카드 다시 탭 = 확정.
  if (isAimedCard(c)) {
    if (mode.value === 'card' && aimingCardId.value === c.instanceId) {
      if (!aimCell.value) { ui.toast('info', '조준 칸을 먼저 고르세요.'); return; }
      confirmCard();
      return;
    }
    mode.value = 'card';
    aimingCardId.value = c.instanceId;
    aimCell.value = null;
    ui.toast('info', '사거리 안의 조준 칸을 고르세요.');
    return;
  }
  // 패턴/제자리 카드(#2) — 한 탭에 즉시 큐잉(조준 불필요).
  queuePatternCard(c);
}

/** 비조준(패턴/제자리) 카드를 *현재 위치 기준* 고정 패턴으로 즉시 계획 큐에 등록(#2). */
function queuePatternCard(c: Card) {
  const state = gc.value;
  if (!state || !c.instanceId) return;
  const caster = effectivePlayerPos.value;
  const targetTiles = previewCardTiles(state, c, caster);
  const ok = queuePlayerAction(state, { kind: 'card', cardInstanceId: c.instanceId, targetTiles });
  if (ok) {
    mode.value = 'idle';
    aimingCardId.value = null;
    aimCell.value = null;
  } else {
    ui.toast('warning', '그 카드를 지금 사용할 수 없다.');
  }
}

/** 카드 hover 진입(데스크탑, #2) — idle에서 그 카드의 사거리/패턴을 격자에 즉시 미리보기. */
function onCardHover(c: Card) {
  if (committing.value || mode.value !== 'idle') return; // 조준/이동 중엔 hover 미리보기 안 함.
  if (!c.instanceId) return;
  hoverCardId.value = c.instanceId;
}
/** 카드 hover 이탈(#2) — 그 카드였을 때만 해제(다른 카드로 옮겨가는 중이면 그쪽 enter가 갱신). */
function onCardLeave(c: Card) {
  if (hoverCardId.value === c.instanceId) hoverCardId.value = null;
}

/** self/제자리 카드(조준 칸 없음)인가 — shape 미설정 또는 빈 결과. */
const aimingCardSelfTarget = computed<boolean>(() => {
  const state = gc.value;
  if (mode.value !== 'card' || !aimingCardId.value || !state) return false;
  const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
  if (!card) return false;
  if (isAimedCard(card)) return false; // aimed는 항상 조준형(제자리 아님).
  return previewCardTiles(state, card).length === 0;
});

/** 조준 중인 카드가 aimed(원거리 조준)형인가 — aim-bar 힌트 분기용. */
const aimingCardIsAimed = computed<boolean>(() => {
  const state = gc.value;
  if (mode.value !== 'card' || !aimingCardId.value || !state) return false;
  const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
  return !!card && isAimedCard(card);
});

/**
 * 조준 중인 *패턴* 카드의 범위 안에 적이 한 칸이라도 있는가(정보성 표시 전용).
 * 빈 칸 발동을 막지 않는다 — 적이 없어도 카드는 확정·발동된다(빈 발동 허용).
 * self/제자리 카드면 true 취급. 칸 라벨/색 힌트에만 쓴다.
 */
const aimingHasEnemyTarget = computed<boolean>(() => {
  const state = gc.value;
  if (mode.value !== 'card' || !aimingCardId.value || !state) return true;
  const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
  if (!card) return true;
  const tiles = previewCardTiles(state, card);
  if (tiles.length === 0) return true; // self/제자리.
  return tiles.some((p) => {
    const occ = combatantAt(state, p);
    return !!occ && occ.team === 'enemy' && occ.hp > 0;
  });
});

/** 격자 칸 탭 — 모드에 따라 이동 큐잉 / 카드 조준 확정 / 적 인스펙트. */
function tapTile(x: number, y: number) {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return;
  const pos = { x, y };

  // 이동 모드 — 도달 가능 칸이면 큐잉.
  if (mode.value === 'move') {
    if (!isHighlighted(x, y)) return;
    if (queuePlayerAction(state, { kind: 'move', to: pos })) {
      mode.value = 'idle';
    } else {
      ui.toast('warning', '그 칸으로는 이동할 수 없다.');
    }
    return;
  }

  // 카드 조준 모드.
  if (mode.value === 'card' && aimingCardId.value) {
    const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
    // aimed(원거리 조준): 사거리 내 후보 칸 탭 시 (재)조준만(확정은 [확정] 버튼). shape 미리보기로 전환.
    if (card && isAimedCard(card)) {
      const within = aimableTiles(state, card, effectivePlayerPos.value).some((p) => p.x === x && p.y === y);
      if (within) aimCell.value = { x, y };
      return;
    }
    // 고정 패턴 — 하이라이트 칸 탭 시 그 카드 확정(어느 칸을 눌러도 패턴 전체 적용).
    if (!isHighlighted(x, y)) return;
    confirmCard();
    return;
  }

  // idle — 적 칸이면 인스펙트, 그 외 칸이면 바닥 정보(#1, 같은 칸 다시 누르면 닫기).
  const occupant = combatantAt(state, pos);
  if (occupant && occupant.team === 'enemy') {
    inspectedId.value = inspectedId.value === occupant.id ? null : occupant.id;
    tileInfo.value = null;
  } else {
    inspectedId.value = null;
    tileInfo.value = (tileInfo.value && tileInfo.value.x === x && tileInfo.value.y === y) ? null : pos;
  }
}

/** 적 원 직접 탭 — 인스펙트 토글(idle 모드에서). */
function tapEnemy(e: GridCombatant) {
  if (mode.value === 'move' || mode.value === 'card') {
    // 조준 중이면 칸 탭 로직으로 위임(공격 칸일 수 있음).
    tapTile(e.pos.x, e.pos.y);
    return;
  }
  inspectedId.value = inspectedId.value === e.id ? null : e.id;
}

/** 조준 중인 카드 확정 — playerPlan에 추가. 적 유무와 무관(빈 칸 발동 허용). */
function confirmCard() {
  const state = gc.value;
  if (!state || !aimingCardId.value) return;
  const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
  if (!card) return;
  // aimed: 조준 칸을 먼저 골라야 한다. 그 칸의 플레이어 기준 오프셋을 함께 넘긴다.
  // 오프셋은 *이동 후 위치* 기준(US-002). 실행 시 이동이 먼저 해소돼 player.pos가 이동 후가 되므로 일치.
  const caster = effectivePlayerPos.value;
  let aimOffset: GridOffset | undefined;
  if (isAimedCard(card)) {
    if (!aimCell.value) { ui.toast('info', '조준할 칸을 먼저 고르세요.'); return; }
    aimOffset = { dx: aimCell.value.x - caster.x, dy: aimCell.value.y - caster.y };
  }
  const targetTiles = previewCardTiles(state, card, caster, aimOffset);
  const ok = queuePlayerAction(state, {
    kind: 'card',
    cardInstanceId: aimingCardId.value,
    targetTiles,
    aimOffset,
  });
  if (ok) {
    mode.value = 'idle';
    aimingCardId.value = null;
    aimCell.value = null;
  } else {
    ui.toast('warning', '그 카드를 지금 사용할 수 없다.');
  }
}

function cancelAim() {
  mode.value = 'idle';
  aimingCardId.value = null;
  aimCell.value = null;
}

function clearPlan() {
  const state = gc.value;
  if (!state || committing.value) return;
  clearPlayerPlan(state);
  mode.value = 'idle';
  aimingCardId.value = null;
  aimCell.value = null;
  itemPanelOpen.value = false;
  swapPanelOpen.value = false;
}

/** [턴 종료] — 한 라운드 해소(빈 계획이어도 자동 대기로 턴 넘김, #4) 후 fx 애니 재생 + 승패 전이. */
function commit() {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return;
  doCommit();
}

/** 라운드 시작 시점 전투원 스냅샷(display 출발점) — 엔진 commit *전*에 떠 둔다. */
function snapshotActors(state: NonNullable<typeof gc.value>): ActorSnapshot[] {
  const out: ActorSnapshot[] = [
    { id: state.player.id, pos: { ...state.player.pos }, hp: state.player.hp, block: state.player.block },
  ];
  for (const e of state.enemies) {
    if (e.hp > 0) out.push({ id: e.id, pos: { ...e.pos }, hp: e.hp, block: e.block });
  }
  for (const a of state.allies ?? []) {
    if (a.hp > 0) out.push({ id: a.id, pos: { ...a.pos }, hp: a.hp, block: a.block });
  }
  return out;
}

function doCommit() {
  const before = gc.value;
  if (!before) return;
  committing.value = true;
  mode.value = 'idle';
  aimingCardId.value = null;
  aimCell.value = null;
  inspectedId.value = null;
  itemPanelOpen.value = false;
  swapPanelOpen.value = false;

  // 1) 라운드 *시작* 상태 스냅샷(엔진이 즉시 final로 바꾸기 전).
  const start = snapshotActors(before);

  // 2) 엔진 해소 — pos/hp/block을 즉시 final로 바꾸고 fx 큐를 쌓는다.
  const outcome = run.commitGridRound();

  const state = gc.value;
  const events = state?.fx ? [...state.fx] : [];
  if (state?.fx) state.fx.length = 0;

  // 3) **진짜 순차 재생(A)** — display를 start에서 출발시켜 fx를 행동 순서대로 하나씩 재생.
  //    재생이 끝나면(onDone) display를 비워 엔진 final로 수렴 + 입력 허용 + 승패 전이.
  fx.playRound(start, events, () => {
    fx.clearDisplay(); // display 제거 → 토큰이 엔진 final로 수렴.
    committing.value = false;
    settleOutcome(outcome);
  });
}

/** 승패 전이 — 커밋/즉시 발동 공용. win=승리 화면, lose=목숨 분기(도망 or 패배). */
function settleOutcome(outcome: 'win' | 'lose' | undefined) {
  if (outcome === 'win') {
    phase.value = 'victory';
  } else if (outcome === 'lose') {
    // 패배 — 목숨 분기. endGridCombat이 true면 도망(맵 복귀), false면 런 종료.
    const fled = run.endGridCombat('lose');
    if (fled) {
      ui.toast('warning', '쓰러질 뻔했지만, 목숨 하나로 가까스로 몸을 뺐다.');
      router.push('/game/map');
    } else {
      phase.value = 'defeat';
    }
  }
}

/**
 * 즉시 카드 발동(#7) — 계획·적 템포 없이 바로 효과 적용 후 짧게 fx 재생.
 * 발동 중에도 committing으로 입력을 잠그고, 끝나면 계획을 이어 간다(턴 미종료).
 */
function doInstant(c: Card) {
  const before = gc.value;
  if (!before || !c.instanceId) return;
  committing.value = true;
  mode.value = 'idle';
  aimingCardId.value = null;
  aimCell.value = null;
  const start = snapshotActors(before);
  const outcome = run.playInstantGridCard(c.instanceId);
  const state = gc.value;
  const events = state?.fx ? [...state.fx] : [];
  if (state?.fx) state.fx.length = 0;
  fx.playRound(start, events, () => {
    fx.clearDisplay();
    committing.value = false;
    settleOutcome(outcome);
  });
}

// 승리 확정 후 [계속] — 보상/클리어 마킹 처리 후 전이.
//   일반/아크 보스 → 맵 복귀(true). 연표 종말 보스 → 런 종료 요약(false).
function finishVictory() {
  const toMap = run.endGridCombat('win');
  router.push(toMap ? '/game/map' : '/game/end');
}

// 패배 확정 후 [돌아간다] — 런 종료 요약으로(엔진이 endRun까지 처리했으므로 화면만 전이).
function returnToEnd() {
  router.push('/game/end');
}

// fx 큐 추가 감시 — 혹시 엔진이 비-커밋 경로로 fx를 push해도 소비(방어적).
watch(
  () => gc.value?.fx?.length,
  (len) => {
    if (committing.value) return; // 커밋 경로가 직접 소비.
    if (!len) return;
    const state = gc.value;
    if (state?.fx?.length) {
      fx.consumeAll(state.fx);
      state.fx.length = 0;
    }
  },
);

onMounted(() => {
  if (!run.active) {
    router.push('/main');
    return;
  }
  // 맵에서 이미 enterGridCombat/enterGridBossCombat을 호출해 gridCombat이 set돼 있어야 정상.
  // 직접 진입(새로고침 등)으로 비어 있으면 현재 노드로 진입 시도(보스 노드면 보스 전투로).
  if (!run.data.gridCombat) {
    const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
    const node = map?.nodes.find((n) => n.id === run.data.currentNodeId);
    const isBossNode = (node ? (run.data.nodeKindOverrides[node.id] ?? node.kind) : '') === 'boss';
    const ok = isBossNode ? run.enterGridBossCombat() : run.enterGridCombat();
    if (!ok || !run.data.gridCombat) {
      ui.toast('error', '전투를 시작할 수 없습니다.');
      router.push('/game/map');
      return;
    }
  }
  // 전투 시작 fx(전투시작 유물의 방어획득 등) 정리 — 첫 라운드 순차 재생에 stale fx로 끼지 않게.
  //   초기 상태는 토큰 렌더가 엔진 state로 직접 그리므로 시작 fx를 재생할 필요가 없다.
  if (run.data.gridCombat?.fx) run.data.gridCombat.fx.length = 0;
  // 이미 outcome이 박혀 있으면(복원 엣지) 그 결과 화면으로.
  const o = run.data.gridCombat?.outcome;
  if (o === 'win') phase.value = 'victory';
  else if (o === 'lose') phase.value = 'defeat';
});

// 언마운트 — 진행 중 순차 재생 타이머 정리(전이 후 콜백 발사 방지).
onUnmounted(() => {
  fx.clearDisplay();
});
</script>

<template>
  <!-- 단일 루트 wrapper — 멀티루트 금지(씬 전환 소프트락 회귀 방지). -->
  <div class="grid-combat-root">
    <!-- 전투 진행 -->
    <main v-if="phase === 'combat' && gc && stage" class="grid-combat">
      <!-- 상단 바: 턴 / 마나 / 로그 -->
      <header class="topbar">
        <!-- 적 패널 토글(요청: 감출 수 있게). -->
        <button class="enemy-toggle" @click="enemyPanelOpen = !enemyPanelOpen">
          대치 {{ liveEnemies.length }} {{ enemyPanelOpen ? '▾' : '▸' }}
        </button>
        <!-- 전투 기록 토글(item 4) — 기본 접힘. 누르면 최근 기록 오버레이. -->
        <button
          class="topbar__logbtn"
          :class="{ 'topbar__logbtn--on': logOpen }"
          @click="logOpen = !logOpen"
        >기록</button>
        <div v-if="committing" class="topbar__resolving">해소 중…</div>
        <!-- 로그 패널 — 열었을 때만(레이아웃을 밀지 않게 오버레이). 최근 12줄. -->
        <div v-if="logOpen && (gc.log?.length ?? 0) > 0" class="combat-log combat-log--panel">
          <div v-for="(line, i) in gc.log!.slice(-12)" :key="i" class="combat-log__line">{{ line }}</div>
        </div>
      </header>

      <!-- 상단 적 패널(요청) — 대치 몬스터별 한 줄: 이름 · HP(빨강) · 남은 턴(노랑) · 의도.
           카드가 그 적을 노리면 테두리 강조. 여럿이면 여러 줄. [대치] 토글로 감춘다. -->
      <div v-if="enemyPanelOpen && liveEnemies.length > 0" class="enemy-panel">
        <button
          v-for="e in liveEnemies"
          :key="e.id"
          class="enemy-row"
          :class="{
            'enemy-row--targeted': isEnemyTargeted(e),
            'enemy-row--soon': tempoUntilTurnLive(e) <= 1,
            'enemy-row--inspected': inspectedId === e.id,
          }"
          @click="toggleInspect(e)"
        >
          <span class="enemy-row__name" :style="{ color: enemyColor(e) }">{{ e.name ?? '적' }}</span>
          <!-- HP 게이지(빨강 막대) + 수치. -->
          <span class="ehp">
            <span class="ehp__bar"><span class="ehp__fill" :style="{ width: enemyHpPct(e) + '%' }"></span></span>
            <span class="ehp__num">{{ tokenHp(e) }}<span class="ehp__sub">/{{ e.maxHp }}</span><span v-if="tokenBlock(e) > 0" class="ebox__blk">🛡{{ tokenBlock(e) }}</span></span>
          </span>
          <!-- 남은 턴 pips — 대기 턴=주황, 행동 턴(마지막)=빨강. tempo 4면 주황3+빨강1, 카운트다운으로 줄어든다. -->
          <span class="eturn" :title="`${tempoUntilTurnLive(e)}수 뒤 행동`">
            <span
              v-for="n in tempoUntilTurnLive(e)"
              :key="n"
              class="eturn__pip"
              :class="n === tempoUntilTurnLive(e) ? 'eturn__pip--act' : 'eturn__pip--wait'"
            ></span>
          </span>
          <span class="enemy-row__intent" :class="`enemy-row__intent--${enemyNextIntent(e).kind}`">
            {{ enemyNextIntent(e).icon }}<template v-if="enemyNextIntent(e).text"> {{ enemyNextIntent(e).text }}</template>
          </span>
        </button>
      </div>

      <!-- 활성 유물 칩 — 로드아웃(전투형, 금빛) + 패시브/즉발(상시, 회색). -->
      <div
        v-if="activeRelics.loadout.length > 0 || activeRelics.passives.length > 0"
        class="relic-strip"
      >
        <span
          v-for="r in activeRelics.loadout"
          :key="`lo-${r.id}`"
          class="relic-chip relic-chip--loadout"
          :title="r.name"
        >{{ r.name }}</span>
        <span
          v-for="r in activeRelics.passives"
          :key="`pa-${r.id}`"
          class="relic-chip relic-chip--passive"
          :title="r.name"
        >{{ r.name }}</span>
      </div>

      <!-- 보스 배너(#4) — 이름·페이즈·큰 HP바. 일반 전투에선 미표시. -->
      <div v-if="isBoss && bossUnit" class="boss-banner">
        <div class="boss-banner__head">
          <span class="boss-banner__name">{{ bossUnit.name ?? gc.bossName ?? '보스' }}</span>
          <span v-if="bossPhaseLabel" class="boss-banner__phase">{{ bossPhaseLabel }}</span>
        </div>
        <div class="boss-banner__hpbar">
          <span class="boss-banner__hpfill" :style="{ width: `${hpRatio(bossUnit) * 100}%` }"></span>
          <span class="boss-banner__hptext">{{ tokenHp(bossUnit) }} / {{ bossUnit.maxHp }}</span>
        </div>
      </div>

      <!-- 격자 본체 -->
      <section class="board-wrap">
        <div
          class="board"
          :style="{
            'grid-template-columns': `repeat(${gridCols}, var(--cell))`,
            'grid-template-rows': `repeat(${gridRows}, var(--cell))`,
          }"
          @pointerleave="losPreviewCell = null"
        >
          <template v-for="y in gridRows" :key="`row-${y}`">
            <template v-for="x in gridCols" :key="`cell-${x}-${y}`">
              <!-- void는 빈칸(렌더 X) → 비직사각 자연 처리. 좌표는 0-기준이라 -1 보정. -->
              <div
                v-if="cellRendered(x - 1, y - 1)"
                class="cell"
                :class="[
                  `cell--${cellType(x - 1, y - 1)}`,
                  strikeStyleAt(x - 1, y - 1) ? `cell--strike-${strikeStyleAt(x - 1, y - 1)}` : '',
                  {
                    'cell--highlight': isHighlighted(x - 1, y - 1),
                    'cell--strong': isStrongTile(x - 1, y - 1),
                    'cell--attack-preview': isAttackPreview(x - 1, y - 1),
                    'cell--enemy-atk': isEnemyAtkTele(x - 1, y - 1),
                    'cell--enemy-move': isEnemyMoveTele(x - 1, y - 1),
                    'cell--aim-center': isAimCenter(x - 1, y - 1),
                    'cell--los-blocked': isLosBlocked(x - 1, y - 1),
                  },
                ]"
                :style="{ 'grid-column': x, 'grid-row': y }"
                @click="tapTile(x - 1, y - 1)"
                @pointerenter="onCellHover(x - 1, y - 1)"
              >
                <span v-if="cellType(x - 1, y - 1) === 'wall'" class="cell__wall">▦</span>
                <span v-else-if="cellType(x - 1, y - 1) === 'pit'" class="cell__pit">◌</span>
                <span v-else-if="cellType(x - 1, y - 1) === 'bush'" class="cell__bush">❀</span>
                <span v-else-if="cellType(x - 1, y - 1) === 'fence'" class="cell__fence">⊞</span>
                <span v-else-if="hasItemDrop(x - 1, y - 1)" class="cell__item" :class="{ 'cell__item--gold': dropGlyph(x - 1, y - 1) === '◈' }">{{ dropGlyph(x - 1, y - 1) }}</span>
                <span v-else-if="cellType(x - 1, y - 1) === 'spawn'" class="cell__spawn">·</span>
                <span v-if="throwArrowAt(x - 1, y - 1)" class="cell__throw">{{ throwArrowAt(x - 1, y - 1) }}</span>
                <span
                  v-if="installAt(x - 1, y - 1)"
                  class="cell__install"
                  :class="`cell__install--${installAt(x - 1, y - 1)?.kind}`"
                >{{ installAt(x - 1, y - 1)?.glyph }}</span>
              </div>
              <!-- void는 자리를 차지하되 투명(grid 정렬 유지). -->
              <div
                v-else
                class="cell cell--void"
                :style="{ 'grid-column': x, 'grid-row': y }"
              ></div>
            </template>
          </template>

          <!-- 조준 직선(#2) — viewBox=칸단위라 --cell px와 무관하게 토큰 중심에 정렬되는 *연속* 선. -->
          <svg
            v-if="aimLine"
            class="los-svg"
            :viewBox="`0 0 ${gridCols} ${gridRows}`"
            preserveAspectRatio="none"
            :style="{ width: `calc(${gridCols} * var(--cell))`, height: `calc(${gridRows} * var(--cell))` }"
          >
            <line
              class="los-svg__line"
              :class="{ 'los-svg__line--blocked': aimLine.blocked }"
              :x1="aimLine.x1" :y1="aimLine.y1" :x2="aimLine.x2" :y2="aimLine.y2"
            />
          </svg>

          <!-- 전투원 토큰 — *위치*는 wrapper(.token)의 transform, *fx*(흔들림·페이드·플로팅)는
               inner(.token__inner)에서 처리한다. 두 transform을 분리해 공격 중 원점(0,0) 튐을 막는다. -->
          <!-- 이동 후 위치 잔상(US-002) — 계획에 이동이 있으면 도착 지점을 흐리게 표시 -->
          <div
            v-if="hasPlannedMove && gc.player.hp > 0"
            class="token token--ghost"
            :style="{
              transform: `translate(calc(${effectivePlayerPos.x} * var(--cell)), calc(${effectivePlayerPos.y} * var(--cell)))`,
            }"
          >
            <div class="token__inner">
              <div class="token__circle token__circle--player"></div>
            </div>
          </div>

          <!-- 대시(발놀림) 목적지 잔상(Q3) — move-self 카드 조준 중 이동할 칸을 흐리게 + 화살표. -->
          <div
            v-if="dashPreviewCell && gc.player.hp > 0"
            class="token token--ghost token--ghost-dash"
            :style="{
              transform: `translate(calc(${dashPreviewCell.x} * var(--cell)), calc(${dashPreviewCell.y} * var(--cell)))`,
            }"
          >
            <div class="token__inner">
              <div class="token__circle token__circle--player"></div>
              <span class="token__dash-arrow">»</span>
            </div>
          </div>

          <!-- 플레이어 -->
          <div
            v-if="gc.player.hp > 0"
            class="token token--player"
            :style="{
              transform: `translate(calc(${tokenPos(gc.player).x} * var(--cell)), calc(${tokenPos(gc.player).y} * var(--cell)))`,
            }"
          >
            <div
              class="token__inner"
              :class="{ 'is-hit': fx.hitActors.value.has('player'), 'is-cast': fx.castActors.value.has('player') }"
              :style="{ transform: tokenOffset(gc.player) }"
            >
              <div class="token__circle token__circle--player"></div>
              <span v-if="playerAirborne" class="token__air" title="비행 — 다음 이동이 장애물 위를 넘어 착지칸까지">⤴</span>
              <div class="token__hpbar"><span :style="{ width: `${hpRatio(gc.player) * 100}%` }"></span></div>
              <!-- 플로팅 숫자 -->
              <span
                v-for="f in fx.floats.value.filter((n) => n.actorId === 'player')"
                :key="f.id"
                class="float-num"
                :class="`float-num--${f.kind}`"
                :style="{ '--drift': f.drift }"
              >{{ f.text }}</span>
            </div>
          </div>

          <!-- 적 -->
          <div
            v-for="e in liveEnemies"
            :key="e.id"
            class="token token--enemy"
            :class="{ 'is-inspected': inspectedId === e.id, 'token--boss': e.isBoss }"
            :style="{
              transform: `translate(calc(${tokenPos(e).x} * var(--cell)), calc(${tokenPos(e).y} * var(--cell)))`,
            }"
            @click.stop="tapEnemy(e)"
          >
            <div
              class="token__inner"
              :class="{
                'is-hit': fx.hitActors.value.has(e.id),
                'is-cast': fx.castActors.value.has(e.id),
                'is-dying': e.hp <= 0 && fx.dyingActors.value.has(e.id),
              }"
              :style="{ transform: tokenOffset(e) }"
            >
              <!-- 다음 의도 — 상시 표시(B3-disp). 공격이면 피해량까지. -->
              <span class="token__intent" :class="`token__intent--${enemyNextIntent(e).kind}`">
                <span class="token__intent-icon">{{ enemyNextIntent(e).icon }}</span><span
                  v-if="enemyNextIntent(e).text"
                  class="token__intent-dmg"
                >{{ enemyNextIntent(e).text }}</span>
              </span>
              <div class="token__circle" :style="{ background: enemyColor(e) }"></div>
              <div class="token__hpbar token__hpbar--enemy"><span :style="{ width: `${hpRatio(e) * 100}%` }"></span></div>
              <!-- HP 숫자 — 상시 표시(B3-disp). 순차 재생 중엔 display hp. -->
              <span class="token__hpnum">{{ tokenHp(e) }}/{{ e.maxHp }}</span>
              <!-- 행동까지 남은 플레이어 행동 수(US-003) — 큐 반영. 1이면 다음 행동에 적이 움직임(경고색). -->
              <span class="token__tempo" :class="{ 'token__tempo--soon': tempoUntilTurnLive(e) <= 1 }" title="이 적이 행동하기까지 남은 내 행동 수">{{ tempoUntilTurnLive(e) }}</span>
              <span
                v-for="f in fx.floats.value.filter((n) => n.actorId === e.id)"
                :key="f.id"
                class="float-num"
                :class="`float-num--${f.kind}`"
                :style="{ '--drift': f.drift }"
              >{{ f.text }}</span>
            </div>
          </div>

          <!-- 아군 토큰(샤유아 분열 등) — 작은 초록 원, 적 추격. -->
          <div
            v-for="a in liveAllies"
            :key="a.id"
            class="token token--ally"
            :style="{
              transform: `translate(calc(${tokenPos(a).x} * var(--cell)), calc(${tokenPos(a).y} * var(--cell)))`,
            }"
          >
            <div
              class="token__inner"
              :class="{
                'is-hit': fx.hitActors.value.has(a.id),
                'is-dying': a.hp <= 0 && fx.dyingActors.value.has(a.id),
              }"
              :style="{ transform: tokenOffset(a) }"
            >
              <div class="token__circle token__circle--ally"></div>
              <div class="token__hpbar"><span :style="{ width: `${hpRatio(a) * 100}%` }"></span></div>
              <span class="token__hpnum">{{ tokenHp(a) }}/{{ a.maxHp }}</span>
              <span
                v-for="f in fx.floats.value.filter((n) => n.actorId === a.id)"
                :key="f.id"
                class="float-num"
                :class="`float-num--${f.kind}`"
                :style="{ '--drift': f.drift }"
              >{{ f.text }}</span>
            </div>
          </div>
        </div>

        <!-- 적 인스펙트 패널 -->
        <aside v-if="inspectedEnemy" class="inspect">
          <header class="inspect__hdr">
            <strong>{{ inspectedEnemy.name ?? '적' }}</strong>
            <button class="inspect__x" @click="inspectedId = null" aria-label="닫기">×</button>
          </header>
          <div class="inspect__hp">HP {{ inspectedEnemy.hp }} / {{ inspectedEnemy.maxHp }}
            <span v-if="inspectedEnemy.block > 0" class="inspect__block">🛡 {{ inspectedEnemy.block }}</span>
          </div>
          <div class="inspect__hp">스피드 {{ inspectedEnemy.tempo ?? 4 }} · 다음 행동까지 {{ tempoUntilTurn(inspectedEnemy) }}수</div>
          <ul v-if="statusEntries(inspectedEnemy).length" class="inspect__statuses">
            <li v-for="s in statusEntries(inspectedEnemy)" :key="s.key">{{ s.label }} ×{{ s.count }}</li>
          </ul>
          <div class="inspect__intent">
            <span class="inspect__intent-lead">다음 턴:</span>
            <ol>
              <li v-for="(a, i) in (inspectedEnemy.intentQueue ?? [])" :key="i">{{ intentText(a, inspectedEnemy) }}</li>
              <li v-if="(inspectedEnemy.intentQueue ?? []).length === 0" class="inspect__intent-none">미정</li>
            </ol>
          </div>
        </aside>

        <!-- 바닥 정보(#1) — idle에서 빈 칸을 탭하면 그 칸 타일 특성(이동/공중이동/공격/관통/설치/시야). -->
        <aside v-if="tileInfoData" class="tileinfo">
          <header class="tileinfo__hdr">
            <strong>{{ tileInfoData.label }}</strong>
            <button class="inspect__x" @click="tileInfo = null" aria-label="닫기">×</button>
          </header>
          <ul class="tileinfo__rows">
            <li
              v-for="r in tileInfoData.rows"
              :key="r.label"
              class="tileinfo__row"
              :class="r.ok ? 'is-ok' : 'is-no'"
            >
              <span class="tileinfo__k">{{ r.label }}</span>
              <span class="tileinfo__v">{{ r.ok ? 'O' : 'X' }}</span>
            </li>
          </ul>
        </aside>
      </section>

      <!-- 계획 큐 (스피드 모델: 마나 한도까지 자유 배치, 실행 시 순서대로 해소). 세로 나열(US-004). -->
      <div class="plan">
        <span class="plan__label">계획 ({{ plan.length }}) · 마나 {{ remainingMana }}/{{ gc.maxMana }}<span v-if="queuedManaCost > 0" class="plan__manaq"> (-{{ queuedManaCost }})</span></span>
        <ul class="plan__slots">
          <li
            v-for="(a, i) in plan"
            :key="`slot-${i}`"
            class="plan__slot plan__slot--filled"
          >
            <span class="plan__num">{{ i + 1 }}</span>
            <span class="plan__txt">{{ planLabel(a) }}</span>
            <button class="plan__x" :disabled="committing" @click="removePlanLine(i)" aria-label="이 줄 취소">×</button>
          </li>
          <li v-if="plan.length === 0" class="plan__slot plan__slot--empty">행동을 배치하거나 [턴 종료]</li>
        </ul>
        <button class="plan__clear" :disabled="plan.length === 0 || committing" @click="clearPlan">비우기</button>
      </div>

      <!-- 행동 바 -->
      <div class="action-bar">
        <button
          class="act"
          :class="{ 'act--on': mode === 'move' }"
          :disabled="committing || planFull || moveQueued"
          :title="moveQueued ? '이동은 한 턴에 한 번' : ''"
          @click="selectMoveMode"
        >이동</button>
        <button
          class="act act--item"
          :class="{ 'act--on': itemPanelOpen }"
          :disabled="committing || planFull || potionLocked || potions.length === 0"
          :title="potions.length === 0 ? '쓸 아이템 없음' : '아이템 · 라운드당 1회'"
          @click="toggleItemPanel"
        >아이템<span v-if="potions.length > 0" class="act__count">{{ potions.length }}</span></button>
        <button
          v-if="swapTargets.length > 0"
          class="act act--swap"
          :class="{ 'act--on': swapPanelOpen }"
          :disabled="committing || planFull || !canSwap"
          title="동료 교대 · 라운드당 1회 (다음 턴 동료 조종)"
          @click="toggleSwapPanel"
        >교대<span class="act__count">{{ swapTargets.length }}</span></button>
        <button
          class="act act--commit"
          :disabled="committing"
          :title="plan.length === 0 ? '행동 없이 턴을 넘긴다(대기 — 손패 보충)' : ''"
          @click="commit"
        >{{ plan.length === 0 ? '턴 종료 →' : '실행 →' }}</button>
      </div>

      <!-- 포션 선택 패널 (아이템 모드) -->
      <div v-if="itemPanelOpen" class="item-panel">
        <span class="item-panel__hint">아이템 · 라운드당 1회</span>
        <ul class="item-panel__list">
          <li v-for="it in potions" :key="it.instanceId ?? it.id">
            <button class="potion" @click="usecPotion(it)">
              <span class="potion__name">{{ it.name }}</span>
              <span class="potion__eff">{{ potionSummary(it) }}</span>
            </button>
          </li>
        </ul>
        <button class="item-panel__close" @click="itemPanelOpen = false">닫기</button>
      </div>

      <!-- 동료 교대 선택 패널 -->
      <div v-if="swapPanelOpen" class="item-panel">
        <span class="item-panel__hint">교대 · 라운드당 1회 (교대 턴은 대기, 다음 턴 동료 조종)</span>
        <ul class="item-panel__list">
          <li v-for="c in swapTargets" :key="c.id">
            <button class="potion" @click="queueSwap(c.id)">
              <span class="potion__name">{{ c.name }}</span>
              <span class="potion__eff">전용 스킬로 1턴 · 낮은 HP</span>
            </button>
          </li>
        </ul>
        <button class="item-panel__close" @click="swapPanelOpen = false">닫기</button>
      </div>

      <!-- 교대 상태 배너 -->
      <div v-if="gc.swap" class="swap-banner" :class="{ 'swap-banner--active': isControllingCompanion }">
        <template v-if="isControllingCompanion">동료 조종 중: {{ gc.player.name }} — 1턴 뒤 복귀</template>
        <template v-else>교대 준비 — 다음 턴 동료 조종</template>
      </div>

      <!-- 카드 조준 확정/취소 (조준 중일 때) — 적 없어도 발동 가능. -->
      <div v-if="mode === 'card'" class="aim-bar">
        <span class="aim-bar__hint">
          <template v-if="aimingCardIsAimed && !aimCell">조준 칸을 고르세요 (사거리 내)</template>
          <template v-else-if="aimingCardIsAimed">조준 완료 — 카드 다시 눌러 확정</template>
          <template v-else-if="aimingCardSelfTarget">제자리 발동 — 카드 다시 눌러 확정</template>
          <template v-else-if="!aimingHasEnemyTarget">빈 칸 발동 — 카드 다시 눌러 확정</template>
          <template v-else>범위 안의 적에 적용 — 카드 다시 눌러 확정</template>
        </span>
        <button class="aim-bar__confirm" @click="confirmCard">확정</button>
        <button class="aim-bar__cancel" @click="cancelAim">취소</button>
      </div>

      <!-- 손패 -->
      <div class="hand-wrap">
        <!-- 카드 상세(US-005) — 손패 카드를 길게 누르면 범위·효과. 누른 채 드래그하면 다른 카드로 전환. -->
        <div v-if="detailCard && detailShape" class="card-detail">
          <div class="card-detail__hdr">
            <span class="card-detail__cost">{{ cardCost(detailCard) }}</span>
            <span class="card-detail__name">{{ detailCard.name }}</span>
          </div>
          <div class="card-detail__body">
            <div class="rangemini" :style="{ gridTemplateColumns: `repeat(${detailShape.w}, 1fr)` }">
              <span
                v-for="(cell, ci) in detailShape.cells"
                :key="ci"
                class="rangemini__cell"
                :class="{ 'is-self': cell.self, 'is-hit': cell.hit, 'is-strong': cell.strong }"
              ></span>
            </div>
            <div class="card-detail__text">
              <span class="card-detail__eff">{{ cardEffectSummary(detailCard) }}</span>
              <span v-if="detailShape.aimed" class="card-detail__aim">원거리 · 사거리 {{ detailShape.aimRange }}</span>
              <span v-else-if="detailShape.throw_" class="card-detail__aim card-detail__aim--throw">투척 · 장애물 앞 정지</span>
            </div>
          </div>
        </div>
        <div
          class="hand"
          :class="{ 'hand--compact': handCompact }"
          @pointermove="onHandPointerMove"
          @pointerup="endCardPress"
          @pointercancel="endCardPress"
          @pointerleave="endCardPress"
        >
          <button
            v-for="c in gc.hand"
            :key="c.instanceId ?? c.id"
            class="card"
            :class="{
              'card--aiming': aimingCardId === c.instanceId,
              'card--queued': c.instanceId && queuedCardIds.has(c.instanceId),
              'card--disabled': !cardPlayable(c) && !(c.instanceId && queuedCardIds.has(c.instanceId)),
              'card--enemy-warn': cardPlayable(c) && cardTriggersEnemy(c),
              'card--detail': detailCardId === c.instanceId,
            }"
            :style="{ borderColor: cardBorder(c) }"
            :disabled="!cardPlayable(c)"
            :data-card-iid="c.instanceId"
            @click="selectCard(c)"
            @pointerdown="onCardPointerDown(c)"
            @mouseenter="onCardHover(c)"
            @mouseleave="onCardLeave(c)"
          >
            <div class="card__top">
              <span class="card__cost">{{ cardCost(c) }}</span>
              <span class="card__name">{{ c.name }}<span v-if="enhanceBadge(c)" class="card__enh">{{ enhanceBadge(c) }}</span></span>
              <span class="card__speed" :class="`card__speed--${castSpeedKey(c)}`">{{ castSpeedLabel(c) }}</span>
            </div>
            <div v-if="!handCompact" class="card__eff">{{ cardEffectSummary(c) }}</div>
            <div v-if="c.instanceId && queuedCardIds.has(c.instanceId)" class="card__queued-tag">계획됨</div>
          </button>
        </div>
        <!-- 하단 플레이어 바(요청) — 턴 · 마나(별) · HP · 덱(합산) · 손패 토글. -->
        <div class="playerbar">
          <span class="playerbar__turn">⚔ 턴 {{ gc.turn }}</span>
          <span class="playerbar__mana" :title="`마나 ${remainingMana} / ${gc.maxMana}`">
            <span
              v-for="i in gc.maxMana"
              :key="i"
              class="mana-pip"
              :class="{ 'mana-pip--on': i <= remainingMana }"
            >✦</span>
          </span>
          <span class="playerbar__hp">HP {{ tokenHp(gc.player) }}/{{ gc.player.maxHp }}<span v-if="tokenBlock(gc.player) > 0" class="topbar__block"> 🛡{{ tokenBlock(gc.player) }}</span></span>
          <span class="playerbar__deck" :title="`드로우 ${gc.drawPile.length} · 버림 ${gc.discardPile.length}`">덱 {{ gc.drawPile.length + gc.discardPile.length }}<span class="playerbar__deck-sub"> ({{ gc.drawPile.length }}/{{ gc.discardPile.length }})</span></span>
          <button class="hand-toggle" @click="handCompact = !handCompact">{{ handCompact ? '효과 보기' : '간략히' }}</button>
        </div>
      </div>
    </main>

    <!-- 승리 화면 -->
    <main v-else-if="phase === 'victory'" class="result result--win">
      <h1>승리</h1>
      <p class="result__note">전장을 정리했다.</p>
      <footer class="result__footer">
        <button class="continue" @click="finishVictory">계속 →</button>
      </footer>
    </main>

    <!-- 패배 화면 -->
    <main v-else class="result result--lose">
      <h1>패배</h1>
      <p class="result__note">이 런은 여기서 끝난다. 메타 진행은 기록된다.</p>
      <footer class="result__footer">
        <button class="continue" @click="returnToEnd">돌아간다 →</button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.grid-combat-root { position: relative; }

.grid-combat {
  display: flex;
  flex-direction: column;
  height: 100vh; height: 100dvh;
  padding: 0.8rem 0.8rem calc(0.8rem + env(safe-area-inset-bottom, 0px));
  gap: 0.5rem;
}

/* === 상단 바 === */
.topbar {
  position: relative;
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
  padding: 0.5rem 0.9rem; background: rgba(0,0,0,0.4); border-radius: 8px;
  color: #b6b6c4; flex-shrink: 0;
}
.topbar__turn { color: #f6e8b8; font-weight: 600; }
/* 마나 별 pips(item 5) — 파란 사각 별. 밝음=보유, 흐림=계획 소비/사용. */
.topbar__mana { display: inline-flex; align-items: center; gap: 0.15rem; }
.mana-pip { color: rgba(106,166,255,0.22); font-size: 1.15rem; line-height: 1; transition: color 140ms ease; }
.mana-pip--on { color: #6aa6ff; text-shadow: 0 0 5px rgba(106,166,255,0.7); }
.topbar__hp { color: #8effb8; }
.topbar__block { color: #8eedff; margin-left: 0.3rem; }
/* 기록 토글(item 4). */
.topbar__logbtn {
  margin-left: auto; padding: 0.2rem 0.6rem; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.78rem;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18); color: #b6b6c4;
}
.topbar__logbtn--on { background: rgba(246,232,184,0.18); border-color: rgba(246,232,184,0.5); color: #f6e8b8; }
.topbar__resolving { color: #ffb88e; font-size: 0.82rem; animation: pulse 900ms ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }

/* 전투 로그 패널(item 4) — 오버레이(레이아웃 안 밀림). 최근 기록 위→아래. */
.combat-log--panel {
  position: absolute; top: calc(100% + 0.3rem); right: 0; z-index: 30;
  width: min(360px, 90vw); max-height: 40vh; overflow-y: auto;
  padding: 0.6rem 0.8rem; border-radius: 8px;
  background: rgba(14, 15, 22, 0.96); border: 1px solid rgba(255,255,255,0.16);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.combat-log__line { color: #d6d6c4; font-size: 0.82rem; line-height: 1.6; }

/* === 상단 적 패널(요청) — 대치 몬스터 행: 이름·HP(빨강)·남은턴(노랑)·의도. 카드 타겟 시 테두리. === */
.enemy-toggle {
  padding: 0.2rem 0.6rem; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.8rem; font-weight: 600;
  background: rgba(255,122,122,0.12); border: 1px solid rgba(255,122,122,0.4); color: #ff9a9a;
}
.enemy-panel { display: flex; flex-direction: column; gap: 0.3rem; flex-shrink: 0; }
.enemy-row {
  display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left;
  padding: 0.3rem 0.5rem; border-radius: 7px; cursor: pointer; font: inherit;
  background: rgba(20,22,32,0.7); border: 2px solid transparent; transition: border-color 120ms ease, box-shadow 120ms ease;
}
.enemy-row:hover { background: rgba(30,33,46,0.85); }
.enemy-row--inspected { background: rgba(40,44,60,0.92); }
/* 임박(다음 행동까지 1수) — 왼쪽 빨간 띠. */
.enemy-row--soon { box-shadow: inset 3px 0 0 #ff7a7a; }
/* 카드가 이 적을 노리는 중(요청) — 노란 테두리. (임박 띠와 함께 보일 수 있음.) */
.enemy-row--targeted { border-color: #ffd86a; box-shadow: 0 0 7px rgba(255,216,106,0.55); }
.enemy-row--targeted.enemy-row--soon { box-shadow: 0 0 7px rgba(255,216,106,0.55), inset 3px 0 0 #ff7a7a; }
.enemy-row__name { font-weight: 700; font-size: 0.86rem; min-width: 4.2em; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* HP 게이지(요청) — 빨강 막대 + 수치(네모 X). */
.ehp { display: inline-flex; align-items: center; gap: 0.35rem; }
.ehp__bar { width: 72px; height: 9px; border-radius: 5px; background: rgba(255,255,255,0.12); overflow: hidden; flex-shrink: 0; }
.ehp__fill { display: block; height: 100%; background: linear-gradient(90deg, #e24a4a, #ff7a6a); border-radius: 5px; transition: width 220ms ease; }
.ehp__num { font-size: 0.78rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #e8e0d4; white-space: nowrap; }
.ehp__sub { opacity: 0.6; font-weight: 600; font-size: 0.7rem; }
.ebox__blk { margin-left: 0.25rem; color: #cfe9ff; font-size: 0.74rem; }
/* 남은 턴 pips(요청) — 대기 턴=주황, 행동 턴(마지막)=빨강. tempo만큼 그리고 카운트다운으로 줄어든다. */
.eturn { display: inline-flex; align-items: center; gap: 2px; }
.eturn__pip { width: 7px; height: 13px; border-radius: 2px; }
.eturn__pip--wait { background: #f0a83c; }
.eturn__pip--act { background: #e24a4a; box-shadow: 0 0 5px rgba(226,74,74,0.7); }
.enemy-row__intent { margin-left: auto; font-size: 0.82rem; color: #d6d6c4; white-space: nowrap; }
.enemy-row__intent--attack { color: #ff9a9a; font-weight: 700; }
.enemy-row__intent--move { color: #9ad6ff; }
.enemy-row__intent--wait { color: #888; }

/* === 하단 플레이어 바(요청) — 턴·마나(별)·HP·덱(합산). === */
.playerbar {
  display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap;
  padding: 0.35rem 0.5rem; color: #b6b6c4; font-size: 0.85rem;
}
.playerbar__turn { color: #f6e8b8; font-weight: 600; }
.playerbar__mana { display: inline-flex; align-items: center; gap: 0.15rem; }
.playerbar__hp { color: #8effb8; font-weight: 600; font-variant-numeric: tabular-nums; }
.playerbar__deck { color: #9a9aa8; font-variant-numeric: tabular-nums; }
.playerbar__deck-sub { color: #6a6a78; font-size: 0.76rem; }

/* === 보스 배너(#4) — 이름·페이즈·큰 HP바 === */
.boss-banner {
  flex-shrink: 0;
  padding: 0.5rem 0.9rem;
  background: linear-gradient(90deg, rgba(255,142,142,0.12), rgba(255,232,142,0.1));
  border: 1px solid rgba(255,232,142,0.4);
  border-radius: 8px;
}
.boss-banner__head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
.boss-banner__name { color: #ffe88e; font-weight: 700; font-size: 1.05rem; }
.boss-banner__phase {
  font-size: 0.78rem; font-weight: 700; color: #ffb88e;
  padding: 0.05rem 0.5rem; border-radius: 10px;
  background: rgba(192,142,255,0.18); border: 1px solid rgba(192,142,255,0.45);
}
.boss-banner__hpbar {
  position: relative; margin-top: 0.35rem; height: 16px; border-radius: 8px;
  background: rgba(0,0,0,0.5); overflow: hidden; border: 1px solid rgba(255,142,142,0.3);
}
.boss-banner__hpfill {
  display: block; height: 100%; background: linear-gradient(90deg, #ff6b6b, #ff8e8e);
  transition: width 160ms ease;
}
.boss-banner__hptext {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.9);
  font-variant-numeric: tabular-nums;
}

/* === 격자 === */
.board-wrap {
  flex: 1; min-height: 0; display: flex; gap: 0.8rem;
  align-items: flex-start; justify-content: center; overflow: auto;
  position: relative;
}
.board {
  /* 보드 그래픽 확대(#1) — 데스크탑 76px(상한 76). 큰 맵이 넘치면 board-wrap이 스크롤. */
  --cell: 76px;
  position: relative;
  display: grid;
  gap: 2px;
  padding: 4px;
  background: rgba(0,0,0,0.25);
  border-radius: 8px;
}
@media (max-width: 640px) { .board { --cell: 58px; } }

.cell {
  width: var(--cell); height: var(--cell);
  box-sizing: border-box;
  position: relative; /* 장판/설치/투척 오버레이(::before, ::after, 자식 absolute) 기준. */
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px;
  font-size: 0.9rem;
  user-select: none;
}
.cell--floor { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.06); }
.cell--item { background: rgba(142,237,255,0.08); border: 1px solid rgba(142,237,255,0.18); }
.cell--spawn { background: rgba(192,142,255,0.07); border: 1px dashed rgba(192,142,255,0.28); }
.cell--wall { background: rgba(60,60,72,0.9); border: 1px solid rgba(0,0,0,0.5); }
.cell--void { background: transparent; pointer-events: none; }
.cell__wall { color: #6a6a7a; }
.cell__item { color: #8eedff; }
.cell__item--gold { color: #f0d56a; }
.cell__spawn { color: rgba(192,142,255,0.5); }
/* 신규 타일(맵 타일 속성) — 구덩이/수풀/난간. */
.cell--pit { background: #0a0a10; }
.cell__pit { color: #2a2a38; font-size: 1.1rem; }
.cell--bush { background: rgba(70,120,70,0.28); }
.cell__bush { color: #6fae6a; }
.cell--fence { background: rgba(150,120,80,0.18); }
.cell__fence { color: #b09a6a; }
/* 투척 방향/타격칸 표시(US-003). */
.cell__throw { position: absolute; color: #ffc089; font-weight: 700; font-size: 0.9rem; text-shadow: 0 0 3px #000; pointer-events: none; }
/* 설치물(2026-06-18) — 효과 장판/함정 글리프. 종류별 색. */
.cell__install { position: absolute; bottom: 1px; right: 1px; font-size: 0.72rem; text-shadow: 0 0 2px #000; pointer-events: none; color: #ddd; }
.cell__install--burn { color: #ff8a4a; }
.cell__install--poison { color: #9ad06a; }
.cell__install--explosion { color: #ff6a5a; }
.cell__install--vulnerable { color: #ffd06a; }
.cell__install--atk-up { color: #ff9a9a; }
.cell__install--def-up { color: #8ec6ff; }
.cell__install--mana-up { color: #c08eff; }
/* 비행 상태 배지(플레이어 토큰). */
.token__air { position: absolute; top: -7px; right: -5px; font-size: 0.85rem; color: #bfe6ff; text-shadow: 0 0 4px #4aa3ff; z-index: 3; pointer-events: none; }

/* 하이라이트 — 이동/조준 칸. ≤0.1초 트랜지션. */
.cell--highlight {
  background: rgba(120,200,255,0.28);
  border: 1px solid rgba(140,220,255,0.8);
  cursor: pointer;
  transition: background 90ms ease, border-color 90ms ease;
}
.cell--highlight:hover { background: rgba(120,200,255,0.42); }
/* 강 칸(US-002) — 1.5× 데미지 칸. 주황으로 일반 칸과 구분. */
.cell--strong {
  background: rgba(255,122,42,0.34);
  border: 1px solid rgba(255,170,90,0.95);
}
.cell--strong:hover { background: rgba(255,122,42,0.48); }
/* 시야 직선(#2) — SVG 연속 선 오버레이(viewBox=칸단위, --cell px와 무관히 토큰 중심에 정렬).
   pointer-events 없음(칸 클릭 통과). DOM상 칸 뒤·토큰 앞이라 z-index 불필요. */
.los-svg { position: absolute; left: 4px; top: 4px; pointer-events: none; overflow: visible; }
.los-svg__line { stroke: rgba(255,236,150,0.95); stroke-width: 0.12; stroke-linecap: round; }
.los-svg__line--blocked { stroke: #ff6a6a; stroke-dasharray: 0.26 0.2; }
/* 차단 칸은 시야를 가린 타일을 빨강으로 강조. */
.cell--los-blocked {
  background: rgba(255,70,70,0.45) !important;
  box-shadow: inset 0 0 0 2px #ff5a5a;
}
/* 적 공격 미리보기(인스펙트). */
.cell--attack-preview {
  background: rgba(255,120,120,0.22);
  border: 1px solid rgba(255,140,140,0.7);
}
.cell--highlight.cell--attack-preview {
  background: rgba(200,160,255,0.3);
}
/* 적 행동 텔레그래프(자동, #적텔레그래프) — 임박 적의 공격 범위(빨강 사선)·이동 목적지(파랑 테두리+화살표). */
.cell--enemy-atk { background: rgba(255,90,90,0.20); box-shadow: inset 0 0 0 2px rgba(255,90,90,0.55); }
.cell--enemy-atk::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: 4px;
  background: repeating-linear-gradient(45deg, transparent 0 5px, rgba(255,90,90,0.30) 5px 7px);
}
.cell--enemy-move { box-shadow: inset 0 0 0 2px rgba(120,180,255,0.75); }
.cell--enemy-move::after {
  content: '»'; position: absolute; top: 0; right: 3px; color: rgba(150,200,255,0.95);
  font-size: 0.78rem; font-weight: 900; pointer-events: none;
}
/* 플레이어 조준 하이라이트가 적 텔레그래프와 겹치면 플레이어 칸을 위로(파랑 덧칠). */
.cell--highlight.cell--enemy-atk, .cell--highlight.cell--enemy-move { background: rgba(120,200,255,0.32); }
/* aimed 조준 중심 칸 — shape 미리보기 중 중심을 노랑 테두리로 강조. */
.cell--aim-center {
  background: rgba(255,224,130,0.34);
  border: 2px solid rgba(255,224,130,0.95);
}

/* === 공격 장판(#4) — 순차 재생 중 *지금 때리는 칸*을 데미지 숫자가 뜰 때까지 강조 + 유형별 애니메이션.
   ::before 사용(텔레그래프의 ::after와 분리). z-index로 토큰(5) 아래·셀 배경 위. pointer-events 없음. */
.cell--strike-melee::before,
.cell--strike-ranged::before,
.cell--strike-throw::before {
  content: ''; position: absolute; inset: 0; border-radius: 4px; pointer-events: none; z-index: 2;
}
/* 근접 — 짧고 강한 충격 플래시(흰→투명) + 베기 결. */
.cell--strike-melee::before {
  background: radial-gradient(circle at 50% 50%, rgba(255,240,200,0.85), rgba(255,150,90,0.35) 60%, transparent 75%);
  box-shadow: inset 0 0 0 2px rgba(255,210,140,0.9);
  animation: strike-melee 400ms ease-out;
}
@keyframes strike-melee {
  0% { opacity: 0; transform: scale(1.25); }
  25% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.96); }
}
/* 원거리 — 직선 결 빔/스윕(세로 결이 쓸고 지나가는 느낌). */
.cell--strike-ranged::before {
  background: linear-gradient(180deg, transparent, rgba(150,210,255,0.8), transparent);
  box-shadow: inset 0 0 0 2px rgba(150,210,255,0.85);
  animation: strike-ranged 400ms ease-out;
}
@keyframes strike-ranged {
  0% { opacity: 0; background-position: 0 -100%; }
  30% { opacity: 1; }
  100% { opacity: 0; background-position: 0 120%; }
}
/* 투척 — 호를 그리며 착탄하는 버스트(중심에서 퍼지는 링). */
.cell--strike-throw::before {
  background: radial-gradient(circle at 50% 50%, rgba(255,200,130,0.9), rgba(255,140,80,0.4) 50%, transparent 72%);
  box-shadow: inset 0 0 0 2px rgba(255,180,110,0.9);
  animation: strike-throw 400ms cubic-bezier(0.2,0.7,0.3,1);
}
@keyframes strike-throw {
  0% { opacity: 0; transform: scale(0.3); }
  40% { opacity: 1; transform: scale(1.12); }
  100% { opacity: 0; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .cell--strike-melee::before, .cell--strike-ranged::before, .cell--strike-throw::before { animation: none; opacity: 0.7; }
}

/* === 전투원 토큰 ===
   wrapper(.token) = *위치 전용*(grid translate + 이동 트랜지션). inner(.token__inner) = *fx 전용*
   (흔들림·발광·페이드·플로팅). 두 레이어의 transform이 충돌하지 않아 공격 중 원점 튐이 없다. */
.token {
  position: absolute;
  left: 4px; top: 4px; /* board padding 보정 */
  width: var(--cell); height: var(--cell);
  pointer-events: none;
  /* 이동 트랜지션(#5) — 0.38초 글라이드(행동당 ≥0.4초 dwell 안에 들어옴). 위치 transform만 여기서 관리. */
  transition: transform 380ms ease;
  z-index: 5;
}
.token__inner {
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  /* 겹침 오프셋(tokenOffset) 변동 시 부드럽게 — 위치 transform(wrapper)과 독립 레이어. */
  transition: transform 120ms ease;
}
@media (prefers-reduced-motion: reduce) { .token__inner { transition: none; } }
.token--enemy { pointer-events: auto; cursor: pointer; }
/* 소멸 중 — 치명타 데미지 숫자가 끝까지 보이도록 짧게 페이드아웃(보너스).
   inner의 opacity만 건드린다(wrapper 위치 transform 불변 → snap 방지). */
.token__inner.is-dying { opacity: 0; transition: opacity 600ms ease; }
.token--enemy:has(.token__inner.is-dying) { pointer-events: none; }
.token__inner.is-dying .token__circle { filter: grayscale(1) brightness(0.6); }
.token__inner.is-dying .token__intent,
.token__inner.is-dying .token__hpnum,
.token__inner.is-dying .token__hpbar { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .token__inner.is-dying { transition: none; } }
.token__circle {
  width: 64%; height: 64%; border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.6);
}
.token__circle--player { background: #5aa6ff; box-shadow: 0 0 6px rgba(90,166,255,0.7); }
/* 아군 토큰 — 작은 초록 원(분열 슬라임). 적보다 작게. */
.token--ally { z-index: 5; pointer-events: none; }
.token--ally .token__circle { width: 50%; height: 50%; }
.token__circle--ally { background: #7fe6a0; box-shadow: 0 0 5px rgba(127,230,160,0.6); }
.token--enemy.is-inspected .token__circle { outline: 2px solid #ffe88e; outline-offset: 1px; }
/* 보스 토큰 — 일반 적보다 크고 금빛 테두리·맥동 글로우. */
.token--boss { z-index: 7; }
.token--boss .token__circle {
  width: 92%; height: 92%;
  border: 2px solid #ffe88e;
  box-shadow: 0 0 10px rgba(255,232,142,0.7);
  animation: boss-pulse 1800ms ease-in-out infinite;
}
@keyframes boss-pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(255,232,142,0.5); }
  50% { box-shadow: 0 0 16px rgba(255,232,142,0.9); }
}
.token--boss .token__hpbar { width: 84%; }
@media (prefers-reduced-motion: reduce) { .token--boss .token__circle { animation: none; } }
.token__hpbar {
  width: 70%; height: 4px; margin-top: 2px; border-radius: 2px;
  background: rgba(0,0,0,0.55); overflow: hidden;
}
.token__hpbar span { display: block; height: 100%; background: #8effb8; transition: width 120ms ease; }
.token__hpbar--enemy span { background: #ff8e8e; }

/* 상시 적 HP 숫자(B3-disp) — 토큰 하단. */
.token__hpnum {
  font-size: 0.66rem; line-height: 1; font-weight: 700;
  color: #ffd2d2; text-shadow: 0 1px 2px rgba(0,0,0,0.9);
  margin-top: 1px; font-variant-numeric: tabular-nums; white-space: nowrap;
  pointer-events: none;
}
@media (max-width: 640px) { .token__hpnum { font-size: 0.58rem; } }

/* 상시 적 다음 의도(B3-disp) — 토큰 상단 작은 배지. */
.token__intent {
  position: absolute;
  top: -10px; left: 50%; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 1px;
  padding: 0 3px; height: 13px; border-radius: 7px;
  background: rgba(10,10,16,0.85); border: 1px solid rgba(255,255,255,0.18);
  font-size: 0.74rem; font-weight: 800; line-height: 1; white-space: nowrap;
  pointer-events: none; z-index: 10;
}
.token__intent-icon { font-size: 0.82rem; }
.token__intent-dmg { color: #ffe2a0; font-variant-numeric: tabular-nums; }
.token__intent--attack { border-color: rgba(255,120,120,0.6); }
.token__intent--attack .token__intent-icon { color: #ff8e8e; }
.token__intent--move { border-color: rgba(120,200,255,0.5); }
.token__intent--move .token__intent-icon { color: #8ec8ff; }
.token__intent--wait .token__intent-icon { color: #888; }

/* 피격 흔들림 — *원(circle)*에 적용. inner는 겹침 오프셋 transform을 쓰므로 충돌 회피.
   wrapper(위치)·inner(겹침오프셋)·circle(흔들림)으로 transform 3층 분리 → 어느 것도 안 덮어씀. */
.token__inner.is-hit .token__circle { animation: token-shake 100ms ease, hit-flash 100ms ease; }
@keyframes token-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
@keyframes hit-flash {
  0% { filter: brightness(2.2); }
  100% { filter: brightness(1); }
}

/* 발동 펄스(#3) — 즉시/버프 카드 등 hit/move 없는 행동의 자기 발동 표시(원에 밝은 링이 퍼졌다 사라짐). */
.token__inner.is-cast .token__circle { animation: cast-pulse 360ms ease-out; }
@keyframes cast-pulse {
  0% { box-shadow: 0 0 0 0 rgba(180,230,255,0.9), 0 0 8px rgba(140,200,255,0.6); filter: brightness(1.6); }
  100% { box-shadow: 0 0 0 14px rgba(180,230,255,0), 0 0 6px rgba(140,200,255,0); filter: brightness(1); }
}
@media (prefers-reduced-motion: reduce) { .token__inner.is-cast .token__circle { animation: none; } }

/* 플로팅 숫자 — 피해/방어/회복. 격자 위에서 한눈에 읽히도록 크게 + 진한 외곽선(item 7 가독성). */
.float-num {
  position: absolute; top: -2px; left: 50%;
  transform: translateX(-50%);
  font-weight: 900; font-size: 1.25rem;
  /* 어떤 배경에서도 읽히는 외곽선(어두운 테두리 4방 + 그림자). */
  text-shadow:
    -1.4px -1.4px 0 #0b0b12, 1.4px -1.4px 0 #0b0b12, -1.4px 1.4px 0 #0b0b12, 1.4px 1.4px 0 #0b0b12,
    0 2px 5px rgba(0,0,0,0.85);
  white-space: nowrap;
  pointer-events: none;
  animation: float-up 850ms ease-out forwards;
  z-index: 20;
}
/* 피해 숫자는 가장 중요 — 한 단계 더 크게. */
.float-num--damage { color: #ff7a7a; font-size: 1.5rem; }
.float-num--blocked { color: #8eedff; }
.float-num--heal { color: #8effb8; }
@keyframes float-up {
  0% { opacity: 0; transform: translate(calc(-50% + (var(--drift) * 14px)), 4px) scale(0.7); }
  20% { opacity: 1; transform: translate(calc(-50% + (var(--drift) * 14px)), -8px) scale(1.1); }
  100% { opacity: 0; transform: translate(calc(-50% + (var(--drift) * 26px)), -38px) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .token { transition: none; }
  .float-num { animation: float-up-reduced 600ms ease-out forwards; }
  .token__inner.is-hit { animation: none; }
  .token__inner.is-hit .token__circle { animation: none; }
}
@keyframes float-up-reduced {
  0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -16px); }
}

/* === 인스펙트 패널 === */
.inspect {
  flex-shrink: 0; width: 200px;
  background: rgba(0,0,0,0.5); border: 1px solid rgba(255,142,142,0.4);
  border-radius: 8px; padding: 0.7rem 0.8rem; color: #d6d6e0;
  align-self: flex-start;
}
.inspect__hdr { display: flex; align-items: center; justify-content: space-between; }
.inspect__hdr strong { color: #ff9a9a; }
.inspect__x { background: none; border: none; color: #888; font-size: 1.2rem; cursor: pointer; line-height: 1; }
.inspect__hp { color: #ff8e8e; font-size: 0.9rem; margin-top: 0.3rem; }
.inspect__block { color: #8eedff; margin-left: 0.3rem; }
.inspect__statuses { list-style: none; padding: 0; margin: 0.4rem 0; display: flex; flex-wrap: wrap; gap: 0.25rem; }
.inspect__statuses li { font-size: 0.72rem; padding: 0.05rem 0.4rem; border-radius: 8px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12); }
.inspect__intent { margin-top: 0.5rem; }
.inspect__intent-lead { color: #ffb88e; font-size: 0.8rem; }
.inspect__intent ol { margin: 0.25rem 0 0; padding-left: 1.1rem; color: #e0d8c0; font-size: 0.82rem; }
.inspect__intent li { margin-bottom: 0.15rem; }
.inspect__intent-none { color: #777; list-style: none; margin-left: -1.1rem; }

/* === 계획 큐 (세로 나열 — US-004) === */
.plan {
  display: flex; flex-direction: column; align-items: stretch; gap: 0.4rem;
  padding: 0.4rem 0.6rem; background: rgba(0,0,0,0.3); border-radius: 8px; flex-shrink: 0; min-width: 132px;
}
.plan__label { color: #c0b693; font-size: 0.82rem; }
.plan__manaq { color: #c08eff; }
.plan__slots { list-style: none; display: flex; flex-direction: column; gap: 0.3rem; padding: 0; margin: 0; }
.plan__slot {
  padding: 0.28rem 0.5rem; border-radius: 6px; font-size: 0.78rem;
  background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.16); color: #888;
  display: flex; align-items: center; gap: 0.4rem; text-align: left;
}
.plan__slot--empty { justify-content: center; text-align: center; }
.plan__num {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 1.1rem; height: 1.1rem; border-radius: 50%; font-size: 0.68rem;
  background: rgba(192,142,255,0.3); color: #f6e8b8;
}
.plan__slot--filled { color: #f6e8b8; background: rgba(192,142,255,0.16); border-style: solid; border-color: rgba(192,142,255,0.5); }
.plan__clear {
  margin-left: auto; padding: 0.25rem 0.6rem; font: inherit; font-size: 0.78rem;
  background: none; border: 1px solid rgba(255,255,255,0.2); color: #b6b6c4; border-radius: 5px; cursor: pointer;
}
.plan__clear:disabled { opacity: 0.35; cursor: not-allowed; }
/* 계획 줄 — 텍스트 + 줄별 취소(×, #3). */
.plan__txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan__x {
  margin-left: auto; flex: none; width: 1.35rem; height: 1.35rem; line-height: 1; cursor: pointer;
  background: rgba(255,90,90,0.16); border: 1px solid rgba(255,90,90,0.42); color: #ffcaca;
  border-radius: 5px; font-weight: 800; font-size: 0.9rem;
}
.plan__x:hover:not(:disabled) { background: rgba(255,90,90,0.34); }
.plan__x:disabled { opacity: 0.35; cursor: not-allowed; }

/* 바닥 정보 패널(#1) — 인스펙트와 같은 톤, 6축 O/X 그리드. */
.tileinfo {
  min-width: 8rem; align-self: flex-start;
  background: rgba(16,17,24,0.96); border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; padding: 0.5rem 0.6rem;
}
.tileinfo__hdr { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem; }
.tileinfo__hdr strong { color: #f6e8b8; font-size: 0.92rem; }
.tileinfo__rows { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.16rem 0.7rem; }
.tileinfo__row { display: flex; align-items: center; justify-content: space-between; font-size: 0.74rem; }
.tileinfo__k { color: #b8b8c8; }
.tileinfo__v { font-weight: 800; font-variant-numeric: tabular-nums; }
.tileinfo__row.is-ok .tileinfo__v { color: #8effb8; }
.tileinfo__row.is-no .tileinfo__v { color: #ff8a8a; }

/* 카드 발동 속도 배지(#6/#7) — 우측 상단. 즉시는 강조색. */
.card__speed {
  margin-left: auto; flex: none; padding: 0.05rem 0.34rem; border-radius: 999px;
  font-size: 0.6rem; font-weight: 800; line-height: 1.3; letter-spacing: 0.02em;
  border: 1px solid rgba(255,255,255,0.22); color: #cfd0db; background: rgba(255,255,255,0.06);
}
.card__speed--fast { color: #8ee6ff; border-color: rgba(142,230,255,0.5); }
.card__speed--slow { color: #ffb38e; border-color: rgba(255,179,142,0.5); }
.card__speed--instant { color: #0d0e14; background: #8effb8; border-color: #8effb8; }

/* 대시(발놀림) 목적지 잔상 화살표(Q3). */
.token--ghost-dash .token__inner { opacity: 0.6; }
.token__dash-arrow {
  position: absolute; top: -0.5rem; left: 50%; transform: translateX(-50%);
  color: #8ec8ff; font-weight: 900; font-size: 0.9rem; text-shadow: 0 1px 2px rgba(0,0,0,0.9); pointer-events: none;
}

/* === 스피드 모델 UI 보강 (US-002/003) === */
.topbar__mana-q { color: #c08eff; font-size: 0.85em; }
/* 이동 후 위치 잔상 토큰 */
.token--ghost { pointer-events: none; opacity: 0.32; z-index: 1; }
.token--ghost .token__circle--player { box-shadow: none; filter: grayscale(0.3); }
.token--ghost::after {
  content: ''; position: absolute; inset: 0; border: 1px dashed rgba(246,232,184,0.5); border-radius: 50%;
}
/* 적 행동까지 남은 행동 수 배지 */
.token__tempo {
  position: absolute; top: -7px; left: -7px; min-width: 1.3rem; height: 1.3rem; padding: 0 3px;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  background: rgba(20,20,28,0.92); border: 1px solid rgba(255,255,255,0.35);
  color: #d8d8e4; font-size: 0.82rem; font-weight: 700; line-height: 1; z-index: 3;
}
.token__tempo--soon { background: #b3402e; border-color: #ff8a6a; color: #fff; }
/* 손패 카드 — 지금 두면 적이 행동하는 타이밍 경고 */
.card--enemy-warn { box-shadow: 0 0 0 2px #ff8a6a, 0 0 8px rgba(255,138,106,0.5); }
.card--detail { outline: 2px solid #8eedff; outline-offset: -2px; }

/* 카드 상세 롱프레스 팝오버(US-005) */
.card-detail {
  position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  z-index: 20; min-width: 180px; max-width: 280px;
  background: #14151d; border: 1px solid rgba(142,237,255,0.5); border-radius: 8px;
  padding: 0.5rem 0.65rem; box-shadow: 0 6px 18px rgba(0,0,0,0.6); pointer-events: none;
}
.card-detail__hdr { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
.card-detail__cost { background: #c08eff; color: #0d0e14; padding: 0.05rem 0.4rem; border-radius: 50%; font-weight: 700; font-size: 0.75rem; }
.card-detail__name { color: #f6e8b8; font-weight: 700; font-size: 0.92rem; }
.card-detail__body { display: flex; align-items: center; gap: 0.6rem; }
.card-detail__text { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.74rem; }
.card-detail__eff { color: #c8c8d4; }
.card-detail__aim { color: #8eedff; }

/* 범위 미니그리드(US-005) — 파랑=내 위치, 빨강=피격 칸 */
.rangemini { display: grid; gap: 2px; flex-shrink: 0; }
.rangemini__cell {
  width: 11px; height: 11px; border-radius: 2px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
}
.rangemini__cell.is-self { background: #6aa6ff; border-color: #9ac4ff; }
.rangemini__cell.is-hit { background: #e06a5a; border-color: #ff9a86; }
.rangemini__cell.is-strong { background: #ff7a2a; border-color: #ffc089; box-shadow: 0 0 3px rgba(255,122,42,0.8); }
.rangemini__cell.is-self.is-hit { background: #b06adf; border-color: #d6a6ff; }
.card-detail__aim--throw { color: #ffc089; }

/* === 행동 바 === */
.action-bar { display: flex; gap: 0.5rem; flex-shrink: 0; }
.act {
  flex: 1; padding: 0.6rem 0.8rem; font: inherit; font-weight: 600;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18);
  color: #d6d6e0; border-radius: 7px; cursor: pointer;
}
.act:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.act:disabled { opacity: 0.38; cursor: not-allowed; }
.act--on { background: rgba(120,200,255,0.24); border-color: rgba(120,200,255,0.7); color: #fff; }
.act--commit { background: rgba(192,142,255,0.22); border-color: rgba(192,142,255,0.6); color: #f6e8b8; }
.act--commit:hover:not(:disabled) { background: rgba(192,142,255,0.34); }
.act--item { position: relative; }
.act--swap { position: relative; background: rgba(255,200,120,0.16); border-color: rgba(255,200,120,0.5); }
.act--swap:hover:not(:disabled) { background: rgba(255,200,120,0.3); }
.act__count {
  margin-left: 0.35rem; font-size: 0.7rem; font-weight: 700;
  background: rgba(142,255,184,0.22); color: #8effb8;
  border-radius: 8px; padding: 0.02rem 0.35rem;
}

/* === 교대 상태 배너 === */
.swap-banner {
  flex-shrink: 0; text-align: center; font-size: 0.82rem; padding: 0.35rem 0.6rem;
  border-radius: 8px; background: rgba(255,200,120,0.14); color: #ffd9a0;
  border: 1px solid rgba(255,200,120,0.4);
}
.swap-banner--active { background: rgba(255,200,120,0.26); color: #ffe9c8; font-weight: 600; }

/* === 포션 선택 패널 === */
.item-panel {
  display: flex; flex-direction: column; gap: 0.4rem; flex-shrink: 0;
  padding: 0.5rem 0.7rem; border-radius: 8px;
  background: rgba(142,255,184,0.08); border: 1px solid rgba(142,255,184,0.35);
}
.item-panel__hint { color: #cfeede; font-size: 0.8rem; }
.item-panel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.potion {
  display: flex; flex-direction: column; gap: 0.1rem; text-align: left;
  padding: 0.4rem 0.6rem; font: inherit; cursor: pointer;
  background: rgba(20,28,24,0.92); border: 1px solid rgba(142,255,184,0.45);
  border-radius: 7px; color: #e6f0e8; min-width: 120px;
}
.potion:hover { background: rgba(142,255,184,0.16); }
.potion__name { color: #b8ffd0; font-weight: 600; font-size: 0.84rem; }
.potion__eff { color: #9ab0a4; font-size: 0.74rem; }
.item-panel__close {
  align-self: flex-start; padding: 0.25rem 0.6rem; font: inherit; font-size: 0.78rem;
  background: none; border: 1px solid rgba(255,255,255,0.2); color: #b6b6c4; border-radius: 5px; cursor: pointer;
}

/* === 활성 유물 칩 === */
.relic-strip {
  display: flex; flex-wrap: wrap; gap: 0.3rem; flex-shrink: 0;
  max-height: 3.2rem; overflow-y: auto; padding: 0.1rem 0;
}
.relic-chip {
  font-size: 0.68rem; line-height: 1; padding: 0.18rem 0.45rem; border-radius: 9px;
  white-space: nowrap; max-width: 9rem; overflow: hidden; text-overflow: ellipsis;
}
.relic-chip--loadout { background: rgba(255,232,142,0.16); border: 1px solid rgba(255,232,142,0.45); color: #f6e8b8; }
.relic-chip--passive { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #b6b6c4; }

/* === 조준 바 === */
.aim-bar {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; flex-shrink: 0;
  padding: 0.4rem 0.8rem; border-radius: 8px;
  background: rgba(120,200,255,0.1); border: 1px solid rgba(120,200,255,0.4);
}
.aim-bar__hint { color: #cfe6ff; font-size: 0.82rem; flex: 1; }
.aim-bar__confirm { padding: 0.4rem 0.9rem; font: inherit; font-weight: 600; border-radius: 6px; cursor: pointer; background: rgba(142,255,184,0.2); border: 1px solid rgba(142,255,184,0.55); color: #d6ffe6; }
.aim-bar__cancel { padding: 0.4rem 0.9rem; font: inherit; border-radius: 6px; cursor: pointer; background: none; border: 1px solid rgba(255,255,255,0.2); color: #b6b6c4; }

/* === 손패 === */
.hand-wrap { flex-shrink: 0; position: relative; }
.hand {
  display: flex; gap: 0.5rem; overflow-x: auto; padding: 0.3rem 0.1rem;
}
.card {
  flex: 0 0 auto; width: 120px; min-height: 78px;
  display: flex; flex-direction: column; gap: 0.25rem;
  padding: 0.5rem 0.6rem; text-align: left; font: inherit; cursor: pointer;
  background: rgba(20,22,32,0.92); border: 2px solid; border-radius: 8px; color: #e6e6f0;
  position: relative;
  transition: transform 100ms ease, box-shadow 100ms ease;
}
.card:hover:not(:disabled) { transform: translateY(-3px); }
.card--aiming { box-shadow: 0 0 0 2px #8eedff, 0 4px 12px rgba(0,0,0,0.5); transform: translateY(-5px); }
.card--queued { opacity: 0.55; }
.card--disabled { opacity: 0.4; cursor: not-allowed; }
.card__top { display: flex; align-items: center; gap: 0.4rem; }
.card__cost { background: #c08eff; color: #0d0e14; min-width: 1.2rem; text-align: center; border-radius: 50%; font-weight: 700; font-size: 0.78rem; padding: 0.05rem; }
.card__name { color: #f6e8b8; font-weight: 600; font-size: 0.85rem; line-height: 1.15; }
.card__enh { color: #8effb8; font-size: 0.72rem; margin-left: 0.2rem; }
.card__eff { color: #a8a8b8; font-size: 0.74rem; line-height: 1.2; }
.card__queued-tag { position: absolute; top: 0.2rem; right: 0.35rem; font-size: 0.62rem; color: #c08eff; }
/* 손패 간략 모드(item 3) — 효과 텍스트 숨김 + 카드 폭 축소로 이름 위주 컴팩트. 효과는 hover/길게누르기/[효과 보기]. */
.hand--compact .card { width: 94px; min-height: 0; }
.piles { display: flex; align-items: center; gap: 1rem; padding: 0.2rem 0.3rem; color: #888; font-size: 0.78rem; }
.hand-toggle {
  margin-left: auto; padding: 0.15rem 0.6rem; border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.74rem;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18); color: #b6b6c4;
}
.hand-toggle:hover { background: rgba(255,255,255,0.12); }

/* === 결과 화면 === */
.result {
  max-width: 600px; margin: 0 auto;
  padding: 4rem 2rem calc(4rem + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; align-items: center; gap: 1.2rem;
  min-height: 100vh; min-height: 100dvh;
}
.result h1 { font-size: 3rem; margin: 0; }
.result--win h1 { color: #8effb8; }
.result--lose h1 { color: #ff8e8e; }
.result__note { color: #888; font-style: italic; }
.result__footer { margin-top: auto; padding-top: 1rem; }
.continue {
  padding: 0.8rem 1.6rem; font: inherit; font-weight: 600; border-radius: 6px; cursor: pointer;
  background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: #f6e8b8;
}
.continue:hover { background: rgba(192,142,255,0.3); }
</style>
