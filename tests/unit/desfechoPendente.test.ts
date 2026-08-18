import { describe, expect, it } from 'vitest';
import {
  PENDENCIA,
  concluirSeTemDesfecho,
  novaPendenciaDeDesfecho,
  pendentesDeDesfecho,
  prazoParaDesfecho,
  temPendenciaAberta,
} from '../../api/_lib/desfechoPendente.js';

const dona = { email: 'larissa@px.com.br', name: 'Larissa' };
// Segunda, 17/08/2026, 08h em Fortaleza.
const segundaCedo = new Date('2026-08-17T11:00:00Z');

describe('a pendência é do COMPROMISSO, não da OS', () => {
  it('uma visita que atende três OS gera UMA pendência', () => {
    // A versão anterior criava uma ação por OS: três cartões idênticos, desfazendo
    // o corte "uma visita é um item" que segura o volume do sistema inteiro.
    const p = novaPendenciaDeDesfecho({ dono: dona, now: segundaCedo });
    const visita = { id: 'c1', ticketIds: ['OS-1', 'OS-2', 'OS-3'], desfechoPendente: p };
    expect(pendentesDeDesfecho([visita], segundaCedo)).toHaveLength(1);
    expect(pendentesDeDesfecho([visita], segundaCedo)[0].ordens).toHaveLength(3);
  });

  it('tem dono único e declara quando não tem', () => {
    expect(novaPendenciaDeDesfecho({ dono: dona }).donoEmail).toBe('larissa@px.com.br');
    const orfa = novaPendenciaDeDesfecho({ dono: null });
    expect(orfa.semDono).toBe(true);
    expect(orfa.donoEmail).toBeNull();
  });
});

describe('o prazo não nasce vencido nem em dia sem expediente', () => {
  it('visita de manhã fecha às 16h30 do mesmo dia', () => {
    expect(prazoParaDesfecho(segundaCedo).toISOString()).toBe('2026-08-17T19:30:00.000Z');
  });

  it('visita depois das 16h30 vai para o dia seguinte', () => {
    const tarde = new Date('2026-08-17T20:00:00Z'); // 17h em Fortaleza
    expect(prazoParaDesfecho(tarde).toISOString()).toBe('2026-08-18T19:30:00.000Z');
  });

  it('sexta à tarde NÃO cai no sábado', () => {
    // A auditoria pegou: prazo que nasce num dia sem expediente já nasce vencido e
    // polui o grupo "Vencidas" sem culpa de ninguém.
    const sextaTarde = new Date('2026-08-21T20:00:00Z'); // sexta, 17h em Fortaleza
    const prazo = prazoParaDesfecho(sextaTarde);
    expect(prazo.getUTCDay()).toBe(1); // segunda
    expect(prazo.toISOString()).toBe('2026-08-24T19:30:00.000Z');
  });
});

describe('a pendência se conclui sozinha quando o desfecho chega', () => {
  const comPendencia = (extra: Record<string, unknown> = {}) => ({
    id: 'c1',
    desfechoPendente: novaPendenciaDeDesfecho({ dono: dona, now: segundaCedo }),
    ...extra,
  });

  it('sem desfecho, continua aberta', () => {
    expect(temPendenciaAberta(comPendencia())).toBe(true);
    expect(concluirSeTemDesfecho(comPendencia(), segundaCedo)).toBeNull();
  });

  it('com desfecho, fecha — ninguém precisa lembrar de marcá-la feita', () => {
    // É o que separa esta de uma tarefa comum, e o que impede que ela vire a
    // próxima gaveta.
    const fechada = concluirSeTemDesfecho(comPendencia({ outcome: 'concluiu' }), segundaCedo);
    expect(fechada!.status).toBe(PENDENCIA.CONCLUIDA);
    expect(fechada!.concluidaEm).toEqual(segundaCedo);
  });

  it('visita sem pendência nenhuma não inventa uma', () => {
    expect(temPendenciaAberta({ id: 'c9' })).toBe(false);
    expect(concluirSeTemDesfecho({ id: 'c9', outcome: 'concluiu' })).toBeNull();
  });

  it('a lista de pendentes exclui quem já tem desfecho', () => {
    const aberta = comPendencia();
    const fechada = comPendencia({ id: 'c2', outcome: 'concluiu' });
    expect(pendentesDeDesfecho([aberta, fechada], segundaCedo).map(p => p.commitmentId)).toEqual(['c1']);
  });

  it('marca a que passou do prazo', () => {
    const depois = new Date('2026-08-18T12:00:00Z');
    expect(pendentesDeDesfecho([comPendencia()], depois)[0].vencida).toBe(true);
    expect(pendentesDeDesfecho([comPendencia()], segundaCedo)[0].vencida).toBe(false);
  });
});
