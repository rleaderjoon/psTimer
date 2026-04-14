import { useState } from 'react';
import { useInput } from 'ink';

interface UseKeyNavOptions {
  itemCount: number;
  isActive?: boolean;
  onEnter?: (index: number) => void;
  onEscape?: () => void;
}

/**
 * ↑↓ 방향키로 리스트를 탐색하고 Enter/Escape를 처리하는 훅입니다.
 */
export function useKeyNav({ itemCount, isActive = true, onEnter, onEscape }: UseKeyNavOptions) {
  const [index, setIndex] = useState(0);

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setIndex((i) => Math.min(itemCount - 1, i + 1));
      } else if (key.return) {
        onEnter?.(index);
      } else if (key.escape) {
        onEscape?.();
      }
    },
    { isActive },
  );

  return { index, setIndex };
}
