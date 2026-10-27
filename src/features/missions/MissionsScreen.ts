import { getMissionTrack } from '../../track/pieces';
import { buildSpline } from '../../track/spline';
import type { AppState } from '../../app/state';
import { CONCEPT_LABEL, DIFFICULTY_LABEL, MISSIONS, missionOrder, type Mission } from './missions';
import { escapeHtml, fmt, icon, trackThumbnail } from '../../ui/dom';

export interface MissionScreenCallbacks {
  onStart: (missionId: string, answer: string) => void;
}

export class MissionsScreen {
  readonly root: HTMLElement;
  private state: AppState;
  private readonly callbacks: MissionScreenCallbacks;
  private selectedId: string | null = null;
  private localAnswer: string | null = null;

  constructor(root: HTMLElement, state: AppState, callbacks: MissionScreenCallbacks) {
    this.root = root;
    this.state = state;
    this.callbacks = callbacks;
    root.classList.add('missions-screen');
    this.root.innerHTML = `
      <header class="page-head">
        <div>
          <span class="eyebrow">MISSION SERIES</span>
          <h1>예측하고, 달리고, 설명하기</h1>
          <p>트랙을 주행하기 전에 예측을 고르세요. 그래프가 여러분의 예측을 확인해 줍니다.</p>
        </div>
        <div class="page-stat" id="mission-progress"></div>
      </header>
      <div class="missions-layout">
        <aside class="mission-list" id="mission-list" aria-label="미션 목록"></aside>
        <section class="mission-detail" id="mission-detail"></section>
      </div>
    `;
    this.update(state);
  }

  update(state: AppState): void {
    this.state = state;
    const enabled = MISSIONS.filter((mission) => state.enabledMissions.includes(mission.id));
    if (!this.selectedId || !enabled.some((mission) => mission.id === this.selectedId)) {
      this.selectedId = enabled[0]?.id ?? null;
      this.localAnswer = this.selectedId ? (state.mission.answers[this.selectedId] ?? null) : null;
    }
    this.renderList(enabled);
    this.renderProgress(enabled);
    this.renderDetail(enabled);
  }

  selectMission(id: string): void {
    this.selectedId = id;
    this.localAnswer = this.state.mission.answers[id] ?? null;
    this.update(this.state);
  }

  private renderProgress(enabled: Mission[]): void {
    const completed = enabled.filter((mission) => this.state.mission.completed.includes(mission.id));
    const possible = enabled.reduce((sum) => sum + 100, 0);
    const score = enabled.reduce(
      (sum, mission) => sum + (this.state.mission.scores[mission.id] ?? 0),
      0
    );
    const host = this.root.querySelector('#mission-progress') as HTMLElement;
    host.innerHTML = `
      <div class="progress-figure"><strong>${completed.length}</strong><span>/ ${enabled.length} 완료</span></div>
      <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${possible}" aria-valuenow="${score}" aria-label="미션 점수"><span style="width:${possible ? (score / possible) * 100 : 0}%"></span></div>
      <span class="progress-score">${score}점</span>
    `;
  }

  private renderList(enabled: Mission[]): void {
    const list = this.root.querySelector('#mission-list') as HTMLElement;
    if (enabled.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>교사용 화면에서 미션을 선택하세요.</p>
        </div>
      `;
      return;
    }
    list.innerHTML = enabled
      .map((mission, index) => {
        const completed = this.state.mission.completed.includes(mission.id);
        const score = this.state.mission.scores[mission.id];
        return `
          <button class="mission-list-item ${mission.id === this.selectedId ? 'is-active' : ''}" data-mission="${mission.id}">
            <span class="mission-index">${String(missionOrder(mission.id)).padStart(2, '0')}</span>
            <span class="mission-list-copy">
              <span class="mission-concept">${CONCEPT_LABEL[mission.concept]} · ${DIFFICULTY_LABEL[mission.difficulty]}</span>
              <strong>${escapeHtml(mission.titleKo)}</strong>
            </span>
            <span class="mission-state">${completed ? `${icon('check')} ${score ?? 0}점` : index === 0 ? '시작' : '열기'}</span>
          </button>
        `;
      })
      .join('');
    list.querySelectorAll<HTMLElement>('[data-mission]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.mission;
        if (id) this.selectMission(id);
      });
    });
  }

  private renderDetail(enabled: Mission[]): void {
    const host = this.root.querySelector('#mission-detail') as HTMLElement;
    const mission = enabled.find((entry) => entry.id === this.selectedId);
    if (!mission) {
      host.innerHTML = `
        <div class="empty-state tall">
          <span class="empty-mark">${icon('spark')}</span>
          <h2>미션이 선택되지 않았습니다</h2>
          <p>교사용 화면에서 미션을 켜면 이곳에 표시됩니다.</p>
        </div>
      `;
      return;
    }
    const completed = this.state.mission.completed.includes(mission.id);
    const score = this.state.mission.scores[mission.id] ?? 0;
    const track = getMissionTrack(mission.trackPreset);
    let splineLength = 0;
    if (track) {
      try {
        splineLength = buildSpline(track.points).length;
      } catch {
        splineLength = 0;
      }
    }
    const start = track?.points[0];
    const finish = track?.points[track.points.length - 1];
    const options = mission.prediction.options
      .map(
        (option, index) => `
        <label class="mission-option ${this.localAnswer === option ? 'is-selected' : ''}">
          <input type="radio" name="mission-screen-option" value="${escapeHtml(option)}" ${this.localAnswer === option ? 'checked' : ''}>
          <span class="option-letter">${String.fromCharCode(65 + index)}</span>
          <span>${escapeHtml(option)}</span>
        </label>
      `
      )
      .join('');
    host.innerHTML = `
      <div class="mission-detail-inner">
        <header class="mission-detail-head">
          <div class="mission-kicker">
            <span class="mission-big-number">${String(missionOrder(mission.id)).padStart(2, '0')}</span>
            <div>
              <span class="tag">${CONCEPT_LABEL[mission.concept]}</span>
              <span class="tag subtle">${DIFFICULTY_LABEL[mission.difficulty]}</span>
            </div>
          </div>
          <span class="mission-status ${completed ? 'is-complete' : ''}">${completed ? `완료 · ${score}점` : '예측을 고르세요'}</span>
        </header>
        <h2>${escapeHtml(mission.titleKo)}</h2>
        <p class="mission-detail-prompt">${escapeHtml(mission.promptKo)}</p>
        <div class="mission-track-preview">
          <div class="preview-thumb">${track ? trackThumbnail(track, 360, 110) : ''}</div>
          <div class="preview-meta">
            <span class="eyebrow">PRESET</span>
            <strong>${track ? escapeHtml(track.nameKo) : '—'}</strong>
            <span>길이 약 ${fmt(splineLength, 0)} m · 높이 차 ${start && finish ? fmt(start.y - finish.y) : '—'} m</span>
            ${track && track.friction > 0 ? `<span>마찰 μ = ${track.friction.toFixed(3)}</span>` : '<span>마찰 없음</span>'}
          </div>
        </div>
        <fieldset class="mission-question">
          <legend>예측</legend>
          <div class="mission-options mission-options-large">${options}</div>
        </fieldset>
        <p class="mission-selected">${this.localAnswer ? `선택: ${escapeHtml(this.localAnswer)}` : '예측을 선택하면 주행을 시작할 수 있습니다.'}</p>
        <div class="mission-start-row">
          <button class="btn btn-primary btn-pulse" id="start-mission" ${this.localAnswer ? '' : 'disabled'}>
            ${completed ? '다시 주행' : '트랙 열고 주행'} ${icon('arrowRight')}
          </button>
          <span class="fine-print">트랙을 직접 수정하며 실험할 수 있습니다.</span>
        </div>
        ${
          completed
            ? `
          <div class="mission-explanation">
            <span class="eyebrow">EXPLANATION</span>
            <p>${escapeHtml(mission.explanationKo)}</p>
            <p class="takeaway"><strong>정리</strong> ${escapeHtml(mission.takeawayKo)}</p>
          </div>
        `
            : ''
        }
      </div>
    `;
    host.querySelectorAll<HTMLInputElement>('input[name="mission-screen-option"]').forEach((input) => {
      input.addEventListener('change', () => {
        this.localAnswer = input.value;
        const startButton = host.querySelector<HTMLButtonElement>('#start-mission');
        if (startButton) startButton.disabled = false;
        const summary = host.querySelector('.mission-selected');
        if (summary) summary.textContent = `선택: ${input.value}`;
        host.querySelectorAll('.mission-option').forEach((label) => {
          const labelInput = label.querySelector('input') as HTMLInputElement;
          label.classList.toggle('is-selected', labelInput.checked);
        });
      });
    });
    host.querySelector('#start-mission')?.addEventListener('click', () => {
      if (this.localAnswer) this.callbacks.onStart(mission.id, this.localAnswer);
    });
  }
}
