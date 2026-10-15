import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DEFAULT_DANGERS, DEFAULT_NOTES, deleteClient, getClient, mapFrom, newClient, saveClient, shippingLabelsEnabled, toMapData, uniqueSlug, useClients,
  useSettings,
} from '../store'
import {
  KIND_LABEL, kindOf, LANG_LABEL, LANG_ORDER, STATUS_LABEL, STATUS_ORDER, STYLE_LABEL, STYLE_ORDER,
  type Client, type Kind, type Lang, type LogoMode, type MapStyle, type Status,
} from '../types'
import { MapCanvas } from '../map/MapCanvas'
import { downloadLetterPdf, downloadLetterPng, downloadPdf, downloadPng, PRINT_MM, SAFE_MARGIN_MM } from '../map/export'
import { LetterCanvas } from '../letter/LetterCanvas'
import { LetterFields } from '../letter/LetterFields'
import { fileToLogo } from '../map/logo'
import { Button, Label, StatusDot } from '../ui/kit'
import { navigate, setLeaveGuard } from '../router'
import { toast } from '../ui/toast'
import { checkQrUrl, normalizeQrUrl, QR_EXAMPLE } from '../qr'
import { labelMeta, useShippingLabelActions } from '../ui/shippingLabelActions'

const LOGO_MODES: { id: LogoMode; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'ink', label: 'Tinta' },
  { id: 'gray', label: 'Cinza' },
  { id: 'hidden', label: 'Ocultar' },
]

const SWATCH: Record<MapStyle, string> = {
  white: 'bg-[#e5e4df]',
  dark: 'bg-[#141414] border border-line-strong',
  color: 'bg-[linear-gradient(135deg,#e9cfa0_0_50%,#6fa8b8_50%_100%)]',
}

/**
 * id null = a new piece, kept as a draft until saved; from = start it with that piece's client
 * data (and its track); kind = the track a new piece belongs to.
 */
export function ClientEditor({ id, from, kind = 'map' }: { id: string | null; from?: string; kind?: Kind }) {
  // Snapshot on open; edits stay local until Save.
  const initial = useMemo(() => {
    if (id) return getClient(id)
    const source = from ? getClient(from) : undefined
    return source ? mapFrom(source) : newClient(kind)
  }, [id, from, kind])
  if (!initial) {
    return (
      <main className="container-page pt-[calc(var(--nav-h)+96px)]">
        <h1 className="text-h2">Não encontrado.</h1>
        <Button className="mt-8" variant="ghost" onClick={() => navigate('#/')}>
          Voltar para os mapas
        </Button>
      </main>
    )
  }
  return <Editor key={initial.id} initial={initial} isNew={!id} />
}

function Editor({ initial, isNew }: { initial: Client; isNew: boolean }) {
  const settings = useSettings()
  const [c, setC] = useState(initial)
  // What is saved; edits since then make the form dirty.
  const [baseline, setBaseline] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState<'pdf' | 'pdf-margin' | 'png' | null>(null)
  // The coin track has no map: its editor is the letter, and the switch below disappears.
  const kind = kindOf(initial)
  const coin = kind === 'coin'
  const piece = KIND_LABEL[kind]
  const lower = piece.toLowerCase()
  const listHref = coin ? '#/moedas' : '#/'
  // One preview at a time keeps the page short; both update live.
  const [view, setView] = useState<'map' | 'letter'>(coin ? 'letter' : 'map')
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Client>) => setC((prev) => ({ ...prev, ...patch }))
  const qr = checkQrUrl(c.qrUrl)
  const dirty = (isNew && !saved && baseline === initial) || JSON.stringify(c) !== JSON.stringify(baseline)
  const changed = JSON.stringify(c) !== JSON.stringify(baseline)
  const missing = [!c.company.trim() && 'o nome da empresa', !c.destination.trim() && (coin ? 'a meta do cliente' : 'a meta final')].filter(Boolean) as string[]

  // Leaving with unsaved edits asks first: menu links, the back-to-list link, closing the tab.
  useEffect(() => {
    if (!changed) return
    setLeaveGuard(() => confirm(isNew && baseline === initial ? `Descartar ${coin ? 'esta carta' : 'este mapa'}?` : 'Sair sem salvar as alterações?'))
    const unload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', unload)
    return () => {
      setLeaveGuard(null)
      window.removeEventListener('beforeunload', unload)
    }
  }, [changed, isNew, baseline, initial])

  function commit(next: Client) {
    saveClient(next)
    const stored = getClient(next.id) ?? next // saveClient fills in the slug
    setC(stored)
    setBaseline(stored)
  }

  /** A new map asks for its status right away; an existing one just confirms. */
  function save() {
    if (missing.length) return toast(`Preencha ${missing.join(' e ')} antes de salvar.`, { tone: 'error' })
    commit(c)
    if (isNew) setSaved(true)
    else toast(coin ? 'Carta salva.' : 'Mapa salvo.')
  }

  function keepEditing() {
    setSaved(false)
    // A new map now lives at its own address.
    if (isNew) navigate(`#/client/${c.id}`)
  }

  // The leave guard asks when there is something to lose.
  const cancel = () => navigate(listHref)

  function setCompany(company: string) {
    const patch: Partial<Client> = { company }
    // Keep the slug in sync until someone edits it by hand.
    if (!c.slug || c.slug === uniqueSlug(c.company, c.id)) patch.slug = uniqueSlug(company, c.id)
    set(patch)
  }

  /** The treasure: printed by the X and after "The path to" / "O caminho até". */
  const setDestination = (destination: string) => set({ destination, goal: destination })

  function setLang(lang: Lang) {
    const patch: Partial<Client> = { lang }
    // Swap texts to the other language only while they are still the untouched defaults.
    if (c.stages.join('|') === settings.defaultStages[c.lang].join('|')) patch.stages = [...settings.defaultStages[lang]]
    if (c.stageNotes.join('|') === DEFAULT_NOTES[c.lang].join('|')) patch.stageNotes = [...DEFAULT_NOTES[lang]]
    const d = DEFAULT_DANGERS[c.lang]
    patch.dangers = {
      kraken: c.dangers.kraken === d.kraken ? DEFAULT_DANGERS[lang].kraken : c.dangers.kraken,
      whirlpool: c.dangers.whirlpool === d.whirlpool ? DEFAULT_DANGERS[lang].whirlpool : c.dangers.whirlpool,
    }
    set(patch)
  }

  async function onLogo(file?: File) {
    if (!file) return
    set({ logo: await fileToLogo(file), logoMode: c.logoMode === 'hidden' ? 'original' : c.logoMode })
  }

  async function run(kind: 'pdf' | 'pdf-margin' | 'png') {
    setBusy(kind)
    try {
      const margin = kind === 'pdf-margin'
      if (view === 'letter') await (kind === 'png' ? downloadLetterPng(c) : downloadLetterPdf(c, { margin }))
      else await (kind === 'png' ? downloadPng(c) : downloadPdf(c, { margin }))
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="container-page pb-32 pt-[calc(var(--nav-h)+48px)]">
      <div className="fade-up flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <a href={listHref} className="text-[13px] text-grey-1 transition-colors duration-500 hover:text-porcelain">
            {coin ? '← Todas as cartas' : '← Todos os mapas'}
          </a>
          <h1 className="text-h2 mt-4 truncate">
            {c.company ? (
              <>
                {c.company}{' '}
                <em className="text-grey-1">
                  {coin ? (c.lang === 'pt' ? 'carta da trilha moeda' : 'coin letter') : c.lang === 'pt' ? 'mapa do tesouro' : 'treasure map'}
                </em>
              </>
            ) : coin ? (
              <>
                Nova <em>carta</em>
              </>
            ) : (
              <>
                Novo <em>mapa</em>
              </>
            )}
          </h1>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[400px_1fr] xl:grid-cols-[420px_1fr]">
        {/* Form */}
        <form className="card fade-up order-2 space-y-8 rounded-3xl p-5 sm:p-7 lg:order-1" onSubmit={(e) => e.preventDefault()} style={{ animationDelay: '120ms' }}>
          <section className="space-y-4">
            <p className="eyebrow">{coin ? 'Versão da carta' : 'Versão do mapa'}</p>
            <div className="grid grid-cols-3 gap-2">
              {STYLE_ORDER.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => set({ style: st })}
                  className={`flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border px-2 py-3.5 text-[13px] transition-colors duration-500 ease-heavy ${c.style === st ? 'border-porcelain/60 bg-porcelain/[0.06] text-porcelain' : 'border-line text-grey-1 hover:border-line-strong hover:text-porcelain'}`}
                >
                  <span className={`h-7 w-11 rounded-md ${SWATCH[st]}`} />
                  {STYLE_LABEL[st]}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[13px] font-medium text-porcelain">{coin ? 'Idioma da carta' : 'Idioma do mapa'}</span>
              <div className="glass inline-flex gap-1 rounded-full p-1">
                {LANG_ORDER.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`h-8 cursor-pointer rounded-full px-3.5 text-[13px] transition-colors duration-500 ease-heavy ${c.lang === l ? 'bg-porcelain text-ink' : 'text-grey-1 hover:text-porcelain'}`}
                  >
                    {LANG_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="hairline-t space-y-5 pt-7">
            <p className="eyebrow">A empresa</p>
            <div>
              <Label>Nome da empresa</Label>
              <input className="field" value={c.company} placeholder="Acme" autoFocus={!c.company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div>
              <Label hint="link do presente, do /admin/gifts">URL do QR</Label>
              <input
                className={`field ${qr.ok ? '' : c.qrUrl?.trim() ? '!border-[#ff8a7a]/70' : ''}`}
                value={c.qrUrl ?? ''}
                placeholder={QR_EXAMPLE}
                inputMode="url"
                spellCheck={false}
                onChange={(e) => set({ qrUrl: e.target.value.trim() })}
                onBlur={() => set({ qrUrl: normalizeQrUrl(c.qrUrl) })}
              />
              <p className={`mt-2 text-[12px] ${qr.ok ? 'text-grey-2' : 'text-[#ff8a7a]'}`}>
                {qr.ok
                  ? coin
                    ? 'O QR da carta e a moeda NFC abrem exatamente este link. Teste com a câmera antes de imprimir.'
                    : 'O QR do mapa e da carta abre exatamente este link. Teste com a câmera antes de imprimir.'
                  : qr.error}
              </p>
            </div>
          </section>

          {/* Shared by the map and the letter, so it shows on both tabs. */}
          <section className="hairline-t space-y-4 pt-7">
            <div className="flex items-baseline justify-between gap-3">
              <p className="eyebrow">Logo</p>
              <span className="text-[12px] text-grey-2">{coin ? 'Aparece na carta' : 'Vale para o mapa e a carta'}</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  onLogo(e.dataTransfer.files[0])
                }}
                className="flex h-20 w-32 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-ink-3 transition-colors duration-500 ease-heavy hover:border-porcelain/50"
              >
                {c.logo ? <img src={c.logo} alt="" className="max-h-14 max-w-24 object-contain" /> : <span className="text-[12px] text-grey-2">Enviar logo</span>}
              </button>
              <div className="text-[13px] text-grey-1">
                PNG com fundo transparente ou SVG funcionam melhor.
                {c.logo && (
                  <button type="button" className="mt-1 block cursor-pointer text-grey-2 hover:text-porcelain" onClick={() => set({ logo: null })}>
                    Remover
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                hidden
                onChange={(e) => {
                  onLogo(e.target.files?.[0])
                  e.target.value = '' // so picking the same file again still counts
                }}
              />
            </div>
            {c.logo && (
              <div className="glass inline-flex gap-1 rounded-full p-1">
                {LOGO_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set({ logoMode: m.id })}
                    className={`h-7 cursor-pointer rounded-full px-3 text-[12px] transition-colors duration-500 ease-heavy ${c.logoMode === m.id ? 'bg-porcelain text-ink' : 'text-grey-1 hover:text-porcelain'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          {view === 'map' ? (
            <>
          <section className="hairline-t space-y-4 pt-7">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">O caminho</p>
              <button
                type="button"
                className="cursor-pointer text-[12px] text-grey-2 transition-colors hover:text-porcelain"
                onClick={() => set({ stages: [...settings.defaultStages[c.lang]], stageNotes: [...DEFAULT_NOTES[c.lang]] })}
              >
                Restaurar padrão
              </button>
            </div>
            {c.stages.map((s, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-5 shrink-0 pt-2 font-display text-[20px] text-grey-2">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    className="field"
                    value={s}
                    onChange={(e) => set({ stages: c.stages.map((x, k) => (k === i ? e.target.value : x)) })}
                  />
                  <input
                    className="field !py-2 text-[13px] italic"
                    value={c.stageNotes[i] ?? ''}
                    placeholder={c.lang === 'pt' ? 'O que a Isla faz aqui (opcional)' : 'What Isla does here (optional)'}
                    onChange={(e) => set({ stageNotes: c.stages.map((_, k) => (k === i ? e.target.value : (c.stageNotes[k] ?? ''))) })}
                  />
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Label hint={`${c.lang === 'pt' ? 'O caminho até' : 'The path to'} ${toMapData(c).pathTo || c.destination.trim() || '…'}`}>Meta final, no X do tesouro</Label>
              <div className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center text-[15px] text-porcelain">✕</span>
                <input className="field" value={c.destination} placeholder="$10M ARR" onChange={(e) => setDestination(e.target.value)} />
              </div>
            </div>
            <div>
              <Label hint={c.lang === 'pt' ? 'Vazio usa a meta final.' : 'Empty uses the final goal.'}>{c.lang === 'pt' ? 'Texto depois de "O caminho até"' : 'Text after "The path to"'}</Label>
              <input className="field" value={c.pathTo ?? ''} placeholder={toMapData(c).pathTo || c.destination} onChange={(e) => set({ pathTo: e.target.value })} />
            </div>
          </section>

          <section className="hairline-t space-y-5 pt-7">
            <p className="eyebrow">Na rota</p>
            <div>
              <Label hint="vazio esconde">{c.lang === 'pt' ? 'Você está aqui' : 'You are here'}</Label>
              <input
                className="field"
                value={c.start}
                placeholder={c.lang === 'pt' ? 'Ex.: 2 posts por mês, 3 mil seguidores' : 'e.g. 2 posts a month, 3k followers'}
                onChange={(e) => set({ start: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <Label hint="perigo">Kraken</Label>
                <input className="field" value={c.dangers.kraken} onChange={(e) => set({ dangers: { ...c.dangers, kraken: e.target.value } })} />
              </div>
              <div>
                <Label hint="perigo">{c.lang === 'pt' ? 'Redemoinho' : 'Whirlpool'}</Label>
                <input className="field" value={c.dangers.whirlpool} onChange={(e) => set({ dangers: { ...c.dangers, whirlpool: e.target.value } })} />
              </div>
            </div>
          </section>

            </>
          ) : (
            <LetterFields c={c} set={set} />
          )}

          <ShippingLabelSection id={c.id} coin={coin} />

          <section className="hairline-t space-y-3 pt-7">
            <p className="eyebrow">Notas internas</p>
            <textarea
              className="field min-h-24 resize-y"
              value={c.notes}
              placeholder="Contato, endereço de entrega, código de rastreio…"
              onChange={(e) => set({ notes: e.target.value })}
            />
          </section>

          {!isNew && (
          <div className="hairline-t flex justify-end pt-6">
            <button
              type="button"
              className="cursor-pointer text-[13px] text-grey-2 transition-colors duration-500 hover:text-porcelain"
              onClick={() => {
                const stored = getClient(c.id)
                deleteClient(c.id)
                navigate(listHref, { force: true })
                if (stored)
                  toast(`${piece} de ${stored.company || 'Sem nome'} ${coin ? 'excluída' : 'excluído'}.`, {
                    action: { label: 'Desfazer', run: () => saveClient(stored) },
                  })
              }}
            >
              Excluir {lower}
            </button>
          </div>
          )}
        </form>

        {/* Preview */}
        <div className="order-1 lg:order-2">
          <div className="fade-up lg:sticky lg:top-[calc(var(--nav-h)+24px)]" style={{ animationDelay: '220ms' }}>
            {/* The coin track has only the letter: nothing to switch between. */}
            {!coin && (
              <div className="mb-5 flex justify-center">
                <div className="glass inline-flex gap-1 rounded-full p-1">
                  {(['map', 'letter'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`h-9 cursor-pointer rounded-full px-5 text-[13px] transition-colors duration-500 ease-heavy ${view === v ? 'bg-porcelain text-ink' : 'text-grey-1 hover:text-porcelain'}`}
                    >
                      {v === 'map' ? (c.lang === 'pt' ? 'Mapa' : 'Map') : c.lang === 'pt' ? 'Carta' : 'Letter'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {view === 'map' ? (
              <div className="paper-sheet overflow-hidden rounded-[6px] border border-line">
                <MapCanvas client={c} resolution={2400} />
              </div>
            ) : (
              <div className="paper-sheet mx-auto max-w-[min(100%,calc((100vh-var(--nav-h)-220px)*0.707))] overflow-hidden rounded-[4px] border border-line">
                <LetterCanvas client={c} resolution={1800} />
              </div>
            )}
            <p className="mt-4 text-[12px] text-grey-2">
              {STYLE_LABEL[c.style]} · {LANG_LABEL[c.lang]} · {view === 'map' ? `A4, ${PRINT_MM.w} × ${PRINT_MM.h} mm` : 'A4, 210 × 297 mm'} · {qr.ok ? `QR → ${qr.url}` : 'QR pendente'}
            </p>
            {!qr.ok && (
              <p className="mt-2 text-[12px] text-[#ff8a7a]">
                Sem a URL do QR não dá para exportar: {coin ? 'a carta impressa' : 'o mapa impresso'} sem ela não abre o presente.
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="md" disabled={!!busy || !qr.ok} onClick={() => run('png')}>
                  {busy === 'png' ? 'Gerando…' : 'PNG'}
                </Button>
                <Button variant="ghost" size="md" disabled={!!busy || !qr.ok} onClick={() => run('pdf')} title="Até a borda, para gráfica">
                  {busy === 'pdf' ? 'Gerando…' : 'PDF para gráfica'}
                </Button>
                <Button variant="ghost" size="md" disabled={!!busy || !qr.ok} onClick={() => run('pdf-margin')} title={`Com ${SAFE_MARGIN_MM} mm de margem, para impressora comum (que não imprime até a borda)`}>
                  {busy === 'pdf-margin' ? 'Gerando…' : 'PDF com margem'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="quiet" size="md" onClick={cancel}>
                  Cancelar
                </Button>
                <Button size="md" arrow disabled={!dirty} onClick={save}>
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {saved && createPortal(<SavedDialog client={c} onStatus={(status) => commit({ ...c, status })} onKeepEditing={keepEditing} />, document.body)}
    </main>
  )
}

/**
 * The box's shipping label. Saved on its own as soon as it is attached (not with the form), so it
 * reads the stored map: a map that was never saved has nowhere to attach it yet.
 */
function ShippingLabelSection({ id, coin }: { id: string; coin: boolean }) {
  const stored = useClients().find((x) => x.id === id)
  const actions = useShippingLabelActions()
  const busy = actions.busy[id]
  const label = stored?.shippingLabel
  return (
    <section className="hairline-t space-y-4 pt-7">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Etiqueta de envio</p>
        <a href="#/labels" className="text-[12px] text-grey-2 transition-colors hover:text-porcelain">
          Todas as etiquetas
        </a>
      </div>
      {!shippingLabelsEnabled ? (
        <p className="text-[13px] text-grey-2">Etiquetas ficam no banco da equipe; não estão disponíveis no modo só do navegador.</p>
      ) : !stored ? (
        <p className="text-[13px] text-grey-2">Salve {coin ? 'a carta' : 'o mapa'} para anexar o PDF da etiqueta.</p>
      ) : (
        <div
          className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong bg-ink-3 p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            actions.attach(id, e.dataTransfer.files[0])
          }}
        >
          <div className="min-w-0 text-[13px]">
            {label ? (
              <>
                <p className="truncate text-porcelain" title={label.name}>{label.name}</p>
                <p className="truncate text-[12px] text-grey-2">{labelMeta(label)}</p>
              </>
            ) : (
              <p className="text-grey-1">{busy === 'upload' ? 'Enviando…' : 'Nenhuma etiqueta. Arraste o PDF aqui ou escolha o arquivo.'}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {label && (
              <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => actions.download(stored)}>
                {busy === 'download' ? 'Baixando…' : 'Baixar'}
              </Button>
            )}
            <Button type="button" size="sm" variant={label ? 'quiet' : 'ghost'} disabled={!!busy} onClick={() => actions.pick(stored)}>
              {busy === 'upload' ? 'Enviando…' : label ? 'Trocar' : 'Anexar PDF'}
            </Button>
            {label && (
              <Button type="button" size="sm" variant="quiet" className="hover:!text-[#ff8a7a]" disabled={!!busy} onClick={() => actions.remove(stored)}>
                {busy === 'remove' ? 'Removendo…' : 'Remover'}
              </Button>
            )}
          </div>
          {actions.input}
        </div>
      )}
    </section>
  )
}

/** Confirms the save and sets the piece's status right there. */
function SavedDialog({ client: c, onStatus, onKeepEditing }: { client: Client; onStatus: (s: Status) => void; onKeepEditing: () => void }) {
  const coin = kindOf(c) === 'coin'
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onKeepEditing()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onKeepEditing])
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 px-[var(--gutter)] backdrop-blur-sm fade-in" onClick={onKeepEditing}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-title"
        className="card w-full max-w-md rounded-3xl p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="saved-title" className="text-h3">
          {coin ? 'Carta salva' : 'Mapa salvo'} com <em>sucesso</em>.
        </h2>
        <p className="mt-2 text-[14px] text-grey-1">
          {c.company || 'Sem nome'} já está na lista{coin ? '' : ', com a carta'}. Em que etapa {coin ? 'ela' : 'ele'} está?
        </p>
        <div role="radiogroup" aria-label={coin ? 'Status da carta' : 'Status do mapa'} className="mt-6 grid gap-2">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={c.status === s}
              onClick={() => onStatus(s)}
              className={`flex h-11 cursor-pointer items-center justify-between rounded-2xl border px-4 text-[14px] transition-colors duration-500 ease-heavy ${c.status === s ? 'border-porcelain/50 bg-porcelain/[0.06] text-porcelain' : 'border-line text-grey-1 hover:border-line-strong hover:text-porcelain'}`}
            >
              <span className="flex items-center gap-3">
                <StatusDot status={s} />
                {STATUS_LABEL[s]}
              </span>
              <span className={`size-2 rounded-full ${c.status === s ? 'bg-porcelain' : 'border border-grey-2'}`} />
            </button>
          ))}
        </div>
        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="quiet" onClick={onKeepEditing}>Continuar editando</Button>
          <Button arrow onClick={() => navigate(coin ? '#/moedas' : '#/', { force: true })}>
            {coin ? 'Ir para as cartas' : 'Ir para os mapas'}
          </Button>
        </div>
      </div>
    </div>
  )
}
