/**
 * O MODO DE ENVIO — o interruptor do deploy escuro.
 *
 * ⚠️ POR QUE ISTO EXISTE. Sete e-mails e duas páginas foram construídos sobre um
 * canal que NUNCA entregou uma mensagem: 213 documentos na fila, 100% em
 * dead-letter, zero enviados. A auditoria (consulta 12) foi direta: subir tudo de
 * uma vez significa descobrir autenticação, domínio, spam e link quebrado com
 * usuário real na frente — e, pior, interpretar falha de entrega como silêncio da
 * sede, que é justamente o sinal que o sistema inteiro existe para ler.
 *
 * A saída não é "lançar pela metade". É subir o código inteiro com a torneira
 * fechada, e abrir por etapa:
 *
 *   desligado -> nada sai. O sistema calcula tudo e registra o que TERIA mandado.
 *   sombra    -> tudo sai, mas para UMA caixa de teste, com o assunto marcado.
 *   piloto    -> só para as pessoas e sedes declaradas. O resto é suprimido.
 *   aberto    -> o normal.
 *
 * As três primeiras produzem evidência sem produzir dano. Nenhuma exige mudar
 * código: é variável de ambiente, então voltar atrás é um toque na Vercel, não um
 * redeploy com pressa.
 *
 * ⚠️ O PADRÃO É `sombra`, DE PROPÓSITO. Ambiente sem a variável configurada é
 * ambiente que ninguém preparou — e o custo de errar para o lado seguro é um
 * e-mail que não chegou; para o outro lado, é a operação inteira recebendo
 * mensagem de um sistema que nunca entregou nada.
 *
 * Sem I/O: quem lê `process.env` é o chamador.
 */

export const MODO = {
  DESLIGADO: 'desligado',
  SOMBRA: 'sombra',
  PILOTO: 'piloto',
  ABERTO: 'aberto',
};

const MODOS_VALIDOS = new Set(Object.values(MODO));

export const ACAO = {
  ENVIAR: 'enviar',
  DESVIAR: 'desviar',
  SUPRIMIR: 'suprimir',
};

function lista(valor) {
  return String(valor || '')
    .split(/[,;\s]+/)
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

/** Lê a configuração do ambiente. Modo desconhecido cai em `sombra`, não em `aberto`. */
export function lerConfiguracao(env = {}) {
  const bruto = String(env.EMAIL_MODO || '').trim().toLowerCase();
  return {
    modo: MODOS_VALIDOS.has(bruto) ? bruto : MODO.SOMBRA,
    // Modo desconhecido é erro de digitação, e erro de digitação não pode abrir a
    // torneira. Fica registrado para aparecer no diagnóstico.
    modoInvalido: bruto !== '' && !MODOS_VALIDOS.has(bruto),
    sombraPara: String(env.EMAIL_SOMBRA_PARA || '').trim(),
    pessoas: lista(env.EMAIL_PILOTO_PESSOAS),
    sedes: lista(env.EMAIL_PILOTO_SEDES),
    // Interruptor por tipo, que vale em QUALQUER modo: serve para desligar um
    // disparo que está se comportando mal sem derrubar os outros seis.
    desligados: lista(env.EMAIL_TIPOS_DESLIGADOS),
  };
}

/**
 * O tipo do disparo, deduzido do `ticketId` quando não vem declarado.
 *
 * Existe para o interruptor alcançar os sete disparos sem tocar em sete arquivos —
 * o pedido era um toggle, não um refactor.
 */
export function tipoDoEnvio(ticketId, tipoDeclarado = '') {
  const declarado = String(tipoDeclarado || '').trim().toLowerCase();
  if (declarado) return declarado;

  const id = String(ticketId || '').toLowerCase();
  if (id.startsWith('agenda-sede')) return 'agenda-sede';
  if (id.startsWith('checagem')) return 'checagem';
  if (id.startsWith('falta')) return 'falta';
  if (id.startsWith('resumo-')) return id.slice(0, 30);
  if (id.startsWith('revisao-semanal')) return 'revisao-semanal';
  if (id.startsWith('aviso-chuva')) return 'aviso-chuva';
  return 'os';
}

/**
 * O que fazer com este envio.
 *
 * Devolve sempre um MOTIVO. Envio que some sem explicação é como se descobre, três
 * semanas depois, que a sede nunca recebeu nada — e é o que transformaria falha de
 * entrega em "a sede não respondeu".
 */
export function decidirEnvio({ para, ticketId = '', tipo = '', sede = '' }, config) {
  const destino = String(para || '').trim();
  const oTipo = tipoDoEnvio(ticketId, tipo);

  if (!destino) return { acao: ACAO.SUPRIMIR, destino: null, tipo: oTipo, motivo: 'sem destinatário' };

  if (config.desligados.includes(oTipo)) {
    return { acao: ACAO.SUPRIMIR, destino: null, tipo: oTipo, motivo: `tipo "${oTipo}" desligado` };
  }

  switch (config.modo) {
    case MODO.ABERTO:
      return { acao: ACAO.ENVIAR, destino, tipo: oTipo, motivo: 'modo aberto' };

    case MODO.DESLIGADO:
      return { acao: ACAO.SUPRIMIR, destino: null, tipo: oTipo, motivo: 'envio desligado' };

    case MODO.PILOTO: {
      const pessoaLiberada = config.pessoas.includes(destino.toLowerCase());
      const sedeLiberada = sede && config.sedes.includes(String(sede).toLowerCase());
      if (pessoaLiberada || sedeLiberada) {
        return { acao: ACAO.ENVIAR, destino, tipo: oTipo, motivo: 'no piloto' };
      }
      return { acao: ACAO.SUPRIMIR, destino: null, tipo: oTipo, motivo: 'fora do piloto' };
    }

    case MODO.SOMBRA:
    default:
      if (!config.sombraPara) {
        // Sombra sem caixa configurada não pode virar envio real por omissão.
        return { acao: ACAO.SUPRIMIR, destino: null, tipo: oTipo, motivo: 'sombra sem EMAIL_SOMBRA_PARA' };
      }
      return {
        acao: ACAO.DESVIAR,
        destino: config.sombraPara,
        tipo: oTipo,
        motivo: `sombra (era para ${destino})`,
        destinoOriginal: destino,
      };
  }
}

/**
 * O assunto marcado do modo sombra.
 *
 * Diz para quem ERA, no próprio assunto: uma caixa recebendo o tráfego de 16 sedes
 * sem isso vira uma pilha indistinguível, e o teste não prova nada.
 */
export function assuntoDaSombra(assunto, destinoOriginal) {
  return `[SOMBRA -> ${destinoOriginal}] ${String(assunto || '')}`.slice(0, 250);
}
