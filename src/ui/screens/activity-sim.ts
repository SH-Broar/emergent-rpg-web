// activity-sim.ts — 채집·활동 시간 시뮬레이션 화면
// travel.ts와 동일한 rAF 기반 진행 바 + 고정 대사 + 가챠 연출

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import { applyTimeTheme } from '../time-theme';

/** 총 실제 연출 시간 (ms) */
const TOTAL_REAL_MS = 4500;
/** 이 비율 시점에 획득 아이템 공개 */
const REVEAL_PCT = 0.62;

export interface ActivitySimConfig {
  icon: string;
  title: string;
  /** 대사 풀 선택 키: activity key 또는 'gather_<locationId>' */
  activityKey: string;
  /** effect 접두사: 'random_loot', 'heal_hp' 등 */
  effectType: string;
  /** 화면에 표시할 획득 결과 텍스트 */
  rewardText: string;
  /** true = 아무것도 얻지 못함 */
  isEmpty: boolean;
}

// ── 대사 풀 ─────────────────────────────────────────────────────

const DIALOGUE_BY_KEY: Record<string, string[]> = {
  // ── 채집 (gather) ─────────────────────
  gather_Lake:             ['낚싯대를 조심스럽게 물에 드리운다.', '잔잔한 수면을 바라보며 기다린다...', '찌가 미세하게 흔들린다.', '숨을 죽이고 기다린다.'],
  gather_Mountain_Path:    ['망치를 들어 바위를 힘껏 두드린다.', '암석 사이에서 광맥이 반짝인다.', '땀이 흘러내리지만 손을 멈추지 않는다.', '조금씩 원하는 것이 모습을 드러낸다.'],
  gather_Herb_Garden:      ['풀숲을 천천히 헤치며 나아간다.', '이슬 맺힌 잎사귀 아래를 들여다본다.', '향기로운 냄새가 코를 간지럽힌다.', '조심스럽게 손을 뻗는다.'],
  gather_Wilderness:       ['야생의 발자국을 따라 나아간다.', '풀숲 사이에서 무언가 반짝인다.', '자연의 숨결이 느껴진다.', '조심스럽게 손을 뻗는다.'],
  gather_Limun_Ruins:      ['무너진 돌탑 사이를 조심스럽게 나아간다.', '고대의 기운이 느껴진다.', '어둠 속에서 뭔가 반짝이는 것이 보인다.', '손을 뻗어 살펴본다.'],
  gather_Bandit_Hideout:   ['조용히 주변을 살핀다.', '뭔가 남겨진 것이 있을 것 같다.', '조심스럽게 뒤진다.'],
  gather_Moonlit_Clearing: ['빈터 주변의 숲길을 천천히 걷는다.', '달빛에 무언가가 은은하게 빛난다.', '조심스럽게 다가간다.'],
  gather_Bloom_Terrace:    ['테라스의 꽃들 사이를 조심스럽게 걷는다.', '향기로운 약초가 눈에 띈다.', '정성껏 채취한다.'],
  gather_Trade_Route:      ['무역로를 따라 대상단의 흔적을 찾는다.', '멀리서 마차 소리가 들린다.', '상인과 눈이 마주쳤다.'],
  gather_Cyan_Dunes:       ['바람에 휩쓸린 모래를 헤쳐나간다.', '황야 깊숙이 발걸음을 옮긴다.', '뭔가 반짝이는 것이 보인다.'],
  gather_Tiklit_Range:     ['험준한 산길을 오른다. 숨이 가빠진다.', '바위 틈에서 희귀한 것이 눈에 띈다.', '조심스럽게 손을 뻗는다.'],

  // ── 활동 — 낚시 ──────────────────────
  fishing:              ['낚싯대를 조심스럽게 물에 드리운다.', '잔잔한 수면을 바라보며 기다린다...', '찌가 미세하게 흔들린다.', '숨을 죽이고 기다린다.'],
  // ── 활동 — 채굴·채집 ─────────────────
  mining:               ['망치를 들어 바위를 힘껏 두드린다.', '암석 사이에서 광맥이 반짝인다.', '땀이 흘러내리지만 손을 멈추지 않는다.', '조금씩 원하는 것이 모습을 드러낸다.'],
  forage:               ['풀숲을 천천히 헤치며 나아간다.', '이슬 맺힌 잎사귀 아래를 들여다본다.', '자연의 숨결이 느껴진다.', '조심스럽게 손을 뻗는다.'],
  mountain_herb:        ['산 중턱을 오르며 약초를 찾는다.', '바위 틈에서 자라는 식물을 발견했다.', '향기로운 냄새가 코를 간지럽힌다.', '조심스럽게 채취한다.'],
  track_monsters:       ['야생의 발자국을 따라 조심스럽게 나아간다.', '나뭇가지가 부러진 흔적이 있다.', '숨을 죽이고 기다린다.', '순간, 움직임이 느껴진다.'],
  clearing_explore:     ['빈터 주변의 숲길을 천천히 걷는다.', '바람에 흔들리는 나뭇잎 소리가 들린다.', '무언가를 찾고 있다는 느낌이 든다.'],
  bloom_herb:           ['테라스의 꽃들 사이를 조심스럽게 걷는다.', '향기로운 약초가 눈에 띈다.', '정성껏 채취한다.'],
  ruin_explore:         ['무너진 돌탑 사이를 조심스럽게 나아간다.', '고대의 기운이 느껴진다.', '어둠 속에서 뭔가 반짝이는 것이 보인다.', '손을 뻗어 살펴본다.'],
  read_inscription:     ['비석의 고대 문자를 천천히 읽어 내려간다.', '오래된 언어가 조금씩 의미를 드러낸다.', '집중하며 해독을 이어간다.', '마침내 뜻이 풀린다...'],
  caravan:              ['무역로를 따라 대상단의 흔적을 찾는다.', '멀리서 마차 소리가 들린다.', '상인과 눈이 마주쳤다.', '흥정이 시작된다.'],
  // ── 활동 — 농사 ──────────────────────
  plant_crop:           ['씨앗을 손에 쥐고 흙을 파낸다.', '정성스럽게 씨앗을 심는다.', '흙을 덮고 물을 뿌린다.', '좋은 수확이 되길 바란다.'],
  harvest_crop:         ['다 자란 작물을 조심스럽게 살펴본다.', '풍성하게 열린 열매를 확인한다.', '하나씩 정성껏 수확한다.'],
  cultivate_herb:       ['땅을 부드럽게 일구며 씨앗을 심는다.', '물을 조심스럽게 뿌린다.', '싹이 올라오기를 기대하며 마음을 담는다.'],
  harvest_herb:         ['가꾼 약초밭을 바라보며 미소 짓는다.', '잎사귀의 색깔과 향을 확인한다.', '조심스럽게 약초를 거두어들인다.'],
  // ── 활동 — 치유·회복 ─────────────────
  heal:                 ['빛의 신전에 조용히 들어선다.', '따뜻한 빛이 몸을 감싸기 시작한다.', '마음이 차분해지며 아픔이 가신다.'],
  bless:                ['신관 앞에 서서 조용히 눈을 감는다.', '신성한 기운이 온몸에 퍼진다.', '마음이 든든해지는 느낌이다.'],
  meditate:             ['샘물 소리를 들으며 조용히 눈을 감는다.', '마음속 잡념이 서서히 사라진다.', '고요함이 온몸에 퍼진다.'],
  moonlit_meditate:     ['달빛 아래에 앉아 숨을 가다듬는다.', '부드러운 달빛이 몸을 감싼다.', '마음이 깨끗해지는 느낌이다.'],
  tavern_rest:          ['편안한 방에 누워 눈을 감는다.', '바깥의 소음이 점점 멀어진다.', '깊은 휴식에 빠져든다.'],
  flower_heal:          ['꽃들 사이를 천천히 걷는다.', '향기로운 꽃향기가 코를 간지럽힌다.', '몸의 긴장이 서서히 풀린다.'],
  admire_silk:          ['천장에서 내려오는 은빛 거미줄을 바라본다.', '섬세한 문양이 빛을 받아 반짝인다.', '마음이 차분해진다.'],
  popi_bread:           ['포피의 빵집에서 따뜻한 냄새가 풍긴다.', '갓 구운 빵을 한 입 베어문다.', '달콤한 맛이 입 안에 퍼진다.'],
  // ── 활동 — 마법·마나 ─────────────────
  learn_magic:          ['마법사의 강의에 집중한다.', '복잡한 마법 공식이 조금씩 이해된다.', '마나가 손끝에서 흐르는 것이 느껴진다.'],
  recharge_mp:          ['마나석을 손에 쥐고 집중한다.', '마석의 빛이 서서히 몸으로 스며든다.', '마력이 충전되는 느낌이다.'],
  // ── 활동 — 제작 ──────────────────────
  craft:                ['재료를 꼼꼼히 점검한다.', '망치질 소리가 울려 퍼진다.', '조금씩 형태가 갖춰진다.', '마지막 손질을 더한다.'],
  upgrade:              ['장비를 살펴보며 강화 계획을 세운다.', '불꽃 속에 장비를 달군다.', '조심스럽게 마무리 작업을 한다.'],
  order_silk:           ['아리엔에게 필요한 것을 설명한다.', '능숙한 손놀림으로 작업이 진행된다.', '아름다운 직물이 완성되어 간다.'],
  // ── 활동 — 정보·소문 ─────────────────
  rumors:               ['주점 구석에 자리를 잡는다.', '여기저기서 이야기 소리가 들린다.', '귀를 기울이며 이야기를 모은다.'],
  check_prices:         ['시장을 천천히 둘러본다.', '상인들의 외침 속에서 가격을 파악한다.', '오늘의 시세가 눈에 들어온다.'],
  // ── 활동 — 기타 ──────────────────────
  buy_guild_card:       ['길드 창구로 다가간다.', '필요한 서류를 작성한다.', '멤버 확인증을 받아 든다.'],
};

/** 이펙트 타입별 폴백 대사 */
const DIALOGUE_BY_EFFECT: Record<string, string[]> = {
  random_loot:   ['주변을 살펴보며 무언가를 찾는다.', '손을 뻗어 탐색한다.', '조심스럽게 확인한다.'],
  give:          ['작업을 시작한다.', '집중하며 진행한다.', '마무리 작업을 한다.'],
  heal_hp:       ['조용히 눈을 감는다.', '따뜻한 기운이 느껴진다.', '몸이 편안해진다.'],
  restore_vigor: ['편안한 자리에 앉는다.', '긴장이 서서히 풀린다.', '기운이 돌아오는 느낌이다.'],
  restore_mp:    ['마음을 가다듬고 집중한다.', '마나의 흐름을 느낀다.', '마력이 차오른다.'],
  start_crop:    ['땅을 살펴보며 준비한다.', '정성을 담아 작업한다.', '기대감이 부풀어 오른다.'],
  buff_attack:   ['몸 상태를 점검한다.', '전의를 불태운다.', '힘이 불끈 솟는다.'],
  buff_defense:  ['마음을 가다듬는다.', '방어 태세를 갖춘다.', '굳건한 의지가 생긴다.'],
  hear_rumor:    ['귀를 기울인다.', '흥미로운 이야기가 들린다.', '정보를 머릿속에 새긴다.'],
  learn_spell:   ['마법진에 집중한다.', '주문이 손끝에서 형태를 갖춰간다.', '새로운 힘이 느껴진다.'],
};

const DIALOGUE_FALLBACK = ['조심스럽게 시작한다.', '집중하며 작업한다.', '마무리를 향해 나아간다.'];

/** 이펙트 타입별 보상 아이콘 */
const REWARD_ICON: Record<string, string> = {
  random_loot:  '✨', give:         '📦', heal_hp:      '💚',
  restore_vigor:'💛', restore_mp:   '💙', start_crop:   '🌱',
  buff_attack:  '⚔️', buff_defense: '🛡️', hear_rumor:  '💬',
  learn_spell:  '✨',
};

function pickDialogue(activityKey: string, effectType: string): string[] {
  return (
    DIALOGUE_BY_KEY[activityKey] ??
    DIALOGUE_BY_EFFECT[effectType] ??
    DIALOGUE_FALLBACK
  );
}

// ── 화면 구현 ────────────────────────────────────────────────────

export function createActivitySimScreen(
  session: GameSession,
  config: ActivitySimConfig,
  onComplete: () => void,
): Screen {
  let startTime = 0;
  let rafHandle: number | null = null;
  let animDone = false;
  let readyToClose = false;
  let revealShown = false;
  let lastLineIdx = -1;

  let barEl:      HTMLElement | null = null;
  let dialogueEl: HTMLElement | null = null;
  let rewardEl:   HTMLElement | null = null;
  let timeEl:     HTMLElement | null = null;

  const lines = pickDialogue(config.activityKey, config.effectType);
  const rewardIcon = REWARD_ICON[config.effectType] ?? '✨';

  function pct(): number {
    if (startTime === 0) return 0;
    return Math.min((Date.now() - startTime) / TOTAL_REAL_MS, 1);
  }

  function completeAnimation() {
    if (animDone) return;
    animDone = true;
    readyToClose = true;
    if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
    applyTimeTheme(session.gameTime);
    if (rewardEl && !rewardEl.querySelector('[data-complete]')) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.dataset.complete = 'true';
      btn.style.minWidth = '160px';
      btn.textContent = '확인 [Enter]';
      btn.addEventListener('click', () => onComplete());
      rewardEl.appendChild(btn);
    }
  }

  function showAllDialogue() {
    if (!dialogueEl) return;
    dialogueEl.innerHTML = '';
    lines.forEach(line => {
      const p = document.createElement('p');
      p.className = 'sim-line';
      p.textContent = line;
      dialogueEl!.appendChild(p);
    });
    lastLineIdx = lines.length - 1;
  }

  function showReward() {
    if (!rewardEl || revealShown) return;
    revealShown = true;

    if (config.isEmpty) {
      rewardEl.innerHTML = `<div class="sim-reward sim-reward-empty">별다른 수확은 없었다...</div>`;
    } else {
      rewardEl.innerHTML = `
        <div class="sim-reward">
          <span class="sim-reward-icon">${rewardIcon}</span>
          <span class="sim-reward-text">${config.rewardText}</span>
        </div>`;
    }

    const el = rewardEl.firstElementChild as HTMLElement | null;
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px) scale(0.85)';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0) scale(1)';
      });
    }
  }

  function skipToEnd() {
    if (readyToClose) {
      onComplete();
      return;
    }
    showAllDialogue();
    showReward();
    if (barEl) barEl.style.width = '100%';
    completeAnimation();
  }

  function rafLoop() {
    if (animDone) return;
    rafHandle = requestAnimationFrame(rafLoop);

    const p = pct();

    if (barEl) barEl.style.width = `${(p * 100).toFixed(2)}%`;
    if (timeEl) timeEl.textContent = session.gameTime.toString();

    // 대사: REVEAL_PCT 이전까지 균등 배분
    if (dialogueEl && lastLineIdx < lines.length - 1) {
      const lineCount = lines.length;
      const step = REVEAL_PCT / lineCount;
      const idx = Math.floor(p / step);
      const clamp = Math.min(idx, lineCount - 1);
      if (clamp > lastLineIdx) {
        for (let i = lastLineIdx + 1; i <= clamp; i++) {
          const span = document.createElement('p');
          span.className = 'sim-line';
          span.textContent = lines[i];
          span.style.opacity = '0';
          span.style.transform = 'translateY(6px)';
          dialogueEl.appendChild(span);
          requestAnimationFrame(() => {
            span.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            span.style.opacity = '1';
            span.style.transform = 'translateY(0)';
          });
          dialogueEl.scrollTop = dialogueEl.scrollHeight;
        }
        lastLineIdx = clamp;
      }
    }

    // 보상 공개
    if (p >= REVEAL_PCT) showReward();

    if (p >= 1) completeAnimation();
  }

  return {
    id: 'activity-sim',

    render(el) {
      el.innerHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column">
          <div class="screen" style="justify-content:space-between;padding:20px 16px;gap:14px">

            <div style="text-align:center">
              <div style="font-size:38px;margin-bottom:6px">${config.icon}</div>
              <h2 style="margin:0 0 4px">${config.title}</h2>
              <p data-time style="color:var(--warning);font-size:13px;margin:0">${session.gameTime.toString()}</p>
              <div style="margin:12px auto 0;max-width:320px">
                <div style="background:var(--bg-card);border-radius:8px;height:8px;overflow:hidden;border:1px solid var(--border)">
                  <div data-bar style="background:var(--accent);height:100%;width:0%;border-radius:8px"></div>
                </div>
              </div>
            </div>

            <div data-dialogue class="sim-dialogue"></div>

            <div data-reward class="sim-reward-area"></div>

            <button class="btn sim-skip-btn" data-skip>건너뛰기 [Enter]</button>
          </div>
        </div>`;

      barEl      = el.querySelector('[data-bar]');
      dialogueEl = el.querySelector('[data-dialogue]');
      rewardEl   = el.querySelector('[data-reward]');
      timeEl     = el.querySelector('[data-time]');

      el.querySelector('[data-skip]')?.addEventListener('click', skipToEnd);
    },

    onEnter() {
      animDone = false;
      readyToClose = false;
      revealShown = false;
      lastLineIdx = -1;
      startTime = Date.now();
      rafLoop();
    },

    onExit() {
      if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
    },

    onKey(key) {
      if (key === 'Enter' || key === ' ' || key === 'Escape') skipToEnd();
    },
  };
}
