import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { saveStoreSetting } from '../../lib/storeInfo'
import { ENABLED_KEY, fetchSecretSantaEnabled, christmasLastOrderDate, formatDate, formatPhone } from '../../lib/secretSanta'

const fmtDay = (ts) =>
  ts ? new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'

// junta grupos, participantes e cupons pra lista do admin
export function buildAmigoOverview(groups = [], people = [], coupons = []) {
  const byGroup = new Map(groups.map((g) => [g.id, { ...g, people: [], coupon: null }]))
  for (const p of people) byGroup.get(p.group_id)?.people.push(p)
  for (const c of coupons) {
    const g = byGroup.get(c.ss_group_id)
    if (g) g.coupon = c
  }
  const list = [...byGroup.values()]
    .map((g) => ({
      ...g,
      organizer: g.people.find((p) => p.is_organizer) || null,
      approved: g.people.filter((p) => p.status === 'approved').length,
      emails: g.people.filter((p) => p.email).length,
    }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

  // lead = só quem marcou "quero receber novidades" (LGPD)
  const leads = []
  for (const g of list) {
    for (const p of g.people) {
      if (!p.marketing_optin || !p.email) continue
      leads.push({
        name: p.name,
        email: p.email,
        phone: p.is_organizer ? g.organizer_phone || '' : '',
        group: g.name,
        organizer: p.is_organizer,
        optin_at: p.optin_at,
      })
    }
  }
  leads.sort((a, b) => String(b.optin_at).localeCompare(String(a.optin_at)))
  return { groups: list, leads }
}

export function leadsCsv(leads) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['Nome', 'E-mail', 'WhatsApp', 'Grupo', 'Responsável', 'Aceitou em']
  const rows = leads.map((l) => [
    l.name,
    l.email,
    l.phone ? formatPhone(l.phone) : '',
    l.group,
    l.organizer ? 'sim' : 'não',
    l.optin_at ? new Date(l.optin_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
  ])
  return '﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\n')
}

export default function AdminAmigo() {
  const [enabled, setEnabled] = useState(null)
  const [overview, setOverview] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSecretSantaEnabled().then(setEnabled)
    Promise.all([
      supabase.from('ss_groups').select('*'),
      supabase
        .from('ss_participants')
        .select('id, group_id, name, is_organizer, status, email, marketing_optin, optin_at, created_at'),
      supabase.from('coupons').select('code, uses_count, expires_at, active, ss_group_id').not('ss_group_id', 'is', null),
    ])
      .then(([g, p, c]) => {
        const err = g.error || p.error || c.error
        if (err) {
          setLoadError(
            /column|does not exist/i.test(err.message)
              ? 'Rode o SQL add_amigo_leads_cupom_avisos.sql no Supabase pra ver grupos e leads.'
              : err.message
          )
          return
        }
        setOverview(buildAmigoOverview(g.data, p.data, c.data))
      })
      .catch((e) => setLoadError(e.message))
  }, [])

  async function toggle() {
    setSaving(true)
    setError(null)
    try {
      await saveStoreSetting(ENABLED_KEY, enabled ? 'false' : 'true')
      setEnabled(!enabled)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function downloadLeads() {
    const blob = new Blob([leadsCsv(overview.leads)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `leads-amigo-secreto-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (enabled === null) return <p className="meta">Carregando...</p>

  const groups = overview?.groups || []
  const leads = overview?.leads || []
  const people = groups.reduce((n, g) => n + g.people.length, 0)

  return (
    <div>
      <h2>Amigo secreto</h2>
      <div className="rule" />

      <div className="ss-toggle-row" style={{ maxWidth: 560 }}>
        <span>
          <b>{enabled ? 'Ligado' : 'Desligado'}</b>
          <span className="meta">
            {enabled
              ? 'Aparece no menu da loja em /amigo e qualquer pessoa pode criar grupo.'
              : 'Some da loja e ninguém cria grupo novo. Grupos que já existem continuam funcionando pelo link de cada pessoa.'}
          </span>
        </span>
        <button type="button" className="btn btn-primary" onClick={toggle} disabled={saving}>
          {enabled ? 'Desligar' : 'Ligar'}
        </button>
      </div>
      {error && <p className="ss-error">{error}</p>}

      {overview && (
        <div className="ss-facts" style={{ maxWidth: 560, marginTop: 24 }}>
          <div><span>Grupos</span><b>{groups.length}</b></div>
          <div><span>Pessoas</span><b>{people}</b></div>
          <div><span>Leads</span><b>{leads.length}</b></div>
        </div>
      )}
      {loadError && <p className="meta" style={{ marginTop: 24 }}>{loadError}</p>}

      {overview && (
        <>
          <h3 style={{ marginTop: 40 }}>Grupos</h3>
          {groups.length === 0 ? (
            <p className="meta">Nenhum grupo ainda.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Responsável</th>
                    <th>WhatsApp</th>
                    <th>Criado</th>
                    <th>Sorteio</th>
                    <th>Troca</th>
                    <th>Pessoas</th>
                    <th>Com e-mail</th>
                    <th>Cupom</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.organizer?.name || '—'}</td>
                      <td>
                        {g.organizer_phone ? (
                          <a className="link-inline" href={`https://wa.me/55${g.organizer_phone}`} target="_blank" rel="noreferrer">
                            {formatPhone(g.organizer_phone)}
                          </a>
                        ) : '—'}
                      </td>
                      <td>{fmtDay(g.created_at)}</td>
                      <td>
                        {g.drawn_at
                          ? `feito ${fmtDay(g.drawn_at)}`
                          : g.draw_mode === 'auto' && g.draw_date
                            ? formatDate(g.draw_date)
                            : 'manual'}
                      </td>
                      <td>{g.exchange_date ? formatDate(g.exchange_date) : '—'}</td>
                      <td>{g.approved}{g.people.length > g.approved ? ` (+${g.people.length - g.approved})` : ''}</td>
                      <td>{g.emails}</td>
                      <td>
                        {g.coupon ? (
                          <>
                            {g.coupon.code}
                            <span className="meta"> · {g.coupon.uses_count} {g.coupon.uses_count === 1 ? 'uso' : 'usos'} · até {fmtDay(g.coupon.expires_at)}</span>
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="ss-row" style={{ marginTop: 40, borderBottom: 0 }}>
            <h3 style={{ margin: 0 }}>Leads ({leads.length})</h3>
            {leads.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={downloadLeads}>Baixar CSV</button>
            )}
          </div>
          <p className="meta" style={{ maxWidth: 640 }}>
            Só aparece quem marcou "quero receber novidades e cupons". Os outros e-mails servem só pros avisos do
            amigo secreto e não podem ser usados em marketing.
          </p>
          {leads.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Grupo</th><th>Aceitou em</th></tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={`${l.email}-${l.group}`}>
                      <td>{l.name}{l.organizer && <span className="meta"> (responsável)</span>}</td>
                      <td>{l.email}</td>
                      <td>{l.phone ? formatPhone(l.phone) : '—'}</td>
                      <td>{l.group}</td>
                      <td>{fmtDay(l.optin_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="meta" style={{ marginTop: 32, maxWidth: 560 }}>
        A loja mostra "peça até {formatDate(christmasLastOrderDate())}" para o Natal: 7 dias de
        produção, 5 de frete e 5 de folga. Em cada grupo, o prazo é a data da troca menos 17 dias.
        Cada grupo ganha sozinho um cupom de 5% (uso ilimitado) que vale até o dia da troca; sem data
        de troca, até 30 dias depois do sorteio (ou 60 dias da criação, se nunca sortear).
      </p>
    </div>
  )
}
