/**
 * A AGENDA DAS 07h — o que está marcado hoje, na sede de quem recebe.
 *
 * O risco maior deste desenho não é faltar aviso: é SOBRAR. Com ~31 compromissos
 * por dia em ~16 sedes, um alerta por evento passaria de 80 e-mails diários e
 * viraria ruído em poucas semanas — e aí o sensor todo para de funcionar. Por isso
 * cada regra aqui existe para NÃO mandar e-mail:
 *
 *  - sede sem nada marcado hoje não recebe nada (e-mail que vira rotina diária é
 *    arquivado sem ler em duas semanas);
 *  - uma visita que atende três OS é UM item, não três;
 *  - só quem tem a sede no escopo recebe — gestor tem o digest dele, e disparar
 *    para a sede e para o gestor juntos disfarça de quem é a bola.
 *
 * Sem I/O: quem busca no banco e envia é a rota.
 */

/** Estados em que a visita ainda espera resposta da sede. */
const AINDA_ABERTOS = new Set(['agendado', 'sem-confirmacao']);

/** O dia civil em Fortaleza — não o do servidor, que roda em UTC. */
export function diaEmFortaleza(data) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
}

export function horaEmFortaleza(data) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

/**
 * É um coordenador desta sede?
 *
 * `siteIds` EXPLÍCITO é o corte. Quem tem escopo por região enxerga várias sedes —
 * mandar a agenda de cada uma delas devolveria o mesmo excesso que a regra acima
 * evita, e essa pessoa já recebe o resumo da operação.
 */
export function ehCoordenadorDaSede(user, siteId) {
  if (!user || String(user.status || 'Ativo') !== 'Ativo') return false;
  if (!String(user.email || '').trim()) return false;
  const escopo = Array.isArray(user.siteIds) ? user.siteIds.map(v => String(v || '').trim()).filter(Boolean) : [];
  return escopo.includes(String(siteId || '').trim());
}

/**
 * Monta a agenda por sede.
 *
 * Devolve SÓ sedes que têm item hoje e destinatário para receber. Sede com visita
 * e sem coordenador cadastrado aparece em `semDestinatario` em vez de sumir — é
 * falha de cadastro, e sumir em silêncio é como uma sede fica meses sem ninguém
 * confirmando nada.
 */
export function montarAgendaDoDia({ commitments = [], users = [], now = new Date() }) {
  const hoje = diaEmFortaleza(now);

  const doDia = commitments.filter(c => {
    if (!AINDA_ABERTOS.has(String(c?.state || ''))) return false;
    const inicio = c?.startAt instanceof Date ? c.startAt : new Date(c?.startAt || NaN);
    if (Number.isNaN(inicio.getTime())) return false;
    return diaEmFortaleza(inicio) === hoje;
  });

  const porSede = new Map();
  for (const c of doDia) {
    const siteId = String(c.siteId || c.sede || '').trim();
    if (!siteId) continue;
    if (!porSede.has(siteId)) porSede.set(siteId, []);
    porSede.get(siteId).push(c);
  }

  const sedes = [];
  const semDestinatario = [];

  for (const [siteId, lista] of porSede) {
    lista.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const destinatarios = users.filter(u => ehCoordenadorDaSede(u, siteId));

    const visitas = lista.map(c => ({
      commitmentId: c.id,
      hora: horaEmFortaleza(c.startAt instanceof Date ? c.startAt : new Date(c.startAt)),
      // A data crua também: o convite de calendário precisa do instante, não do
      // rótulo em pt-BR.
      startAt: c.startAt instanceof Date ? c.startAt : new Date(c.startAt),
      fornecedor: String(c.vendorName || 'Fornecedor'),
      // Uma visita que atende três OS é UM item — é este corte que segura o volume.
      ordens: Array.isArray(c.ticketIds) ? c.ticketIds.map(String) : [],
    }));

    if (destinatarios.length === 0) {
      semDestinatario.push({ siteId, sede: lista[0]?.sede || siteId, visitas: visitas.length });
      continue;
    }

    sedes.push({ siteId, sede: lista[0]?.sede || siteId, destinatarios, visitas });
  }

  return { dia: hoje, sedes, semDestinatario };
}
