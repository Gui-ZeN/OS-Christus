/**
 * A COBRANÇA — o botão que sai do sistema.
 *
 * Fornecedor não responde e-mail; a conversa dele já acontece no WhatsApp. O
 * sistema não muda o canal, só para de exigir que alguém digite tudo de novo: ele
 * escreve a mensagem, a pessoa manda.
 *
 * ⚠️ A AUDITORIA MATOU A PRIMEIRA VERSÃO DISTO, e a razão dita o desenho. Com
 * "Registrar cobrança" como ação principal, dava para gravar a cobrança ANTES de
 * cobrar: registra, abre o WhatsApp, é interrompido — e o sistema contabilizava
 * atuação que não houve, contaminando justamente a métrica que existe para
 * PROTEGER quem cobrou.
 *
 * Por isso: `Cobrar` grava sozinho a TENTATIVA e abre a conversa. O desfecho fica
 * pendente. **Clique não conta como cobrança concluída** — só o desfecho conta.
 *
 * ⚠️ E o nome do evento diz o que ele PROVA. A auditoria (consulta 12) apontou que
 * "tentativa de contato" afirma demais: o sistema não sabe se a mensagem foi
 * enviada, só que a conversa foi ABERTA. O evento é `whatsappAberto`; "cobrou" só
 * existe depois que alguém registra o desfecho.
 *
 * Sem I/O.
 */

/** O que aconteceu depois da tentativa. Enquanto for null, a cobrança está pendente. */
export const DESFECHO = {
  RESPONDEU: 'respondeu',
  NAO_RESPONDEU: 'nao-respondeu',
  NOVA_DATA: 'nova-data',
};

export const DESFECHO_LABEL = {
  respondeu: 'Respondeu',
  'nao-respondeu': 'Não respondeu',
  'nova-data': 'Marcou nova data',
};

/**
 * O telefone utilizável dentro de um cadastro que é TEXTO LIVRE.
 *
 * O cadastro real tem coisas como "falar com o João 99999-8888" — sem DDD, e o
 * link não monta. Devolver null aqui é o que faz o botão aparecer apagado em vez
 * de abrir uma conversa com número errado: cobra-se como se cobra hoje, e nada
 * trava.
 *
 * Procura um TRECHO com cara de telefone, em vez de juntar todos os dígitos do
 * texto — senão "Rua 5, casa 12 — (85) 99999-8888" viraria um número inventado.
 */
export function telefoneUtilizavel(contato) {
  const texto = String(contato || '');
  const candidatos = texto.match(/(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g) || [];

  for (const bruto of candidatos) {
    let digitos = bruto.replace(/\D/g, '');
    // Tira o código do país quando ele veio junto, para validar sempre o mesmo formato.
    if (digitos.length > 11 && digitos.startsWith('55')) digitos = digitos.slice(2);
    // 10 = fixo com DDD, 11 = celular com DDD. Menos que isso é número sem DDD.
    if (digitos.length !== 10 && digitos.length !== 11) continue;
    // DDD brasileiro começa em 11.
    if (Number(digitos.slice(0, 2)) < 11) continue;
    return `55${digitos}`;
  }
  return null;
}

/**
 * A mensagem que o sistema escreve. É composição de dado que já existe — a pessoa
 * não redige, e por isso a cobrança sai igual mesmo quando quem cobra está com
 * pressa ou é outra pessoa.
 */
export function mensagemDeCobranca({
  quemCobra = '',
  organizacao = 'Grupo Christus',
  ordens = [],
  servico = '',
  local = '',
  quando = '',
  segundaTentativa = false,
} = {}) {
  const abertura = quemCobra ? `Olá, aqui é ${quemCobra} do ${organizacao}.` : `Olá, aqui é do ${organizacao}.`;
  const referencia = ordens.length > 0 ? `Sobre a ${ordens.join(', ')}` : 'Sobre um serviço';
  const oQue = [servico, local].filter(Boolean).join(' — ');
  const fato = quando
    ? `Estava marcado para ${quando} e a equipe não compareceu.`
    : 'A equipe não compareceu na data combinada.';
  const pedido = segundaTentativa
    ? 'Já tentamos contato antes. Consegue confirmar uma nova data?'
    : 'Consegue confirmar uma nova data?';

  return [abertura, `${referencia}${oQue ? ` — ${oQue}` : ''}.`, fato, pedido].join(' ');
}

/** O link que abre a conversa já escrita. Sem telefone utilizável, não há link. */
export function linkDaConversa(contato, mensagem) {
  const telefone = telefoneUtilizavel(contato);
  if (!telefone) return null;
  return `https://wa.me/${telefone}?text=${encodeURIComponent(String(mensagem || ''))}`;
}

/** Pode registrar uma tentativa agora? */
export function podeCobrar(commitment) {
  // Só se cobra falta CONFIRMADA. Cobrar quem talvez tenha ido é o erro que o
  // sistema inteiro foi desenhado para não cometer.
  return String(commitment?.state || '') === 'faltou';
}

/** Quantas vezes a conversa já foi aberta, para a mensagem saber que é a segunda. */
export function tentativasDe(commitment) {
  return Array.isArray(commitment?.cobrancas) ? commitment.cobrancas.length : 0;
}

/** A tentativa mais recente que ainda não tem desfecho, ou null. */
export function cobrancaPendente(commitment) {
  const lista = Array.isArray(commitment?.cobrancas) ? commitment.cobrancas : [];
  for (let i = lista.length - 1; i >= 0; i -= 1) {
    if (!lista[i]?.desfecho) return { indice: i, cobranca: lista[i] };
  }
  return null;
}

/**
 * A cobrança CONCLUÍDA — a única que conta como atuação.
 *
 * Tentativa sem desfecho não entra: era exatamente a contagem inflada que a
 * auditoria pegou. "Abriu o WhatsApp" não é "cobrou".
 */
export function cobrancasConcluidas(commitment) {
  const lista = Array.isArray(commitment?.cobrancas) ? commitment.cobrancas : [];
  return lista.filter(c => Boolean(c?.desfecho));
}

/**
 * O mesmo acionamento chegando duas vezes — clique duplo ou retry da rede.
 *
 * ⚠️ POR JANELA DE TEMPO, e não "existe pendente".
 *
 * Bloquear todo acionamento enquanto houver um sem desfecho matava o caso legítimo:
 * cobrar de novo na quarta porque a segunda não teve resposta é uma segunda
 * tentativa de verdade, e some do registro justamente o retrabalho que mais cansa.
 * O que precisa morrer é a repetição de segundos, que grava dois e deixa um pendente
 * para sempre — puxando para baixo a taxa de classificados que o painel destaca.
 */
export const JANELA_DE_REPETICAO_EM_MINUTOS = 10;

export function ehRepeticaoImediata(commitment, agora = new Date(), minutos = JANELA_DE_REPETICAO_EM_MINUTOS) {
  const pendente = cobrancaPendente(commitment);
  if (!pendente) return false;
  const em = pendente.cobranca?.em;
  const quando = em instanceof Date ? em : em && typeof em.toDate === 'function' ? em.toDate() : null;
  // Pendente sem hora é dado antigo: não dá para saber se é repetição, e recusar
  // por precaução apagaria uma cobrança real.
  if (!quando || Number.isNaN(quando.getTime())) return false;
  return agora.getTime() - quando.getTime() < minutos * 60 * 1000;
}

/** O tipo do evento gravado quando alguém toca em Cobrar. Diz o que prova. */
// O servidor grava ANTES do `window.open`, e o navegador pode bloquear o popup.
// O dado prova que o link foi acionado — nem sequer que a conversa abriu.
export const EVENTO_DE_CONTATO = 'whatsappLinkAcionado';

export function validarDesfecho(commitment, desfecho) {
  if (!Object.values(DESFECHO).includes(String(desfecho || ''))) {
    return { ok: false, error: 'Desfecho desconhecido.' };
  }
  const pendente = cobrancaPendente(commitment);
  if (!pendente) return { ok: false, error: 'Não há cobrança pendente de desfecho.' };
  return { ok: true, indice: pendente.indice };
}
