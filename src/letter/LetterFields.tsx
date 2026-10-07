import type { Client, LetterText } from '../types'
import { Label } from '../ui/kit'
import { letterText } from './copy'

/** Letter text, pre-filled for the map's language and editable per map. */
export function LetterFields({ c, set }: { c: Client; set: (patch: Partial<Client>) => void }) {
  const text = letterText(c.lang, c.letter)
  const edit = <K extends keyof LetterText>(key: K, value: LetterText[K]) => set({ letter: { ...c.letter, [key]: value } })
  const editStep = (i: number, key: 'title' | 'text', value: string) =>
    edit('steps', text.steps.map((s, k) => (k === i ? { ...s, [key]: value } : s)))
  const pt = c.lang === 'pt'

  return (
    <section className="hairline-t space-y-5 pt-7">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{pt ? 'A carta' : 'The letter'}</p>
        <button
          type="button"
          className="cursor-pointer text-[12px] text-grey-2 transition-colors hover:text-porcelain"
          onClick={() => set({ letter: undefined })}
        >
          Restaurar texto padrão
        </button>
      </div>
      <p className="text-[12px] text-grey-2">
        {'{company}'} e {'{goal}'} viram o nome da empresa e a meta final do mapa.
      </p>

      <div>
        <Label>Meta final, no X do tesouro</Label>
        <input className="field" value={c.destination} onChange={(e) => set({ destination: e.target.value, goal: e.target.value })} />
      </div>
      <div>
        <Label>Sobretítulo</Label>
        <input className="field" value={text.eyebrow} onChange={(e) => edit('eyebrow', e.target.value)} />
      </div>
      <div>
        <Label>Título</Label>
        <input className="field" value={text.title} onChange={(e) => edit('title', e.target.value)} />
      </div>
      <div>
        <Label>Apresentação</Label>
        <textarea className="field min-h-36 resize-y" value={text.intro} onChange={(e) => edit('intro', e.target.value)} />
      </div>

      <div className="space-y-4">
        <div>
          <Label>Título das etapas</Label>
          <input className="field" value={text.howTitle} onChange={(e) => edit('howTitle', e.target.value)} />
        </div>
        {text.steps.map((s, i) => (
          <div key={i} className="flex gap-3">
            <span className="w-5 shrink-0 pt-2 font-display text-[20px] text-grey-2">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <input className="field" value={s.title} onChange={(e) => editStep(i, 'title', e.target.value)} />
              <textarea
                className="field min-h-16 resize-y !py-2 text-[13px] italic"
                value={s.text}
                onChange={(e) => editStep(i, 'text', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      <div>
        <Label>Encerramento</Label>
        <textarea className="field min-h-28 resize-y" value={text.closing} onChange={(e) => edit('closing', e.target.value)} />
      </div>
      <div>
        <Label>Assinatura</Label>
        <textarea className="field min-h-20 resize-y" value={text.signoff} onChange={(e) => edit('signoff', e.target.value)} />
      </div>
      <div>
        <Label>Legenda do QR</Label>
        <input className="field" value={text.qrCaption} onChange={(e) => edit('qrCaption', e.target.value)} />
      </div>
      <div>
        <Label>Legenda do NFC</Label>
        <textarea className="field min-h-16 resize-y" value={text.nfcCaption} onChange={(e) => edit('nfcCaption', e.target.value)} />
      </div>
    </section>
  )
}
