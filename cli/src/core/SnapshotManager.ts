import * as fs from 'fs';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';

export interface SnapshotMetadata {
  problemId: string;
  snapshotIndex: number;  // 1-based, 파일별로 독립적
  elapsedSeconds: number;
  capturedAt: string;     // ISO timestamp
  javaFile: string;       // 파일 basename (예: "Main.java")
}

export class SnapshotManager {
  private readonly snapshotDir: string;
  private readonly metadataPath: string;

  constructor(workDir: string, private readonly problemId: string) {
    this.snapshotDir = path.join(workDir, '.ps-timer', 'snapshots', problemId);
    this.metadataPath = path.join(this.snapshotDir, 'metadata.json');
  }

  capture(javaFilePath: string, elapsedSeconds: number): void {
    let content: string;
    try {
      content = fs.readFileSync(javaFilePath, 'utf-8');
    } catch {
      return;
    }

    const existing = this.loadMetadata();
    const javaFile = path.basename(javaFilePath);
    const snapshotIndex = existing.filter((m) => m.javaFile === javaFile).length + 1;
    const ext = path.extname(javaFilePath) || '.java';
    const filename = `snapshot_${snapshotIndex}_${javaFile.replace(/\./g, '_')}${ext}`;
    const snapshotPath = path.join(this.snapshotDir, filename);

    fs.mkdirSync(this.snapshotDir, { recursive: true });
    fs.writeFileSync(snapshotPath, content, 'utf-8');

    const entry: SnapshotMetadata = {
      problemId: this.problemId,
      snapshotIndex,
      elapsedSeconds,
      capturedAt: new Date().toISOString(),
      javaFile,
    };
    existing.push(entry);
    fs.writeFileSync(this.metadataPath, JSON.stringify(existing, null, 2), 'utf-8');
  }

  listSnapshots(javaFile?: string): SnapshotMetadata[] {
    const all = this.loadMetadata();
    return javaFile ? all.filter((m) => m.javaFile === javaFile) : all;
  }

  getContent(snapshotIndex: number, javaFile: string): string {
    const ext = path.extname(javaFile) || '.java';
    const filename = `snapshot_${snapshotIndex}_${javaFile.replace(/\./g, '_')}${ext}`;
    const snapshotPath = path.join(this.snapshotDir, filename);
    try {
      return fs.readFileSync(snapshotPath, 'utf-8');
    } catch {
      return '';
    }
  }

  getDiff(snapshotIndex: number, javaFile: string): string {
    if (snapshotIndex <= 1) {
      const curr = this.getContent(1, javaFile);
      return createTwoFilesPatch('(없음)', `snapshot_1`, '', curr);
    }
    const prev = this.getContent(snapshotIndex - 1, javaFile);
    const curr = this.getContent(snapshotIndex, javaFile);
    return createTwoFilesPatch(
      `snapshot_${snapshotIndex - 1}`,
      `snapshot_${snapshotIndex}`,
      prev,
      curr,
    );
  }

  getTotalCount(javaFile?: string): number {
    return this.listSnapshots(javaFile).length;
  }

  private loadMetadata(): SnapshotMetadata[] {
    try {
      const raw = fs.readFileSync(this.metadataPath, 'utf-8');
      return JSON.parse(raw) as SnapshotMetadata[];
    } catch {
      return [];
    }
  }
}
