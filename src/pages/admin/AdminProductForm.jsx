import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  fetchProductByIdAdmin,
  saveProduct,
  uploadProductImage,
  slugify,
  sortSizes,
  fetchColorPalette,
  photoKey,
  saveColor,
  DEFAULT_COLOR_HEX,
  FALLBACK_COLOR_HEX,
} from '../../lib/catalog'
import { fetchSizeCharts, parseSpecs, specsToText } from '../../lib/storeInfo'
import { fetchProductCosts, saveProductCosts } from '../../lib/costs'

const COMMON_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG']
const MAX_PHOTOS = 4

const emptyModel = () => ({ label: '', price: '', cost: '', costBig: '', sizes: [], colors: [], chart: '' })

// lista de fotos com upload (usada nas fotos gerais e em cada cor)
function PhotoList({ urls, onChange, onError, uploading, setUploading, label }) {
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    onError(null)
    try {
      const url = await uploadProductImage(file)
      onChange([...urls, url])
    } catch (err) {
      onError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {urls.map((url, i) => (
          <div key={url} style={{ position: 'relative' }}>
            <img
              src={url}
              alt={`${label} ${i + 1}`}
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ position: 'absolute', top: -8, right: -8, padding: '2px 8px', fontSize: 11 }}
              onClick={() => onChange(urls.filter((_, idx) => idx !== i))}
            >
              x
            </button>
          </div>
        ))}
      </div>
      {urls.length < MAX_PHOTOS ? (
        <input type="file" accept="image/*" onChange={handleFile} />
      ) : (
        <span className="meta">Limite de {MAX_PHOTOS} fotos atingido.</span>
      )}
    </div>
  )
}

export default function AdminProductForm() {
  const { productId } = useParams() // undefined = novo produto
  const isEditing = Boolean(productId)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [collection, setCollection] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrls, setImageUrls] = useState([])
  const [colorImages, setColorImages] = useState({})
  const [models, setModels] = useState([emptyModel()])
  const [specsText, setSpecsText] = useState('')
  const [chartNames, setChartNames] = useState([])

  const [palette, setPalette] = useState(DEFAULT_COLOR_HEX)
  const [newColorName, setNewColorName] = useState('')
  const [newColorHex, setNewColorHex] = useState('#777777')
  const [customSize, setCustomSize] = useState({})
  const [costsWarning, setCostsWarning] = useState(null)

  useEffect(() => {
    fetchColorPalette(true).then(setPalette)
    fetchSizeCharts().then((c) => setChartNames(Object.keys(c)))
  }, [])

  useEffect(() => {
    if (!isEditing) return
    Promise.all([
      fetchProductByIdAdmin(productId),
      // custo é opcional: se o SQL de custos ainda não rodou, o resto do form funciona
      fetchProductCosts(productId).catch(() => {
        setCostsWarning('Pra salvar o custo, rode o SQL add_custos_e_crew.sql no Supabase.')
        return {}
      }),
    ])
      .then(([p, costs]) => {
        setName(p.name)
        setSlug(p.slug)
        setSlugTouched(true)
        setCollection(p.collection ?? '')
        setDescription(p.description ?? '')
        setImageUrls(
          p.image_urls && p.image_urls.length > 0 ? p.image_urls : p.image_url ? [p.image_url] : []
        )
        setColorImages(p.color_images && typeof p.color_images === 'object' ? p.color_images : {})
        setSpecsText(specsToText(p.specs))
        const savedCharts = p.model_charts && typeof p.model_charts === 'object' ? p.model_charts : {}

        const byModel = new Map()
        for (const v of p.product_variants) {
          if (!byModel.has(v.model_label)) {
            byModel.set(v.model_label, {
              label: v.model_label,
              price: String(v.price ?? p.base_price),
              cost: costs[v.model_label]?.cost ?? '',
              costBig: costs[v.model_label]?.costBig ?? '',
              sizes: [],
              colors: [],
              chart: savedCharts[v.model_label] ?? '',
            })
          }
          const m = byModel.get(v.model_label)
          if (!m.sizes.includes(v.size)) m.sizes.push(v.size)
          if (!m.colors.includes(v.color)) m.colors.push(v.color)
        }
        const loaded = Array.from(byModel.values())
          .map((m) => ({ ...m, sizes: sortSizes(m.sizes) }))
          .sort((a, b) => Number(a.price) - Number(b.price) || a.label.localeCompare(b.label))
        setModels(loaded.length > 0 ? loaded : [emptyModel()])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [productId, isEditing])

  function handleNameChange(e) {
    const value = e.target.value
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  function updateModel(index, patch) {
    // renomear o modelo leva junto as fotos dele
    if (patch.label !== undefined && patch.label !== models[index].label) {
      const oldPrefix = `${models[index].label}||`
      const newPrefix = `${patch.label}||`
      setColorImages((prev) => {
        const next = {}
        for (const [k, v] of Object.entries(prev)) {
          next[k.startsWith(oldPrefix) ? newPrefix + k.slice(oldPrefix.length) : k] = v
        }
        return next
      })
    }
    setModels((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function toggleIn(list, value) {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
  }

  function duplicateModel(index) {
    setModels((prev) => {
      const copy = { ...prev[index], label: '', sizes: [...prev[index].sizes], colors: [...prev[index].colors] }
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]
    })
  }

  function removeModel(index) {
    setModels((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  function addCustomSize(index) {
    const value = (customSize[index] || '').trim().toUpperCase()
    if (!value) return
    const m = models[index]
    if (!m.sizes.includes(value)) updateModel(index, { sizes: sortSizes([...m.sizes, value]) })
    setCustomSize((prev) => ({ ...prev, [index]: '' }))
  }

  async function handleAddColor() {
    const colorName = newColorName.trim()
    if (!colorName) return
    setError(null)
    try {
      await saveColor(colorName, newColorHex)
      setPalette(await fetchColorPalette(true))
      setNewColorName('')
    } catch (err) {
      setError(
        'Não consegui salvar a cor nova: ' +
          err.message +
          ' (confira se o SQL add_model_pricing_and_color_photos.sql já foi rodado)'
      )
    }
  }

  // cores da paleta + cores que já estão no produto e não estão na paleta
  const usedColors = [...new Set(models.flatMap((m) => m.colors))]
  const allColors = [...Object.keys(palette), ...usedColors.filter((c) => !(c in palette))]

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    for (const [i, m] of models.entries()) {
      if (!m.label.trim()) return setError(`Dê um nome ao modelo ${i + 1}.`)
      if (m.price === '' || Number(m.price) <= 0) return setError(`Informe o preço do modelo "${m.label}".`)
      if (m.sizes.length === 0) return setError(`Marque ao menos um tamanho no modelo "${m.label}".`)
      if (m.colors.length === 0) return setError(`Marque ao menos uma cor no modelo "${m.label}".`)
    }
    const labels = models.map((m) => m.label.trim().toLowerCase())
    if (new Set(labels).size !== labels.length) return setError('Dois modelos estão com o mesmo nome.')

    setSaving(true)
    try {
      // só guarda fotos de cores que ainda existem no produto
      const cleanedColorImages = {}
      for (const c of usedColors) {
        if (colorImages[c]?.length) cleanedColorImages[c] = colorImages[c]
      }
      for (const m of models) {
        for (const c of m.colors) {
          const key = photoKey(m.label.trim(), c)
          if (colorImages[key]?.length) cleanedColorImages[key] = colorImages[key]
        }
      }
      const savedId = await saveProduct({
        id: isEditing ? productId : undefined,
        name,
        slug,
        collection,
        description,
        imageUrls,
        colorImages: cleanedColorImages,
        specs: parseSpecs(specsText),
        modelCharts: Object.fromEntries(
          models.filter((m) => m.chart).map((m) => [m.label.trim(), m.chart])
        ),
        models: models.map((m) => ({
          label: m.label.trim(),
          price: Number(m.price),
          sizes: m.sizes,
          colors: m.colors,
        })),
      })
      try {
        await saveProductCosts(
          savedId,
          models.map((m) => ({ label: m.label.trim(), cost: m.cost, costBig: m.costBig }))
        )
      } catch (costErr) {
        setError(
          'O produto foi salvo, mas o custo não: ' +
            costErr.message +
            ' (confira se o SQL add_custos_e_crew.sql já foi rodado)'
        )
        return
      }
      navigate('/admin/produtos')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="meta">Carregando produto...</p>

  return (
    <div>
      <h2>{isEditing ? 'Editar produto' : 'Novo produto'}</h2>
      <div className="rule" />

      <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" required value={name} onChange={handleNameChange} />
        </div>

        <div className="field">
          <label htmlFor="slug">Slug (usado na URL)</label>
          <input
            id="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="collection">Coleção (opcional — ex: road-to-vegas)</label>
          <input
            id="collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="description">Descrição</label>
          <textarea
            id="description"
            rows={10}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '12px 14px',
              borderRadius: 4,
              fontFamily: 'var(--font-body)',
              fontSize: 14,
            }}
          />
          <p className="meta" style={{ marginTop: 6 }}>
            Cole o texto normal: as quebras de linha são mantidas. Se quiser, dá pra usar HTML
            básico: &lt;b&gt;negrito&lt;/b&gt;, &lt;i&gt;itálico&lt;/i&gt;, &lt;p&gt;, &lt;br&gt;,
            &lt;ul&gt;&lt;li&gt;, &lt;h3&gt;, &lt;a href&gt;.
          </p>
        </div>

        <div className="field">
          <label htmlFor="specs">Especificações (uma por linha)</label>
          <textarea
            id="specs"
            rows={6}
            placeholder={'Tecido: 100% algodão\nGramatura: 220 g/m²\nEstampa: Silk\nCuidados: Lavar do avesso'}
            value={specsText}
            onChange={(e) => setSpecsText(e.target.value)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '12px 14px',
              borderRadius: 4,
              fontFamily: 'var(--font-body)',
              fontSize: 14,
            }}
          />
          <p className="meta" style={{ marginTop: 6 }}>
            Formato "Título: valor", uma por linha. Aparece na página do produto como lista.
          </p>
        </div>

        <h3 style={{ marginTop: 28 }}>Modelos</h3>
        <p className="meta" style={{ marginBottom: 12 }}>
          Cada modelo tem preço, tamanhos e cores próprios. O site só mostra o que estiver marcado aqui.
          O custo só aparece pra você (é usado no lucro do relatório); XG/XGG vazio = mesmo custo.
        </p>
        {costsWarning && (
          <p className="meta" style={{ color: 'var(--danger)', marginBottom: 12 }}>
            {costsWarning}
          </p>
        )}

        {models.map((m, index) => (
          <div className="model-card" key={index}>
            <div className="model-card-head">
              <div className="field">
                <label>Nome do modelo</label>
                <input
                  placeholder="Padrão, Cropped, Oversized..."
                  value={m.label}
                  onChange={(e) => updateModel(index, { label: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: '0 1 140px' }}>
                <label>Preço (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={m.price}
                  onChange={(e) => updateModel(index, { price: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: '0 1 120px' }}>
                <label title="Só o admin vê. Usado no relatório de lucro.">Custo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="P a GG"
                  value={m.cost}
                  onChange={(e) => updateModel(index, { cost: e.target.value })}
                />
              </div>
              <div className="field" style={{ flex: '0 1 120px' }}>
                <label title="Deixe vazio se for igual ao custo normal">Custo XG/XGG</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="igual"
                  value={m.costBig}
                  onChange={(e) => updateModel(index, { costBig: e.target.value })}
                />
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => duplicateModel(index)}>
                Duplicar
              </button>
              {models.length > 1 && (
                <button type="button" className="btn btn-secondary" onClick={() => removeModel(index)}>
                  Remover
                </button>
              )}
            </div>

            <div className="option-label" style={{ marginTop: 14 }}>
              Tamanhos
            </div>
            <div className="check-row">
              {[...new Set([...COMMON_SIZES, ...m.sizes])].map((s) => (
                <label key={s} className={`check-chip ${m.sizes.includes(s) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={m.sizes.includes(s)}
                    onChange={() => updateModel(index, { sizes: sortSizes(toggleIn(m.sizes, s)) })}
                  />
                  {s}
                </label>
              ))}
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <input
                  placeholder="outro"
                  value={customSize[index] || ''}
                  onChange={(e) => setCustomSize((prev) => ({ ...prev, [index]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomSize(index)
                    }
                  }}
                  style={{ width: 80, padding: '6px 10px' }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => addCustomSize(index)}>
                  +
                </button>
              </span>
            </div>

            <div className="option-label" style={{ marginTop: 14 }}>
              Cores
            </div>
            <div className="check-row">
              {allColors.map((c) => (
                <label key={c} className={`check-chip ${m.colors.includes(c) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={m.colors.includes(c)}
                    onChange={() => updateModel(index, { colors: toggleIn(m.colors, c) })}
                  />
                  <span className="swatch" style={{ background: palette[c] ?? FALLBACK_COLOR_HEX }} />
                  {c}
                </label>
              ))}
            </div>

            <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
              <label>Tabela de medidas deste modelo</label>
              <select value={m.chart || ''} onChange={(e) => updateModel(index, { chart: e.target.value })}>
                <option value="">Nenhuma</option>
                {[...new Set([...chartNames, ...(m.chart ? [m.chart] : [])])].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setModels((prev) => [...prev, emptyModel()])}
        >
          + Adicionar modelo
        </button>

        <div style={{ margin: '14px 0 4px' }} className="option-label">
          Cor nova (fica disponível para todos os produtos)
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="mini-input"
            placeholder="Nome da cor, ex: Azul Marinho"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            style={{ maxWidth: 240, padding: '10px 12px' }}
          />
          <input
            type="color"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            style={{ width: 44, height: 40, padding: 2 }}
          />
          <button type="button" className="btn btn-secondary" onClick={handleAddColor}>
            Salvar cor
          </button>
        </div>

        <h3 style={{ marginTop: 32 }}>Fotos</h3>
        <p className="meta" style={{ marginBottom: 12 }}>
          Até {MAX_PHOTOS} fotos em cada lugar. A loja escolhe assim: primeiro as fotos do{' '}
          <b>modelo naquela cor</b>; se não houver, as fotos da <b>cor</b> (para todos os modelos); se
          também não houver, as <b>fotos gerais</b>.
        </p>

        <h4 style={{ margin: '18px 0 8px' }}>Fotos de cada modelo</h4>
        {models.filter((m) => m.label.trim() && m.colors.length > 0).length === 0 && (
          <p className="meta">Dê nome e marque as cores nos modelos acima para cadastrar as fotos.</p>
        )}
        {models
          .filter((m) => m.label.trim() && m.colors.length > 0)
          .map((m) => {
            const filled = m.colors.filter((c) => colorImages[photoKey(m.label, c)]?.length).length
            return (
              <details className="color-photos" key={m.label}>
                <summary style={{ cursor: 'pointer', fontSize: 14 }}>
                  {m.label} <span className="meta">({filled} de {m.colors.length} cores com foto)</span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  {m.colors.map((c) => (
                    <div key={c} style={{ marginBottom: 14 }}>
                      <h5>
                        <span className="swatch" style={{ background: palette[c] ?? FALLBACK_COLOR_HEX }} />
                        {m.label} · {c}
                      </h5>
                      <PhotoList
                        label={`${m.label} ${c}`}
                        urls={colorImages[photoKey(m.label, c)] || []}
                        onChange={(urls) =>
                          setColorImages((prev) => ({ ...prev, [photoKey(m.label, c)]: urls }))
                        }
                        onError={setError}
                        uploading={uploadingImage}
                        setUploading={setUploadingImage}
                      />
                    </div>
                  ))}
                </div>
              </details>
            )
          })}

        <h4 style={{ margin: '22px 0 8px' }}>Fotos por cor (valem para os modelos sem foto própria)</h4>
        {usedColors.length === 0 && (
          <p className="meta">Marque as cores nos modelos acima.</p>
        )}
        {usedColors.map((c) => (
          <div className="color-photos" key={c}>
            <h5>
              <span className="swatch" style={{ background: palette[c] ?? FALLBACK_COLOR_HEX }} />
              {c}
            </h5>
            <PhotoList
              label={c}
              urls={colorImages[c] || []}
              onChange={(urls) => setColorImages((prev) => ({ ...prev, [c]: urls }))}
              onError={setError}
              uploading={uploadingImage}
              setUploading={setUploadingImage}
            />
          </div>
        ))}

        <div className="color-photos">
          <h5>Fotos gerais (aparecem quando não há foto do modelo nem da cor)</h5>
          <PhotoList
            label="Foto geral"
            urls={imageUrls}
            onChange={setImageUrls}
            onError={setError}
            uploading={uploadingImage}
            setUploading={setUploadingImage}
          />
        </div>
        {uploadingImage && <p className="meta">Enviando imagem...</p>}

        {error && (
          <p className="meta" style={{ color: 'var(--danger)', margin: '16px 0 12px' }}>
            {error}
          </p>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={saving || uploadingImage}
          style={{ marginTop: 16 }}
        >
          {saving ? 'Salvando...' : 'Salvar produto'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginLeft: 12, marginTop: 16 }}
          onClick={() => navigate('/admin/produtos')}
        >
          Cancelar
        </button>
      </form>
    </div>
  )
}
