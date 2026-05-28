/**
 * Hermes VS Code Extension — Kanban Tree View
 *
 * TreeDataProvider showing kanban tasks grouped by status.
 * Runs `hermes kanban list` via CLI periodically.
 */

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { KanbanStatus } from './hermes-types';

const exec = promisify(execFile);

interface ParsedTask {
  task_id: string;
  title: string;
  status: KanbanStatus;
  type: string;
}

type KanbanNode = StatusGroupNode | TaskNode;

class StatusGroupNode extends vscode.TreeItem {
  constructor(
    public readonly status: KanbanStatus,
    public readonly count: number,
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(statusLabel(status), collapsibleState);
    this.contextValue = 'kanban-status';
    this.iconPath = statusIcon(status);
  }
}

class TaskNode extends vscode.TreeItem {
  constructor(public readonly task: ParsedTask) {
    super(task.title, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `kanban-task-${task.status}`;
    this.tooltip = `${task.task_id}\nStatus: ${task.status}\nType: ${task.type}`;
    this.description = task.type;
  }
}

function statusLabel(status: KanbanStatus): string {
  const labels: Record<KanbanStatus, string> = {
    todo: '▶️ Todo',
    doing: '🔄 Doing',
    done: '✅ Done',
    failed: '❌ Failed',
    cancelled: '⏹️ Cancelled',
  };
  return labels[status] || status;
}

function statusIcon(status: KanbanStatus): vscode.ThemeIcon {
  const icons: Record<KanbanStatus, string> = {
    todo: 'circle-outline',
    doing: 'sync~spin',
    done: 'check',
    failed: 'error',
    cancelled: 'circle-slash',
  };
  return new vscode.ThemeIcon(icons[status] || 'circle-outline');
}

// ── Provider ─────────────────────────────────────────────────

export class KanbanTreeProvider
  implements vscode.TreeDataProvider<KanbanNode>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<KanbanNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private hermesBin: string;

  constructor(hermesBin: string = '/Users/varunpratapbhardwaj/.local/bin/hermes') {
    this.hermesBin = hermesBin;
  }

  setHermesBin(path: string): void {
    this.hermesBin = path;
  }

  startPolling(intervalMs: number = 5000): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  dispose(): void {
    this.stopPolling();
    this._onDidChangeTreeData.dispose();
  }

  // ── TreeDataProvider ──────────────────────────────────────

  getTreeItem(element: KanbanNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: KanbanNode): Promise<KanbanNode[]> {
    if (element) {
      if (element instanceof StatusGroupNode) {
        const tasks = await this.fetchTasks();
        return tasks
          .filter((t) => t.status === element.status)
          .map((t) => new TaskNode(t));
      }
      return [];
    }

    // Root: status groups
    const tasks = await this.fetchTasks();
    const grouped = groupByStatus(tasks);
    const order: KanbanStatus[] = ['doing', 'todo', 'failed', 'cancelled', 'done'];

    return order
      .filter((s) => grouped.has(s))
      .map((s) => {
        const items = grouped.get(s)!;
        return new StatusGroupNode(
          s,
          items.length,
          vscode.TreeItemCollapsibleState.Expanded,
        );
      });
  }

  // ── CLI integration ───────────────────────────────────────

  private async fetchTasks(): Promise<ParsedTask[]> {
    try {
      const { stdout } = await exec(this.hermesBin, ['kanban', 'list'], {
        timeout: 10000,
      });
      return parseKanbanList(stdout);
    } catch {
      return [];
    }
  }
}

// ── CLI output parser ───────────────────────────────────────

function parseKanbanList(output: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // "todo" or "doing" status lines start without a number
    const match = line.match(
      /^(\d+)\s+([a-f0-9]{18})\s+(.+?)\s+(\d{4}-\d{2}-\d{2}T.+?)(?:\s+(\S+))?$/,
    );
    if (!match) {
      continue;
    }
    tasks.push({
      task_id: match[2],
      title: match[3].trim(),
      status: inferStatus(line, match[2]),
      type: match[5] || 'unknown',
    });
  }

  return tasks;
}

function inferStatus(line: string, taskId: string): KanbanStatus {
  // Best-effort: kanban list output varies. Fall back to text parsing.
  if (line.includes('[done]') || line.includes('(done)')) {
    return 'done';
  }
  if (line.includes('[doing]') || line.includes('(doing)')) {
    return 'doing';
  }
  if (line.includes('[failed]') || line.includes('(failed)')) {
    return 'failed';
  }
  if (line.includes('[cancelled]') || line.includes('(cancelled)')) {
    return 'cancelled';
  }
  return 'todo';
}

function groupByStatus(tasks: ParsedTask[]): Map<KanbanStatus, ParsedTask[]> {
  const map = new Map<KanbanStatus, ParsedTask[]>();
  for (const t of tasks) {
    const list = map.get(t.status) || [];
    list.push(t);
    map.set(t.status, list);
  }
  return map;
}
