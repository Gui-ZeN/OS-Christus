import { describe, expect, it } from 'vitest';
import { ACAO, MODO, assuntoDaSombra, decidirEnvio, lerConfiguracao, tipoDoEnvio } from '../../api/_lib/modoDeEnvio.js';

const cfg = (env: Record<string, string> = {}) => lerConfiguracao(env);
const envio = (extra: Record<string, string> = {}) => ({ para: 'pablo@px.com.br', ticketId: 'agenda-sede-SUL3', ...extra });

describe('ambiente não configurado NÃO abre a torneira', () => {
  it('sem variável nenhuma, o modo é sombra', () => {
    // Ambiente sem configuração é ambiente que ninguém preparou. Errar para o lado
    // seguro custa um e-mail que não chegou; para o outro lado, custa a operação
    // inteira recebendo mensagem de um sistema que nunca entregou nada.
    expect(cfg().modo).toBe(MODO.SOMBRA);
  });

  it('modo escrito errado cai em sombra e fica marcado', () => {
    const c = cfg({ EMAIL_MODO: 'abertoo' });
    expect(c.modo).toBe(MODO.SOMBRA);
    expect(c.modoInvalido).toBe(true);
  });

  it('sombra SEM caixa configurada suprime — não vira envio real por omissão', () => {
    const d = decidirEnvio(envio(), cfg({ EMAIL_MODO: 'sombra' }));
    expect(d.acao).toBe(ACAO.SUPRIMIR);
    expect(d.motivo).toContain('EMAIL_SOMBRA_PARA');
  });
});

describe('os quatro modos', () => {
  it('desligado: nada sai, e o motivo fica registrado', () => {
    const d = decidirEnvio(envio(), cfg({ EMAIL_MODO: 'desligado' }));
    expect(d.acao).toBe(ACAO.SUPRIMIR);
    expect(d.motivo).toBe('envio desligado');
  });

  it('sombra: desvia para a caixa de teste e diz para quem era', () => {
    const d = decidirEnvio(envio(), cfg({ EMAIL_MODO: 'sombra', EMAIL_SOMBRA_PARA: 'teste@px.com.br' }));
    expect(d.acao).toBe(ACAO.DESVIAR);
    expect(d.destino).toBe('teste@px.com.br');
    expect(d.destinoOriginal).toBe('pablo@px.com.br');
  });

  it('piloto: só quem foi declarado recebe', () => {
    const c = cfg({ EMAIL_MODO: 'piloto', EMAIL_PILOTO_PESSOAS: 'pablo@px.com.br' });
    expect(decidirEnvio(envio(), c).acao).toBe(ACAO.ENVIAR);

    const outra = decidirEnvio(envio({ para: 'ana@px.com.br' }), c);
    expect(outra.acao).toBe(ACAO.SUPRIMIR);
    expect(outra.motivo).toBe('fora do piloto');
  });

  it('piloto também libera por sede — é a unidade do plano', () => {
    const c = cfg({ EMAIL_MODO: 'piloto', EMAIL_PILOTO_SEDES: 'sul3' });
    expect(decidirEnvio(envio({ para: 'ana@px.com.br', sede: 'SUL3' }), c).acao).toBe(ACAO.ENVIAR);
    expect(decidirEnvio(envio({ para: 'ana@px.com.br', sede: 'BN' }), c).acao).toBe(ACAO.SUPRIMIR);
  });

  it('aberto: o normal', () => {
    const d = decidirEnvio(envio(), cfg({ EMAIL_MODO: 'aberto' }));
    expect(d.acao).toBe(ACAO.ENVIAR);
    expect(d.destino).toBe('pablo@px.com.br');
  });
});

describe('o interruptor por tipo vale em qualquer modo', () => {
  it('desliga um disparo sem derrubar os outros', () => {
    // Serve para calar um disparo que está se comportando mal sem fechar o canal.
    const c = cfg({ EMAIL_MODO: 'aberto', EMAIL_TIPOS_DESLIGADOS: 'checagem' });
    expect(decidirEnvio(envio({ ticketId: 'checagem-SUL3' }), c).acao).toBe(ACAO.SUPRIMIR);
    expect(decidirEnvio(envio({ ticketId: 'agenda-sede-SUL3' }), c).acao).toBe(ACAO.ENVIAR);
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
  it('toda decisão traz motivo', () => {
    for (const modo of ['desligado', 'sombra', 'piloto', 'aberto']) {
      const d = decidirEnvio(envio(), cfg({ EMAIL_MODO: modo }));
      expect(d.motivo, modo).toBeTruthy();
      expect(d.tipo, modo).toBe('agenda-sede');
    }
  });

  it('envio sem destinatário é suprimido, não estoura', () => {
    const d = decidirEnvio(envio({ para: '' }), cfg({ EMAIL_MODO: 'aberto' }));
    expect(d.acao).toBe(ACAO.SUPRIMIR);
    expect(d.motivo).toBe('sem destinatário');
  });

  it('o assunto da sombra diz para quem era', () => {
    // Sem isto, uma caixa recebendo o tráfego de 16 sedes vira pilha
    // indistinguível e o teste não prova nada.
    expect(assuntoDaSombra('Hoje na SUL3', 'pablo@px.com.br')).toContain('pablo@px.com.br');
    expect(assuntoDaSombra('x'.repeat(400), 'a@b.com').length).toBeLessThanOrEqual(250);
  });
});
