import * as fs from 'fs';

interface LockedFile {
  content: string;
  interval: ReturnType<typeof setInterval>;
}

/**
 * 읽기 단계(15분) 동안 Java 파일을 1초마다 원본으로 덮어써서 편집을 차단합니다.
 * Windows에서 편집기가 저장해도 1초 내에 원본으로 복원됩니다.
 */
export class FileLock {
  private readonly locked = new Map<string, LockedFile>();

  start(filePath: string): void {
    if (this.locked.has(filePath)) return;

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // 파일을 읽을 수 없으면 잠금 없이 타이머만 동작
      return;
    }

    const interval = setInterval(() => {
      try {
        fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'w' });
      } catch {
        // 쓰기 실패(권한, 바이러스 백신 등)는 조용히 무시
      }
    }, 1000);

    this.locked.set(filePath, { content, interval });
  }

  stop(): void {
    for (const { interval } of this.locked.values()) {
      clearInterval(interval);
    }
    this.locked.clear();
  }

  get isActive(): boolean {
    return this.locked.size > 0;
  }
}
