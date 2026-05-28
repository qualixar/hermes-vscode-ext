import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

export class AcpManager implements vscode.Disposable {
  private proc: ChildProcess | null = null;
  private out: vscode.OutputChannel;
  private bin: string;

  constructor(bin: string) {
    this.bin = bin;
    this.out = vscode.window.createOutputChannel('Hermes ACP');
  }

  get isRunning(): boolean { return this.proc !== null && this.proc.exitCode === null; }

  start(): void {
    if (this.isRunning) return;
    this.out.appendLine('[ACP] Starting: ' + this.bin + ' acp --accept-hooks');
    this.proc = spawn(this.bin, ['acp', '--accept-hooks'], { stdio: 'pipe', env: { ...process.env } });
    this.proc.stdout?.on('data', (d: Buffer) => this.out.append(d.toString()));
    this.proc.stderr?.on('data', (d: Buffer) => this.out.append(d.toString()));
    this.proc.on('exit', (code: number | null, sig: string | null) => {
      this.out.appendLine('[ACP] Exited: code=' + code + ' sig=' + sig);
      this.proc = null;
    });
  }

  stop(): void {
    if (this.proc && this.isRunning) {
      this.out.appendLine('[ACP] Stopping...');
      this.proc.kill('SIGTERM');
      setTimeout(() => { if (this.proc && this.isRunning) this.proc.kill('SIGKILL'); }, 3000);
      this.proc = null;
    }
  }

  dispose(): void { this.stop(); this.out.dispose(); }
}
