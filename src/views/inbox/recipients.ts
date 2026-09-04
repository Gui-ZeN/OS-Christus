/**
 * Destinatários digitados à mão na Inbox.
 *
 * Vivia solto dentro da InboxView, sem teste — e é o caminho por onde um e-mail de OS
 * sai (ou deixa de sair) para quem precisa receber. Errar aqui é silencioso: o
 * endereço torto some da lista e ninguém percebe até cobrarem a resposta.
 */

export interface ParsedEmailTokens {
  valid: string[];
  invalid: string[];
}

/**
 * Quebra um campo livre em endereços válidos e inválidos.
 *
 * Separadores: vírgula, ponto e vírgula e espaço — porque é assim que as pessoas
 * colam de outros e-mails. O que não parece endereço volta em `invalid` em vez de ser
 * descartado: quem digitou precisa ver o próprio erro.
 */
export function parseEmailTokens(input: string): ParsedEmailTokens {
  const valid: string[] = [];
  const invalid: string[] = [];
  String(input || '')
    .split(/[;,\s]+/)
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .forEach(value => {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        if (!valid.includes(value)) valid.push(value);
      } else if (!invalid.includes(value)) {
        invalid.push(value);
      }
    });
  return { valid, invalid };
}

/**
 * Junta listas de e-mail sem repetir. Compara em minúsculas: o mesmo endereço com
 * caixa diferente é a mesma pessoa, e mandar duas vezes é o que faz o sistema parecer
 * que spamma.
 */
export function mergeEmails(...groups: Array<string[] | undefined>): string[] {
  return [
    ...new Set(
      groups
        .flatMap(group => group || [])
        .map(email => String(email || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

/**
 * Chave de comparação para texto escrito por gente: sem acento, sem caixa, sem sobra
 * nas pontas. Usada para casar local ("Bloco A" × "bloco a") e etiqueta de terceiro.
 */
export function normalizeForMatching(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export interface InteressadoSugerido {
  email: string;
  /** Em quantas OS da mesma sede esta pessoa entrou em c\u00f3pia. */
  vezes: number;
  /** De quantas OS daquela sede \u2014 o denominador, para a tela poder mostrar "8 de 12". */
  de: number;
}

/** A OS, no m\u00ednimo que a sugest\u00e3o precisa ler. */
type OsParaSugestao = {
  sede?: string | null;
  siteId?: string | null;
  requesterCcEmails?: string[];
};

const sedeDe = (os: OsParaSugestao) => normalizeForMatching(os.siteId || os.sede);

/**
 * QUEM COSTUMA ENTRAR EM C\u00d3PIA NESTA SEDE.
 *
 * Hoje o campo de interessados \u00e9 uma caixa de texto vazia: para p\u00f4r algu\u00e9m em c\u00f3pia \u00e9
 * preciso SABER e DIGITAR o endere\u00e7o. Medido em produ\u00e7\u00e3o em 04/09/2026: 239 das 244
 * OS t\u00eam interessados, com 112 endere\u00e7os distintos \u2014 o h\u00e1bito existe, s\u00f3 n\u00e3o est\u00e1
 * escrito em lugar nenhum que a tela consiga ler.
 *
 * \u26a0\ufe0f POR SEDE, E N\u00c3O GLOBAL \u2014 foi a medi\u00e7\u00e3o que decidiu isto, n\u00e3o gosto.
 *
 * No ranking global, s\u00f3 QUATRO endere\u00e7os passam de 70% das OS, e s\u00e3o justamente os
 * que j\u00e1 entram em tudo: sugerir eles n\u00e3o acrescenta nada. O que varia \u00e9 a sede, e
 * varia forte: `diretoria01.pq@christus.com.br` est\u00e1 em 76% das OS de PQL1 e em 7%
 * do geral. Num top-10 global ele ficaria em trig\u00e9simo e ningu\u00e9m o veria; para quem
 * abre uma OS de PQL1, \u00e9 a terceira pessoa mais prov\u00e1vel.
 *
 * \u26a0\ufe0f SEM CONSULTA NOVA. Deriva de `tickets`, que j\u00e1 vive no contexto \u2014 mesma escolha
 * do `buildAgenda`. Com ~250 OS o filtro em mem\u00f3ria \u00e9 confort\u00e1vel.
 *
 * \u26a0\ufe0f EXIGE UM PISO DE AMOSTRA. Com uma OS na sede, o primeiro endere\u00e7o que algu\u00e9m
 * copiou apareceria como "100%" \u2014 n\u00famero que parece medida e \u00e9 acaso. Abaixo do piso
 * a resposta \u00e9 lista vazia: sem sugest\u00e3o \u00e9 melhor que sugest\u00e3o inventada.
 *
 * @param jaEscolhidos sai da lista \u2014 sugerir quem j\u00e1 est\u00e1 em c\u00f3pia \u00e9 ru\u00eddo, e \u00e9 o que
 *                     apagaria os quatro onipresentes sem precisar de regra para eles.
 */
export function sugerirInteressados(
  tickets: OsParaSugestao[],
  opcoes: { sede?: string | null; jaEscolhidos?: string[]; limite?: number; minimoDeOs?: number } = {}
): InteressadoSugerido[] {
  const { sede, jaEscolhidos = [], limite = 5, minimoDeOs = 3 } = opcoes;
  const alvo = normalizeForMatching(sede);
  if (!alvo) return [];

  const daSede = (Array.isArray(tickets) ? tickets : []).filter(os => sedeDe(os) === alvo);
  if (daSede.length < minimoDeOs) return [];

  const excluir = new Set(mergeEmails(jaEscolhidos));
  const contagem = new Map<string, number>();
  for (const os of daSede) {
    // Por OS, n\u00e3o por ocorr\u00eancia: a mesma pessoa citada duas vezes na mesma OS n\u00e3o
    // vale dois votos.
    for (const email of mergeEmails(os.requesterCcEmails)) {
      if (excluir.has(email)) continue;
      contagem.set(email, (contagem.get(email) || 0) + 1);
    }
  }

  return [...contagem]
    .map(([email, vezes]) => ({ email, vezes, de: daSede.length }))
    // Empate desfeito pelo endere\u00e7o: sem isso a ordem depende da ordem de inser\u00e7\u00e3o do
    // Map, e a mesma tela mostraria sugest\u00f5es diferentes a cada recarga.
    .sort((a, b) => b.vezes - a.vezes || a.email.localeCompare(b.email))
    .slice(0, limite);
}
