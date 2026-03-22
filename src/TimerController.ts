import * as vscode from 'vscode';
import * as path from 'path';

export type Phase = 'idle' | 'reading' | 'solving' | 'finished';

export interface TimerState {
    phase: Phase;
    paused: boolean;
    elapsedSeconds: number;
    totalSeconds: number;
    readingSeconds: number;
    nextSnapshotIn: number;
    problemLink?: string;
    similarProblems?: string[];
}

const TOTAL_SECONDS = 60 * 60;    // 3600
const READING_SECONDS = 15 * 60;  // 900

export class TimerController implements vscode.Disposable {
    private _phase: Phase = 'idle';
    private _paused: boolean = false;
    private _elapsedSeconds: number = 0;
    private _lastSnapshotAt: number = 0;

    // Wall-clock timing (drift-proof)
    private _startWallTime: number = 0;
    private _pauseAccumMs: number = 0;
    private _pauseStartAt: number = 0;

    private _problemLink: string | undefined;
    private _similarProblems: string[] = [];

    private _interval: ReturnType<typeof setInterval> | undefined;
    private _blockDisposable: vscode.Disposable | undefined;
    private _undoPending: boolean = false;

    private readonly _stateChangeEmitter = new vscode.EventEmitter<TimerState>();
    readonly onStateChange = this._stateChangeEmitter.event;

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._initProblemWatcher();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    start(): void {
        if (this._phase !== 'idle') { return; }
        this._phase = 'reading';
        this._elapsedSeconds = 0;
        this._lastSnapshotAt = 0;
        this._paused = false;
        this._pauseAccumMs = 0;
        this._startWallTime = Date.now();
        this._installInputBlocker();
        this._startTick();
        this._emit();
    }

    togglePause(): void {
        if (this._phase === 'idle' || this._phase === 'finished') { return; }
        this._paused = !this._paused;
        if (this._paused) {
            this._pauseStartAt = Date.now();
            this._stopTick();
        } else {
            this._pauseAccumMs += Date.now() - this._pauseStartAt;
            this._startTick();
        }
        this._emit();
    }

    reset(): void {
        this._stopTick();
        this._removeInputBlocker();
        this._phase = 'idle';
        this._paused = false;
        this._elapsedSeconds = 0;
        this._lastSnapshotAt = 0;
        this._pauseAccumMs = 0;
        this._emit();
    }

    getState(): TimerState {
        const snapshotIntervalSecs = this._getSnapshotIntervalSeconds();
        const timeSinceLastSnapshot = this._elapsedSeconds - this._lastSnapshotAt;
        const nextSnapshotIn = snapshotIntervalSecs - timeSinceLastSnapshot;
        return {
            phase: this._phase,
            paused: this._paused,
            elapsedSeconds: this._elapsedSeconds,
            totalSeconds: TOTAL_SECONDS,
            readingSeconds: READING_SECONDS,
            nextSnapshotIn: Math.max(0, nextSnapshotIn),
            problemLink: this._problemLink,
            similarProblems: this._similarProblems,
        };
    }

    async setProblemLink(link: string): Promise<void> {
        this._problemLink = link;
        this._similarProblems = []; // Reset similar problems when link changes
        
        // Save to .ps-timer/problem.json for the agent to see
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
        
        const folderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.ps-timer');
        const fileUri = vscode.Uri.joinPath(folderUri, 'problem.json');
        
        try {
            await vscode.workspace.fs.createDirectory(folderUri);
            const data = Buffer.from(JSON.stringify({ link, timestamp: Date.now() }, null, 2), 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, data);
            
            vscode.window.showInformationMessage(
                `Problem link saved. Ask Antigravity: "Search similar problems for ${link}"`
            );
        } catch (err) {
            console.error('Failed to save problem.json', err);
        }

        this._emit();
    }

    private _initProblemWatcher(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolders[0], '.ps-timer/similar.json')
        );

        const loadSimilar = async () => {
            try {
                const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.ps-timer/similar.json');
                const content = await vscode.workspace.fs.readFile(uri);
                const data = JSON.parse(content.toString());
                if (data.similar && Array.isArray(data.similar)) {
                    this._similarProblems = data.similar;
                    this._emit();
                }
            } catch {
                // Ignore if file doesn't exist yet
            }
        };

        watcher.onDidChange(loadSimilar);
        watcher.onDidCreate(loadSimilar);
        this._context.subscriptions.push(watcher);
        
        loadSimilar(); // Initial load
    }

    dispose(): void {
        this._stopTick();
        this._removeInputBlocker();
        this._stateChangeEmitter.dispose();
    }

    // ── Tick ─────────────────────────────────────────────────────────────────

    private _startTick(): void {
        this._stopTick();
        this._interval = setInterval(() => this._tick(), 500);
    }

    private _stopTick(): void {
        if (this._interval !== undefined) {
            clearInterval(this._interval);
            this._interval = undefined;
        }
    }

    private _tick(): void {
        if (this._paused) { return; }

        // Wall-clock elapsed (drift-proof)
        const wallElapsed = Date.now() - this._startWallTime - this._pauseAccumMs;
        this._elapsedSeconds = Math.floor(wallElapsed / 1000);

        // Transition: reading → solving
        if (this._phase === 'reading' && this._elapsedSeconds >= READING_SECONDS) {
            this._phase = 'solving';
            this._removeInputBlocker();
            vscode.window.showInformationMessage(
                'psTimer: 읽기 시간이 끝났습니다. 이제 코딩을 시작하세요! (45분 남음)'
            );
        }

        // Transition: solving → finished
        if (this._phase === 'solving' && this._elapsedSeconds >= TOTAL_SECONDS) {
            this._phase = 'finished';
            this._stopTick();
            this._takeSnapshot();
            vscode.window.showWarningMessage(
                '⏰ psTimer: 시간이 다 됐습니다! 1시간 세션이 종료되었습니다.',
                'OK'
            );
            this._emit();
            return;
        }

        // Auto-snapshot during solving phase
        if (this._phase === 'solving') {
            const snapshotIntervalSecs = this._getSnapshotIntervalSeconds();
            if (this._elapsedSeconds - this._lastSnapshotAt >= snapshotIntervalSecs) {
                this._takeSnapshot();
            }
        }

        this._emit();
    }

    // ── Input Blocking ────────────────────────────────────────────────────────

    private _installInputBlocker(): void {
        this._blockDisposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (this._phase !== 'reading') { return; }
            if (event.contentChanges.length === 0) { return; }
            if (event.document.uri.scheme !== 'file') { return; }
            if (this._undoPending) { return; }

            this._undoPending = true;
            try {
                await vscode.commands.executeCommand('undo');
            } finally {
                this._undoPending = false;
            }

            vscode.window.setStatusBarMessage(
                '$(lock) psTimer: 읽기 단계 (15분) — 키보드 입력이 차단되어 있습니다.',
                2000
            );
        });
    }

    private _removeInputBlocker(): void {
        if (this._blockDisposable) {
            this._blockDisposable.dispose();
            this._blockDisposable = undefined;
        }
    }

    // ── Snapshots ─────────────────────────────────────────────────────────────

    private async _takeSnapshot(): Promise<void> {
        this._lastSnapshotAt = this._elapsedSeconds;

        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage(
                'psTimer: 워크스페이스 폴더가 없어 스냅샷을 저장할 수 없습니다.'
            );
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri;
        const snapshotFolder = vscode.workspace
            .getConfiguration('psTimer')
            .get<string>('snapshotFolder', 'psTimer_snapshots');

        const mins = Math.floor(this._elapsedSeconds / 60).toString().padStart(2, '0');
        const secs = (this._elapsedSeconds % 60).toString().padStart(2, '0');
        const ext = path.extname(editor.document.fileName) || '.txt';
        const filename = `snapshot_${mins}m${secs}s${ext}`;

        const snapshotUri = vscode.Uri.joinPath(workspaceRoot, snapshotFolder, filename);
        const content = editor.document.getText();
        const encoded = Buffer.from(content, 'utf8');

        try {
            // Ensure directory exists
            const dirUri = vscode.Uri.joinPath(workspaceRoot, snapshotFolder);
            try {
                await vscode.workspace.fs.createDirectory(dirUri);
            } catch {
                // Directory may already exist — ignore
            }
            await vscode.workspace.fs.writeFile(snapshotUri, encoded);
            vscode.window.setStatusBarMessage(
                `$(save) psTimer: 스냅샷 저장됨 → ${snapshotFolder}/${filename}`,
                3000
            );
        } catch (err) {
            vscode.window.showWarningMessage(
                `psTimer: 스냅샷 저장 실패: ${String(err)}`
            );
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _getSnapshotIntervalSeconds(): number {
        const minutes = vscode.workspace
            .getConfiguration('psTimer')
            .get<number>('snapshotIntervalMinutes', 5);
        return minutes * 60;
    }

    private _emit(): void {
        this._stateChangeEmitter.fire(this.getState());
    }
}
