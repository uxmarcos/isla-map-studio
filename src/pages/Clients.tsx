import { useMemo, useState } from 'react'
import { slugify, useClients } from '../store'
import { KIND_LABEL, kindOf, LANG_LABEL, STATUS_LABEL, STYLE_LABEL, type Client } from '../types'
import { Button, Rise } from '../ui/kit'
import { navigate } from '../router'

/** A client is every map made for the same company; its details come from the latest one. */
interface Customer {
  key: string
  latest: Client
  maps: Client[]
}

/**
 * Maps belong to the same client when one was started from the other (clientId), or when they
 * share the slug or the company name. Renaming a map started from another keeps it linked.
 */
function group(maps: Client[]): Customer[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x) ?? x
    if (p === x) return x
    const root = find(p)
    parent.set(x, root)
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  const ids = new Set(maps.map((m) => m.id))
  const firstBy = new Map<string, string>()
  const link = (key: string, id: string) => {
    if (!key) return
    const other = firstBy.get(key)
    if (other) union(id, other)
    else firstBy.set(key, id)
  }
  for (const m of maps) {
    if (m.clientId && ids.has(m.clientId)) union(m.id, m.clientId)
    if (m.clientId) link(`c:${m.clientId}`, m.id)
    link(`s:${m.slug}`, m.id)
    link(`n:${slugify(m.company)}`, m.id)
  }
  const by = new Map<string, Client[]>()
  for (const m of maps) by.set(find(m.id), [...(by.get(find(m.id)) ?? []), m])
  return [...by.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt)
      return { key, latest: sorted[0], maps: sorted }
    })
    .sort((a, b) => a.latest.company.localeCompare(b.latest.company, 'pt-BR'))
}

const date = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function Clients() {
  const maps = useClients()
  const [q, setQ] = useState('')
  const customers = useMemo(() => group(maps), [maps])
  const mapCount = maps.filter((m) => kindOf(m) === 'map').length
  const coinCount = maps.length - mapCount
  const needle = slugify(q)
  const shown = needle
    ? customers.filter((c) => c.maps.some((m) => slugify(m.company).includes(needle) || slugify(m.destination).includes(needle)))
    : customers

  return (
    <main className="container-page pb-32 pt-[calc(var(--nav-h)+72px)] md:pt-[calc(var(--nav-h)+96px)]">
      <section className="max-w-3xl">
        <p className="eyebrow eyebrow-line fade-up">Clientes</p>
        <Rise text="Quem já tem *mapa ou carta*." className="text-h1 mt-6" />
        <p className="text-lede fade-up mt-6 max-w-xl" style={{ animationDelay: '200ms' }}>
          As duas trilhas juntas: cada empresa vira um cliente, com o nome, a meta, o logo e o link do presente da última peça. Use para consultar ou para criar outra já preenchida.
        </p>
      </section>

      <section className="fade-up mt-14" style={{ animationDelay: '300ms' }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-sm">
            <input className="field" type="search" value={q} placeholder="Buscar por empresa ou meta" onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="text-[13px] text-grey-2">
            {customers.length} {customers.length === 1 ? 'cliente' : 'clientes'} · {mapCount} {mapCount === 1 ? 'mapa' : 'mapas'} · {coinCount}{' '}
            {coinCount === 1 ? 'carta' : 'cartas'}
          </p>
        </div>

        {shown.length === 0 ? (
          <div className="card mt-8 flex flex-col items-center rounded-3xl px-6 py-20 text-center">
            <h2 className="text-h3">{customers.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda.'}</h2>
            <p className="mt-3 max-w-sm text-[15px] text-grey-1">
              {customers.length ? 'Tente outro nome.' : 'Quando você salvar o primeiro mapa ou a primeira carta, a empresa aparece aqui.'}
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4">
            {shown.map(({ key, latest: c, maps: list }) => (
              <li key={key} className="card rounded-3xl p-5 sm:p-6">
                <div className="flex flex-col gap-5 md:flex-row md:items-center">
                  <div className="flex h-16 w-28 shrink-0 items-center justify-center">
                    {c.logo ? (
                      <img src={c.logo} alt={`Logo ${c.company}`} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[12px] text-grey-2">Sem logo</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-h3 truncate">{c.company || <span className="text-grey-2">Sem nome</span>}</h2>
                    <dl className="mt-3 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="Meta" value={c.destination || '—'} />
                      <Field label="URL do QR" value={c.qrUrl || 'Falta'} />
                      <Field label={KIND_LABEL[kindOf(c)]} value={`${STYLE_LABEL[c.style]} · ${LANG_LABEL[c.lang]}`} />
                      <Field label="Atualizado" value={date(c.updatedAt)} />
                    </dl>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`#/client/${c.id}`)}>
                      {kindOf(c) === 'coin' ? 'Última carta' : 'Último mapa'}
                    </Button>
                    {/* The new piece starts from this one, so it is born on the same track. */}
                    <Button size="sm" arrow onClick={() => navigate(`#/new/from/${c.id}`)}>
                      {kindOf(c) === 'coin' ? 'Nova carta' : 'Novo mapa'}
                    </Button>
                  </div>
                </div>

                <div className="hairline-t mt-5 flex flex-wrap items-center gap-2 pt-4">
                  <span className="mr-1 text-[12px] text-grey-2">
                    {list.length} {list.length === 1 ? 'peça' : 'peças'}:
                  </span>
                  {list.map((m) => (
                    <a
                      key={m.id}
                      href={`#/client/${m.id}`}
                      className="rounded-full border border-line px-3 py-1 text-[12px] text-grey-1 transition-colors duration-500 ease-heavy hover:border-line-strong hover:text-porcelain"
                    >
                      {KIND_LABEL[kindOf(m)]} · {date(m.createdAt)} · {STATUS_LABEL[m.status]}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-grey-2">{label}</dt>
      <dd className="truncate text-porcelain">{value}</dd>
    </div>
  )
}
