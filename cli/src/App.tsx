import { useState, useEffect } from 'react';
import { Text } from 'ink';
import { ConfigStore, type CliConfig } from './core/ConfigStore.js';
import { SetupScreen } from './screens/SetupScreen.js';
import { MainMenuScreen } from './screens/MainMenuScreen.js';
import { TimerScreen } from './screens/TimerScreen.js';
import { HistoryScreen } from './screens/HistoryScreen.js';

type Screen =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'menu' }
  | { name: 'timer'; url: string; problemId: string }
  | { name: 'history' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [config, setConfig] = useState<CliConfig | null>(null);

  useEffect(() => {
    const cfg = ConfigStore.load();
    if (!cfg) {
      setScreen({ name: 'setup' });
    } else {
      setConfig(cfg);
      setScreen({ name: 'menu' });
    }
  }, []);

  const handleSetupComplete = (cfg: CliConfig) => {
    ConfigStore.save(cfg);
    setConfig(cfg);
    setScreen({ name: 'menu' });
  };

  if (screen.name === 'loading') {
    return <Text dimColor>로딩 중...</Text>;
  }

  if (screen.name === 'setup') {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  if (!config) return <Text color="red">설정 오류</Text>;

  if (screen.name === 'menu') {
    return (
      <MainMenuScreen
        config={config}
        onStartTimer={(url, problemId) => setScreen({ name: 'timer', url, problemId })}
        onHistory={() => setScreen({ name: 'history' })}
        onSetup={() => setScreen({ name: 'setup' })}
      />
    );
  }

  if (screen.name === 'timer') {
    return (
      <TimerScreen
        config={config}
        problemUrl={screen.url}
        problemId={screen.problemId}
        onBack={() => setScreen({ name: 'menu' })}
        onHistory={() => setScreen({ name: 'history' })}
      />
    );
  }

  if (screen.name === 'history') {
    return (
      <HistoryScreen
        config={config}
        onBack={() => setScreen({ name: 'menu' })}
      />
    );
  }

  return null;
}
