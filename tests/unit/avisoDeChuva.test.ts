import { describe, expect, it } from 'vitest';
import { destinatariosDoAviso } from '../../api/_lib/avisoDeChuva.js';

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
