import type { AppState } from '../../app/state';
import { MISSIONS, missionOrder, CONCEPT_LABEL, DIFFICULTY_LABEL } from '../missions/missions';
import { escapeHtml, icon } from '../../ui/dom';

export interface TeacherCallbacks {
  onToggleMission: (id: string, enabled: boolean) => void;
  onResetProgress: () => void;
  onPrint: () => void;
  onPreference: (key: 'showForces' | 'showGraphLabels', value: boolean) => void;
  onOpenMission: (id: string) => void;
}

export class TeacherScreen {
  readonly root: HTMLElement;
  private readonly callbacks: TeacherCallbacks;

  constructor(root: HTMLElement, state: AppState, callbacks: TeacherCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    root.classList.add('teacher-screen');
    this.update(state);
  }

  update(state: AppState): void {
    const enabledCount = MISSIONS.filter((mission) => state.enabledMissions.includes(mission.id)).length;
    const completed = MISSIONS.filter((mission) => state.mission.completed.includes(mission.id));
    const totalScore = completed.reduce(
      (sum, mission) => sum + (state.mission.scores[mission.id] ?? 0),
      0
    );
    this.root.innerHTML = `
      <header class="page-head">
        <div>
          <span class="eyebrow">TEACHER CONSOLE</span>
          <h1>교실 운영</h1>
          <p>미션 선택, 정답 확인, 진도 초기화, 워크시트 인쇄를 코드 수정 없이 할 수 있습니다.</p>
        </div>
        <div class="page-stat">
          <div class="progress-figure"><strong>${completed.length}</strong><span>/ ${MISSIONS.length} 완료</span></div>
          <span class="progress-score">${totalScore}점</span>
        </div>
      </header>
      <div class="teacher-grid">
        <section class="teacher-panel teacher-missions">
          <div class="panel-label"><span>01</span> 미션 선택</div>
          <p class="panel-intro">학생 화면에 표시할 미션을 켜고 끕니다. ${enabledCount}개가 활성화되어 있습니다.</p>
          <div class="teacher-mission-list">
            ${MISSIONS.map((mission) => {
              const enabled = state.enabledMissions.includes(mission.id);
              const done = state.mission.completed.includes(mission.id);
              const score = state.mission.scores[mission.id] ?? 0;
              return `
                <div class="teacher-mission ${enabled ? '' : 'is-off'}">
                  <label class="switch">
                    <input type="checkbox" data-enable="${mission.id}" ${enabled ? 'checked' : ''}>
                    <span></span>
                    <span class="sr-only">${escapeHtml(mission.titleKo)} 미션 활성화</span>
                  </label>
                  <span class="teacher-mission-index">${String(missionOrder(mission.id)).padStart(2, '0')}</span>
                  <div class="teacher-mission-copy">
                    <strong>${escapeHtml(mission.titleKo)}</strong>
                    <span>${CONCEPT_LABEL[mission.concept]} · ${DIFFICULTY_LABEL[mission.difficulty]}</span>
                  </div>
                  <span class="teacher-mission-state">${done ? `${icon('check')} ${score}점` : enabled ? '대기' : '숨김'}</span>
                  <button class="icon-btn small" data-open="${mission.id}" aria-label="${escapeHtml(mission.titleKo)} 열기" title="학생 화면에서 열기">${icon('arrowRight')}</button>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <section class="teacher-panel teacher-actions">
          <div class="panel-label"><span>02</span> 수업 도구</div>
          <div class="action-list">
            <div class="action-row">
              <div><strong>그래프 수치 라벨</strong><span>투사 화면에서 축 값을 크게 확인합니다.</span></div>
              <label class="switch"><input type="checkbox" id="teacher-labels" ${state.preferences.showGraphLabels ? 'checked' : ''}><span></span><span class="sr-only">그래프 수치 라벨</span></label>
            </div>
            <div class="action-row">
              <div><strong>힘 화살표</strong><span>3D 화면에 중력, 수직항력, 속도를 표시합니다.</span></div>
              <label class="switch"><input type="checkbox" id="teacher-forces" ${state.preferences.showForces ? 'checked' : ''}><span></span><span class="sr-only">힘 화살표</span></label>
            </div>
          </div>
          <div class="teacher-button-row">
            <button class="btn btn-primary" id="print-sheet">${icon('print')} 워크시트 인쇄</button>
            <button class="btn btn-danger" id="reset-progress">${icon('reset')} 진도 초기화</button>
          </div>
          <p class="fine-print">초기화는 이 브라우저의 로컬 기록만 지웁니다. 서버나 계정은 사용하지 않습니다.</p>
        </section>

        <section class="teacher-panel teacher-answer-key">
          <div class="panel-label"><span>03</span> 정답과 해설</div>
          <div class="answer-key">
            ${MISSIONS.map(
              (mission) => `
              <details class="answer-item">
                <summary>
                  <span class="answer-index">${String(missionOrder(mission.id)).padStart(2, '0')}</span>
                  <span class="answer-title">${escapeHtml(mission.titleKo)}</span>
                  <span class="answer-concept">${CONCEPT_LABEL[mission.concept]}</span>
                  ${icon('chevronDown')}
                </summary>
                <div class="answer-body">
                  <p class="answer-line"><strong>정답</strong> ${escapeHtml(mission.prediction.answer)}</p>
                  <p>${escapeHtml(mission.explanationKo)}</p>
                  <p class="takeaway"><strong>정리</strong> ${escapeHtml(mission.takeawayKo)}</p>
                  <div class="answer-stats">
                    <span>완료 ${state.mission.completed.includes(mission.id) ? '예' : '아니요'}</span>
                    <span>점수 ${state.mission.scores[mission.id] ?? 0}</span>
                    <span>시도 ${state.mission.attempts[mission.id] ?? 0}회</span>
                  </div>
                </div>
              </details>
            `
            ).join('')}
          </div>
        </section>
      </div>
    `;
    this.bindEvents();
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLInputElement>('[data-enable]').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.dataset.enable) this.callbacks.onToggleMission(input.dataset.enable, input.checked);
      });
    });
    this.root.querySelectorAll<HTMLElement>('[data-open]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.open) this.callbacks.onOpenMission(button.dataset.open);
      });
    });
    (this.root.querySelector('#teacher-labels') as HTMLInputElement).addEventListener(
      'change',
      (event) => {
        this.callbacks.onPreference('showGraphLabels', (event.target as HTMLInputElement).checked);
      }
    );
    (this.root.querySelector('#teacher-forces') as HTMLInputElement).addEventListener(
      'change',
      (event) => {
        this.callbacks.onPreference('showForces', (event.target as HTMLInputElement).checked);
      }
    );
    this.root.querySelector('#print-sheet')?.addEventListener('click', () => this.callbacks.onPrint());
    this.root
      .querySelector('#reset-progress')
      ?.addEventListener('click', () => this.callbacks.onResetProgress());
  }
}
