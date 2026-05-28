import * as vscode from 'vscode';
import * as cli from './hermes-cli';

export class SessionTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private _ev = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._ev.event;
  refresh(): void { this._ev.fire(undefined); }
  dispose(): void { this._ev.dispose(); }
  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  async getChildren(): Promise<vscode.TreeItem[]> {
    try {
      const r = await cli.sessionList();
      const items: vscode.TreeItem[] = [];
      for (const line of r.stdout.split('\n')) {
        const parts = line.trim().split(/\s{2,}/);
        if (parts.length >= 2 && parts[0]) {
          const node = new vscode.TreeItem(parts[1], vscode.TreeItemCollapsibleState.None);
          node.description = parts[2] || '';
          node.tooltip = 'ID: ' + parts[0];
          node.command = { command: 'hermes.switchSession', title: 'Switch to Session', arguments: [parts[0]] };
          node.contextValue = 'hermes-session';
          items.push(node);
        }
      }
      return items.length ? items : [new vscode.TreeItem('No sessions found.', vscode.TreeItemCollapsibleState.None)];
    } catch {
      return [new vscode.TreeItem('Error loading sessions.', vscode.TreeItemCollapsibleState.None)];
    }
  }
}
