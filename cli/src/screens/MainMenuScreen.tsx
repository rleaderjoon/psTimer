import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import { extractProblemId } from '../core/TitleFetcher.js';
import { ProblemStore } from '../core/ProblemStore.js';
import { fetchProblemTitle } from '../core/TitleFetcher.js';
import type { CliConfig } from '../core/ConfigStore.js';

interface Props {
  config: CliConfig;
  onStartTimer: (url: string, problemId: string) => void;
  onHistory: () => void;
  onSetup: () => void;
}

type MenuStep = 'menu' | 'url-input' | 'url-error' | 'no-java-files';

const MENU_ITEMS = [
  { label: '새 문제 풀기', value: 'start' },
  { label: '풀었던 문제 보기', value: 'history' },
  { label: '설정 변경', value: 'setup' },
] as const;

export function MainMenuScreen({ config, onStartTimer, onHistory, onSetup }: Props) {
  const [step, setStep] = useState<MenuStep>('menu');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

  const handleMenuSelect = ({ value }: { value: string }) => {
    if (value === 'start') {
      if (config.javaFiles.length === 0) { setStep('no-java-files'); return; }
      setStep('url-input');
    }
    else if (value === 'history') onHistory();
    else if (value === 'setup') onSetup();
  };

  const handleUrlSubmit = async (url: string) => {
    const trimmed = url.trim();
    const problemId = extractProblemId(trimmed);
    if (!problemId) {
      setUrlError('백준 문제 URL을 입력해주세요. (예: https://www.acmicpc.net/problem/1000)');
      setStep('url-error');
      return;
    }

    // 문제 레코드를 미리 등록
    ProblemStore.add(config.workDir, {
      id: problemId,
      url: trimmed,
      startedAt: new Date().toISOString(),
      snapshotCount: 0,
      workDir: config.workDir,
      javaFiles: config.javaFiles,
    });

    // 백그라운드에서 제목 가져오기
    fetchProblemTitle(trimmed).then((title) => {
      if (title) ProblemStore.updateTitle(config.workDir, problemId, title);
    });

    onStartTimer(trimmed, problemId);
  };

  if (step === 'menu') {
    const problems = ProblemStore.load(config.workDir);
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">psTimer</Text>
        <Text dimColor>폴더: {config.workDir}</Text>
        {config.javaFiles.length > 0
          ? <Text dimColor>추적 파일: {config.javaFiles.join(', ')}</Text>
          : <Text color="yellow">⚠ 추적 파일 미설정 — 스냅샷이 저장되지 않습니다. "설정 변경"을 선택하세요.</Text>
        }
        {problems.length > 0 && (
          <Text dimColor>총 {problems.length}개 문제 이력</Text>
        )}
        <Box marginTop={1}>
          <SelectInput items={MENU_ITEMS as unknown as Array<{ label: string; value: string }>} onSelect={handleMenuSelect} />
        </Box>
      </Box>
    );
  }

  if (step === 'url-error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{urlError}</Text>
        <Text dimColor>Enter를 눌러 다시 시도하세요</Text>
        <TextInput
          value=""
          onChange={() => {}}
          onSubmit={() => { setStep('url-input'); setUrlInput(''); }}
          placeholder="Enter를 눌러 계속..."
        />
      </Box>
    );
  }

  if (step === 'no-java-files') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Java 파일이 설정되지 않아 타이머를 시작할 수 없습니다.</Text>
        <Text dimColor>추적할 .java 파일을 먼저 선택해야 스냅샷이 저장됩니다.</Text>
        <Text dimColor>Enter를 눌러 설정 화면으로 이동하세요</Text>
        <TextInput
          value=""
          onChange={() => {}}
          onSubmit={() => onSetup()}
          placeholder="Enter를 눌러 계속..."
        />
      </Box>
    );
  }

  // url-input 단계
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>백준 문제 URL 입력</Text>
      <Text dimColor>예: https://www.acmicpc.net/problem/1000</Text>
      <Box marginTop={1}>
        <Text>URL: </Text>
        <TextInput
          value={urlInput}
          onChange={setUrlInput}
          onSubmit={handleUrlSubmit}
          placeholder="https://www.acmicpc.net/problem/..."
        />
      </Box>
    </Box>
  );
}
