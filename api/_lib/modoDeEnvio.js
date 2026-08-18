/**
 * O MODO DE ENVIO — o ensaio antes da primeira entrega.
 *
 * ⚠️ O QUE ISTO **NÃO** É. Não é controle de volume: isso o desenho já resolve
 * sozinho, e melhor. Sede sem nada marcado não recebe nada; resumo vazio não vira
 * e-mail; visita que atende três OS é um item; a checagem manda um e-mail por sede,
 * não por visita. A regra "só dispara quando tem conteúdo" está construída e
 * testada, e é ela que segura o ruído.
 *
 * Isto aqui responde outra pergunta, que nenhum teste responde: **a mensagem
 * chega?** Este sistema tem 213 dead-letters e zero entregas na história. Cai em
 * spam? O remetente aparece como quem? O link abre no celular do coordenador?
 *
 * `?simular=1`, que toda rota já tem, não serve para isso — ele nem chega a
 * enviar. O `sombra` manda pelo caminho REAL (Gmail, remetente, domínio, link) e
 * desvia só o destinatário.
 *
 * Duas configurações, só:
 *
 *   EMAIL_MODO=sombra + EMAIL_SOMBRA_PARA=voce@...  -> tudo vai para você, marcado
 *   EMAIL_MODO ausente ou "aberto"                  -> o normal
 *
 * ⚠️ Havia também `desligado` e `piloto`. Foram removidos por serem cerimônia:
 * `desligado` duplicava o `?simular=1` que já existia nas sete rotas, e `piloto` se
 * faz pelo CADASTRO — os destinatários saem de `siteIds`, então basta uma sede ter
 * coordenador para só ela receber. Menos conceito para lembrar na hora do aperto.
 *
 * Sem I/O: quem lê `process.env` é o chamador.
 */

export const MODO = {
  /** Tudo sai pelo caminho real, mas para uma caixa só. */
  SOMBRA: 'sombra',
  /** O normal. É o padrão. */
  ABERTO: 'aberto',
};

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

export function lerConfiguracao(env = {}) {
  const bruto = String(env.EMAIL_MODO || '').trim().toLowerCase();
  const conhecido = bruto === MODO.SOMBRA || bruto === MODO.ABERTO;
  return {
    /**
     * ⚠️ FALHA FECHADO. Ausente ou digitado errado vira `sombra`, não `aberto`.
     *
     * O padrão era `aberto` e a auditoria (consulta 13) derrubou: para um canal
     * com ZERO entregas na história, variável faltando é ambiente que ninguém
     * preparou — e `sombraa` com um "a" a mais mandaria para gente real. O custo
     * de errar fechado é um e-mail que não chegou e alguém pergunta; errar aberto
     * é a operação inteira recebendo de um sistema que nunca entregou nada.
     */
    modo: conhecido ? bruto : MODO.SOMBRA,
    modoInvalido: bruto !== '' && !conhecido,
    sombraPara: String(env.EMAIL_SOMBRA_PARA || '').trim(),
    /**
     * O interruptor por tipo, que é a peça sem substituto: se a checagem das 30
     * min começar a incomodar as sedes numa terça de manhã, dá para calar SÓ ela
     * pela Vercel, sem deploy e sem parar os outros seis. A alternativa seria
     * reverter commit sob pressão.
     */
    desligados: lista(env.EMAIL_TIPOS_DESLIGADOS),
  };
}

/**
 * O tipo do disparo, deduzido do `ticketId` quando não vem declarado — assim o
 * interruptor alcança os sete sem tocar em sete arquivos.
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
 * O que fazer com este envio. Devolve sempre um MOTIVO: envio que some sem
 * explicação é como se descobre, três semanas depois, que a sede nunca recebeu
 * nada — e é o que transformaria falha de entrega em "a sede não respondeu".
 */
export function decidirEnvio({ para, ticketId = '', tipo = '' }, config) {
  const destino = String(para || '').trim();
  const oTipo = tipoDoEnvio(ticketId, tipo);

  if (!destino) return { acao: ACAO.SUPRIMIR, destino: null, tipo: oTipo, motivo: 'sem destinatário' };

  if (config.desligados.includes(oTipo)) {
    return { acao: ACAO.SUPRIMIR, destino: null, tipo: oTipo, motivo: `tipo "${oTipo}" desligado` };
  }

  if (config.modo === MODO.SOMBRA) {
    if (!config.sombraPara) {
      // Sombra sem caixa configurada não pode virar envio real por omissão: quem
      // pediu ensaio não pode receber estreia por causa de uma variável faltando.
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

  return { acao: ACAO.ENVIAR, destino, tipo: oTipo, motivo: 'modo aberto' };
}

/**
 * O assunto marcado do modo sombra. Diz para quem ERA, no próprio assunto: uma
 * caixa recebendo o tráfego de 16 sedes sem isso vira pilha indistinguível, e o
 * ensaio não prova nada.
 */
export function assuntoDaSombra(assunto, destinoOriginal) {
  return `[SOMBRA -> ${destinoOriginal}] ${String(assunto || '')}`.slice(0, 250);
}
