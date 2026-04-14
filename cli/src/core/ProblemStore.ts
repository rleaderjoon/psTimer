import * as fs from 'fs';
import * as path from 'path';

export interface ProblemRecord {
  id: string;              // BOJ 문제 번호 (URL에서 추출)
  url: string;
  title?: string;
  startedAt: string;       // ISO timestamp
  solvedSeconds?: number;  // undefined = 시간 초과 또는 진행 중
  snapshotCount: number;
  workDir: string;         // 절대 경로
  javaFiles: string[];     // workDir 기준 상대 경로
}

function getProblemFilePath(workDir: string): string {
  return path.join(workDir, '.ps-timer', 'problem.json');
}

export const ProblemStore = {
  load(workDir: string): ProblemRecord[] {
    const filePath = getProblemFilePath(workDir);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as { problems?: ProblemRecord[] };
      return data.problems ?? [];
    } catch {
      return [];
    }
  },

  save(workDir: string, records: ProblemRecord[]): void {
    const filePath = getProblemFilePath(workDir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ problems: records }, null, 2), 'utf-8');
  },

  add(workDir: string, record: ProblemRecord): void {
    const records = ProblemStore.load(workDir);
    records.push(record);
    ProblemStore.save(workDir, records);
  },

  markSolved(workDir: string, id: string, solvedSeconds: number): void {
    const records = ProblemStore.load(workDir);
    const rec = records.find((r) => r.id === id);
    if (rec) {
      rec.solvedSeconds = solvedSeconds;
      ProblemStore.save(workDir, records);
    }
  },

  updateSnapshotCount(workDir: string, id: string, count: number): void {
    const records = ProblemStore.load(workDir);
    const rec = records.find((r) => r.id === id);
    if (rec) {
      rec.snapshotCount = count;
      ProblemStore.save(workDir, records);
    }
  },

  updateTitle(workDir: string, id: string, title: string): void {
    const records = ProblemStore.load(workDir);
    const rec = records.find((r) => r.id === id);
    if (rec && !rec.title) {
      rec.title = title;
      ProblemStore.save(workDir, records);
    }
  },
};
