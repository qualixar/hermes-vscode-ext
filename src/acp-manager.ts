/**
 * Hermes VS Code Extension — ACP Subprocess Manager
 *
 * Manages the lifecycle of `hermes acp --accept-hooks` as a child process
 * for native editor integration (file ops, terminal, browser, approvals).
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

export class AcpManager implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private binaryPath: string;
  private restartOnCrash: boolean = true;
  private restartDelayMs: number = 2000;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(binaryPath: string) {
    this.binaryPath = binaryPath;
    this.outputChannel = vscode.window.createOutputChannel('Hermes ACP');
  }

  get isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.outputChannel.appendLine(
      `[${new Date().toISOString()}] Starting ACP: ${this.binaryPath} acp --accept-hooks`,
    );
    this.outputChannel.show(true);

    this.process = spawn(this.binaryPath, ['acp', '--accept-hooks'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.on('error', (err: Error) => {
      this.outputChannel.appendLine(`[ERROR] Failed to spawn ACP: ${err.message}`);
      vscode.window.showErrorMessage(`Hermes ACP failed to start: ${err.message}`);
    });

    this.process.on('exit', (code: number | null, signal: string | null) => {
      this.outputChannel.appendLine(
        `[${new Date().toISOString()}] ACP exited: code=${code} signal=${signal}`,
      );
      this.process = null;

      if (this.restartOnCrash && code !== 0 && signal !== 'SIGTERM') {
        this.outputChannel.appendLine(
          `Restarting ACP in ${this.restartDelayMs}ms...`,
        );
        this.restartTimer = setTimeout(() => this.start(), this.restartDelayMs);
      }
    });
  }

  async stop(): Promise<void> {
    this.restartOnCrash = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = undefined;
    }

    if (this.process && this.isRunning) {
      this.outputChannel.appendLine(
        `[${new Date().toISOString()}] Stopping ACP...`,
      );
      this.process.kill('SIGTERM');

      // Give it 3 seconds to exit gracefully, then force
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.process || this.process.exitCode !== null) {
            clearInterval(check);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(check);
          if (this.process && this.process.exitCode === null) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 3000);
      });
    }
    this.process = null;
    this.outputChannel.appendLine(
      `[${new Date().toISOString()}] ACP stopped.`,
    );
  }

  dispose(): void {
    this.stop();
    this.outputChannel.dispose();
  }
}
