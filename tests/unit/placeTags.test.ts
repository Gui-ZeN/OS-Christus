import { describe, expect, it } from 'vitest';
import { placeHintOf, recurrentPlaces } from '../../src/utils/placeTags';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';
import type { Ticket } from '../../src/types';

/** Assuntos REAIS das 270 OS de produção. */
describe('placeHintOf', () => {
  it.each([
    ['GOTEIRAS TELHADO TEATRO', ['telhado', 'teatro']],
    ['GOTEIRAS PÁTIOS RECEPÇÃO E ACOLHIDA NO INFANTIL', ['patio', 'recepcao']],
    ['Infiltração Biblioteca 5º Andar', ['biblioteca']],
    ['INFILTRAÇÃO PORTARIA 01', ['portaria']],
    ['Vazamento no chão do banheiro da cantina', ['refeitorio', 'banheiro']],
    ['Solicito reparo na calha do refeitório dos alunos', ['refeitorio']],
    ['GOTEIRAS TELHADO QUADRA 21 DE ABRIL', ['telhado', 'quadra']],
  ])('lê %j', (assunto, esperado) => {
    expect(placeHintOf(assunto).tags.sort()).toEqual([...esperado].sort());
  });

  it('pega o andar quando ele é dito', () => {
    expect(placeHintOf('Vazamento no teto do Hall do 4⁰ andar').floor).toBe('4º andar');
    expect(placeHintOf('Infiltração Biblioteca 5º Andar').floor).toBe('5º andar');
    expect(placeHintOf('Conserto goteira').floor).toBeNull();
  });

  it('🎯 o código da sede não vira lugar, mas o assunto inteiro entre colchetes sobrevive', () => {
    // Metade dos assuntos vem com o texto TODO dentro de colchetes. Apagar qualquer
    // colchete apagava o assunto inteiro — foi o bug que segurou a medição em 61%.
    expect(placeHintOf('[PQL 02] GOTEIRAS TELHADO QUADRA').tags).toContain('telhado');
    expect(placeHintOf('[Infiltrações – Clínica Escola de Odontologia (Campus Benfica)]').tags).toContain(
      'clinica'
    );
  });

  it('sem lugar reconhecível responde vazio, não um palpite', () => {
    expect(placeHintOf('Aquisição de manômetro').tags).toEqual([]);
    expect(placeHintOf('Solicitação de orçamento – braços de carteiras').tags).toEqual([]);
    expect(placeHintOf('').tags).toEqual([]);
    expect(placeHintOf(null).tags).toEqual([]);
  });
});

const os = (id: string, sede: string, subject: string): Ticket =>
  ({
    id,
    sede,
    subject,
    trackingToken: 't',
    requester: 'x',
    time: new Date('2026-07-17T12:00:00Z'),
    status: TICKET_STATUS.IN_PROGRESS,
    type: 'Corretiva',
    region: 'Fortaleza',
    sector: 'E-mail',
    priority: 'Trivial',
    history: [],
  }) as Ticket;

describe('recurrentPlaces', () => {
  it('🌧️ conta a repetição que o sistema tinha guardada e não sabia somar', () => {
    // Caso real: PQL1, 17/07/2026 — cinco OS no mesmo dia. Não são cinco problemas,
    // é uma cobertura inteira falhando numa chuva.
    const lista = [
      os('OS-0230', 'PQL1', 'GOTEIRAS COBERTURA PASSAGEM INFANTIL PARA PÁTIO'),
      os('OS-0232', 'PQL1', 'GOTEIRAS TELHADO REFEITÓRIO INTEGRAL E SALA DOS PROFESSORES'),
      os('OS-0241', 'PQL1', 'GOTEIRAS TELHADO TEATRO'),
      os('OS-0239', 'PQL2', 'GOTEIRAS TELHADO QUADRA HUMBERTO MONTE'),
    ];
    const r = recurrentPlaces(lista);
    const telhadoPql1 = r.find(g => g.sede === 'PQL1' && g.tag === 'telhado');
    expect(telhadoPql1?.ticketIds).toEqual(['OS-0230', 'OS-0232', 'OS-0241']);
    // PQL2 tem uma só: não é reincidência.
    expect(r.find(g => g.sede === 'PQL2')).toBeUndefined();
  });

  it('sem sede não agrupa — "telhado" sozinho não é lugar nenhum', () => {
    const r = recurrentPlaces([os('OS-1', '', 'GOTEIRA TELHADO'), os('OS-2', '', 'GOTEIRA TELHADO')]);
    expect(r).toEqual([]);
  });

  it('ordena do que mais repete para o que menos repete', () => {
    const lista = [
      os('OS-1', 'ALD', 'Goteira telhado'),
      os('OS-2', 'ALD', 'Infiltração telhado'),
      os('OS-3', 'ALD', 'Reparo telhado'),
      os('OS-4', 'BN', 'Goteira no elevador'),
      os('OS-5', 'BN', 'Elevador parado'),
    ];
    expect(recurrentPlaces(lista).map(g => `${g.sede}:${g.tag}:${g.ticketIds.length}`)).toEqual([
      'ALD:telhado:3',
      'BN:elevador:2',
    ]);
  });
});
