import { useState } from 'react'
import { DEFAULT_SETTINGS, updateSettings, useSettings } from '../store'
import { REQUIRE_LOGIN } from '../supabase'
import { LANG_LABEL, LANG_ORDER, type Lang } from '../types'
import { Rise } from '../ui/kit'

export function Settings() {
  const s = useSettings()
  const [lang, setLang] = useState<Lang>('pt')
  const stages = s.defaultStages[lang]
  const setStages = (list: string[]) => updateSettings({ defaultStages: { ...s.defaultStages, [lang]: list } })
  return (
    <main className="container-page pb-32 pt-[calc(var(--nav-h)+72px)]">
      <p className="eyebrow eyebrow-line fade-up">Configurações</p>
      <Rise text="Padrões do *mapa*." as="h1" className="text-h2 mt-6" />

      <div className="card fade-up mt-12 max-w-2xl space-y-8 rounded-3xl p-5 sm:p-7" style={{ animationDelay: '150ms' }}>
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Etapas padrão de novos mapas</p>
            <button
              className="cursor-pointer text-[12px] text-grey-2 hover:text-porcelain"
              onClick={() => setStages([...DEFAULT_SETTINGS.defaultStages[lang]])}
            >
              Restaurar
            </button>
          </div>
          <div className="glass inline-flex gap-1 rounded-full p-1">
            {LANG_ORDER.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`h-8 cursor-pointer rounded-full px-3.5 text-[13px] transition-colors duration-500 ease-heavy ${lang === l ? 'bg-porcelain text-ink' : 'text-grey-1 hover:text-porcelain'}`}
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
          {stages.map((st, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-5 shrink-0 font-display text-[20px] text-grey-2">{i + 1}</span>
              <input
                className="field"
                value={st}
                onChange={(e) => setStages(stages.map((x, k) => (k === i ? e.target.value : x)))}
              />
            </div>
          ))}
        </section>

        <p className="hairline-t pt-6 text-[12px] text-grey-2">
          {REQUIRE_LOGIN
            ? 'Estes padrões são compartilhados com toda a equipe e salvos automaticamente.'
            : 'Por enquanto os mapas e estes padrões ficam salvos só neste navegador.'}
        </p>
      </div>
    </main>
  )
}
