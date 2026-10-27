import { buildSpline, type Spline } from '../track/spline';
import { blankTrack, cloneTrack, getMissionTrack, getPreset } from '../track/pieces';
import type { Track } from '../track/types';
import { validateTrack, type ValidationResult } from '../track/validation';
import { sampleAtTime } from '../physics/integrate';
import type { RunResult } from '../physics/cart';
import { CART_MASS, GRAVITY } from '../physics/constants';
import { DesignScreen, type PlaybackStatus } from './DesignScreen';
import { createDefaultState, type AppState, type Route } from './state';
import { clearSnapshot, loadSnapshot, saveSnapshot } from '../storage/progress';
import { MISSIONS, getMission } from '../features/missions/missions';
import { MissionsScreen } from '../features/missions/MissionsScreen';
import { TeacherScreen } from '../features/teacher/TeacherScreen';
import { announce, escapeHtml, fmt, trackThumbnail } from '../ui/dom';

interface Playback {
  status: PlaybackStatus;
  elapsed: number;
  duration: number;
  raf: number | null;
  lastTimestamp: number;
}

export class App {
  private readonly root: HTMLElement;
  private state: AppState;
  private spline: Spline;
  private validation: ValidationResult;
  private run: RunResult | null = null;
  private design!: DesignScreen;
  private missions!: MissionsScreen;
  private teacher!: TeacherScreen;
  private designHost!: HTMLElement;
  private missionsHost!: HTMLElement;
  private teacherHost!: HTMLElement;
  private playback: Playback = { status: 'idle', elapsed: 0, duration: 0, raf: null, lastTimestamp: 0 };

  constructor(root: HTMLElement) {
    this.root = root;
    const defaults = createDefaultState();
    const loaded = loadSnapshot(defaults);
    const hashRoute = this.routeFromHash();
    this.state = { ...loaded, route: hashRoute ?? loaded.route };
    this.spline = buildSpline(this.state.track.points);
    this.validation = validateTrack(this.state.track, this.spline);
  }

  start(): void {
    this.buildShell();
    this.design = new DesignScreen(this.designHost, this.state, {
      onSelectPoint: (index) => this.selectPoint(index),
      onMovePoint: (index, x, y) => this.movePoint(index, x, y),
      onAddPoint: () => this.addPoint(),
      onRemovePoint: () => this.removePoint(),
      onPreset: (id) => this.loadPreset(id),
      onNewTrack: () => this.newTrack(),
      onRun: () => this.handleRun(),
      onPause: () => this.pause(),
      onResetRun: () => this.resetRun(),
      onScrub: (ratio) => this.scrub(ratio),
      onFriction: (value) => this.updateSetting('friction', value),
      onStartSpeed: (value) => this.updateSetting('startSpeed', value),
      onPointCoordinate: (axis, value) => this.updatePointCoordinate(axis, value),
      onCamera: (mode) => this.setCamera(mode),
      onPreference: (key, value) => this.setPreference(key, value),
      onComfort: (value) => this.setComfort(value),
      onView: (view) => this.setView(view),
      onMissionAnswerChange: (answer) => this.changeMissionAnswer(answer),
      onMissionSubmit: (answer) => this.submitMission(answer),
      onMissionExit: () => this.exitMission(),
      onMissionNext: (id) => this.openNextMission(id)
    });
    this.missions = new MissionsScreen(this.missionsHost, this.state, {
      onStart: (missionId, answer) => this.startMission(missionId, answer)
    });
    this.teacher = new TeacherScreen(this.teacherHost, this.state, {
      onToggleMission: (id, enabled) => this.toggleMission(id, enabled),
      onResetProgress: () => this.resetProgress(),
      onPrint: () => this.printWorksheet(),
      onPreference: (key, value) => this.setPreference(key, value),
      onOpenMission: (id) => this.openMissionFromTeacher(id)
    });
    this.applyMotionPreference();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    this.setRoute(this.state.route, false);
    this.bindGlobalEvents();
    this.root.querySelector('.boot-screen')?.remove();
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <a class="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header class="masthead">
        <a class="brand" href="#" data-route="design">
          <span class="brand-mark">CL</span>
          <span class="brand-copy">
            <strong>CoasterLab</strong>
            <span>롤러코스터 에너지 랩</span>
          </span>
          <span class="sr-only">설계 화면으로 이동</span>
        </a>
        <nav class="main-nav" aria-label="화면 전환">
          <button class="nav-item is-active" data-route="design"><span class="nav-index">01</span><span>설계</span></button>
          <button class="nav-item" data-route="missions"><span class="nav-index">02</span><span>미션</span></button>
          <button class="nav-item" data-route="teacher"><span class="nav-index">03</span><span>교사용</span></button>
        </nav>
        <div class="masthead-side">
          <div class="model-chip" title="공기저항과 바퀴의 회전 관성을 고려하지 않는 교육용 모델입니다.">
            <span class="model-dot"></span>
            <span>이상화 모델</span>
            <small>공기저항 없음</small>
          </div>
        </div>
      </header>
      <main id="main-content">
        <section class="screen-host" id="design-host"></section>
        <section class="screen-host" id="missions-host" hidden></section>
        <section class="screen-host" id="teacher-host" hidden></section>
      </main>
      <div class="sr-only" id="live-region" aria-live="polite" aria-atomic="true"></div>
      <div class="print-sheet" id="print-sheet-content" aria-hidden="true"></div>
    `;
    this.designHost = this.root.querySelector('#design-host') as HTMLElement;
    this.missionsHost = this.root.querySelector('#missions-host') as HTMLElement;
    this.teacherHost = this.root.querySelector('#teacher-host') as HTMLElement;
    this.root.querySelectorAll<HTMLElement>('[data-route]').forEach((element) => {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        const route = element.dataset.route as Route;
        this.setRoute(route);
      });
    });
  }

  private bindGlobalEvents(): void {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        tag === 'button' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (this.state.route !== 'design') return;
      event.preventDefault();
      this.handleRun();
    });
    window.addEventListener('hashchange', () => {
      const route = this.routeFromHash();
      if (route && route !== this.state.route) this.setRoute(route, false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveSnapshot(this.state);
    });
    window.addEventListener('pagehide', () => saveSnapshot(this.state));
  }

  private routeFromHash(): Route | null {
    const hash = window.location.hash.replace('#', '');
    return hash === 'design' || hash === 'missions' || hash === 'teacher' ? hash : null;
  }

  private setRoute(route: Route, updateHash = true): void {
    if (route !== 'design' && this.playback.status === 'running') this.pause();
    this.state.route = route;
    this.root.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.route === route);
      item.setAttribute('aria-current', item.dataset.route === route ? 'page' : 'false');
    });
    this.designHost.hidden = route !== 'design';
    this.missionsHost.hidden = route !== 'missions';
    this.teacherHost.hidden = route !== 'teacher';
    if (route === 'missions') this.missions.update(this.state);
    if (route === 'teacher') this.teacher.update(this.state);
    this.design.setScreenVisible(route === 'design');
    if (route === 'design') {
      this.design.update({
        state: this.state,
        spline: this.spline,
        validation: this.validation,
        run: this.run
      });
      this.design.setSceneActiveForView();
    }
    if (updateHash) {
      const url = new URL(window.location.href);
      url.hash = route;
      window.history.replaceState(null, '', url);
    }
    saveSnapshot(this.state);
  }

  private selectPoint(index: number): void {
    this.state.selectedPoint = index;
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
  }

  private movePoint(index: number, x: number, y: number): void {
    const point = this.state.track.points[index];
    if (!point) return;
    if (point.x === x && point.y === y) return;
    this.invalidateRun();
    const points = this.state.track.points.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, x, y } : entry
    );
    this.state.track = { ...this.state.track, points };
    this.state.selectedPoint = index;
    this.refreshModel();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
  }

  private addPoint(): void {
    const points = this.state.track.points;
    const selected = this.state.selectedPoint ?? points.length - 1;
    const current = points[selected] ?? points[points.length - 1];
    const next = points[selected + 1];
    const newPoint = next
      ? {
          x: Math.round(((current.x + next.x) / 2) * 10) / 10,
          y: Math.round(((current.y + next.y) / 2) * 10) / 10,
          z: Math.round((((current.z ?? 0) + (next.z ?? 0)) / 2) * 10) / 10
        }
      : {
          x: Math.round((current.x + 10) * 10) / 10,
          y: Math.round(Math.max(0, current.y - 1) * 10) / 10,
          z: current.z ?? 0
        };
    const insertIndex = Math.min(points.length, selected + 1);
    const updated = [...points];
    updated.splice(insertIndex, 0, newPoint);
    let loop = this.state.track.loop ? { ...this.state.track.loop } : undefined;
    if (loop) {
      if (insertIndex <= loop.startIndex) {
        loop = { ...loop, startIndex: loop.startIndex + 1, endIndex: loop.endIndex + 1 };
      } else if (insertIndex <= loop.endIndex) {
        loop = { ...loop, endIndex: loop.endIndex + 1 };
      }
    }
    this.invalidateRun();
    this.state.track = { ...this.state.track, points: updated, loop };
    this.state.selectedPoint = insertIndex;
    this.state.mission.currentId = null;
    this.refreshModel();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    this.design.focusPoint(insertIndex);
    saveSnapshot(this.state);
    announce('제어점을 추가했습니다.');
  }

  private removePoint(): void {
    const points = this.state.track.points;
    if (points.length <= 3) {
      announce('제어점은 최소 3개가 필요합니다.');
      return;
    }
    const index = this.state.selectedPoint ?? points.length - 1;
    if (index < 0 || index >= points.length) return;
    let loop = this.state.track.loop ? { ...this.state.track.loop } : undefined;
    const updated = points.filter((_, pointIndex) => pointIndex !== index);
    if (loop) {
      if (index <= loop.startIndex) {
        loop = { ...loop, startIndex: loop.startIndex - 1, endIndex: loop.endIndex - 1 };
      } else if (index <= loop.endIndex) {
        loop = { ...loop, endIndex: loop.endIndex - 1 };
      }
      if (loop.startIndex < 0 || loop.endIndex >= updated.length || loop.endIndex <= loop.startIndex) {
        loop = undefined;
      }
    }
    this.invalidateRun();
    this.state.track = { ...this.state.track, points: updated, loop };
    this.state.selectedPoint = Math.max(0, Math.min(index, updated.length - 1));
    this.state.mission.currentId = null;
    this.refreshModel();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
    announce('제어점을 삭제했습니다.');
  }

  private loadPreset(id: string): void {
    const track = getPreset(id);
    if (!track) return;
    this.design.fitEditor();
    const currentMission = getMission(this.state.mission.currentId);
    if (currentMission && currentMission.trackPreset !== id) {
      this.state.mission.currentId = null;
    }
    this.setTrack(track, true);
    announce(`${track.nameKo} 프리셋을 불러왔습니다.`);
  }

  private newTrack(): void {
    this.design.fitEditor();
    this.setTrack(cloneTrack(blankTrack));
    this.state.mission.currentId = null;
    announce('새 트랙을 시작했습니다.');
  }

  private setTrack(track: Track, resetSelection = true): void {
    this.invalidateRun();
    this.state.track = track;
    if (resetSelection) this.state.selectedPoint = 0;
    this.refreshModel();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
  }

  private updateSetting(key: 'friction' | 'startSpeed', value: number): void {
    const next =
      key === 'friction' ? Math.min(0.2, Math.max(0, value)) : Math.min(30, Math.max(0, value));
    if (this.state.track[key] === next) return;
    this.invalidateRun();
    this.state.track = { ...this.state.track, [key]: next };
    this.refreshModel();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
  }

  private updatePointCoordinate(axis: 'x' | 'y' | 'z', value: number): void {
    const index = this.state.selectedPoint;
    if (index === null) return;
    const point = this.state.track.points[index];
    if (!point) return;
    const points = this.state.track.points.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, [axis]: value } : entry
    );
    this.invalidateRun();
    this.state.track = { ...this.state.track, points };
    this.refreshModel();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
  }

  private setCamera(mode: AppState['camera']): void {
    this.state.camera = mode;
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
  }

  private setPreference(key: 'showForces' | 'showGraphLabels' | 'reducedMotion', value: boolean): void {
    this.state.preferences = { ...this.state.preferences, [key]: value };
    this.applyMotionPreference();
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    this.teacher.update(this.state);
    saveSnapshot(this.state);
  }

  private setComfort(value: boolean): void {
    this.state.comfortMode = value;
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
  }

  private setView(view: 'editor' | '3d'): void {
    this.state.view = view;
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
  }

  private handleRun(): void {
    const activeMission = getMission(this.state.mission.currentId);
    if (activeMission && !this.state.mission.answers[activeMission.id]) {
      announce('먼저 예측을 선택한 뒤 주행하세요.');
      return;
    }
    if (this.playback.status === 'running') {
      this.pause();
      return;
    }
    if (
      this.run &&
      this.playback.status === 'paused' &&
      this.playback.elapsed < this.playback.duration
    ) {
      this.resume();
      return;
    }
    if (
      this.run &&
      this.playback.status === 'finished' &&
      this.playback.elapsed < this.playback.duration
    ) {
      this.resume();
      return;
    }
    this.run = this.validation.run;
    this.playback.elapsed = 0;
    this.playback.duration = this.run.duration;
    this.state.camera = 'follow';
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    this.resume(true);
    announce(
      `주행을 시작합니다. 최대 ${fmt(this.run.maxSpeed)} 미터 매 초, 최대 ${fmt(this.run.maxG, 1)} G.`
    );
  }

  private resume(reset = false): void {
    if (!this.run) return;
    if (reset) this.playback.elapsed = 0;
    this.playback.status = 'running';
    this.playback.lastTimestamp = performance.now();
    if (this.playback.raf !== null) window.cancelAnimationFrame(this.playback.raf);
    const first = sampleAtTime(this.run, this.playback.elapsed).sample;
    this.design.setPlayback('running', this.playback.elapsed, this.playback.duration, first);
    this.playback.raf = window.requestAnimationFrame(this.tick);
  }

  private pause(): void {
    if (!this.run) return;
    if (this.playback.raf !== null) {
      window.cancelAnimationFrame(this.playback.raf);
      this.playback.raf = null;
    }
    this.playback.status = 'paused';
    const sample = sampleAtTime(this.run, this.playback.elapsed).sample;
    this.design.setPlayback('paused', this.playback.elapsed, this.playback.duration, sample);
  }

  private tick = (timestamp: number): void => {
    if (!this.run) return;
    const delta = Math.min(0.05, (timestamp - this.playback.lastTimestamp) / 1000);
    this.playback.lastTimestamp = timestamp;
    this.playback.elapsed = Math.min(this.playback.duration, this.playback.elapsed + delta);
    const sample = sampleAtTime(this.run, this.playback.elapsed).sample;
    if (this.playback.elapsed >= this.playback.duration - 1e-6) {
      this.playback.status = 'finished';
      this.playback.raf = null;
      this.design.setPlayback('finished', this.playback.duration, this.playback.duration, sample);
      announce(
        `주행 완료. 최대 ${fmt(this.run.maxSpeed)} 미터 매 초, 최대 ${fmt(this.run.maxG, 2)} G, 최소 ${fmt(this.run.minG, 2)} G.`
      );
      return;
    }
    this.design.setPlayback('running', this.playback.elapsed, this.playback.duration, sample);
    this.playback.raf = window.requestAnimationFrame(this.tick);
  };

  private scrub(ratio: number): void {
    if (!this.run) return;
    if (this.playback.raf !== null) {
      window.cancelAnimationFrame(this.playback.raf);
      this.playback.raf = null;
    }
    this.playback.status = 'paused';
    this.playback.elapsed = Math.max(
      0,
      Math.min(this.playback.duration, ratio * this.playback.duration)
    );
    const sample = sampleAtTime(this.run, this.playback.elapsed).sample;
    this.design.setPlayback('paused', this.playback.elapsed, this.playback.duration, sample);
  }

  private resetRun(): void {
    if (this.playback.raf !== null) {
      window.cancelAnimationFrame(this.playback.raf);
      this.playback.raf = null;
    }
    this.playback = { status: 'idle', elapsed: 0, duration: 0, raf: null, lastTimestamp: 0 };
    this.run = null;
    if (this.state.camera === 'follow') this.state.camera = 'orbit';
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: null
    });
    announce('주행을 초기화했습니다.');
  }

  private invalidateRun(): void {
    if (this.playback.raf !== null) {
      window.cancelAnimationFrame(this.playback.raf);
      this.playback.raf = null;
    }
    this.playback = { status: 'idle', elapsed: 0, duration: 0, raf: null, lastTimestamp: 0 };
    this.run = null;
    if (this.state.camera === 'follow') this.state.camera = 'orbit';
  }

  private applyMotionPreference(): void {
    document.documentElement.classList.toggle('reduce-motion', this.state.preferences.reducedMotion);
  }

  private refreshModel(): void {
    try {
      this.spline = buildSpline(this.state.track.points);
      this.validation = validateTrack(this.state.track, this.spline);
    } catch {
      this.spline = buildSpline([
        { x: 0, y: 10 },
        { x: 10, y: 0 }
      ]);
      this.validation = validateTrack(this.state.track, this.spline);
    }
  }

  private startMission(id: string, answer: string): void {
    const mission = getMission(id);
    if (!mission) return;
    const track = getMissionTrack(mission.trackPreset) ?? getPreset('hill');
    if (!track) return;
    this.invalidateRun();
    this.state.mission.currentId = id;
    this.state.mission.answers[id] = answer;
    this.state.track = track;
    this.state.selectedPoint = 0;
    this.state.view = '3d';
    this.state.camera = 'follow';
    this.refreshModel();
    this.design.fitEditor();
    this.state.route = 'design';
    this.setRoute('design');
    window.setTimeout(() => {
      if (this.state.mission.currentId === id && this.state.route === 'design') this.handleRun();
    }, 320);
  }

  private changeMissionAnswer(answer: string): void {
    const mission = getMission(this.state.mission.currentId);
    if (!mission) return;
    this.state.mission.answers[mission.id] = answer;
    saveSnapshot(this.state);
  }

  private submitMission(answer: string): void {
    const mission = getMission(this.state.mission.currentId);
    if (!mission) return;
    this.state.mission.answers[mission.id] = answer;
    const attempts = (this.state.mission.attempts[mission.id] ?? 0) + 1;
    this.state.mission.attempts[mission.id] = attempts;
    const correct = answer === mission.prediction.answer;
    if (correct) {
      if (!this.state.mission.completed.includes(mission.id)) {
        this.state.mission.completed.push(mission.id);
      }
      const score = attempts === 1 ? 100 : 70;
      this.state.mission.scores[mission.id] = Math.max(
        score,
        this.state.mission.scores[mission.id] ?? 0
      );
      announce(
        `정답입니다. ${this.state.mission.scores[mission.id]}점을 받았습니다. ${mission.takeawayKo}`
      );
    } else {
      announce('아직 정답이 아닙니다. 그래프를 다시 확인하고 다른 답을 골라 보세요.');
    }
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    this.missions.update(this.state);
    this.teacher.update(this.state);
    saveSnapshot(this.state);
  }

  private exitMission(): void {
    this.state.mission.currentId = null;
    this.state.route = 'missions';
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    this.setRoute('missions');
  }

  private openNextMission(id: string): void {
    this.state.mission.currentId = null;
    this.setRoute('missions');
    const mission = getMission(id);
    if (mission && !this.state.enabledMissions.includes(id)) {
      this.state.enabledMissions = [...this.state.enabledMissions, id];
    }
    this.missions.selectMission(id);
    saveSnapshot(this.state);
  }

  private toggleMission(id: string, enabled: boolean): void {
    const set = new Set(this.state.enabledMissions);
    if (enabled) set.add(id);
    else set.delete(id);
    this.state.enabledMissions = MISSIONS.filter((mission) => set.has(mission.id)).map(
      (mission) => mission.id
    );
    if (!enabled && this.state.mission.currentId === id) {
      this.state.mission.currentId = null;
    }
    this.teacher.update(this.state);
    this.missions.update(this.state);
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: this.run
    });
    saveSnapshot(this.state);
    announce(enabled ? '미션을 활성화했습니다.' : '미션을 숨겼습니다.');
  }

  private resetProgress(): void {
    const confirmed = window.confirm(
      '미션 진도, 저장된 트랙, 설정을 모두 초기화할까요?\n이 작업은 이 브라우저에만 적용됩니다.'
    );
    if (!confirmed) return;
    this.invalidateRun();
    clearSnapshot();
    this.state = createDefaultState();
    this.applyMotionPreference();
    this.spline = buildSpline(this.state.track.points);
    this.validation = validateTrack(this.state.track, this.spline);
    this.state.route = 'design';
    this.design.update({
      state: this.state,
      spline: this.spline,
      validation: this.validation,
      run: null
    });
    this.missions.update(this.state);
    this.teacher.update(this.state);
    this.setRoute('design');
    announce('진도를 초기화했습니다.');
  }

  private openMissionFromTeacher(id: string): void {
    const mission = getMission(id);
    if (!mission) return;
    if (!this.state.enabledMissions.includes(id)) {
      this.state.enabledMissions = [...this.state.enabledMissions, id];
    }
    this.state.mission.currentId = null;
    this.setRoute('missions');
    this.missions.selectMission(id);
    saveSnapshot(this.state);
  }

  private printWorksheet(): void {
    const enabled = MISSIONS.filter((mission) => this.state.enabledMissions.includes(mission.id));
    const missions = enabled.length > 0 ? enabled : MISSIONS;
    const sheet = this.root.querySelector('#print-sheet-content') as HTMLElement;
    sheet.innerHTML = `
      <header class="print-head">
        <div>
          <span class="eyebrow">COASTERLAB WORKSHEET</span>
          <h1>롤러코스터 에너지 랩</h1>
          <p>이름 ____________________  반 ________  번호 ________</p>
        </div>
        <div class="print-model">
          <strong>이상화 모델</strong>
          <span>공기저항 없음 · 카트 ${CART_MASS} kg · g ${GRAVITY} m/s²</span>
        </div>
      </header>
      <p class="print-intro">각 트랙을 상상하며 예측을 고르고, 그렇게 생각한 이유를 적으세요. 수업 후 CoasterLab에서 직접 주행하며 확인합니다.</p>
      ${missions
        .map((mission) => {
          const track = getMissionTrack(mission.trackPreset);
          return `
            <section class="print-mission">
              <div class="print-mission-head">
                <span class="print-number">${String(MISSIONS.indexOf(mission) + 1).padStart(2, '0')}</span>
                <div>
                  <h2>${escapeHtml(mission.titleKo)}</h2>
                  <span>${escapeHtml(mission.promptKo)}</span>
                </div>
              </div>
              <div class="print-body">
                <div class="print-track">${track ? trackThumbnail(track, 300, 96) : ''}</div>
                <div class="print-options">
                  ${mission.prediction.options
                    .map(
                      (option, index) =>
                        `<div><span>${String.fromCharCode(65 + index)}</span>${escapeHtml(option)}</div>`
                    )
                    .join('')}
                </div>
              </div>
              <div class="print-answer">
                <span>내 예측: __________</span>
                <span>이유: ____________________________________________________________</span>
              </div>
            </section>
          `;
        })
        .join('')}
      <footer class="print-foot">CoasterLab · 교육용 이상화 모델 · 실제 안전 인증 자료가 아닙니다.</footer>
    `;
    sheet.setAttribute('aria-hidden', 'false');
    announce('워크시트를 인쇄합니다.');
    window.setTimeout(() => {
      window.print();
      sheet.setAttribute('aria-hidden', 'true');
    }, 120);
  }
}
