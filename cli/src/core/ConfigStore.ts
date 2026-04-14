import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CliConfig {
  workDir: string;       // 추적 폴더 절대 경로
  javaFiles: string[];   // workDir 기준 상대 경로 (예: ["Main.java"])
  lastUsed: string;      // ISO timestamp
}

function getConfigPath(): string {
  const base = process.env['APPDATA'] ?? path.join(os.homedir(), '.config');
  return path.join(base, 'ps-timer', 'config.json');
}

export const ConfigStore = {
  load(): CliConfig | null {
    const configPath = getConfigPath();
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw) as CliConfig;
    } catch {
      return null;
    }
  },

  save(config: CliConfig): void {
    const configPath = getConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  },

  clear(): void {
    const configPath = getConfigPath();
    try {
      fs.unlinkSync(configPath);
    } catch {
      // Ignore if file doesn't exist
    }
  },
};
