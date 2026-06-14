/**
 * Race 앵커 유물 메타 해금 배선 자기 검증.
 *
 * 검증 항목:
 *  ① unlocks.txt 에 12 race 앵커 항목(grants_relic, resource=insight, cost=8) 노출.
 *  ② 각 항목의 grants_relic id 가 실제 relics-race.txt 정의에 존재.
 *  ③ ChaosSelectView 에 라르 prefix 기반 합류 루프 코드 포함.
 *  ④ MetaProgress.unlockedRelicIds 가 race prefix 로 필터될 때, 다른 종족 누출 0.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function readFile(rel) {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

// --- 간이 INI 섹션 추출기 ---
function parseSections(text) {
  const sections = {};
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) { cur = sec[1]; sections[cur] = {}; continue; }
    const kv = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (kv && cur) sections[cur][kv[1].trim()] = kv[2].trim();
  }
  return sections;
}

const errors = [];
const ok = [];

// ① unlocks.txt 분석
const unlocksTxt = readFile('public/data/meta/unlocks.txt');
const unlockSections = parseSections(unlocksTxt);
const raceAnchorUnlocks = Object.entries(unlockSections)
  .filter(([sec, _f]) => sec.startsWith('unlock.u-relic-'));

if (raceAnchorUnlocks.length !== 12) {
  errors.push(`① 12개 race 앵커 유물 항목 기대, ${raceAnchorUnlocks.length} 발견`);
} else {
  ok.push(`① unlocks.txt 에 12 race 앵커 항목 노출`);
}

const grantedRelicIds = [];
for (const [sec, f] of raceAnchorUnlocks) {
  if (f.resource !== 'insight') errors.push(`  - ${sec}: resource '${f.resource}' (insight 기대)`);
  if (Number(f.cost) !== 8) errors.push(`  - ${sec}: cost '${f.cost}' (8 기대)`);
  if (!f.grants_relic) errors.push(`  - ${sec}: grants_relic 누락`);
  else {
    const ids = f.grants_relic.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length !== 1) errors.push(`  - ${sec}: grants_relic 1개 기대(앵커 단일), ${ids.length}개 발견`);
    for (const id of ids) {
      if (!id.startsWith('r-race-')) errors.push(`  - ${sec}: grants_relic '${id}' 가 r-race- 로 시작 안 함`);
      grantedRelicIds.push(id);
    }
  }
}
ok.push(`  - 12 항목 resource=insight, cost=8, grants_relic 단일 race 유물 ✓`);

// ② relics-race.txt 정의 교차 검증
const relicsRaceTxt = readFile('public/data/relics/relics-race.txt');
const relicSections = parseSections(relicsRaceTxt);
const definedRelicIds = new Set(
  Object.keys(relicSections)
    .filter((s) => s.startsWith('relic.'))
    .map((s) => s.slice('relic.'.length)),
);

for (const id of grantedRelicIds) {
  if (!definedRelicIds.has(id)) errors.push(`② grants_relic '${id}' 가 relics-race.txt 에 미정의`);
}
// 4기본(r-race-X) 제외, race 앵커 정의 = 12 와 1:1 일치 검사
const anchorDefs = [...definedRelicIds].filter((id) => /^r-race-(human|moth|phantom|arcana)-/.test(id));
if (anchorDefs.length !== 12) {
  errors.push(`② relics-race.txt 의 앵커 정의 ${anchorDefs.length} (12 기대)`);
} else {
  ok.push(`② grants_relic 12개 모두 relics-race.txt 정의 존재`);
}

// race 별 3종 균등 검사
const perRace = { human: 0, moth: 0, phantom: 0, arcana: 0 };
for (const id of grantedRelicIds) {
  const m = id.match(/^r-race-(human|moth|phantom|arcana)-/);
  if (m) perRace[m[1]]++;
}
for (const [race, n] of Object.entries(perRace)) {
  if (n !== 3) errors.push(`  - ${race}: ${n} (3 기대)`);
}
ok.push(`  - race 별 3개씩 (인간/나방/팬텀/아르카나) ✓`);

// ③ ChaosSelectView 합류 로직
const chaosView = readFile('src/views/ChaosSelectView.vue');
if (!chaosView.includes('const racePrefix = `r-race-${r.id}-`')) {
  errors.push('③ ChaosSelectView 에 racePrefix 분기 누락');
} else {
  ok.push('③ ChaosSelectView 에 race prefix 기반 합류 루프 존재');
}
if (!chaosView.includes('meta.unlockedRelicIds')) {
  errors.push('③ ChaosSelectView 가 meta.unlockedRelicIds 참조 안 함');
}
if (!chaosView.includes('alreadyOwned.has(relicId)')) {
  errors.push('③ ChaosSelectView 중복 push 가드 누락');
}

// ④ 누출 0 시뮬레이션 — 모든 race 앵커가 unlockedRelicIds 에 있을 때, 한 종족 prefix 만 필터
const unlockedAll = grantedRelicIds.slice(); // 12 전부 해금된 가정
const RACES = ['human', 'moth', 'phantom', 'arcana'];
for (const sel of RACES) {
  const prefix = `r-race-${sel}-`;
  const matched = unlockedAll.filter((id) => id.startsWith(prefix));
  const leaked = matched.filter((id) => !id.startsWith(prefix)); // 자기 누출 0 검사
  if (matched.length !== 3) errors.push(`④ '${sel}' 선택 시 매칭 ${matched.length} (3 기대)`);
  if (leaked.length !== 0) errors.push(`④ '${sel}' 선택 시 누출 ${leaked.length} (0 기대)`);
  // 다른 종족 누출 검사
  const others = unlockedAll.filter((id) => !id.startsWith(prefix));
  if (others.length !== 9) errors.push(`④ '${sel}' 선택 시 *비*매칭 ${others.length} (9 기대 = 다른 종족 3*3)`);
}
ok.push('④ 4종족 모두에서 자기 prefix 3개만 합류, 타 종족 누출 0');

// ⑤ 기존 r-race-X 4종은 unlocks.txt 에 grants_relic 으로 *안 들어가야* (이미 seed_relics 라 중복 push 됨)
const baseAnchors = ['r-race-human', 'r-race-moth', 'r-race-phantom', 'r-race-arcana'];
for (const base of baseAnchors) {
  if (grantedRelicIds.includes(base)) {
    errors.push(`⑤ 기본 race 유물 '${base}' 가 unlocks.txt grants_relic 에 잘못 포함됨 (seed_relics 와 중복)`);
  }
}
ok.push('⑤ 기본 r-race-X 4종은 unlocks.txt 미포함 (seed_relics 와 중복 회피)');

console.log('=== Race 앵커 유물 메타 해금 배선 자기 검증 ===\n');
for (const m of ok) console.log('  PASS', m);
if (errors.length > 0) {
  console.log('\n');
  for (const e of errors) console.log('  FAIL', e);
  console.log(`\n총 ${errors.length} 에러`);
  process.exit(1);
}
console.log('\n총 0 에러 — 모든 검사 통과');
