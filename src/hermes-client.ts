/**
 * Hermes VS Code Extension — HTTP Client for Hermes API (port 8642)
 *
 * Talks to Hermes API server:
 *   GET  /health                     — health check
 *   POST /v1/chat/completions        — chat (OpenAI-compatible)
 *   hermes kanban *                  — kanban via CLI
 */

import * as http from 'http';
import * as vscode from 'vscode';
import type { ApiResult, HermesHealth, ChatMessage } from './hermes-types';

export class HermesClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8642') {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  // ── Health ────────────────────────────────────────────────────

  async health(): Promise<ApiResult<HermesHealth>> {
    return this.get<HermesHealth>('/health');
  }

  // ── Chat ──────────────────────────────────────────────────────

  async chat(message: string, history: ChatMessage[] = []): Promise<ApiResult<string>> {
    const messages = [...history, { role: 'user' as const, content: message }];
    const result = await this.post<{ choices?: { message: { content: string } }[] }>(
      '/v1/chat/completions',
      { model: 'hermes', messages },
    );
    if (!result.ok) {
      return result;
    }
    const content = result.data?.choices?.[0]?.message?.content;
    if (content) {
      return { ok: true, data: content };
    }
    return { ok: false, error: 'No response from Hermes' };
  }

  // ── HTTP helpers ──────────────────────────────────────────────

  private get<T>(endpoint: string): Promise<ApiResult<T>> {
    return new Promise((resolve) => {
      const url = new URL(endpoint, this.baseUrl);
      http
        .get(url.toString(), { timeout: 10000 }, (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => {
            try {
              resolve({ ok: true, data: JSON.parse(body) as T });
            } catch {
              resolve({ ok: false, error: `Invalid JSON: ${body.slice(0, 200)}` });
            }
          });
        })
        .on('error', (e: Error) => {
          resolve({ ok: false, error: e.message });
        });
    });
  }

  private post<T>(endpoint: string, data: unknown): Promise<ApiResult<T>> {
    return new Promise((resolve) => {
      const url = new URL(endpoint, this.baseUrl);
      const payload = JSON.stringify(data);
      const req = http.request(
        url.toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => {
            try {
              resolve({ ok: true, data: JSON.parse(body) as T });
            } catch {
              resolve({ ok: false, error: `Invalid JSON: ${body.slice(0, 200)}` });
            }
          });
        },
      );
      req.on('error', (e: Error) => {
        resolve({ ok: false, error: e.message });
      });
      req.write(payload);
      req.end();
    });
  }
}
