/**
 * Hermes VS Code Extension — Status Bar
 */

import * as vscode from 'vscode';
import type { HermesClient } from './hermes-client';

export class StatusBarManager implements vscode.Disposable {
  private connectionItem: vscode.StatusBarItem;

  constructor(private readonly client: HermesClient) {
    this.connectionItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.connectionItem.name = 'Hermes Connection';
    this.connectionItem.tooltip = 'Hermes Agent — Click to connect';
    this.connectionItem.command = 'hermes.connect';
  }

  show(): void {
    this.connectionItem.show();
    this.setDisconnected();
  }

  setConnected(version?: string): void {
    this.connectionItem.text = '$(plug) Hermes';
    this.connectionItem.backgroundColor = undefined;
    this.connectionItem.tooltip = version
      ? `Hermes connected (${version})`
      : 'Hermes connected';
  }

  setDisconnected(): void {
    this.connectionItem.text = '$(debug-disconnect) Hermes';
    this.connectionItem.tooltip = 'Hermes Agent — Disconnected. Click to connect.';
  }

  setError(message: string): void {
    this.connectionItem.text = '$(error) Hermes';
    this.connectionItem.tooltip = `Error: ${message}`;
  }

  dispose(): void {
    this.connectionItem.dispose();
  }
}
