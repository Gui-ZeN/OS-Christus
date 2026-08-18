import { describe, expect, it } from 'vitest';
import { ACAO, MODO, assuntoDaSombra, decidirEnvio, lerConfiguracao, tipoDoEnvio } from '../../api/_lib/modoDeEnvio.js';

const cfg = (env: Record<string, string> = {}) => lerConfiguracao(env);
const envio = (extra: Record<string, string> = {}) => ({ para: 'pablo@px.com.br', ticketId: 'agenda-sede-SUL3', ...extra });

describe('o padrão é ABERTO — a torneira de volume é o conteúdo, não esta variável', () => {
  it('sem variável nenhuma, envia normalmente', () => {
    // Quem segura o ruído é o desenho: sede sem nada marcado não recebe, resumo
    // vazio não vira e-mail, visita que atende 3 OS é 1 item. Esta variável existe
    // para outra pergunta — a mensagem CHEGA? —, e por isso não fica no caminho.
    expect(cfg().modo).toBe(MODO.ABERTO);
    expect(decidirEnvio(envio(), cfg()).acao).toBe(ACAO.ENVIAR);
  });

  it('qualquer valor que não seja "sombra" é aberto', () => {
    expect(cfg({ EMAIL_MODO: 'aberto' }).modo).toBe(MODO.ABERTO);
    expect(cfg({ EMAIL_MODO: 'qualquer-coisa' }).modo).toBe(MODO.ABERTO);
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
    const c = cfg({ EMAIL_TIPOS_DESLIGADOS: 'checagem' });
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
    for (const env of [{}, { EMAIL_MODO: 'sombra', EMAIL_SOMBRA_PARA: 't@px.com.br' }]) {
      const d = decidirEnvio(envio(), cfg(env));
      expect(d.motivo).toBeTruthy();
      expect(d.tipo).toBe('agenda-sede');
    }
  });

  it('envio sem destinatário é suprimido, não estoura', () => {
    const d = decidirEnvio(envio({ para: '' }), cfg());
    expect(d.acao).toBe(ACAO.SUPRIMIR);
    expect(d.motivo).toBe('sem destinatário');
  });
});
