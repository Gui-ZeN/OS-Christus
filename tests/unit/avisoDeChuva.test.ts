import { describe, expect, it } from 'vitest';
import { destinatariosDoAviso, goteirasPorDestinatario } from '../../api/_lib/avisoDeChuva.js';

const pessoa = (extra: Record<string, unknown> = {}) => ({
  email: 'ana@christus.com.br',
  status: 'Ativo',
  active: true,
  ...extra,
});

describe('quem recebe o aviso de chuva sai do cadastro', () => {
  it('só quem marcou entra', () => {
    const r = destinatariosDoAviso([
      pessoa({ email: 'ana@x.com.br', avisoDeChuva: true }),
      pessoa({ email: 'bruno@x.com.br', avisoDeChuva: false }),
      pessoa({ email: 'carla@x.com.br' }),
    ]);
    expect(r.destinos).toEqual(['ana@x.com.br']);
    expect(r.origem).toBe('cadastro');
  });

  it('inativo NÃO recebe, marcado ou não', () => {
    // Desligar alguém do sistema tem que desligar os e-mails junto, senão a caixa de
    // quem saiu continua recebendo alerta de madrugada.
    const r = destinatariosDoAviso([
      pessoa({ email: 'ana@x.com.br', avisoDeChuva: true, status: 'Inativo' }),
      pessoa({ email: 'bruno@x.com.br', avisoDeChuva: true, active: false }),
    ]);
    expect(r.destinos).toEqual([]);
    expect(r.origem).toBe('nenhum');
  });

  it('e-mail inválido não vira destinatário', () => {
    const r = destinatariosDoAviso([
      pessoa({ email: 'sem-arroba', avisoDeChuva: true }),
      pessoa({ email: 'ana@x', avisoDeChuva: true }),
      pessoa({ email: '', avisoDeChuva: true }),
    ]);
    expect(r.destinos).toEqual([]);
  });

  it('normaliza caixa e remove repetido', () => {
    const r = destinatariosDoAviso([
      pessoa({ email: 'Ana@X.com.br', avisoDeChuva: true }),
      pessoa({ email: 'ana@x.com.br', avisoDeChuva: true }),
    ]);
    expect(r.destinos).toEqual(['ana@x.com.br']);
  });
});

describe('a variável de ambiente é rede, não soma', () => {
  it('com ninguém marcado, RAIN_ALERT_TO segura o aviso', () => {
    // Sem isto, o aviso pararia de sair no dia do deploy e a falha seria silenciosa:
    // a rota responde 200 e `enviado: false` é o normal em 99% dos ciclos.
    const r = destinatariosDoAviso([pessoa({ avisoDeChuva: false })], 'plantao@x.com.br');
    expect(r.destinos).toEqual(['plantao@x.com.br']);
    expect(r.origem).toBe('ambiente');
  });

  it('com alguém marcado, a variável é IGNORADA — não somada', () => {
    // Somar deixaria um destinatário fantasma que não aparece em tela nenhuma, que é
    // exatamente o motivo de a lista ter saído do ambiente.
    const r = destinatariosDoAviso(
      [pessoa({ email: 'ana@x.com.br', avisoDeChuva: true })],
      'plantao@x.com.br'
    );
    expect(r.destinos).toEqual(['ana@x.com.br']);
    expect(r.origem).toBe('cadastro');
  });

  it('a variável aceita lista separada por vírgula', () => {
    const r = destinatariosDoAviso([], 'a@x.com.br, b@x.com.br ; a@x.com.br');
    expect(r.destinos).toEqual(['a@x.com.br', 'b@x.com.br']);
  });

  it('sem ninguém e sem variável, a origem se declara', () => {
    const r = destinatariosDoAviso([], '');
    expect(r.destinos).toEqual([]);
    expect(r.origem).toBe('nenhum');
  });
});

/**
 * O RECORTE POR TERRITÓRIO.
 *
 * ⚠️ Medido em produção em 10/09/2026: 10 pessoas marcadas, 7 pontos de goteira
 * abertos em 6 sedes, e 7 dos 10 são Gestores que respondem por 3 ou 4 deles. Quem
 * cuida do Eusébio recebia a goteira do SUL1 de madrugada.
 *
 * O `podeVer` é injetado porque em produção ele é o `canUserAccessTicket` inteiro,
 * com o catálogo de regiões e sedes atrás. Aqui a regra que interessa é OUTRA: o que
 * a função faz com quem TEM cadastro, com quem NÃO tem, e com lista vazia.
 */
describe('o aviso é recortado pelo território de quem recebe', () => {
  const goteiras = [
    { id: 'OS-0001', sede: 'EUS', assunto: 'Goteira na sala 12' },
    { id: 'O0002', sede: 'SUL1', assunto: 'Infiltração no ginásio' },
    { id: 'OS-0003', sede: 'ALD', assunto: 'Calha entupida' },
  ];
  type Goteira = (typeof goteiras)[number];
  const cuidaDe = (...sedes: string[]) => ({ sedes });
  const podeVer = (pessoa: { sedes: string[] }, goteira: Goteira) =>
    pessoa.sedes.includes(goteira.sede);

  it('cada um recebe só as sedes que são dele', () => {
    const pessoas = new Map<string, { sedes: string[] }>([
      ['eus@x.com.br', cuidaDe('EUS')],
      ['sul@x.com.br', cuidaDe('SUL1', 'ALD')],
    ]);
    const r = goteirasPorDestinatario(['eus@x.com.br', 'sul@x.com.br'], pessoas, goteiras, podeVer);
    expect(r.get('eus@x.com.br')?.map(g => g.id)).toEqual(['OS-0001']);
    expect(r.get('sul@x.com.br')?.map(g => g.id)).toEqual(['O0002', 'OS-0003']);
  });

  it('quem responde por tudo continua vendo tudo', () => {
    const pessoas = new Map([['admin@x.com.br', cuidaDe('EUS', 'SUL1', 'ALD')]]);
    const r = goteirasPorDestinatario(['admin@x.com.br'], pessoas, goteiras, podeVer);
    expect(r.get('admin@x.com.br')).toHaveLength(3);
  });

  it('sem cadastro, recebe tudo — a REDE do RAIN_ALERT_TO não pode virar lista vazia', () => {
    // São dois casos, os dois deliberados: o endereço de ambiente, que existe para o
    // aviso não parar de sair no dia em que ninguém marcou a caixinha, e o `?para=`
    // de simulação. Recortar por um território que não existe apagaria a rede
    // exatamente quando ela é acionada.
    const r = goteirasPorDestinatario(['rede@x.com.br'], new Map(), goteiras, podeVer);
    expect(r.get('rede@x.com.br')).toHaveLength(3);
  });

  it('território sem goteira devolve lista VAZIA, e não a lista dos outros', () => {
    /*
     * ⚠️ O ERRO CARO SERIA "vazio = manda tudo". É a mesma armadilha do filtro da
     * Gestão, com o sinal trocado: lá lista vazia quer dizer "todas"; aqui querer
     * dizer isso devolveria a goteira de todo mundo justamente para quem não tem
     * nenhuma. O e-mail continua saindo — ausência é dita, não omitida —, só que
     * dizendo "nenhuma OS marcada".
     */
    const pessoas = new Map([['bn@x.com.br', cuidaDe('BN')]]);
    const r = goteirasPorDestinatario(['bn@x.com.br'], pessoas, goteiras, podeVer);
    expect(r.get('bn@x.com.br')).toEqual([]);
  });
});
