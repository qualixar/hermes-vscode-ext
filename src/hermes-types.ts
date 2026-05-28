export type KanbanStatus = 'todo' | 'doing' | 'done' | 'failed' | 'cancelled';
export interface ChatContentPart { type: 'text' | 'image_url'; text?: string; image_url?: { url: string }; }
export interface ChatMessage { role: 'user' | 'assistant'; content: string | ChatContentPart[]; }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
