import { useEffect, useState } from 'react';
import { api, EmailRow } from './api';

export default function Emails() {
  const [list, setList] = useState<EmailRow[]>([]);
  const [sel, setSel] = useState<EmailRow | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState('');

  const load = () => api<{ emails: EmailRow[] }>('/api/emails').then((r) => setList(r.emails));
  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const open = async (e: EmailRow) => {
    setReply(''); setSentMsg('');
    const r = await api<{ email: EmailRow }>('/api/emails/' + e.id);
    setSel(r.email);
  };
  const del = async () => {
    if (!sel) return;
    if (!confirm('Excluir este email?')) return;
    await api('/api/emails/' + sel.id, { method: 'DELETE' });
    setSel(null); load();
  };
  const sendReply = async () => {
    if (!sel || !reply.trim() || sending) return;
    setSending(true); setSentMsg('');
    try {
      await api('/api/emails/' + sel.id + '/reply', { method: 'POST', body: JSON.stringify({ text: reply.trim() }) });
      setSentMsg('✅ Resposta enviada pra ' + sel.from_addr);
      setReply(''); load();
    } catch (e: any) { setSentMsg('⚠️ ' + e.message); }
    setSending(false);
  };

  return (
    <div className="page">
      <div className="em2">
        <div className="card emlist" style={{ padding: 0 }}>
          {list.map((e) => (
            <div key={e.id} className={'emitem' + (sel?.id === e.id ? ' on' : '')} onClick={() => open(e)}>
              <div className="row">
                <span className="fr">{e.direction === 'out' ? '↗ ' : ''}{e.direction === 'out' ? e.to_addr : (e.from_name || e.from_addr)}</span>
                <div className="spacer" />
                <span className="muted" style={{ fontSize: 11 }}>{(e.date || e.created_at || '').slice(0, 16).replace('T', ' ')}</span>
              </div>
              <div className="sb">{e.subject}</div>
              <div className="pv">{e.preview}</div>
            </div>
          ))}
          {!list.length && <div style={{ padding: 16 }} className="muted">
            Nenhum email ainda. Tudo que chegar em @imovelemdolar.com.br aparece aqui.
          </div>}
        </div>
        <div className="card">
          {!sel ? (
            <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Selecione um email</div>
          ) : (
            <>
              <div className="row wrap">
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{sel.subject}</h3>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    De: <b>{sel.from_name}</b> &lt;{sel.from_addr}&gt; · Para: {sel.to_addr}
                  </div>
                </div>
                <div className="spacer" />
                <button className="btn danger sm" onClick={del}>Excluir</button>
              </div>
              <div style={{ marginTop: 14 }}>
                {sel.html ? (
                  <iframe className="embody" sandbox="" srcDoc={sel.html} style={{ height: '48vh' }} />
                ) : (
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', maxHeight: '48vh', overflowY: 'auto' }}>{sel.text}</pre>
                )}
              </div>
              {sel.direction !== 'out' && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <label className="fld">Responder pra {sel.from_addr} (sai de contato@imovelemdolar.com.br)</label>
                  <textarea rows={4} placeholder="Escreva sua resposta…" value={reply} onChange={(e) => setReply(e.target.value)} />
                  <div className="row" style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 13 }} className={sentMsg.startsWith('✅') ? 'ok' : 'muted'}>{sentMsg}</span>
                    <div className="spacer" />
                    <button className="btn primary" disabled={sending || !reply.trim()} onClick={sendReply}>
                      {sending ? 'Enviando…' : '📤 Enviar resposta'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
