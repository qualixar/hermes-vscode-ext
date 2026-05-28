/**
 * Hermes VS Code Extension — Shared Types
 */

export type KanbanStatus = 'todo' | 'doing' | 'done' | 'failed' | 'cancelled';

export interface HermesTask {
  readonly task_id: string;
  readonly status: KanbanStatus;
  readonly prompt: string;
  readonly type: string;
  readonly output?: string;
  readonly created_at?: string;
  readonly assigned_to?: string;
  readonly swarm_size?: number;
}

export interface HermesHealth {
  readonly status: 'ok' | 'error';
  readonly version?: string;
  readonly mode?: string;
}

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface ChatResponse {
  readonly message: ChatMessage;
  readonly task_id?: string;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };
