import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProblemStore, type ProblemRecord } from '../core/ProblemStore.js';
import { SnapshotManager } from '../core/SnapshotManager.js';
import { SnapshotDiff } from '../components/SnapshotDiff.js';
import { StatusLine } from '../components/StatusLine.js';
import type { CliConfig } from '../core/ConfigStore.js';

interface Props {
  config: CliConfig;
  onBack: () => void;
}

type View = 'list' | 'detail';

const READING_SECONDS = 15 * 60;

function fmtSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}분 ${s}초` : `${m}분`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function HistoryScreen({ config, onBack }: Props) {
  const [problems, setProblems] = useState<ProblemRecord[]>([]);
  const [view, setView] = useState<View>('list');
  const [listIndex, setListIndex] = useState(0);

  // 상세 뷰 상태
  const [selectedProblem, setSelectedProblem] = useState<ProblemRecord | null>(null);
  const [snapshotList, setSnapshotList] = useState<Array<{ index: number; elapsed: number }>>([]);
  const [diffIndex, setDiffIndex] = useState(1); // 1-based snapshot index
  const [diffText, setDiffText] = useState('');
  const [targetFile, setTargetFile] = useState('');

  useEffect(() => {
    const records = ProblemStore.load(config.workDir);
    // 최신순 정렬
    setProblems([...records].reverse());
  }, [config.workDir]);

  // 상세 뷰 진입 시 스냅샷 목록 로드
  const openDetail = (problem: ProblemRecord) => {
    setSelectedProblem(problem);
    const javaFile = problem.javaFiles[0] ?? '';
    setTargetFile(javaFile);

    if (javaFile) {
      const manager = new SnapshotManager(problem.workDir, problem.id);
      const snapshots = manager.listSnapshots(javaFile);
      const list = snapshots.map((s) => ({ index: s.snapshotIndex, elapsed: s.elapsedSeconds }));
      setSnapshotList(list);

      if (list.length > 0) {
        const firstIndex = list[0]?.index ?? 1;
        setDiffIndex(firstIndex);
        setDiffText(manager.getDiff(firstIndex, javaFile));
      } else {
        setDiffText('');
      }
    } else {
      setSnapshotList([]);
      setDiffText('');
    }

    setView('detail');
  };

  const navigateDiff = (direction: 'left' | 'right') => {
    if (!selectedProblem || snapshotList.length === 0) return;
    const currentPos = snapshotList.findIndex((s) => s.index === diffIndex);
    const nextPos =
      direction === 'left'
        ? Math.max(0, currentPos - 1)
        : Math.min(snapshotList.length - 1, currentPos + 1);
    const nextSnap = snapshotList[nextPos];
    if (!nextSnap) return;

    setDiffIndex(nextSnap.index);
    const manager = new SnapshotManager(selectedProblem.workDir, selectedProblem.id);
    setDiffText(manager.getDiff(nextSnap.index, targetFile));
  };

  // 키 입력 처리
  useInput((input, key) => {
    if (view === 'list') {
      if (key.upArrow) setListIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setListIndex((i) => Math.min(problems.length - 1, i + 1));
      else if (key.return) {
        const problem = problems[listIndex];
        if (problem) openDetail(problem);
      } else if (key.escape || input === 'q') onBack();
    } else {
      // detail 뷰
      if (key.leftArrow) navigateDiff('left');
      else if (key.rightArrow) navigateDiff('right');
      else if (key.escape || input === 'q') setView('list');
    }
  });

  // ── 목록 뷰 ────────────────────────────────────────────────────────────────
  if (view === 'list') {
    if (problems.length === 0) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text bold color="cyan">문제 이력</Text>
          <Text dimColor>아직 풀었던 문제가 없습니다.</Text>
          <StatusLine hints={[{ key: 'q/Esc', label: '뒤로' }]} />
        </Box>
      );
    }

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">문제 이력 ({problems.length}개)</Text>
        <Text dimColor>↑↓ 탐색  |  Enter 상세보기  |  q 뒤로</Text>
        <Box marginTop={1} flexDirection="column">
          {problems.map((p, i) => {
            const isSel = i === listIndex;
            const statusIcon = p.solvedSeconds !== undefined ? '✓' : '✗';
            const statusColor = p.solvedSeconds !== undefined ? 'green' : 'yellow';
            return (
              <Box key={p.id + p.startedAt} paddingLeft={isSel ? 0 : 2}>
                {isSel && <Text color="cyan">▶ </Text>}
                <Text color={statusColor}>[{statusIcon}] </Text>
                <Text bold={isSel}>
                  BOJ {p.id}{p.title ? ` · ${p.title}` : ''}
                </Text>
                <Text dimColor>
                  {'  '}
                  {p.solvedSeconds !== undefined
                    ? `총 ${fmtSeconds(p.solvedSeconds)} (풀이 ${fmtSeconds(p.solvedSeconds - READING_SECONDS)})`
                    : '미완'}
                  {'  '}
                  {fmtDate(p.startedAt)}
                </Text>
              </Box>
            );
          })}
        </Box>
        <StatusLine hints={[{ key: '↑↓', label: '탐색' }, { key: 'Enter', label: '상세' }, { key: 'q', label: '뒤로' }]} />
      </Box>
    );
  }

  // ── 상세 뷰 ────────────────────────────────────────────────────────────────
  if (!selectedProblem) return null;

  const solvingSeconds =
    selectedProblem.solvedSeconds !== undefined
      ? Math.max(0, selectedProblem.solvedSeconds - READING_SECONDS)
      : undefined;

  const currentSnapPos = snapshotList.findIndex((s) => s.index === diffIndex);
  const currentSnap = snapshotList[currentSnapPos];

  return (
    <Box flexDirection="column" padding={1}>
      {/* 문제 정보 */}
      <Text bold color="cyan">
        BOJ {selectedProblem.id}{selectedProblem.title ? ` · ${selectedProblem.title}` : ''}
      </Text>
      <Text dimColor>{selectedProblem.url}</Text>
      {solvingSeconds !== undefined ? (
        <>
          <Text color="green">정답</Text>
          <Text dimColor>
            읽기: {fmtSeconds(READING_SECONDS)}  +  풀이: {fmtSeconds(solvingSeconds)}  =  총: {fmtSeconds(selectedProblem.solvedSeconds!)}
          </Text>
        </>
      ) : (
        <Text color="yellow">미완</Text>
      )}
      <Text dimColor>
        시작: {fmtDate(selectedProblem.startedAt)}  |  스냅샷: {snapshotList.length}개
      </Text>

      {/* 스냅샷 diff */}
      <Box marginTop={1} flexDirection="column">
        {snapshotList.length === 0 ? (
          <Text dimColor>저장된 스냅샷이 없습니다.</Text>
        ) : (
          <>
            <Box>
              <Text color="yellow">
                스냅샷 {currentSnapPos + 1}/{snapshotList.length}
              </Text>
              {currentSnap && (
                <Text dimColor>
                  {'  '}({fmtSeconds(currentSnap.elapsed)} 경과 시점)
                </Text>
              )}
              <Text dimColor>  ← → 이동</Text>
            </Box>
            <Box marginTop={1} borderStyle="single" paddingX={1}>
              <SnapshotDiff diffText={diffText} maxLines={25} />
            </Box>
          </>
        )}
      </Box>

      <StatusLine
        hints={[
          { key: '←→', label: '스냅샷 이동' },
          { key: 'q/Esc', label: '목록으로' },
        ]}
      />
    </Box>
  );
}
