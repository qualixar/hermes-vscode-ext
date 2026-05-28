/**
 * Hermes VS Code Extension — Webview Provider (v0.4.2)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { HermesClient } from './hermes-client';
import type { ChatMessage, ChatContentPart } from './hermes-types';
import * as cli from './hermes-cli';

interface ChatTurn { role: 'user' | 'assistant'; content: string; images?: string[]; }

export class SidebarChatProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private history: ChatTurn[] = [];
  private cancelStream: (() => void) | undefined;
  private htmlCache: string | undefined;

  constructor(private extUri: vscode.Uri, private client: HermesClient) {}

  resolveWebviewView(wv: vscode.WebviewView, _c: vscode.WebviewViewResolveContext, _t: vscode.CancellationToken): void {
    this.view = wv;
    wv.webview.options = { enableScripts: true };
    wv.webview.html = this.loadHtml();
    wv.webview.onDidReceiveMessage((m) => this.handle(m));
  }
  reveal(): void { this.view?.show(true); }
  setConnected(ok: boolean): void { this.post({ command: ok ? 'connected' : 'disconnected' }); }

  clearChat(): void {
    this.history = [];
    this.post({ command: 'clearChat' });
  }

  loadHistory(messages: { role: string; content: string }[]): void {
    this.history = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    this.post({ command: 'loadHistory', messages });
  }

  private post(d: Record<string, unknown>): void { this.view?.webview.postMessage(d); }

  private async handle(m: Record<string, any>): Promise<void> {
    const c: string = m.command || '';

    // Chat
    if (c === 'send') { await this.send(m.text || '', m.images || []); return; }
    if (c === 'cancel') { this.cancelStream?.(); this.post({ command: 'setThinking', thinking: false }); return; }

    // Config — use cli.readConfig() which handles pager issues
    if (c === 'configLoad') { await this.loadConfig(); return; }
    if (c === 'openConfigEditor') { vscode.commands.executeCommand('hermes.showConfig'); return; }

    // Gateway
    if (c === 'gatewayLoad') { await this.loadGateway(); return; }
    if (c === 'gatewayRestart') {
      this.post({ command: 'gatewayResult', text: 'Restarting gateway...' });
      await cli.run(['gateway', 'restart'], { timeout: 15000 });
      setTimeout(() => this.loadGateway(), 2000);
      return;
    }

    // Cron
    if (c === 'cronLoad') { await this.loadCron(); return; }
    if (c === 'cronCreate') { vscode.commands.executeCommand('hermes.cronCreate'); return; }
    if (c === 'cronRemove') { vscode.commands.executeCommand('hermes.cronRemove'); return; }

    // MCP
    if (c === 'mcpLoad') { await this.loadMcp(); return; }
    if (c === 'mcpAdd') {
      const name = (m.name || '').trim();
      const url = (m.url || '').trim();
      if (!name) { this.post({ command: 'mcpResult', text: 'Please enter a server name.' }); return; }
      const args = ['mcp', 'add', name];
      if (url) args.push('--url', url);
      try {
        const r = await cli.run(args);
        this.post({ command: 'mcpResult', text: (r.stdout || r.stderr || 'Added.') + '\n\nRefresh to see updated list.' });
      } catch (e: any) { this.post({ command: 'mcpResult', text: 'Error: ' + (e.message || e) }); }
      return;
    }

    // Skills
    if (c === 'skillsLoad') { await this.loadSkills(); return; }

    // Media
    if (c === 'generateImage' || c === 'generateVideo') {
      const p = (m.prompt || '').trim();
      if (!p) { this.post({ command: 'mediaResult', text: 'Please enter a prompt.' }); return; }
      this.post({ command: 'mediaResult', text: 'Generating...' });
      const r = await this.client.chat(p, []);
      const txt = r.ok ? r.data : 'Error: ' + r.error;
      this.post({ command: 'mediaResult', text: txt });
      return;
    }
    if (c === 'analyzeImage') { vscode.commands.executeCommand('hermes.analyzeImage'); return; }

    // Session
    if (c === 'sessionNew') { vscode.commands.executeCommand('hermes.newSession'); return; }
  }

  // ── Streaming chat ──
  private async send(text: string, images: string[]): Promise<void> {
    if (this.cancelStream) { this.cancelStream(); this.cancelStream = undefined; }
    this.history.push({ role: 'user', content: text, images });
    this.post({ command: 'addMessage', role: 'user', content: text, images });
    this.post({ command: 'setThinking', thinking: true });

    const apiMessages: ChatMessage[] = this.history.map((h) => {
      if (h.role === 'assistant') return { role: 'assistant', content: h.content };
      if (h.images?.length) {
        const parts: ChatContentPart[] = [{ type: 'text', text: h.content }];
        for (const img of h.images) parts.push({ type: 'image_url', image_url: { url: img } });
        return { role: 'user', content: parts };
      }
      return { role: 'user', content: h.content };
    });

    const at: ChatTurn = { role: 'assistant', content: '' };
    this.history.push(at);

    this.cancelStream = this.client.streamChat(
      text, apiMessages, 'hermes',
      (token) => {
        if (token.indexOf('[USAGE:') >= 0) {
          try {
            const m = token.match(/\[USAGE:(\{.*?\})\]/);
            if (m) {
              const u = JSON.parse(m[1]);
              this.post({ command: 'setUsage', text: 'Tokens: ' + (u.prompt_tokens || 0) + ' in | ' + (u.completion_tokens || 0) + ' out | ' + (u.total_tokens || 0) + ' total' });
            }
          } catch {}
          return;
        }
        at.content += token;
        this.post({ command: 'appendToken', token });
      },
      (done) => { at.content = done; this.post({ command: 'setThinking', thinking: false }); this.cancelStream = undefined; },
      (err) => {
        this.post({ command: 'appendToken', token: '\nError: ' + err });
        this.post({ command: 'setThinking', thinking: false }); this.cancelStream = undefined;
      },
    );
  }

  // ── Tab loaders ──

  private async loadConfig(): Promise<void> {
    try {
      const text = await cli.readConfig();
      this.post({ command: 'configResult', text: text || '(empty)' });
    } catch (e: any) { this.post({ command: 'configResult', text: 'Error: ' + (e.message || e) }); }
  }

  private async loadGateway(): Promise<void> {
    try {
      const r = await cli.gatewayStatus();
      this.post({ command: 'gatewayResult', text: r.stdout || '(empty)' });
    } catch (e: any) { this.post({ command: 'gatewayResult', text: 'Error: ' + (e.message || e) }); }
  }

  private async loadCron(): Promise<void> {
    try {
      const r = await cli.cronList();
      this.post({ command: 'cronResult', text: r.stdout || 'No cron jobs.' });
    } catch (e: any) { this.post({ command: 'cronResult', text: 'Error: ' + (e.message || e) }); }
  }

  private async loadMcp(): Promise<void> {
    try {
      const config = await cli.readConfig();
      const m = config.match(/mcp_servers:[\s\S]*?(?=^\w|\Z)/m);
      this.post({ command: 'mcpResult', text: (m ? m[0] : 'None found.') + '\n\n22 tools via hermes-tools.py' });
    } catch (e: any) { this.post({ command: 'mcpResult', text: 'Error: ' + (e.message || e) }); }
  }

  private async loadSkills(): Promise<void> {
    try {
      const r = await cli.skillsList();
      this.post({ command: 'skillsResult', text: r.stdout || 'No skills found.' });
    } catch (e: any) { this.post({ command: 'skillsResult', text: 'Error: ' + (e.message || e) }); }
  }

  // ── HTML ──
  private loadHtml(): string {
    if (this.htmlCache) return this.htmlCache;
    try {
      this.htmlCache = fs.readFileSync(path.join(this.extUri.fsPath, 'webview', 'chat.html'), 'utf-8');
      return this.htmlCache;
    } catch { return '<html><body>Failed to load Hermes webview.</body></html>'; }
  }
}
