import { useEffect, useState } from 'react';
import { api, EmailRow } from './api';

export default function Emails() {
  const [list, setList] = useState<EmailRow[]>([]);
  const [sel, setSel] = useState<EmailRow | null>(null);

  const load = () => api<{ emails: EmailRow[] }>('/api/emails').then((r) => setList(r.emails));
  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, []);

  const open = async (e: EmailRow) => {
    const r = await api<{ email: EmailRow }>('/api/emails/' + e.id);
    setSel(r.email);
  };
  const del = async () => {
    if (!sel) return;
    if (!confirm('Excluir este email?')) return;
    await api('/api/emails/' + sel.id, { method: 'DELETE' });
    setSel(null); load();
  };

  return (
    <div className="page">
      <div className="em2">
        <div className="card emlist" style={{ padding: 0 }}>
          {list.map((e) => (
            <div key={e.id} className={'emitem' + (sel?.id === e.id ? ' on' : '')} onClick={() => open(e)}>
              <div className="row">
                <span className="fr">{e.from_name || e.from_addr}</span>
                <div className="spacer" />
                <span className="muted" style={{ fontSize: 11 }}>{(e.date || e.created_at || '').slice(0, 16).replace('T', ' ')}</span>
              </div>
              <div className="sb">{e.subject}</div>
              <div className="pv">{e.preview}</div>
            </div>
          ))}
          {!list.length && <div style={{ padding: 16 }} className="muted">
            Nenhum email recebido ainda. Os emails enviados pra qualquer endereço @imovelemdolar.com.br vão aparecer aqui.
          </div>}
        </div>
        <div className="card">
          {!sel ? (
            <div className="muted" style={{ padding: 30, textAlign: 'center' }}>Selecione um email</div>
          ) : (
            <>
              <div className="row wrap">
                <div>
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
                  <iframe className="embody" sandbox="" srcDoc={sel.html} style={{ height: '65vh' }} />
                ) : (
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{sel.text}</pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
