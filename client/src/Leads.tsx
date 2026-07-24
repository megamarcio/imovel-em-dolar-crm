import { useEffect, useState } from 'react';
import { api, Lead } from './api';

const STAGE_LABEL: Record<string, string> = {
  novo: 'Novo', contato: 'Em contato', qualificado: 'Qualificado',
  proposta: 'Proposta', ganho: 'Ganho', perdido: 'Perdido',
};
const SOURCES = ['manual', 'whatsapp', 'email', 'site', 'instagram', 'indicação', 'outro'];
const fmtBRL = (v: number) => v ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' }) : '';

const EMPTY: Partial<Lead> = { name: '', phone: '', email: '', source: 'manual', stage: 'novo', value: 0, notes: '' };

export default function Leads({ initialQ = '' }: { initialQ?: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [q, setQ] = useState(initialQ);
  const [edit, setEdit] = useState<Partial<Lead> | null>(null);
  const [dragOver, setDragOver] = useState('');

  const load = async () => {
    const r = await api<{ leads: Lead[]; stages: string[] }>('/api/leads?q=' + encodeURIComponent(q));
    setLeads(r.leads); setStages(r.stages);
  };
  useEffect(() => { load(); }, [q]);

  const save = async () => {
    if (!edit) return;
    if (edit.id) await api('/api/leads/' + edit.id, { method: 'PATCH', body: JSON.stringify(edit) });
    else await api('/api/leads', { method: 'POST', body: JSON.stringify(edit) });
    setEdit(null); load();
  };
  const del = async () => {
    if (!edit?.id) return;
    if (!confirm('Excluir este lead?')) return;
    await api('/api/leads/' + edit.id, { method: 'DELETE' });
    setEdit(null); load();
  };
  const moveStage = async (id: number, stage: string) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    await api('/api/leads/' + id, { method: 'PATCH', body: JSON.stringify({ stage }) });
  };

  return (
    <div className="page">
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <input placeholder="🔎 buscar nome, telefone, email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300 }} />
        <div className="spacer" />
        <button className={'btn' + (view === 'kanban' ? ' primary' : '')} onClick={() => setView('kanban')}>Kanban</button>
        <button className={'btn' + (view === 'lista' ? ' primary' : '')} onClick={() => setView('lista')}>Lista</button>
        <button className="btn primary" onClick={() => setEdit({ ...EMPTY })}>+ Novo lead</button>
      </div>

      {view === 'kanban' && (
        <div className="kanban">
          {stages.map((st) => {
            const cards = leads.filter((l) => l.stage === st);
            return (
              <div key={st} className={'kcol ' + st + (dragOver === st ? ' dragover' : '')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(st); }}
                onDragLeave={() => setDragOver('')}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver('');
                  const id = Number(e.dataTransfer.getData('text/plain'));
                  if (id) moveStage(id, st);
                }}>
                <h4><span>{STAGE_LABEL[st] || st}</span> <span className="cnt">{cards.length}</span></h4>
                {cards.map((l) => (
                  <div key={l.id} className="kcard" draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(l.id))}
                    onClick={() => setEdit(l)}>
                    <div className="nm">{l.name || l.phone || l.email}</div>
                    <div className="sub">{[l.phone, l.email].filter(Boolean).join(' · ')}</div>
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      <span className="pill">{l.source}</span>
                      {l.value > 0 && <span className="pill">{fmtBRL(l.value)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {view === 'lista' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Nome</th><th>Telefone</th><th>Email</th><th>Origem</th><th>Etapa</th><th>Valor</th><th>Atualizado</th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} onClick={() => setEdit(l)}>
                  <td>{l.name}</td><td>{l.phone}</td><td>{l.email}</td>
                  <td><span className="pill">{l.source}</span></td>
                  <td>{STAGE_LABEL[l.stage] || l.stage}</td>
                  <td>{fmtBRL(l.value)}</td>
                  <td className="muted">{(l.updated_at || '').slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
              {!leads.length && <tr><td colSpan={7} className="muted">Nenhum lead ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{edit.id ? 'Editar lead' : 'Novo lead'}</h3>
            <label className="fld">Nome</label>
            <input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <label className="fld">WhatsApp / Telefone</label>
            <input value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="ex: 14079227481" />
            <label className="fld">Email</label>
            <input value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="fld">Origem</label>
                <select value={edit.source || 'manual'} onChange={(e) => setEdit({ ...edit, source: e.target.value })}>
                  {SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="fld">Etapa</label>
                <select value={edit.stage || 'novo'} onChange={(e) => setEdit({ ...edit, stage: e.target.value })}>
                  {stages.map((s) => <option key={s} value={s}>{STAGE_LABEL[s] || s}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="fld">Valor (US$)</label>
                <input type="number" value={edit.value || 0} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} />
              </div>
            </div>
            <label className="fld">Anotações</label>
            <textarea rows={4} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <div className="row" style={{ marginTop: 14 }}>
              {!!edit.id && <button className="btn danger" onClick={del}>Excluir</button>}
              <div className="spacer" />
              <button className="btn" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn primary" onClick={save}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
