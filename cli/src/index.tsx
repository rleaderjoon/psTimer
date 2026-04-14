import { render } from 'ink';
import { App } from './App.js';

// SIGTERM 시 정상 종료 (SIGINT는 ink가 자체 처리)
process.on('SIGTERM', () => {
  process.exit(0);
});

render(<App />);
