// difficulty.ts — 난이도 적응 시스템
// 가벼운 슬로우 라이프 판타지에 맞게 플레이어가 힘들 때 자연스럽게 도움을 줍니다.

export enum DifficultyLevel {
  Easy = 0,    // 편안한 여행
  Normal = 1,  // 보통 모험
  Hard = 2,    // 도전적인 모험
}

export interface DifficultyState {
  level: DifficultyLevel;
  consecutiveDeaths: number;
  consecutiveWins: number;
  totalDeaths: number;
  adaptationActive: boolean; // true when auto-adjustment is on
}

export interface DifficultyModifiers {
  enemyHpMod: number;      // multiplier for enemy HP
  enemyAttackMod: number;  // multiplier for enemy attack
  rewardMod: number;       // multiplier for gold/loot rewards
  vigorDrainMod: number;   // multiplier for vigor drain
  hintFrequency: number;   // 0-1 chance of showing quest hints
  shopDiscountMod: number; // multiplier for shop prices (< 1 = discount)
}

// ---------------------------------------------------------------------------
// Base modifiers per difficulty level
// ---------------------------------------------------------------------------

const BASE_MODIFIERS: Record<DifficultyLevel, DifficultyModifiers> = {
  [DifficultyLevel.Easy]: {
    enemyHpMod: 0.7,
    enemyAttackMod: 0.7,
    rewardMod: 1.3,
    vigorDrainMod: 0.8,
    hintFrequency: 0.8,
    shopDiscountMod: 0.9,
  },
  [DifficultyLevel.Normal]: {
    enemyHpMod: 1.0,
    enemyAttackMod: 1.0,
    rewardMod: 1.0,
    vigorDrainMod: 1.0,
    hintFrequency: 0.3,
    shopDiscountMod: 1.0,
  },
  [DifficultyLevel.Hard]: {
    enemyHpMod: 1.3,
    enemyAttackMod: 1.2,
    rewardMod: 0.8,
    vigorDrainMod: 1.2,
    hintFrequency: 0.0,
    shopDiscountMod: 1.1,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createDifficultyState(level: DifficultyLevel = DifficultyLevel.Normal): DifficultyState {
  return {
    level,
    consecutiveDeaths: 0,
    consecutiveWins: 0,
    totalDeaths: 0,
    adaptationActive: true,
  };
}

/**
 * Returns the effective modifiers for the current state.
 * When adaptation is active and the player is struggling, extra leniency is
 * layered on top of Easy modifiers — the player never notices, they just feel
 * like the journey got a little kinder.
 */
export function getModifiers(state: DifficultyState): DifficultyModifiers {
  const base = { ...BASE_MODIFIERS[state.level] };

  if (!state.adaptationActive) return base;

  // After 2 consecutive deaths: silently apply Easy modifiers
  if (state.consecutiveDeaths >= 2) {
    const easy = BASE_MODIFIERS[DifficultyLevel.Easy];
    base.enemyHpMod = Math.min(base.enemyHpMod, easy.enemyHpMod);
    base.enemyAttackMod = Math.min(base.enemyAttackMod, easy.enemyAttackMod);
    base.rewardMod = Math.max(base.rewardMod, easy.rewardMod);
    base.vigorDrainMod = Math.min(base.vigorDrainMod, easy.vigorDrainMod);
    base.hintFrequency = Math.max(base.hintFrequency, easy.hintFrequency);
    base.shopDiscountMod = Math.min(base.shopDiscountMod, easy.shopDiscountMod);
  }

  // After 3 consecutive deaths: reduce enemy HP by an extra 20% on top of Easy
  if (state.consecutiveDeaths >= 3) {
    base.enemyHpMod *= 0.8;
  }

  return base;
}

/**
 * Call after the player dies in combat.
 * Returns the updated state and an optional encouragement message.
 */
export function onCombatDeath(state: DifficultyState): { newState: DifficultyState; message?: string } {
  const newState: DifficultyState = {
    ...state,
    consecutiveDeaths: state.consecutiveDeaths + 1,
    consecutiveWins: 0,
    totalDeaths: state.totalDeaths + 1,
  };

  let message: string | undefined;

  if (newState.consecutiveDeaths === 2) {
    newState.adaptationActive = true;
    message = '여행이 힘들었죠? 조금 쉬어가세요.';
  } else if (newState.consecutiveDeaths >= 3) {
    newState.adaptationActive = true;
    message = '괜찮아요, 천천히 해도 돼요.';
  }

  return { newState, message };
}

/**
 * Call after the player wins a combat.
 * Once 3 consecutive wins occur while adaptation is active, gradually restore
 * the player's chosen difficulty level.
 */
export function onCombatWin(state: DifficultyState): { newState: DifficultyState; message?: string } {
  const newState: DifficultyState = {
    ...state,
    consecutiveWins: state.consecutiveWins + 1,
    consecutiveDeaths: 0,
  };

  let message: string | undefined;

  if (state.adaptationActive && newState.consecutiveWins >= 3) {
    newState.adaptationActive = false;
    // No message — the restoration should be invisible to the player
  }

  return { newState, message };
}

/**
 * Manually set the difficulty level (from settings menu, for example).
 * Resets adaptation counters so the new level takes effect cleanly.
 */
export function setDifficulty(state: DifficultyState, level: DifficultyLevel): DifficultyState {
  return {
    ...state,
    level,
    consecutiveDeaths: 0,
    consecutiveWins: 0,
    adaptationActive: true,
  };
}

// ---------------------------------------------------------------------------
// Hyperion hint system
// ---------------------------------------------------------------------------

/**
 * Returns contextual hints based on accumulated Hyperion level.
 * Higher Hyperion means the player has grown more attuned to the world and
 * naturally notices things others would miss.
 *
 * @param hyperionTotal  Sum of all Hyperion levels (e.g. actor.hyperionLevel)
 * @param playerLocation Current location ID of the player
 * @param activeQuest    The player's active quest object (any shape)
 */
export function getHyperionHints(
  hyperionTotal: number,
  playerLocation: string,
  activeQuest: unknown,
): string[] {
  const hints: string[] = [];

  // Hyperion >= 5: quest direction hints (30% chance per call)
  if (hyperionTotal >= 5 && activeQuest != null && Math.random() < 0.3) {
    const quest = activeQuest as Record<string, unknown>;
    const questName = typeof quest['name'] === 'string' ? quest['name'] : '퀘스트';
    hints.push(`${questName}의 목적지가 어렴풋이 느껴집니다.`);
  }

  // Hyperion >= 10: NPC mood hints (always shown)
  if (hyperionTotal >= 10) {
    hints.push(`주변 사람들의 기분이 느껴집니다. 대화를 나눠보면 좋을 것 같아요.`);
  }

  // Hyperion >= 15: hidden item location hints (20% chance when near relevant location)
  if (hyperionTotal >= 15 && playerLocation && Math.random() < 0.2) {
    hints.push(`${playerLocation} 근처 어딘가에 숨겨진 물건이 있는 것 같은 느낌이 듭니다.`);
  }

  return hints;
}
