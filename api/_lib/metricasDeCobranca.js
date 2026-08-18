import { cobrancasConcluidas } from './cobranca.js';

/**
 * A LINHA DE BASE DA COBRANÇA, MEDIDA PELO SISTEMA — no lugar da semana de papel.
 *
 * O plano pedia cinco dias de anotação à mão: quantas cobranças por dia, em
 * quantas o fornecedor não atende, quanto tempo até conseguir nova data. O dono
 * cortou, e com razão: o botão Cobrar já grava exatamente esses campos. Pedir para
 * alguém anotar num papel o que o sistema registra sozinho é cobrar duas vezes
 * pelo mesmo trabalho — e a segunda cobrança é a que ninguém cumpre até sexta.
 *
 * ⚠️ O QUE O SISTEMA NÃO MEDE, E O PAPEL MEDIRIA: a cobrança que acontece FORA
 * dele. Ligação feita do celular, conversa no corredor, "passa lá e vê". Enquanto o
 * botão não for o caminho normal, o número aqui é piso, não total — e ler como
 * total faria a operação parecer mais leve do que é.
 *
 * A saída para isso não é papel: é ligar o registro ANTES dos e-mails da sede
 * (`EMAIL_TIPOS_DESLIGADOS=agenda-sede,checagem`). A operação segue como hoje,
 * cobrando por telefone, mas cada cobrança fica registrada. Duas semanas assim são
 * a linha de base — e nenhuma delas custa uma folha. (A gestora marca a falta
 * direto na tela Hoje, então desligar a checagem não trava o botão Cobrar.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A COORTE É A VISITA. Esta é a decisão que estrutura o módulo inteiro.
 *
 * A primeira versão contava visitas por `startAt` e cobranças por `cobranca.em`.
 * Parecia inofensivo e não era: uma visita de 31/julho cobrada em 1º de agosto
 * dava, no recorte de agosto, "1 visita, 1 cobrança, 100 por 100" — e a cobrança
 * não era daquela visita. Numerador e denominador de conjuntos diferentes produzem
 * uma taxa que não é taxa de nada.
 *
 * Agora tudo pende da visita: entram as visitas do período, e as cobranças DELAS,
 * tenham sido feitas quando tiverem. A pergunta que o quadro responde passa a ser
 * "das visitas deste período, quantas deram trabalho de cobrança e como acabou" —
 * que é a pergunta da linha de base.
 *
 * O preço, e ele é real: visita do fim do período pode ainda não ter sido cobrada,
 * então o recorte mais recente subestima. Por isso `semDesfecho` sai junto e a tela
 * é obrigada a mostrar.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sem I/O.
 */

/**
 * ⚠️ `_seconds` COM SUBLINHADO, e não só `seconds`.
 *
 * As cobranças chegam ao navegador dentro do compromisso, e o serializador da API
 * copia o campo cru: um Timestamp do Firestore atravessa o JSON como
 * `{_seconds, _nanoseconds}` — o `toJSON()` da biblioteca usa o nome privado.
 * Sem esta linha toda data de cobrança viraria `null`, cairia fora do período, e o
 * painel mostraria zero cobrança tendo visitas — que é exatamente o número
 * plausível e falso que este módulo existe para não produzir.
 *
 * Os nanossegundos entram na conta. Descartá-los joga o instante para trás do
 * segundo cheio, e um registro em 00:00:00.900 com o período abrindo em
 * 00:00:00.500 cairia fora por causa do arredondamento, não do calendário.
 */
function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor.toDate === 'function') return valor.toDate();
  const seg = typeof valor.seconds === 'number' ? valor.seconds : valor._seconds;
  if (typeof seg === 'number') {
    const nano = typeof valor.nanoseconds === 'number' ? valor.nanoseconds : valor._nanoseconds;
    return new Date(seg * 1000 + Math.floor((typeof nano === 'number' ? nano : 0) / 1e6));
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dentroDoPeriodo(data, de, ate) {
  if (!data) return false;
  return data.getTime() >= de.getTime() && data.getTime() <= ate.getTime();
}

const texto = valor => String(valor ?? '').trim();

/** Estados que representam uma visita que de fato existiu na agenda. */
const NAO_ACONTECEU = new Set(['cancelado', 'cancelada']);

/**
 * Os números que a folha de papel queria, de um período.
 *
 * ⚠️ Tudo em TAXA, além do total. O volume de OS muda de mês para mês, e comparar
 * totais faz o indicador mentir sozinho: um mês com metade das visitas tem metade
 * das cobranças sem nada ter melhorado.
 *
 * E toda taxa sai acompanhada dos dois números que a formaram. Porcentagem sozinha
 * esconde o tamanho da amostra, e "50%" de duas cobranças não é o mesmo fato que
 * "50%" de duzentas.
 */
export function metricasDeCobranca({ commitments = [], de, ate, ticketIds = null, porEmail = null }) {
  const inicio = paraData(de) || new Date(0);
  const fim = paraData(ate) || new Date();

  /**
   * PERÍODO SEM COBERTURA não é período vazio.
   *
   * A tela recorta o período escolhido contra a janela de dados que existe. Escolher
   * janeiro em agosto produzia `de` depois de `ate` — um intervalo impossível, que
   * atravessava tudo devolvendo zero com cara de resultado, ainda por cima rotulado
   * "só temos de 19/07 a 31/01". Agora ele se declara.
   */
  if (inicio.getTime() > fim.getTime()) {
    return { ...VAZIO, semCobertura: true };
  }

  /**
   * O recorte de território vem de FORA, como lista de OS.
   *
   * Uma visita atende várias OS da mesma sede, então basta uma delas estar no
   * recorte. E `null` quer dizer "sem filtro" — diferente de lista vazia, que quer
   * dizer "nada passou". Confundir os dois faria o quadro esvaziar sozinho quando a
   * tela ainda não carregou as OS.
   */
  const permitidos = ticketIds === null ? null : new Set(ticketIds);
  const noRecorte = c =>
    permitidos === null || (Array.isArray(c?.ticketIds) ? c.ticketIds : []).some(id => permitidos.has(id));

  const autor = texto(porEmail);
  // Compara sempre normalizado dos DOIS lados: o seletor da tela oferece o valor
  // aparado, e comparar contra o cru fazia um espaço sobrando no cadastro devolver
  // zero sem erro nenhum.
  const doAutor = cob => !autor || texto(cob?.por) === autor;

  /**
   * A COORTE: as visitas do período. Cancelada não entra — ela não aconteceu, e
   * contá-la engorda o denominador de todas as taxas com trabalho que não houve.
   */
  const visitasDoPeriodo = (commitments || [])
    .filter(noRecorte)
    .filter(c => !NAO_ACONTECEU.has(texto(c?.state)))
    .filter(c => dentroDoPeriodo(paraData(c?.startAt), inicio, fim));

  const cobrancasDaCoorte = visitasDoPeriodo.flatMap(c =>
    (Array.isArray(c?.cobrancas) ? c.cobrancas : [])
      .filter(doAutor)
      .map(cob => ({ ...cob, em: paraData(cob?.em), visita: c }))
  );

  const classificados = visitasDoPeriodo.flatMap(c =>
    cobrancasConcluidas(c)
      .filter(doAutor)
      .map(cob => ({ ...cob, em: paraData(cob.em), desfechoEm: paraData(cob.desfechoEm), visita: c }))
  );

  const contaDesfecho = alvo => classificados.filter(c => texto(c.desfecho) === alvo).length;
  const responderam = contaDesfecho('respondeu');
  const novasDatas = contaDesfecho('nova-data');
  const naoResponderam = contaDesfecho('nao-respondeu');
  /**
   * Desfecho fora dos três conhecidos ficava somado em "não respondeu", porque a
   * conta era por subtração. Um valor novo no enum viraria 100% de silêncio do
   * fornecedor sem ninguém ter mudado o cálculo.
   */
  const desconhecidos = classificados.length - responderam - novasDatas - naoResponderam;

  // Tempo entre acionar o link e registrar o desfecho. Não é "tempo de telefone" —
  // é quanto o assunto fica aberto na cabeça de quem cobra, que é o custo real.
  const esperas = classificados
    .map(c => (c.desfechoEm && c.em ? c.desfechoEm.getTime() - c.em.getTime() : null))
    .filter(ms => ms !== null && ms >= 0)
    .sort((a, b) => a - b);
  // Com quantidade PAR, a mediana é a média dos dois centrais. Pegar o de cima
  // devolvia 180 para [60, 180] — sempre para o lado que faz a operação parecer pior.
  const medianaEmMinutos =
    esperas.length === 0
      ? null
      : Math.round(
          (esperas.length % 2
            ? esperas[(esperas.length - 1) / 2]
            : (esperas[esperas.length / 2 - 1] + esperas[esperas.length / 2]) / 2) / 60_000
        );

  const faltas = visitasDoPeriodo.filter(c => texto(c?.state) === 'faltou').length;
  const segundasTentativas = visitasDoPeriodo.filter(
    c => (Array.isArray(c?.cobrancas) ? c.cobrancas : []).filter(doAutor).length > 1
  ).length;

  const taxa = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : null);

  return {
    semCobertura: false,
    visitas: visitasDoPeriodo.length,
    faltas,

    /**
     * ACIONAMENTOS e CLASSIFICADOS, com nomes que dizem o que cada um prova.
     *
     * O servidor grava o acionamento ANTES do `window.open`, e o navegador pode
     * bloquear o popup: o dado prova que o link foi tocado, nem que a conversa
     * abriu. Só o desfecho prova que alguém cobrou de verdade.
     *
     * Antes os dois se chamavam "cobranças" em lugares diferentes da tela — o cartão
     * mostrava os classificados e a taxa dividia os acionamentos, e os dois números
     * apareciam lado a lado sem bater. Nome separado é o que impede isso de voltar.
     */
    acionamentos: cobrancasDaCoorte.length,
    classificados: classificados.length,
    semDesfecho: cobrancasDaCoorte.length - classificados.length,

    responderam,
    naoResponderam,
    novasDatas,
    desfechosDesconhecidos: desconhecidos,
    segundasTentativas,

    // As taxas, que é como se compara mês contra mês.
    /**
     * ⚠️ `null` QUANDO SE FILTRA POR PESSOA, e não o número dividido mesmo assim.
     *
     * A visita não tem dono: ninguém "recebe" a falta do fornecedor. Dividir os
     * acionamentos de uma pessoa por TODAS as visitas do recorte produziria um número
     * que parece produtividade individual e não é — quanto mais gente cobrando, pior
     * o número de cada uma. É a conta que transforma um indicador de operação em
     * ranking de funcionário sem ninguém ter decidido isso.
     */
    acionamentosPorCemVisitas: autor
      ? null
      : visitasDoPeriodo.length > 0
        ? Math.round((cobrancasDaCoorte.length / visitasDoPeriodo.length) * 100)
        : null,

    /**
     * As porcentagens de desfecho olham só os CLASSIFICADOS — e é por isso que
     * `percentualClassificado` sai junto e a tela é obrigada a mostrar.
     *
     * Dez acionamentos, um respondido e nove sem desfecho davam "0% sem resposta":
     * uma gestora leria "ninguém deixou de responder" com noventa por cento
     * desconhecidos. A porcentagem não estava errada; estava respondendo sobre uma
     * amostra que ninguém via.
     */
    percentualSemResposta: taxa(naoResponderam, classificados.length),
    percentualComNovaData: taxa(novasDatas, classificados.length),
    percentualClassificado: taxa(classificados.length, cobrancasDaCoorte.length),

    medianaAteODesfechoEmMinutos: medianaEmMinutos,
    medianaSobre: esperas.length,

    /**
     * Quem aparece cobrando no recorte — para a tela montar o seletor com o que
     * existe, em vez de listar a equipe inteira e oferecer nomes que voltam vazios.
     * Ignora o filtro de pessoa, senão a lista encolheria para o próprio escolhido e
     * não haveria como voltar.
     */
    quemCobrou: [
      ...new Set(
        visitasDoPeriodo
          .flatMap(c => (Array.isArray(c?.cobrancas) ? c.cobrancas : []))
          .map(cob => texto(cob?.por))
          .filter(Boolean)
      ),
    ].sort(),
  };
}

/** O que sai quando não há período para medir. Zero nenhum, para não parecer conta. */
const VAZIO = {
  semCobertura: false,
  visitas: 0,
  faltas: 0,
  acionamentos: 0,
  classificados: 0,
  semDesfecho: 0,
  responderam: 0,
  naoResponderam: 0,
  novasDatas: 0,
  desfechosDesconhecidos: 0,
  segundasTentativas: 0,
  acionamentosPorCemVisitas: null,
  percentualSemResposta: null,
  percentualComNovaData: null,
  percentualClassificado: null,
  medianaAteODesfechoEmMinutos: null,
  medianaSobre: 0,
  quemCobrou: [],
};
