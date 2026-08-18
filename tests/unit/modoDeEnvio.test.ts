import { describe, expect, it } from 'vitest';
import { ACAO, MODO, assuntoDaSombra, decidirEnvio, lerConfiguracao, tipoDoEnvio } from '../../api/_lib/modoDeEnvio.js';

const cfg = (env: Record<string, string> = {}) => lerConfiguracao(env);
const envio = (extra: Record<string, string> = {}) => ({ para: 'pablo@px.com.br', ticketId: 'agenda-sede-SUL3', ...extra });

describe('o padrão FALHA FECHADO', () => {
  it('sem variável nenhuma, cai em sombra — e sombra sem caixa não envia', () => {
    // Correção da auditoria (consulta 13). O padrão era `aberto`; para um canal com
    // ZERO entregas na história, variável faltando é ambiente que ninguém preparou.
    expect(cfg().modo).toBe(MODO.SOMBRA);
    expect(decidirEnvio(envio(), cfg()).acao).toBe(ACAO.SUPRIMIR);
  });

  it('digitado errado NÃO abre a torneira', () => {
    // `sombraa` com um "a" a mais mandaria para gente real.
    const c = cfg({ EMAIL_MODO: 'sombraa' });
    expect(c.modo).toBe(MODO.SOMBRA);
    expect(c.modoInvalido).toBe(true);
  });

  it('aberto exige a palavra exata', () => {
    expect(cfg({ EMAIL_MODO: 'aberto' }).modo).toBe(MODO.ABERTO);
    expect(cfg({ EMAIL_MODO: 'aberto' }).modoInvalido).toBe(false);
    expect(decidirEnvio(envio(), cfg({ EMAIL_MODO: 'aberto' })).acao).toBe(ACAO.ENVIAR);
  });
});

describe('sombra: caminho real, destinatário desviado', () => {
  it('desvia para a caixa de ensaio e diz para quem era', () => {
    const d = decidirEnvio(envio(), cfg({ EMAIL_MODO: 'sombra', EMAIL_SOMBRA_PARA: 'teste@px.com.br' }));
    expect(d.acao).toBe(ACAO.DESVIAR);
    expect(d.destino).toBe('teste@px.com.br');
    expect(d.destinoOriginal).toBe('pablo@px.com.br');
  });

  it('sombra SEM caixa suprime — quem pediu ensaio não recebe estreia por variável faltando', () => {
    const d = decidirEnvio(envio(), cfg({ EMAIL_MODO: 'sombra' }));
    expect(d.acao).toBe(ACAO.SUPRIMIR);
    expect(d.motivo).toContain('EMAIL_SOMBRA_PARA');
  });

  it('o assunto diz para quem era', () => {
    // Sem isto, uma caixa recebendo o tráfego de 16 sedes vira pilha
    // indistinguível e o ensaio não prova nada.
    expect(assuntoDaSombra('Hoje na SUL3', 'pablo@px.com.br')).toContain('pablo@px.com.br');
    expect(assuntoDaSombra('x'.repeat(400), 'a@b.com').length).toBeLessThanOrEqual(250);
  });
});

describe('o interruptor por tipo — a peça sem substituto', () => {
  it('cala UM disparo sem fechar os outros', () => {
    // Se a checagem incomodar as sedes numa terça de manhã, desliga só ela pela
    // Vercel. A alternativa seria reverter commit sob pressão.
    const c = cfg({ EMAIL_MODO: 'aberto', EMAIL_TIPOS_DESLIGADOS: 'checagem' });
    expect(decidirEnvio(envio({ ticketId: 'checagem-SUL3' }), c).acao).toBe(ACAO.SUPRIMIR);
    expect(decidirEnvio(envio({ ticketId: 'agenda-sede-SUL3' }), c).acao).toBe(ACAO.ENVIAR);
  });

  it('vale também dentro da sombra', () => {
    const c = cfg({ EMAIL_MODO: 'sombra', EMAIL_SOMBRA_PARA: 't@px.com.br', EMAIL_TIPOS_DESLIGADOS: 'falta' });
    expect(decidirEnvio(envio({ ticketId: 'falta-c1' }), c).acao).toBe(ACAO.SUPRIMIR);
  });

  it('deduz o tipo do ticketId, para alcançar os sete sem tocar em sete arquivos', () => {
    expect(tipoDoEnvio('agenda-sede-SUL3')).toBe('agenda-sede');
    expect(tipoDoEnvio('checagem-BN')).toBe('checagem');
    expect(tipoDoEnvio('falta-c1')).toBe('falta');
    expect(tipoDoEnvio('aviso-chuva')).toBe('aviso-chuva');
    expect(tipoDoEnvio('OS-0184')).toBe('os');
    expect(tipoDoEnvio('qualquer', 'declarado')).toBe('declarado');
  });
});

describe('nada some sem explicação', () => {
  it('toda decisão traz motivo e tipo', () => {
    for (const env of [{ EMAIL_MODO: 'aberto' }, { EMAIL_MODO: 'sombra', EMAIL_SOMBRA_PARA: 't@px.com.br' }]) {
      const d = decidirEnvio(envio(), cfg(env));
      expect(d.motivo).toBeTruthy();
      expect(d.tipo).toBe('agenda-sede');
    }
  });

  it('envio sem destinatário é suprimido, não estoura', () => {
    const d = decidirEnvio(envio({ para: '' }), cfg({ EMAIL_MODO: 'aberto' }));
    expect(d.acao).toBe(ACAO.SUPRIMIR);
    expect(d.motivo).toBe('sem destinatário');
  });
});
