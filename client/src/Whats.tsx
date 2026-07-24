import { useEffect, useRef, useState } from 'react';
import { api, Chat, Msg, fmtTs } from './api';

export default function Whats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [sel, setSel] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ connected: boolean; owner: string; qrcode?: string } | null>(null);
  const [qr, setQr] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadStatus = () => api('/api/wa/status').then(setStatus).catch(() => setStatus(null));
  const loadChats = () => api<{ chats: Chat[] }>('/api/wa/chats').then((r) => setChats(r.chats)).catch((e) => setErr(e.message));
  const loadMsgs = (c: Chat) =>
    api<{ messages: Msg[] }>('/api/wa/messages?chatid=' + encodeURIComponent(c.chatid))
      .then((r) => setMsgs(r.messages)).catch(() => {});

  useEffect(() => {
    loadStatus(); loadChats();
    const i = setInterval(() => { loadChats(); }, 10000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    if (!sel) return;
    loadMsgs(sel);
    const i = setInterval(() => loadMsgs(sel), 5000);
    return () => clearInterval(i);
  }, [sel?.chatid]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto' }); }, [msgs.length, sel?.chatid]);

  const connect = async () => {
    try {
      const r = await api<{ qrcode: string }>('/api/wa/connect', { method: 'POST' });
      setQr(r.qrcode || '');
      setTimeout(loadStatus, 4000);
    } catch (e: any) { setErr(e.message); }
  };

  const send = async () => {
    if (!sel || !text.trim() || sending) return;
    setSending(true);
    try {
      await api('/api/wa/send', { method: 'POST', body: JSON.stringify({ chatid: sel.chatid, text: text.trim() }) });
      setMsgs((m) => [...m, { id: 'tmp' + Date.now(), fromMe: true, text: text.trim(), kind: 'text', fileURL: '', senderName: '', ts: Date.now() }]);
      setText('');
      setTimeout(() => loadMsgs(sel), 1500);
    } catch (e: any) { alert('Falha ao enviar: ' + e.message); }
    setSending(false);
  };

  if (status && !status.connected) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div className="card" style={{ maxWidth: 380, margin: '0 auto' }}>
          <h3>WhatsApp desconectado</h3>
          <p className="muted">Conecte o número do Imóvel em Dólar escaneando o QR code no app do WhatsApp.</p>
          {(qr || status.qrcode) ? (
            <img src={qr || status.qrcode} alt="QR code" style={{ width: 260, borderRadius: 10, background: '#fff', padding: 8 }} />
          ) : null}
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={connect}>Gerar QR code</button>{' '}
            <button className="btn" onClick={loadStatus}>Atualizar status</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wa2">
      <div className={'walist' + (sel ? ' hidemob' : '')}>
        {err && <div style={{ padding: 12, color: 'var(--warn)' }}>{err}</div>}
        {chats.map((c) => (
          <div key={c.chatid} className={'wachat' + (sel?.chatid === c.chatid ? ' on' : '')} onClick={() => { setMsgs([]); setSel(c); }}>
            {c.image ? <img src={c.image} alt="" /> : <div className="ph">👤</div>}
            <div className="info">
              <div className="nm">{c.name}</div>
              <div className="lt">{c.lastText || '…'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="muted" style={{ fontSize: 11 }}>{fmtTs(c.ts)}</div>
              {c.unread > 0 && <span className="un">{c.unread}</span>}
            </div>
          </div>
        ))}
        {!chats.length && !err && <div style={{ padding: 16 }} className="muted">Carregando conversas…</div>}
      </div>
      <div className={'waconv' + (!sel ? ' hidemob' : '')}>
        {!sel ? (
          <div className="waempty">Selecione uma conversa</div>
        ) : (
          <>
            <div className="row" style={{ padding: '10px 14px', background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
              <button className="btn sm" onClick={() => setSel(null)}>←</button>
              <b>{sel.name}</b>
              <span className="muted" style={{ fontSize: 12 }}>{sel.phone}</span>
            </div>
            <div className="wamsgs">
              {msgs.map((m) => (
                <div key={m.id} className={'bubble' + (m.fromMe ? ' me' : '')}>
                  {m.kind !== 'text' && <div className="pill" style={{ marginBottom: 4 }}>{m.kind}</div>}
                  {m.kind === 'image' && m.fileURL && <img src={m.fileURL} style={{ maxWidth: 260, borderRadius: 8, display: 'block', marginBottom: 4 }} />}
                  {m.text || (m.kind !== 'text' ? '' : '…')}
                  <div className="ts">{fmtTs(m.ts)}</div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="wasend">
              <textarea placeholder="Mensagem…" value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="btn primary" disabled={sending || !text.trim()} onClick={send}>Enviar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
