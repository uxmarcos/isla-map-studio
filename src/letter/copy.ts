import type { Lang, LetterText } from '../types'

/** Default letter, per language. {company} and {goal} are replaced when drawing. */
export const DEFAULT_LETTER: Record<Lang, LetterText> = {
  en: {
    eyebrow: 'A letter from Isla',
    title: 'Welcome aboard, {company}.',
    intro:
      'Thank you for opening the chest. We are Isla, and we turn your LinkedIn into booked sales meetings. We find the buyers who fit your ICP, grow and warm that network every day, and work every lead until it is a call on your calendar. You just approve.',
    howTitle: 'How Isla works',
    steps: [
      { title: 'We write content in your voice', text: 'We write your posts for you, in your voice. Nothing goes out until you approve.' },
      { title: 'New connections, daily', text: 'Every day we send connection requests, only to your target audience.' },
      { title: 'We find your buyers', text: 'We map your LinkedIn and identify the people who fit your ICP.' },
      { title: 'Into the pipeline', text: 'New and existing connections enter a pipeline, from connecting to call booked.' },
      { title: 'We warm every lead', text: 'We read their signals: we like their posts and suggest comments when they post.' },
      { title: 'Call booked', text: 'Once a lead is warm, we reach out. The meeting lands on your calendar.' },
    ],
    closing:
      'The map in this chest charts the route to {goal}. We would love to sail it with you. Scan the code to open your gift.',
    signoff: 'See you on board,\nThe Isla team',
    qrCaption: 'Scan to open your gift',
    nfcCaption: 'Or hold your phone to the logo on the chest.',
  },
  pt: {
    eyebrow: 'Uma carta da Isla',
    title: 'Bem-vindos a bordo, {company}.',
    intro:
      'Obrigado por abrir o baú. Somos a Isla e transformamos o seu LinkedIn em reuniões de vendas agendadas. Encontramos os compradores que estão no seu ICP, crescemos e aquecemos essa rede todos os dias, e trabalhamos cada lead até virar uma call na sua agenda. Você só aprova.',
    howTitle: 'Como a Isla funciona',
    steps: [
      { title: 'Nós escrevemos conteúdo na sua voz', text: 'Escrevemos os seus posts por você, com a sua voz. Nada é publicado sem a sua aprovação.' },
      { title: 'Conexões todos os dias', text: 'Todos os dias enviamos conexões, só para o seu público-alvo.' },
      { title: 'Encontramos seus compradores', text: 'Mapeamos o seu LinkedIn e identificamos quem está dentro do seu ICP.' },
      { title: 'Tudo entra no pipeline', text: 'Conexões novas e antigas entram num pipeline, de conectando até call agendada.' },
      { title: 'Aquecemos cada lead', text: 'Lemos os sinais: curtimos os posts deles e sugerimos comentários quando postam.' },
      { title: 'Call agendada', text: 'Com o lead aquecido, fazemos o reach out. A reunião cai na sua agenda.' },
    ],
    // Fixed text (no {goal}): the default goal is an imperative, which would not read after "até".
    closing:
      'O mapa neste baú traça a rota até transformar seu LinkedIn em pipeline\n\nQueremos navegar com vocês. Escaneie o código para abrir seu presente.',
    signoff: 'Até breve,\nTime Isla',
    qrCaption: 'Escaneie para abrir seu presente',
    nfcCaption: 'Ou aproxime o celular da logo na frente do baú.',
  },
}

/** Pipeline stages drawn in the step 4 illustration. */
export const PIPELINE: Record<Lang, string[]> = {
  en: ['Connecting', 'Engaging', 'Reach out', 'Call booked'],
  pt: ['Conectando', 'Engajando', 'Reach out', 'Call agendada'],
}

/** The letter as it will be drawn: defaults for the language, overridden by edits. */
export function letterText(lang: Lang, edits: Partial<LetterText> | undefined): LetterText {
  const base = DEFAULT_LETTER[lang]
  return {
    ...base,
    ...edits,
    steps: base.steps.map((s, i) => ({ ...s, ...edits?.steps?.[i] })),
  }
}

export const fillVars = (text: string, company: string, goal: string) =>
  text.replace(/\{company\}/g, company).replace(/\{goal\}/g, goal)
