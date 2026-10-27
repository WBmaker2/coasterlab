import { SideViewEditor } from '../editor/SideViewEditor';
import { GraphPanel } from '../graphs/GraphPanel';
import { SceneManager } from '../render/SceneManager';
import { PRESETS } from '../track/pieces';
import type { Spline } from '../track/spline';
import type { CameraMode } from '../track/types';
import type { ValidationResult } from '../track/validation';
import type { RunResult, Sample } from '../physics/cart';
import type { AppState } from './state';
import { escapeHtml, fmt, icon, trackThumbnail } from '../ui/dom';
import {
  CONCEPT_LABEL,
  DIFFICULTY_LABEL,
  getMission,
  missionOrder,
  nextMissionId
} from '../features/missions/missions';

export type PlaybackStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface DesignCallbacks {
  onSelectPoint: (index: number) => void;
  onMovePoint: (index: number, x: number, y: number) => void;
  onAddPoint: () => void;
  onRemovePoint: () => void;
  onPreset: (id: string) => void;
  onNewTrack: () => void;
  onRun: () => void;
  onPause: () => void;
  onResetRun: () => void;
  onScrub: (ratio: number) => void;
  onFriction: (value: number) => void;
  onStartSpeed: (value: number) => void;
  onPointCoordinate: (axis: 'x' | 'y' | 'z', value: number) => void;
  onCamera: (mode: CameraMode) => void;
  onPreference: (key: 'showForces' | 'showGraphLabels' | 'reducedMotion', value: boolean) => void;
  onComfort: (value: boolean) => void;
  onView: (view: 'editor' | '3d') => void;
  onMissionAnswerChange: (answer: string) => void;
  onMissionSubmit: (answer: string) => void;
  onMissionExit: () => void;
  onMissionNext: (id: string) => void;
}

interface UpdatePayload {
  state: AppState;
  spline: Spline;
  validation: ValidationResult;
  run: RunResult | null;
}

const STATUS_LABEL: Record<PlaybackStatus, string> = {
  idle: '대기',
  running: '실행 중',
  paused: '일시정지',
  finished: '완료'
};

export class DesignScreen {
  readonly root: HTMLElement;
  private readonly callbacks: DesignCallbacks;
  private readonly editor: SideViewEditor;
  private readonly graphs: GraphPanel;
  private readonly scene: SceneManager;
  private readonly presetList: HTMLElement;
  private readonly frictionInput: HTMLInputElement;
  private readonly frictionOutput: HTMLOutputElement;
  private readonly startSpeedInput: HTMLInputElement;
  private readonly selectedHost: HTMLElement;
  private readonly validationList: HTMLElement;
  private readonly safetySummary: HTMLElement;
  private readonly readoutHost: HTMLElement;
  private readonly missionHost: HTMLElement;
  private readonly runButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly runBadge: HTMLElement;
  private readonly scrub: HTMLInputElement;
  private readonly scrubLabel: HTMLElement;
  private readonly liveSpeed: HTMLElement;
  private readonly liveHeight: HTMLElement;
  private readonly liveG: HTMLElement;
  private readonly liveEnergy: HTMLElement;
  private readonly graphStatus: HTMLElement;
  private readonly sceneSpeed: HTMLElement;
  private readonly sceneG: HTMLElement;
  private readonly sceneHeight: HTMLElement;
  private readonly editorHost: HTMLElement;
  private readonly sceneHost: HTMLElement;
  private readonly mobileGraphsButton: HTMLButtonElement;
  private readonly mobileRunButton: HTMLButtonElement;
  private readonly mobileRunStatus: HTMLElement;

  private state: AppState;
  private validation: ValidationResult | null = null;
  private spline: Spline | null = null;
  private run: RunResult | null = null;
  private status: PlaybackStatus = 'idle';
  private localAnswer: string | null = null;
  private missionSignature = '';
  private lastView: 'editor' | '3d' = 'editor';
  private lastCamera: CameraMode = 'orbit';
  private screenVisible = true;

  constructor(root: HTMLElement, state: AppState, callbacks: DesignCallbacks) {
    this.root = root;
    this.state = state;
    this.callbacks = callbacks;
    root.classList.add('design-screen');
    root.innerHTML = this.template();

    this.presetList = root.querySelector('#preset-list') as HTMLElement;
    this.frictionInput = root.querySelector('#friction-input') as HTMLInputElement;
    this.frictionOutput = root.querySelector('#friction-output') as HTMLOutputElement;
    this.startSpeedInput = root.querySelector('#start-speed-input') as HTMLInputElement;
    this.selectedHost = root.querySelector('#selected-point') as HTMLElement;
    this.validationList = root.querySelector('#validation-list') as HTMLElement;
    this.safetySummary = root.querySelector('#safety-summary') as HTMLElement;
    this.readoutHost = root.querySelector('#readout-grid') as HTMLElement;
    this.missionHost = root.querySelector('#mission-panel') as HTMLElement;
    this.runButton = root.querySelector('#run-button') as HTMLButtonElement;
    this.resetButton = root.querySelector('#reset-button') as HTMLButtonElement;
    this.runBadge = root.querySelector('#run-badge') as HTMLElement;
    this.scrub = root.querySelector('#scrub') as HTMLInputElement;
    this.scrubLabel = root.querySelector('#scrub-label') as HTMLElement;
    this.liveSpeed = root.querySelector('#live-speed') as HTMLElement;
    this.liveHeight = root.querySelector('#live-height') as HTMLElement;
    this.liveG = root.querySelector('#live-g') as HTMLElement;
    this.liveEnergy = root.querySelector('#live-energy') as HTMLElement;
    this.graphStatus = root.querySelector('#graph-status') as HTMLElement;
    this.sceneSpeed = root.querySelector('#scene-speed') as HTMLElement;
    this.sceneG = root.querySelector('#scene-g') as HTMLElement;
    this.sceneHeight = root.querySelector('#scene-height') as HTMLElement;
    this.editorHost = root.querySelector('#editor-host') as HTMLElement;
    this.sceneHost = root.querySelector('#scene-host') as HTMLElement;
    this.mobileGraphsButton = root.querySelector('#mobile-graphs') as HTMLButtonElement;
    this.mobileRunButton = root.querySelector('#mobile-run-button') as HTMLButtonElement;
    this.mobileRunStatus = root.querySelector('#mobile-run-status') as HTMLElement;

    this.buildPresets();
    this.bindStaticEvents();

    this.editor = new SideViewEditor(this.editorHost, {
      onSelectPoint: (index) => this.callbacks.onSelectPoint(index),
      onMovePoint: (index, x, y) => this.callbacks.onMovePoint(index, x, y),
      onRemovePoint: () => this.callbacks.onRemovePoint(),
      onRun: () => this.callbacks.onRun()
    });
    this.graphs = new GraphPanel(root.querySelector('#graphs-host') as HTMLElement);
    this.scene = new SceneManager(this.sceneHost, {
      showForces: state.preferences.showForces,
      comfortMode: state.comfortMode,
      reducedMotion: state.preferences.reducedMotion,
      camera: state.camera
    });
    this.setView(state.view);
    this.updateCameraButtons();
    this.updateSceneToggles();
    this.graphs.setLabels(state.preferences.showGraphLabels);
    this.applyState(state, null, null, null);
  }

  update(payload: UpdatePayload): void {
    const previousRun = this.run;
    this.state = payload.state;
    this.spline = payload.spline;
    this.validation = payload.validation;
    this.run = payload.run;
    this.applyState(payload.state, payload.spline, payload.validation, payload.run);
    if (payload.run !== previousRun) {
      if (payload.run) {
        this.graphs.setRun(payload.run);
        this.graphStatus.textContent = '주행 데이터';
        this.editor.setCartSample(payload.run.samples[0] ?? null);
        this.scene.setCartSample(payload.run.samples[0] ?? null);
        this.setPlayback('idle', 0, payload.run.duration, payload.run.samples[0] ?? null);
      } else {
        this.graphs.setRun(null);
        this.graphStatus.textContent = '실행 전';
        this.editor.setCartSample(null);
        this.scene.setCartSample(null);
        this.setPlayback('idle', 0, 0, null);
      }
    }
  }

  setPlayback(status: PlaybackStatus, elapsed: number, duration: number, sample: Sample | null): void {
    this.status = status;
    this.editor.setCartSample(sample);
    this.scene.setCartSample(sample);
    this.graphs.setMarker(sample);
    this.runBadge.textContent = STATUS_LABEL[status];
    this.runBadge.dataset.status = status;
    this.mobileRunStatus.textContent = STATUS_LABEL[status];
    this.updateRunButton();
    this.scrub.disabled = !this.run || duration <= 0;
    const ratio = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
    if (document.activeElement !== this.scrub) {
      this.scrub.value = String(Math.round(ratio * 1000));
    }
    this.scrubLabel.textContent = `${fmt(elapsed, 1)} / ${fmt(duration, 1)} s`;
    const speed = sample?.speed ?? 0;
    const height = sample?.y ?? 0;
    const g = sample?.gForce ?? 0;
    const energy = sample ? (sample.kinetic + sample.potential + sample.thermal) / 1000 : 0;
    this.liveSpeed.textContent = fmt(speed);
    this.liveHeight.textContent = fmt(height);
    this.liveG.textContent = fmt(g, 2);
    this.liveEnergy.textContent = fmt(energy, 1);
    this.sceneSpeed.textContent = fmt(speed);
    this.sceneG.textContent = fmt(g, 2);
    this.sceneHeight.textContent = fmt(height);
    if (status === 'running') this.graphStatus.textContent = '탐색 중';
    else if (status === 'paused') this.graphStatus.textContent = '일시정지';
    else if (status === 'finished') this.graphStatus.textContent = '주행 완료';
  }

  setSceneActiveForView(): void {
    this.scene.setActive(
      this.screenVisible && this.lastView === '3d' && !this.root.classList.contains('graphs-open')
    );
  }

  focusPoint(index: number): void {
    this.editor.focusPoint(index);
  }

  fitEditor(): void {
    this.editor.requestFit();
  }

  setScreenVisible(visible: boolean): void {
    this.screenVisible = visible;
    this.scene.setActive(
      visible && this.lastView === '3d' && !this.root.classList.contains('graphs-open')
    );
  }

  private template(): string {
    return `
      <h1 class="sr-only">트랙 설계</h1>
      <aside class="tool-rail">
        <div class="rail-heading">
          <span class="eyebrow">TRACK LIBRARY</span>
          <h2>프리셋</h2>
        </div>
        <div class="preset-list" id="preset-list"></div>
        <section class="rail-section">
          <div class="panel-label"><span>02</span> 편집</div>
          <div class="button-stack">
            <button class="btn btn-ghost" id="add-point">${icon('plus')} 점 추가</button>
            <button class="btn btn-ghost" id="remove-point">${icon('trash')} 점 삭제</button>
            <button class="btn btn-ghost" id="new-track">${icon('reset')} 새 트랙</button>
          </div>
          <p class="rail-hint">Tab으로 점 선택<br>화살표로 0.5 m 이동<br>Shift + 화살표 2 m</p>
        </section>
        <div class="rail-note">
          <strong>이상화 모델</strong>
          <span>공기저항 없음 · 카트 500 kg · g 9.81 m/s²</span>
        </div>
      </aside>

      <div class="workspace">
        <div class="stage-bar">
          <div class="view-tabs" role="tablist" aria-label="보기 선택">
            <button class="view-tab is-active" role="tab" data-view="editor" aria-selected="true">2D 설계</button>
            <button class="view-tab" role="tab" data-view="3d" aria-selected="false">3D 주행</button>
            <button class="view-tab mobile-only" id="mobile-graphs" role="tab" aria-selected="false" aria-controls="graphs-panel">그래프</button>
          </div>
          <div class="stage-actions">
            <span class="run-badge" id="run-badge" data-status="idle">대기</span>
            <button class="icon-btn" id="reset-button" aria-label="주행 초기화" title="주행 초기화">${icon('reset')}</button>
            <button class="btn btn-primary btn-pulse" id="run-button" aria-label="주행 실행">${icon('play')} 실행</button>
          </div>
        </div>

        <div class="stage-body">
          <div class="editor-host" id="editor-host" data-stage="editor" role="tabpanel" aria-label="2D 설계"></div>
          <div class="scene-host" id="scene-host" data-stage="scene" role="tabpanel" aria-label="3D 주행" hidden>
            <div class="scene-hud">
              <div class="scene-top">
                <div class="camera-tabs" role="group" aria-label="카메라">
                  <button class="camera-tab" data-camera="follow" title="추적 카메라">${icon('follow')} 추적</button>
                  <button class="camera-tab is-active" data-camera="orbit" title="궤도 카메라">${icon('orbit')} 궤도</button>
                  <button class="camera-tab" data-camera="side" title="측면 카메라">${icon('side')} 측면</button>
                </div>
                <div class="scene-toggle-group">
                  <label class="toggle"><input type="checkbox" id="toggle-forces"> 힘 화살표</label>
                  <label class="toggle"><input type="checkbox" id="toggle-comfort"> 편안한 카메라</label>
                  <label class="toggle"><input type="checkbox" id="toggle-motion"> 동작 줄이기</label>
                </div>
              </div>
              <div class="scene-bottom">
                <div class="scene-telemetry">
                  <div><span>속도</span><strong id="scene-speed">0.0</strong><small>m/s</small></div>
                  <div><span>G-force</span><strong id="scene-g">0.00</strong><small>G</small></div>
                  <div><span>높이</span><strong id="scene-height">0.0</strong><small>m</small></div>
                </div>
                <div class="force-legend" id="force-legend" hidden>
                  <span><i class="force-swatch gravity"></i>중력</span>
                  <span><i class="force-swatch normal"></i>수직항력</span>
                  <span><i class="force-swatch velocity"></i>속도</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="run-strip">
          <div class="scrub-row">
            <label class="scrub-label" for="scrub">주행 위치</label>
            <input type="range" id="scrub" min="0" max="1000" value="0" step="1" aria-label="주행 위치" disabled>
            <span class="scrub-time" id="scrub-label">0.0 / 0.0 s</span>
          </div>
          <div class="live-readouts" aria-live="off">
            <span>속도 <strong id="live-speed">0.0</strong> <small>m/s</small></span>
            <span>높이 <strong id="live-height">0.0</strong> <small>m</small></span>
            <span>G-force <strong id="live-g">0.00</strong> <small>G</small></span>
            <span>총 에너지 <strong id="live-energy">0.0</strong> <small>kJ</small></span>
          </div>
        </div>
      </div>

      <aside class="inspector">
        <div id="mission-panel"></div>
        <section class="panel-section">
          <div class="panel-label"><span>03</span> 트랙 설정</div>
          <div class="field">
            <div class="field-head"><label for="friction-input">마찰계수 μ</label><output id="friction-output" for="friction-input">0.000</output></div>
            <input type="range" id="friction-input" min="0" max="0.15" step="0.001" value="0">
          </div>
          <div class="field">
            <label for="start-speed-input">출발 속도</label>
            <div class="input-with-unit"><input type="number" id="start-speed-input" min="0" max="30" step="0.1" value="1"><span>m/s</span></div>
          </div>
          <div class="selected-point" id="selected-point"></div>
          <div class="touch-edit-row">
            <button class="btn btn-ghost" id="add-point-touch">${icon('plus')} 점 추가</button>
            <button class="btn btn-ghost" id="remove-point-touch">${icon('trash')} 점 삭제</button>
            <button class="btn btn-ghost" id="new-track-touch">${icon('reset')} 새 트랙</button>
          </div>
        </section>

        <section class="panel-section">
          <div class="panel-label"><span>04</span> 안전 점검</div>
          <div id="safety-summary" class="safety-summary" data-status="pass"></div>
          <ul class="checklist" id="validation-list"></ul>
        </section>

        <section class="panel-section">
          <div class="panel-label"><span>05</span> 모델 예측</div>
          <div class="readout-grid" id="readout-grid"></div>
          <p class="fine-print">이 값은 이상화 모델의 계산 결과입니다. 실제 놀이기구의 안전 인증이 아닙니다.</p>
        </section>
      </aside>

      <section class="graphs-panel" id="graphs-panel" role="tabpanel" aria-label="주행 데이터">
        <div class="graphs-head">
          <div class="panel-label"><span>06</span> 주행 데이터</div>
          <div class="graphs-head-tools">
            <span class="graph-status" id="graph-status">실행 전</span>
            <label class="toggle"><input type="checkbox" id="graph-labels-toggle" checked> 수치 라벨</label>
            <button class="btn btn-ghost mobile-only" id="close-mobile-graphs">설계로</button>
          </div>
        </div>
        <div id="graphs-host"></div>
      </section>

      <div class="mobile-run-dock">
        <span class="mobile-run-state" id="mobile-run-status">대기</span>
        <button class="btn btn-primary btn-pulse" id="mobile-run-button" aria-label="주행 실행">${icon('play')} 실행</button>
      </div>
    `;
  }

  private buildPresets(): void {
    this.presetList.innerHTML = PRESETS.map(
      (preset) => `
        <button class="preset-card" data-preset="${preset.id}" title="${escapeHtml(preset.descriptionKo)}">
          <span class="preset-thumb-wrap">${trackThumbnail(preset.track)}</span>
          <span class="preset-copy">
            <strong>${escapeHtml(preset.nameKo)}</strong>
            <span>${escapeHtml(preset.descriptionKo)}</span>
          </span>
        </button>
      `
    ).join('');
    this.presetList.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-preset]');
      if (!button) return;
      this.callbacks.onPreset(button.dataset.preset ?? '');
    });
  }

  private bindStaticEvents(): void {
    this.root.querySelector('#add-point')?.addEventListener('click', () => this.callbacks.onAddPoint());
    this.root
      .querySelector('#remove-point')
      ?.addEventListener('click', () => this.callbacks.onRemovePoint());
    this.root.querySelector('#new-track')?.addEventListener('click', () => this.callbacks.onNewTrack());
    this.root
      .querySelector('#add-point-touch')
      ?.addEventListener('click', () => this.callbacks.onAddPoint());
    this.root
      .querySelector('#remove-point-touch')
      ?.addEventListener('click', () => this.callbacks.onRemovePoint());
    this.root
      .querySelector('#new-track-touch')
      ?.addEventListener('click', () => this.callbacks.onNewTrack());
    this.runButton.addEventListener('click', () => {
      if (this.status === 'running') this.callbacks.onPause();
      else this.callbacks.onRun();
    });
    this.resetButton.addEventListener('click', () => this.callbacks.onResetRun());
    this.scrub.addEventListener('input', () => {
      const ratio = Number(this.scrub.value) / 1000;
      this.callbacks.onScrub(ratio);
    });
    this.frictionInput.addEventListener('input', () => {
      const value = Number(this.frictionInput.value);
      this.frictionOutput.textContent = value.toFixed(3);
      this.callbacks.onFriction(value);
    });
    this.startSpeedInput.addEventListener('change', () => {
      const value = Number(this.startSpeedInput.value);
      if (Number.isFinite(value)) this.callbacks.onStartSpeed(Math.max(0, Math.min(30, value)));
    });
    this.root.querySelectorAll<HTMLElement>('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.view as 'editor' | '3d';
        this.setView(view);
        this.callbacks.onView(view);
      });
    });
    this.mobileRunButton.addEventListener('click', () => {
      if (this.status === 'running') this.callbacks.onPause();
      else this.callbacks.onRun();
    });
    const closeGraphs = this.root.querySelector('#close-mobile-graphs');
    closeGraphs?.addEventListener('click', () => {
      this.root.classList.remove('graphs-open');
      this.mobileGraphsButton.classList.remove('is-active');
      this.mobileGraphsButton.setAttribute('aria-selected', 'false');
      this.root.querySelectorAll<HTMLElement>('[data-view]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab.dataset.view === this.lastView));
      });
      this.scene.setActive(this.lastView === '3d' && this.screenVisible);
      this.root.querySelector('.workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.mobileGraphsButton.focus({ preventScroll: true });
    });
    this.mobileGraphsButton.addEventListener('click', () => {
      const open = !this.root.classList.contains('graphs-open');
      this.root.classList.toggle('graphs-open', open);
      this.mobileGraphsButton.setAttribute('aria-selected', String(open));
      this.mobileGraphsButton.classList.toggle('is-active', open);
      this.root.querySelectorAll<HTMLElement>('[data-view]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(!open && tab.dataset.view === this.lastView));
      });
      this.scene.setActive(!open && this.lastView === '3d' && this.screenVisible);
      if (open) {
        this.root.querySelector('#graphs-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    this.root.querySelectorAll<HTMLElement>('[data-camera]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.camera as CameraMode;
        this.callbacks.onCamera(mode);
      });
    });
    const forcesToggle = this.root.querySelector('#toggle-forces') as HTMLInputElement;
    forcesToggle.addEventListener('change', () => {
      this.callbacks.onPreference('showForces', forcesToggle.checked);
    });
    const comfortToggle = this.root.querySelector('#toggle-comfort') as HTMLInputElement;
    comfortToggle.addEventListener('change', () => {
      this.callbacks.onComfort(comfortToggle.checked);
    });
    const motionToggle = this.root.querySelector('#toggle-motion') as HTMLInputElement;
    motionToggle.addEventListener('change', () => {
      this.callbacks.onPreference('reducedMotion', motionToggle.checked);
    });
    const labelsToggle = this.root.querySelector('#graph-labels-toggle') as HTMLInputElement;
    labelsToggle.addEventListener('change', () => {
      this.callbacks.onPreference('showGraphLabels', labelsToggle.checked);
    });
    this.missionHost.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.name !== 'mission-option') return;
      this.localAnswer = input.value;
      const submit = this.missionHost.querySelector<HTMLButtonElement>('[data-action="submit"]');
      if (submit) submit.disabled = !this.run || !this.localAnswer;
      const run = this.missionHost.querySelector<HTMLButtonElement>('[data-action="run"]');
      if (run) run.disabled = !this.localAnswer;
      const summary = this.missionHost.querySelector('.mission-selected');
      if (summary) summary.textContent = `선택: ${input.value}`;
      this.callbacks.onMissionAnswerChange(input.value);
    });
    this.missionHost.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'submit') {
        if (this.localAnswer) this.callbacks.onMissionSubmit(this.localAnswer);
      } else if (action === 'run') {
        this.callbacks.onRun();
      } else if (action === 'exit') {
        this.callbacks.onMissionExit();
      } else if (action === 'next' && target.dataset.missionId) {
        this.callbacks.onMissionNext(target.dataset.missionId);
      }
    });
  }

  private applyState(
    state: AppState,
    spline: Spline | null,
    validation: ValidationResult | null,
    run: RunResult | null
  ): void {
    this.state = state;
    this.spline = spline;
    this.validation = validation;
    this.run = run;
    if (spline && validation) {
      this.editor.setTrack(state.track, spline, validation, state.selectedPoint);
    }
    this.presetList.querySelectorAll<HTMLElement>('[data-preset]').forEach((button) => {
      const active = button.dataset.preset === state.track.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
    });
    if (document.activeElement !== this.frictionInput) {
      this.frictionInput.value = String(state.track.friction);
    }
    this.frictionOutput.textContent = state.track.friction.toFixed(3);
    if (document.activeElement !== this.startSpeedInput) {
      this.startSpeedInput.value = String(state.track.startSpeed);
    }
    const forcesToggle = this.root.querySelector('#toggle-forces') as HTMLInputElement;
    forcesToggle.checked = state.preferences.showForces;
    const comfortToggle = this.root.querySelector('#toggle-comfort') as HTMLInputElement;
    comfortToggle.checked = state.comfortMode;
    const motionToggle = this.root.querySelector('#toggle-motion') as HTMLInputElement;
    motionToggle.checked = state.preferences.reducedMotion;
    const labelsToggle = this.root.querySelector('#graph-labels-toggle') as HTMLInputElement;
    labelsToggle.checked = state.preferences.showGraphLabels;
    this.graphs.setLabels(state.preferences.showGraphLabels);
    this.scene.setShowForces(state.preferences.showForces);
    this.scene.setComfortMode(state.comfortMode);
    this.scene.setReducedMotion(state.preferences.reducedMotion);
    const legend = this.root.querySelector('#force-legend') as HTMLElement;
    legend.hidden = !state.preferences.showForces;
    if (state.camera !== this.lastCamera) {
      this.lastCamera = state.camera;
      this.scene.setCameraMode(state.camera);
      this.updateCameraButtons();
    }
    if (state.view !== this.lastView) {
      this.setView(state.view);
    }
    if (spline) {
      this.scene.setTrack(spline, state.track);
    }
    this.renderSelectedPoint();
    this.renderValidation();
    this.renderReadouts();
    this.renderMissionPanel();
    this.updateRunButton();
  }

  private setView(view: 'editor' | '3d'): void {
    if (view === this.lastView && this.root.dataset.view === view) {
      this.scene.setActive(view === '3d' && !this.root.classList.contains('graphs-open'));
      return;
    }
    this.lastView = view;
    this.root.dataset.view = view;
    this.root.classList.remove('graphs-open');
    this.mobileGraphsButton.classList.remove('is-active');
    this.mobileGraphsButton.setAttribute('aria-selected', 'false');
    this.root.querySelectorAll<HTMLElement>('[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    this.root.querySelector('[data-stage="editor"]')?.toggleAttribute('hidden', view !== 'editor');
    this.root.querySelector('[data-stage="scene"]')?.toggleAttribute('hidden', view !== '3d');
    this.mobileGraphsButton.setAttribute('aria-selected', 'false');
    this.scene.setActive(view === '3d' && this.screenVisible);
    if (view === '3d') this.scene.setCameraMode(this.state.camera);
  }

  private updateCameraButtons(): void {
    this.root.querySelectorAll<HTMLElement>('[data-camera]').forEach((button) => {
      const active = button.dataset.camera === this.state.camera;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  private updateSceneToggles(): void {
    const forces = this.root.querySelector('#toggle-forces') as HTMLInputElement;
    forces.checked = this.state.preferences.showForces;
    const comfort = this.root.querySelector('#toggle-comfort') as HTMLInputElement;
    comfort.checked = this.state.comfortMode;
    const motion = this.root.querySelector('#toggle-motion') as HTMLInputElement;
    motion.checked = this.state.preferences.reducedMotion;
    const labels = this.root.querySelector('#graph-labels-toggle') as HTMLInputElement;
    labels.checked = this.state.preferences.showGraphLabels;
    (this.root.querySelector('#force-legend') as HTMLElement).hidden =
      !this.state.preferences.showForces;
  }

  private renderSelectedPoint(): void {
    const index = this.state.selectedPoint;
    const points = this.state.track.points;
    if (index === null || !points[index]) {
      this.selectedHost.innerHTML = '<p class="muted">제어점을 선택하세요.</p>';
      return;
    }
    const point = points[index];
    const existingInputs = this.selectedHost.querySelectorAll<HTMLInputElement>('input');
    if (existingInputs.length !== 3) {
      this.selectedHost.innerHTML = `
        <div class="selected-head">
          <strong>P${index + 1}</strong>
          <span>선택된 제어점</span>
        </div>
        <div class="coordinate-grid">
          <label>x <input type="number" data-axis="x" step="0.1"><span>m</span></label>
          <label>y <input type="number" data-axis="y" step="0.1"><span>m</span></label>
          <label>z <input type="number" data-axis="z" step="0.1"><span>m</span></label>
        </div>
        <p class="fine-print">z는 3D 깊이입니다. 측면 설계에는 표시되지 않습니다.</p>
      `;
      this.selectedHost.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
        input.addEventListener('change', () => {
          const axis = input.dataset.axis as 'x' | 'y' | 'z';
          const value = Number(input.value);
          if (!Number.isFinite(value)) return;
          this.callbacks.onPointCoordinate(axis, value);
        });
      });
    }
    const head = this.selectedHost.querySelector('.selected-head strong');
    if (head) head.textContent = `P${index + 1}`;
    const inputs = this.selectedHost.querySelectorAll<HTMLInputElement>('input');
    inputs.forEach((input) => {
      if (document.activeElement === input) return;
      const axis = input.dataset.axis as 'x' | 'y' | 'z';
      input.value = String(axis === 'z' ? (point.z ?? 0) : point[axis]);
    });
  }

  private renderValidation(): void {
    const validation = this.validation;
    if (!validation) {
      this.safetySummary.textContent = '트랙을 읽는 중입니다.';
      this.validationList.innerHTML = '';
      return;
    }
    const label = validation.status === 'pass' ? '통과' : validation.status === 'warn' ? '주의' : '위험';
    this.safetySummary.dataset.status = validation.status;
    this.safetySummary.innerHTML = `
      <span class="safety-badge">${label}</span>
      <div>
        <strong>${validation.status === 'pass' ? '이 트랙은 모델 기준을 만족합니다.' : validation.status === 'warn' ? '주의할 지점이 있습니다.' : '위험한 지점이 있습니다.'}</strong>
        <span>항목별 점검을 확인하세요.</span>
      </div>
    `;
    this.validationList.innerHTML = validation.checks
      .map((check) => {
        const statusLabel = check.status === 'pass' ? '통과' : check.status === 'warn' ? '주의' : '위험';
        return `
          <li class="check" data-status="${check.status}">
            <span class="check-badge">${statusLabel}</span>
            <div><strong>${check.label}</strong><p>${check.detail}</p></div>
          </li>
        `;
      })
      .join('');
  }

  private renderReadouts(): void {
    const validation = this.validation;
    if (!validation || !this.spline) {
      this.readoutHost.innerHTML = '';
      return;
    }
    const start = this.state.track.points[0];
    const finish = this.state.track.points[this.state.track.points.length - 1];
    const drop = start && finish ? start.y - finish.y : 0;
    this.readoutHost.innerHTML = `
      <div><span>트랙 길이</span><strong>${fmt(this.spline.length)}</strong><small>m</small></div>
      <div><span>높이 차</span><strong>${fmt(drop)}</strong><small>m</small></div>
      <div><span>최대 속도</span><strong>${fmt(validation.run.maxSpeed)}</strong><small>m/s</small></div>
      <div><span>최대 G</span><strong>${fmt(validation.run.maxG, 2)}</strong><small>G</small></div>
    `;
  }

  private renderMissionPanel(): void {
    const mission = getMission(this.state.mission.currentId);
    if (!mission) {
      this.missionHost.innerHTML = '';
      this.missionSignature = '';
      return;
    }
    const hasRun = this.run !== null;
    const completed = this.state.mission.completed.includes(mission.id);
    const attempts = this.state.mission.attempts[mission.id] ?? 0;
    const score = this.state.mission.scores[mission.id] ?? 0;
    const signature = `${mission.id}:${hasRun}:${completed}:${attempts}:${score}`;
    if (signature === this.missionSignature) {
      const radios = this.missionHost.querySelectorAll<HTMLInputElement>('input[name="mission-option"]');
      radios.forEach((radio) => {
        radio.checked = radio.value === this.localAnswer;
      });
      return;
    }
    this.missionSignature = signature;
    this.localAnswer = this.state.mission.answers[mission.id] ?? null;
    const options = mission.prediction.options
      .map(
        (option, index) => `
        <label class="mission-option">
          <input type="radio" name="mission-option" value="${escapeHtml(option)}" ${this.localAnswer === option ? 'checked' : ''}>
          <span class="option-letter">${String.fromCharCode(65 + index)}</span>
          <span>${escapeHtml(option)}</span>
        </label>
      `
      )
      .join('');
    const nextId = nextMissionId(mission.id);
    let body = '';
    if (completed) {
      body = `
        <div class="mission-result is-correct">
          <span class="result-badge">${icon('check')} 완료 · ${score}점</span>
          <p>${escapeHtml(mission.explanationKo)}</p>
          <p class="takeaway"><strong>정리</strong> ${escapeHtml(mission.takeawayKo)}</p>
          <div class="mission-actions">
            ${nextId ? `<button class="btn btn-primary btn-pulse" data-action="next" data-mission-id="${nextId}">다음 미션 ${icon('arrowRight')}</button>` : ''}
            <button class="btn btn-ghost" data-action="exit">미션 목록</button>
          </div>
        </div>
      `;
    } else if (hasRun) {
      body = `
        <div class="mission-result ${attempts > 0 ? 'is-wrong' : ''}">
          <span class="result-badge">${attempts > 0 ? '다시 확인해 보세요' : '주행 데이터 준비됨 · 예측을 확인하세요'}</span>
          ${attempts > 0 ? '<p>그래프에서 G-force와 속도의 관계를 다시 살펴보세요.</p>' : ''}
          <div class="mission-actions">
            <button class="btn btn-primary btn-pulse" data-action="submit" ${this.localAnswer ? '' : 'disabled'}>정답 확인 ${icon('check')}</button>
            <button class="btn btn-ghost" data-action="exit">미션 목록</button>
          </div>
        </div>
      `;
    } else {
      body = `
        <div class="mission-result">
          <p>예측을 고른 뒤 트랙을 주행하세요. 그래프가 예측을 확인해 줍니다.</p>
          <div class="mission-actions">
            <button class="btn btn-primary btn-pulse" data-action="run" ${this.localAnswer ? '' : 'disabled'}>${icon('play')} 트랙 실행</button>
            <button class="btn btn-ghost" data-action="exit">미션 목록</button>
          </div>
        </div>
      `;
    }
    this.missionHost.innerHTML = `
      <div class="mission-card">
        <div class="mission-card-head">
          <span class="mission-number">M${String(missionOrder(mission.id)).padStart(2, '0')}</span>
          <span class="tag">${CONCEPT_LABEL[mission.concept]}</span>
          <span class="tag subtle">${DIFFICULTY_LABEL[mission.difficulty]}</span>
          <button class="icon-btn small" data-action="exit" aria-label="미션 닫기">${icon('x')}</button>
        </div>
        <h3>${escapeHtml(mission.titleKo)}</h3>
        <p class="mission-prompt">${escapeHtml(mission.promptKo)}</p>
        ${
          completed
            ? ''
            : `<div class="mission-options" role="radiogroup" aria-label="예측 선택">${options}</div>
        <p class="mission-selected">${this.localAnswer ? `선택: ${escapeHtml(this.localAnswer)}` : '예측을 선택하세요.'}</p>`
        }
        ${body}
      </div>
    `;
  }

  private updateRunButton(): void {
    let label = '실행';
    let aria = this.run ? '주행 다시 실행' : '주행 실행';
    let iconName = 'play';
    let pulse = !this.run;
    if (this.status === 'running') {
      label = '일시정지';
      aria = '주행 일시정지';
      iconName = 'pause';
      pulse = false;
    } else if (this.status === 'paused') {
      label = '계속';
      aria = '주행 계속';
      pulse = true;
    } else if (this.run) {
      label = '다시 실행';
      pulse = false;
    }
    this.runButton.innerHTML = `${icon(iconName)} ${label}`;
    this.runButton.setAttribute('aria-label', aria);
    this.runButton.classList.toggle('btn-pulse', pulse);
    this.mobileRunButton.innerHTML = `${icon(iconName)} ${label}`;
    this.mobileRunButton.setAttribute('aria-label', aria);
    this.mobileRunButton.classList.toggle('btn-pulse', pulse);
    this.resetButton.disabled = !this.run;
  }
}
