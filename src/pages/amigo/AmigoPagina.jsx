import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  fetchMyPage,
  forgetGroup,
  formatDate,
  lastOrderDate,
  personalUrl,
  rememberGroup,
  removeFromWishlist,
  reportMessage,
  sendMessage,
  setGiftIdeas,
  setContact,
  isValidEmail,
  isValidPhone,
  formatPhone,
  today,
  updateMe,
  valueRangeText,
  whatsappShareUrl,
} from '../../lib/secretSanta'
import CopyButton from '../../components/amigo/CopyButton'
import SizePicker from '../../components/amigo/SizePicker'
import Chat from '../../components/amigo/Chat'
import WishItem from '../../components/amigo/WishItem'
import OrganizerPanel from '../../components/amigo/OrganizerPanel'
import GiftIdeasField from '../../components/amigo/GiftIdeasField'
import ContactFields from '../../components/amigo/ContactFields'
import { COUPON_PREFILL_KEY } from '../RescueCart'

// Página secreta de cada pessoa (o link pessoal é o "login").
export default function AmigoPagina() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const isNew = searchParams.get('novo') === '1'
  const [data, setData] = useState(undefined)
  const [loadError, setLoadError] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingIdeas, setEditingIdeas] = useState(false)
  const [editingContact, setEditingContact] = useState(false)
  const [showLink, setShowLink] = useState(isNew)

  const reload = useCallback(
    () =>
      fetchMyPage(token)
        .then((d) => {
          setData(d)
          rememberGroup(token, d.group.name, d.me.name)
        })
        .catch((err) => {
          setLoadError(err.message)
          setData(null)
          forgetGroup(token)
        }),
    [token]
  )

  useEffect(() => {
    reload()
  }, [reload])

  // cupom do grupo já vem preenchido no checkout (a pessoa só clica Aplicar)
  const couponCode = data?.group?.coupon_code
  useEffect(() => {
    if (!couponCode) return
    try {
      localStorage.setItem(COUPON_PREFILL_KEY, couponCode)
    } catch {
      // sem armazenamento: a pessoa copia o cupom
    }
  }, [couponCode])

  if (data === undefined) return <p className="meta container" style={{ paddingTop: 40 }}>Carregando...</p>
  if (data === null) {
    return (
      <div className="container empty-state">
        <p>{loadError || 'Link inválido.'}</p>
      </div>
    )
  }

  const { me, group, target } = data
  const myUrl = personalUrl(token)
  const lastOrder = group.exchange_date ? lastOrderDate(group.exchange_date) : null
  const late = lastOrder && lastOrder < today()

  return (
    <div className="container ss-page ss-narrow">
      <div className="ss-kicker">{group.name}</div>
      <p className="ss-lead">Oi, {me.name}. Esta página é só sua.</p>

      {showLink ? (
        <section className="ss-box ss-box-strong">
          <b>Este é o seu link secreto</b>
          <span className="meta">
            É só por ele que você vê quem tirou. Não tem senha: guarde e não compartilhe.
          </span>
          <div className="ss-url">{myUrl}</div>
          <div className="ss-actions-row">
            <a
              className="btn btn-primary"
              href={whatsappShareUrl(`Meu link do amigo secreto da ${group.name} (não compartilhar): ${myUrl}`)}
              target="_blank"
              rel="noreferrer"
            >
              Salvar no meu WhatsApp
            </a>
            <CopyButton text={myUrl} />
            {!isNew && (
              <button type="button" className="btn btn-secondary" onClick={() => setShowLink(false)}>Fechar</button>
            )}
          </div>
          <span className="meta ss-small">
            Dica: no WhatsApp, mande para você mesmo (conversa com o seu próprio número).
          </span>
        </section>
      ) : (
        <button type="button" className="link-btn" onClick={() => setShowLink(true)}>
          Ver meu link secreto
        </button>
      )}

      <div className="ss-facts">
        <div>
          <span>Sorteio</span>
          <b>
            {group.drawn
              ? 'Feito'
              : group.draw_mode === 'auto' && group.draw_date
                ? formatDate(group.draw_date)
                : 'Pelo responsável'}
          </b>
        </div>
        <div>
          <span>Troca</span>
          <b>{group.exchange_date ? formatDate(group.exchange_date) : 'A combinar'}</b>
        </div>
        <div>
          <span>Valor</span>
          <b>{valueRangeText(group.min_value, group.max_value)}</b>
        </div>
      </div>

      {group.coupon_code && (
        <section className="ss-box ss-coupon">
          <span>
            <span className="meta">Cupom do grupo · 5% em toda a loja{group.coupon_expires_at ? ` até ${new Date(group.coupon_expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}` : ''}</span>
            <br />
            <b className="ss-coupon-code">{group.coupon_code}</b>
          </span>
          <CopyButton text={group.coupon_code} />
        </section>
      )}

      {!me.email && !editingContact && (
        <section className="ss-box ss-box-strong">
          <b>{group.drawn ? 'Quer saber quando chegar mensagem nova?' : 'Quer saber quando sair o sorteio?'}</b>
          <span className="meta">Coloque seu e-mail que a gente avisa, com o seu link junto.</span>
          <EditContact token={token} me={me} compact onDone={reload} />
        </section>
      )}

      {me.link_reset_at && (
        <p className="ss-box ss-box-strong">
          Seu link foi trocado por quem organizou o grupo em {new Date(me.link_reset_at).toLocaleDateString('pt-BR')}.
          Isso acontece quando alguém perde o link e esquece o PIN. Se não foi você que pediu, fale com quem organizou.
        </p>
      )}

      {me.is_organizer && isNew && (
        <p className="ss-box">
          Como responsável, guarde bem seu link: ele não tem recuperação por PIN.
        </p>
      )}

      {me.status === 'pending' && (
        <p className="ss-box">
          Esperando quem organizou aprovar sua entrada. Enquanto isso, já pode montar sua lista de desejos.
        </p>
      )}

      {!group.drawn && me.status === 'approved' && (
        <p className="ss-box">
          {group.draw_mode === 'auto' && group.draw_date
            ? `O sorteio acontece em ${formatDate(group.draw_date)}. Volte por este link para ver quem você tirou.`
            : 'O sorteio acontece quando quem organizou clicar em sortear. Volte por este link para ver quem você tirou.'}
        </p>
      )}

      {target && (
        <>
          <section className="ss-reveal">
            <div className="ss-reveal-label">Você tirou</div>
            {revealed ? (
              <>
                <div className="ss-reveal-name">{target.name}</div>
                <div className="meta">{sizesText(target)}</div>
              </>
            ) : (
              <>
                <div className="ss-reveal-name ss-reveal-hidden" aria-hidden="true">? ? ?</div>
                <button type="button" className="btn btn-primary" onClick={() => setRevealed(true)}>
                  Revelar
                </button>
              </>
            )}
            {lastOrder && (
              <div className={`ss-reveal-foot ${late ? 'ss-warn' : ''}`}>
                Troca em {formatDate(group.exchange_date)} ·{' '}
                {late
                  ? 'pedidos feitos agora podem não chegar a tempo'
                  : `peça até ${formatDate(lastOrder)} para chegar a tempo`}
              </div>
            )}
          </section>

          {revealed && (
            <section className="ss-section">
              <h2>Lista de {target.name}</h2>
              {target.gift_ideas && (
                <div className="ss-ideas">
                  <span className="ss-ideas-label">Outras ideias de presente</span>
                  <p>{target.gift_ideas}</p>
                </div>
              )}
              {target.wishlist.length === 0 && target.gift_ideas ? (
                <p className="meta">
                  {target.name} não escolheu produtos da loja.{' '}
                  <Link to="/" className="link-inline">Veja a loja</Link>.
                </p>
              ) : target.wishlist.length === 0 ? (
                <p className="meta">
                  {target.name} ainda não montou a lista. Mande uma mensagem pedindo uma dica, ou{' '}
                  <Link to="/" className="link-inline">veja a loja</Link>.
                </p>
              ) : (
                <div className="ss-wish-list">
                  {target.wishlist.map((item) => (
                    <WishItem key={item.id} item={item} min={group.min_value} max={group.max_value} buyable />
                  ))}
                </div>
              )}
              <p className="meta ss-small">"Comprar" abre o produto já com modelo, cor e tamanho escolhidos.</p>
            </section>
          )}
        </>
      )}

      {group.drawn && (
        <section className="ss-section">
          <h2>Mensagens secretas</h2>
          {target && (
            <Chat
              title={revealed ? `Você e ${target.name}` : 'Você e quem você tirou'}
              otherLabel={revealed ? target.name : 'Quem você tirou'}
              messages={data.chat_target || []}
              placeholder="Escreva sem se entregar..."
              onSend={async (body) => {
                await sendMessage(token, 'target', body)
                await reload()
              }}
              onReport={async (id) => {
                await reportMessage(token, id)
                await reload()
              }}
            />
          )}
          <Chat
            title="Você e quem te tirou"
            otherLabel="Amigo secreto"
            messages={data.chat_giver || []}
            placeholder="Responda ao seu amigo secreto..."
            onSend={async (body) => {
              await sendMessage(token, 'giver', body)
              await reload()
            }}
            onReport={async (id) => {
              await reportMessage(token, id)
              await reload()
            }}
          />
        </section>
      )}

      <section className="ss-section">
        <h2>Minha lista de desejos</h2>
        {data.my_wishlist.length === 0 ? (
          <p className="meta">Sua lista está vazia.</p>
        ) : (
          <div className="ss-wish-list">
            {data.my_wishlist.map((item) => (
              <WishItem
                key={item.id}
                item={item}
                min={group.min_value}
                max={group.max_value}
                onRemove={async (id) => {
                  await removeFromWishlist(token, id)
                  await reload()
                }}
              />
            ))}
          </div>
        )}
        <Link to="/" className="btn btn-secondary ss-full" style={{ marginTop: 12 }}>
          + Adicionar produtos da loja
        </Link>
        <p className="meta ss-small">
          Na página de cada produto, escolha modelo, cor e tamanho e toque em "Pôr na lista do amigo secreto".
        </p>
      </section>

      <section className="ss-section">
        <h2>Outras ideias de presente</h2>
        {editingIdeas ? (
          <EditIdeas token={token} value={me.gift_ideas || ''} onDone={async () => { setEditingIdeas(false); await reload() }} />
        ) : (
          <div className="ss-row">
            <span className={me.gift_ideas ? 'ss-ideas-text' : 'meta'}>
              {me.gift_ideas || 'Nada além da loja. Se quiser, escreva outras coisas que gostaria de ganhar.'}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingIdeas(true)}>
              {me.gift_ideas ? 'Editar' : 'Escrever'}
            </button>
          </div>
        )}
      </section>

      {(me.email || me.is_organizer) && (
        <section className="ss-section">
          <h2>Avisos</h2>
          {editingContact ? (
            <EditContact token={token} me={me} onDone={async () => { setEditingContact(false); await reload() }} />
          ) : (
            <div className="ss-row">
              <span>
                {me.email || <span className="meta">Sem e-mail</span>}
                {me.is_organizer && me.phone && <span className="meta"> · WhatsApp {formatPhone(me.phone)}</span>}
                {me.marketing_optin && <span className="meta"> · recebe novidades</span>}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingContact(true)}>Editar</button>
            </div>
          )}
        </section>
      )}

      <section className="ss-section">
        <h2>Meus tamanhos</h2>
        {editing ? (
          <EditMe token={token} me={me} onDone={async () => { setEditing(false); await reload() }} />
        ) : (
          <div className="ss-row">
            <span>{sizesText(me)}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Editar</button>
          </div>
        )}
      </section>

      {data.reveal && (
        <section className="ss-section">
          <h2>Quem tirou quem</h2>
          <div className="ss-list">
            {data.reveal.map((r) => (
              <div key={r.giver} className="ss-row">
                <span><b>{r.giver}</b> tirou <b>{r.receiver}</b></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {me.is_organizer && <OrganizerPanel token={token} data={data} reload={reload} />}
    </div>
  )
}

function EditMe({ token, me, onDone }) {
  const [name, setName] = useState(me.name)
  const [tee, setTee] = useState(me.tee_size || '')
  const [hoodie, setHoodie] = useState(me.hoodie_size || '')
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    try {
      await updateMe(token, name, tee, hoodie)
      onDone()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={save} className="ss-form">
      <div className="field">
        <label htmlFor="ss-me-name">Nome</label>
        <input id="ss-me-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <SizePicker label="Camiseta" value={tee} onChange={setTee} />
      <SizePicker label="Moletom" value={hoodie} onChange={setHoodie} />
      {error && <p className="ss-error">{error}</p>}
      <button type="submit" className="btn btn-primary">Salvar</button>
    </form>
  )
}

function EditContact({ token, me, onDone, compact = false }) {
  const [value, setValue] = useState({
    email: me.email || '',
    optin: Boolean(me.marketing_optin),
    phone: me.phone ? formatPhone(me.phone) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const askPhone = me.is_organizer && !compact

  async function save(e) {
    e.preventDefault()
    setError(null)
    if (compact && !value.email.trim()) return setError('Coloque seu e-mail.')
    if (value.email.trim() && !isValidEmail(value.email)) return setError('Confira o e-mail.')
    if (askPhone && value.phone && !isValidPhone(value.phone)) return setError('Confira o WhatsApp (com DDD).')
    setSaving(true)
    try {
      await setContact(token, { email: value.email, optin: value.optin, phone: askPhone ? value.phone : null })
      await onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="ss-form">
      <ContactFields idPrefix={compact ? 'ss-nudge' : 'ss-me'} value={value} onChange={setValue} withPhone={askPhone} />
      {error && <p className="ss-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Salvando...' : compact ? 'Quero ser avisado' : 'Salvar'}
      </button>
    </form>
  )
}

function EditIdeas({ token, value, onDone }) {
  const [text, setText] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await setGiftIdeas(token, text)
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="ss-form">
      <GiftIdeasField id="ss-me-ideas" label="Ideias além da loja" value={text} onChange={setText} />
      {error && <p className="ss-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  )
}

function sizesText(p) {
  const parts = []
  if (p.tee_size) parts.push(`Camiseta ${p.tee_size}`)
  if (p.hoodie_size) parts.push(`Moletom ${p.hoodie_size}`)
  return parts.length ? parts.join(' · ') : 'Sem tamanho informado'
}
