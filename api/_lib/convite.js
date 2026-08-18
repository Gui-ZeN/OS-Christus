/**
 * O COMPROMISSO QUE ENTRA NO CALENDÁRIO.
 *
 * Um clique põe o horário no celular do coordenador, sem integrar com nada.
 *
 * ⚠️ Ataca o furo mais provável do desenho: ler o e-mail das 07h e não voltar às
 * 10h. O aviso existe, a pessoa vê, e a visita passa mesmo assim — porque entre uma
 * coisa e outra houve aula, obra e telefone. O alarme do próprio celular resolve
 * isso melhor que qualquer lembrete que a gente mande.
 *
 * ICS é texto: não precisa de conta Google, nem de permissão, nem de servidor. Vale
 * em iPhone, Android e Outlook.
 *
 * Sem I/O.
 */

/** ICS quebra linha com CRLF e escapa vírgula, ponto-e-vírgula e barra invertida. */
function escapar(texto) {
  return String(texto || '')
    .split('\\')
    .join('\\\\')
    .split(';')
    .join('\\;')
    .split(',')
    .join('\\,')
    .split('\r\n')
    .join('\\n')
    .split('\n')
    .join('\\n');
}

function carimbo(data) {
  return new Date(data).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * @param {object} visita  `{ id, vendorName, sede, startAt, endAt, ticketIds }`
 * @param {string} urlDaConfirmacao  o mesmo link do botão — o convite leva junto,
 *   para quem abrir pelo calendário conseguir responder de lá.
 */
export function conviteDaVisita(visita, urlDaConfirmacao = '') {
  const inicio = visita?.startAt instanceof Date ? visita.startAt : new Date(visita?.startAt || NaN);
  if (Number.isNaN(inicio.getTime())) return null;

  // Sem fim declarado, uma hora: janela curta demais some da tela do calendário,
  // e longa demais bloqueia o dia de quem só vai receber alguém.
  const fim = visita?.endAt ? new Date(visita.endAt) : new Date(inicio.getTime() + 3_600_000);
  const ordens = Array.isArray(visita?.ticketIds) ? visita.ticketIds.join(', ') : '';
  const titulo = `${String(visita?.vendorName || 'Fornecedor')}${visita?.sede ? ` — ${visita.sede}` : ''}`;

  const corpo = [
    ordens ? `OS: ${ordens}` : '',
    urlDaConfirmacao ? `Confirmar: ${urlDaConfirmacao}` : '',
    'Serv3 — manutenção predial',
  ]
    .filter(Boolean)
    .join('\n');

  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Serv3//Manutencao//PT-BR',
    // PUBLISH, não REQUEST: não é convite que pede resposta ao organizador. Pedir
    // RSVP num e-mail automático gera resposta que ninguém lê.
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:visita-${escapar(visita?.id || carimbo(inicio))}@serv3`,
    `DTSTAMP:${carimbo(new Date())}`,
    `DTSTART:${carimbo(inicio)}`,
    `DTEND:${carimbo(fim)}`,
    `SUMMARY:${escapar(titulo)}`,
    `DESCRIPTION:${escapar(corpo)}`,
    visita?.sede ? `LOCATION:${escapar(String(visita.sede))}` : '',
    // Alarme 30 min antes: é a distância entre "eu li às 07h" e "eu lembrei às 10h".
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapar(titulo)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return {
    filename: `visita-${String(visita?.id || 'serv3')}.ics`,
    mimeType: 'text/calendar; charset=utf-8; method=PUBLISH',
    content: linhas.join('\r\n'),
  };
}
