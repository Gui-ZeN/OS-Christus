/**
 * OS GANHOS QUE NÃO DEPENDEM DO DESENHO GRANDE.
 *
 * A página 10 do plano lista quatro melhorias pequenas e independentes entre si,
 * que aliviam a operação enquanto o resto amadurece. Três delas são COMPOSIÇÃO DE
 * DADO QUE JÁ EXISTE: o sistema escreve, a pessoa não redige. É a mesma lógica da
 * cobrança por WhatsApp.
 *
 * Sem I/O.
 */

/**
 * O DOSSIÊ DA VISITA — uma ficha pronta para copiar.
 *
 * "Local, problema, contato no local, acesso, fotos e as outras OS atendidas na
 * mesma visita." Hoje quem vai à obra remonta isso à mão, abrindo OS por OS.
 */
export function dossieDaVisita({ commitment, tickets = [], vendorContact = null }) {
  const linhas = [];
  const sede = String(commitment?.sede || commitment?.siteId || '').trim();

  linhas.push(`Visita — ${String(commitment?.vendorName || 'Fornecedor')}${sede ? ` · ${sede}` : ''}`);
  if (commitment?.startAtLabel) linhas.push(`Quando: ${commitment.startAtLabel}`);
  if (vendorContact) linhas.push(`Contato do fornecedor: ${vendorContact}`);
  linhas.push('');

  // Uma visita atende VÁRIAS OS — é o corte do plano, e o dossiê é o lugar onde
  // isso vira vantagem em vez de complicação: quem vai à obra leva tudo de uma vez.
  for (const t of tickets) {
    linhas.push(`${t.id} — ${String(t.subject || 'sem assunto')}`);
    const detalhe = [t.location && `Local: ${t.location}`, t.sector && `Setor: ${t.sector}`]
      .filter(Boolean)
      .join(' · ');
    if (detalhe) linhas.push(`  ${detalhe}`);
    if (t.requester) linhas.push(`  Solicitante: ${t.requester}${t.requesterPhone ? ` · ${t.requesterPhone}` : ''}`);
    const fotos = Array.isArray(t.fotos) ? t.fotos.filter(Boolean) : [];
    if (fotos.length > 0) linhas.push(`  Fotos: ${fotos.join(' ')}`);
    linhas.push('');
  }

  return linhas.join('\n').trim();
}

/**
 * AVISO DE DEMANDA REPETIDA — ataca a inflação do backlog na origem.
 *
 * Ao escolher o local, mostra "já existem N demandas abertas aqui" e oferece
 * acompanhar em vez de abrir outra.
 *
 * ⚠️ A decisão de reaproveitar é HUMANA. Isto NÃO bloqueia abertura e não junta OS
 * sozinho: duas demandas no mesmo local podem ser coisas diferentes, e um sistema
 * que decide isso por conta própria esconde trabalho real.
 */
const FECHADAS = new Set(['Encerrada', 'Cancelada']);

export function demandasAbertasNoLocal({ tickets = [], sede, local = '', ignorarId = null }) {
  const alvoSede = String(sede || '').trim().toLowerCase();
  const alvoLocal = String(local || '').trim().toLowerCase();
  if (!alvoSede) return [];

  return tickets
    .filter(t => {
      if (String(t?.id || '') === String(ignorarId || '')) return false;
      if (FECHADAS.has(String(t?.status || ''))) return false;
      if (String(t?.sede || '').trim().toLowerCase() !== alvoSede) return false;
      // Sem local informado, a comparação é só por sede — é o recorte mais grosso
      // que ainda diz algo, e dizer "há 12 OS nesta sede" seria ruído.
      if (!alvoLocal) return true;
      return String(t?.location || '').trim().toLowerCase() === alvoLocal;
    })
    .map(t => ({ id: t.id, assunto: String(t.subject || ''), status: String(t.status || '') }));
}

/**
 * O RECIBO DE CONCLUSÃO — o que o plano chama de maior chance de mudar a relação
 * da equipe com o sistema.
 *
 * "Quando a OS fecha, quem pediu recebe o que foi feito, a foto final, e
 * Está resolvido · O problema continua."
 *
 * ⚠️ "Continua" gera RETORNO LIGADO À MESMA DEMANDA, não OS duplicada — senão o
 * recibo viraria uma fábrica de backlog.
 *
 * ⚠️ E não tem ranking, pontuação nem comparação entre pessoas: o orgulho vem de
 * resultado visível, não de competição. O plano é explícito nisso.
 */
export function reciboDeConclusao({ ticket, antes = [], depois = [] }) {
  const oQueFoiFeito = String(ticket?.resolutionSummary || ticket?.closureNote || '').trim();

  return {
    ordem: String(ticket?.id || ''),
    assunto: String(ticket?.subject || ''),
    oQueFoiFeito: oQueFoiFeito || 'Serviço concluído.',
    // Antes e depois só entram se AMBOS existirem: uma foto sozinha não é
    // comparação, e apresentá-la como tal seria vender o que não se tem.
    temComparacao: antes.length > 0 && depois.length > 0,
    antes,
    depois,
    escolhas: [
      { id: 'resolvido', rotulo: 'Está resolvido' },
      { id: 'continua', rotulo: 'O problema continua' },
    ],
  };
}
