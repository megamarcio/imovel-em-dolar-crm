export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'same-origin',
    ...opts,
  });
  if (r.status === 401) { window.dispatchEvent(new Event('crm:unauth')); throw new Error('não autenticado'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'erro ' + r.status);
  return j as T;
}

export interface Lead {
  id: number; name: string; phone: string; email: string; source: string;
  stage: string; value: number; notes: string; created_at: string; updated_at: string;
}
export interface Chat {
  chatid: string; name: string; image: string; lastText: string;
  ts: number; unread: number; phone: string;
}
export interface Msg {
  id: string; fromMe: boolean; text: string; kind: string; fileURL: string;
  senderName: string; ts: number;
}
export interface EmailRow {
  id: number; from_addr: string; from_name: string; to_addr: string;
  subject: string; date: string; created_at: string; preview?: string;
  text?: string; html?: string;
}

export const fmtTs = (ts: number) => {
  if (!ts) return '';
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
