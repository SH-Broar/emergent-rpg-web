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

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
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
  swappableCompanions,
} from '@/systems/grid-combat';
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
/** aimed(원거리 조준) 카드의 현재 선택 조준 칸. null이면 아직 조준 칸 미선택(후보 하이라이트 단계). */
const aimCell = ref<GridPos | null>(null);
/** 커밋(라운드 해소) 진행 중 — 입력 잠금. */
const committing = ref(false);
/** 인스펙트 중인 적 id(원 탭). */
const inspectedId = ref<string | null>(null);
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
const foresight = computed(() => gc.value?.foresight ?? 1);
const plan = computed<PlannedAction[]>(() => gc.value?.playerPlan ?? []);
const planFull = computed(() => plan.value.length >= foresight.value);

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

/** 현재 모드에 따른 하이라이트 칸 집합(키 'x,y'). */
const highlightTiles = computed<Set<string>>(() => {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return new Set();
  if (mode.value === 'move') {
    return new Set(reachableTiles(state, state.player).map(posKey));
  }
  if (mode.value === 'card' && aimingCardId.value) {
    const card = state.hand.find((c) => c.instanceId === aimingCardId.value);
    if (!card) return new Set();
    if (isAimedCard(card)) {
      // aimed: 조준 칸 미선택이면 *후보 칸*(사거리 내), 선택 후면 *shape 미리보기*(조준 칸 중심).
      if (!aimCell.value) return new Set(aimableTiles(state, card).map(posKey));
      const off = { dx: aimCell.value.x - state.player.pos.x, dy: aimCell.value.y - state.player.pos.y };
      return new Set(previewCardTiles(state, card, undefined, off).map(posKey));
    }
    return new Set(previewCardTiles(state, card).map(posKey));
  }
  return new Set();
});

/** aimed 조준 칸 자체(중심 표시용 — shape 미리보기와 구분). */
function isAimCenter(x: number, y: number): boolean {
  return !!aimCell.value && aimCell.value.x === x && aimCell.value.y === y;
}

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

// === 적 종족색 (그래픽 최소 — 종족별 톤만 다르게, 폴백 빨강) ===
const SPECIES_COLOR: Record<string, string> = {
  vial: '#9ad6ff', sprite: '#b6ff9a', emberling: '#ff9a5a', otter: '#7fd0c0',
  grimoire: '#c9a6ff', mushroom: '#e6d08e', crab: '#ff8e8e', gemling: '#8eeaff',
  windfae: '#bfe6ff', gargoyle: '#9aa0b0', cat: '#d8b48e', shade: '#8a8aa0',
  raccoon: '#b0a890', squirrel: '#d0a878', orc: '#8eb87a', diropel: '#c0b0e0',
  spirit: '#a8e0ff', wraith: '#b09ad0', golem: '#a89878', arachne: '#c08eaa',
  lamia: '#9ad0a0', slime: '#9ee0c0', fox: '#ffb86c', dragon: '#ff9a6c',
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

/** 그 칸에 itemDrop 마커가 있는가. */
function hasItemDrop(x: number, y: number): boolean {
  return (stage.value?.itemDrops ?? []).some((d) => d.pos.x === x && d.pos.y === y);
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

/** 이미 큐에 든 카드 인스턴스 id 집합(중복 표시·비활성). */
const queuedCardIds = computed<Set<string>>(() => {
  const s = new Set<string>();
  for (const a of plan.value) if (a.kind === 'card') s.add(a.cardInstanceId);
  return s;
});

/** 손패 카드가 지금 사용(큐잉) 가능한가. */
function cardPlayable(c: Card): boolean {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return false;
  if (planFull.value) return false;
  if (!c.instanceId || queuedCardIds.value.has(c.instanceId)) return false;
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

/** 핸드 카드 탭 — 조준 모드 진입(이미 조준 중인 같은 카드면 해제). */
function selectCard(c: Card) {
  if (committing.value || planFull.value) return;
  if (!c.instanceId || !cardPlayable(c)) return;
  inspectedId.value = null;
  itemPanelOpen.value = false;
  swapPanelOpen.value = false;
  if (mode.value === 'card' && aimingCardId.value === c.instanceId) {
    mode.value = 'idle';
    aimingCardId.value = null;
    aimCell.value = null;
    return;
  }
  mode.value = 'card';
  aimingCardId.value = c.instanceId;
  aimCell.value = null;
  if (isAimedCard(c)) ui.toast('info', '사거리 안의 조준 칸을 고르세요.');
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
      const within = aimableTiles(state, card).some((p) => p.x === x && p.y === y);
      if (within) aimCell.value = { x, y };
      return;
    }
    // 고정 패턴 — 하이라이트 칸 탭 시 그 카드 확정(어느 칸을 눌러도 패턴 전체 적용).
    if (!isHighlighted(x, y)) return;
    confirmCard();
    return;
  }

  // idle — 적 칸이면 인스펙트 토글.
  const occupant = combatantAt(state, pos);
  if (occupant && occupant.team === 'enemy') {
    inspectedId.value = inspectedId.value === occupant.id ? null : occupant.id;
  } else {
    inspectedId.value = null;
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
  let aimOffset: GridOffset | undefined;
  if (isAimedCard(card)) {
    if (!aimCell.value) { ui.toast('info', '조준할 칸을 먼저 고르세요.'); return; }
    aimOffset = { dx: aimCell.value.x - state.player.pos.x, dy: aimCell.value.y - state.player.pos.y };
  }
  const targetTiles = previewCardTiles(state, card, undefined, aimOffset);
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

/** [실행/커밋] — 한 라운드 해소 후 fx 애니 재생 + 승패 전이. */
function commit() {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return;
  if (plan.value.length === 0) {
    ui.toast('info', '행동을 고르거나 [대기].');
    return;
  }
  doCommit();
}

/** [대기] — *대기 행동*을 플랜에 한 슬롯 추가(커밋 X). 라운드 커밋은 [실행]만. */
function waitRound() {
  const state = gc.value;
  if (!state || committing.value || phase.value !== 'combat') return;
  if (planFull.value) return;
  inspectedId.value = null;
  itemPanelOpen.value = false;
  swapPanelOpen.value = false;
  mode.value = 'idle';
  aimingCardId.value = null;
  if (!queuePlayerAction(state, { kind: 'wait' })) {
    ui.toast('info', '대기를 추가할 수 없다.');
  } else {
    ui.toast('info', '대기 — 손패를 다시 채운다.');
  }
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
        <div class="topbar__turn">⚔ 턴 {{ gc.turn }}</div>
        <div class="topbar__mana">마나 {{ gc.mana }} / {{ gc.maxMana }}</div>
        <div class="topbar__hp">HP {{ tokenHp(gc.player) }} / {{ gc.player.maxHp }}
          <span v-if="tokenBlock(gc.player) > 0" class="topbar__block">🛡 {{ tokenBlock(gc.player) }}</span>
        </div>
        <div v-if="committing" class="topbar__resolving">해소 중…</div>
      </header>
      <div v-if="(gc.log?.length ?? 0) > 0" class="combat-log">
        {{ gc.log![gc.log!.length - 1] }}
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
        >
          <template v-for="y in gridRows" :key="`row-${y}`">
            <template v-for="x in gridCols" :key="`cell-${x}-${y}`">
              <!-- void는 빈칸(렌더 X) → 비직사각 자연 처리. 좌표는 0-기준이라 -1 보정. -->
              <div
                v-if="cellRendered(x - 1, y - 1)"
                class="cell"
                :class="[
                  `cell--${cellType(x - 1, y - 1)}`,
                  {
                    'cell--highlight': isHighlighted(x - 1, y - 1),
                    'cell--attack-preview': isAttackPreview(x - 1, y - 1),
                    'cell--aim-center': isAimCenter(x - 1, y - 1),
                  },
                ]"
                :style="{ 'grid-column': x, 'grid-row': y }"
                @click="tapTile(x - 1, y - 1)"
              >
                <span v-if="cellType(x - 1, y - 1) === 'wall'" class="cell__wall">▦</span>
                <span v-else-if="hasItemDrop(x - 1, y - 1)" class="cell__item">✦</span>
                <span v-else-if="cellType(x - 1, y - 1) === 'spawn'" class="cell__spawn">·</span>
              </div>
              <!-- void는 자리를 차지하되 투명(grid 정렬 유지). -->
              <div
                v-else
                class="cell cell--void"
                :style="{ 'grid-column': x, 'grid-row': y }"
              ></div>
            </template>
          </template>

          <!-- 전투원 토큰 — *위치*는 wrapper(.token)의 transform, *fx*(흔들림·페이드·플로팅)는
               inner(.token__inner)에서 처리한다. 두 transform을 분리해 공격 중 원점(0,0) 튐을 막는다. -->
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
              :class="{ 'is-hit': fx.hitActors.value.has('player') }"
              :style="{ transform: tokenOffset(gc.player) }"
            >
              <div class="token__circle token__circle--player"></div>
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
          <ul v-if="statusEntries(inspectedEnemy).length" class="inspect__statuses">
            <li v-for="s in statusEntries(inspectedEnemy)" :key="s.key">{{ s.label }} ×{{ s.count }}</li>
          </ul>
          <div class="inspect__intent">
            <span class="inspect__intent-lead">다음 {{ foresight }}수:</span>
            <ol>
              <li v-for="(a, i) in (inspectedEnemy.intentQueue ?? [])" :key="i">{{ intentText(a, inspectedEnemy) }}</li>
              <li v-if="(inspectedEnemy.intentQueue ?? []).length === 0" class="inspect__intent-none">미정</li>
            </ol>
          </div>
        </aside>
      </section>

      <!-- 계획 시야 큐 (foresight) -->
      <div class="plan">
        <span class="plan__label">계획 ({{ plan.length }}/{{ foresight }})</span>
        <ul class="plan__slots">
          <li
            v-for="i in foresight"
            :key="`slot-${i}`"
            class="plan__slot"
            :class="{ 'plan__slot--filled': !!plan[i - 1] }"
          >
            <template v-if="plan[i - 1]">{{ planLabel(plan[i - 1]) }}</template>
            <template v-else>—</template>
          </li>
        </ul>
        <button class="plan__clear" :disabled="plan.length === 0 || committing" @click="clearPlan">비우기</button>
      </div>

      <!-- 행동 바 -->
      <div class="action-bar">
        <button
          class="act"
          :class="{ 'act--on': mode === 'move' }"
          :disabled="committing || planFull"
          @click="selectMoveMode"
        >이동</button>
        <button class="act act--wait" :disabled="committing || planFull" @click="waitRound">대기</button>
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
          :disabled="committing || plan.length === 0"
          @click="commit"
        >실행 →</button>
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
          <template v-else-if="aimingCardIsAimed">조준 완료 — [확정]</template>
          <template v-else-if="aimingCardSelfTarget">제자리 발동</template>
          <template v-else-if="!aimingHasEnemyTarget">빈 칸 발동</template>
          <template v-else>범위 안의 적에 적용</template>
        </span>
        <button class="aim-bar__confirm" @click="confirmCard">확정</button>
        <button class="aim-bar__cancel" @click="cancelAim">취소</button>
      </div>

      <!-- 손패 -->
      <div class="hand-wrap">
        <div class="hand">
          <button
            v-for="c in gc.hand"
            :key="c.instanceId ?? c.id"
            class="card"
            :class="{
              'card--aiming': aimingCardId === c.instanceId,
              'card--queued': c.instanceId && queuedCardIds.has(c.instanceId),
              'card--disabled': !cardPlayable(c) && !(c.instanceId && queuedCardIds.has(c.instanceId)),
            }"
            :style="{ borderColor: cardBorder(c) }"
            :disabled="!cardPlayable(c)"
            @click="selectCard(c)"
          >
            <div class="card__top">
              <span class="card__cost">{{ cardCost(c) }}</span>
              <span class="card__name">{{ c.name }}<span v-if="enhanceBadge(c)" class="card__enh">{{ enhanceBadge(c) }}</span></span>
            </div>
            <div class="card__eff">{{ cardEffectSummary(c) }}</div>
            <div v-if="c.instanceId && queuedCardIds.has(c.instanceId)" class="card__queued-tag">계획됨</div>
          </button>
        </div>
        <div class="piles">
          <span>드로우 {{ gc.drawPile.length }}</span>
          <span>버림 {{ gc.discardPile.length }}</span>
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
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
  padding: 0.5rem 0.9rem; background: rgba(0,0,0,0.4); border-radius: 8px;
  color: #b6b6c4; flex-shrink: 0;
}
.topbar__turn { color: #f6e8b8; font-weight: 600; }
.topbar__mana { color: #c08eff; font-weight: 600; }
.topbar__hp { color: #8effb8; }
.topbar__block { color: #8eedff; margin-left: 0.3rem; }
.topbar__resolving { margin-left: auto; color: #ffb88e; font-size: 0.82rem; animation: pulse 900ms ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }

.combat-log {
  text-align: center; color: #e2dcc4; font-size: 0.82rem; min-height: 1.1rem; flex-shrink: 0;
}

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
  --cell: 48px;
  position: relative;
  display: grid;
  gap: 2px;
  padding: 4px;
  background: rgba(0,0,0,0.25);
  border-radius: 8px;
}
@media (max-width: 640px) { .board { --cell: 38px; } }

.cell {
  width: var(--cell); height: var(--cell);
  box-sizing: border-box;
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
.cell__spawn { color: rgba(192,142,255,0.5); }

/* 하이라이트 — 이동/조준 칸. ≤0.1초 트랜지션. */
.cell--highlight {
  background: rgba(120,200,255,0.28);
  border: 1px solid rgba(140,220,255,0.8);
  cursor: pointer;
  transition: background 90ms ease, border-color 90ms ease;
}
.cell--highlight:hover { background: rgba(120,200,255,0.42); }
/* 적 공격 미리보기(인스펙트). */
.cell--attack-preview {
  background: rgba(255,120,120,0.22);
  border: 1px solid rgba(255,140,140,0.7);
}
.cell--highlight.cell--attack-preview {
  background: rgba(200,160,255,0.3);
}
/* aimed 조준 중심 칸 — shape 미리보기 중 중심을 노랑 테두리로 강조. */
.cell--aim-center {
  background: rgba(255,224,130,0.34);
  border: 2px solid rgba(255,224,130,0.95);
}

/* === 전투원 토큰 ===
   wrapper(.token) = *위치 전용*(grid translate + 이동 트랜지션). inner(.token__inner) = *fx 전용*
   (흔들림·발광·페이드·플로팅). 두 레이어의 transform이 충돌하지 않아 공격 중 원점 튐이 없다. */
.token {
  position: absolute;
  left: 4px; top: 4px; /* board padding 보정 */
  width: var(--cell); height: var(--cell);
  pointer-events: none;
  /* 이동 트랜지션 — ≤0.1초(D11). 위치 transform만 여기서 관리. */
  transition: transform 100ms ease;
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
  font-size: 0.56rem; line-height: 1; font-weight: 700;
  color: #ffd2d2; text-shadow: 0 1px 2px rgba(0,0,0,0.9);
  margin-top: 1px; font-variant-numeric: tabular-nums; white-space: nowrap;
  pointer-events: none;
}
@media (max-width: 640px) { .token__hpnum { font-size: 0.5rem; } }

/* 상시 적 다음 의도(B3-disp) — 토큰 상단 작은 배지. */
.token__intent {
  position: absolute;
  top: -7px; left: 50%; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 1px;
  padding: 0 3px; height: 13px; border-radius: 7px;
  background: rgba(10,10,16,0.85); border: 1px solid rgba(255,255,255,0.18);
  font-size: 0.58rem; font-weight: 800; line-height: 1; white-space: nowrap;
  pointer-events: none; z-index: 10;
}
.token__intent-icon { font-size: 0.6rem; }
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

/* 플로팅 숫자 */
.float-num {
  position: absolute; top: -2px; left: 50%;
  transform: translateX(-50%);
  font-weight: 800; font-size: 1rem;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8); white-space: nowrap;
  pointer-events: none;
  animation: float-up 850ms ease-out forwards;
  z-index: 20;
}
.float-num--damage { color: #ff6b6b; }
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

/* === 계획 큐 === */
.plan {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  padding: 0.4rem 0.8rem; background: rgba(0,0,0,0.3); border-radius: 8px; flex-shrink: 0;
}
.plan__label { color: #c0b693; font-size: 0.82rem; }
.plan__slots { list-style: none; display: flex; gap: 0.4rem; padding: 0; margin: 0; flex-wrap: wrap; }
.plan__slot {
  min-width: 90px; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.78rem;
  background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.16); color: #888; text-align: center;
}
.plan__slot--filled { color: #f6e8b8; background: rgba(192,142,255,0.16); border-style: solid; border-color: rgba(192,142,255,0.5); }
.plan__clear {
  margin-left: auto; padding: 0.25rem 0.6rem; font: inherit; font-size: 0.78rem;
  background: none; border: 1px solid rgba(255,255,255,0.2); color: #b6b6c4; border-radius: 5px; cursor: pointer;
}
.plan__clear:disabled { opacity: 0.35; cursor: not-allowed; }

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
.hand-wrap { flex-shrink: 0; }
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
.piles { display: flex; gap: 1rem; padding: 0.2rem 0.3rem; color: #888; font-size: 0.78rem; }

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
