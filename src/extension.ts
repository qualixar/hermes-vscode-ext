/**
 * Hermes VS Code Extension — Entry Point
 *
 * Activates: creates HermesClient, status bar, kanban tree view, chat sidebar,
 * and ACP subprocess. Auto-connects to Hermes API on startup.
 */

import * as vscode from 'vscode';
import { HermesClient } from './hermes-client';
import { StatusBarManager } from './status-bar';
import { KanbanTreeProvider } from './kanban-tree';
import { SidebarChatProvider } from './sidebar-chat-provider';
import { AcpManager } from './acp-manager';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('hermes');
  const apiUrl = config.get<string>('apiUrl', 'http://localhost:8642');
  const autoConnect = config.get<boolean>('autoConnect', true);
  const acpEnabled = config.get<boolean>('acpEnabled', true);
  const acpPath = config.get<string>(
    'acpPath',
    '/Users/varunpratapbhardwaj/.local/bin/hermes',
  );
  const pollIntervalMs = config.get<number>('pollIntervalMs', 5000);

  // 1. HTTP client
  const client = new HermesClient(apiUrl);

  // 2. Status bar
  const statusBar = new StatusBarManager(client);
  statusBar.show();
  context.subscriptions.push(statusBar);

  // 3. Kanban tree view
  const kanbanTree = new KanbanTreeProvider(acpPath);
  const kanbanView = vscode.window.createTreeView('hermes-kanban', {
    treeDataProvider: kanbanTree,
    showCollapseAll: true,
  });
  context.subscriptions.push(kanbanView);
  context.subscriptions.push(kanbanTree);

  // 4. Chat sidebar
  const chatProvider = new SidebarChatProvider(context.extensionUri, client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hermes-chat', chatProvider),
  );

  // 5. ACP subprocess manager
  const acpManager = new AcpManager(acpPath);
  context.subscriptions.push(acpManager);

  if (acpEnabled) {
    void acpManager.start();
  }

  // 6. Commands
  registerCommands(context, {
    client,
    statusBar,
    kanbanTree,
    chatProvider,
    acpManager,
  });

  // 7. Configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('hermes.apiUrl')) {
        const newUrl = vscode.workspace
          .getConfiguration('hermes')
          .get<string>('apiUrl', 'http://localhost:8642');
        client.setBaseUrl(newUrl);
      }
      if (e.affectsConfiguration('hermes.acpEnabled')) {
        const enabled = vscode.workspace
          .getConfiguration('hermes')
          .get<boolean>('acpEnabled', true);
        if (enabled && !acpManager.isRunning) {
          void acpManager.start();
        } else if (!enabled && acpManager.isRunning) {
          void acpManager.stop();
        }
      }
    }),
  );

  // 8. Auto-connect
  if (autoConnect) {
    void autoDiscover(client, statusBar, kanbanTree, pollIntervalMs);
  }
}

export function deactivate(): void {
  // All disposables cleaned up via context.subscriptions
}

// ── Auto-discovery ──────────────────────────────────────────

async function autoDiscover(
  client: HermesClient,
  statusBar: StatusBarManager,
  kanbanTree: KanbanTreeProvider,
  pollIntervalMs: number,
): Promise<void> {
  const result = await client.health();
  if (result.ok) {
    statusBar.setConnected(result.data.version);
    kanbanTree.startPolling(pollIntervalMs);
  } else {
    statusBar.setDisconnected();
  }
}
