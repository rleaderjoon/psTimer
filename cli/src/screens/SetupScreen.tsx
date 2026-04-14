import { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import * as fs from 'fs';
import * as path from 'path';
import type { CliConfig } from '../core/ConfigStore.js';

interface Props {
  onComplete: (config: CliConfig) => void;
}

type Step = 'folder' | 'files';

interface FolderItem {
  label: string;
  value: string;
}

export function SetupScreen({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('folder');
  const [currentPath, setCurrentPath] = useState(() => process.cwd());
  const [selectedFolder, setSelectedFolder] = useState('');
  const [javaFiles, setJavaFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fileIndex, setFileIndex] = useState(0);
  const [noSelectionWarning, setNoSelectionWarning] = useState(false);

  // 폴더 탐색 아이템
  const folderItems: FolderItem[] = useMemo(() => {
    const items: FolderItem[] = [
      { label: '[ ✓ 이 폴더 선택 ]', value: '__select__' },
    ];
    if (path.dirname(currentPath) !== currentPath) {
      items.push({ label: '[ .. 상위 폴더 ]', value: '__up__' });
    }
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const d of dirs) {
        items.push({ label: `📁 ${d.name}`, value: d.name });
      }
    } catch {
      // 접근 불가 폴더
    }
    return items;
  }, [currentPath]);

  const handleFolderSelect = ({ value }: FolderItem) => {
    if (value === '__select__') {
      // Java 파일 목록 수집
      let files: string[] = [];
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        files = entries
          .filter((e) => e.isFile() && e.name.endsWith('.java'))
          .map((e) => e.name)
          .sort();
      } catch {
        // 접근 불가
      }
      setSelectedFolder(currentPath);
      setJavaFiles(files);
      // 파일이 하나뿐이면 자동 선택
      setSelected(files.length === 1 ? new Set(files) : new Set());
      setFileIndex(0);
      setNoSelectionWarning(false);
      if (files.length === 0) {
        // Java 파일이 없어도 폴더만 선택하여 진행
        onComplete({
          workDir: currentPath,
          javaFiles: [],
          lastUsed: new Date().toISOString(),
        });
      } else {
        setStep('files');
      }
    } else if (value === '__up__') {
      setCurrentPath(path.dirname(currentPath));
    } else {
      setCurrentPath(path.join(currentPath, value));
    }
  };

  // 파일 선택 단계: 방향키 + Space + Enter
  useInput(
    (input, key) => {
      if (step !== 'files') return;
      if (key.upArrow) {
        setFileIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setFileIndex((i) => Math.min(javaFiles.length - 1, i + 1));
      } else if (input === ' ') {
        const file = javaFiles[fileIndex];
        if (!file) return;
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(file)) next.delete(file);
          else next.add(file);
          return next;
        });
      } else if (key.return) {
        if (selected.size === 0) {
          setNoSelectionWarning(true);
          return;
        }
        setNoSelectionWarning(false);
        onComplete({
          workDir: selectedFolder,
          javaFiles: Array.from(selected),
          lastUsed: new Date().toISOString(),
        });
      } else {
        setNoSelectionWarning(false);
      }
    },
    { isActive: step === 'files' },
  );

  if (step === 'folder') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">psTimer — 폴더 설정</Text>
        <Text dimColor>현재 위치: {currentPath}</Text>
        <Box marginTop={1}>
          {/* key를 currentPath로 설정해 경로 변경 시 SelectInput을 리셋 */}
          <SelectInput key={currentPath} items={folderItems} onSelect={handleFolderSelect} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">psTimer — Java 파일 선택</Text>
      <Text dimColor>폴더: {selectedFolder}</Text>
      <Text dimColor>Space: 선택/해제  |  Enter: 확인</Text>
      {noSelectionWarning && (
        <Text color="red">파일을 하나 이상 선택하세요 (Space키)</Text>
      )}
      <Box marginTop={1} flexDirection="column">
        {javaFiles.map((file, i) => (
          <Text key={file} color={i === fileIndex ? 'cyan' : undefined}>
            {i === fileIndex ? '▶ ' : '  '}
            {selected.has(file) ? '[✓] ' : '[ ] '}
            {file}
          </Text>
        ))}
      </Box>
      {selected.size > 0 && (
        <Box marginTop={1}>
          <Text color="green">선택됨: {Array.from(selected).join(', ')}</Text>
        </Box>
      )}
    </Box>
  );
}
