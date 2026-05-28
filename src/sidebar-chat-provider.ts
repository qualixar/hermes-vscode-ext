/**
 * Hermes VS Code Extension — Sidebar Chat Webview Provider
 *
 * Provides the chat webview in the Hermes sidebar.
 */

import * as vscode from 'vscode';
import type { HermesClient } from './hermes-client';
import type { ChatMessage } from './hermes-types';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class SidebarChatProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private history: ChatTurn[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly client: HermesClient,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'send':
          await this.handleSend(msg.text);
          break;
        case 'clear':
          this.history = [];
          this.postToWebview({ command: 'clearChat' });
          break;
      }
    });
  }

  /** Called from commands to reveal chat sidebar. */
  reveal(): void {
    if (this.view) {
      this.view.show(true);
    }
  }

  private async handleSend(text: string): Promise<void> {
    this.history.push({ role: 'user', content: text });
    this.postToWebview({ command: 'addMessage', role: 'user', content: text });

    this.postToWebview({ command: 'setThinking', thinking: true });

    const messages: ChatMessage[] = this.history.map((h) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    }));

    const result = await this.client.chat(text, messages);

    this.postToWebview({ command: 'setThinking', thinking: false });

    if (result.ok) {
      this.history.push({ role: 'assistant', content: result.data });
      this.postToWebview({
        command: 'addMessage',
        role: 'assistant',
        content: result.data,
      });
    } else {
      this.postToWebview({
        command: 'addMessage',
        role: 'assistant',
        content: `❌ Error: ${result.error}`,
      });
    }
  }

  private postToWebview(data: unknown): void {
    this.view?.webview.postMessage(data);
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hermes Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
    }
    .msg {
      margin-bottom: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      max-width: 92%;
      word-wrap: break-word;
      line-height: 1.5;
    }
    .msg.user {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .msg.assistant {
      align-self: flex-start;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
    }
    .msg.assistant pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 6px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
    }
    .msg.assistant code {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
    }
    #thinking {
      display: none;
      padding: 4px 12px;
      font-style: italic;
      opacity: 0.6;
      font-size: 12px;
    }
    #thinking.visible { display: block; }
    #input-area {
      display: flex;
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      gap: 6px;
    }
    #input-box {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: inherit;
      resize: none;
      outline: none;
    }
    #input-box:focus {
      border-color: var(--vscode-focusBorder);
    }
    #send-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
    }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #send-btn:disabled { opacity: 0.4; cursor: default; }
    .empty-state {
      text-align: center;
      padding: 24px 12px;
      opacity: 0.5;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div id="messages">
    <div class="empty-state" id="empty-state">Send a message to Hermes.</div>
  </div>
  <div id="thinking">Hermes is thinking...</div>
  <div id="input-area">
    <textarea id="input-box" rows="2" placeholder="Ask Hermes..." onkeydown="onKeyDown(event)"></textarea>
    <button id="send-btn" onclick="send()">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input-box');
    const sendBtn = document.getElementById('send-btn');
    const thinkingEl = document.getElementById('thinking');
    const emptyEl = document.getElementById('empty-state');

    function send() {
      const text = inputEl.value.trim();
      if (!text) return;
      vscode.postMessage({ command: 'send', text });
      inputEl.value = '';
      inputEl.focus();
    }

    function onKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.command) {
        case 'addMessage':
          addMessage(msg.role, msg.content);
          break;
        case 'setThinking':
          thinkingEl.className = msg.thinking ? 'visible' : '';
          if (msg.thinking) {
            sendBtn.disabled = true;
            inputEl.disabled = true;
          } else {
            sendBtn.disabled = false;
            inputEl.disabled = false;
          }
          break;
        case 'clearChat':
          messagesEl.innerHTML = '<div class="empty-state" id="empty-state">Chat cleared.</div>';
          break;
      }
    });

    function addMessage(role, content) {
      if (emptyEl) emptyEl.style.display = 'none';
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = content;
      // Simple code block rendering
      div.innerHTML = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\x60\\x60\\x60(\w*)\\n([\\s\\S]*?)\\x60\\x60\\x60/g, '<pre><code>$2</code></pre>')
        .replace(/\\x60([^\\x60]*)\\x60/g, '<code>$1</code>');
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  </script>
</body>
</html>`;
  }
}
