import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import * as path from 'path';
import { useTimer } from '../hooks/useTimer.js';
import { ClockDisplay } from '../components/ClockDisplay.js';
import { PhaseBar } from '../components/PhaseBar.js';
import { StatusLine } from '../components/StatusLine.js';
import { FileLock } from '../core/FileLock.js';
import { SnapshotManager } from '../core/SnapshotManager.js';
import { ProblemStore } from '../core/ProblemStore.js';
import type { CliConfig } from '../core/ConfigStore.js';

const TOTAL_SECONDS = 60 * 60;
const READING_SECONDS = 15 * 60;

interface Props {
  config: CliConfig;
  problemUrl: string;
  problemId: string;
  onBack: () => void;
  onHistory: () => void;
}

interface FinishedInfo {
  solved: boolean;
  seconds: number;
}

function fmtSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

export function TimerScreen({ config, problemUrl, problemId, onBack, onHistory }: Props) {
  const fileLockRef = useRef(new FileLock());
  const snapshotManagerRef = useRef(new SnapshotManager(config.workDir, problemId));
  const [finishedInfo, setFinishedInfo] = useState<FinishedInfo | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [showLockNotice, setShowLockNotice] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const { state, start, togglePause, reset, markSolved } = useTimer({
    onPhaseChange: (phase) => {
      if (phase === 'reading') {
        // 읽기 단계 시작: 추적 중인 모든 Java 파일 잠금
        for (const javaFile of config.javaFiles) {
          const fullPath = path.join(config.workDir, javaFile);
          fileLockRef.current.start(fullPath);
        }
        setShowLockNotice(config.javaFiles.length > 0);
      } else if (phase === 'solving') {
        fileLockRef.current.stop();
        setShowLockNotice(false);
      } else if (phase === 'finished' || phase === 'idle') {
        fileLockRef.current.stop();
        setShowLockNotice(false);
      }
    },
    onSnapshotDue: (elapsed) => {
      for (const javaFile of config.javaFiles) {
        const fullPath = path.join(config.workDir, javaFile);
        snapshotManagerRef.current.capture(fullPath, elapsed);
      }
      const count = snapshotManagerRef.current.getTotalCount();
      setSnapshotCount(count);
      ProblemStore.updateSnapshotCount(config.workDir, problemId, count);
    },
    onSolved: (elapsed) => {
      // 정답 시 최종 스냅샷 저장
      for (const javaFile of config.javaFiles) {
        const fullPath = path.join(config.workDir, javaFile);
        snapshotManagerRef.current.capture(fullPath, elapsed);
      }
      const count = snapshotManagerRef.current.getTotalCount();
      ProblemStore.markSolved(config.workDir, problemId, elapsed);
      ProblemStore.updateSnapshotCount(config.workDir, problemId, count);
      setFinishedInfo({ solved: true, seconds: elapsed });
    },
    onTimeout: (elapsed) => {
      ProblemStore.updateSnapshotCount(
        config.workDir,
        problemId,
        snapshotManagerRef.current.getTotalCount(),
      );
      setFinishedInfo({ solved: false, seconds: elapsed });
    },
  });

  // 마운트 시 자동 시작
  useEffect(() => {
    start();
    // 언마운트 시 파일 잠금 해제
    return () => fileLockRef.current.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInput((input, key) => {
    if (finishedInfo) {
      if (input === 'h') onHistory();
      if (input === 'n' || key.return) onBack();
      return;
    }

    if (confirmQuit) {
      if (input === 'y') { fileLockRef.current.stop(); reset(); onBack(); }
      else { setConfirmQuit(false); }
      return;
    }

    if (input === 'p') togglePause();
    if (input === 's' && state.phase === 'solving') markSolved();
    if (input === 'r' || input === 'q') setConfirmQuit(true);
  });

  const phaseName =
    state.phase === 'reading'
      ? '읽기'
      : state.phase === 'solving'
      ? '풀기'
      : state.phase === 'finished'
      ? '완료'
      : '대기';

  const phaseColor =
    state.phase === 'reading' ? 'red' : state.phase === 'solving' ? 'green' : 'gray';

  // ── 완료 화면 ─────────────────────────────────────────────────────────────
  if (finishedInfo) {
    const readingTime = Math.min(finishedInfo.seconds, READING_SECONDS);
    const solvingTime = Math.max(0, finishedInfo.seconds - READING_SECONDS);
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={finishedInfo.solved ? 'green' : 'yellow'}>
          {finishedInfo.solved ? '정답!' : '시간 초과'}
        </Text>
        <Text>
          읽기: {fmtSeconds(readingTime)}  +  풀이: {fmtSeconds(solvingTime)}  =  총: {fmtSeconds(finishedInfo.seconds)}
        </Text>
        <Text dimColor>저장된 스냅샷: {snapshotCount}개</Text>
        <Text dimColor>문제: {problemUrl}</Text>
        <StatusLine
          hints={[
            { key: 'n', label: '새 문제' },
            { key: 'h', label: '문제 이력' },
          ]}
        />
      </Box>
    );
  }

  // ── 종료 확인 ─────────────────────────────────────────────────────────────
  if (confirmQuit) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">타이머를 종료하고 메뉴로 돌아가시겠습니까?</Text>
        <Text dimColor>[y] 예  |  다른 키: 취소</Text>
      </Box>
    );
  }

  // ── 타이머 화면 ─────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" padding={1}>
      {/* 헤더 */}
      <Box>
        <Text bold color={phaseColor}>[{phaseName} 단계]  </Text>
        <ClockDisplay
          readingElapsed={state.readingElapsed}
          solvingElapsed={state.solvingElapsed}
          phase={state.phase}
          paused={state.paused}
        />
      </Box>

      {/* 진행 바 */}
      <Box marginTop={1}>
        <PhaseBar elapsedSeconds={state.elapsedSeconds} phase={state.phase} />
      </Box>

      {/* 읽기 단계 잠금 안내 */}
      {state.phase === 'reading' && (
        <Box marginTop={1} flexDirection="column">
          {showLockNotice && (
            <Text color="red">파일 잠금 활성 — 편집 내용이 자동으로 복원됩니다</Text>
          )}
          <Text dimColor>15분 후 코딩을 시작할 수 있습니다</Text>
        </Box>
      )}

      {/* 풀기 단계: 스냅샷 카운트다운 */}
      {state.phase === 'solving' && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>
            다음 스냅샷까지: {Math.floor(state.nextSnapshotIn / 60)}분{' '}
            {state.nextSnapshotIn % 60}초  |  저장됨: {snapshotCount}개
          </Text>
        </Box>
      )}

      {/* 문제 정보 */}
      <Box marginTop={1}>
        <Text dimColor>문제: {problemUrl}</Text>
      </Box>

      {/* 키 힌트 */}
      <StatusLine
        hints={[
          { key: 'p', label: state.paused ? '재개' : '일시정지' },
          ...(state.phase === 'solving' ? [{ key: 's', label: '정답' }] : []),
          { key: 'r/q', label: '종료' },
        ]}
      />
    </Box>
  );
}
