/**
 * Hermes VS Code Extension — Command Registration
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { HermesClient } from './hermes-client';
import type { StatusBarManager } from './status-bar';
import type { KanbanTreeProvider } from './kanban-tree';
import type { SidebarChatProvider } from './sidebar-chat-provider';
import type { AcpManager } from './acp-manager';

const execPromise = promisify(exec);

interface CommandContext {
  readonly client: HermesClient;
  readonly statusBar: StatusBarManager;
  readonly kanbanTree: KanbanTreeProvider;
  readonly chatProvider: SidebarChatProvider;
  readonly acpManager: AcpManager;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  ctx: CommandContext,
): void {
  const { client, statusBar, kanbanTree, chatProvider, acpManager } = ctx;

  // ── hermes.connect ──────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.connect', async () => {
      const config = vscode.workspace.getConfiguration('hermes');
      const currentUrl = config.get<string>('apiUrl', 'http://localhost:8642');

      const url = await vscode.window.showInputBox({
        prompt: 'Hermes API server URL',
        value: currentUrl,
        placeHolder: 'http://localhost:8642',
      });

      if (!url) {
        return;
      }

      client.setBaseUrl(url);
      await config.update('apiUrl', url, vscode.ConfigurationTarget.Global);

      const result = await client.health();
      if (result.ok) {
        statusBar.setConnected(result.data.version);
        kanbanTree.startPolling();
        vscode.window.showInformationMessage(
          `Connected to Hermes at ${url} (${result.data.version ?? 'ok'})`,
        );
      } else {
        statusBar.setError(result.error);
        vscode.window.showErrorMessage(
          `Failed to connect to Hermes at ${url}: ${result.error}`,
        );
      }
    }),
  );

  // ── hermes.disconnect ─────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.disconnect', () => {
      statusBar.setDisconnected();
      kanbanTree.stopPolling();
      vscode.window.showInformationMessage('Hermes disconnected.');
    }),
  );

  // ── hermes.chat ────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.chat', () => {
      chatProvider.reveal();
      vscode.commands.executeCommand('hermes-sidebar.focus');
    }),
  );

  // ── hermes.createTask ──────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.createTask', async () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const selectedText =
        selection && !selection.isEmpty
          ? editor.document.getText(selection)
          : undefined;

      const title = await vscode.window.showInputBox({
        prompt: 'Task title',
        value: selectedText,
        placeHolder: 'Describe the task for Hermes...',
      });

      if (!title) {
        return;
      }

      const body = await vscode.window.showInputBox({
        prompt: 'Task description (optional)',
        placeHolder: 'Additional details...',
      });

      try {
        const { stdout } = await execPromise(
          `/Users/varunpratapbhardwaj/.local/bin/hermes kanban create "${title.replace(/"/g, '\\"')}" ${body ? `--body "${body.replace(/"/g, '\\"')}"` : ''}`,
          { timeout: 30000 },
        );
        vscode.window.showInformationMessage(`Task created: ${stdout.trim()}`);
        kanbanTree.refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Failed to create task: ${msg}`);
      }
    }),
  );

  // ── hermes.swarm ───────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.swarm', async () => {
      const goal = await vscode.window.showInputBox({
        prompt: 'Swarm goal',
        placeHolder: 'What should the swarm accomplish?',
      });
      if (!goal) {
        return;
      }

      const workers = await vscode.window.showInputBox({
        prompt: 'Workers (PROFILE:TITLE, comma-separated)',
        placeHolder: 'researcher:Research patterns, developer:Implement code',
      });
      if (!workers) {
        return;
      }

      const verifier = await vscode.window.showInputBox({
        prompt: 'Verifier profile name',
        value: 'reviewer',
      });
      if (!verifier) {
        return;
      }

      const synthesizer = await vscode.window.showInputBox({
        prompt: 'Synthesizer profile name',
        value: 'writer',
      });
      if (!synthesizer) {
        return;
      }

      try {
        const cmd = `/Users/varunpratapbhardwaj/.local/bin/hermes kanban swarm "${goal.replace(/"/g, '\\"')}" --verifier ${verifier} --synthesizer ${synthesizer} ${workers
          .split(',')
          .map((w) => `--worker "${w.trim().replace(/"/g, '\\"')}"`)
          .join(' ')}`;
        const { stdout } = await execPromise(cmd, { timeout: 30000 });
        vscode.window.showInformationMessage(`Swarm created: ${stdout.trim()}`);
        kanbanTree.refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Swarm failed: ${msg}`);
      }
    }),
  );

  // ── hermes.dispatch ────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.dispatch', async () => {
      try {
        const { stdout } = await execPromise(
          '/Users/varunpratapbhardwaj/.local/bin/hermes kanban dispatch',
          { timeout: 30000 },
        );
        vscode.window.showInformationMessage(`Dispatch: ${stdout.trim()}`);
        kanbanTree.refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Dispatch failed: ${msg}`);
      }
    }),
  );

  // ── hermes.refresh ─────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.refresh', () => {
      kanbanTree.refresh();
    }),
  );
}
