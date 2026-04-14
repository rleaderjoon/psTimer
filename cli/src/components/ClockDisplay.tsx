import { Text } from 'ink';
import type { Phase } from '../core/TimerEngine.js';

interface Props {
  readingElapsed: number;  // 읽기 단계 경과 초 (0~900)
  solvingElapsed: number;  // 풀이 단계 경과 초 (0~2700)
  phase: Phase;
  paused: boolean;
}

function fmt(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const READING_SECONDS = 15 * 60;   // 900
const SOLVING_SECONDS = 45 * 60;   // 2700

export function ClockDisplay({ readingElapsed, solvingElapsed, phase, paused }: Props) {
  if (phase === 'idle') {
    return <Text color="gray">--:--</Text>;
  }

  if (phase === 'finished') {
    return <Text color="green" bold>완료</Text>;
  }

  // reading: 15:00 → 00:00 카운트다운
  // solving: 45:00 → 00:00 카운트다운
  const remaining =
    phase === 'reading'
      ? READING_SECONDS - readingElapsed
      : SOLVING_SECONDS - solvingElapsed;

  const color = paused ? 'yellow' : phase === 'reading' ? 'red' : 'green';
  const pauseLabel = paused ? ' [일시정지]' : '';

  return (
    <Text color={color} bold>
      {fmt(Math.max(0, remaining))}{pauseLabel}
    </Text>
  );
}
