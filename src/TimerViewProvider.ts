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

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((message: { command: string }) => {
            switch (message.command) {
                case 'start':  this._controller.start();        break;
                case 'pause':  this._controller.togglePause();  break;
                case 'reset':  this._controller.reset();        break;
                case 'addProblem': vscode.commands.executeCommand('psTimer.addProblem'); break;
                case 'ready':  this.postState(this._controller.getState()); break;
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

  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 12px;
    gap: 14px;
    user-select: none;
    min-height: 100vh;
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
    transition: background 0.4s, color 0.4s;
    width: 100%;
    text-align: center;
  }
  #phase-badge.reading  { background: #c0392b; color: #fff; }
  #phase-badge.solving  { background: #27ae60; color: #fff; }
  #phase-badge.finished { background: #e67e22; color: #fff; }

  /* ── Main Timer Container ──────────────────── */
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

  .timer-bg {
    fill: none;
    stroke: var(--vscode-panel-border, rgba(128,128,128,0.15));
    stroke-width: 4;
  }

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
  #phase-bar-reading {
    width: 25%;
    background: #c0392b;
    opacity: 0.15;
    transition: opacity 0.4s;
  }
  #phase-bar-solving {
    width: 75%;
    background: #27ae60;
    opacity: 0.15;
    transition: opacity 0.4s;
  }
  #phase-bar-reading.active  { opacity: 1.0; }
  #phase-bar-solving.active  { opacity: 1.0; }

  /* ── Phase info row ────────────────────────── */
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
    margin-top: 4px;
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
    margin-top: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  /* ── Finished Message ──────────────────────── */
  #finished-msg {
    display: none;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    background: #e67e22;
    padding: 12px;
    border-radius: 8px;
    width: 100%;
    line-height: 1.5;
    margin-top: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }

  /* ── Buttons ───────────────────────────────── */
  .btn-row {
    display: flex;
    gap: 8px;
    width: 100%;
    margin-top: auto;
    padding-top: 10px;
  }
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
  button:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
    filter: brightness(1.1);
  }
  button:disabled { opacity: 0.30; cursor: default; }
  #btn-start {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  #btn-start:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  /* ── Similar Problems ─────────────────────── */
  #similar-section {
    width: 100%;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    border-radius: 8px;
    padding: 10px;
    margin-top: 10px;
    font-size: 11px;
    display: none;
  }
  #similar-section.active { display: block; }

  #similar-title {
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--vscode-foreground);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .problem-item {
    padding: 4px 0;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .problem-item:last-child { border-bottom: none; }
  .problem-item a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }
  .problem-item a:hover { text-decoration: underline; }

  .problem-link-display {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 8px;
  }
</style>
</head>
<body>

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

<div style="width: 100%;">
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

<div id="snapshot-row" style="display:none">
  <span>📸 다음 스냅샷까지</span>
  <strong id="snapshot-label">5:00</strong>
</div>

<div id="finished-msg">
  ⏰ 시간 종료!<br>정말 고생 많으셨습니다.
</div>

<div id="similar-section">
  <div class="problem-link-display" id="display-problem-link"></div>
  <div id="similar-title">유사 문제 (By Antigravity)</div>
  <div id="similar-list"></div>
</div>

<div class="btn-row">
  <button id="btn-start">시작</button>
  <button id="btn-add">문제 추가</button>
  <button id="btn-pause" disabled>일시정지</button>
  <button id="btn-reset" disabled>초기화</button>
</div>

<script nonce="${nonce}">
(function() {
    const vscode = acquireVsCodeApi();

    const clock        = document.getElementById('clock');
    const timerProgress = document.getElementById('timer-progress');
    const phaseBadge   = document.getElementById('phase-badge');
    const elapsedLabel = document.getElementById('elapsed-label');
    const phaseBarR    = document.getElementById('phase-bar-reading');
    const phaseBarS    = document.getElementById('phase-bar-solving');
    const snapshotRow  = document.getElementById('snapshot-row');
    const snapshotLbl  = document.getElementById('snapshot-label');
    const lockNotice   = document.getElementById('lock-notice');
    const finishedMsg  = document.getElementById('finished-msg');
    const btnStart     = document.getElementById('btn-start');
    const btnPause     = document.getElementById('btn-pause');
    const btnReset     = document.getElementById('btn-reset');
    const btnAdd       = document.getElementById('btn-add');
    const similarSect  = document.getElementById('similar-section');
    const similarList  = document.getElementById('similar-list');
    const linkDisplay  = document.getElementById('display-problem-link');

    const CIRCUMFERENCE = 2 * Math.PI * 45;

    function fmt(seconds) {
        const s = Math.max(0, Math.round(seconds));
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return m + ':' + sec;
    }

    function render(state) {
        const { phase, paused, elapsedSeconds, totalSeconds, readingSeconds, nextSnapshotIn, problemLink, similarProblems } = state;

        if (problemLink || (similarProblems && similarProblems.length > 0)) {
            similarSect.classList.add('active');
            linkDisplay.textContent = problemLink || '';
            
            if (similarProblems && similarProblems.length > 0) {
                similarList.innerHTML = similarProblems.map(p => {
                    const parts = p.split('|');
                    const num = parts[0] || '';
                    const title = parts[1] || p;
                    const url = parts[2] || (p.includes('bj.com') ? p : 'https://www.acmicpc.net/problem/' + num);
                    return '<div class="problem-item"><span>📌</span> <a href="' + url + '">' + num + ' ' + title + '</a></div>';
                }).join('');
            } else {
                similarList.innerHTML = '<div style="opacity:0.5; font-style:italic;">Antigravity에게 유사 문제 분석을 요청하세요.</div>';
            }
        } else {
            similarSect.classList.remove('active');
        }

        const remaining = totalSeconds - elapsedSeconds;
        clock.textContent = fmt(remaining);

        // Circular progress logic
        const pct = (elapsedSeconds / totalSeconds);
        const offset = CIRCUMFERENCE * (1 - pct);
        timerProgress.style.strokeDashoffset = offset;

        // Dynamic progress color based on phase
        if (phase === 'reading') {
            timerProgress.style.stroke = '#c0392b';
        } else if (phase === 'solving') {
            timerProgress.style.stroke = '#27ae60';
        } else if (phase === 'finished') {
            timerProgress.style.stroke = '#e67e22';
        } else {
            timerProgress.style.stroke = 'var(--vscode-progressBar-background)';
        }

        const urgent = phase === 'solving' && remaining <= 300;
        clock.classList.toggle('urgent', urgent);
        clock.classList.toggle('paused', paused);

        const phaseLabels = {
            idle: '대기 중',
            reading: '📖 읽기 (집중)',
            solving: '✏️ 문제 풀이',
            finished: '세션 종료'
        };
        phaseBadge.textContent = phaseLabels[phase] || phase;
        phaseBadge.className = '';
        if (phase !== 'idle') { phaseBadge.classList.add(phase); }

        const elMin = Math.floor(elapsedSeconds / 60);
        elapsedLabel.textContent = elMin + ' / 60분';

        phaseBarR.classList.toggle('active', phase === 'reading');
        phaseBarS.classList.toggle('active', phase === 'solving' || phase === 'finished');

        lockNotice.style.display = (phase === 'reading') ? 'block' : 'none';

        if (phase === 'solving') {
            snapshotRow.style.display = 'flex';
            snapshotLbl.textContent = fmt(nextSnapshotIn);
        } else {
            snapshotRow.style.display = 'none';
        }

        finishedMsg.style.display = (phase === 'finished') ? 'block' : 'none';

        btnStart.disabled  = (phase !== 'idle');
        btnPause.disabled  = (phase === 'idle' || phase === 'finished');
        btnPause.textContent = paused ? '재개' : '일시정지';
        btnReset.disabled  = (phase === 'idle');
    }

    btnStart.addEventListener('click', () => vscode.postMessage({ command: 'start' }));
    btnAdd.addEventListener('click', () => vscode.postMessage({ command: 'addProblem' }));
    btnPause.addEventListener('click', () => vscode.postMessage({ command: 'pause' }));
    btnReset.addEventListener('click', () => vscode.postMessage({ command: 'reset' }));

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'stateUpdate') {
            render(msg.state);
        }
    });

    vscode.postMessage({ command: 'ready' });
})();
</script>
</body>
</html>`;
    }
}
