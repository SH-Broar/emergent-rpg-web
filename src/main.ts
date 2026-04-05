import './styles/global.css';
import { loadAllData } from './data/loader';
import { initAll } from './data/data-init';
import { seedRNG } from './types/rng';
import { ScreenManager } from './ui/screen-manager';
import { InputHandler } from './ui/input-handler';
import { GameSession } from './systems/game-session';
import { processTurn } from './systems/game-loop';
import { createMainMenuScreen } from './ui/screens/main-menu';
import { createCharacterSelectScreen } from './ui/screens/character-select';
import { createGameScreen, createInfoScreen, createMoveScreen } from './ui/screens/game-screen';
import { createDialogueScreen } from './ui/screens/dialogue';
import { createDungeonScreen } from './ui/screens/dungeon';
import { createTradeScreen } from './ui/screens/trade';
import { createQuestBoardScreen } from './ui/screens/quest-board';
import { createBacklogScreen } from './ui/screens/backlog';
import { createLevelUpScreen } from './ui/screens/level-up';
import { createBirthScreen, createCustomCharScreen } from './ui/screens/character-creation';
import { createActivityScreen } from './ui/screens/activity';
import { createGiftScreen } from './ui/screens/gift';
import { createEatScreen } from './ui/screens/eat';
import { createEncyclopediaScreen } from './ui/screens/encyclopedia';
import { createHomeScreen } from './ui/screens/home';
import { createHyperionScreen } from './ui/screens/hyperion';
import { createTitlesScreen } from './ui/screens/titles';
import { createPartyScreen } from './ui/screens/party';
import { createSaveLoadScreen, saveToSlot, loadFromSlot } from './ui/screens/save-load';
import { createWorldMapScreen } from './ui/screens/world-map';
import { createSkillManageScreen } from './ui/screens/skill-manage';
import { createDataPackScreen } from './ui/screens/datapack-select';
import { fastForwardWorld } from './systems/world-simulation';
import { seasonName } from './types/enums';
import { CoreMatrix, PlayerKnowledge } from './models/knowledge';

const app = document.getElementById('app')!;

async function boot() {
  app.innerHTML = '<div class="screen menu-screen"><p>데이터 로딩 중...</p></div>';
  seedRNG(Date.now());

  const data = await loadAllData();
  const initResult = initAll(data);

  const session = new GameSession();
  session.actors = initResult.actors;
  session.world = initResult.world;
  session.events = initResult.events;
  session.dungeonSystem = initResult.dungeonSystem;
  session.activitySystem = initResult.activitySystem;
  session.world.seasonSchedule.init(1);
  session.world.updateWeatherAndTemp();

  const sm = new ScreenManager(app);
  const input = new InputHandler(sm);

  // 오토세이브 존재 여부 확인 (동적으로 매번 재평가)
  function checkHasAutosave(): boolean {
    return localStorage.getItem('emergent_save_0') !== null;
  }

  // --- 주민 수 지정 ---
  function showPopulationSelect(afterDone: () => void) {
    sm.push({
      id: 'population',
      render(el) {
        const totalNpcs = session.actors.filter(a => !a.playable).length;
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center">
            <h2>마을 인구 밀도</h2>
            <p style="text-align:center;color:var(--text-dim)">NPC가 얼마나 활동할지 결정합니다.</p>
            <div class="menu-buttons" style="margin-top:12px">
              <button class="btn" data-pop="low">한적함 — NPC ${Math.floor(totalNpcs * 0.3)}명 활성</button>
              <button class="btn btn-primary" data-pop="normal">보통 — NPC ${Math.floor(totalNpcs * 0.6)}명 활성</button>
              <button class="btn" data-pop="high">붐빔 — NPC ${totalNpcs}명 전부 활성</button>
            </div>
            <p class="hint">1=한적함, 2=보통, 3=붐빔</p>
          </div>`;
        el.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach(btn => {
          btn.addEventListener('click', () => {
            const pop = btn.dataset.pop!;
            const ratio = pop === 'low' ? 0.3 : pop === 'normal' ? 0.6 : 1.0;
            // 비플레이어블 NPC 중 일부만 활성 위치에 배치
            const npcs = session.actors.filter(a => !a.playable);
            const activeCount = Math.floor(npcs.length * ratio);
            npcs.forEach((npc, i) => {
              if (i >= activeCount) {
                npc.stationary = true; // 비활성 NPC는 고정
              }
            });
            sm.pop();
            afterDone();
          });
        });
      },
      onKey(key) {
        const c = document.querySelector('.info-screen')?.parentElement;
        if (!(c instanceof HTMLElement)) return;
        if (key === '1' || key === '2' || key === '3') {
          const btn = c.querySelector(`[data-pop="${key === '1' ? 'low' : key === '2' ? 'normal' : 'high'}"]`) as HTMLButtonElement | null;
          btn?.click();
        }
      },
    });
  }

  // --- 배경 스토리 화면 → 게임 시작 ---
  function showBackgroundThenGame() {
    const p = session.player;
    const bg = p.background;
    if (bg) {
      const lines = bg.split('|').map((l: string) => l.trim()).filter((l: string) => l);
      sm.push({
        id: 'background',
        render(el) {
          el.innerHTML = `
            <div class="screen info-screen" style="justify-content:center;text-align:center">
              <h2>${p.name}</h2>
              <div class="text-display" style="text-align:left;line-height:1.8">
                ${lines.map((l: string) => `<p>${l}</p>`).join('')}
              </div>
              <button class="btn btn-primary" data-start>시작하기 [Enter]</button>
              <p class="hint">Enter 또는 터치로 계속</p>
            </div>`;
          el.querySelector('[data-start]')?.addEventListener('click', () => { sm.pop(); enterGame(); });
        },
        onKey(key) { if (key === 'Enter' || key === ' ') { sm.pop(); enterGame(); } },
      });
    } else {
      enterGame();
    }
  }

  function autosave() {
    if (session.isValid) saveToSlot(0, session);
  }

  function enterGame() {
    session.knowledge.addKnownName(session.player.name);
    session.knowledge.trackVisit(session.player.currentLocation);
    // Give starter items
    const starterItems = ['wheat_bread', 'wheat_bread', 'wheat_bread', 'fresh_water', 'fresh_water', 'common_herb'];
    for (const id of starterItems) {
      session.player.addItemById(id, 1);
      session.knowledge.discoverItem(id);
    }
    session.backlog.add(session.gameTime, `${session.player.name}의 이야기가 시작된다.`, '시스템');
    autosave();
    showGame();
  }

  // --- 게임 메인 화면 ---
  function showGame() {
    sm.replace(createGameScreen(session, (target) => {
      switch (target) {
        case 'move':
          sm.push(createMoveScreen(session, () => sm.pop()));
          break;
        case 'talk':
          sm.push(createDialogueScreen(session, {
            onTalk() { /* backlog에 이미 기록됨 */ },
            onRecruit(npcName) {
              session.knowledge.recruitCompanion(npcName);
              session.backlog.add(session.gameTime, `${npcName}이(가) 동료가 되었다!`, '행동');
              sm.pop();
            },
            onInfo() {
              sm.push(createInfoScreen(session, 'info_status', () => sm.pop()));
            },
            onBack() { sm.pop(); },
          }));
          break;
        case 'eat':
          sm.push(createEatScreen(session, (_statusMsg) => { sm.pop(); }));
          break;
        case 'trade':
          sm.push(createTradeScreen(session, () => { session.gameTime.advance(15); sm.pop(); }));
          break;
        case 'dungeon':
          sm.push(createDungeonScreen(session, () => sm.pop()));
          break;
        case 'quest':
          sm.push(createQuestBoardScreen(session, () => sm.pop()));
          break;
        case 'activity':
          sm.push(createActivityScreen(session, () => sm.pop()));
          break;
        case 'gift':
          sm.push(createGiftScreen(session, () => sm.pop()));
          break;
        case 'home':
          sm.push(createHomeScreen(session, () => sm.pop()));
          break;
        case 'memory_spring':
          // 기억의 샘 — 간소화 버전
          sm.push(createInfoScreen(session, 'info_status', () => sm.pop()));
          break;
        case 'info_backlog':
          sm.push(createBacklogScreen(session, () => sm.pop()));
          break;
        case 'info_hyperion':
          sm.push(createHyperionScreen(session, () => sm.pop()));
          break;
        case 'info_party':
          sm.push(createPartyScreen(session, () => sm.pop()));
          break;
        case 'info_titles':
          sm.push(createTitlesScreen(session, () => sm.pop()));
          break;
        case 'info_map':
          sm.push(createWorldMapScreen(session, () => sm.pop()));
          break;
        case 'info_encyclopedia':
          sm.push(createEncyclopediaScreen(session, () => sm.pop()));
          break;
        case 'info_skills':
          sm.push(createSkillManageScreen(session, () => sm.pop()));
          break;
        case 'save':
          sm.push(createSaveLoadScreen(session, true, () => sm.pop()));
          break;
        case 'level_up':
          sm.push(createLevelUpScreen(session, () => sm.pop()));
          break;
        default:
          if (target.startsWith('info_')) {
            sm.push(createInfoScreen(session, target, () => sm.pop()));
          }
          break;
      }
    }, autosave));
    input.setIdleCallback(() => {
      processTurn(session, 'idle');
      autosave();
      sm.render();
    }, 10000);
  }

  // --- 새 게임: 이전 캐릭터 NPC화 선택 후 캐릭터 생성으로 이동 ---
  function proceedToCharCreate() {
    // 플레이어별 상태 초기화 (세계는 유지)
    session.backlog.clear();
    session.knowledge = new PlayerKnowledge();
    session.playerIdx = -1;

    sm.replace(createCharacterSelectScreen(
      session.actors,
      (idx) => { session.playerIdx = idx; showPopulationSelect(() => showBackgroundThenGame()); },
      () => {
        // 탄생
        sm.push(createBirthScreen(session.actors, (idx) => {
          session.playerIdx = idx;
          enterGame();
        }, () => sm.pop()));
      },
      () => {
        // 커스텀
        sm.push(createCustomCharScreen(session.actors, (idx) => {
          session.playerIdx = idx;
          enterGame();
        }, () => sm.pop()));
      },
      () => showMainMenu(),
    ));
  }

  // --- 캐릭터 선택 (새 게임 진입점) ---
  function showCharSelect() {
    const currentPlayer = session.isValid ? session.player : null;

    if (currentPlayer && currentPlayer.isCustom) {
      // 커스텀 캐릭터 → NPC화 여부 묻기
      sm.push({
        id: 'npc-choice',
        render(el) {
          el.innerHTML = `
            <div class="screen info-screen" style="justify-content:center;text-align:center">
              <h2>새로운 시작</h2>
              <p>${currentPlayer.name}을(를) 이 세계의 주민으로 남기시겠습니까?</p>
              <p class="hint">NPC로 남기면 이 세계에서 계속 살아갑니다.</p>
              <div class="menu-buttons" style="margin-top:16px">
                <button class="btn btn-primary" data-choice="npc">1. 주민으로 남긴다</button>
                <button class="btn" data-choice="remove">2. 떠나보낸다</button>
              </div>
              <p class="hint">1=주민으로, 2=떠나보내기, Esc=취소</p>
            </div>`;
          el.querySelector('[data-choice="npc"]')?.addEventListener('click', () => {
            currentPlayer.playable = false;
            currentPlayer.isCustom = false;
            currentPlayer.coreMatrix.recalculate(currentPlayer.color.values);
            sm.pop();
            proceedToCharCreate();
          });
          el.querySelector('[data-choice="remove"]')?.addEventListener('click', () => {
            const idx = session.actors.indexOf(currentPlayer);
            if (idx >= 0) session.actors.splice(idx, 1);
            sm.pop();
            proceedToCharCreate();
          });
        },
        onKey(key) {
          if (key === '1') {
            const btn = document.querySelector<HTMLButtonElement>('[data-choice="npc"]');
            btn?.click();
          } else if (key === '2') {
            const btn = document.querySelector<HTMLButtonElement>('[data-choice="remove"]');
            btn?.click();
          } else if (key === 'Escape') {
            sm.pop();
          }
        },
      });
    } else {
      // 기존 NPC를 플레이어로 했거나 세션 없음 → 조용히 복귀
      if (currentPlayer) {
        currentPlayer.playable = false;
        currentPlayer.coreMatrix.recalculate(currentPlayer.color.values);
      }
      proceedToCharCreate();
    }
  }

  // --- 로어 화면 (트리 구조) ---
  function showLore() {
    const loreData = data.lore;
    let openIdx = -1; // 열린 섹션 인덱스 (-1 = 목차)

    function renderLore(el: HTMLElement) {
      if (openIdx === -1) {
        // 목차 (섹션 제목 목록)
        el.innerHTML = `
          <div class="screen info-screen">
            <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
            <h2>로어</h2>
            <div class="npc-list">
              ${loreData.map((s, i) => `
                <button class="btn npc-item" data-lore="${i}">
                  <span class="npc-num">${i + 1}</span>
                  <span class="npc-name">${s.name}</span>
                </button>
              `).join('')}
            </div>
          </div>`;
        el.querySelector('[data-back]')?.addEventListener('click', () => sm.pop());
        el.querySelectorAll<HTMLButtonElement>('[data-lore]').forEach(btn => {
          btn.addEventListener('click', () => { openIdx = parseInt(btn.dataset.lore!, 10); renderLore(el); });
        });
      } else {
        // 개별 섹션 내용
        const s = loreData[openIdx];
        const content = s.rawLines.length > 0
          ? s.rawLines.map((l: string) => `<p>${l}</p>`).join('')
          : [...s.values.values()].map(v => `<p>${v.replace(/\|/g, '<br>')}</p>`).join('');
        el.innerHTML = `
          <div class="screen info-screen">
            <button class="btn back-btn" data-back>← 목차로 [Esc]</button>
            <h2>${s.name}</h2>
            <div class="text-display">${content}</div>
          </div>`;
        el.querySelector('[data-back]')?.addEventListener('click', () => { openIdx = -1; renderLore(el); });
      }
    }

    sm.push({
      id: 'lore',
      render: renderLore,
      onKey(key) {
        if (key === 'Escape') {
          if (openIdx === -1) sm.pop();
          else { openIdx = -1; const c = document.querySelector('.info-screen')?.parentElement; if (c instanceof HTMLElement) renderLore(c); }
        }
        if (openIdx === -1 && /^[1-9]$/.test(key)) {
          const i = parseInt(key, 10) - 1;
          if (i < loreData.length) { openIdx = i; const c = document.querySelector('.info-screen')?.parentElement; if (c instanceof HTMLElement) renderLore(c); }
        }
      },
    });
  }

  // --- 튜토리얼 화면 ---
  function showTutorial() {
    sm.push({
      id: 'tutorial',
      render(el) {
        el.innerHTML = `
          <div class="screen info-screen">
            <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
            <h2>튜토리얼</h2>
            <div class="text-display">
              <p><b>기본 조작</b></p>
              <p>• 1~9, 0, a, g 키 또는 버튼 터치로 행동 선택</p>
              <p>• i=상태, c=컬러, r=관계, w=월드, b=백로그</p>
              <p>• S=세이브/로드, Esc=뒤로</p>
              <p></p>
              <p><b>게임 흐름</b></p>
              <p>• 행동마다 시간이 경과하고 기력이 소모됩니다</p>
              <p>• NPC와 대화하여 관계를 쌓으세요</p>
              <p>• 던전에서 전투하고 자원을 모으세요</p>
              <p>• 10초간 입력이 없으면 자동으로 대기합니다</p>
              <p></p>
              <p><b>컬러 시스템</b></p>
              <p>• 8속성 (불/물/전기/철/흙/바람/빛/어둠)이 캐릭터 성향을 결정</p>
              <p>• 이벤트와 행동에 따라 컬러가 변화합니다</p>
              <p></p>
              <p><b>히페리온</b></p>
              <p>• 5단계 성장 시스템, NPC별 조건 달성으로 레벨업</p>
            </div>
          </div>`;
        el.querySelector('[data-back]')?.addEventListener('click', () => sm.pop());
      },
      onKey(key) { if (key === 'Escape') sm.pop(); },
    });
  }

  // --- 코어 매트릭스 진단 ---
  function showCoreMatrix() {
    const questions = initResult.diagnosticQuestions;
    let qIdx = 0;
    const colorValues = new Array(8).fill(0.5);
    const diagScores: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));

    function renderQ(el: HTMLElement) {
      if (qIdx >= questions.length) {
        // 완료 — 8x8 결과 매트릭스 표시
        const matrix = new CoreMatrix();
        matrix.recalculate(colorValues);
        const gridCells: string[] = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const on = matrix.getCell(r, c);
            const bg = on ? `var(--el-${r})` : 'var(--bg-card)';
            const border = on ? 'transparent' : 'var(--border)';
            gridCells.push(`<div class="cm-cell" style="background:${bg};border:1px solid ${border}"></div>`);
          }
        }
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center;text-align:center">
            <h2>진단 완료</h2>
            <div class="cm-grid">${gridCells.join('')}</div>
            <p>이 결과는 탄생 시 캐릭터에 적용됩니다.</p>
            <button class="btn btn-primary" data-done>확인 [Enter]</button>
          </div>`;
        el.querySelector('[data-done]')?.addEventListener('click', () => sm.pop());
        return;
      }
      const q = questions[qIdx];
      el.innerHTML = `
        <div class="screen info-screen" style="justify-content:center">
          <h2>코어 매트릭스 진단 (${qIdx + 1}/${questions.length})</h2>
          <p style="font-size:16px;text-align:center;margin:16px 0">${q.text}</p>
          <div class="menu-buttons" style="width:100%">
            <button class="btn" data-choice="a">A. ${q.optionA}</button>
            <button class="btn" data-choice="b">B. ${q.optionB}</button>
          </div>
          <button class="btn back-btn" data-cancel style="margin-top:12px">취소하고 나가기 [Esc]</button>
          <p class="hint">1=A, 2=B, Esc=취소</p>
        </div>`;
      el.querySelector('[data-choice="a"]')?.addEventListener('click', () => { applyChoice('a'); renderQ(el); });
      el.querySelector('[data-choice="b"]')?.addEventListener('click', () => { applyChoice('b'); renderQ(el); });
      el.querySelector('[data-cancel]')?.addEventListener('click', () => sm.pop());
    }

    function applyChoice(choice: 'a' | 'b') {
      const q = questions[qIdx];
      if (choice === 'a') {
        for (const { element, value } of q.colorA) {
          colorValues[element] = Math.max(0, Math.min(1, colorValues[element] + value));
        }
        for (const { row, col, weight } of q.influences) {
          diagScores[row][col] += weight;
        }
      } else {
        for (const { element, value } of q.colorB) {
          colorValues[element] = Math.max(0, Math.min(1, colorValues[element] + value));
        }
        for (const { row, col, weight } of q.influences) {
          diagScores[row][col] -= weight;
        }
      }
      qIdx++;
    }

    sm.push({
      id: 'corematrix',
      render: renderQ,
      onKey(key) {
        const c = document.querySelector('.info-screen')?.parentElement;
        if (!(c instanceof HTMLElement)) return;
        if (key === '1' || key === 'a') { applyChoice('a'); renderQ(c); }
        else if (key === '2' || key === 'b') { applyChoice('b'); renderQ(c); }
        else if (key === 'Enter' && qIdx >= questions.length) sm.pop();
        else if (key === 'Escape') sm.pop();
      },
    });
  }

  // --- 메인 메뉴 ---
  function showMainMenu() {
    const menu = createMainMenuScreen(checkHasAutosave(), (choice) => {
      switch (choice) {
        case 'new': showCharSelect(); break;
        case 'connect': {
          if (!loadFromSlot(0, session)) { showCharSelect(); break; }
          if (!session.isValid) { showCharSelect(); break; }

          // 경과 시간 계산 (세이브 시각 → 현재)
          const raw = localStorage.getItem('emergent_save_0');
          let elapsedMinutes = 0;
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const savedAt = parsed?.meta?.savedAt as string | undefined;
              if (savedAt) {
                const savedDate = new Date(savedAt);
                if (!isNaN(savedDate.getTime())) {
                  elapsedMinutes = Math.floor((Date.now() - savedDate.getTime()) / 60000);
                }
              }
            } catch { /* ignore */ }
          }

          // 최소 5분 경과 시 오프라인 시뮬레이션 실행
          if (elapsedMinutes >= 5) {
            const prevDay = session.gameTime.day;
            const prevLevel = session.player.base.level;
            const prevSeason = session.world.getCurrentSeason();

            fastForwardWorld(
              elapsedMinutes, session.gameTime, session.world,
              session.events, session.actors, session.social,
              session.backlog, session.knowledge,
            );

            const daysPassed = session.gameTime.day - prevDay;
            const levelsGained = session.player.base.level - prevLevel;
            const newSeason = session.world.getCurrentSeason();
            const seasonChanged = newSeason !== prevSeason;

            // 요약 화면 표시
            sm.push({
              id: 'offline-summary',
              render(el) {
                let summary = '';
                summary += `<p>부재 시간: 약 ${elapsedMinutes >= 60 ? Math.floor(elapsedMinutes / 60) + '시간 ' + (elapsedMinutes % 60) + '분' : elapsedMinutes + '분'}</p>`;
                if (daysPassed > 0) summary += `<p>${daysPassed}일이 흘렀다.</p>`;
                if (levelsGained > 0) summary += `<p>레벨이 ${levelsGained} 올랐다! (Lv.${session.player.base.level})</p>`;
                if (seasonChanged) summary += `<p>계절이 ${seasonName(newSeason)}(으)로 바뀌었다.</p>`;
                summary += `<p>현재: ${session.gameTime.toString()}</p>`;
                summary += `<p>HP: ${Math.round(session.player.base.hp)}/${Math.round(session.player.getEffectiveMaxHp())} · 기력: ${Math.round(session.player.base.vigor)}/${Math.round(session.player.getEffectiveMaxVigor())}</p>`;

                el.innerHTML = `
                  <div class="screen info-screen" style="justify-content:center;text-align:center">
                    <h2>재접속</h2>
                    <div class="text-display" style="line-height:1.8">${summary}</div>
                    <button class="btn btn-primary" data-start>계속하기 [Enter]</button>
                  </div>`;
                el.querySelector('[data-start]')?.addEventListener('click', () => { sm.pop(); autosave(); showGame(); });
              },
              onKey(key) { if (key === 'Enter' || key === ' ') { sm.pop(); autosave(); showGame(); } },
            });
          } else {
            showGame();
          }
          break;
        }
        case 'lore': showLore(); break;
        case 'tutorial': showTutorial(); break;
        case 'corematrix':
          showCoreMatrix();
          break;
        case 'datapack':
          sm.push(createDataPackScreen((_config) => {
            sm.pop();
            // 설정 저장 후 메뉴로 복귀 (새 게임 시 반영됨)
          }));
          break;
      }
    });
    sm.replace(menu);
  }

  showMainMenu();
}

boot().catch(err => {
  app.innerHTML = `<div class="screen menu-screen"><p style="color:#e94560">에러: ${err}</p></div>`;
});
