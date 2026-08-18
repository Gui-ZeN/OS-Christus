/**
 * AS SEIS ETAPAS — o vocabulário que a operação usa, no lugar das treze do banco.
 *
 * A esteira tem 13 status. Os dados de produção dizem que ela não descreve a
 * realidade: 163 das 270 OS param no segundo degrau, e quatro status nunca foram
 * usados uma única vez. Treze nomes para descrever um fluxo que a equipe lê em
 * seis é precisão aparente — cada degrau a mais é uma decisão que alguém tem que
 * tomar sem que ela mude o que acontece depois.
 *
 * ⚠️ ISTO É TRADUÇÃO, NÃO MIGRAÇÃO. O banco continua gravando os nomes antigos.
 * Aqui é só a leitura. A ordem importa: se algum dos 34 lugares que comparam
 * status por texto literal escapar, o erro aparece na TELA — visível, corrigível —
 * e não no banco, onde viraria dado torto que ninguém desfaz.
 *
 * A migração dos dados só vale a pena depois que esta camada estiver provada em
 * uso, e ela deixa de ser urgente assim que a tela e os e-mails já falam certo.
 */

export const ETAPA = {
  NOVA: 'Nova OS',
  ANALISE: 'Em análise',
  ORCAMENTO: 'Em orçamento',
  CONTRATACAO: 'Contratação',
  EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/**
 * De onde cada etapa nova vem.
 *
 * ⚠️ "Aguardando pagamento" cai em EXECUÇÃO, não em CONCLUÍDA — e esta é a única
 * escolha aqui que muda comportamento, então fica declarada. O financeiro saiu da
 * lista de etapas por decisão do dono ("Concluída no lugar do financeiro"), mas
 * mapear pagamento para Concluída ENCERRARIA as OS que só esperam dinheiro: elas
 * sairiam da agenda, ganhariam `closedAt` e sumiriam da fila de trabalho enquanto
 * o pagamento ainda não saiu. O serviço acabou; a OS, não.
 *
 * O acompanhamento do dinheiro já tem tela própria (Financeiro), que é onde ele
 * pertence. Trocar de lado é mover uma linha daqui.
 */
const DE_PARA = {
  'Nova OS': ETAPA.NOVA,

  'Aguardando Parecer Técnico': ETAPA.ANALISE,
  'Aguardando Aprovação da Solução': ETAPA.ANALISE,

  'Aguardando Orçamento': ETAPA.ORCAMENTO,
  'Aguardando Aprovação do Orçamento': ETAPA.ORCAMENTO,

  'Aguardando Anexo de Contrato': ETAPA.CONTRATACAO,
  'Aguardando aprovação do contrato': ETAPA.CONTRATACAO,
  'Aguardando Ações Preliminares': ETAPA.CONTRATACAO,

  'Em andamento': ETAPA.EXECUCAO,
  'Aguardando aprovação da manutenção': ETAPA.EXECUCAO,
  'Aguardando pagamento': ETAPA.EXECUCAO,

  Encerrada: ETAPA.CONCLUIDA,
  Cancelada: ETAPA.CANCELADA,
};

function normalizar(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const POR_CHAVE_NORMALIZADA = new Map(
  Object.entries(DE_PARA).map(([antigo, nova]) => [normalizar(antigo), nova])
);

/**
 * A etapa que a pessoa vê, a partir do status gravado.
 *
 * ⚠️ Status desconhecido devolve o PRÓPRIO texto, não um rótulo genérico. Some da
 * tela é pior que aparecer estranho: um valor que ninguém mapeou precisa ser
 * visível para alguém notar, e não virar "Em análise" por engano.
 */
export function etapaDe(status) {
  const bruto = String(status || '').trim();
  if (!bruto) return '';
  return POR_CHAVE_NORMALIZADA.get(normalizar(bruto)) || bruto;
}

/** A etapa é uma das seis conhecidas? Serve para achar o que escapou. */
export function etapaConhecida(status) {
  return POR_CHAVE_NORMALIZADA.has(normalizar(status));
}

/** Ordem de leitura das etapas — do começo ao fim do fluxo. */
export const ORDEM_DAS_ETAPAS = [
  ETAPA.NOVA,
  ETAPA.ANALISE,
  ETAPA.ORCAMENTO,
  ETAPA.CONTRATACAO,
  ETAPA.EXECUCAO,
  ETAPA.CONCLUIDA,
  ETAPA.CANCELADA,
];

/** A OS ainda exige trabalho? Espelha a leitura antiga, agora no vocabulário novo. */
export function etapaEmAberto(status) {
  const etapa = etapaDe(status);
  return etapa !== ETAPA.CONCLUIDA && etapa !== ETAPA.CANCELADA;
}

/**
 * O CAMINHO INVERSO: da etapa para os status que ela absorve.
 *
 * É o que faz o filtro funcionar sem mexer na lógica de filtragem. Escolher
 * "Em análise" na Caixa passa a significar "Parecer Técnico OU Aprovação da
 * Solução" — sem isto, o filtro acharia metade e a pessoa concluiria que a outra
 * metade não existe, que é pior que não ter filtro.
 */
export function statusDaEtapa(etapa) {
  const alvo = normalizar(etapa);
  return Object.entries(DE_PARA)
    .filter(([, nova]) => normalizar(nova) === alvo)
    .map(([antigo]) => antigo);
}

/** As etapas presentes numa lista de OS, na ordem do fluxo, com a contagem. */
export function etapasPresentes(tickets = []) {
  const contagem = new Map();
  for (const t of tickets) {
    const etapa = etapaDe(t?.status);
    if (!etapa) continue;
    contagem.set(etapa, (contagem.get(etapa) || 0) + 1);
  }
  // Ordem do fluxo primeiro; o que a tradução não conhece vai para o fim, visível.
  const conhecidas = ORDEM_DAS_ETAPAS.filter(e => contagem.has(e)).map(e => ({ etapa: e, total: contagem.get(e) }));
  const estranhas = [...contagem.keys()]
    .filter(e => !ORDEM_DAS_ETAPAS.includes(e))
    .map(e => ({ etapa: e, total: contagem.get(e) }));
  return [...conhecidas, ...estranhas];
}

/**
 * O STATUS QUE O BANCO RECEBE quando alguém escolhe uma das seis etapas.
 *
 * Enquanto a migração não acontece, a tela fala em seis e o banco grava treze.
 * Escolher "Em análise" precisa gravar UM valor concreto — e sempre o mesmo, senão
 * duas pessoas escolhendo a mesma etapa produziriam status diferentes e o histórico
 * ficaria impossível de ler.
 *
 * É o PRIMEIRO status de cada grupo, que é o degrau em que a etapa começa. Quem
 * precisa do degrau fino (aprovação da solução, do orçamento) continua tendo o
 * dado no histórico e nos marcos; o que sai é a obrigação de escolher entre dois
 * nomes que a operação lê como um.
 */
const CANONICO = {
  [ETAPA.NOVA]: 'Nova OS',
  [ETAPA.ANALISE]: 'Aguardando Parecer Técnico',
  [ETAPA.ORCAMENTO]: 'Aguardando Orçamento',
  [ETAPA.CONTRATACAO]: 'Aguardando Anexo de Contrato',
  [ETAPA.EXECUCAO]: 'Em andamento',
  [ETAPA.CONCLUIDA]: 'Encerrada',
  [ETAPA.CANCELADA]: 'Cancelada',
};

export function statusCanonicoDaEtapa(etapa) {
  const alvo = normalizar(etapa);
  const achado = Object.entries(CANONICO).find(([nome]) => normalizar(nome) === alvo);
  // Etapa desconhecida devolve null: gravar um palpite seria pior que recusar.
  return achado ? achado[1] : null;
}
