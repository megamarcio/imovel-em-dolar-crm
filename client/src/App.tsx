import { useEffect, useState } from 'react';
import { api } from './api';
import Leads from './Leads';
import Whats from './Whats';
import Emails from './Emails';

type Tab = 'leads' | 'whats' | 'emails';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('leads');
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [waOk, setWaOk] = useState<boolean | null>(null);

  useEffect(() => {
    api('/api/me').then(() => setAuthed(true)).catch(() => setAuthed(false));
    const onUnauth = () => setAuthed(false);
    window.addEventListener('crm:unauth', onUnauth);
    return () => window.removeEventListener('crm:unauth', onUnauth);
  }, []);
  useEffect(() => {
    if (!authed) return;
    const check = () => api<{ connected: boolean }>('/api/wa/status').then((r) => setWaOk(r.connected)).catch(() => setWaOk(null));
    check();
    const i = setInterval(check, 60000);
    return () => clearInterval(i);
  }, [authed]);

  const login = async () => {
    setLoginErr('');
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
      setAuthed(true); setPw('');
    } catch (e: any) { setLoginErr(e.message); }
  };

  if (authed === null) return <div className="gate"><span className="muted">carregando…</span></div>;

  if (!authed) {
    return (
      <div className="gate">
        <div className="box">
          <div style={{ fontSize: 40 }}>🏠</div>
          <h2>Imóvel em Dólar <b style={{ color: 'var(--accent2)' }}>CRM</b></h2>
          <p className="muted">Entre com a senha de acesso.</p>
          <input type="password" placeholder="senha" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && login()} autoFocus />
          <button className="btn primary" style={{ marginTop: 10, width: '100%' }} onClick={login}>Entrar</button>
          {loginErr && <p style={{ color: 'var(--warn)', marginTop: 8, fontSize: 13 }}>{loginErr}</p>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="top">
        <div className="brand">🏠 Imóvel em Dólar <b>CRM</b></div>
        <div className="tabs">
          <button className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>📋 Leads</button>
          <button className={tab === 'whats' ? 'on' : ''} onClick={() => setTab('whats')}>💬 WhatsApp</button>
          <button className={tab === 'emails' ? 'on' : ''} onClick={() => setTab('emails')}>📧 Emails</button>
        </div>
        <div className="spacer" />
        {waOk !== null && (
          <span className={'badge ' + (waOk ? 'ok' : 'err')}>{waOk ? '● WhatsApp conectado' : '● WhatsApp offline'}</span>
        )}
        <button className="btn sm" onClick={async () => { await api('/api/logout', { method: 'POST' }); setAuthed(false); }}>Sair</button>
      </div>
      {tab === 'leads' && <Leads />}
      {tab === 'whats' && <Whats />}
      {tab === 'emails' && <Emails />}
    </>
  );
}
