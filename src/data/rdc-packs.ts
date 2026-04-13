// rdc-packs.ts — RDC 캐릭터팩 정의 및 해금 로직
// 팩 해금 조건: conditionMembers 캐릭터 전원 히페리온 Lv.5 달성.
// 해금 후 playableNames 캐릭터가 캐릭터 선택 화면에 추가됨.
// NPC 등장 여부(DataPackConfig)와는 완전히 독립된 시스템.

import type { Actor } from '../models/actor';
import { getGlobalSave, unlockRdcPack } from './global-save';

export interface RdcPackDef {
  id: string;
  label: string;
  description: string;
  /** 히페리온 Lv.5 조건 캐릭터 목록 */
  conditionMembers: string[];
  /** 팩 해금 시 플레이어블이 되는 캐릭터 목록 */
  playableNames: string[];
}

export const RDC_PACKS: RdcPackDef[] = [
  {
    id: 'luna',
    label: '루나 마법학교',
    description: '루나의 학생과 교사들',
    conditionMembers: ['크루하', '마로 엔야', '이연', '루핀', '미유'],
    playableNames: ['크루하', '루핀', '미유'],
  },
  {
    id: 'castle',
    label: '마왕성 & 사천왕',
    description: '마왕 모노와 사천왕, 마왕성 주민',
    conditionMembers: ['모노', '임페리시아', '에코', '카시스', '시아', '리무', '리엔카이'],
    playableNames: ['임페리시아', '리엔카이'],
  },
  {
    id: 'manonickla',
    label: '마노니클라',
    description: '마노니클라의 드래곤, 하피, 골렘',
    conditionMembers: ['카요', '시이드', '네토 로크'],
    playableNames: ['카요', '시이드'],
  },
  {
    id: 'halpia',
    label: '할퓌아',
    description: '부유 섬 할퓌아의 천사와 검사',
    conditionMembers: ['리비트', '화이트 팡'],
    playableNames: ['리비트', '화이트 팡'],
  },
  {
    id: 'world',
    label: '세계 탐험자',
    description: '세계 각지의 탐험가와 상인',
    conditionMembers: ['윤희원', '루디', '테오'],
    playableNames: ['윤희원', '루디'],
  },
];

export interface PackProgress {
  pack: RdcPackDef;
  done: number;
  total: number;
  unlocked: boolean;
  active: boolean;
}

/** 팩별 진행도 계산 */
export function getPackProgress(pack: RdcPackDef, actors: Actor[]): { done: number; total: number } {
  const total = pack.conditionMembers.length;
  const done = pack.conditionMembers.filter(name => {
    const actor = actors.find(a => a.name === name);
    return actor ? actor.hyperionLevel >= 5 : false;
  }).length;
  return { done, total };
}

/** 모든 팩의 진행도 + 해금/활성 상태 */
export function getAllPackProgress(actors: Actor[]): PackProgress[] {
  const gs = getGlobalSave();
  return RDC_PACKS.map(pack => {
    const { done, total } = getPackProgress(pack, actors);
    return {
      pack,
      done,
      total,
      unlocked: gs.unlockedRdcPacks.includes(pack.id),
      active: gs.activeRdcPacks.includes(pack.id),
    };
  });
}

/** 조건 달성된 팩을 해금하고 새로 해금된 팩 ID 목록 반환 */
export function checkAndUnlockPacks(actors: Actor[]): string[] {
  const gs = getGlobalSave();
  const newlyUnlocked: string[] = [];
  for (const pack of RDC_PACKS) {
    if (gs.unlockedRdcPacks.includes(pack.id)) continue;
    const { done, total } = getPackProgress(pack, actors);
    if (done >= total) {
      unlockRdcPack(pack.id);
      newlyUnlocked.push(pack.id);
    }
  }
  return newlyUnlocked;
}

/** 현재 활성 팩의 플레이어블 이름 집합 반환 */
export function getActivePackPlayableNames(actors: Actor[]): Set<string> {
  const gs = getGlobalSave();
  const names = new Set<string>();
  for (const pack of RDC_PACKS) {
    if (!gs.activeRdcPacks.includes(pack.id)) continue;
    for (const name of pack.playableNames) {
      if (actors.some(a => a.name === name)) names.add(name);
    }
  }
  return names;
}
