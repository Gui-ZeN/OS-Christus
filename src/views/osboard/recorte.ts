/**
 * O RECORTE DA FILA — quais OS sobrevivem às seis escolhas de categoria.
 *
 * Vivia solto dentro do `useMemo` da OsBoardView, num arquivo de 990 linhas, sem
 * teste. Enquanto cada campo era uma string, a regra cabia num `!==` e o risco era
 * baixo. Múltipla escolha muda isso: agora há três convenções empilhadas que só
 * existem na cabeça de quem escreveu — vazio é TUDO, dentro de uma dimensão é OU,
 * entre dimensões é E — e nenhuma delas grita quando quebra. A fila continua
 * desenhando OS; só as erradas.
 *
 * Fica aqui como função pura para que essas três convenções tenham onde ser
 * afirmadas. O `showClosed`, a busca e os atalhos (travadas, água) continuam na
 * view: dependem da OS inteira, não só das categorias.
 */

const NENHUM_RESPONSAVEL = 'none';

/** As seis escolhas, como estão em `OsBoardFilter`. Lista vazia = todas. */
export interface EscolhasDeCategoria {
  sede: string[];
  macroService: string[];
  service: string[];
  team: string[];
  status: string[];
  /** E-mails; `none` na lista significa "sem responsável". */
  responsible: string[];
}

/** A OS já decorada pela view — só o que o recorte precisa ler. */
export interface LinhaDoRecorte {
  siteLabel: string;
  macro: string;
  service: string;
  team: string;
  /** A ETAPA, não o status do banco: é o vocabulário que o filtro mostra. */
  etapa: string;
  responsibleEmail?: string | null;
}

/**
 * ⚠️ LISTA VAZIA É "TODAS", e não "nenhuma".
 *
 * É o que preserva o comportamento de antes (abrir a Gestão mostra a fila inteira) e
 * o que evita o estado absurdo de uma tela em branco porque ninguém marcou nada.
 */
export const aceita = (escolhidos: string[], valor: string): boolean =>
  escolhidos.length === 0 || escolhidos.includes(valor);

/**
 * ⚠️ DENTRO DE UMA DIMENSÃO É "OU", ENTRE DIMENSÕES É "E".
 *
 * "Sul 1 ou Sul 3, e em orçamento" é como as pessoas leem uma fila de filtros — e é
 * o que o `<select>` de escolha única já fazia entre as dimensões. Trocar o "E" por
 * "OU" faria marcar uma sede a mais AUMENTAR a lista de etapas, que é o oposto do
 * que "filtrar" quer dizer.
 */
export function passaNoRecorte(linha: LinhaDoRecorte, escolhas: EscolhasDeCategoria): boolean {
  if (!aceita(escolhas.sede, linha.siteLabel)) return false;
  if (!aceita(escolhas.macroService, linha.macro)) return false;
  if (!aceita(escolhas.service, linha.service)) return false;
  if (!aceita(escolhas.team, linha.team)) return false;
  if (!aceita(escolhas.status, linha.etapa)) return false;

  // "Sem responsável" é item da lista, e não um estado à parte: assim ele SOMA com
  // nomes — "as do Cezar e as que ninguém assumiu" é uma pergunta real da fila, e
  // era impossível de fazer quando o campo só aceitava uma resposta.
  if (escolhas.responsible.length > 0) {
    const email = linha.responsibleEmail;
    const casa = email ? escolhas.responsible.includes(email) : escolhas.responsible.includes(NENHUM_RESPONSAVEL);
    if (!casa) return false;
  }
  return true;
}
