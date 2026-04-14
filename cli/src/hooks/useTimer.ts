import { useState, useEffect, useRef } from 'react';
import { TimerEngine, type TimerState, type Phase, SNAPSHOT_INTERVAL_SECONDS } from '../core/TimerEngine.js';

interface UseTimerOptions {
  onSnapshotDue?: (elapsedSeconds: number) => void;
  onPhaseChange?: (phase: Phase) => void;
  onSolved?: (elapsedSeconds: number) => void;
  onTimeout?: (elapsedSeconds: number) => void;
}

const INITIAL_STATE: TimerState = {
  phase: 'idle',
  paused: false,
  elapsedSeconds: 0,
  readingElapsed: 0,
  solvingElapsed: 0,
  nextSnapshotIn: SNAPSHOT_INTERVAL_SECONDS,
};

export function useTimer(options?: UseTimerOptions) {
  const [state, setState] = useState<TimerState>(INITIAL_STATE);
  const engineRef = useRef<TimerEngine | null>(null);
  // ref로 최신 옵션을 유지해 re-subscription 없이 항상 최신 콜백을 호출합니다.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const engine = new TimerEngine();
    engineRef.current = engine;

    engine.on('state', (s: TimerState) => setState(s));
    engine.on('snapshot-due', (elapsed: number) =>
      optionsRef.current?.onSnapshotDue?.(elapsed),
    );
    engine.on('phase-change', (phase: Phase) =>
      optionsRef.current?.onPhaseChange?.(phase),
    );
    engine.on('solved', (elapsed: number) =>
      optionsRef.current?.onSolved?.(elapsed),
    );
    engine.on('timeout', (elapsed: number) =>
      optionsRef.current?.onTimeout?.(elapsed),
    );

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return {
    state,
    start: () => engineRef.current?.start(),
    togglePause: () => engineRef.current?.togglePause(),
    reset: () => engineRef.current?.reset(),
    markSolved: () => engineRef.current?.markSolved(),
  };
}
