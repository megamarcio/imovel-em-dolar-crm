import { useEffect, useRef, useState } from 'react';
import { api, Chat, Msg, fmtTs } from './api';

interface Quick { id: string; label: string; text: string }

function fileToDataUri(f: File): Promise<string> {
  return new Promise((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = err;
    r.readAsDataURL(f);
  });
}
const typeFromFile = (f: File) =>
  f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'document';

function applyVars(text: string, chat: Chat | null) {
  const now = new Date();
  return text
    .replace(/\{nome\}/g, chat?.name || '')
    .replace(/\{telefone\}/g, chat?.phone || '')
    .replace(/\{data\}/g, now.toLocaleDateString('pt-BR'))
    .replace(/\{hora\}/g, now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
}

export default function Whats({ onOpenLead }: { onOpenLead: (phone: string) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [tab, setTab] = useState<'dm' | 'group'>('dm');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [status, setStatus] = useState<{ connected: boolean; owner: string; qrcode?: string } | null>(null);
  const [qr, setQr] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [quick, setQuick] = useState<Quick[]>([]);
  const [showQuick, setShowQuick] = useState(false);
  const [editQuick, setEditQuick] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadStatus = () => api('/api/wa/status').then(setStatus).catch(() => setStatus(null));
  const loadChats = () => api<{ chats: Chat[] }>('/api/wa/chats').then((r) => { setChats(r.chats); setErr(''); }).catch((e) => setErr(e.message));
  const loadMsgs = (c: Chat) =>
    api<{ messages: Msg[] }>('/api/wa/messages?chatid=' + encodeURIComponent(c.chatid))
      .then((r) => setMsgs(r.messages)).catch(() => {});
  const loadQuick = () => api<{ quick: Quick[] }>('/api/wa/quick').then((r) => setQuick(r.quick)).catch(() => {});

  useEffect(() => {
    loadStatus(); loadChats(); loadQuick();
    const i = setInterval(loadChats, 10000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    if (!sel) return;
    loadMsgs(sel);
    api('/api/wa/read', { method: 'POST', body: JSON.stringify({ chatid: sel.chatid, read: true }) }).catch(() => {});
    setChats((cs) => cs.map((c) => (c.chatid === sel.chatid ? { ...c, unread: 0 } : c)));
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
      await api('/api/wa/send', {
        method: 'POST',
        body: JSON.stringify({ chatid: sel.chatid, text: text.trim(), replyid: replyTo?.id || undefined }),
      });
      setMsgs((m) => [...m, { id: 'tmp' + Date.now(), fromMe: true, text: text.trim(), kind: 'text', fileURL: '', mimetype: '', senderName: '', quoted: replyTo?.text || '', ts: Date.now() }]);
      setText(''); setReplyTo(null);
      setTimeout(() => loadMsgs(sel), 1500);
    } catch (e: any) { alert('Falha ao enviar: ' + e.message); }
    setSending(false);
  };

  const sendFile = async (f: File) => {
    if (!sel) return;
    setSending(true);
    try {
      const uri = await fileToDataUri(f);
      const type = typeFromFile(f);
      const caption = text.trim();
      await api('/api/wa/send-media', {
        method: 'POST',
        body: JSON.stringify({ chatid: sel.chatid, type, file: uri, caption, docName: type === 'document' ? f.name : '' }),
      });
      setText('');
      setTimeout(() => loadMsgs(sel), 2000);
    } catch (e: any) { alert('Falha ao enviar mídia: ' + e.message); }
    setSending(false);
  };

  const refreshMedia = async (m: Msg) => {
    try {
      const r = await api<{ fileURL: string }>('/api/wa/media-url', { method: 'POST', body: JSON.stringify({ msgid: m.id }) });
      if (r.fileURL) setMsgs((ms) => ms.map((x) => (x.id === m.id ? { ...x, fileURL: r.fileURL } : x)));
    } catch { alert('Não consegui recarregar essa mídia'); }
  };

  const delMsg = async (m: Msg) => {
    if (!confirm('Apagar esta mensagem pra todos?')) return;
    await api('/api/wa/msg/delete', { method: 'POST', body: JSON.stringify({ msgid: m.id }) }).catch((e) => alert(e.message));
    setMsgs((ms) => ms.filter((x) => x.id !== m.id));
  };

  const markUnread = async (c: Chat) => {
    await api('/api/wa/read', { method: 'POST', body: JSON.stringify({ chatid: c.chatid, read: false }) }).catch(() => {});
    setChats((cs) => cs.map((x) => (x.chatid === c.chatid ? { ...x, unread: 1 } : x)));
  };
  const delChat = async (c: Chat) => {
    if (!confirm(`Excluir a conversa com ${c.name}? Some do aparelho também.`)) return;
    await api('/api/wa/chat/delete', { method: 'POST', body: JSON.stringify({ chatid: c.chatid }) }).catch((e) => alert(e.message));
    if (sel?.chatid === c.chatid) setSel(null);
    loadChats();
  };
  const rename = async () => {
    if (!sel) return;
    const name = prompt('Nome do contato / lead:', sel.name);
    if (!name) return;
    if (sel.leadId) {
      await api('/api/leads/' + sel.leadId, { method: 'PATCH', body: JSON.stringify({ name }) });
    } else {
      await api('/api/leads', { method: 'POST', body: JSON.stringify({ name, phone: sel.phone, source: 'whatsapp' }) });
    }
    setSel({ ...sel, name });
    loadChats();
  };

  const saveQuick = async (list: Quick[]) => {
    const r = await api<{ quick: Quick[] }>('/api/wa/quick', { method: 'PUT', body: JSON.stringify({ quick: list }) });
    setQuick(r.quick);
  };

  const visible = chats
    .filter((c) => (tab === 'group' ? c.isGroup : !c.isGroup))
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q.replace(/\D/g, '')));

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
        <div className="wahead">
          <input placeholder="🔎 Buscar conversa…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="modebar">
            <button className={tab === 'dm' ? 'active' : ''} onClick={() => setTab('dm')}>Conversas</button>
            <button className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}>Grupos</button>
          </div>
        </div>
        {err && <div style={{ padding: 12, color: 'var(--warn)' }}>{err}</div>}
        {visible.map((c) => (
          <div key={c.chatid} className={'wachat' + (sel?.chatid === c.chatid ? ' on' : '')} onClick={() => { setMsgs([]); setReplyTo(null); setSel(c); }}>
            {c.image ? <img src={c.image} alt="" /> : <div className="ph">{c.isGroup ? '👥' : '👤'}</div>}
            <div className="info">
              <div className="nm">{c.pinned ? '📌 ' : ''}{c.name} {c.leadStage && <span className={'stagechip ' + c.leadStage}>{c.leadStage}</span>}</div>
              <div className="lt">{c.lastText || '…'}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="muted" style={{ fontSize: 11 }}>{fmtTs(c.ts)}</div>
              {c.unread > 0 && <span className="un">{c.unread}</span>}
            </div>
          </div>
        ))}
        {!visible.length && !err && <div style={{ padding: 16 }} className="muted">Nenhuma conversa.</div>}
      </div>

      <div className={'waconv' + (!sel ? ' hidemob' : '')}>
        {!sel ? (
          <div className="waempty">Selecione uma conversa</div>
        ) : (
          <>
            <div className="row convhead">
              <button className="btn sm" onClick={() => setSel(null)}>←</button>
              {sel.image ? <img src={sel.image} style={{ width: 34, height: 34, borderRadius: '50%' }} /> : <span style={{ fontSize: 22 }}>{sel.isGroup ? '👥' : '👤'}</span>}
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.name}</b>
                <span className="muted" style={{ fontSize: 12 }}>{sel.phone}</span>
              </div>
              <div className="spacer" />
              {!sel.isGroup && <button className="btn sm" title="Ver/criar lead" onClick={() => onOpenLead(sel.phone)}>📋 Lead</button>}
              {!sel.isGroup && <button className="btn sm" title="Renomear" onClick={rename}>✏️</button>}
              <button className="btn sm" title="Marcar como não lida" onClick={() => markUnread(sel)}>👁️‍🗨️</button>
              <button className="btn sm danger" title="Excluir conversa" onClick={() => delChat(sel)}>🗑</button>
            </div>
            <div className="wamsgs">
              {msgs.map((m) => (
                <div key={m.id} className={'bubble ' + (m.fromMe ? 'me' : '')}>
                  {sel.isGroup && !m.fromMe && m.senderName && <div className="sender">{m.senderName}</div>}
                  {m.quoted && <div className="quote">{m.quoted.slice(0, 120)}</div>}
                  {m.kind === 'image' && (m.fileURL
                    ? <img src={m.fileURL} style={{ maxWidth: 280, borderRadius: 8, display: 'block', marginBottom: 4, cursor: 'pointer' }} onClick={() => window.open(m.fileURL)} />
                    : <button className="btn sm" onClick={() => refreshMedia(m)}>🖼 carregar imagem</button>)}
                  {m.kind === 'audio' && (m.fileURL
                    ? <audio controls src={m.fileURL} style={{ maxWidth: 260, display: 'block', marginBottom: 4 }} />
                    : <button className="btn sm" onClick={() => refreshMedia(m)}>🎧 carregar áudio</button>)}
                  {m.kind === 'video' && (m.fileURL
                    ? <video controls src={m.fileURL} style={{ maxWidth: 280, borderRadius: 8, display: 'block', marginBottom: 4 }} />
                    : <button className="btn sm" onClick={() => refreshMedia(m)}>🎬 carregar vídeo</button>)}
                  {m.kind === 'document' && (m.fileURL
                    ? <a href={m.fileURL} target="_blank" rel="noreferrer">📄 abrir documento</a>
                    : <button className="btn sm" onClick={() => refreshMedia(m)}>📄 carregar documento</button>)}
                  {m.kind === 'sticker' && <span style={{ fontSize: 12 }} className="muted">[figurinha]</span>}
                  {m.text && <div>{m.text}</div>}
                  <div className="bactions">
                    <button title="Responder citando" onClick={() => setReplyTo(m)}>↩</button>
                    {m.fromMe && <button title="Apagar pra todos" onClick={() => delMsg(m)}>🗑</button>}
                    <span className="ts">{fmtTs(m.ts)}</span>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {replyTo && (
              <div className="replybar">
                <span>↩ Respondendo: <i>{(replyTo.text || '[' + replyTo.kind + ']').slice(0, 80)}</i></span>
                <button className="btn sm" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            {showQuick && (
              <div className="quickbar">
                {quick.map((r) => (
                  <button key={r.id} className="pill qp" onClick={() => { setText(applyVars(r.text, sel)); setShowQuick(false); }}>{r.label}</button>
                ))}
                <button className="pill qp edit" onClick={() => setEditQuick(true)}>⚙️ editar</button>
                {!quick.length && <span className="muted" style={{ fontSize: 12 }}>Sem respostas rápidas ainda — clique em editar. Variáveis: {'{nome} {telefone} {data} {hora}'}</span>}
              </div>
            )}
            <div className="wasend">
              <button className="btn" title="Respostas rápidas" onClick={() => setShowQuick(!showQuick)}>⚡</button>
              <button className="btn" title="Anexar arquivo" onClick={() => fileRef.current?.click()}>📎</button>
              <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ''; }} />
              <textarea placeholder="Mensagem…  (Enter envia, Shift+Enter quebra linha)" value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button className="btn primary" disabled={sending || !text.trim()} onClick={send}>Enviar</button>
            </div>
          </>
        )}
      </div>

      {editQuick && (
        <QuickEditor quick={quick} onClose={() => setEditQuick(false)} onSave={async (l) => { await saveQuick(l); setEditQuick(false); }} />
      )}
    </div>
  );
}

function QuickEditor({ quick, onClose, onSave }: { quick: Quick[]; onClose: () => void; onSave: (l: Quick[]) => void }) {
  const [list, setList] = useState<Quick[]>(quick.map((x) => ({ ...x })));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px,94vw)' }}>
        <h3>⚡ Respostas rápidas</h3>
        <p className="muted" style={{ fontSize: 12 }}>Variáveis: {'{nome} {telefone} {data} {hora}'}</p>
        {list.map((r, i) => (
          <div key={r.id} className="card" style={{ padding: 10, marginBottom: 8 }}>
            <div className="row">
              <input placeholder="rótulo" value={r.label} style={{ maxWidth: 160 }}
                onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <div className="spacer" />
              <button className="btn sm danger" onClick={() => setList(list.filter((_, j) => j !== i))}>remover</button>
            </div>
            <textarea rows={2} placeholder="texto da resposta" value={r.text} style={{ marginTop: 6 }}
              onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          </div>
        ))}
        <button className="btn" onClick={() => setList([...list, { id: 'q' + Date.now(), label: '', text: '' }])}>+ nova resposta</button>
        <div className="row" style={{ marginTop: 14 }}>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => onSave(list.filter((x) => x.label && x.text))}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
