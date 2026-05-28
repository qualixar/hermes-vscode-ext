import * as vscode from 'vscode';
import type { HermesClient } from './hermes-client';

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  constructor(private client: HermesClient) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.name = 'Hermes';
    this.item.command = 'hermes.connect';
  }
  show(): void { this.item.show(); this.setDisconnected(); }
  setConnected(v?: string): void { this.item.text = '$(plug) Hermes' + (v ? ' ' + v : ''); this.item.backgroundColor = undefined; }
  setDisconnected(): void { this.item.text = '$(debug-disconnect) Hermes'; }
  setError(msg: string): void { this.item.text = '$(error) Hermes'; this.item.tooltip = msg; }
  dispose(): void { this.item.dispose(); }
}
