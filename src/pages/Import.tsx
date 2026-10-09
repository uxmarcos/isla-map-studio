import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { saveClients, slugify, useClients, useSettings } from '../store'
import { LANG_LABEL, LANG_ORDER, STYLE_LABEL, STYLE_ORDER, type Client, type Lang, type MapStyle } from '../types'
import { parseList, type RawRow } from '../import/parse'
import { batchSlugs, interpret, loadRowLogo, logoSrc, toClient, type ImportRow } from '../import/batch'
import { checkQrUrl, normalizeQrUrl, QR_EXAMPLE } from '../qr'
import { fileToLogo } from '../map/logo'
import { Button, Rise } from '../ui/kit'
import { navigate, setLeaveGuard } from '../router'
import { toast } from '../ui/toast'
import { Preview } from '../ui/MapCard'

type Phase = 'pick' | 'review' | 'creating'

const COLUMNS: [string, string][] = [
  ['empresa', 'Nome da empresa, como vai impresso. Obrigatório.'],
  ['qr', `Link do presente copiado do /admin/gifts da Isla, completo (${QR_EXAMPLE}). Um por empresa, nunca repetido. Sem ele, o mapa é criado mas não exporta.`],
  ['meta', 'Meta final, no X do mapa: $10M ARR, R$ 5M em vendas. Obrigatório.'],
  ['idioma', 'pt ou en. Vazio: pt.'],
  ['estilo', 'colorido, branco ou preto. Vazio: colorido.'],
  ['logo', 'Link https do logo em PNG, SVG, JPG ou WebP, ou o código SVG colado. Vazio: envie na conferência ou depois no editor.'],
]

const DOWNLOAD = 'inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-[13px] text-porcelain transition-colors duration-500 ease-heavy hover:border-porcelain/50'

export function Import() {
  const settings = useSettings()
  const [raw, setRaw] = useState<RawRow[]>([])
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [phase, setPhase] = useState<Phase>('pick')
  const [progress, setProgress] = useState(0)
  const listRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [preview, setPreview] = useState<Client | null>(null)
  const [opening, setOpening] = useState<number | null>(null)
  const existing = useClients()

  // A reviewed list not yet created is work too.
  useEffect(() => {
    if (phase !== 'review' || !rows.length) return
    setLeaveGuard(() => confirm('Sair sem criar os mapas desta lista?'))
    return () => setLeaveGuard(null)
  }, [phase, rows.length])

  async function onList(file: File | undefined) {
    if (!file) return
    try {
      const parsed = parseList(await file.text(), file.name)
      if (!parsed.length) throw new Error('nenhuma linha encontrada')
      setRaw(parsed)
      setFileName(file.name)
      setRows(interpret(parsed))
      setPhase('review')
    } catch (e) {
      toast(`Não consegui ler "${file.name}": ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' })
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    onList(e.dataTransfer.files[0])
  }

  async function create() {
    setPhase('creating')
    setProgress(0)
    const slugs = batchSlugs(rows)
    const made = []
    const problems: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const { logo, problem } = await loadRowLogo(rows[i])
      if (problem) problems.push(`${rows[i].company || `Linha ${i + 1}`}: ${problem}`)
      made.push(toClient(rows[i], slugs[i], logo, settings))
      setProgress(i + 1)
    }
    await saveClients(made)
    const n = made.length
    toast(`${n} ${n === 1 ? 'mapa criado' : 'mapas criados'} como rascunho, cada um com a sua carta.`, {
      detail: problems.length ? ['Sem logo (adicione no editor):', ...problems] : undefined,
    })
    navigate('#/', { force: true })
  }

  /** The map as it will be created, logo included. */
  async function open(i: number) {
    setOpening(i)
    const { logo } = await loadRowLogo(rows[i])
    setPreview(toClient(rows[i], slugs[i], logo, settings))
    setOpening(null)
  }

  const set = (i: number, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i))
  const slugs = useMemo(() => batchSlugs(rows), [rows, existing])
  const incomplete = rows.filter((r) => !r.company.trim() || !r.goal.trim()).length
  // A wrong link is fixed now; a missing one can be pasted later (the map just won't export).
  const badQr = rows.filter((r) => r.qr.trim() && !checkQrUrl(r.qr).ok).length
  const noQr = rows.filter((r) => !r.qr.trim()).length
  // The same gift link twice in one list is almost always a copy slip that sends two companies
  // to one gift: it blocks creating. One already on a saved map may be a resend on purpose: a warning.
  const qrNotes = useMemo(() => {
    const keys = rows.map((r) => normalizeQrUrl(r.qr))
    const saved = new Map<string, string[]>()
    for (const m of existing) {
      const k = normalizeQrUrl(m.qrUrl)
      if (k) saved.set(k, [...(saved.get(k) ?? []), m.company || 'Sem nome'])
    }
    return rows.map((_, i) => ({
      repeated: keys[i] ? rows.filter((_, k) => k !== i && keys[k] === keys[i]).map((x) => x.company.trim() || 'sem nome') : [],
      onMaps: (keys[i] && saved.get(keys[i])) || [],
    }))
  }, [rows, existing])
  const dupQr = qrNotes.filter((n) => n.repeated.length).length
  // Already in the Studio, or twice in this list: worth a look before creating more.
  const notes = useMemo(() => {
    const names = new Set(existing.map((m) => slugify(m.company)))
    return rows.map((r, i) => {
      const name = slugify(r.company)
      return [
        name && names.has(name) && 'Já existe mapa para esta empresa.',
        name && rows.findIndex((x) => slugify(x.company) === name) !== i && 'Repetida nesta lista.',
      ].filter(Boolean).join(' ')
    })
  }, [rows, slugs, existing])

  return (
    <main className="container-page pb-32 pt-[calc(var(--nav-h)+72px)] md:pt-[calc(var(--nav-h)+96px)]">
      <section className="max-w-3xl">
        <p className="eyebrow eyebrow-line fade-up">Importação em lote</p>
        <Rise text="Vários mapas *de uma vez*." className="text-h1 mt-6" />
        <p className="text-lede fade-up mt-6 max-w-xl" style={{ animationDelay: '200ms' }}>
          Envie a lista em CSV ou JSON no formato da tabela base. Você confere e o Studio cria o mapa e a carta de cada empresa.
        </p>
      </section>

      <section className="fade-up mt-14 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" style={{ animationDelay: '300ms' }}>
        <div>
          <label htmlFor="import-file" className="mb-2 block text-[13px] font-medium text-porcelain">Lista de clientes</label>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
            className={`field flex items-center gap-3 !p-1.5 ${over ? '!border-porcelain/50' : ''}`}
          >
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => listRef.current?.click()}>
              Escolher arquivo
            </Button>
            <span className={`min-w-0 truncate text-[14px] ${fileName ? 'text-porcelain' : 'text-grey-2'}`}>
              {fileName ? `${fileName} · ${raw.length} ${raw.length === 1 ? 'empresa' : 'empresas'}` : 'Nenhum arquivo selecionado'}
            </span>
          </div>
          <input
            id="import-file"
            ref={listRef}
            type="file"
            accept=".csv,.json,.tsv,.txt,text/csv,application/json"
            hidden
            onChange={(e) => {
              onList(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <p className="mt-2 text-[12px] text-grey-2">CSV ou JSON. Pode arrastar o arquivo para o campo.</p>
        </div>

        <div className="card rounded-3xl p-6 sm:p-8">
          <p className="eyebrow">Como montar a lista</p>
          <p className="mt-4 text-[14px] text-grey-1">
            Uma empresa por linha, com estas colunas no cabeçalho. Baixe a tabela base e preencha, ou envie as instruções junto com a sua lista para uma IA organizar.
          </p>
          <dl className="mt-6 grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-[auto_1fr]">
            {COLUMNS.map(([name, desc]) => (
              <div key={name} className="contents">
                <dt className="font-mono text-[13px] text-porcelain">{name}</dt>
                <dd className="text-grey-1">{desc}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex flex-wrap gap-2">
            <a href="/modelo-importacao.csv" download className={DOWNLOAD}>Tabela base (CSV)</a>
            <a href="/modelo-importacao.json" download className={DOWNLOAD}>Modelo JSON</a>
            <a href="/instrucoes-importacao.txt" download className={DOWNLOAD}>Instruções para IA (.txt)</a>
          </div>
        </div>
      </section>

      {(phase === 'review' || phase === 'creating') && (
        <section className="mt-14">
          <div className="card overflow-x-auto rounded-3xl">
            <table className="w-full min-w-[980px] text-left text-[14px]">
              <thead className="text-[12px] text-grey-2">
                <tr className="border-b border-line">
                  {['Empresa', 'URL do QR', 'Meta final', 'Idioma', 'Estilo', 'Logo', ''].map((h) => (
                    <th key={h} className="px-3 py-3 font-medium first:pl-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const warning = [r.warning, notes[i]].filter(Boolean).join(' ')
                  const q = checkQrUrl(r.qr)
                  const { repeated, onMaps } = qrNotes[i]
                  const qrMsg = !r.qr.trim()
                    ? { tone: 'text-grey-2', text: 'Falta: não exporta até preencher.' }
                    : !q.ok
                      ? { tone: 'text-[#ff8a7a]', text: q.error }
                      : repeated.length
                        ? { tone: 'text-[#ff8a7a]', text: `Mesmo link de ${repeated.join(', ')}. Cada empresa tem o seu presente: corrija antes de criar.` }
                        : onMaps.length
                          ? { tone: 'text-[#e8b86a]', text: `Já está no mapa de ${onMaps.join(', ')}. Tudo bem se for um reenvio.` }
                          : { tone: 'text-grey-2', text: 'OK' }
                  const req = (v: string) => (v.trim() ? '' : '!border-[#ff8a7a]/70')
                  return (
                    <tr key={i} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-3 pl-5">
                        <input className={`field !py-2 !text-[14px] ${req(r.company)}`} value={r.company} placeholder="Obrigatório" onChange={(e) => set(i, { company: e.target.value })} />
                        {warning && <p className="mt-2 max-w-[260px] text-[12px] leading-snug text-[#e8b86a]">{warning}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className={`field !py-2 !text-[14px] ${(r.qr.trim() && !q.ok) || repeated.length ? '!border-[#ff8a7a]/70' : ''}`}
                          value={r.qr}
                          placeholder={QR_EXAMPLE}
                          spellCheck={false}
                          onChange={(e) => set(i, { qr: e.target.value.trim() })}
                          onBlur={() => set(i, { qr: normalizeQrUrl(r.qr) })}
                        />
                        <p className={`mt-2 max-w-[240px] text-[12px] leading-snug ${qrMsg.tone}`}>{qrMsg.text}</p>
                      </td>
                      <td className="px-3 py-3">
                        <input className={`field !py-2 !text-[14px] ${req(r.goal)}`} value={r.goal} placeholder="Obrigatório" onChange={(e) => set(i, { goal: e.target.value })} />
                      </td>
                      <td className="px-3 py-3">
                        <select className="field !py-2 !text-[14px]" value={r.lang} onChange={(e) => set(i, { lang: e.target.value as Lang })}>
                          {LANG_ORDER.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select className="field !py-2 !text-[14px]" value={r.style} onChange={(e) => set(i, { style: e.target.value as MapStyle })}>
                          {STYLE_ORDER.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <LogoCell value={r.logo} onFile={async (f) => set(i, { logo: await fileToLogo(f) })} onClear={() => set(i, { logo: '' })} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 pr-5">
                        <button type="button" disabled={opening !== null} onClick={() => open(i)} className="cursor-pointer px-2 py-2 text-[12px] text-grey-1 hover:text-porcelain disabled:opacity-40">
                          {opening === i ? 'Abrindo…' : 'Ver'}
                        </button>
                        <button type="button" onClick={() => remove(i)} className="cursor-pointer px-2 py-2 text-[12px] text-grey-2 hover:text-porcelain" title="Tirar da importação">
                          Remover
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-[13px] ${incomplete || badQr || dupQr ? 'text-[#ff8a7a]' : 'text-grey-2'}`}>
              {incomplete
                ? `Preencha empresa e meta em ${incomplete} ${incomplete === 1 ? 'linha' : 'linhas'} para criar.`
                : badQr
                  ? `Corrija a URL do QR em ${badQr} ${badQr === 1 ? 'linha' : 'linhas'} (ou deixe vazia para colar depois).`
                  : dupQr
                    ? `O mesmo link de presente está em ${dupQr} linhas. Corrija para criar: cada empresa tem o seu.`
                    : noQr
                      ? `${noQr} sem URL do QR: os mapas são criados, mas só exportam depois que você colar o link.`
                      : 'Confira e ajuste o que precisar antes de criar. Use "Ver" para conferir o mapa.'}
            </p>
            <Button arrow disabled={!rows.length || !!incomplete || !!badQr || !!dupQr || phase === 'creating'} onClick={create}>
              {phase === 'creating' ? `Criando ${progress}/${rows.length}` : `Criar ${rows.length} ${rows.length === 1 ? 'mapa' : 'mapas'} e cartas`}
            </Button>
          </div>
        </section>
      )}
      {preview && createPortal(<Preview client={preview} onClose={() => setPreview(null)} />, document.body)}
    </main>
  )
}

/** The row's logo, with a file picker to add one or replace it (PNG, SVG, JPG, WebP). */
function LogoCell({ value, onFile, onClear }: { value: string; onFile: (f: File) => void; onClear: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [broken, setBroken] = useState(false)
  const src = logoSrc(value)
  useEffect(() => setBroken(false), [value])
  return (
    <div className="flex w-[150px] items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        title={src ? 'Trocar logo' : 'Enviar logo'}
        className="flex h-10 w-16 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line-strong text-[11px] text-grey-2 transition-colors duration-500 ease-heavy hover:border-porcelain/50 hover:text-porcelain"
      >
        {src && !broken ? <img src={src} alt="" className="max-h-8 max-w-14 object-contain" onError={() => setBroken(true)} /> : src ? 'Link falhou' : '+ Logo'}
      </button>
      <div className="min-w-0 text-[12px] leading-tight">
        <button type="button" onClick={() => ref.current?.click()} className="block cursor-pointer text-grey-1 hover:text-porcelain">
          {src ? 'Trocar' : 'Enviar'}
        </button>
        {value && (
          <button type="button" onClick={onClear} className="mt-1 block cursor-pointer text-grey-2 hover:text-porcelain">
            Tirar
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
