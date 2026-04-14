import { Box, Text } from 'ink';

interface Props {
  diffText: string;
  maxLines?: number;
  offset?: number;
}

/**
 * unified diff 문자열을 git diff 스타일로 컬러 렌더링합니다.
 *   + 줄  → 녹색
 *   - 줄  → 빨강
 *   @@ 줄 → 청록
 *   --- / +++ → dim
 *   나머지 → 기본색
 */
export function SnapshotDiff({ diffText, maxLines = 30, offset = 0 }: Props) {
  if (!diffText || diffText.trim() === '') {
    return <Text dimColor>(변경사항 없음)</Text>;
  }

  const lines = diffText.split('\n');
  const visible = lines.slice(offset, offset + maxLines);
  const hasMore = lines.length > offset + maxLines;

  return (
    <Box flexDirection="column">
      {visible.map((line, i) => {
        if (line.startsWith('+++ ') || line.startsWith('--- ')) {
          return <Text key={i} dimColor>{line}</Text>;
        }
        if (line.startsWith('@@')) {
          return <Text key={i} color="cyan">{line}</Text>;
        }
        if (line.startsWith('+')) {
          return <Text key={i} color="green">{line}</Text>;
        }
        if (line.startsWith('-')) {
          return <Text key={i} color="red">{line}</Text>;
        }
        return <Text key={i}>{line}</Text>;
      })}
      {hasMore && (
        <Text dimColor>... ({lines.length - offset - maxLines}줄 더 있음)</Text>
      )}
    </Box>
  );
}
