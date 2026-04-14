import { Box, Text } from 'ink';
import type { Phase } from '../core/TimerEngine.js';

interface Props {
  elapsedSeconds: number;
  phase: Phase;
}

const READING_SECONDS = 15 * 60;
const TOTAL_SECONDS = 60 * 60;
const BAR_WIDTH = 40;

// Windows Terminal은 Unicode를 지원하지만 cmd는 지원하지 않을 수 있으므로 ASCII fallback
const isWindowsTerminal = Boolean(process.env['WT_SESSION']);
const FILLED = isWindowsTerminal ? '█' : '=';
const EMPTY = isWindowsTerminal ? '░' : '-';

export function PhaseBar({ elapsedSeconds, phase }: Props) {
  if (phase === 'idle') {
    return (
      <Box>
        <Text dimColor>{EMPTY.repeat(BAR_WIDTH)}</Text>
      </Box>
    );
  }

  // 읽기 구간: 왼쪽 25%
  const readingWidth = Math.round(BAR_WIDTH * 0.25);
  const solvingWidth = BAR_WIDTH - readingWidth;

  let readingFilled = 0;
  let solvingFilled = 0;

  if (phase === 'reading') {
    readingFilled = Math.round((elapsedSeconds / READING_SECONDS) * readingWidth);
  } else if (phase === 'solving' || phase === 'finished') {
    readingFilled = readingWidth;
    const solvingElapsed = elapsedSeconds - READING_SECONDS;
    const solvingTotal = TOTAL_SECONDS - READING_SECONDS;
    solvingFilled = Math.round((solvingElapsed / solvingTotal) * solvingWidth);
  }

  readingFilled = Math.min(readingFilled, readingWidth);
  solvingFilled = Math.min(solvingFilled, solvingWidth);

  return (
    <Box>
      {/* 읽기 구간 (빨강) */}
      <Text color="red">{FILLED.repeat(readingFilled)}</Text>
      <Text dimColor>{EMPTY.repeat(readingWidth - readingFilled)}</Text>
      {/* 구분자 */}
      <Text color="white">|</Text>
      {/* 풀기 구간 (초록) */}
      <Text color="green">{FILLED.repeat(solvingFilled)}</Text>
      <Text dimColor>{EMPTY.repeat(solvingWidth - solvingFilled)}</Text>
    </Box>
  );
}
