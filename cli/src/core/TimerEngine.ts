import { EventEmitter } from 'events';

export type Phase = 'idle' | 'reading' | 'solving' | 'finished';

export interface TimerState {
  phase: Phase;
  paused: boolean;
  elapsedSeconds: number;
  readingElapsed: number;  // min(elapsed, 900) — 읽기 단계 경과 초
  solvingElapsed: number;  // max(0, elapsed - 900) — 풀이 단계 경과 초
  nextSnapshotIn: number;  // 다음 스냅샷까지 남은 초
}

const TOTAL_SECONDS = 60 * 60;             // 3600초
const READING_SECONDS = 15 * 60;           // 900초
export const SNAPSHOT_INTERVAL_SECONDS = 3 * 60;  // 180초 (3분)

/**
 * VS Code API 없이 동작하는 드리프트-방지 타이머 엔진.
 *
 * Events:
 *   'state'         (TimerState)        - 500ms마다 상태 업데이트
 *   'phase-change'  (Phase)             - 페이즈 전환 시
 *   'snapshot-due'  (elapsedSeconds)    - 스냅샷을 저장해야 할 때
 *   'solved'        (elapsedSeconds)    - 사용자가 정답을 눌렀을 때
 *   'timeout'       (elapsedSeconds)    - 60분 시간 초과 시
 */
export class TimerEngine extends EventEmitter {
  private _phase: Phase = 'idle';
  private _paused = false;
  private _elapsedSeconds = 0;
  private _lastSnapshotAt = 0;

  // 드리프트 방지 wall-clock 타이밍
  private _startWallTime = 0;
  private _pauseAccumMs = 0;
  private _pauseStartAt = 0;

  private _interval: ReturnType<typeof setInterval> | undefined;

  getState(): TimerState {
    const timeSinceLastSnapshot = this._elapsedSeconds - this._lastSnapshotAt;
    const nextSnapshotIn = SNAPSHOT_INTERVAL_SECONDS - timeSinceLastSnapshot;
    const readingElapsed = Math.min(this._elapsedSeconds, READING_SECONDS);
    const solvingElapsed = Math.max(0, this._elapsedSeconds - READING_SECONDS);
    return {
      phase: this._phase,
      paused: this._paused,
      elapsedSeconds: this._elapsedSeconds,
      readingElapsed,
      solvingElapsed,
      nextSnapshotIn: Math.max(0, nextSnapshotIn),
    };
  }

  start(): void {
    if (this._phase !== 'idle') return;
    this._phase = 'reading';
    this._elapsedSeconds = 0;
    this._lastSnapshotAt = 0;
    this._paused = false;
    this._pauseAccumMs = 0;
    this._startWallTime = Date.now();
    this._startTick();
    this.emit('phase-change', 'reading');
    this.emit('state', this.getState());
  }

  togglePause(): void {
    if (this._phase === 'idle' || this._phase === 'finished') return;
    this._paused = !this._paused;
    if (this._paused) {
      this._pauseStartAt = Date.now();
      this._stopTick();
    } else {
      this._pauseAccumMs += Date.now() - this._pauseStartAt;
      this._startTick();
    }
    this.emit('state', this.getState());
  }

  reset(): void {
    this._stopTick();
    const prevPhase = this._phase;
    this._phase = 'idle';
    this._paused = false;
    this._elapsedSeconds = 0;
    this._lastSnapshotAt = 0;
    this._pauseAccumMs = 0;
    if (prevPhase !== 'idle') {
      this.emit('phase-change', 'idle');
    }
    this.emit('state', this.getState());
  }

  markSolved(): void {
    if (this._phase === 'idle' || this._phase === 'finished') return;
    const solvedSeconds = this._elapsedSeconds;
    this._stopTick();
    this._phase = 'finished';
    this.emit('solved', solvedSeconds);
    this.emit('snapshot-due', solvedSeconds);
    this.emit('phase-change', 'finished');
    this.emit('state', this.getState());
  }

  destroy(): void {
    this._stopTick();
    this.removeAllListeners();
  }

  private _startTick(): void {
    this._stopTick();
    this._interval = setInterval(() => this._tick(), 500);
  }

  private _stopTick(): void {
    if (this._interval !== undefined) {
      clearInterval(this._interval);
      this._interval = undefined;
    }
  }

  private _tick(): void {
    if (this._paused) return;

    // 드리프트 방지: wall-clock 기준 elapsed 계산
    const wallElapsed = Date.now() - this._startWallTime - this._pauseAccumMs;
    this._elapsedSeconds = Math.floor(wallElapsed / 1000);

    // 전환: reading → solving
    if (this._phase === 'reading' && this._elapsedSeconds >= READING_SECONDS) {
      this._phase = 'solving';
      this.emit('phase-change', 'solving');
    }

    // 전환: solving → finished (시간 초과)
    if (this._phase === 'solving' && this._elapsedSeconds >= TOTAL_SECONDS) {
      this._phase = 'finished';
      this._stopTick();
      this.emit('timeout', this._elapsedSeconds);
      this.emit('snapshot-due', this._elapsedSeconds);
      this.emit('phase-change', 'finished');
      this.emit('state', this.getState());
      return;
    }

    // 풀기 단계에서 3분마다 자동 스냅샷
    if (this._phase === 'solving') {
      if (this._elapsedSeconds - this._lastSnapshotAt >= SNAPSHOT_INTERVAL_SECONDS) {
        this._lastSnapshotAt = this._elapsedSeconds;
        this.emit('snapshot-due', this._elapsedSeconds);
      }
    }

    this.emit('state', this.getState());
  }
}
