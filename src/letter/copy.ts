import type { Kind, Lang, LetterText } from '../types'

/** The map's letter, per language. {company} and {goal} are replaced when drawing. */
const MAP_LETTER: Record<Lang, LetterText> = {
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

/**
 * The coin's letter. It keeps the map's letter whole — same title, same six steps, same signoff —
 * because the coin is the experience and this page is still where the client learns what Isla does.
 * What changes all follows from there being no map in the box:
 *  - the opening names the case instead of the chest;
 *  - goalLine prints the client's goal, which on the map is the X at the end of the route;
 *  - the captions swap roles: the coin is the gesture, the QR is the way in when NFC is not.
 */
const COIN_LETTER: Record<Lang, LetterText> = {
  en: {
    ...MAP_LETTER.en,
    // Nothing nautical on this track: no welcome aboard, no sailing, no route. The map earns that
    // language from its artwork; the coin has none, so there it is only costume.
    // The sentence the gift page opens with, so the paper and the screen the coin unlocks say one
    // thing. *Asterisks* set the phrase in italic on its own line, the way the site sets it.
    title: 'Turn your LinkedIn into *booked sales meetings*.',
    intro:
      'Thank you for opening the case. We are Isla, and we turn your LinkedIn into booked sales meetings. We find the buyers who fit your ICP, grow and warm that network every day, and work every lead until it is a call on your calendar. You just approve.',
    goalLine: 'The goal: {goal}',
    // One line: the goal line above already names it, so the closing only has to point at the
    // coin. A second line pushes the footer up into the text.
    closing: 'The coin in this case opens your gift. Let us build this with you.',
    site: 'isla.to',
    qrCaption: 'Or scan the code',
    // The break is explicit so the caption splits where it reads, not where the column runs out.
    nfcCaption: 'Hold your phone\nto the coin',
  },
  pt: {
    ...MAP_LETTER.pt,
    title: 'Seu LinkedIn gerando *reuniões de venda*.',
    intro:
      'Obrigado por abrir a case. Somos a Isla e transformamos o seu LinkedIn em reuniões de vendas agendadas. Encontramos os compradores que estão no seu ICP, crescemos e aquecemos essa rede todos os dias, e trabalhamos cada lead até virar uma call na sua agenda. Você só aprova.',
    goalLine: 'A meta: {goal}',
    closing: 'A moeda desta case abre o seu presente. Vamos construir isso com vocês.',
    site: 'isla.to',
    qrCaption: 'Ou escaneie o código',
    nfcCaption: 'Encoste o celular\nna moeda',
  },
}

/** Default letter, per track and language. */
export const DEFAULT_LETTER: Record<Kind, Record<Lang, LetterText>> = { map: MAP_LETTER, coin: COIN_LETTER }

/** Pipeline stages drawn in the step 4 illustration. */
export const PIPELINE: Record<Lang, string[]> = {
  en: ['Connecting', 'Engaging', 'Reach out', 'Call booked'],
  pt: ['Conectando', 'Engajando', 'Reach out', 'Call agendada'],
}

/** The letter as it will be drawn: defaults for the track and language, overridden by edits. */
export function letterText(kind: Kind, lang: Lang, edits: Partial<LetterText> | undefined): LetterText {
  const base = DEFAULT_LETTER[kind][lang]
  return {
    ...base,
    ...edits,
    steps: base.steps.map((s, i) => ({ ...s, ...edits?.steps?.[i] })),
  }
}

export const fillVars = (text: string, company: string, goal: string) =>
  text.replace(/\{company\}/g, company).replace(/\{goal\}/g, goal)
