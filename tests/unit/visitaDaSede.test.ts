import { describe, expect, it } from 'vitest';
import { sedeDaVisita } from '../../api/_lib/visitaDaSede.js';
import { ehRepeticaoImediata } from '../../api/_lib/cobranca.js';

const sites = [
  { id: 'site-pe', code: 'PE', name: 'Parquelândia', regionId: 'r1' },
  { id: 'site-dl', code: 'DL', name: 'Dom Luís', regionId: 'r1' },
];

describe('a sede de uma visita sai das OS, não do cliente', () => {
  it('todas na mesma sede: devolve o id e o rótulo dela', () => {
    const r = sedeDaVisita([{ id: 'OS-1', siteId: 'site-pe' }, { id: 'OS-2', sede: 'PE' }], sites);
    expect(r.ok).toBe(true);
    expect(r.siteId).toBe('site-pe');
    expect(r.sede).toBe('PE');
  });

  it('sedes diferentes são RECUSADAS, e a mensagem diz quais', () => {
    // Uma visita é uma viagem só. Misturando, o compromisso apareceria nos dois
    // filtros de sede do painel levando as mesmas cobranças para ambos — e quem tem
    // acesso só a uma das sedes passaria a alterar o compromisso inteiro.
    const r = sedeDaVisita([{ id: 'OS-1', siteId: 'site-pe' }, { id: 'OS-2', siteId: 'site-dl' }], sites);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('mesma sede');
    expect(r.erro).toContain('PE');
    expect(r.erro).toContain('DL');
  });

  it('OS sem sede reconhecida não se mistura com OS que têm sede', () => {
    // Agrupar as sem-sede todas numa só deixaria passar visita de sede desconhecida
    // sempre que o catálogo não reconhecesse o valor, e o defeito voltaria calado.
    const r = sedeDaVisita([{ id: 'OS-1', siteId: 'site-pe' }, { id: 'OS-2' }], sites);
    expect(r.ok).toBe(false);
  });

  it('sede fora do catálogo ainda serve de rótulo, se todas concordam', () => {
    const r = sedeDaVisita([{ id: 'OS-1', sede: 'BN' }, { id: 'OS-2', sede: 'BN' }], sites);
    expect(r.ok).toBe(true);
    expect(r.siteId).toBeNull();
    expect(r.sede).toBe('BN');
  });

  it('lista vazia (nenhuma OS existe) é recusa, não sede nula', () => {
    expect(sedeDaVisita([], sites).ok).toBe(false);
  });
});

describe('clique duplo não vira dois acionamentos, mas segunda tentativa vira', () => {
  const agora = new Date(2026, 7, 18, 10, 0, 0);
  const antes = (min: number) => new Date(agora.getTime() - min * 60 * 1000);

  it('repetição em segundos é barrada', () => {
    expect(ehRepeticaoImediata({ cobrancas: [{ em: antes(0.2), desfecho: null }] }, agora)).toBe(true);
  });

  it('cobrar de novo dias depois NÃO é repetição — é o retrabalho que se quer medir', () => {
    expect(ehRepeticaoImediata({ cobrancas: [{ em: antes(60 * 48), desfecho: null }] }, agora)).toBe(false);
  });

  it('sem pendente, nunca é repetição', () => {
    expect(
      ehRepeticaoImediata({ cobrancas: [{ em: antes(1), desfecho: 'respondeu' }] }, agora)
    ).toBe(false);
  });

  it('pendente sem hora não é recusado por precaução', () => {
    // Dado antigo não permite saber se é repetição, e recusar apagaria cobrança real.
    expect(ehRepeticaoImediata({ cobrancas: [{ desfecho: null }] }, agora)).toBe(false);
  });
});
