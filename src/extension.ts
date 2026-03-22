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
        })
    );

    controller.onStateChange((state) => provider.postState(state));
    context.subscriptions.push(controller);
}

export function deactivate(): void {
    // controller is disposed via context.subscriptions
}
