import { useMemo, useState } from 'react'
import { downloadLabelsZip, shippingLabelsEnabled, slugify, useClients } from '../store'
import { STATUS_LABEL, STATUS_ORDER, type Client, type Status } from '../types'
import { Button, Rise, StatusPill } from '../ui/kit'
import { toast } from '../ui/toast'
import { date, errorText, labelMeta, useShippingLabelActions } from '../ui/shippingLabelActions'

type Filter = Status | 'all'

/** Every map with its shipping label: attach one per map, download one, the selected ones or all shown. */
export function Labels() {
  const clients = useClients()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipping, setZipping] = useState<string | null>(null)
  const actions = useShippingLabelActions()

  const needle = slugify(q)
  const shown = useMemo(
    () =>
      clients.filter(
        (c) => (filter === 'all' || c.status === filter) && (!needle || slugify(c.company).includes(needle) || (c.slug ?? '').includes(needle)),
      ),
    [clients, filter, needle],
  )
  // Only what is on screen counts: a map selected and then filtered out isn't downloaded.
  const withLabel = shown.filter((c) => c.shippingLabel)
  const picked = withLabel.filter((c) => selected.has(c.id))
  const allPicked = withLabel.length > 0 && picked.length === withLabel.length

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(withLabel.map((c) => c.id)))

  async function zip(list: Client[]) {
    setZipping(`0/${list.length}`)
    try {
      const failed = await downloadLabelsZip(list, (n) => setZipping(`${n}/${list.length}`))
      if (failed.length)
        toast(failed.length === list.length ? 'Nenhuma etiqueta pôde ser baixada.' : `${failed.length} ${failed.length === 1 ? 'etiqueta ficou' : 'etiquetas ficaram'} de fora do .zip:`, {
          tone: 'error',
          detail: failed,
        })
    } catch (e) {
      toast(errorText(e), { tone: 'error' })
    } finally {
      setZipping(null)
    }
  }

  return (
    <main className="container-page pb-32 pt-[calc(var(--nav-h)+72px)] md:pt-[calc(var(--nav-h)+96px)]">
      <section className="max-w-3xl">
        <p className="eyebrow eyebrow-line fade-up">Envio</p>
        <Rise text="Cada baú com a sua *etiqueta*." className="text-h1 mt-6" />
        <p className="text-lede fade-up mt-6 max-w-xl" style={{ animationDelay: '200ms' }}>
          Anexe o PDF da etiqueta ao mapa de cada baú. Depois baixe uma, as selecionadas ou todas de uma vez.
        </p>
      </section>

      {!shippingLabelsEnabled ? (
        <div className="card fade-up mt-12 rounded-3xl p-6 text-[14px] text-grey-1">
          Etiquetas ficam no banco da equipe. Neste modo, só do navegador, elas não estão disponíveis.
        </div>
      ) : (
        <section className="fade-up mt-14" style={{ animationDelay: '300ms' }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="w-full sm:w-64">
                <input className="field" type="search" value={q} placeholder="Buscar empresa" onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="glass -mx-1 flex max-w-full gap-1 overflow-x-auto rounded-full p-1">
                {(['all', ...STATUS_ORDER] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`h-8 shrink-0 cursor-pointer rounded-full px-3.5 text-[13px] transition-colors duration-500 ease-heavy ${filter === f ? 'bg-porcelain text-ink' : 'text-grey-1 hover:text-porcelain'}`}
                  >
                    {f === 'all' ? 'Todos' : STATUS_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" disabled={!picked.length || !!zipping} onClick={() => zip(picked)}>
                Baixar selecionadas ({picked.length})
              </Button>
              <Button size="sm" disabled={!withLabel.length || !!zipping} onClick={() => zip(withLabel)}>
                {zipping ? `Baixando ${zipping}` : `Baixar todas (${withLabel.length})`}
              </Button>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="card mt-8 flex flex-col items-center rounded-3xl px-6 py-20 text-center">
              <h2 className="text-h3">{clients.length ? 'Nenhum mapa encontrado.' : 'Nenhum mapa ainda.'}</h2>
              <p className="mt-3 max-w-sm text-[15px] text-grey-1">
                {clients.length ? 'Tente outro nome ou status.' : 'Crie um mapa para anexar a etiqueta do baú.'}
              </p>
            </div>
          ) : (
            <div className="card mt-8 overflow-hidden rounded-3xl">
              <label className="flex cursor-pointer items-center gap-3 border-b border-line px-5 py-3 text-[13px] text-grey-1">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-porcelain"
                  checked={allPicked}
                  ref={(el) => {
                    if (el) el.indeterminate = picked.length > 0 && !allPicked
                  }}
                  disabled={!withLabel.length}
                  onChange={toggleAll}
                />
                {withLabel.length} de {shown.length} {shown.length === 1 ? 'mapa' : 'mapas'} com etiqueta
              </label>
              <ul>
                {shown.map((c) => (
                  <Row key={c.id} client={c} checked={selected.has(c.id)} onToggle={() => toggle(c.id)} actions={actions} />
                ))}
              </ul>
            </div>
          )}
          {actions.input}
        </section>
      )}
    </main>
  )
}

function Row({ client: c, checked, onToggle, actions }: { client: Client; checked: boolean; onToggle: () => void; actions: ReturnType<typeof useShippingLabelActions> }) {
  const busy = actions.busy[c.id]
  const label = c.shippingLabel
  return (
    <li
      className="flex flex-col gap-4 border-b border-line px-5 py-4 last:border-b-0 md:flex-row md:items-center"
      // Dropping a PDF on the row attaches it.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        actions.attach(c.id, e.dataTransfer.files[0])
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <input
          type="checkbox"
          className="size-4 shrink-0 cursor-pointer accent-porcelain disabled:cursor-default disabled:opacity-30"
          aria-label={`Selecionar etiqueta de ${c.company || 'Sem nome'}`}
          checked={!!label && checked}
          disabled={!label}
          onChange={onToggle}
        />
        <div className="min-w-0">
          <a href={`#/client/${c.id}`} className="block truncate text-[15px] text-porcelain hover:underline">
            {c.company || <span className="text-grey-2">Sem nome</span>}
          </a>
          <p className="mt-0.5 truncate text-[12px] text-grey-2">Mapa de {date(c.createdAt)} · /{c.slug || '—'}</p>
        </div>
        <span className="ml-auto hidden sm:block md:ml-4">
          <StatusPill status={c.status} />
        </span>
      </div>

      <div className="min-w-0 text-[13px] md:w-64">
        {label ? (
          <>
            <p className="truncate text-porcelain" title={label.name}>
              {label.name}
            </p>
            <p className="truncate text-[12px] text-grey-2">{labelMeta(label)}</p>
          </>
        ) : (
          <p className="text-grey-2">{busy === 'upload' ? 'Enviando…' : 'Sem etiqueta'}</p>
        )}
      </div>

      <div className="flex shrink-0 gap-2">
        {label && (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => actions.download(c)}>
            {busy === 'download' ? 'Baixando…' : 'Baixar'}
          </Button>
        )}
        <Button size="sm" variant={label ? 'quiet' : 'ghost'} disabled={!!busy} onClick={() => actions.pick(c)}>
          {busy === 'upload' ? 'Enviando…' : label ? 'Trocar' : 'Anexar PDF'}
        </Button>
        {label && (
          <Button size="sm" variant="quiet" className="hover:!text-[#ff8a7a]" disabled={!!busy} onClick={() => actions.remove(c)}>
            {busy === 'remove' ? 'Removendo…' : 'Remover'}
          </Button>
        )}
      </div>
    </li>
  )
}
