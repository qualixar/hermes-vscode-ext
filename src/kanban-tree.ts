import * as vscode from 'vscode';
import * as cli from './hermes-cli';

type KStatus = 'todo' | 'doing' | 'done' | 'failed' | 'cancelled';

interface PT { task_id: string; title: string; status: KStatus; type: string; }

const LABELS: Record<KStatus, string> = { todo: '▶ Todo', doing: '🔄 Doing', done: '✅ Done', failed: '❌ Failed', cancelled: '⏹ Cancelled' };
const ICONS: Record<KStatus, string> = { todo: 'circle-outline', doing: 'sync~spin', done: 'check', failed: 'error', cancelled: 'circle-slash' };

class SNode extends vscode.TreeItem {
  constructor(readonly key: KStatus, n: number) {
    super(LABELS[key], vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(ICONS[key]); this.description = String(n);
  }
}

class TNode extends vscode.TreeItem {
  constructor(readonly task: PT) {
    super(task.title, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'kanban-task-' + task.status;
    this.description = task.type;
  }
}

type Node = SNode | TNode;

export class KanbanTreeProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private _ev = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._ev.event;
  private t: ReturnType<typeof setInterval> | undefined;

  startPolling(ms = 5000): void { this.stopPolling(); this.t = setInterval(() => this.refresh(), ms); }
  stopPolling(): void { if (this.t) { clearInterval(this.t); this.t = undefined; } }
  refresh(): void { this._ev.fire(undefined); }
  dispose(): void { this.stopPolling(); this._ev.dispose(); }
  getTreeItem(el: Node): vscode.TreeItem { return el; }

  async getChildren(el?: Node): Promise<Node[]> {
    if (el instanceof SNode) {
      const tasks = await this.fetch();
      return tasks.filter(t => t.status === el.key).map(t => new TNode(t));
    }
    if (el instanceof TNode) return [];
    const tasks = await this.fetch();
    const g = new Map<KStatus, PT[]>();
    for (const t of tasks) { const a = g.get(t.status) || []; a.push(t); g.set(t.status, a); }
    return (['doing', 'todo', 'failed', 'cancelled', 'done'] as KStatus[])
      .filter(s => g.has(s)).map(s => new SNode(s, g.get(s)!.length));
  }

  private async fetch(): Promise<PT[]> {
    try {
      const raw = await cli.kanbanList();
      return parseKanban(raw);
    } catch { return []; }
  }
}

// ── Parser for actual hermes kanban list output ──
// Format: ▶ t_<id>  <status>  (assignee or (unassigned))  <title>
// Example: ▶ t_fc5291ed  ready     (unassigned)          hello

function parseKanban(output: string): PT[] {
  const tasks: PT[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match: ▶ t_<id>  <status-word>  (...)  <title>
    const m = line.match(/^[▶▷◀◁]?\s*t_([a-f0-9]+)\s+(\S+)\s+\((\S+)\)\s+(.+)$/);
    if (!m) continue;

    const rawStatus = m[2].toLowerCase();
    let status: KStatus;
    if (rawStatus === 'doing' || rawStatus === 'in_progress') status = 'doing';
    else if (rawStatus === 'done' || rawStatus === 'completed') status = 'done';
    else if (rawStatus === 'failed' || rawStatus === 'error') status = 'failed';
    else if (rawStatus === 'cancelled') status = 'cancelled';
    else status = 'todo';

    tasks.push({
      task_id: 't_' + m[1],
      title: m[4].trim(),
      status,
      type: m[3] === 'unassigned' ? '' : m[3],
    });
  }

  return tasks;
}
