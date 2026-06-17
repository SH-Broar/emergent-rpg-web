/**
 * 격자 유물·포션 배선 런타임 스모크 (Vite SSR 트랜스폼).
 *
 * grid-item.ts / grid-relic.ts 는 *훅 주입* 설계라 Pinia 스토어 없이도 핵심 경로를 실행할 수 있다.
 * useRunStore/useDataStore 호출은 try/catch로 감싸 있어 스토어 미초기화 시 안전 폴백한다.
 *
 * 검증:
 *  A. useItemInGrid — heal/combat-block/combat-mana/combat-draw/combat-enemy-status/cleanse-group 가
 *     실제 GridCombatState(player + enemies[])를 변형하는가.
 *  B. activeGridRelics — 로드아웃(전투형만) + 비전투형(상시) 규칙대로 필터되는가.
 *  C. 격자 modifier 게터 — damage-out-add/mul·damage-in-mul·block-out-add·draw/mana/cost 합산이 맞는가.
 */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  OK  ', name); }
  else { fail++; console.log('  FAIL', name); }
}

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const gridItem = await server.ssrLoadModule('/src/systems/grid-item.ts');
  const gridRelic = await server.ssrLoadModule('/src/systems/grid-relic.ts');

  // --- 격자 헬퍼 훅 주입(스토어 없이 동작) ---
  const drawCardsStub = (state, n) => {
    for (let i = 0; i < n && state.hand.length < 10; i++) {
      const c = state.drawPile.pop();
      if (c) state.hand.push(c);
    }
  };
  const gainBlockStub = (state, v) => { if (v > 0) state.player.block += v; };
  const nearestStub = (state) => state.enemies.find((e) => e.hp > 0);
  gridItem.registerGridItemHooks({ gainBlock: gainBlockStub, drawCards: drawCardsStub, nearest: nearestStub });

  // === A. 포션 사용 ===
  const mkState = () => ({
    player: { id: 'player', team: 'player', hp: 20, maxHp: 50, block: 0, statuses: {} },
    enemies: [{ id: 'e0', team: 'enemy', hp: 30, maxHp: 30, block: 0, statuses: {} }],
    mana: 3, maxMana: 3,
    hand: [], drawPile: [{ id: 'c1' }, { id: 'c2' }], discardPile: [],
    loadout: [],
  });

  const sHeal = mkState();
  gridItem.useItemInGrid(sHeal, { id: 'i-heal', combat: true, effects: [{ kind: 'heal', value: 12 }] });
  check('A1 heal → player.hp 20→32', sHeal.player.hp === 32);

  const sBlock = mkState();
  gridItem.useItemInGrid(sBlock, { id: 'i-blk', combat: true, effects: [{ kind: 'combat-block', value: 8 }] });
  check('A2 combat-block → player.block 0→8', sBlock.player.block === 8);

  const sMana = mkState();
  gridItem.useItemInGrid(sMana, { id: 'i-mana', combat: true, effects: [{ kind: 'combat-mana', value: 2 }] });
  check('A3 combat-mana → mana 3→5', sMana.mana === 5);

  const sDraw = mkState();
  gridItem.useItemInGrid(sDraw, { id: 'i-draw', combat: true, effects: [{ kind: 'combat-draw', value: 2 }] });
  check('A4 combat-draw → hand 0→2', sDraw.hand.length === 2);

  const sEnemy = mkState();
  gridItem.useItemInGrid(sEnemy, { id: 'i-vuln', combat: true, effects: [{ kind: 'combat-enemy-status', param: 'vulnerable', value: 2 }] });
  check('A5 combat-enemy-status → nearest enemy vulnerable=2', sEnemy.enemies[0].statuses.vulnerable === 2);

  const sCleanse = mkState();
  sCleanse.player.statuses = { weakness: 2, poison: 3, possession: 1 };
  gridItem.useItemInGrid(sCleanse, { id: 'i-clean', combat: true, effects: [{ kind: 'cleanse-group', param: 'low' }] });
  check('A6 cleanse-group low → weakness/poison 제거, possession 유지',
    sCleanse.player.statuses.weakness === undefined &&
    sCleanse.player.statuses.poison === undefined &&
    sCleanse.player.statuses.possession === 1);

  // === B. activeGridRelics 로드아웃 규칙 ===
  // combatType=true 유물은 loadout에 들어야 활성. 비전투형(passive)은 상시.
  // useRunStore 미초기화 → activeGridRelics는 state.loadout 폴백 경로(catch)로 loadout만 반환.
  const combatRelic = { id: 'rc', trigger: 'on-combat-start', combatType: true, effects: [] };
  const stateWithLoadout = { loadout: [combatRelic], enemies: [], player: { statuses: {} } };
  const active = gridRelic.activeGridRelics(stateWithLoadout);
  check('B1 activeGridRelics — loadout 유물 포함', active.some((r) => r.id === 'rc'));

  // === C. modifier 게터(활성 유물 합산) — 스토어 폴백 경로에선 loadout만 본다. ===
  const dmgRelic = { id: 'rd', trigger: 'passive', combatType: true, effects: [{ kind: 'damage-out-add', value: 4 }, { kind: 'damage-out-mul', value: 1.5 }] };
  const inRelic = { id: 'ri', trigger: 'passive', combatType: true, effects: [{ kind: 'damage-in-mul', value: 1.3 }] };
  const blkRelic = { id: 'rb', trigger: 'passive', combatType: true, effects: [{ kind: 'block-out-add', value: 3 }] };
  const costRelic = { id: 'rco', trigger: 'passive', combatType: true, effects: [{ kind: 'cost-mod-add', value: -1 }] };
  const drawRelic = { id: 'rdr', trigger: 'passive', combatType: true, effects: [{ kind: 'draw-extra-add', value: 2 }, { kind: 'mana-extra-add', value: 1 }] };
  const st = { loadout: [dmgRelic, inRelic, blkRelic, costRelic, drawRelic], enemies: [], player: { statuses: {} } };

  check('C1 gridDamageAdd = 4', gridRelic.gridDamageAdd(st) === 4);
  check('C2 gridDamageMul = 1.5', gridRelic.gridDamageMul(st) === 1.5);
  check('C3 applyDamageRelicMods(10) = round((10+4)*1.5)=21', gridRelic.applyDamageRelicMods(st, 10) === 21);
  check('C4 gridDamageInMul = 1.3', gridRelic.gridDamageInMul(st) === 1.3);
  check('C5 gridBlockAdd = 3', gridRelic.gridBlockAdd(st) === 3);
  check('C6 gridCostMod = -1', gridRelic.gridCostMod(st) === -1);
  check('C7 gridDrawExtra = 2', gridRelic.gridDrawExtra(st) === 2);
  check('C8 gridManaExtra = 1', gridRelic.gridManaExtra(st) === 1);

  // bonus-damage alias → damage-out-add 정규화.
  const aliasRelic = { id: 'ral', trigger: 'passive', combatType: true, effects: [{ kind: 'bonus-damage', value: 5 }] };
  const stAlias = { loadout: [aliasRelic], enemies: [], player: { statuses: {} } };
  check('C9 bonus-damage alias → gridDamageAdd = 5', gridRelic.gridDamageAdd(stAlias) === 5);

  // === D. 유물 트리거 격자 적용(grid-relic 훅 주입) ===
  gridRelic.registerGridRelicHooks({
    gainBlock: gainBlockStub,
    drawCards: drawCardsStub,
    dealNearest: (state, v) => { const t = nearestStub(state); if (t) t.hp = Math.max(0, t.hp - v); },
    nearest: nearestStub,
  });

  // D1 전투 시작 방어(combat-start-block) → player.block 증가.
  const dStart = mkState();
  dStart.loadout = [{ id: 'rcs', trigger: 'on-combat-start', combatType: true, effects: [{ kind: 'combat-start-block', value: 5 }] }];
  gridRelic.gridRelicCombatStart(dStart);
  check('D1 combat-start-block:5 → player.block 0→5', dStart.player.block === 5);

  // D2 전투 시작 힘(combat-start-status) → player.statuses.strength.
  const dStr = mkState();
  dStr.loadout = [{ id: 'rss', trigger: 'on-combat-start', combatType: true, effects: [{ kind: 'combat-start-status', value: 2, params: { arg: 'strength' } }] }];
  gridRelic.gridRelicCombatStart(dStr);
  check('D2 combat-start-status strength:2 → strength=2', dStr.player.statuses.strength === 2);

  // D3 턴 시작 방어(turn-start-block) → player.block.
  const dTurn = mkState();
  dTurn.turn = 2;
  dTurn.loadout = [{ id: 'rtb', trigger: 'on-turn-start', combatType: true, effects: [{ kind: 'turn-start-block', value: 4 }] }];
  gridRelic.gridRelicTurnStart(dTurn);
  check('D3 turn-start-block:4 → player.block 0→4', dTurn.player.block === 4);

  // D4 피격 반응 반격(retaliate) → 가장 가까운 적 hp 감소.
  const dRet = mkState();
  dRet.loadout = [{ id: 'rret', trigger: 'on-damage-taken', combatType: true, effects: [{ kind: 'retaliate', value: 6 }] }];
  gridRelic.gridRelicOnDamageTaken(dRet);
  check('D4 retaliate:6 → nearest enemy hp 30→24', dRet.enemies[0].hp === 24);

  // D5 로드아웃에 없는 전투형 유물은 발동 안 함(로드아웃 규칙).
  const dExcluded = mkState();
  dExcluded.loadout = []; // 빈 로드아웃 → activeGridRelics 폴백은 loadout(빈)만 → 발동 0.
  gridRelic.gridRelicCombatStart(dExcluded);
  check('D5 빈 로드아웃 → combat-start 발동 0(block 0 유지)', dExcluded.player.block === 0);
} finally {
  await server.close();
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
