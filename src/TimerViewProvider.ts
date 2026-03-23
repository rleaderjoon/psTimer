import * as vscode from 'vscode';
import { TimerController, TimerState } from './TimerController';

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class TimerViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _controller: TimerController
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message: {
            command: string;
            snapshotFile?: string;
            link?: string;
        }) => {
            switch (message.command) {
                case 'start':        this._controller.start();       break;
                case 'pause':        this._controller.togglePause(); break;
                case 'reset':        this._controller.reset();       break;
                case 'solve':        this._controller.solve();       break;
                case 'addProblem':   vscode.commands.executeCommand('psTimer.addProblem'); break;
                case 'copySnapshots': vscode.commands.executeCommand('psTimer.copySnapshots'); break;
                case 'ready':        this.postState(this._controller.getState()); break;
                case 'selectProblem':
                    if (message.link !== undefined) {
                        this._controller.selectProblem(message.link);
                    }
                    break;
                case 'openSnapshot':
                    if (message.snapshotFile) {
                        this._controller.openSnapshot(message.snapshotFile);
                    }
                    break;
                case 'openLink':
                    if (message.link) {
                        vscode.env.openExternal(vscode.Uri.parse(message.link));
                    }
                    break;
                case 'copyProblemSnapshot':
                    if (message.snapshotFile) {
                        const wf = vscode.workspace.workspaceFolders;
                        if (wf) {
                            try {
                                const uri = vscode.Uri.joinPath(wf[0].uri, message.snapshotFile);
                                const bytes = await vscode.workspace.fs.readFile(uri);
                                await vscode.env.clipboard.writeText(bytes.toString());
                                vscode.window.showInformationMessage('스냅샷이 클립보드에 복사되었습니다.');
                            } catch {
                                vscode.window.showWarningMessage('스냅샷 파일을 읽을 수 없습니다.');
                            }
                        }
                    }
                    break;
            }
        });
    }

    postState(state: TimerState): void {
        if (this._view) {
            this._view.webview.postMessage({ type: 'stateUpdate', state });
        }
    }

    private _getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const csp = [
            `default-src 'none'`,
            `style-src 'unsafe-inline'`,
            `script-src 'nonce-${nonce}'`,
        ].join('; ');

        return /* html */`
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>psTimer</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body { height: 100%; overflow: hidden; }

  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    display: flex;
    flex-direction: column;
    user-select: none;
  }

  .scroll-area {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 12px 8px;
    gap: 14px;
  }

  .fixed-bottom {
    flex-shrink: 0;
    padding: 8px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--vscode-sideBar-background);
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
  }

  /* ── Phase Badge ───────────────────────────── */
  #phase-badge {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 12px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    width: 100%;
    text-align: center;
    transition: background 0.4s, color 0.4s;
  }
  #phase-badge.reading  { background: #c0392b; color: #fff; }
  #phase-badge.solving  { background: #27ae60; color: #fff; }
  #phase-badge.finished { background: #e67e22; color: #fff; }

  /* ── Timer ─────────────────────────────────── */
  .timer-visual-container {
    position: relative;
    width: 180px;
    height: 180px;
    margin: 20px 0;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .timer-svg {
    position: absolute;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .timer-bg { fill: none; stroke: var(--vscode-panel-border, rgba(128,128,128,0.15)); stroke-width: 4; }
  .timer-progress {
    fill: none;
    stroke: var(--vscode-progressBar-background);
    stroke-width: 6;
    stroke-linecap: round;
    stroke-dasharray: 282.7;
    stroke-dashoffset: 282.7;
    transition: stroke-dashoffset 0.9s linear, stroke 0.4s;
  }
  #clock-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1;
  }
  #clock {
    font-size: 38px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1;
    color: var(--vscode-foreground);
    transition: color 0.3s, opacity 0.3s;
  }
  #clock.paused { opacity: 0.40; }
  #clock.urgent { color: #e74c3c; }
  #elapsed-label {
    font-size: 11px;
    margin-top: 6px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    opacity: 0.8;
  }

  /* ── Phase Bar ─────────────────────────────── */
  #phase-bar {
    width: 100%;
    height: 6px;
    display: flex;
    border-radius: 3px;
    overflow: hidden;
    background: var(--vscode-panel-border, rgba(128,128,128,0.1));
  }
  #phase-bar-reading  { width: 25%; background: #c0392b; opacity: 0.15; transition: opacity 0.4s; }
  #phase-bar-solving  { width: 75%; background: #27ae60; opacity: 0.15; transition: opacity 0.4s; }
  #phase-bar-reading.active  { opacity: 1.0; }
  #phase-bar-solving.active  { opacity: 1.0; }
  .phase-info {
    width: 100%;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    padding: 2px 2px 0;
  }

  /* ── Snapshot Row ──────────────────────────── */
  #snapshot-row {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    justify-content: center;
    padding: 8px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-radius: 8px;
  }

  /* ── Lock Notice ───────────────────────────── */
  #lock-notice {
    display: none;
    width: 100%;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    background: #c0392b;
    padding: 8px;
    border-radius: 6px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  /* ── Finished Message ──────────────────────── */
  #finished-msg {
    display: none;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    padding: 12px;
    border-radius: 8px;
    width: 100%;
    line-height: 1.5;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  #finished-msg.solved  { background: #27ae60; }
  #finished-msg.timeout { background: #e67e22; }

  /* ── Control Buttons ───────────────────────── */
  .btn-row { display: flex; gap: 8px; width: 100%; }
  button {
    flex: 1;
    padding: 10px 0;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    transition: filter 0.15s, background 0.15s;
  }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); filter: brightness(1.1); }
  button:disabled { opacity: 0.30; cursor: default; }
  #btn-start { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #btn-start:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  #btn-solve { background: #27ae60; color: #fff; border-color: transparent; }
  #btn-solve:hover:not(:disabled) { background: #2ecc71; filter: none; }
  #btn-copy-snapshots { background: #2980b9; color: #fff; border-color: transparent; font-size: 12px; }
  #btn-copy-snapshots:hover:not(:disabled) { background: #3498db; filter: none; }
  #snapshot-copy-row { display: none; width: 100%; }

  /* ── Problems Section ─────────────────────── */
  #problems-section {
    display: none;
    width: 100%;
    flex-direction: column;
    gap: 8px;
  }

  .problem-card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-radius: 8px;
    padding: 10px;
    font-size: 11px;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .problem-card:hover {
    border-color: rgba(52,152,219,0.4);
  }
  .problem-card.selected {
    border-color: #3498db;
    box-shadow: 0 0 0 1px rgba(52,152,219,0.25);
  }

  .problem-card-solved-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    color: #27ae60;
    background: rgba(39,174,96,0.12);
    border: 1px solid rgba(39,174,96,0.35);
    border-radius: 4px;
    padding: 3px 8px;
    margin-bottom: 5px;
  }

  .problem-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--vscode-foreground);
    margin-bottom: 3px;
    line-height: 1.3;
  }

  .problem-link-display {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .problem-item {
    padding: 4px 0;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .problem-item:last-child { border-bottom: none; }
  .problem-item a { color: var(--vscode-textLink-foreground); text-decoration: none; flex: 1; }
  .problem-item a:hover { text-decoration: underline; }

  /* ── Card Actions (shown when selected) ────── */
  .card-actions {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .card-action-btn {
    flex: none;
    width: 100%;
    padding: 8px 0;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: filter 0.15s;
  }
  .card-action-btn:hover { filter: brightness(1.12); }

  .card-action-btn.copy-snap {
    background: #2980b9;
    color: #fff;
  }
  .card-action-btn.open-link {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
  }
</style>
</head>
<body>

<div class="scroll-area">

  <div id="phase-badge">대기 중</div>

  <div class="timer-visual-container">
    <svg class="timer-svg" viewBox="0 0 100 100">
      <circle class="timer-bg" cx="50" cy="50" r="45"></circle>
      <circle class="timer-progress" id="timer-progress" cx="50" cy="50" r="45"></circle>
    </svg>
    <div id="clock-center">
      <div id="clock">60:00</div>
      <div id="elapsed-label">0 / 60분</div>
    </div>
  </div>

  <div style="width:100%">
    <div id="phase-bar">
      <div id="phase-bar-reading"></div>
      <div id="phase-bar-solving"></div>
    </div>
    <div class="phase-info">
      <span>읽기 (15분)</span>
      <span>풀이 (45분)</span>
    </div>
  </div>

  <div id="lock-notice">🔒 읽기 단계 — 키보드 차단 중</div>

  <div id="problems-section"></div>

  <div id="snapshot-row" style="display:none">
    <span>📸 다음 스냅샷까지</span>
    <strong id="snapshot-label">5:00</strong>
  </div>

  <div id="finished-msg"></div>

</div>

<div class="fixed-bottom">
  <div id="snapshot-copy-row">
    <button id="btn-copy-snapshots">📋 스냅샷 전체 복사</button>
  </div>
  <div class="btn-row">
    <button id="btn-solve" disabled>✅ 풀었어요!</button>
  </div>
  <div class="btn-row">
    <button id="btn-start">시작</button>
    <button id="btn-add">문제 추가</button>
    <button id="btn-pause" disabled>일시정지</button>
    <button id="btn-reset" disabled>초기화</button>
  </div>
</div>

<script nonce="${nonce}">
(function() {
    const vscode = acquireVsCodeApi();

    const clock            = document.getElementById('clock');
    const timerProgress    = document.getElementById('timer-progress');
    const phaseBadge       = document.getElementById('phase-badge');
    const elapsedLabel     = document.getElementById('elapsed-label');
    const phaseBarR        = document.getElementById('phase-bar-reading');
    const phaseBarS        = document.getElementById('phase-bar-solving');
    const snapshotRow      = document.getElementById('snapshot-row');
    const snapshotLbl      = document.getElementById('snapshot-label');
    const lockNotice       = document.getElementById('lock-notice');
    const finishedMsg      = document.getElementById('finished-msg');
    const btnStart         = document.getElementById('btn-start');
    const btnPause         = document.getElementById('btn-pause');
    const btnReset         = document.getElementById('btn-reset');
    const btnAdd           = document.getElementById('btn-add');
    const btnSolve         = document.getElementById('btn-solve');
    const btnCopySnapshots = document.getElementById('btn-copy-snapshots');
    const snapshotCopyRow  = document.getElementById('snapshot-copy-row');
    const problemsSection  = document.getElementById('problems-section');

    const CIRCUMFERENCE = 2 * Math.PI * 45;

    function fmt(seconds) {
        const s = Math.max(0, Math.round(seconds));
        return String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
    }

    function fmtSolved(seconds) {
        const m = Math.floor(seconds / 60), s = seconds % 60;
        return s > 0 ? m + '분 ' + s + '초' : m + '분';
    }

    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderProblems(problems, selectedLink) {
        if (!problems || !problems.length) { problemsSection.style.display = 'none'; return; }
        problemsSection.style.display = 'flex';
        problemsSection.innerHTML = '';

        problems.slice().reverse().forEach(function(p) {
            const isSolved   = p.solvedSeconds !== undefined;
            const isSelected = p.link === selectedLink;

            const card = document.createElement('div');
            card.className = 'problem-card' + (isSelected ? ' selected' : '');

            // ── Main info ─────────────────────────────────
            let html = '';
            if (isSolved) {
                html += '<div class="problem-card-solved-badge">✅ ' + fmtSolved(p.solvedSeconds) + '에 정답!</div>';
            }
            if (p.title) {
                html += '<div class="problem-title">' + esc(p.title) + '</div>';
            }
            html += '<div class="problem-link-display">' + esc(p.link) + '</div>';

            if (p.similar && p.similar.length > 0) {
                html += '<div style="margin-top:6px">';
                p.similar.forEach(function(s) {
                    const parts = s.split('|');
                    const num   = parts[0] || '';
                    const title = parts[1] || s;
                    const url   = parts[2] || ('https://www.acmicpc.net/problem/' + num);
                    html += '<div class="problem-item"><span>📌</span>' +
                        '<a href="' + esc(url) + '">' + esc(num) + ' ' + esc(title) + '</a></div>';
                });
                html += '</div>';
            }
            card.innerHTML = html;

            // ── Actions area (shown only when selected) ───
            if (isSelected) {
                const actions = document.createElement('div');
                actions.className = 'card-actions';

                if (isSolved) {
                    const btnSnap = document.createElement('button');
                    btnSnap.className = 'card-action-btn copy-snap';
                    if (p.snapshotFile) {
                        // This session's snapshot saved — copy just that file
                        btnSnap.textContent = '📋 스냅샷 복사하기';
                        btnSnap.addEventListener('click', function(e) {
                            e.stopPropagation();
                            vscode.postMessage({ command: 'copyProblemSnapshot', snapshotFile: p.snapshotFile });
                        });
                    } else {
                        // Old problem or snapshot not recorded — copy all snapshots as fallback
                        btnSnap.textContent = '📋 스냅샷 전체 복사';
                        btnSnap.addEventListener('click', function(e) {
                            e.stopPropagation();
                            vscode.postMessage({ command: 'copySnapshots' });
                        });
                    }
                    actions.appendChild(btnSnap);
                }

                const btnLink = document.createElement('button');
                btnLink.className = 'card-action-btn open-link';
                btnLink.textContent = '🔗 문제 링크로 이동하기';
                btnLink.addEventListener('click', function(e) {
                    e.stopPropagation();
                    vscode.postMessage({ command: 'openLink', link: p.link });
                });
                actions.appendChild(btnLink);

                card.appendChild(actions);
            }

            // ── Click → select/deselect ───────────────────
            card.addEventListener('click', function() {
                vscode.postMessage({ command: 'selectProblem', link: p.link });
            });

            problemsSection.appendChild(card);
        });
    }

    function render(state) {
        const { phase, paused, elapsedSeconds, totalSeconds, nextSnapshotIn, problems, solvedSeconds, selectedLink } = state;

        const remaining = totalSeconds - elapsedSeconds;
        clock.textContent = fmt(remaining);

        const pct = elapsedSeconds / totalSeconds;
        timerProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);
        timerProgress.style.stroke =
            phase === 'reading'  ? '#c0392b' :
            phase === 'solving'  ? '#27ae60' :
            phase === 'finished' ? '#e67e22' :
            'var(--vscode-progressBar-background)';

        clock.classList.toggle('urgent', phase === 'solving' && remaining <= 300);
        clock.classList.toggle('paused', paused);

        const labels = { idle:'대기 중', reading:'📖 읽기 (집중)', solving:'✏️ 문제 풀이', finished:'세션 종료' };
        phaseBadge.textContent = labels[phase] || phase;
        phaseBadge.className = phase !== 'idle' ? phase : '';

        elapsedLabel.textContent = Math.floor(elapsedSeconds / 60) + ' / 60분';

        phaseBarR.classList.toggle('active', phase === 'reading');
        phaseBarS.classList.toggle('active', phase === 'solving' || phase === 'finished');

        lockNotice.style.display = phase === 'reading' ? 'block' : 'none';

        snapshotRow.style.display = phase === 'solving' ? 'flex' : 'none';
        if (phase === 'solving') { snapshotLbl.textContent = fmt(nextSnapshotIn); }

        if (phase === 'finished') {
            finishedMsg.style.display = 'block';
            if (solvedSeconds !== undefined) {
                finishedMsg.className = 'solved';
                finishedMsg.textContent = '🎉 정답! 소요 시간: ' + fmtSolved(solvedSeconds);
            } else {
                finishedMsg.className = 'timeout';
                finishedMsg.innerHTML = '⏰ 시간 종료!<br>정말 고생 많으셨습니다.';
            }
        } else {
            finishedMsg.style.display = 'none';
        }

        snapshotCopyRow.style.display = phase === 'finished' ? 'block' : 'none';

        renderProblems(problems, selectedLink);

        // Start requires: idle phase AND (no problems OR a problem is selected)
        btnStart.disabled  = phase !== 'idle' || (problems && problems.length > 0 && !selectedLink);
        btnPause.disabled  = phase === 'idle' || phase === 'finished';
        btnPause.textContent = paused ? '재개' : '일시정지';
        btnReset.disabled  = phase === 'idle';
        btnSolve.disabled  = phase === 'idle' || phase === 'finished';
    }

    btnStart.addEventListener('click', () => vscode.postMessage({ command: 'start' }));
    btnAdd.addEventListener('click',   () => vscode.postMessage({ command: 'addProblem' }));
    btnPause.addEventListener('click', () => vscode.postMessage({ command: 'pause' }));
    btnReset.addEventListener('click', () => vscode.postMessage({ command: 'reset' }));
    btnSolve.addEventListener('click', () => vscode.postMessage({ command: 'solve' }));
    btnCopySnapshots.addEventListener('click', () => vscode.postMessage({ command: 'copySnapshots' }));

    window.addEventListener('message', (event) => {
        if (event.data.type === 'stateUpdate') { render(event.data.state); }
    });

    vscode.postMessage({ command: 'ready' });
})();
</script>
</body>
</html>`;
    }
}
