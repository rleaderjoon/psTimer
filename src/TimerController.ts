import * as vscode from 'vscode';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export type Phase = 'idle' | 'reading' | 'solving' | 'finished';

export interface ProblemEntry {
    link: string;
    title?: string;
    similar: string[];
    solvedSeconds?: number;
    snapshotFile?: string;
}

export interface TimerState {
    phase: Phase;
    paused: boolean;
    elapsedSeconds: number;
    totalSeconds: number;
    readingSeconds: number;
    nextSnapshotIn: number;
    problems: ProblemEntry[];
    solvedSeconds?: number;
    selectedLink?: string;
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

    private _problems: ProblemEntry[] = [];
    private _solvedSeconds: number | undefined;
    private _selectedLink: string | undefined;

    private _interval: ReturnType<typeof setInterval> | undefined;
    private _blockDisposable: vscode.Disposable | undefined;
    private _undoPending: boolean = false;

    private readonly _stateChangeEmitter = new vscode.EventEmitter<TimerState>();
    readonly onStateChange = this._stateChangeEmitter.event;

    constructor(private readonly _context: vscode.ExtensionContext) {
        this._initProblemWatcher();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    selectProblem(link: string): void {
        // Toggle: clicking an already-selected card deselects it
        this._selectedLink = this._selectedLink === link ? undefined : link;
        this._emit();
    }

    start(): void {
        if (this._phase !== 'idle') { return; }

        // Clear solve data on the selected problem (fresh attempt)
        const activeProblem = this._problems.find(p => p.link === this._selectedLink);
        if (activeProblem) {
            delete activeProblem.solvedSeconds;
            delete activeProblem.snapshotFile;
            this._saveProblems();
        }
        this._solvedSeconds = undefined;

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
        this._solvedSeconds = undefined;
        this._saveProblems();
        this._emit();
    }

    solve(): void {
        if (this._phase === 'idle' || this._phase === 'finished') { return; }
        this._solvedSeconds = this._elapsedSeconds;

        // Update the selected problem (or fall back to last)
        const activeProblem = this._problems.find(p => p.link === this._selectedLink)
            ?? (this._problems.length > 0 ? this._problems[this._problems.length - 1] : undefined);
        if (activeProblem) {
            activeProblem.solvedSeconds = this._solvedSeconds;
        }

        this._stopTick();
        this._removeInputBlocker();
        this._phase = 'finished';
        this._saveProblems();
        const label = this._formatSeconds(this._solvedSeconds);
        vscode.window.showInformationMessage(`🎉 정답! 소요 시간: ${label}`);
        this._emit();
        // Take snapshot and record filename
        this._takeSnapshot().then(snapshotFile => {
            if (activeProblem && snapshotFile) {
                activeProblem.snapshotFile = snapshotFile;
                this._saveProblems();
                this._emit();
            }
        });
    }

    async openSnapshot(relativeFile: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return; }
        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, relativeFile);
        await vscode.commands.executeCommand('vscode.open', uri);
    }

    private _formatSeconds(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return s > 0 ? `${m}분 ${s}초` : `${m}분`;
    }

    private async _saveProblems(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return; }
        const folderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.ps-timer');
        const fileUri = vscode.Uri.joinPath(folderUri, 'problem.json');
        try {
            await vscode.workspace.fs.createDirectory(folderUri);
            const data = Buffer.from(JSON.stringify({ problems: this._problems }, null, 2), 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, data);
        } catch (err) {
            console.error('Failed to save problems', err);
        }
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
            problems: this._problems,
            solvedSeconds: this._solvedSeconds,
            selectedLink: this._selectedLink,
        };
    }

    async setProblemLink(link: string): Promise<void> {
        const last = this._problems[this._problems.length - 1];
        if (last && last.link === link) { return; }

        if (this._phase === 'finished') {
            // In finished state: add a new card below the existing ones
            this._problems.push({ link, similar: [] });
        } else if (last && last.solvedSeconds === undefined) {
            // Session in progress and current problem not yet solved: update it
            last.link = link;
            last.similar = [];
        } else {
            // No existing problem, or last problem was already solved: create new entry
            this._problems.push({ link, similar: [] });
        }

        // Auto-select the new/updated problem
        this._selectedLink = link;

        await this._saveProblems();
        vscode.window.showInformationMessage(`문제가 추가되었습니다: ${link}`);
        this._emit();

        // Fetch title asynchronously and update card
        this._fetchProblemTitle(link).then(title => {
            if (!title) { return; }
            const entry = this._problems.find(p => p.link === link);
            if (entry && !entry.title) {
                entry.title = title;
                this._saveProblems();
                this._emit();
            }
        });
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
                if (data.similar && Array.isArray(data.similar) && this._problems.length > 0) {
                    this._problems[this._problems.length - 1].similar = data.similar;
                    this._emit();
                }
            } catch {
                // Ignore if file doesn't exist yet
            }
        };

        const loadProblems = async () => {
            try {
                const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, '.ps-timer/problem.json');
                const content = await vscode.workspace.fs.readFile(uri);
                const data = JSON.parse(content.toString());
                if (data.problems && Array.isArray(data.problems)) {
                    // New format
                    this._problems = data.problems;
                    const last = this._problems[this._problems.length - 1];
                    if (last && typeof last.solvedSeconds === 'number') {
                        this._solvedSeconds = last.solvedSeconds;
                    }
                } else if (data.link) {
                    // Legacy format migration
                    const entry: ProblemEntry = { link: data.link, similar: [] };
                    if (typeof data.solvedSeconds === 'number') {
                        entry.solvedSeconds = data.solvedSeconds;
                        this._solvedSeconds = data.solvedSeconds;
                    }
                    this._problems = [entry];
                }
                this._emit();
            } catch {
                // Ignore if file doesn't exist yet
            }
        };

        watcher.onDidChange(loadSimilar);
        watcher.onDidCreate(loadSimilar);
        this._context.subscriptions.push(watcher);

        loadSimilar(); // Initial load
        loadProblems(); // Restore problem list after restart
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

    private async _takeSnapshot(): Promise<string | undefined> {
        this._lastSnapshotAt = this._elapsedSeconds;

        const editor = vscode.window.activeTextEditor;
        if (!editor) { return undefined; }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage(
                'psTimer: 워크스페이스 폴더가 없어 스냅샷을 저장할 수 없습니다.'
            );
            return undefined;
        }

        const workspaceRoot = workspaceFolders[0].uri;
        const snapshotFolder = vscode.workspace
            .getConfiguration('psTimer')
            .get<string>('snapshotFolder', 'psTimer_snapshots');

        const mins = Math.floor(this._elapsedSeconds / 60).toString().padStart(2, '0');
        const secs = (this._elapsedSeconds % 60).toString().padStart(2, '0');
        const ext = path.extname(editor.document.fileName) || '.txt';
        const filename = `snapshot_${mins}m${secs}s${ext}`;
        const relativePath = `${snapshotFolder}/${filename}`;

        const snapshotUri = vscode.Uri.joinPath(workspaceRoot, relativePath);
        const content = editor.document.getText();
        const encoded = Buffer.from(content, 'utf8');

        try {
            const dirUri = vscode.Uri.joinPath(workspaceRoot, snapshotFolder);
            try {
                await vscode.workspace.fs.createDirectory(dirUri);
            } catch {
                // Directory may already exist — ignore
            }
            await vscode.workspace.fs.writeFile(snapshotUri, encoded);
            vscode.window.setStatusBarMessage(
                `$(save) psTimer: 스냅샷 저장됨 → ${relativePath}`,
                3000
            );
            return relativePath;
        } catch (err) {
            vscode.window.showWarningMessage(
                `psTimer: 스냅샷 저장 실패: ${String(err)}`
            );
            return undefined;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _fetchProblemTitle(link: string): Promise<string | undefined> {
        const bojMatch = link.match(/acmicpc\.net\/problem\/(\d+)/);
        if (!bojMatch) { return Promise.resolve(undefined); }

        const url = `https://www.acmicpc.net/problem/${bojMatch[1]}`;
        return new Promise((resolve) => {
            const req = https.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; psTimer/1.0)' }
            }, (res: http.IncomingMessage) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    const m = data.match(/<span id="problem_title">([^<]+)<\/span>/);
                    resolve(m ? m[1].trim() : undefined);
                });
            });
            req.on('error', () => resolve(undefined));
            req.setTimeout(8000, () => { req.destroy(); resolve(undefined); });
        });
    }

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
