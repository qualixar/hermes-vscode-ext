import * as http from 'http';
import type { ApiResult, ChatMessage } from './hermes-types';

export class HermesClient {
  private baseUrl: string;
  constructor(baseUrl = 'http://localhost:8642') { this.baseUrl = baseUrl; }
  setBaseUrl(url: string): void { this.baseUrl = url; }

  async health(): Promise<ApiResult<{ status: string; version?: string }>> {
    return this.get('/health');
  }

  streamChat(
    message: string, history: ChatMessage[], model: string,
    onToken: (t: string) => void, onDone: (full: string) => void, onErr: (e: string) => void,
  ): () => void {
    const url = new URL('/v1/chat/completions', this.baseUrl);
    const msgs = [...history, { role: 'user' as const, content: message }];
    const body = JSON.stringify({ model, messages: msgs, stream: true });

    const req = http.request(url.toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 300000,
    }, (res) => {
      let fullText = '';
      let buf = '';
      res.on('data', (c: Buffer) => {
        buf += c.toString();
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data: ')) continue;
          const d = s.slice(6);
          if (d === '[DONE]') continue;
          try {
            const j = JSON.parse(d);
            const tok = j?.choices?.[0]?.delta?.content;
            if (tok) { fullText += tok; onToken(tok); }
          } catch {}
        }
      });
      res.on('end', () => onDone(fullText));
      res.on('error', (e: Error) => onErr(e.message));
    });
    req.on('error', (e: Error) => onErr(e.message));
    req.write(body);
    req.end();
    return () => req.destroy();
  }

  async chat(message: string, history: ChatMessage[], model = 'hermes'): Promise<ApiResult<string>> {
    const r = await this.post<{ choices?: { message: { content: string } }[] }>(
      '/v1/chat/completions', { model, messages: [...history, { role: 'user', content: message }], stream: false },
    );
    if (!r.ok) return r;
    return { ok: true, data: r.data?.choices?.[0]?.message?.content || 'No response' };
  }

  listModels(): Promise<ApiResult<{ data?: { id: string }[] }>> {
    return this.get('/v1/models');
  }

  private get<T>(endpoint: string): Promise<ApiResult<T>> {
    return new Promise((res) => {
      http.get(new URL(endpoint, this.baseUrl).toString(), { timeout: 10000 }, (r) => {
        let b = ''; r.on('data', (c: Buffer) => b += c.toString());
        r.on('end', () => { try { res({ ok: true, data: JSON.parse(b) }); } catch { res({ ok: false, error: b.slice(0, 200) }); } });
      }).on('error', (e: Error) => res({ ok: false, error: e.message }));
    });
  }

  private post<T>(endpoint: string, body: unknown): Promise<ApiResult<T>> {
    return new Promise((res) => {
      const p = JSON.stringify(body);
      const r = http.request(new URL(endpoint, this.baseUrl).toString(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 120000,
      }, (rr) => {
        let b = ''; rr.on('data', (c: Buffer) => b += c.toString());
        rr.on('end', () => { try { res({ ok: true, data: JSON.parse(b) }); } catch { res({ ok: false, error: b.slice(0, 200) }); } });
      });
      r.on('error', (e: Error) => res({ ok: false, error: e.message }));
      r.write(p); r.end();
    });
  }
}
