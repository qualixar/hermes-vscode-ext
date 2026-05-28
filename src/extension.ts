/**
 * Hermes VS Code Extension — Entry Point (v0.4.1)
 *
 * Single ACP subprocess. Single webview with 8 tabs. Kanban + Sessions trees.
 * All disposables tracked in context.subscriptions. No RAM leaks.
 */

import * as vscode from 'vscode';
import { HermesClient } from './hermes-client';
import { StatusBarManager } from './status-bar';
import { SidebarChatProvider } from './sidebar-chat-provider';
import { KanbanTreeProvider } from './kanban-tree';
import { SessionTreeProvider } from './session-tree';
import { AcpManager } from './acp-manager';
import * as cli from './hermes-cli';

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('hermes');
  const apiUrl = cfg.get<string>('apiUrl', 'http://localhost:8642');
  const acpPath = cfg.get<string>('acpPath', '/Users/varunpratapbhardwaj/.local/bin/hermes');

  cli.setBinPath(acpPath);
  const client = new HermesClient(apiUrl);

  // 1. Status bar
  const statusBar = new StatusBarManager(client);
  statusBar.show();
  context.subscriptions.push(statusBar);

  // 2. Chat webview (tabs: Chat | Config | Gateway | Cron | MCP | Skills | Media)
  const panel = new SidebarChatProvider(context.extensionUri, client);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('hermes-panel', panel),
  );

  // 3. Kanban tree
  const kanban = new KanbanTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('hermes-kanban', { treeDataProvider: kanban, showCollapseAll: true }),
    kanban,
  );

  // 4. Sessions tree
  const sessions = new SessionTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('hermes-sessions', { treeDataProvider: sessions, showCollapseAll: false }),
    sessions,
  );

  // 5. ACP (single instance, disposed on deactivate)
  const acp = new AcpManager(acpPath);
  const acpEnabled = cfg.get<boolean>('acpEnabled', true);
  if (acpEnabled) acp.start();
  context.subscriptions.push(acp);

  // 6. Config listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('hermes.apiUrl')) {
        client.setBaseUrl(vscode.workspace.getConfiguration('hermes').get<string>('apiUrl', 'http://localhost:8642'));
      }
      if (e.affectsConfiguration('hermes.acpEnabled')) {
        const on = vscode.workspace.getConfiguration('hermes').get<boolean>('acpEnabled', true);
        if (on && !acp.isRunning) acp.start();
        else if (!on && acp.isRunning) acp.stop();
      }
    }),
  );

  // 7. Commands
  registerCmds(context, client, statusBar, panel, kanban, sessions);

  // 8. Auto-connect
  void autoConnect(client, statusBar, panel, kanban, sessions);
}

export function deactivate(): void { cli.disposeCli(); }

// ── Commands ─────────────────────────────────────────────────

function registerCmds(
  ctx: vscode.ExtensionContext,
  client: HermesClient,
  sb: StatusBarManager,
  panel: SidebarChatProvider,
  kanban: KanbanTreeProvider,
  sessions: SessionTreeProvider,
): void {
  const reg = (cmd: string, fn: (...args: any[]) => any) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(cmd, fn));

  const show = async (s: string) => {
    const d = await vscode.workspace.openTextDocument({ content: s, language: 'plaintext' });
    await vscode.window.showTextDocument(d, { preview: true });
  };

  reg('hermes.focus', () => { panel.reveal(); vscode.commands.executeCommand('hermes-sidebar.focus'); });
  reg('hermes.showOutput', () => cli.showOutput());
  reg('hermes.showConfig', async () => { const text = await cli.readConfig(); show(text); });
  reg('hermes.editConfig', () => vscode.commands.executeCommand('hermes.showConfig'));
  reg('hermes.gatewayStatus', async () => { const r = await cli.gatewayStatus(); show(r.stdout); });
  reg('hermes.gatewayRestart', async () => {
    const ans = await vscode.window.showWarningMessage('Restart Hermes gateway?', 'Yes', 'No');
    if (ans !== 'Yes') return;
    await cli.run(['gateway', 'restart'], { timeout: 15000 });
    vscode.window.showInformationMessage('Gateway restart triggered.');
  });
  reg('hermes.proxyStatus', async () => { const r = await cli.proxyStatus(); vscode.window.showInformationMessage(r.stdout.slice(0, 300)); });
  reg('hermes.proxyProviders', async () => { const r = await cli.proxyProviders(); show(r.stdout); });
  reg('hermes.cronList', async () => { const r = await cli.cronList(); show(r.stdout); });
  reg('hermes.cronCreate', async () => {
    const sched = await vscode.window.showInputBox({ prompt: 'Cron schedule', placeHolder: '0 9 * * *' });
    if (!sched) return;
    const task = await vscode.window.showInputBox({ prompt: 'Task prompt' });
    if (!task) return;
    const r = await cli.run(['cron', 'create', '--schedule', sched, '--prompt', task], { timeout: 15000 });
    vscode.window.showInformationMessage(r.stdout || r.stderr || 'Created.');
  });
  reg('hermes.cronRemove', async () => {
    const id = await vscode.window.showInputBox({ prompt: 'Cron job ID to remove' });
    if (!id) return;
    await cli.run(['cron', 'remove', id]);
    vscode.window.showInformationMessage('Removed.');
  });
  reg('hermes.inspectMcp', async () => {
    let out = '=== MCP Servers ===\n\n';
    const { stdout } = await cli.run(['config']);
    const m = stdout.match(/mcp_servers:[\s\S]*?(?=^\w|\Z)/m);
    out += m ? m[0] : '(none)';
    out += '\n\n22 tools via hermes-tools.py';
    show(out);
  });
  reg('hermes.addMcpServer', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'MCP server name' });
    if (!name) return;
    const url = await vscode.window.showInputBox({ prompt: 'URL (leave blank for stdio)' });
    await cli.run(['mcp', 'add', name, ...(url ? ['--url', url] : [])]);
    vscode.window.showInformationMessage('Added.');
  });
  reg('hermes.skillsList', async () => { const r = await cli.skillsList(); show(r.stdout); });
  reg('hermes.agentRun', async () => {
    const t = await vscode.window.showInputBox({ prompt: 'Agent task' });
    if (!t) return;
    cli.showOutput();
    const r = await cli.agentRun(t);
    cli.logToOutput(r.stdout);
    vscode.window.showInformationMessage('Done.');
  });
  reg('hermes.hermesStatus', async () => { const r = await cli.hermesStatus(); show(r.stdout); });
  reg('hermes.listModels', async () => {
    const r = await client.listModels();
    if (r.ok && r.data?.data) show(r.data.data.map((m: any) => m.id).join('\n'));
  });
  reg('hermes.generateImage', async () => {
    const p = await vscode.window.showInputBox({ prompt: 'Image prompt' });
    if (!p) return;
    const r = await client.chat(p, []);
    if (r.ok) show(r.data);
  });
  reg('hermes.generateVideo', async () => {
    const p = await vscode.window.showInputBox({ prompt: 'Video prompt' });
    if (!p) return;
    const r = await client.chat(p, []);
    if (r.ok) show(r.data);
  });
  reg('hermes.analyzeImage', async () => {
    const uris = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg'] } });
    if (!uris?.length) return;
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Analyzing...' }, () => client.chat('Analyze: ' + uris[0].fsPath, []));
    if (r.ok) show(r.data);
  });
  reg('hermes.createTask', async () => {
    const t = await vscode.window.showInputBox({ prompt: 'Task title' });
    if (!t) return;
    await cli.kanbanCreate(t);
    kanban.refresh();
    vscode.window.showInformationMessage('Task created.');
  });
  reg('hermes.showTask', async (task?: { task_id: string }) => {
    if (!task?.task_id) return;
    const { stdout } = await cli.kanbanShow(task.task_id);
    show(stdout);
  });
  reg('hermes.completeTask', async (task?: { task_id: string }) => {
    if (!task?.task_id) return;
    await cli.kanbanComplete([task.task_id]);
    kanban.refresh();
    vscode.window.showInformationMessage('Completed.');
  });
  reg('hermes.commentTask', async (task?: { task_id: string }) => {
    if (!task?.task_id) return;
    const c = await vscode.window.showInputBox({ prompt: 'Comment' });
    if (!c) return;
    await cli.kanbanComment(task.task_id, c);
    vscode.window.showInformationMessage('Comment added.');
  });
  reg('hermes.decomposeTask', async (task?: { task_id: string }) => {
    if (!task?.task_id) return;
    const ans = await vscode.window.showInformationMessage('Decompose task?', 'Yes', 'No');
    if (ans !== 'Yes') return;
    const { stdout } = await cli.kanbanDecompose(task.task_id);
    show(stdout || 'Done.');
    kanban.refresh();
  });
  reg('hermes.swarm', async () => {
    const goal = await vscode.window.showInputBox({ prompt: 'Swarm goal' });
    if (!goal) return;
    const w = await vscode.window.showInputBox({ prompt: 'Workers (NAME:TITLE,)', placeHolder: 'researcher:Research, dev:Implement' });
    if (!w) return;
    const v = await vscode.window.showInputBox({ prompt: 'Verifier', value: 'reviewer' });
    if (!v) return;
    const sy = await vscode.window.showInputBox({ prompt: 'Synthesizer', value: 'writer' });
    if (!sy) return;
    const { stdout } = await cli.kanbanSwarm(goal, w.split(',').map(x => x.trim()), v, sy);
    vscode.window.showInformationMessage('Swarm: ' + stdout.slice(0, 150));
    kanban.refresh();
  });
  reg('hermes.dispatch', async () => {
    const { stdout } = await cli.kanbanDispatch();
    vscode.window.showInformationMessage(stdout.slice(0, 200) || 'Dispatched.');
    kanban.refresh();
  });
  reg('hermes.kanbanStats', async () => {
    const { stdout } = await cli.kanbanStats();
    vscode.window.showInformationMessage(stdout.slice(0, 200), { modal: false }, 'OK');
  });
  reg('hermes.kanbanAssignees', async () => {
    const { stdout } = await cli.kanbanAssignees();
    show(stdout);
  });
  reg('hermes.kanbanBoards', async () => {
    const { stdout } = await cli.kanbanBoards();
    show(stdout);
  });
  reg('hermes.connect', async () => {
    const u = await vscode.window.showInputBox({ prompt: 'API URL', value: 'http://localhost:8642' });
    if (!u) return;
    client.setBaseUrl(u);
    const r = await client.health();
    if (r.ok) { sb.setConnected(r.data.version); panel.setConnected(true); kanban.startPolling(); sessions.refresh(); vscode.window.showInformationMessage('Connected.'); }
    else { sb.setError(r.error); panel.setConnected(false); vscode.window.showErrorMessage('Failed: ' + r.error); }
  });
  reg('hermes.disconnect', () => { sb.setDisconnected(); panel.setConnected(false); kanban.stopPolling(); });
  reg('hermes.switchSession', async (id?: string) => {
    if (!id) return;
    await cli.run(['session', 'resume', id]);
    sessions.refresh();
    vscode.window.showInformationMessage('Switched to session: ' + id);
  });
}

// ── Auto-connect ─────────────────────────────────────────────

async function autoConnect(
  client: HermesClient, sb: StatusBarManager, panel: SidebarChatProvider,
  kanban: KanbanTreeProvider, sessions: SessionTreeProvider,
): Promise<void> {
  const r = await client.health();
  if (r.ok) { sb.setConnected(r.data.version); panel.setConnected(true); kanban.startPolling(); sessions.refresh(); }
  else { sb.setDisconnected(); panel.setConnected(false); }
}
