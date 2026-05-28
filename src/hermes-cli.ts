import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
const exec = promisify(execFile);

let BIN = '/Users/varunpratapbhardwaj/.local/bin/hermes';
let _out: vscode.OutputChannel | undefined;

function oc(): vscode.OutputChannel { if (!_out) _out = vscode.window.createOutputChannel('Hermes CLI'); return _out; }

export function setBinPath(p: string): void { BIN = p; }
export function showOutput(): void { oc().show(true); }
export function logToOutput(text: string): void { oc().appendLine(text); }
export function logCommand(args: string[], r: { stdout: string; stderr: string; exitCode: number }): void {
  oc().appendLine('━ ' + BIN + ' ' + args.join(' '));
  if (r.stdout) oc().append(r.stdout.trimEnd());
  if (r.stderr) oc().append('\n! ' + r.stderr);
  oc().appendLine('');
}
export function disposeCli(): void { _out?.dispose(); _out = undefined; }

export async function run(args: string[], opts?: { timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const t = opts?.timeout ?? 30000;
  try {
    const r = await exec(BIN, args, { timeout: t, maxBuffer: 10 * 1024 * 1024 });
    return { stdout: r.stdout.trim(), stderr: r.stderr.trim(), exitCode: 0 };
  } catch (e: any) {
    const out = (e.stdout ?? '').trim();
    const err = (e.stderr ?? e.message ?? '').trim();
    return { stdout: out, stderr: err, exitCode: e.code ?? 1 };
  }
}

// ── Config (hermes config dumps to stdout, but may use pagers) ──
export async function readConfig(): Promise<string> {
  const { stdout, stderr } = await run(['config'], { timeout: 10000 });
  if (stdout) return stdout;
  if (stderr) return 'Config error: ' + stderr;
  return '(no output from hermes config)';
}

// ── Gateway (use `gateway status`) ──
export async function gatewayStatus(): Promise<{ stdout: string }> {
  const r = await run(['gateway', 'status'], { timeout: 10000 });
  return { stdout: r.stdout || r.stderr || '(no output)' };
}

// ── Proxy ──
export async function proxyStatus(): Promise<{ stdout: string }> {
  const r = await run(['proxy', 'status'], { timeout: 10000 });
  return { stdout: r.stdout || r.stderr || '(no output)' };
}
export async function proxyProviders(): Promise<{ stdout: string }> {
  const r = await run(['proxy', 'providers'], { timeout: 10000 });
  return { stdout: r.stdout || r.stderr || '(no output)' };
}

// ── Cron ──
export async function cronList(): Promise<{ stdout: string }> {
  const r = await run(['cron', 'list'], { timeout: 10000 });
  return { stdout: r.stdout || r.stderr || 'No cron jobs.' };
}

// ── Skills ──
export async function skillsList(): Promise<{ stdout: string }> {
  const r = await run(['skills', 'list'], { timeout: 15000 });
  return { stdout: r.stdout || r.stderr || 'No skills found.' };
}

// ── Sessions (subcommand is `sessions`) ──
export async function sessionList(): Promise<{ stdout: string }> {
  const r = await run(['sessions', 'list'], { timeout: 10000 });
  return { stdout: r.stdout || r.stderr || 'No sessions.' };
}

export async function sessionExport(sessionId: string): Promise<string> {
  const r = await run(['sessions', 'export', '--session-id', sessionId, '-'], { timeout: 15000 });
  return r.stdout || r.stderr || '';
}

export async function sessionNew(name: string): Promise<{ stdout: string }> {
  const r = await run(['sessions', 'rename', name, name]); // sessions rename <old> <new>
  return { stdout: r.stdout || r.stderr || 'Session created.' };
}

// ── Kanban ──
export async function kanbanList(): Promise<string> {
  const r = await run(['kanban', 'list'], { timeout: 10000 });
  return r.stdout || r.stderr || '';
}
export async function kanbanCreate(title: string, body?: string) {
  return run(['kanban', 'create', title, ...(body ? ['--body', body] : [])]);
}
export async function kanbanShow(id: string) { return run(['kanban', 'show', id]); }
export async function kanbanComplete(ids: string[]) { return run(['kanban', 'complete', ...ids]); }
export async function kanbanComment(id: string, comment: string) { return run(['kanban', 'comment', id, '--body', comment]); }
export async function kanbanDecompose(id: string) { return run(['kanban', 'decompose', id], { timeout: 120000 }); }
export async function kanbanStats() { return run(['kanban', 'stats']); }
export async function kanbanAssignees() { return run(['kanban', 'assignees']); }
export async function kanbanRuns(id: string) { return run(['kanban', 'runs', id]); }
export async function kanbanBoards() { return run(['kanban', 'boards', 'list']); }
export async function kanbanGc() { return run(['kanban', 'gc']); }
export async function kanbanSwarm(goal: string, workers: string[], verifier: string, synth: string) {
  return run(['kanban', 'swarm', goal, '--verifier', verifier, '--synthesizer', synth, ...workers.flatMap(w => ['--worker', w])], { timeout: 300000 });
}
export async function kanbanDispatch() { return run(['kanban', 'dispatch'], { timeout: 120000 }); }

// ── Agent ──
export async function hermesStatus(): Promise<{ stdout: string }> {
  const r = await run(['status'], { timeout: 10000 });
  return { stdout: r.stdout || r.stderr || '(no output)' };
}
export async function agentRun(prompt: string): Promise<{ stdout: string }> {
  const r = await run(['-z', prompt], { timeout: 300000 });
  return { stdout: r.stdout || r.stderr || '(no output)' };
}
