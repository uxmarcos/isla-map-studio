import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Client, Status } from '../types'
import { KIND_LABEL, kindOf, STATUS_LABEL, STATUS_ORDER } from '../types'
import { deleteClient, saveClient } from '../store'
import { MapCanvas } from '../map/MapCanvas'
import { LetterCanvas } from '../letter/LetterCanvas'
import { StatusDot, StatusPill } from './kit'
import { navigate } from '../router'
import { toast } from './toast'

/** Closes a popover on a click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open, close])
  return ref
}

const MENU = 'absolute z-20 min-w-[180px] rounded-2xl border border-line-strong bg-ink-2 p-1.5 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.8)] fade-in'
const ITEM = 'flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] text-grey-1 transition-colors duration-300 hover:bg-porcelain/[0.06] hover:text-porcelain'

/** A piece in the list: click opens the editor; status and actions change it in place. */
export function MapCard({ client: c }: { client: Client }) {
  const [preview, setPreview] = useState(false)
  const edit = `#/client/${c.id}`
  const coin = kindOf(c) === 'coin'
  const piece = KIND_LABEL[kindOf(c)]
  return (
    <div className="card group relative rounded-3xl transition-[border-color] duration-500 ease-heavy hover:border-line-strong">
      {/* The letter is A4 portrait: at card width the whole sheet would tower over the map cards,
          so the coin's thumbnail is a window on its top third — logo, title and the first lines. */}
      <a href={edit} className={`block overflow-hidden rounded-t-3xl border-b border-line ${coin ? 'aspect-[3/2]' : ''}`}>
        {coin ? (
          <LetterCanvas client={c} resolution={900} className="transition-transform duration-700 ease-heavy group-hover:scale-[1.03]" />
        ) : (
          <MapCanvas client={c} resolution={900} className="transition-transform duration-700 ease-heavy group-hover:scale-[1.03]" />
        )}
      </a>
      <div className="flex items-start justify-between gap-4 p-5">
        <a href={edit} className="min-w-0">
          <h3 className="text-h3 truncate">{c.company || <span className="text-grey-2">Sem nome</span>}</h3>
          <p className="mt-1 truncate text-[13px] text-grey-1">
            {c.lang === 'pt' ? 'PT' : 'EN'} · {coin ? '' : 'Rumo a '}
            {c.destination || '—'} · /{c.slug || '—'}
          </p>
        </a>
        <StatusMenu status={c.status} onChange={(status) => saveClient({ ...c, status })} />
      </div>
      <ActionsMenu
        deleteLabel={`Excluir ${piece.toLowerCase()}`}
        onView={() => setPreview(true)}
        onEdit={() => navigate(edit)}
        onDelete={() => {
          deleteClient(c.id)
          toast(`${piece} de ${c.company || 'Sem nome'} ${coin ? 'excluída' : 'excluído'}.`, { action: { label: 'Desfazer', run: () => saveClient(c) } })
        }}
      />
      {/* On body: the card's entrance animation would trap a fixed overlay inside it. */}
      {preview && createPortal(<Preview client={c} onClose={() => setPreview(false)} />, document.body)}
    </div>
  )
}

function StatusMenu({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} title="Mudar status" onClick={() => setOpen((o) => !o)} className="cursor-pointer rounded-full transition-opacity hover:opacity-80">
        <StatusPill status={status} chevron />
      </button>
      {open && (
        <div role="menu" className={`${MENU} bottom-full right-0 mb-2`}>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === status}
              className={`${ITEM} ${s === status ? 'text-porcelain' : ''}`}
              onClick={() => {
                setOpen(false)
                if (s !== status) onChange(s)
              }}
            >
              <span className="flex items-center gap-2.5">
                <StatusDot status={s} />
                {STATUS_LABEL[s]}
              </span>
              {s === status && <Check />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionsMenu({ deleteLabel, onView, onEdit, onDelete }: { deleteLabel: string; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const item = (label: string, run: () => void, danger = false): ReactNode => (
    <button
      type="button"
      role="menuitem"
      className={`${ITEM} ${danger ? 'hover:!text-[#ff8a7a]' : ''}`}
      onClick={() => {
        setOpen(false)
        run()
      }}
    >
      {label}
    </button>
  )
  return (
    // Always visible on touch screens; on hover (or while open) where there is a mouse.
    <div ref={ref} className={`absolute right-3 top-3 transition-opacity duration-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100 ${open ? '!opacity-100' : ''}`}>
      <button
        type="button"
        aria-label="Ações"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="glass flex size-9 cursor-pointer items-center justify-center rounded-full text-porcelain"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div role="menu" className={`${MENU} right-0 top-full mt-2`}>
          {item('Visualizar', onView)}
          {item('Editar', onEdit)}
          <div className="my-1 h-px bg-line" />
          {item(deleteLabel, onDelete, true)}
        </div>
      )}
    </div>
  )
}

/** The piece, large, without leaving the page: a map and its letter, or the coin's letter alone. */
export function Preview({ client: c, onClose }: { client: Client; onClose: () => void }) {
  const coin = kindOf(c) === 'coin'
  const [view, setView] = useState<'map' | 'letter'>(coin ? 'letter' : 'map')
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', key)
      document.body.style.overflow = overflow
    }
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={`Visualizar ${c.company}`} className="fixed inset-0 z-[60] flex flex-col bg-ink/90 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className="container-page flex items-center justify-between gap-3 py-4" onClick={(e) => e.stopPropagation()}>
        {/* Nothing to switch on the coin track: the letter is the whole piece. */}
        {coin ? (
          <span />
        ) : (
          <div className="glass flex rounded-full p-1">
            {(['map', 'letter'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`h-9 cursor-pointer rounded-full px-5 text-[13px] transition-colors duration-500 ease-heavy ${view === v ? 'bg-porcelain text-ink' : 'text-grey-1 hover:text-porcelain'}`}
              >
                {v === 'map' ? 'Mapa' : 'Carta'}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="glass h-11 cursor-pointer rounded-full px-5 text-[13px] text-porcelain">
          Fechar
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-[var(--gutter)] pb-6">
        <div
          onClick={(e) => e.stopPropagation()}
          className="paper-sheet overflow-hidden rounded-[6px] border border-line"
          // Fit the sheet in the space left: A4 landscape for the map, portrait for the letter.
          style={{ width: view === 'map' ? 'min(100%, calc((100dvh - 110px) * 1.4142))' : 'min(100%, calc((100dvh - 110px) * 0.7071))' }}
        >
          {view === 'map' ? <MapCanvas client={c} resolution={2400} /> : <LetterCanvas client={c} resolution={1800} />}
        </div>
      </div>
    </div>
  )
}

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)
