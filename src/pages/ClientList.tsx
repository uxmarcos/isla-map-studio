import { useMemo, useState, type ReactNode } from 'react'
import { importLocalMaps, localMaps, useClients } from '../store'
import { kindOf, STATUS_LABEL, STATUS_ORDER, type Kind, type Status } from '../types'
import { MapCard } from '../ui/MapCard'
import { downloadZip } from '../map/export'
import { Button, Rise } from '../ui/kit'
import { navigate } from '../router'
import { toast } from '../ui/toast'

type Filter = Status | 'all'

/** All the wording that differs between the tracks; the screen itself is the same. */
const COPY: Record<
  Kind,
  { eyebrow: string; title: string; lede: string; create: string; createFirst: string; firstTitle: ReactNode; firstLede: string; noneForFilter: string; one: string; many: string; href: string }
> = {
  map: {
    eyebrow: 'Campanha do baú',
    title: 'Um mapa para cada *baú*.',
    lede: 'Cadastre a empresa, o logo e a meta. O mapa sai pronto para imprimir, com o QR que abre o presente.',
    create: 'Novo mapa',
    createFirst: 'Criar o primeiro mapa',
    firstTitle: (
      <>
        O primeiro mapa <em>começa aqui</em>.
      </>
    ),
    firstLede: 'Crie um mapa, preencha os dados da empresa e baixe o arquivo para impressão.',
    noneForFilter: 'Nenhum mapa com esse status.',
    one: 'mapa',
    many: 'mapas',
    href: '#/new',
  },
  coin: {
    eyebrow: 'Campanha da moeda',
    title: 'Uma carta para cada *moeda*.',
    lede: 'Cadastre a empresa, o logo e a meta. A carta sai pronta para imprimir e seguir junto com a case da moeda NFC.',
    create: 'Nova carta',
    createFirst: 'Criar a primeira carta',
    firstTitle: (
      <>
        A primeira carta <em>começa aqui</em>.
      </>
    ),
    firstLede: 'Crie uma carta, preencha os dados da empresa e baixe o arquivo para impressão.',
    noneForFilter: 'Nenhuma carta com esse status.',
    one: 'carta',
    many: 'cartas',
    href: '#/new/coin',
  },
}

/** One track's pieces: the maps with their letters, or the coin's letters. */
export function ClientList({ kind = 'map' }: { kind?: Kind }) {
  const all = useClients()
  const clients = useMemo(() => all.filter((c) => kindOf(c) === kind), [all, kind])
  const copy = COPY[kind]
  const [filter, setFilter] = useState<Filter>('all')
  const [zipping, setZipping] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  // Maps saved in this browser before the team database existed; the coin track never had that mode.
  const pending = useMemo(() => (kind === 'map' ? localMaps().length : 0), [all, kind])

  async function runImport() {
    setImporting(true)
    try {
      const n = await importLocalMaps()
      toast(`${n} ${n === 1 ? 'mapa importado' : 'mapas importados'} para o banco da equipe.`)
    } catch (e) {
      toast(`Não foi possível importar: ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`, { tone: 'error' })
    } finally {
      setImporting(false)
    }
  }

  const counts = useMemo(() => {
    const c = { all: clients.length } as Record<Filter, number>
    STATUS_ORDER.forEach((s) => (c[s] = clients.filter((x) => x.status === s).length))
    return c
  }, [clients])

  const shown = filter === 'all' ? clients : clients.filter((c) => c.status === filter)

  async function exportAll() {
    setZipping(`0/${shown.length}`)
    try {
      const skipped = await downloadZip(shown, (n) => setZipping(`${n}/${shown.length}`), kind === 'coin')
      if (skipped.length)
        toast(skipped.length === shown.length ? `Nenhum item tem link de presente válido: nada foi exportado.` : `${skipped.length} sem link de presente válido ${skipped.length === 1 ? 'ficou' : 'ficaram'} de fora do .zip:`, {
          tone: 'error',
          detail: skipped,
        })
    } finally {
      setZipping(null)
    }
  }

  return (
    <main className="container-page pb-32 pt-[calc(var(--nav-h)+72px)] md:pt-[calc(var(--nav-h)+96px)]">
      <section className="max-w-3xl">
        <p className="eyebrow eyebrow-line fade-up">{copy.eyebrow}</p>
        <Rise text={copy.title} className="text-h1 mt-6" />
        <p className="text-lede fade-up mt-6 max-w-xl" style={{ animationDelay: '200ms' }}>
          {copy.lede}
        </p>
        <div className="fade-up mt-8 flex flex-wrap gap-2 sm:hidden" style={{ animationDelay: '250ms' }}>
          <Button arrow onClick={() => navigate(copy.href)}>
            {copy.create}
          </Button>
          {kind === 'map' && (
            <Button variant="ghost" onClick={() => navigate('#/import')}>
              Criar mapas em lote
            </Button>
          )}
        </div>
      </section>

      {pending > 0 && (
        <div className="card fade-up mt-12 flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-[14px] text-grey-1">
            Este navegador tem {pending} {pending === 1 ? 'mapa salvo' : 'mapas salvos'} antes do banco da equipe. Importe para todo mundo ver.
          </p>
          <Button size="sm" variant="ghost" disabled={importing} onClick={runImport}>
            {importing ? 'Importando…' : 'Importar mapas'}
          </Button>
        </div>
      )}

      <section className="fade-up mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line md:grid-cols-4" style={{ animationDelay: '300ms' }}>
        {STATUS_ORDER.map((s) => (
          <div key={s} className="bg-ink px-6 py-6">
            <div className="font-display text-[52px] leading-none tracking-[-0.03em] tabular-nums">{counts[s]}</div>
            <div className="mt-3 text-[13px] text-grey-1">{STATUS_LABEL[s]}</div>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="glass -mx-1 flex max-w-full gap-1 overflow-x-auto rounded-full p-1">
            {(['all', ...STATUS_ORDER] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-8 shrink-0 cursor-pointer rounded-full px-3.5 text-[13px] transition-colors duration-500 ease-heavy ${filter === f ? 'bg-porcelain text-ink' : 'text-grey-1 hover:text-porcelain'}`}
              >
                {f === 'all' ? 'Todos' : STATUS_LABEL[f]} <span className="opacity-50">{counts[f]}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" disabled={!shown.length || !!zipping} onClick={exportAll}>
            {zipping ? `Gerando PDFs ${zipping}` : `Baixar PDFs (.zip)`}
          </Button>
        </div>

        {shown.length === 0 ? (
          <div className="card mt-8 flex flex-col items-center rounded-3xl px-6 py-20 text-center">
            <h2 className="text-h3">{clients.length ? 'Nada aqui por enquanto.' : copy.firstTitle}</h2>
            <p className="mt-3 max-w-sm text-[15px] text-grey-1">{clients.length ? copy.noneForFilter : copy.firstLede}</p>
            {!clients.length && (
              <Button className="mt-8" arrow onClick={() => navigate(copy.href)}>
                {copy.createFirst}
              </Button>
            )}
          </div>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((c, i) => (
              <li key={c.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                <MapCard client={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
