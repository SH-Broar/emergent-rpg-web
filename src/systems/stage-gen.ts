/**
 * 절차적 격자 스테이지 생성 (격자 전투).
 *
 * 데이터 파일 없이 *인코드 아키타입*으로 GridStage를 만든다(결정론 — 같은 seed면 같은 결과).
 * 아키타입:
 *  - 'open'  : 직사각 개방 + 약간의 wall.
 *  - 'cross' : 비직사각 십자(모서리를 void로 제거 — D8 비정사각 검증용).
 *
 * tier(권역 깊이 1~4)로 크기·적 수·foresight·증원 스케줄을 파라미터화.
 * foresight 기본 2~3(tier1·2=2, tier3=3), tier4=4(속도 고난이도). 1은 특수전 한정(일반 tier 미사용).
 */

import type { CellType, GridPos, GridStage, StageSpawn } from '@/data/schemas';

// ============================================================================
// 결정론 PRNG (전역 rng와 분리 — 스테이지 생성은 seed로 독립 재현).
// ============================================================================

/** xmur3 해시 — 문자열/숫자 seed → 32bit 정수 시드. */
function hashSeed(seed: number | string): number {
  const str = typeof seed === 'number' ? seed.toString(36) : seed;
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

/** mulberry32 — 빠른 결정론 PRNG. */
function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 결정론 적 ID 선택 — 권역 풀에서 count마리를 섞어 뽑는다(다종 적 그룹, US-002).
 *  - 슬롯 0 = lead(노드 테마 적, 있으면) → 노드 정체성 보존.
 *  - 나머지 = 풀에서 시드 기반 무작위(중복 허용 — 같은 종 2마리도 가능하나 풀이 다양하면 섞임).
 *  - 풀이 비면 lead만으로 채움(기존 단일 종 폴백). lead·풀 모두 없으면 빈 배열.
 * 같은 seed면 같은 결과(전역 rng와 분리 — 노드 재진입 시 동일 구성).
 */
export function pickEnemyIds(
  seed: number | string,
  pool: string[],
  lead: string | undefined,
  count: number,
): string[] {
  const effective = pool.length > 0 ? pool : (lead ? [lead] : []);
  if (effective.length === 0 || count <= 0) return [];
  const rand = mulberry32(hashSeed(`${seed}|enemies`));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0 && lead) { out.push(lead); continue; } // 테마 적 1마리 보장.
    out.push(effective[Math.floor(rand() * effective.length)]);
  }
  return out;
}

// ============================================================================
// tier 파라미터
// ============================================================================

interface TierParams {
  width: number;
  height: number;
  enemyCount: number;
  foresight: number;
  wallChance: number;
  /** atTurn 증원 1마리 등장 turn(0=없음). */
  reinforceTurn: number;
  /** whenEmpty 증원 마리 수. */
  emptySpawns: number;
}

function tierParams(tier: number): TierParams {
  const t = Math.max(1, Math.min(4, tier || 1));
  switch (t) {
    case 1:
      return { width: 5, height: 5, enemyCount: 2, foresight: 2, wallChance: 0.05, reinforceTurn: 0, emptySpawns: 0 };
    case 2:
      return { width: 6, height: 6, enemyCount: 3, foresight: 2, wallChance: 0.08, reinforceTurn: 0, emptySpawns: 0 };
    case 3:
      return { width: 7, height: 7, enemyCount: 3, foresight: 3, wallChance: 0.10, reinforceTurn: 3, emptySpawns: 0 };
    case 4:
    default:
      return { width: 8, height: 8, enemyCount: 4, foresight: 4, wallChance: 0.12, reinforceTurn: 3, emptySpawns: 1 };
  }
}

// ============================================================================
// 격자 빌더
// ============================================================================

/** 빈 floor 격자. */
function emptyGrid(w: number, h: number): CellType[][] {
  const cells: CellType[][] = [];
  for (let y = 0; y < h; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < w; x++) row.push('floor');
    cells.push(row);
  }
  return cells;
}

/** cross 아키타입 — 모서리 사분면을 void로 제거(비정사각 십자). */
function carveCross(cells: CellType[][], w: number, h: number): void {
  // 십자 팔 두께 — 중앙 행/열 주변.
  const armX = Math.max(1, Math.floor(w / 3));
  const armY = Math.max(1, Math.floor(h / 3));
  const cxLo = Math.floor((w - armX) / 2);
  const cxHi = cxLo + armX - 1;
  const cyLo = Math.floor((h - armY) / 2);
  const cyHi = cyLo + armY - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inVertArm = x >= cxLo && x <= cxHi;
      const inHorizArm = y >= cyLo && y <= cyHi;
      if (!inVertArm && !inHorizArm) cells[y][x] = 'void';
    }
  }
}

/** 통행 가능(floor/item/spawn) 칸 목록. */
function walkableCells(cells: CellType[][]): GridPos[] {
  const out: GridPos[] = [];
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      const t = cells[y][x];
      if (t === 'floor' || t === 'item' || t === 'spawn') out.push({ x, y });
    }
  }
  return out;
}

/** BFS 도달 칸 수 — 연결성 검증(D8). start에서 통행 가능 칸으로 갈 수 있는 칸 집합. */
function reachableCount(cells: CellType[][], start: GridPos): number {
  const h = cells.length;
  const w = cells[0]?.length ?? 0;
  const key = (p: GridPos) => p.y * w + p.x;
  const seen = new Set<number>([key(start)]);
  const queue: GridPos[] = [start];
  const dirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];
  let count = 1;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of dirs) {
      const p = { x: cur.x + d.dx, y: cur.y + d.dy };
      if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
      const t = cells[p.y][p.x];
      if (t !== 'floor' && t !== 'item' && t !== 'spawn') continue;
      if (seen.has(key(p))) continue;
      seen.add(key(p));
      count += 1;
      queue.push(p);
    }
  }
  return count;
}

// ============================================================================
// 공개 API
// ============================================================================

/**
 * 권역/tier로 결정론 격자 스테이지 생성.
 * @param seed   문자열/숫자 시드(같으면 같은 결과).
 * @param region 권역 id(아키타입 선택 다양화에 섞임).
 * @param tier   권역 깊이 1~4.
 */
export function generateStage(seed: number | string, region: string, tier: number): GridStage {
  const rand = mulberry32(hashSeed(`${seed}|${region}|${tier}`));
  const p = tierParams(tier);
  const { width, height } = p;

  // 아키타입 선택 — tier 1~2는 open 위주, tier 3+는 cross 가능.
  const archetype: 'open' | 'cross' = tier >= 3 && rand() < 0.45 ? 'cross' : 'open';

  let cells = emptyGrid(width, height);
  if (archetype === 'cross') {
    carveCross(cells, width, height);
  }

  // open: 약간의 wall 흩뿌리기(가장자리 제외 — 입구 봉쇄 방지).
  if (archetype === 'open') {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (rand() < p.wallChance) cells[y][x] = 'wall';
      }
    }
  }

  // 플레이어 시작 — 좌하단 근처 통행 칸.
  const playerStart = pickStartCorner(cells, width, height, 'player', rand);

  // 연결성 검증 — 시작에서 도달 못 하는 wall 군집이 너무 많으면 wall 제거(재시도 대신 보정).
  ensureConnectivity(cells, playerStart);

  // 적 시작 — 우상단 영역의 통행 칸 enemyCount개(플레이어와 거리 우선).
  const enemyStarts = pickEnemyStarts(cells, playerStart, p.enemyCount, rand);

  // 아이템 드롭 — tier 3+ 1칸(통행 빈 칸에 item 셀 + itemDrops). 아이템 id는 권역 보상 시스템이
  // 채우는 게 정석이지만 슬라이스에선 비워 둔다(엔진은 itemDrops 좌표만 소비).
  const itemDrops: GridStage['itemDrops'] = [];

  // 증원 — spawn 셀 후보 마킹 + StageSpawn 규칙. enemyId는 호출자(스토어)가 권역 풀로 채우거나
  // 슬라이스에선 첫 적 정의 id를 재사용한다(아래 stageSpawns에 placeholder 없이 좌표만).
  const spawns = buildSpawns(cells, playerStart, enemyStarts, p, rand);

  return {
    id: `stage-${region}-t${tier}-${hashSeed(`${seed}|${region}|${tier}`).toString(36)}`,
    width,
    height,
    cells,
    playerStart,
    enemyStarts,
    itemDrops,
    spawns: spawns.length > 0 ? spawns : undefined,
    foresight: p.foresight,
  };
}

/** 모서리(player=좌하단 / enemy=우상단) 근처 통행 칸. */
function pickStartCorner(
  cells: CellType[][],
  w: number,
  h: number,
  who: 'player' | 'enemy',
  rand: () => number,
): GridPos {
  const targetX = who === 'player' ? 0 : w - 1;
  const targetY = who === 'player' ? h - 1 : 0;
  const walk = walkableCells(cells);
  if (walk.length === 0) {
    // 극단 — 강제로 한 칸 floor화.
    cells[targetY][targetX] = 'floor';
    return { x: targetX, y: targetY };
  }
  // 모서리에서 가장 가까운 통행 칸.
  walk.sort(
    (a, b) =>
      (Math.abs(a.x - targetX) + Math.abs(a.y - targetY)) -
      (Math.abs(b.x - targetX) + Math.abs(b.y - targetY)),
  );
  // 동률 후보 중 결정론적 약간의 변주.
  const ties = walk.filter(
    (c) =>
      Math.abs(c.x - targetX) + Math.abs(c.y - targetY) ===
      Math.abs(walk[0].x - targetX) + Math.abs(walk[0].y - targetY),
  );
  return ties[Math.floor(rand() * ties.length)] ?? walk[0];
}

/** 플레이어에서 가장 먼 통행 칸 count개를 적 시작으로(서로 겹치지 않게). */
function pickEnemyStarts(
  cells: CellType[][],
  playerStart: GridPos,
  count: number,
  rand: () => number,
): GridPos[] {
  const walk = walkableCells(cells).filter(
    (c) => !(c.x === playerStart.x && c.y === playerStart.y),
  );
  // 플레이어에서 먼 순.
  walk.sort(
    (a, b) =>
      (Math.abs(b.x - playerStart.x) + Math.abs(b.y - playerStart.y)) -
      (Math.abs(a.x - playerStart.x) + Math.abs(a.y - playerStart.y)),
  );
  const out: GridPos[] = [];
  const used = new Set<string>();
  // 상위 후보군에서 약간 분산해 뽑기(결정론).
  const pool = walk.slice(0, Math.max(count, Math.min(walk.length, count * 3)));
  while (out.length < count && pool.length > 0) {
    const idx = Math.floor(rand() * pool.length);
    const c = pool.splice(idx, 1)[0];
    const k = `${c.x},${c.y}`;
    if (used.has(k)) continue;
    used.add(k);
    out.push(c);
  }
  // 부족하면 남은 통행 칸으로 채움.
  for (const c of walk) {
    if (out.length >= count) break;
    const k = `${c.x},${c.y}`;
    if (!used.has(k)) {
      used.add(k);
      out.push(c);
    }
  }
  return out;
}

/** 증원 — spawn 셀 마킹 + StageSpawn 규칙. enemyId는 placeholder(''), 스토어가 권역 풀로 치환. */
function buildSpawns(
  cells: CellType[][],
  playerStart: GridPos,
  enemyStarts: GridPos[],
  p: TierParams,
  rand: () => number,
): StageSpawn[] {
  const spawns: StageSpawn[] = [];
  if (p.reinforceTurn <= 0 && p.emptySpawns <= 0) return spawns;

  // spawn 후보 칸 — 플레이어·적 시작과 겹치지 않는 통행 칸.
  const occupied = new Set<string>([
    `${playerStart.x},${playerStart.y}`,
    ...enemyStarts.map((e) => `${e.x},${e.y}`),
  ]);
  const candidates = walkableCells(cells).filter((c) => !occupied.has(`${c.x},${c.y}`));

  const pickSpawnCell = (): GridPos | undefined => {
    if (candidates.length === 0) return undefined;
    const idx = Math.floor(rand() * candidates.length);
    const c = candidates[idx];
    cells[c.y][c.x] = 'spawn';
    return c;
  };

  if (p.reinforceTurn > 0) {
    const at = pickSpawnCell();
    spawns.push({ atTurn: p.reinforceTurn, enemyId: '', at });
  }
  for (let i = 0; i < p.emptySpawns; i++) {
    const at = pickSpawnCell();
    spawns.push({ whenEmpty: true, enemyId: '', at });
  }
  return spawns;
}

/**
 * 연결성 보정 — 시작에서 도달 못 하는 통행 칸이 절반 이상이면 내부 wall을 일부 floor화.
 * (open 아키타입에서 wall이 우연히 통로를 끊는 경우 방지.)
 */
function ensureConnectivity(cells: CellType[][], start: GridPos): void {
  const totalWalk = walkableCells(cells).length;
  if (totalWalk === 0) return;
  let reach = reachableCount(cells, start);
  // 도달 칸이 전체의 60% 미만이면 wall을 하나씩 floor로 바꿔 가며 재검사(최대 몇 회).
  let guard = 0;
  while (reach < totalWalk * 0.6 && guard < 30) {
    guard += 1;
    let changed = false;
    for (let y = 0; y < cells.length && !changed; y++) {
      for (let x = 0; x < cells[y].length && !changed; x++) {
        if (cells[y][x] === 'wall') {
          cells[y][x] = 'floor';
          changed = true;
        }
      }
    }
    if (!changed) break;
    reach = reachableCount(cells, start);
  }
}
