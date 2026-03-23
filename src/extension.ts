import * as vscode from 'vscode';
import { TimerController } from './TimerController';
import { TimerViewProvider } from './TimerViewProvider';

export function activate(context: vscode.ExtensionContext): void {
    const controller = new TimerController(context);
    const provider   = new TimerViewProvider(context.extensionUri, controller);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'psTimer.timerView',
            provider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('psTimer.start',  () => controller.start()),
        vscode.commands.registerCommand('psTimer.pause',  () => controller.togglePause()),
        vscode.commands.registerCommand('psTimer.reset',  () => controller.reset()),
        vscode.commands.registerCommand('psTimer.addProblem', async () => {
            const link = await vscode.window.showInputBox({
                prompt: '백준 문제 링크를 입력하세요 (예: https://www.acmicpc.net/problem/1000)',
                placeHolder: 'https://www.acmicpc.net/problem/...'
            });
            if (link) {
                await controller.setProblemLink(link);
            }
        }),
        vscode.commands.registerCommand('psTimer.copySnapshots', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showWarningMessage('워크스페이스 폴더가 없습니다.');
                return;
            }
            const snapshotFolder = vscode.workspace
                .getConfiguration('psTimer')
                .get<string>('snapshotFolder', 'psTimer_snapshots');
            const folderUri = vscode.Uri.joinPath(workspaceFolders[0].uri, snapshotFolder);
            try {
                const entries = await vscode.workspace.fs.readDirectory(folderUri);
                const files = entries
                    .filter(([, type]) => type === vscode.FileType.File)
                    .map(([name]) => name)
                    .sort();
                if (files.length === 0) {
                    vscode.window.showWarningMessage('저장된 스냅샷이 없습니다.');
                    return;
                }
                const parts: string[] = [];
                for (const file of files) {
                    const fileUri = vscode.Uri.joinPath(folderUri, file);
                    const content = await vscode.workspace.fs.readFile(fileUri);
                    parts.push(`// === ${file} ===\n${content.toString()}`);
                }
                await vscode.env.clipboard.writeText(parts.join('\n\n'));
                vscode.window.showInformationMessage(
                    `$(clippy) ${files.length}개의 스냅샷이 클립보드에 복사되었습니다.`
                );
            } catch (err) {
                vscode.window.showWarningMessage(`스냅샷을 읽을 수 없습니다: ${String(err)}`);
            }
        })
    );

    controller.onStateChange((state) => provider.postState(state));
    context.subscriptions.push(controller);
}

export function deactivate(): void {
    // controller is disposed via context.subscriptions
}
