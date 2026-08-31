/**
 * O QUE DO HISTÓRICO PODE SAIR DA ORGANIZAÇÃO.
 *
 * A regra nasceu para a página `?tracking=TOKEN` — o solicitante lendo a própria OS
 * sem login — e morava dentro de `api/tickets.js`. Saiu daqui porque chegou a ganhar
 * um segundo leitor, o PDF do estado de uma OS — removido depois, mas o motivo de
 * ter uma regra só continua valendo: duas cópias da mesma decisão divergem em
 * silêncio, e esta decide o que vaza.
 *
 * ⚠️ O CORTE É POR OPT-IN NO QUE O SISTEMA ESCREVE e por marcador de texto no resto.
 * `visibility` não existia no começo do projeto, então histórico antigo simplesmente
 * não tem o campo — coagir o ausente para "público" abriria a base inteira, e coagir
 * para "interno" esvaziaria a conversa das OS mais antigas.
 */

function normalizeHistoryText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const PUBLIC_HISTORY_SYSTEM_MARKERS = [
  'solicitacao registrada via formulario publico',
  'status atualizado de',
  'triagem concluida',
  'parecer consolidado e enviado para aprovacao da diretoria',
  'solucao tecnica aprovada',
  'orcamentos consolidados e enviados para aprovacao da diretoria',
  'orcamento aprovado',
  'contrato anexado pelo gestor',
  'contrato aprovado pela diretoria',
  'acoes preliminares concluidas',
  'execucao iniciada',
  'inicio da execucao',
  'execucao concluida',
  'os encerrada',
  'os cancelada',
];

const PUBLIC_HISTORY_SENSITIVE_MARKERS = [
  'orcamento',
  'contrato',
  'aditivo',
  'pagamento',
  'parcela',
  'r$',
];

const PUBLIC_HISTORY_INTERNAL_MARKERS = [
  'parecer consolidado e enviado para aprovacao da diretoria',
  'painel da os atualizado',
];

/**
 * O texto que sobra depois de tirar o que e ESTRUTURA.
 *
 * ⚠️ POR QUE NAO BASTA PROCURAR "orcamento" NA FRASE INTEIRA.
 *
 * Palavra sensivel aparece legitimamente em dois lugares que NAO sao vazamento:
 *  · no proprio marcador publico ("orcamento aprovado", "contrato anexado pelo
 *    gestor") — sao os avisos que o solicitante PRECISA receber;
 *  · no nome da etapa, que o servidor escreve entre aspas ("Aguardando Orcamento").
 *
 * O que vaza e o texto LIVRE colado ao lado — o motivo digitado na transicao, onde
 * cabe "aprovado o orcamento de R$ 12.480". Entao a busca por sensivel acontece no
 * que sobra depois de remover marcador e nome de etapa.
 */
function trechoLivre(normalizedText, marcadoresCasados) {
  let resto = normalizedText;
  for (const marcador of marcadoresCasados) resto = resto.split(marcador).join(' ');
  // Nome de etapa vem entre aspas na entrada que o servidor escreve.
  return resto.replace(/"[^"]*"/g, ' ').replace(/[“”][^“”]*[“”]/g, ' ');
}

/**
 * Tem marcador publico E o texto livre em volta esta limpo?
 *
 * ⚠️ O DEFEITO QUE ISTO CONSERTA: o marcador devolvia `true` na hora, ANTES de olhar
 * os marcadores sensiveis. Bastava a frase conter "status atualizado de" ou "triagem
 * concluida" para o resto sair junto, valor e tudo.
 *
 * E era alcancavel sem malicia: a Caixa de Entrada grava o aceite como
 * "Triagem concluida. ... Motivo da transicao: <texto digitado>" e SEM campo
 * `visibility` — entao um valor escrito no motivo ia para a pagina publica do
 * solicitante. Com o PDF do estado da OS ganhou um segundo caminho, e esse e um
 * arquivo: circula por e-mail e e impresso.
 */
function temMarcadorPublicoLimpo(normalizedText) {
  const casados = PUBLIC_HISTORY_SYSTEM_MARKERS.filter(marcador => normalizedText.includes(marcador));
  if (!casados.length) return false;
  const resto = trechoLivre(normalizedText, casados);
  return !PUBLIC_HISTORY_SENSITIVE_MARKERS.some(marcador => resto.includes(marcador));
}

export function isPublicTrackingHistoryEntry(item) {
  if (!item || typeof item !== 'object') return false;
  const text = String(item.text || '').trim();
  if (!text) return false;

  const type = String(item.type || '').trim().toLowerCase();
  const visibility = String(item.visibility || '').trim().toLowerCase();
  if (type === 'customer') return true;
  if (type === 'tech') {
    if (visibility === 'internal') return false;

    const normalizedText = normalizeHistoryText(text);
    if (temMarcadorPublicoLimpo(normalizedText)) return true;

    if (visibility === 'public') return true;
    const hasSensitiveMarker = PUBLIC_HISTORY_SENSITIVE_MARKERS.some(marker => normalizedText.includes(marker));
    const hasInternalMarker = PUBLIC_HISTORY_INTERNAL_MARKERS.some(marker => normalizedText.includes(marker));
    return !hasSensitiveMarker && !hasInternalMarker;
  }
  if (type !== 'system') return false;
  if (visibility === 'internal') return false;
  if (visibility === 'public') return true;

  return temMarcadorPublicoLimpo(normalizeHistoryText(text));
}
