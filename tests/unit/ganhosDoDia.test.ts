import { describe, expect, it } from 'vitest';
import { conviteDaVisita } from '../../api/_lib/convite.js';
import { demandasAbertasNoLocal, dossieDaVisita, reciboDeConclusao } from '../../api/_lib/ganhosDoDia.js';

describe('dossiê da visita — o sistema escreve, a pessoa não redige', () => {
  const visita = { vendorName: 'Vidraçaria Norte', sede: 'SUL3', startAtLabel: '17/08, 08:00' };
  const ordens = [
    { id: 'OS-1', subject: 'Telas do parquinho', location: 'Bloco C', requester: 'Marcos', fotos: ['http://f/1'] },
    { id: 'OS-2', subject: 'Vidro da recepção', location: 'Térreo' },
  ];

  it('junta as OS da MESMA visita numa ficha só', () => {
    // Uma visita atende várias OS — é o corte do plano, e aqui isso vira vantagem:
    // quem vai à obra leva tudo de uma vez, em vez de abrir OS por OS.
    const d = dossieDaVisita({ commitment: visita, tickets: ordens, vendorContact: '(85) 99999-8888' });
    expect(d).toContain('OS-1');
    expect(d).toContain('OS-2');
    expect(d).toContain('Bloco C');
    expect(d).toContain('(85) 99999-8888');
    expect(d).toContain('http://f/1');
  });

  it('com dado faltando, ainda sai uma ficha que se sustenta', () => {
    const d = dossieDaVisita({ commitment: {}, tickets: [{ id: 'OS-9' }] });
    expect(d).toContain('OS-9');
    expect(d).not.toContain('undefined');
  });
});

describe('aviso de demanda repetida — ataca a inflação do backlog na origem', () => {
  const tickets = [
    { id: 'OS-1', sede: 'BN', location: 'Bloco C', status: 'Em Execução', subject: 'Disjuntor' },
    { id: 'OS-2', sede: 'BN', location: 'Bloco C', status: 'Encerrada', subject: 'Antigo' },
    { id: 'OS-3', sede: 'BN', location: 'Térreo', status: 'Em Execução', subject: 'Outro lugar' },
    { id: 'OS-4', sede: 'ALD', location: 'Bloco C', status: 'Em Execução', subject: 'Outra sede' },
  ];

  it('mostra só o que está aberto no MESMO local', () => {
    const r = demandasAbertasNoLocal({ tickets, sede: 'BN', local: 'Bloco C' });
    expect(r.map(t => t.id)).toEqual(['OS-1']);
  });

  it('sem local, cai no recorte por sede', () => {
    const r = demandasAbertasNoLocal({ tickets, sede: 'BN' });
    expect(r.map(t => t.id).sort()).toEqual(['OS-1', 'OS-3']);
  });

  it('não conta a própria OS quando já existe', () => {
    const r = demandasAbertasNoLocal({ tickets, sede: 'BN', local: 'Bloco C', ignorarId: 'OS-1' });
    expect(r).toEqual([]);
  });

  it('NÃO bloqueia nem junta sozinho — só informa', () => {
    // Duas demandas no mesmo local podem ser coisas diferentes. Sistema que decide
    // isso por conta própria esconde trabalho real; a decisão é humana.
    const r = demandasAbertasNoLocal({ tickets, sede: 'BN', local: 'Bloco C' });
    expect(Array.isArray(r)).toBe(true);
    expect(r[0]).toHaveProperty('assunto');
  });
});

describe('recibo de conclusão — o que mais pode mudar a relação com o sistema', () => {
  it('só afirma "antes e depois" quando existem os dois', () => {
    // Uma foto sozinha não é comparação, e apresentá-la como tal é vender o que
    // não se tem.
    const so = reciboDeConclusao({ ticket: { id: 'OS-1' }, antes: ['a.jpg'], depois: [] });
    expect(so.temComparacao).toBe(false);
    const par = reciboDeConclusao({ ticket: { id: 'OS-1' }, antes: ['a.jpg'], depois: ['b.jpg'] });
    expect(par.temComparacao).toBe(true);
  });

  it('oferece as duas respostas do plano', () => {
    const r = reciboDeConclusao({ ticket: { id: 'OS-1', subject: 'Bomba' } });
    expect(r.escolhas.map(e => e.id)).toEqual(['resolvido', 'continua']);
  });

  it('sem texto de conclusão, não fica vazio', () => {
    expect(reciboDeConclusao({ ticket: { id: 'OS-1' } }).oQueFoiFeito).toBeTruthy();
  });
});

describe('o compromisso que entra no calendário', () => {
  const visita = {
    id: 'c1',
    vendorName: 'Vidraçaria Norte',
    sede: 'SUL3',
    startAt: new Date('2026-08-17T11:00:00Z'),
    ticketIds: ['OS-1'],
  };

  it('gera um ICS válido, com alarme antes da hora', () => {
    // Ataca o furo mais provável do desenho: ler o e-mail das 07h e não voltar às
    // 10h. O alarme do próprio celular resolve isso melhor que outro lembrete.
    const ics = conviteDaVisita(visita, 'https://serv3/x');
    expect(ics!.content).toContain('BEGIN:VCALENDAR');
    expect(ics!.content).toContain('DTSTART:20260817T110000Z');
    expect(ics!.content).toContain('TRIGGER:-PT30M');
    expect(ics!.mimeType).toContain('text/calendar');
  });

  it('leva o link da confirmação junto — quem abrir pelo calendário responde de lá', () => {
    expect(conviteDaVisita(visita, 'https://serv3/x')!.content).toContain('https://serv3/x');
  });

  it('escapa o que quebraria o formato', () => {
    const ics = conviteDaVisita({ ...visita, vendorName: 'Norte; Sul, Ltda' }, '');
    // No formato ICS, ';' e ',' saem escapados — senão o calendário lê o nome do
    // fornecedor como separador de campo e o evento chega quebrado.
    expect(ics!.content).toContain(String.raw`Norte\; Sul\, Ltda`);
  });

  it('sem data, não inventa evento', () => {
    expect(conviteDaVisita({ id: 'c9' })).toBeNull();
  });

  it('sem fim declarado, uma hora', () => {
    expect(conviteDaVisita(visita)!.content).toContain('DTEND:20260817T120000Z');
  });
});
